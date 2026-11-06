import { Scheduler } from '@bryntum/scheduler-enterprise';
import DockBooking from './DockBooking.js';
import DockModel from '../model/DockModel.js';
import SlotModel from '../model/SlotModel.js';
import { renderDock, renderSlot, renderUtilization, slotTip } from './SlotRendering.js';
import { formatTime } from '../util/Time.js';
import { icon } from '../util/Icons.js';

const
    // Bar colour per shipment status, Bryntum palette names
    statusColors = {
        'on-time' : 'green',
        'at-risk' : 'orange',
        late      : 'red',
        yard      : 'cyan',
        unloading : 'purple',
        done      : 'gray'
    },
    // The playhead is kept this far into the visible timeline
    nowAnchor    = 0.25,
    // The zoom levels, one header row each, as tall as the grid's column headers. Times are labelled at the start of
    // their tick, so the time under the pointer reads off the axis. `lct-hour` is the default the Day button returns
    // to, at which a 40 minute slot is wide enough for its number (see the container queries in schedule.css)
    timeHeader   = (unit, increment, dateFormat) => [{ unit, increment, dateFormat, align : 'start' }],
    presets      = [
        { id : 'lct-6h', base : 'hourAndDay', tickWidth : 90, headers : timeHeader('hour', 6, 'ddd HH:mm') },
        { id : 'lct-2h', base : 'hourAndDay', tickWidth : 90, headers : timeHeader('hour', 2, 'HH:mm') },
        { id : 'lct-hour', base : 'hourAndDay', tickWidth : 80, headers : timeHeader('hour', 1, 'HH:mm') },
        { id : 'lct-30m', base : 'minuteAndHour', tickWidth : 70, headers : timeHeader('minute', 30, 'HH:mm') },
        { id : 'lct-15m', base : 'minuteAndHour', tickWidth : 70, headers : timeHeader('minute', 15, 'HH:mm') }
    ];

/**
 * The dock door timeline, a Scheduler on the Enterprise tier (formerly Scheduler Pro), which schedules with the engine:
 * the slots booked at a door are chained with dependencies, so when a truck runs late its slot moves to the new ETA
 * and the engine pushes the later slots at the same door.
 *
 * - A playhead (two time ranges, the shaded past and the now line) the view follows by delta scrolling: the timeline
 *   scrolls by the distance the clock moved, so wherever the user scrolled it to, it stays there relative to now
 * - Slots move between doors with the right equipment only, and not into the past (`eventDrag.validatorFn`)
 * - Slots ending after the shipment's due time are conflicts, outlined dashed. Resolve conflicts moves them to doors
 *   where they end in time (DockBooking#resolveConflicts)
 * - A utilization strip below the doors, the Summary feature: per hour the share of the doors' time booked
 * - Zooming around the playhead, through custom presets with one header row each
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/Scheduler
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/TimeRanges
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/EventDrag#config-validatorFn
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/EventMenu
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/Summary
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/mixin/TimelineViewPresets#config-presets
 */
export default class DockSchedule extends DockBooking(Scheduler) {
    static $name = 'DockSchedule';

    static type = 'dockschedule';

