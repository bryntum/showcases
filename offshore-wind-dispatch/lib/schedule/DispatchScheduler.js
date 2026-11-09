// The Group feature is a Grid feature, importing the package registers it
import '@bryntum/grid-enterprise';
import { ProjectModelEnterprise, Scheduler } from '@bryntum/scheduler-enterprise';
import { StringHelper } from '@bryntum/core-enterprise';
import TripModel from '../model/TripModel.js';
import VesselModel from '../model/VesselModel.js';
import { isChain } from '../model/TripData.js';
import DispatchSync from './DispatchSync.js';
import ForecastHeader from './ForecastHeader.js';
import { renderDependency, renderGroup, renderRange, renderTrip, renderVessel } from './TripRendering.js';
import { tripTipContent } from './TripTip.js';
import { toDate } from '../util/Time.js';

const
    // The trips' place in their 64px row: 7px above, 14px below, room for the dependency line to pass under a trip
    margins     = { start : 7, end : 14 },
    // The trip's head line above its legs, the NestedEvents feature's header
    headHeight  = 19,
    // The hours of the day share the width, down to this many px per hour, then the timeline scrolls
    minTick     = { wide : 50, phone : 44 },
    // The zoom steps, times the width that fits the day
    zoomSteps   = [1, 1.5, 2.25];

/**
 * The vessels and helicopters on the day's timeline, a Scheduler on the Enterprise tier:
 *
 * - The scheduling engine places the trips: the Enterprise tier runs on a ProjectModelEnterprise, which keeps each
 *   trip's legs in order from its departure and starts a stop that depends on another trip once that trip is back,
 *   pushing the rest of its trip (TripModel)
 * - Trips are parent events, their legs (transits and turbine stops) are child events drawn inside them by the
 *   NestedEvents feature (TripModel, TripRendering)
 * - A dependency runs from the HV isolation flown to the substation into the one stop that needs it, drawn by the
 *   Dependencies feature from a trip to a nested event. Red only where the engine cannot resolve it: the wait it
 *   forces brings the trip back after its weather window
 * - The weather no-go of each vessel is a resource time range, from the hour the forecast crosses its limit
 * - The time axis carries the forecast: the wave height chart and the wind (ForecastHeader)
 * - The vessel column shows how much of the window left is booked, and the seats taken
 * - The shaded past and the now line are time ranges
 * - Trips are dragged along their own row only, not into the past and not once gone, their legs move with them
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/Scheduler
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/NestedEvents
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/Dependencies
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/ResourceTimeRanges
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/TimeRanges
 * https://bryntum.com/products/scheduler/docs/api/Grid/feature/Group
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/EventDrag#config-validatorFn
 */
export default class DispatchScheduler extends Scheduler {
    static $name = 'DispatchScheduler';

    static type = 'dispatchscheduler';

    static configurable = {
        // Nested events, their dependencies and the scheduling engine are Enterprise features
        tier              : 'enterprise',
        projectModelClass : ProjectModelEnterprise,

        /**
         * The dispatcher's state, the weather windows and the clock
         * @config {DispatchState}
         */
        dispatch : null,

        /**
         * `true` at phone widths: a narrow vessel column, the hours scroll
         * @prp {Boolean}
         */
        phone : false,

        /**
         * Index into the zoom steps, 0 fits the day to the width
         * @prp {Number}
         */
        zoomStep : 0,

        cls                       : 'ow-scheduler',
        rowHeight                 : 64,
        barMargin                 : 0,
        resourceMargin            : margins,
        // Fully custom bars
        eventStyle                : null,
        eventColor                : null,
        allowOverlap              : true,
        multiEventSelect          : false,
        zoomOnMouseWheel          : false,
        zoomOnTimeAxisDoubleClick : false,
        autoCreate                : false,
        useInitialAnimation       : false,

        features : {
            cellEdit           : false,
            cellMenu           : false,
            headerMenu         : false,
            timeAxisHeaderMenu : false,
            sort               : false,
            eventEdit          : false,
            eventMenu          : false,
            scheduleMenu       : false,
            eventResize        : false,
            eventDragCreate    : false,
            scheduleTooltip    : false,
            dependencyEdit     : false,
            dependencyMenu     : false,
            stickyEvents       : false,
            // The legs inside their trip, each at its own time, filling the trip under its head line
            nestedEvents       : {
                eventLayout             : 'none',
                headerHeight            : headHeight,
                // The inset of the legs from the trip's edge, the same on all sides, and between rows of legs
                resourceMargin          : 1,
                barMargin               : 1,
                constrainDragToParent   : true,
                allowNestingOnDrop      : false,
                allowDeNestingOnDrop    : false,
                showCreateGroupMenuItem : false
            },
            group              : { field : 'group', renderer : renderGroup },
            resourceTimeRanges : true,
            timeRanges         : {
                showHeaderElements  : true,
                showCurrentTimeLine : false,
                enableResizing      : false
            }
        }
    };

