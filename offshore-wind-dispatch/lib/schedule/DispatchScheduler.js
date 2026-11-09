// The Group feature is a Grid feature, importing the package registers it
import '@bryntum/grid-enterprise';
import { ProjectModelEnterprise, Scheduler } from '@bryntum/scheduler-enterprise';
import { StringHelper } from '@bryntum/core-enterprise';
import TripModel from '../model/TripModel.js';
import VesselModel from '../model/VesselModel.js';
import { isChain } from '../model/TripData.js';
import DispatchSync from './DispatchSync.js';
import ForecastHeader from './ForecastHeader.js';
import { renderBuffers, renderDependency, renderGroup, renderRange, renderTrip, renderVessel } from './TripRendering.js';
import { tripTipContent } from './TripTip.js';
import { hhmm, shownDay, toDate, toMinutes } from '../util/Time.js';
import { noGoText } from '../plan/Planner.js';

const
    // The trips' place in their 58px row, 3px above and below: the label, then the 28px work blocks on the line
    margins     = { start : 3, end : 3 },
    // The trip's label above its legs, the NestedEvents feature's header
    headHeight  = 20,
    // The hours of the day share the width, down to this many px per hour, then the timeline scrolls
    minTick     = { wide : 50, phone : 44 };

/**
 * The vessels and helicopters on the day's timeline, a Scheduler on the Enterprise tier:
 *
 * - The scheduling engine places the trips: the Enterprise tier runs on a ProjectModelEnterprise, which keeps each
 *   trip's legs in order from its departure and starts a stop that depends on another trip once that trip is back,
 *   pushing the rest of its trip (TripModel)
 * - Trips are parent events over their time on station, their legs at sea (turbine stops and the hops between them)
 *   are child events drawn inside them by the NestedEvents feature (TripModel, TripRendering)
 * - The sail out and back are each trip's buffer time, its preamble and postamble, drawn by the EventBuffer feature
 *   as a thin line with the clock times at its ends
 * - The dependencies run from the HV isolation flown to the substation into the one stop that needs it, and from a
 *   helicopter's drop-off into its pick-up, a lag later: a thin line with an arrowhead drawn by the Dependencies
 *   feature from a trip to a nested event. Orange only where the engine cannot resolve it: the wait it forces brings
 *   the trip back after its weather window. A trip drag that would do that is refused with the reason
 * - The weather no-go of each vessel is a resource time range, from the hour the forecast crosses its limit
 * - The time axis carries the forecast: the wave height chart and the wind (ForecastHeader)
 * - The vessel column shows how much of the window left is booked, and the seats taken
 * - The shaded past and the now line are time ranges
 * - Trips are dragged along their own row only, not into the past and not once gone, their legs move with them
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/Scheduler
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/NestedEvents
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/EventBuffer
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

        cls                       : 'ow-scheduler',
        rowHeight                 : 58,
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
                // The legs fill the 32px under the label less 2px above and below: 28px work blocks
                resourceMargin          : 2,
                barMargin               : 2,
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

        // The day's hours, with the weather rows in the time axis
        me.dayPreset = {
            base              : 'hourAndDay',
            tickWidth         : 70,
            displayDateFormat : 'HH:mm',
            shiftUnit         : 'hour',
            shiftIncrement    : 1,
            timeResolution    : { unit : 'minute', increment : 5 },
            headers           : header.headers
        };

        super.construct({
            ...config,
            viewPreset : me.dayPreset,
            timeAxis   : { autoAdjust : false },
            columns    : [{
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
            eventRenderer             : args => me.renderEvent(args),
            resourceTimeRangeRenderer : renderRange,
            features                  : {
                ...config.features,
                // Along its own row, not into the past, not once gone or moved to tomorrow
                eventDrag : {
                    constrainDragToResource : true,
                    validatorFn             : context => me.validateTripDrag(context)
                },
                eventTooltip : { template : ({ eventRecord }) => tripTipContent(eventRecord.trip, me.dispatch) },
                // The sail out and back of a trip, its preamble and postamble: a line with the clock times at its ends
                eventBuffer  : { renderer : args => me.renderTransits(args) },
                // Drawn from the data, not created or removed by hand, marked when the plan breaks it
                dependencies : {
                    allowCreate     : false,
                    enableDelete    : false,
                    radius          : 3,
                    // The line turns in the narrow gap before the stop it waits for
                    clearance       : 6,
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
     * The trips of the day shown, root events of the tree event store, without their legs. The store holds the whole
     * week's
     * @property {TripModel[]}
     */
    get trips() {
        const day = shownDay();

        return this.weekTrips.filter(trip => trip.day === day);
    }

    /**
     * The trips of the whole week
     * @property {TripModel[]}
     */
    get weekTrips() {
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

    // A trip or one of its legs, against its vessel's window; a work block names its job's short type
    renderEvent(args) {
        const { dispatch } = this;

        return renderTrip(args, dispatch.closeOf(args.eventRecord.trip.resource),
            turbine => dispatch.jobAt(turbine)?.type ?? '');
    }

    // The EventBuffer feature's renderer: a trip's sail out and back against its window and the start of the day, the
    // tick being an hour wide
    renderTransits(args) {
        const { dispatch, timeAxisViewModel } = this;

        renderBuffers(args, dispatch.closeOf(args.eventRecord.resource),
            { dayStart : dispatch.day.dayStart * 60, perMinute : timeAxisViewModel.getDistanceForDuration(60_000) });
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

    //region Views

    /**
     * The tick width: the Day view fits some hours of the day to the width and the rest scrolls into view (phones
     * scroll at 44px an hour)
     */
    fitTicks() {
        const
            me      = this,
            width   = me.timeAxisSubGridElement?.clientWidth,
            minimum = me.phone ? minTick.phone : minTick.wide;

        if (!width || me.isDestroyed) {
            return;
        }

        // The whole working day when it fits; on a narrower screen the hours keep their minimum width and the timeline
        // scrolls
        const
            { day } = me.dispatch,
            tick    = Math.max(minimum, Math.floor(width / (day.dayEnd - day.dayStart)));

        if (tick !== me.tickSize) {
            me.tickSize = tick;
        }
    }

    /**
     * Shows the day the dispatch state and the times are on (DispatchState#showDay, Time#showDay): its hours, from the
     * start of the day
     */
    showDay() {
        const
            me      = this,
            { day } = me.dispatch;

        me.setTimeSpan(toDate(day.dayStart * 60), toDate(day.dayEnd * 60));
        me.fitTicks();
        me.scrollToDate(me.startDate, { block : 'start', animate : false });
    }

    updatePhone(phone) {
        const me = this;

        me.rowHeight = phone ? 54 : 58;

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

    /**
     * The departure of a trip dragged to a new start. The trip starts at its first stop, it leaves port the sail out
     * (its buffer) earlier. EventDrag snaps that start to the time resolution, the departure is snapped instead
     * @param {TripModel} trip
     * @param {Date} startDate The trip's start where it is dragged to
     * @returns {Number} Minutes since midnight
     */
    departsAt(trip, startDate) {
        const step = this.timeResolution.increment;

        return Math.round((toMinutes(startDate) - trip.transits.out) / step) * step;
    }

    validateTripDrag(context) {
        const { eventRecords, startDate } = context;

        const
            trip    = eventRecords[0],
            departs = this.departsAt(trip, startDate);

        if (trip.status === 'moved') {
            return { valid : false, message : `${trip.id} is moved to tomorrow` };
        }

        // Trips under way are not draggable at all (their `draggable` field, DispatchApp#evaluate)
        if (departs < this.dispatch.now) {
            return { valid : false, message : 'Cannot leave port in the past' };
        }

        // Out at sea while the vessel's weather is over its limit
        const
            vessel = (context.newResource ?? trip.resource),
            close  = this.dispatch.closeOf(vessel),
            back   = departs + trip.endMinute - trip.departs;

        if (back > close) {
            return { valid : false, message : noGoText(back, close, this.dispatch.limits[vessel.window]) };
        }

        // A stop that waits for another trip is not refused: the engine starts it once that trip is done. Unless that
        // leaves a trip back after its window
        const broken = this.dependencyBreak(trip, departs);

        return broken ? { valid : false, message : broken } : true;
    }

    /**
     * The reason a trip moved to a new departure breaks a dependency of the plan, if it does: the engine would move
     * the dependent stop (its trip waits on station, or the trip's own stop moves later) and that trip would be back
     * after its weather window
     * @param {TripModel} trip
     * @param {Number} departs The trip's new departure, minutes since midnight
     * @returns {String|null}
     */
    dependencyBreak(trip, departs) {
        const delta = departs - trip.departs;

        for (const dependency of this.dependencyStore.records.filter(each => !isChain(each))) {
            const
                { fromEvent, toEvent } = dependency,
                dependent              = toEvent?.trip;

            if (fromEvent?.endDate && dependent && (fromEvent.trip === trip || dependent === trip)) {
                const
                    shift = record => (record.trip === trip ? delta : 0),
                    // Where the stop could start without waiting on station, and where the trip it follows is done
                    free  = toMinutes(toEvent.startDate) - dependent.wait + shift(toEvent),
                    done  = toMinutes(fromEvent.endDate) + shift(fromEvent) + (dependency.lag ?? 0),
                    wait  = Math.max(0, done - free),
                    back  = dependent.endMinute - dependent.wait + wait + shift(toEvent),
                    close = this.dispatch.closeOf(dependent.resource);

                if (wait > 0 && back > close) {
                    return `${this.dependencyText(dependency)}: ${dependent.id} would be back ${hhmm(back)}, ` +
                        `after its window closes ${hhmm(close)}`;
                }
            }
        }

        return null;
    }

    //endregion
}

DispatchScheduler.initClass();
