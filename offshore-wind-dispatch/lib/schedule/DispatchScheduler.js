// The Group feature is a Grid feature, importing the package registers it
import '@bryntum/grid-enterprise';
import { Scheduler } from '@bryntum/scheduler-enterprise';
import { StringHelper } from '@bryntum/core-enterprise';
import DispatchProject from '../model/DispatchProject.js';
import PlanDependencyModel from '../model/PlanDependencyModel.js';
import TripModel from '../model/TripModel.js';
import VesselModel from '../model/VesselModel.js';
import VesselRangeModel from '../model/VesselRangeModel.js';
import DispatchSync from './DispatchSync.js';
import ForecastHeader from './ForecastHeader.js';
import { renderBuffers, renderDependency, renderGroup, renderRange, renderTrip, renderVessel } from './TripRendering.js';
import { tripTipContent } from './TripTip.js';
import { beforeTripEditShow, tripEdit } from './TripEdit.js';
import { tripTimeError, validateTripDrag } from './TripValidator.js';
import { shownDay, toDate, toMinutes } from '../util/Time.js';

const
    // The trips' place in their 56px row (54px on a phone), 3px above and below: the label, then the 28px work blocks
    // on the line
    margins     = { start : 3, end : 3 },
    // The trip's label above its legs, the NestedEvents feature's header
    headHeight  = 20,
    // The hours of the day share the width, down to this many px per hour, then the timeline scrolls: the view
    // preset's tick width is the least, Scheduler stretches the ticks to fill a wider view
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
 * - The vessel column shows the seats taken, as a ring round the vessel's icon
 * - The now line is a time range, the past one lightly shaded
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
        projectModelClass : DispatchProject,

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
        rowHeight                 : 56,
        barMargin                 : 0,
        resourceMargin            : margins,
        // A trip is a label over a thin line, no event style has that look: its legs are the work blocks, in
        // Bryntum's tonal style (TripRendering#renderLeg), the line is drawn by the trip's own CSS
        eventStyle                : null,
        eventColor                : null,
        allowOverlap              : true,
        multiEventSelect          : false,
        zoomOnMouseWheel          : false,
        zoomOnTimeAxisDoubleClick : false,
        autoCreate                : false,
        useInitialAnimation       : false,
        // The engine's calculations here take moments: no progress bar under the header
        projectProgressReporting  : null,

        // Off where the dispatcher deliberately does not get that interaction here
        features : {
            // The vessels and their order are the fleet's, not edited or sorted in the plan
            cellEdit           : false,
            sort               : false,
            // No context menus: a trip is changed by dragging it, dropping a team on it or its editor
            cellMenu           : false,
            headerMenu         : false,
            timeAxisHeaderMenu : false,
            eventMenu          : false,
            scheduleMenu       : false,
            // The Enterprise trip editor is TaskEdit (below), not the basic one
            eventEdit          : false,
            // A trip's length follows from its stops and the distances, and trips are created by dropping a team
            eventResize        : false,
            eventDragCreate    : false,
            // Empty sea needs no time tip: the wave chart above says what the hour is like
            scheduleTooltip    : false,
            // The dependencies are the plan's, from the data, not drawn or edited by hand
            dependencyEdit     : false,
            dependencyMenu     : false,
            // The trip's label starts over its departure (the sail out is its buffer, `--ow-pre`): kept there, not
            // slid along on a scroll
            stickyEvents       : false,
            // The legs inside their trip, each at its own time, filling the trip under its head line
            nestedEvents       : {
                eventLayout             : 'none',
                headerHeight            : headHeight,
                // The legs fill the trip under its label, less these margins: the work blocks on the trip's line
                resourceMargin          : 2,
                barMargin               : 2,
                constrainDragToParent   : true,
                allowNestingOnDrop      : false,
                allowDeNestingOnDrop    : false,
                showCreateGroupMenuItem : false
            },
            // Vessels and Helicopters, the rows under them not indented: the vessel column keeps its own inset
            group              : { field : 'group', renderer : renderGroup, indent : false },
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

        /**
         * The trips a dragged team would fit on, outlined while the drag lasts (DropController#markFitting). Not a
         * field of the trip: a change of the record would redraw the trip and its legs
         * @property {Set<TripModel>}
         */
        me.fittingTrips = new Set();

        // The day's hours, with the weather rows in the time axis
        me.dayPreset = {
            base              : 'hourAndDay',
            tickWidth         : config.phone ? minTick.phone : minTick.wide,
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
                // The trips read the teams on board from their project
                teams                       : config.dispatch.teams,
                eventModelClass             : TripModel,
                resourceModelClass          : VesselModel,
                dependencyModelClass        : PlanDependencyModel,
                resourceTimeRangeModelClass : VesselRangeModel
            },
            eventRenderer             : args => me.renderEvent(args),
            resourceTimeRangeRenderer : renderRange,
            // The features whose configs call back into this scheduler (its dispatch state, its checks) are set here,
            // where the instance exists; the others are in `configurable` above
            features                  : {
                ...config.features,
                // Along its own row, not into the past, not once gone or moved to tomorrow
                eventDrag : {
                    constrainDragToResource : true,
                    validatorFn             : context => me.validateTripDrag(context)
                },
                taskEdit     : tripEdit,
                eventTooltip : { template : ({ eventRecord }) => tripTipContent(eventRecord.trip, me.dispatch) },
                // The sail out and back of a trip, its preamble and postamble: a line with the clock times at its ends
                eventBuffer  : { renderer : args => me.renderTransits(args) },
                // Drawn from the data, not created or removed by hand, marked when the plan breaks it
                dependencies : {
                    allowCreate     : false,
                    enableDelete    : false,
                    radius          : 3,
                    // A short arrowhead, as the legend's key draws it (the default is a 6 × 6 triangle in its 9 × 6
                    // box)
                    markerDef       : 'M6,0 L6,6 L9,3 z',
                    // The line turns in the narrow gap before the stop it waits for
                    clearance       : 6,
                    showTooltip     : true,
                    tooltipTemplate : dependency => StringHelper.encodeHtml(dependency.text),
                    renderer        : renderDependency
                }
            }
        });

        me.on({
            beforeTaskEdit     : 'onBeforeTripEdit',
            beforeTaskSave     : 'onBeforeTripSave',
            beforeTaskEditShow : beforeTripEditShow,
            paint              : 'onSchedulerPaint',
            thisObj            : me
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

    // Trips are edited, not their legs: a double click on a leg reaches its trip, the legs let the pointer through
    // (resources/schedule/legs.css). The draft trip shown while a team is dragged has no editor
    onBeforeTripEdit({ taskRecord }) {
        return !taskRecord.isLeg && !taskRecord.draft;
    }

    /**
     * Fired when the trip editor is saved with a new time on station: the trip is laid out again from its new
     * departure, as when it is dragged (DispatchApp#onTripTimeChange)
     * @event tripTimeChange
     * @param {TripModel} trip
     * @param {Date} startDate The trip's new start, its arrival at the first stop
     */

    /**
     * The trip editor's time field's validity check (its `checkValidity`, TripEdit): the time is checked as a drag to
     * it is, and a time refused shows the drag's reason on the field. The editor does not save while a field is invalid
     * @param {Core.widget.TimeField} timeField
     */
    checkTripTime(timeField) {
        const
            me     = this,
            // The editor's tab holds the trip edited
            reason = tripTimeError(me, me.features.taskEdit.editor?.widgetMap.generalTab.record, timeField.value);

        // Only a change of the reason touches the field's errors: setting or clearing one checks the field again. The
        // field may have errors of its own too, only this one is cleared
        if (reason !== me.tripTimeError) {
            const was = me.tripTimeError;

            me.tripTimeError = reason;

            if (was) {
                timeField.clearError(was, Boolean(reason));
            }

            if (reason) {
                timeField.setError(reason);
            }
        }
    }

    // A trip's times follow from its departure and its legs, so the editor does not save it: it is closed, and the
    // trip laid out again from the new departure, as when it is dragged. A time refused never gets here
    // (checkTripTime)
    onBeforeTripSave({ taskRecord : trip, editor }) {
        const
            me        = this,
            startDate = editor.widgetMap.startDateField.value;

        me.features.taskEdit.cancel().then(() => me.trigger('tripTimeChange', { trip, startDate }));

        return false;
    }

    doDestroy() {
        this.forecastHeader.destroy();
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

    onSchedulerPaint() {
        this.forecastHeader.attach(this);
        this.forecastHeader.refresh();
    }

    // A trip or one of its legs, against its vessel's window; a work block names its job's short type
    renderEvent(args) {
        const
            { dispatch, timeAxisViewModel } = this,
            { trip }                        = args.eventRecord;

        return renderTrip(args, {
            close        : dispatch.closeOf(trip.resource),
            sailOut      : timeAxisViewModel.getDistanceForDuration(trip.transits.out * 60_000),
            firstSailing : dispatch.firstSailing,
            dropFit      : this.fittingTrips.has(trip),
            typeOf       : turbine => dispatch.jobAt(turbine)?.type ?? ''
        });
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

        if (vessel.isGroupHeader || !state.limits[vessel.window]) {
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
     * Shows the day the dispatch state and the times are on (DispatchState#showDay, Time#showDay): its hours, from the
     * start of the day
     */
    showDay() {
        const
            me      = this,
            { day } = me.dispatch;

        me.setTimeSpan(toDate(day.dayStart * 60), toDate(day.dayEnd * 60));
        me.scrollToDate(me.startDate, { block : 'start', animate : false });
    }

    // A narrow vessel column and a little less room an hour. The tick width set is the least, as the preset's is
    updatePhone(phone) {
        const me = this;

        me.rowHeight = phone ? 54 : 56;

        if (me.columns?.count) {
            me.columns.first.width = phone ? 118 : 214;
        }

        if (!me.isConfiguring) {
            me.tickSize = phone ? minTick.phone : minTick.wide;
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

    /**
     * Whether a trip may be dragged to a new time, the EventDrag feature's `validatorFn` (TripValidator)
     * @param {Object} context `{ eventRecords, startDate, newResource }`
     * @returns {Boolean|Object} `true`, or `{ valid : false, message }`
     */
    validateTripDrag(context) {
        return validateTripDrag(this, context);
    }

    //endregion
}

DispatchScheduler.initClass();
