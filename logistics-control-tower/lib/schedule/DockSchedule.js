import { Scheduler } from '@bryntum/scheduler-enterprise';
import DockBooking from './DockBooking.js';
import Playhead from './Playhead.js';
import DockModel from '../model/DockModel.js';
import SlotModel from '../model/SlotModel.js';
import { createDowntimeTip, downtimeAt, renderDowntime } from './Downtime.js';
import { renderDock, renderSlot, renderUtilization, slotTip } from './SlotRendering.js';
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
 * - A playhead the view follows (Playhead)
 * - Slots move between doors with the right equipment only, not into the past and not into a door's downtime
 *   (`eventDrag.validatorFn`, Downtime)
 * - Slots ending after the shipment's due time are conflicts, outlined dashed
 * - A utilization strip below the doors, the Summary feature: per hour the share of the doors' time booked
 * - Zooming around the playhead, through custom presets with one header row each
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/Scheduler
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/EventDrag#config-validatorFn
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/ResourceTimeRanges
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/EventMenu
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/Summary
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/mixin/TimelineViewPresets#config-presets
 */
export default class DockSchedule extends Playhead(DockBooking(Scheduler)) {
    static $name = 'DockSchedule';

    static type = 'dockschedule';

    static configurable = {
        // Formerly Scheduler Pro, schedules with the engine
        tier : 'enterprise',

        /**
         * Store of ShipmentModel records, for the tooltips and the menu
         * @config {Core.data.Store}
         */
        shipmentStore : null,

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
        // Slots move with the data as is, animating every tick would add drift to the gliding timeline. A transition
        // also reads the running animations before and after each change, a style recalculation per changed slot
        transition                : { changeEvent : false, removeEvent : false },
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
                    type      : 'buttongroup',
                    cls       : 'lct-zoom',
                    rendition : 'padded',
                    items     : {
                        zoomOut : { icon : icon('minus'), tooltip : 'Zoom out', onAction : 'up.onZoomOut' },
                        zoomDay : { text : 'Day', tooltip : 'Hours of the day, back to now', onAction : 'up.onZoomDay' },
                        zoomIn  : { icon : icon('plus'), tooltip : 'Zoom in', onAction : 'up.onZoomIn' }
                    }
                }
            }
        },

        project : {
            eventModelClass    : SlotModel,
            resourceModelClass : DockModel
        },

        resourceTimeRangeRenderer : renderDowntime,

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
            dependencies       : false,
            dependencyEdit     : false,
            eventEdit          : false,
            scheduleMenu       : false,
            eventDragCreate    : false,
            cellMenu           : false,
            cellEdit           : false,
            // The utilization strip, a bar per tick of the time axis
            summary            : { renderer : renderUtilization },
            // Door downtime, hoverable for its tooltip
            resourceTimeRanges : { enableMouseEvents : true },
            timeRanges         : {
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
                taskEdit    : false,
                // Slots move between doors with the right equipment only, not into the past or into downtime
                eventDrag   : { validatorFn : context => me.validateSlotDrop(context) },
                // Workaround for bryntum/support#14018 (as in ev-operations): the docs name the record `record`, the
                // feature passes `eventRecord`
                eventResize : {
                    validatorFn : ({ eventRecord, record = eventRecord, startDate, endDate }) =>
                        me.validateSlotDrop({
                            eventRecords : [record],
                            newResource  : record.resource,
                            startDate,
                            endDate
                        })
                },
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
        // slots at once
        me.eventStore.on({ change : 'refreshUtilization', buffer : 250, thisObj : me });

        me.downtimeTip = createDowntimeTip(me);

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

    doDestroy() {
        this.downtimeTip?.destroy();
        super.doDestroy();
    }

    refreshUtilization() {
        this.features.summary.refresh();
    }

    //region Toolbar

    // 12 doors · 5 cold
    updateDoorCount() {
        const
            doors = this.resourceStore.records,
            cold  = doors.filter(door => door.capability === 'reefer').length;

        this.widgetMap.doors.html = `${doors.length} doors · ${cold} cold`;
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

    validateSlotDrop({ eventRecords, newResource, startDate, endDate }) {
        const
            slot     = eventRecords[0],
            downtime = downtimeAt(newResource, startDate, endDate);

        if (!newResource.accepts(slot.loadType)) {
            return { valid : false, message : `${newResource.name} cannot take ${slot.loadType} loads` };
        }

        if (startDate < this.now) {
            return { valid : false, message : 'Cannot book a slot in the past' };
        }

        if (downtime) {
            return { valid : false, message : `${newResource.name} is unavailable, ${downtime.name.toLowerCase()}` };
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
