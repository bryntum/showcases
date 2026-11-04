import { DateHelper, StringHelper, Toast } from '@bryntum/core-enterprise';
// The Group feature of the Service & charging view is a Grid feature, importing the package registers it
import '@bryntum/grid-enterprise';
import { Scheduler } from '@bryntum/scheduler-enterprise';
import SimulatedView from './SimulatedView.js';
import TimeSpanEditing from './TimeSpanEditing.js';
import OpsResource from './model/OpsResource.js';
import OpsEvent from './model/OpsEvent.js';
import GapDependency from './model/GapDependency.js';
import { barGap } from './bar/BarParts.js';
import { deriveStatus, elapsedFraction, isLiveStatus } from './util/Time.js';
import { formatTime } from './util/Format.js';
import { mergeFeature } from './util/Features.js';
import { createBlockedTimeTip, intersectsBlock, renderBlockedTime } from './scheduler/BlockedTime.js';
import { renderGap, syncGapDependencies } from './scheduler/GapIndicators.js';
import { chargeState } from './scheduler/ChargingSession.js';
import { eventBars } from './scheduler/EventBars.js';
import { getInvalidRangeReason, showTypeFields, taskEditConfig } from './scheduler/EventEditing.js';
import { getEventDetail } from './scheduler/EventDetail.js';

/**
 * Scheduler (Enterprise tier, formerly Scheduler Pro) used by the "Production line" and "Service & charging" views.
 *
 * - Fully custom event bars (`eventStyle : null` + `eventRenderer` returning DomConfig)
 * - Gap indicators between all consecutive events drawn by the Dependencies feature, using inactive dependencies and a
 *   dependency `renderer`
 * - Blocked time using ResourceTimeRanges, which events cannot be dropped into. An icon per type and a tooltip with
 *   the label and times explain it, also when the range is too narrow for its label
 * - Time only drag (`constrainDragToResource`), snapping to 5 minutes
 * - Double-click (or Enter) edits an event in the TaskEdit drawer, with fields per event type. Saves follow the same
 *   rules as dragging: same resource, no overlap, not into blocked time
 * - Selecting a service job highlights the charging session for the same repair order
 * - Live locked columns (OEE, state, vehicle...), refreshed cell by cell on every simulation tick, while only the
 *   bars repaint (`refreshEvents`), rows are not re-rendered
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/Scheduler
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/TimelineBase#function-refreshEvents
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/Dependencies#config-renderer
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/ResourceTimeRanges
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Tooltip#config-forSelector
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/TaskEdit
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Panel#config-drawer
 */
export default class OperationsScheduler extends TimeSpanEditing(SimulatedView(Scheduler)) {
    static $name = 'OperationsScheduler';

    static type = 'operationsscheduler';