    static configurable = {
        // Formerly Scheduler Pro, schedules with the engine
        tier : 'enterprise',

        /**
         * The simulated current time, drawn as the playhead
         * @prp {Date}
         */
        now : null,

        /**
         * The playhead glides from one simulated time to the next over this many milliseconds, the simulation's tick
         * interval, so it moves at a steady pace instead of hopping a tick at a time
         * @config {Number}
         */
        glideDuration : 300,

        /**
         * Store of ShipmentModel records, for the tooltips and the menu
         * @config {Core.data.Store}
         */
        shipmentStore : null,

        /**
         * The slots in conflict, shown on the Resolve conflicts button. Set from the KPIs
         * @prp {Number}
         */
        conflictCount : 0,

        // The shipment grid's row height, the two sides share one rhythm
        rowHeight                 : 44,
        // Room for the two line label inside an even 5px padding
        barMargin                 : 4,
        presets,
        viewPreset                : 'lct-hour',
        // Zooming changes the scale, not the days the timeline spans
        zoomKeepsOriginalTimespan : true,
        // Slots on a door are kept apart by the engine (the dependency chain), not by overlap prevention
        allowOverlap              : true,
        multiEventSelect          : false,
        zoomOnMouseWheel          : false,
        zoomOnTimeAxisDoubleClick : false,
        // Slots are booked from the shipments, not drawn on the timeline
        autoCreate                : false,
        useInitialAnimation       : false,
        // Slots move with the data as is, animating every tick would add drift to the gliding timeline
        enableEventAnimations     : false,
        // The timeline follows the playhead and scrolls with the wheel, the utilization strip has no scrollbar under it
        hideHorizontalScrollbar   : true,

        // Lined up with the shipment grid's bar, the time axis header with the grid's column headers
        tbar : {
            cls   : 'lct-panel-bar',
            items : {
                title  : { type : 'widget', cls : 'lct-panel-title', html : 'Dock doors' },
                doors  : { type : 'widget', cls : 'lct-panel-count' },
                spacer : '->',
                zoom   : {
                    type  : 'buttongroup',
                    cls   : 'lct-zoom',
                    items : {
                        zoomOut : { icon : icon('minus'), tooltip : 'Zoom out', onAction : 'up.onZoomOut' },
                        zoomDay : { text : 'Day', tooltip : 'Hours of the day, back to now', onAction : 'up.onZoomDay' },
                        zoomIn  : { icon : icon('plus'), tooltip : 'Zoom in', onAction : 'up.onZoomIn' }
                    }
                },
                resolve : {
                    type      : 'button',
                    cls       : 'lct-resolve',
                    rendition : 'outlined',
                    text      : 'Resolve conflicts',
                    tooltip   : 'Moves each slot in conflict to a door where it ends in time',
                    disabled  : true,
                    onAction  : 'up.onResolveClick'
                }
            }
        },

        project : {
            eventModelClass    : SlotModel,
            resourceModelClass : DockModel
        },

        columns : [{
            text            : 'Door',
            field           : 'name',
            width           : 140,
            cellCls         : 'lct-dock-cell',
            renderer        : renderDock,
            // The label of the utilization strip, the Summary feature's footer
            sum             : 'count',
            summaryRenderer : () => 'Utilization'
        }],

        features : {
            // The engine uses the dependencies, drawing hundreds of chain lines would only add noise
            dependencies    : false,
            dependencyEdit  : false,
            eventEdit       : false,
            scheduleMenu    : false,
            eventDragCreate : false,
            cellMenu        : false,
            cellEdit        : false,
            // The utilization strip, a bar per tick of the time axis
            summary         : { renderer : renderUtilization },
            timeRanges      : {
                enableResizing      : false,
                showHeaderElements  : true,
                showCurrentTimeLine : false
            },
            eventMenu : {
                items : {
                    deleteEvent   : false,
                    editEvent     : false,
                    copyEvent     : false,
                    cutEvent      : false,
                    unassignEvent : false,
                    splitEvent    : false,
                    expedite      : { text : 'Expedite', icon : icon('lightning'), weight : 100 },
                    unbook        : { text : 'Unbook', icon : icon('calendar-x'), weight : 110 }
                },
                processItems({ eventRecord, items }) {
                    items.expedite.disabled = items.unbook.disabled = eventRecord.isStarted;
                }
            }
        }
    };

    construct(config) {
        const me = this;

        super.construct({
            ...config,
            features : {
                ...config.features,
                // Slots are edited by dragging and from the menus. Turned off here, not in the static features: the
                // Enterprise tier's tierConfigs override a subclass's static `taskEdit : false` (Core/Tierable)
                taskEdit     : false,
                // Slots move between doors with the right equipment only, and not into the past
                eventDrag    : { validatorFn : context => me.validateSlotDrop(context) },
                eventTooltip : {
                    // The timeline scrolls with the playhead under a still pointer, the tooltip follows its slot
                    scrollAction : 'realign',
                    // The shipment behind the slot
                    template     : ({ eventRecord }) => {
                        const shipment = me.shipmentStore?.getById(eventRecord.id);

                        return shipment ? slotTip(shipment, eventRecord) : '';
                    }
                }
            }
        });

        me.resourceStore.on({ change : 'updateDoorCount', thisObj : me });
        me.updateDoorCount();

        // The utilization strip follows the slots: booked, moved by the engine, unbooked. Batched, a tick changes many
        // slots at once. The playhead's glide only touches the time ranges, it does not redraw the strip
        me.eventStore.on({ change : 'refreshUtilization', buffer : 250, thisObj : me });

        me.scrollRemainder = 0;

        me.on({
            eventDragStart          : 'onSlotDragStart',
            beforeEventDropFinalize : 'onSlotDrop',
            afterEventDrop          : 'onSlotDragEnd',
            eventResizeEnd          : 'onSlotResizeEnd',
            eventMenuItem           : 'onSlotMenuItem',
            // Scrolled to now as it is shown
            paint                   : 'scrollToNow',
            thisObj                 : me
        });
    }

