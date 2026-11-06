import { Scheduler } from '@bryntum/scheduler-enterprise';
import DockBooking from './DockBooking.js';
import DockModel from '../model/DockModel.js';
import SlotModel from '../model/SlotModel.js';
import { renderDock, renderSlot, slotTip } from './SlotRendering.js';
import { formatTime } from '../util/Time.js';

const
    // Bar colour per shipment status, Bryntum palette names
    statusColors = {
        'on-time' : 'green',
        'at-risk' : 'orange',
        late      : 'red',
        yard      : 'cyan',
        unloading : 'blue',
        done      : 'gray'
    },
    // The playhead is kept this far into the visible timeline
    nowAnchor    = 0.25;

/**
 * The dock door timeline, a Scheduler on the Enterprise tier (formerly Scheduler Pro), which schedules with the engine:
 * the slots booked at a door are chained with dependencies, so when a truck runs late its slot moves to the new ETA
 * and the engine pushes the later slots at the same door.
 *
 * - A playhead (two time ranges, the shaded past and the now line) the view follows by delta scrolling: the timeline
 *   scrolls by the distance the clock moved, so wherever the user scrolled it to, it stays there relative to now
 * - Slots move between doors with the right equipment only, and not into the past (`eventDrag.validatorFn`)
 * - Slots ending after the shipment's due time are conflicts, outlined in red
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/Scheduler
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/TimeRanges
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/EventDrag#config-validatorFn
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/EventMenu
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

        // The shipment grid's row height, the two sides share one rhythm
        rowHeight  : 44,
        barMargin  : 5,
        tickSize   : 170,
        // Hours labelled at their start, so a time under the pointer reads off the axis
        viewPreset : {
            base    : 'hourAndDay',
            headers : [
                { unit : 'hour', dateFormat : 'HH:mm', align : 'start' }
            ]
        },
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

        // Lined up with the shipment grid's bar, the time axis header with the grid's column headers
        tbar : {
            cls   : 'lct-panel-bar',
            items : {
                title  : { type : 'widget', cls : 'lct-panel-title', html : 'Dock doors' },
                spacer : '->',
                now    : {
                    type    : 'button',
                    cls     : 'lct-now-button',
                    icon    : 'fa fa-location-crosshairs',
                    text    : 'Now',
                    tooltip : 'Scroll back to the current time',
                    onClick : 'up.scrollToNow'
                }
            }
        },

        project : {
            eventModelClass    : SlotModel,
            resourceModelClass : DockModel
        },

        columns : [{
            text     : 'Door',
            field    : 'name',
            width    : 140,
            cellCls  : 'lct-dock-cell',
            renderer : renderDock
        }],

        features : {
            // The engine uses the dependencies, drawing hundreds of chain lines would only add noise
            dependencies    : false,
            dependencyEdit  : false,
            eventEdit       : false,
            taskEdit        : false,
            scheduleMenu    : false,
            eventDragCreate : false,
            cellMenu        : false,
            cellEdit        : false,
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
                    expedite      : { text : 'Expedite', icon : 'fa fa-bolt', weight : 100 },
                    unbook        : { text : 'Unbook', icon : 'fa fa-calendar-xmark', weight : 110 }
                },
                processItems({ eventRecord, items }) {
                    items.expedite.disabled = items.unbook.disabled = eventRecord.isStarted;
                }
            },
            eventTooltip : {
                // The timeline scrolls with the playhead under a still pointer, the tooltip follows its slot
                scrollAction : 'realign',
                // The shipment behind the slot
                template     : ({ eventRecord }) => {
                    const shipment = eventRecord.eventStore?.shipmentStore?.getById(eventRecord.id);

                    return shipment ? slotTip(shipment, eventRecord) : '';
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
                // The Enterprise tier brings its task editor back, slots are edited by dragging and from the menus
                taskEdit  : false,
                // Slots move between doors with the right equipment only, and not into the past
                eventDrag : { validatorFn : context => me.validateSlotDrop(context) }
            }
        });

        // The tooltip reaches the shipments through the event store
        me.eventStore.shipmentStore = me.shipmentStore;

        me.scrollRemainder = 0;

        me.on({
            eventDragStart : 'onSlotDragStart',
            afterEventDrop : 'onSlotDragEnd',
            eventResizeEnd : 'onSlotResizeEnd',
            eventMenuItem  : 'onSlotMenuItem',
            // Scrolled to now as it is shown
            paint          : 'scrollToNow',
            thisObj        : me
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

        if (!me.glideFrame) {
            me.glideFrame = requestAnimationFrame(() => me.glideStep());
        }
    }

    // One frame of the glide, at a steady pace from the shown time to the simulated one
    glideStep() {
        const
            me                    = this,
            { from, to, start }   = me.glide,
            progress              = Math.min(1, (performance.now() - start) / me.glideDuration);

        me.glideFrame = null;

        if (me.isDestroyed) {
            return;
        }

        me.showNow(new Date(from + (to - from) * progress));

        if (progress < 1) {
            me.glideFrame = requestAnimationFrame(() => me.glideStep());
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
     * The shaded past and the now line, two time ranges. Display state, so the changes are not tracked
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

    // Releases the dragged slots from their chains while dragging, so the engine does not snap them back behind their
    // previous predecessor when dropped earlier. The chains are rebuilt on drop
    onSlotDragStart({ eventRecords }) {
        this.dragSourceDoors = eventRecords.map(slot => slot.resource);
        this.dependencyStore.remove(eventRecords.flatMap(slot => slot.dependencies));
    }

    onSlotDragEnd({ eventRecords }) {
        const doors = new Set([...this.dragSourceDoors ?? [], ...eventRecords.map(slot => slot.resource)]);

        doors.forEach(door => this.chainDoor(door));
        this.dragSourceDoors = null;
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

    doDestroy() {
        cancelAnimationFrame(this.glideFrame);
        super.doDestroy();
    }

    eventRenderer(args) {
        args.renderData.eventColor = statusColors[args.eventRecord.status] ?? 'gray';

        return renderSlot(args);
    }
}

DockSchedule.initClass();