    static configurable = {
        // Formerly Scheduler Pro, uses the scheduling engine
        tier : 'enterprise',

        rowHeight                 : 92,
        barMargin                 : 12,
        // The 1px row line is part of the row height. Taking it from the bottom margin keeps bars at 68px, 12px
        // below the top of the row and 12px above the next one
        resourceMargin            : { start : 12, end : 11 },
        // Fully custom bar markup
        eventStyle                : null,
        eventColor                : null,
        // Validates drops, no overlapping events on the same resource
        allowOverlap              : false,
        useInitialAnimation       : false,
        zoomOnMouseWheel          : false,
        zoomOnTimeAxisDoubleClick : false,
        // Double-click edits, events are not created in this demo
        autoCreate                : false,
        snap                      : true,

        viewPreset : {
            tickWidth         : 114,
            displayDateFormat : 'HH:mm',
            shiftUnit         : 'hour',
            shiftIncrement    : 1,
            timeResolution    : {
                unit      : 'minute',
                increment : 5
            },
            headers : [{
                unit       : 'minute',
                increment  : 30,
                dateFormat : 'HH:mm',
                // Labels at the tick start, like the bars
                align      : 'start'
            }]
        },

        features : {
            // Edits in the TaskEdit drawer, see EventEditing
            eventEdit          : false,
            taskEdit           : taskEditConfig,
            eventDragCreate    : false,
            eventMenu          : false,
            scheduleMenu       : false,
            eventTooltip       : false,
            scheduleTooltip    : false,
            cellEdit           : false,
            cellMenu           : false,
            headerMenu         : false,
            timeAxisHeaderMenu : false,
            sort               : false,
            stickyEvents       : true,
            eventDrag          : {
                // Time only
                constrainDragToResource : true,
                // Single event selection, so one dragged event and the dates are its own
                validatorFn({ startDate, endDate, newResource }) {
                    return !intersectsBlock(newResource, startDate, endDate);
                }
            },
            eventResize : {
                // Workaround for bryntum/support#14018, the docs name the record `record`, the feature passes
                // `eventRecord`
                validatorFn({ eventRecord, record = eventRecord, startDate, endDate }) {
                    return !intersectsBlock(record.resource, startDate, endDate);
                }
            },
            // Mouse events make the ranges hoverable, for their tooltip
            resourceTimeRanges : { enableMouseEvents : true },
            columnLines        : {
                // Hour lines are brighter than half hour lines
                renderer(tickStart, domConfig) {
                    domConfig.className['ev-major-line'] = tickStart.getMinutes() === 0;
                }
            },
            // Draws the gap indicators
            dependencies : {
                allowCreate                       : false,
                showTooltip                       : false,
                enableDelete                      : false,
                // Workaround for bryntum/support#14016, a wider click area would render the gap's children twice
                clickWidth                        : 1,
                highlightDependenciesOnEventHover : false
            }
        }
    };

    construct(config = {}) {
        const me = this;

        super.construct({
            ...config,
            project : {
                resourceModelClass     : OpsResource,
                eventModelClass        : OpsEvent,
                dependencyModelClass   : GapDependency,
                // Blocked time: 'changeover' (planned, a die change), 'maintenance' (planned, an inspection) or 'down'
                // (unplanned, a breakdown). Picks the icon and the colour
                resourceTimeRangeStore : { fields : [{ name : 'state', defaultValue : 'down' }] },
                ...config.project
            },
            // The event renderer is called on this view, the other renderers as plain functions
            eventRenderer             : me.renderOpsEvent,
            resourceTimeRangeRenderer : renderBlockedTime,
            features                  : mergeFeature(config.features, 'dependencies', { renderer : args => renderGap(me, args) })
        });

        me.blockedTip = createBlockedTimeTip(me);

        me.on({
            eventSelectionChange : 'onOpsEventSelectionChange',
            beforeTaskEdit       : 'onBeforeOpsEdit',
            beforeTaskSave       : 'onBeforeOpsSave',
            thisObj              : me
        });
    }

    doDestroy() {
        this.blockedTip?.destroy();

        super.doDestroy();
    }

    get statusFilterStore() {
        return this.eventStore;
    }

    getStatus(eventRecord) {
        return deriveStatus(eventRecord, this.simNow, eventRecord.liveStatus);
    }

    formatNow(date) {
        return formatTime(date);
    }

    // Gap dependencies follow the events, before the live columns refresh
    onOpsDataReady() {
        syncGapDependencies(this);
        super.onOpsDataReady();
    }

    /**
     * Charging session state at the simulated now, also used by the Service view's columns
     * @param {Scheduler.model.EventModel} eventRecord
     * @returns {{ fraction : Number, soc : Number, kw : Number }}
     */
    getChargeState(eventRecord) {
        return chargeState(eventRecord, this.simNow);
    }

    // Bar content per event type, see EventBars
    renderOpsEvent({ eventRecord, renderData }) {
        const
            me     = this,
            status = me.getStatus(eventRecord),
            render = eventBars[eventRecord.type] || eventBars.service;

        me.applyBarCls(renderData.cls, eventRecord, status, eventRecord.type);

        renderData.wrapperCls['ev-linked'] = me.linkedRepairOrder && eventRecord.repairOrder === me.linkedRepairOrder;

        return render({
            view     : me,
            eventRecord,
            status,
            width    : renderData.width - barGap,
            fraction : elapsedFraction(eventRecord, me.simNow),
            done     : status === 'done',
            live     : isLiveStatus(status)
        });
    }

    getDetail(eventRecord) {
        return getEventDetail(this, eventRecord);
    }