    /**
     * `true` while a slot is dragged or resized, the simulation holds its clock
     * @property {Boolean}
     */
    get isDraggingSlot() {
        const { eventDrag, eventResize } = this.features;

        return Boolean(eventDrag?.isDragging || eventResize?.isResizing);
    }

    //region Playhead

    changeNow(now) {
        return new Date(now);
    }

    // The simulation sets the time once a tick, the playhead glides there frame by frame
    updateNow(now, oldNow) {
        const me = this;

        if (!oldNow || !me.isPainted || !me.shownNow) {
            me.showNow(now);

            return;
        }

        me.glide = { from : me.shownNow.getTime(), to : now.getTime(), start : performance.now() };

        // The widget's own animation frames (Delayable), cancelled when it is destroyed
        if (!me.glideFrame) {
            me.glideFrame = me.requestAnimationFrame(me.glideStep);
        }
    }

    // One frame of the glide, at a steady pace from the shown time to the simulated one
    glideStep() {
        const
            me                  = this,
            { from, to, start } = me.glide,
            progress            = Math.min(1, (performance.now() - start) / me.glideDuration);

        me.glideFrame = null;

        me.showNow(new Date(from + (to - from) * progress));

        if (progress < 1) {
            me.glideFrame = me.requestAnimationFrame(me.glideStep);
        }
    }

    /**
     * Draws the playhead at a time and delta scrolls the timeline by the distance it moved, without animation, so the
     * playhead stays put on screen
     * @param {Date} time
     */
    showNow(time) {
        const
            me       = this,
            previous = me.shownNow;

        me.shownNow = time;
        me.syncPlayhead(time);

        if (previous && me.isPainted) {
            me.scrollRemainder += me.timeAxisViewModel.getDistanceForDuration(time - previous);

            const whole = Math.trunc(me.scrollRemainder);

            if (whole) {
                me.timeAxisSubGrid.scrollable.x += whole;
                me.scrollRemainder -= whole;
            }
        }
    }

    /**
     * The shaded past and the now line, two time ranges, rendered once per frame (a store batch). Display state:
     * `clearChanges()` keeps the records out of the store's added and modified records, suspending the change tracking
     * keeps the CrudManager's `hasChanges` from flagging them
     * @param {Date} now The time shown
     */
    syncPlayhead(now) {
        const
            me                 = this,
            { project }        = me,
            { timeRangeStore } = project;

        if (!timeRangeStore) {
            return;
        }

        project.suspendChangeTracking();
        timeRangeStore.beginBatch();

        if (!me.nowRange || !timeRangeStore.includes(me.nowRange)) {
            [me.pastRange, me.nowRange] = timeRangeStore.add([
                { id : 'past', startDate : me.startDate, endDate : now, cls : 'lct-past', readOnly : true },
                { id : 'now', startDate : now, name : formatTime(now), cls : 'lct-now', readOnly : true }
            ]);
        }
        else {
            me.pastRange.endDate = now;
            me.nowRange.set({ startDate : now, name : formatTime(now) });
        }

        me.pastRange.clearChanges();
        me.nowRange.clearChanges();
        timeRangeStore.endBatch();
        project.resumeChangeTracking(true);
    }

    // The playhead a quarter into the visible timeline
    scrollToNow() {
        const me = this;

        if (me.now) {
            me.visibleDate = {
                date       : me.now,
                block      : 'start',
                edgeOffset : Math.round(me.timeAxisSubGrid.width * nowAnchor)
            };
        }
    }

    //endregion

    refreshUtilization() {
        this.features.summary?.refresh();
    }

    //region Toolbar

    // 12 doors · 5 cold
    updateDoorCount() {
        const
            doors = this.resourceStore.records,
            cold  = doors.filter(door => door.capability === 'reefer').length;

        this.widgetMap.doors.html = `${doors.length} doors · ${cold} cold`;
    }

