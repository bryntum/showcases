// The Group feature is a Grid feature, importing the package registers it
import '@bryntum/grid-enterprise';
import { Scheduler } from '@bryntum/scheduler-enterprise';
import { AsyncHelper, DateHelper, StringHelper } from '@bryntum/core-enterprise';
import DispatchProject from '../model/DispatchProject.js';
import ForecastHeader from '../feature/ForecastHeader.js';
// Also register the features enabled below
import '../feature/DropTarget.js';
import '../feature/MapLink.js';
import { hhmm } from '../util/Time.js';
import { renderBuffers, renderDependency, renderGroup, renderRange, renderTrip, renderVessel } from './TripRendering.js';
import { tripTipContent } from './TripTip.js';
import { beforeTripEditShow, tripEdit } from './TripEdit.js';
import { planBreak, planSnapshot, tripTimeError, validateTripDrag } from './TripValidator.js';
import { tell } from '../util/Message.js';

const
    // The trips' inset in their 56px row (54px on a phone)
    margins     = { start : 3, end : 3 },
    // The trip's label above its legs, the NestedEvents feature's `headerHeight`
    headHeight  = 20,
    // Px per hour at least: Scheduler stretches the ticks to fill a wider view, below this the timeline scrolls
    minTick     = { wide : 50, phone : 44 };

/**
 * The Day view: the vessels and helicopters on the day's timeline, a Scheduler on the Enterprise tier. Mostly its
 * configs: the rendering, the checks and the trip editor live in the modules it imports, the store sync in
 * `refreshPlan()` and `refreshDispatch()`. Its event store holds the whole week; `trips` is the day shown.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/NestedEvents
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/EventBuffer
 */
export default class DispatchScheduler extends Scheduler {
    static $name = 'DispatchScheduler';

    static type = 'dispatchscheduler';