    construct(config) {
        const
            me     = this,
            header = me.forecastHeader = new ForecastHeader(config.dispatch);

        super.construct({
            ...config,
            viewPreset : {
                base              : 'hourAndDay',
                tickWidth         : 70,
                displayDateFormat : 'HH:mm',
                shiftUnit         : 'hour',
                shiftIncrement    : 1,
                timeResolution    : { unit : 'minute', increment : 5 },
                headers           : header.headers
            },
            columns : [{
                field          : 'name',
                text           : 'Vessel',
                width          : 214,
                cls            : 'ow-axis-header',
                cellCls        : 'ow-resource-cell',
                sortable       : false,
                groupable      : false,
                headerRenderer : () => header.labelHtml,
                renderer       : ({ record }) => me.renderVesselCell(record)
            }],
            project : {
                ...config.project,
                eventModelClass    : TripModel,
                resourceModelClass : VesselModel
            },
            eventRenderer : args =>
                renderTrip(args, me.dispatch.closeOf(args.eventRecord.trip.resource), me.dispatch.now),
            resourceTimeRangeRenderer : args => renderRange(args, range => me.dispatch.previousCloseOf(range.resource)),
            features                  : {
                ...config.features,
                // Along its own row, not into the past, not once gone or moved to tomorrow
                eventDrag : {
                    constrainDragToResource : true,
                    validatorFn             : context => me.validateTripDrag(context)
                },
                eventTooltip : {
                    template : ({ eventRecord }) => tripTipContent(eventRecord.trip, me.dispatch)
                },
                // Drawn from the data, not created or removed by hand. Red when the plan breaks it
                dependencies : {
                    allowCreate     : false,
                    enableDelete    : false,
                    radius          : 4,
                    showTooltip     : true,
                    tooltipTemplate : dependency => StringHelper.encodeHtml(me.dependencyText(dependency)),
                    renderer        : args => renderDependency(args, isChain)
                }
            }
        });

        me.on({
            paint                  : 'onSchedulerPaint',
            timelineViewportResize : 'fitTicks',
            thisObj                : me
        });
        me.project.on({ dataReady : 'onPlanCalculated', thisObj : me });
    }

    /**
     * Fired after the scheduling engine has calculated a change, when it changed how long a trip waits on station for
     * another trip: the trips' ends and status may have changed
     * @event waitChange
     * @param {TripModel[]} trips The trips whose wait changed
     */

    // The engine has placed the legs: each trip reads its wait on station from them
    onPlanCalculated() {
        const changed = this.trips.filter(trip => trip.updateWait());

        if (changed.length) {
            this.trigger('waitChange', { trips : changed });
        }
    }

    doDestroy() {
        this.forecastHeader.destroy();
        this.tickObserver?.disconnect();
        super.doDestroy();
    }

    /**
     * The trips, the root events of the tree event store, without their legs
     * @property {TripModel[]}
     */
    get trips() {
        return this.eventStore.rootNode?.children ?? [];
    }

    // The text of a dependency in the data, by its ID
    dependencyText(dependency) {
        return this.dispatch.dependencies.find(({ id }) => id === dependency.id)?.text ?? '';
    }

    onSchedulerPaint() {
        const me = this;

        me.forecastHeader.attach(me);
        me.forecastHeader.refresh();

        // The hours share the width, also when the window or a panel changes size
        me.tickObserver ??= new ResizeObserver(() => me.fitTicks());
        me.tickObserver.observe(me.timeAxisSubGridElement);
        me.fitTicks();
    }

    // The Group feature runs the column renderer for its header rows too, they have no vessel to draw (renderGroup)
    renderVesselCell(vessel) {
        const state = this.dispatch;

        if (vessel.isSpecialRow || vessel.isGroupHeader || !state.limits[vessel.window]) {
            return '';
        }

        return renderVessel(vessel, {
            now   : state.now,
            close : state.closeOf(vessel),
            limit : state.limits[vessel.window]
        });
    }

    //region Width and zoom

    /**
     * The tick width: the day fits the width at zoom level 0, wider levels scroll, phones scroll at 44px an hour
     */
    fitTicks() {
        const
            me      = this,
            width   = me.timeAxisSubGridElement?.clientWidth,
            hours   = me.dispatch.day.dayEnd - me.dispatch.day.dayStart,
            minimum = me.phone ? minTick.phone : minTick.wide;

        if (!width || me.isDestroyed) {
            return;
        }

        const tick = Math.max(minimum, Math.floor(width / hours * zoomSteps[me.zoomStep]));

        if (tick !== me.tickSize) {
            me.tickSize = tick;
        }
    }

    updateZoomStep() {
        if (this.isPainted) {
            this.fitTicks();
        }
    }

    get lastZoomStep() {
        return zoomSteps.length - 1;
    }

    updatePhone(phone) {
        const me = this;

        me.rowHeight = phone ? 60 : 64;

        if (me.columns?.count) {
            me.columns.first.width = phone ? 118 : 214;
        }

        if (me.isPainted) {
            me.fitTicks();
        }
    }

    //endregion

    //region Data and drag

    /**
     * Draws the state anew after the forecast or the plan changed: the vessel cells, the bars, the ranges, the header
     */
    refreshDispatch() {
        const me = this;

        (me.dispatchSync ??= new DispatchSync({ scheduler : me })).refresh();
        me.refreshRows();
        me.forecastHeader.refresh();
    }

    validateTripDrag({ eventRecords, startDate }) {
        const
            trip  = eventRecords[0],
            now   = toDate(this.dispatch.now);

        if (trip.status === 'moved') {
            return { valid : false, message : `${trip.id} is moved to tomorrow` };
        }

        // Trips under way are not draggable at all (their `draggable` field, DispatchApp#evaluate)
        if (startDate < now) {
            return { valid : false, message : 'Cannot leave port in the past' };
        }

        // A stop that waits for another trip is not refused: the engine starts it once that trip is back
        return true;
    }

    //endregion
}

DispatchScheduler.initClass();