    //region Simulation

    /**
     * Repaints the bars and the live locked cells of the resources with events live or changing state between the two
     * times, without re-rendering their rows. The bar content comes from the event renderer, which Scheduler runs when
     * laying out the events, so the bars repaint by `refreshEvents()`: it lays them out again and re-renders the time
     * axis cells only. `repaintEventsForResource()` and `refreshRows()` would render whole rows. The other locked cells
     * do not depend on time, the live ones refresh cell by cell
     */
    paintSimTick(now, old) {
        const
            me        = this,
            from      = Math.min(now, old),
            to        = Math.max(now, old),
            resources = new Set();

        me.eventStore.forEach(eventRecord => {
            if (eventRecord.startDate <= to && eventRecord.endDate >= from) {
                const flips = me.crossesBoundary(eventRecord, now, old);

                if (flips) {
                    me.markFlip(eventRecord.id);
                }

                eventRecord.resources.forEach(resource => {
                    resources.add(resource);

                    if (flips) {
                        me.markFlip(`r:${resource.id}`);
                    }
                });
            }
        });

        // All visible bars in one render pass
        if (resources.size) {
            me.refreshEvents();
        }

        // Blocked time starting or ending changes the resource state (its live cells) too, not the bars
        me.resourceTimeRangeStore.forEach(range => {
            if (me.crossesBoundary(range, now, old) && range.resource) {
                resources.add(range.resource);
                me.markFlip(`r:${range.resource.id}`);
            }
        });

        // With `liveAllRows` the live cells of all rows change with time (OEE, states). Group headers always
        me.refreshLiveCells(me.scenario.liveAllRows ? null : [...resources]);
    }

    //endregion

    //region Selection & linked bars

    get selectedTimeSpan() {
        return this.selectedEvents[0] || null;
    }

    clearTimeSpanSelection() {
        this.clearEventSelection();
    }

    /**
     * Selecting a service job highlights the charging session for the same repair order, dimming everything else
     */
    onOpsEventSelectionChange() {
        const
            me                   = this,
            { selectedTimeSpan } = me,
            previous             = me.linkedRepairOrder,
            repairOrder          = selectedTimeSpan?.repairOrder,
            // Only link when another event shares the repair order
            current              = repairOrder && me.eventStore.some(eventRecord =>
                eventRecord !== selectedTimeSpan && eventRecord.repairOrder === repairOrder) ? repairOrder : null,
            resources            = new Set();

        if (previous !== current) {
            me.linkedRepairOrder = current;
            me.element.classList.toggle('ev-linking', Boolean(current));

            me.eventStore.forEach(eventRecord => {
                if (eventRecord.repairOrder && [previous, current].includes(eventRecord.repairOrder)) {
                    resources.add(eventRecord.resource);
                }
            });

            // One render pass for all of them
            if (resources.size) {
                me.refreshRows([...resources]);
            }
        }
    }

    //endregion

    //region Keyboard nudge

    // 5 minutes per step, time only like dragging
    nudge(steps) {
        const
            eventRecord = this.selectedTimeSpan,
            minutes     = steps * 5;

        if (!eventRecord || this.readOnly) {
            return false;
        }

        const
            startDate = DateHelper.add(eventRecord.startDate, minutes, 'minute'),
            endDate   = DateHelper.add(eventRecord.endDate, minutes, 'minute');

        if (getInvalidRangeReason(this, eventRecord, startDate, endDate)) {
            return false;
        }

        eventRecord.setStartEndDate(startDate, endDate);

        return true;
    }

    //endregion

    //region Editor

    // Show the fields of the edited event's type only
    onBeforeOpsEdit({ taskRecord, editor }) {
        showTypeFields(editor, taskRecord.type, [...this.people.keys()]);
    }

    // The editor applies changes live, an invalid save is prevented
    onBeforeOpsSave({ taskRecord }) {
        const error = getInvalidRangeReason(this, taskRecord, taskRecord.startDate, taskRecord.endDate);

        if (error) {
            Toast.show({ html : StringHelper.encodeHtml(error), cls : 'ev-toast' });

            return false;
        }
    }

    //endregion
}

OperationsScheduler.initClass();