    static configurable = {
        // Nested events, their dependencies and the scheduling engine are Enterprise features
        tier              : 'enterprise',
        projectModelClass : DispatchProject,

        /**
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
        // No event style has a trip's look, a label over a thin line: its own CSS draws it. Its legs take the tonal
        // style (TripRendering#renderLeg)
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

        // The renderers reach this scheduler through the column's `grid`
        columns : [{
            field          : 'name',
            text           : 'Vessel',
            width          : 214,
            cls            : 'ow-axis-header',
            cellCls        : 'ow-resource-cell',
            sortable       : false,
            groupable      : false,
            headerRenderer : ({ column }) => column.grid.features.forecastHeader.labelHtml,
            renderer       : ({ record, grid }) => grid.renderVesselCell(record)
        }],

        // Called with the scheduler as `this`
        eventRenderer(args) {
            return this.renderEvent(args);
        },

        resourceTimeRangeRenderer : renderRange,

        // The callbacks below are called on their feature, its `client` is this scheduler
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
            // The Enterprise trip editor is TaskEdit, not the basic one
            eventEdit          : false,
            taskEdit           : tripEdit,
            // A trip's length follows from its stops and the distances, and trips are created by dropping a team
            eventResize        : false,
            eventDragCreate    : false,
            eventDrag          : {
                constrainDragToResource : true,
                validatorFn(context) {
                    return this.client.validateTripDrag(context);
                }
            },
            eventTooltip : {
                template({ eventRecord }) {
                    return tripTipContent(eventRecord.trip, this.client.dispatch);
                }
            },
            eventBuffer : {
                renderer(args) {
                    this.client.renderTransits(args);
                }
            },
            // Empty sea needs no time tip: the wave chart above says what the hour is like
            scheduleTooltip : false,
            // The dependencies come from the data, they are not drawn or edited by hand
            dependencies    : {
                allowCreate     : false,
                enableDelete    : false,
                radius          : 3,
                // A short arrowhead, as the legend's key draws it (the default is a 6 × 6 triangle in its 9 × 6 box)
                markerDef       : 'M6,0 L6,6 L9,3 z',
                // The line turns in the narrow gap before the stop it waits for
                clearance       : 6,
                showTooltip     : true,
                tooltipTemplate : dependency => StringHelper.encodeHtml(dependency.text),
                renderer        : renderDependency
            },
            dependencyEdit : false,
            dependencyMenu : false,
            // The trip's label sits over its departure, shifted by the buffer (`--ow-pre`): it must not slide on scroll
            stickyEvents   : false,
            // Each leg at its own time, no stacking: a trip's legs never overlap
            nestedEvents   : {
                eventLayout             : 'none',
                headerHeight            : headHeight,
                resourceMargin          : 2,
                barMargin               : 2,
                constrainDragToParent   : true,
                allowNestingOnDrop      : false,
                allowDeNestingOnDrop    : false,
                showCreateGroupMenuItem : false
            },
            // Not indented: the vessel column keeps its own inset
            group              : { field : 'group', renderer : renderGroup, indent : false },
            resourceTimeRanges : true,
            timeRanges         : {
                showHeaderElements  : true,
                showCurrentTimeLine : false,
                enableResizing      : false
            },
            // The showcase's own, in lib/feature/
            forecastHeader : true,
            dropTarget     : true,
            mapLink        : true
        }
    };

    construct(config) {
        const me = this;

        me.dayPreset = {
            base              : 'hourAndDay',
            tickWidth         : config.phone ? minTick.phone : minTick.wide,
            displayDateFormat : 'HH:mm',
            shiftUnit         : 'hour',
            shiftIncrement    : 1,
            timeResolution    : { unit : 'minute', increment : 5 },
            headers           : ForecastHeader.headers(() => me.features.forecastHeader)
        };

        super.construct({
            ...config,
            viewPreset : me.dayPreset,
            timeAxis   : { autoAdjust : false },
            project    : {
                ...config.project,
                // The trips read the teams on board from their project
                teams : config.dispatch.teams
            }
        });

        me.on({
            beforeTaskEdit     : 'onBeforeTripEdit',
            beforeTaskSave     : 'onBeforeTripSave',
            afterTaskSave      : 'onAfterTripSave',
            beforeTaskEditShow : beforeTripEditShow,
            thisObj            : me
        });
    }

    // Trips are edited, not their legs (the legs let the pointer through to their trip, trips.css), and not while
    // another change of the plan is placed (DispatchProject#runChange)
    onBeforeTripEdit({ taskRecord }) {
        const editable = !taskRecord.isLeg && !this.project.changePending;

        // The plan as it is, to check the saved time against (onBeforeTripSave)
        if (editable) {
            this.editStartPlan = planSnapshot(this.weekTrips);
        }

        return editable;
    }

    /**
     * Fired when the trip editor saved a new time on station and the trip is laid out from its new departure
     * @event tripTimeChange
     * @param {TripModel} trip
     */

    /**
     * The trip editor's time field `checkValidity` (TripEdit): the time is checked as a drag to it would be, and a
     * refused time shows the drag's reason on the field. The editor does not save while a field is invalid
     * @param {Core.widget.TimeField} timeField
     */
    checkTripTime(timeField) {
        const
            me     = this,
            // The editor's tab holds the trip edited
            reason = tripTimeError(me, me.features.taskEdit.editor?.widgetMap.generalTab.record, timeField.value);

        // Only touch the errors when the reason changes: setting or clearing one checks the field again.
        // Clear only our own error, the field may have others
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

    // TaskEdit owns the transaction: it applies the fields as they change and its Save commits them. The start set
    // that way would move the trip only, so the legs are laid out from the new departure here, inside that same
    // transaction, before the editor commits. A refused time never gets here (checkTripTime)
    // One change of the plan at a time: while another is placed, Save does nothing and the editor stays open. Once the
    // engine has placed the new time, a time that breaks the plan (planBreak) is taken back by the editor's own
    // transaction, its Cancel, and the reason shown
    async onBeforeTripSave({ taskRecord : trip, editor }) {
        const me = this;

        return me.project.runChange(async() => {
            trip.layout({ departs : me.departsAt(trip, editor.widgetMap.startDateField.value) });
            await me.project.commitAsync();

            const why = me.editStartPlan && planBreak(me, me.editStartPlan, [trip]);

            if (why) {
                tell(why);
                await me.features.taskEdit.cancel();

                return false;
            }
        });
    }

    onAfterTripSave({ taskRecord : trip }) {
        this.trigger('tripTimeChange', { trip });
    }

    /**
     * The trips of the day shown, without their legs. The event store holds the whole week
     * @property {TripModel[]}
     */
    get trips() {
        const day = this.dispatch.dayIndex;

        return this.weekTrips.filter(trip => trip.day === day);
    }

    get weekTrips() {
        return this.eventStore.rootNode?.children ?? [];
    }

    renderEvent(args) {
        const
            { dispatch, timeAxisViewModel, features } = this,
            { trip }                                  = args.eventRecord;

        return renderTrip(args, {
            close   : dispatch.closeOf(trip.resource),
            sailOut : timeAxisViewModel.getDistanceForDuration(trip.transits.out * 60_000),
            dropFit : features.dropTarget.isFitting(trip),
            held    : features.dropTarget.isHeld(trip)
        });
    }

    renderTransits(args) {
        const { dispatch, timeAxisViewModel } = this;

        renderBuffers(args, dispatch.closeOf(args.eventRecord.resource),
            {
                dayStart  : dispatch.day.dayStart * 60,
                dayEnd    : dispatch.day.dayEnd * 60,
                perMinute : timeAxisViewModel.getDistanceForDuration(60_000)
            });
    }

    // The Group feature runs the column renderer for its header rows too, which have no vessel (renderGroup)
    renderVesselCell(vessel) {
        const state = this.dispatch;

        if (vessel.isGroupHeader || !state.limits[vessel.window]) {
            return '';
        }

        return renderVessel(vessel, {
            day   : state.dayIndex,
            now   : state.now,
            close : state.closeOf(vessel),
            limit : state.limits[vessel.window]
        });
    }

    //region Views

    /**
     * Shows the day the dispatch state is on (DispatchState#dayIndex)
     */
    showDay() {
        const
            me           = this,
            { midnight, day } = me.dispatch;

        me.setTimeSpan(DateHelper.add(midnight, day.dayStart, 'hour'), DateHelper.add(midnight, day.dayEnd, 'hour'));
        me.scrollToDate(me.startDate, { block : 'start', animate : false });
    }

    /**
     * Selects a trip and scrolls its return into the middle of the view.
     * Workaround for Bryntum 8.0: a Scheduler just shown scrolls nowhere until its `timelineViewportResize`.
     * Shown again (a phone's Schedule), its time axis is 0 wide until then, a moment later: the scroll waits for it
     * @param {TripModel} trip
     * @returns {Promise} Resolves once scrolled
     */
    async showReturn(trip) {
        const me = this;

        if (!me.timeAxisSubGrid.width) {
            await Promise.race([
                new Promise(resolve => me.ion({ timelineViewportResize : resolve, once : true })),
                AsyncHelper.sleep(500)
            ]);
        }

        me.selectEvent(trip);
        await me.scrollRowIntoView(trip.resource, { block : 'center' });
        await me.scrollToDate(trip.outerEndDate, { block : 'center', animate : 300 });
    }

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
     * Redraws after the plan changed: the ghosts of the trips brought forward, the vessels' seats taken
     */
    refreshPlan() {
        this.syncRanges();
        this.refreshRows();
    }

    /**
     * Redraws after the day, the forecast or the clock changed: the no-go ranges, the now line, the time axis rows
     */
    refreshDispatch() {
        this.refreshPlan();
        this.syncNow();
        this.features.forecastHeader.refresh();
    }

    // A vessel's weather no-go from its window's close to the end of the day, the ghost of a trip the forecast
    // brought forward at its old place, and the outline of a held team's stop (DropTarget)
    syncRanges() {
        const
            me     = this,
            state  = me.dispatch,
            at     = minutes => state.dateAt(minutes),
            end    = at(state.day.dayEnd * 60),
            // The Group feature's header rows are records of the store too
            nogo   = me.resourceStore.allRecords.filter(vessel => !vessel.isGroupHeader).map(vessel => ({
                id         : `nogo-${vessel.id}`,
                kind       : 'nogo',
                resourceId : vessel.id,
                startDate  : at(state.closeOf(vessel)),
                endDate    : end,
                name       : state.limits[vessel.window].noGo
            })),
            ghosts = me.trips.filter(trip => trip.status === 'pulled' && trip.previousDeparture?.getTime() < end).map(trip => ({
                id         : `ghost-${trip.id}`,
                kind       : 'ghost',
                resourceId : trip.resource?.id,
                // From its old departure, as long as the trip is now
                startDate  : trip.previousDeparture,
                endDate    : DateHelper.add(trip.previousDeparture,
                    trip.outerEndDate.getTime() - trip.outerStartDate.getTime(), 'millisecond')
            }));

        me.resourceTimeRangeStore.data = [...nogo, ...ghosts, ...me.features.dropTarget.ranges];
    }

    // The now line and the shaded past, today only
    syncNow() {
        const
            state = this.dispatch,
            now   = state.dateAt(state.now);

        this.project.timeRangeStore.data = !state.isToday ? [] : [
            { id : 'past', startDate : this.startDate, endDate : now, cls : 'ow-past' },
            { id : 'now', startDate : now, endDate : now, name : hhmm(state.now), cls : 'ow-now' }
        ];
    }

    /**
     * The departure of a trip dragged to a new start. The trip starts at its first stop and leaves port the sail out
     * (its buffer) earlier. EventDrag snaps the start to the time resolution; the departure is snapped instead
     * @param {TripModel} trip
     * @param {Date} startDate The trip's start where it is dragged to
     * @returns {Number} Minutes since midnight
     */
    departsAt(trip, startDate) {
        const step = this.timeResolution.increment;

        return Math.round((trip.minutesOf(startDate) - trip.transits.out) / step) * step;
    }

    validateTripDrag(context) {
        return validateTripDrag(this, context);
    }

    //endregion
}

DispatchScheduler.initClass();