    updateConflictCount(count) {
        // The button is configured disabled, without a count
        if (!this.isConfiguring) {
            const { resolve } = this.widgetMap;

            // The count is the button's badge, drawn after the text, see schedule.css
            resolve.badge    = count || null;
            resolve.disabled = !count;
        }
    }

    /**
     * Moves the slots in conflict to doors where they end in time, a few passes, as each settles the chains the next
     * one sees. Fires `conflictsResolve`
     * @returns {Promise<SlotModel[]>} The moved slots
     */
    async resolveAllConflicts() {
        const
            me    = this,
            moved = new Set();

        for (let pass = 0; pass < 3; pass++) {
            const slots = me.resolveConflicts();

            if (!slots.length) {
                break;
            }

            slots.forEach(slot => moved.add(slot));
            await me.project.commitAsync();

            if (me.isDestroyed) {
                return [];
            }
        }

        /**
         * Fired after Resolve conflicts moved the slots
         * @event conflictsResolve
         * @param {SlotModel[]} slots The moved slots
         */
        me.trigger('conflictsResolve', { slots : [...moved] });

        return [...moved];
    }

    onResolveClick() {
        this.resolveAllConflicts();
    }

    // Zooms keep the playhead where the view keeps it, a quarter in
    async zoomAroundNow(zoom) {
        await zoom();

        if (!this.isDestroyed) {
            this.scrollToNow();
        }
    }

    onZoomIn() {
        this.zoomAroundNow(() => this.zoomIn(1, { centerDate : this.now }));
    }

    onZoomOut() {
        this.zoomAroundNow(() => this.zoomOut(1, { centerDate : this.now }));
    }

    onZoomDay() {
        this.zoomAroundNow(() => this.zoomToLevel('lct-hour', { centerDate : this.now }));
    }

    //endregion

    //region Slot drag, resize and menu

    validateSlotDrop({ eventRecords, newResource, startDate }) {
        const slot = eventRecords[0];

        if (!newResource.accepts(slot.loadType)) {
            return { valid : false, message : `${newResource.name} cannot take ${slot.loadType} loads` };
        }

        if (startDate < this.now) {
            return { valid : false, message : 'Cannot book a slot in the past' };
        }

        return true;
    }

    // The doors the slots are dragged from, their chains are rebuilt on drop. Set anew per drag, an aborted drag
    // (Escape, window blur) ends without a drop and leaves nothing behind for the next one
    onSlotDragStart({ eventRecords }) {
        this.dragSourceDoors = eventRecords.map(slot => slot.resource);
    }

    // Dropped, before the engine schedules the drop: the dropped slots are released from their chains, so the engine
    // does not snap them back behind their previous predecessor when dropped earlier. An aborted drag never gets
    // here, its slots keep their chains
    onSlotDrop({ context }) {
        this.dependencyStore.remove(context.eventRecords.flatMap(slot => slot.dependencies));
    }

    // The chains of the doors left and of the doors dropped on, also after an invalid drop
    onSlotDragEnd({ eventRecords }) {
        const doors = new Set([...this.dragSourceDoors ?? [], ...eventRecords.map(slot => slot.resource)]);

        this.dragSourceDoors = null;
        doors.forEach(door => this.chainDoor(door));
    }

    onSlotResizeEnd({ eventRecord }) {
        this.chainDoor(eventRecord.resource);
    }

    onSlotMenuItem({ item, eventRecord }) {
        if (item.ref === 'expedite') {
            this.expedite(eventRecord.id);
        }
        else if (item.ref === 'unbook') {
            this.unbook(eventRecord.id);
        }
    }

    //endregion

    /**
     * Selects a slot, which selects its row in the grid, and scrolls it to the middle of the view, highlighted
     * @param {SlotModel} slot
     */
    revealSlot(slot) {
        const me = this;

        if (slot && !me.isDestroyed && me.eventStore.includes(slot)) {
            me.selectEvent(slot);
            me.scrollEventIntoView(slot, { animate : true, highlight : true, block : 'center' });
        }
    }

    eventRenderer(args) {
        args.renderData.eventColor = statusColors[args.eventRecord.status] ?? 'gray';

        return renderSlot(args);
    }
}

DockSchedule.initClass();
