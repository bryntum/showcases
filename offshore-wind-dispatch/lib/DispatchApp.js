import { Panel, Responsive, StringHelper, Toast } from '@bryntum/core-enterprise';
import DispatchState from './plan/DispatchState.js';
import ForecastPlanner from './plan/ForecastPlanner.js';
import { previewDrop, reachable } from './plan/Planner.js';
import { turbineIds } from './plan/Farm.js';
import TripModel from './model/TripModel.js';
import TeamDrag from './TeamDrag.js';
import { mapModel } from './map/MapModel.js';
import { cardInfo } from './map/TurbineCard.js';
import { legendHtml, scheduleBarHtml, sideBarHtml, tabsHtml } from './TitleBars.js';
import { hhmm, toDate, toMinutes } from './util/Time.js';
// Also registers the widget types used below
import { dayKpis } from './KpiBar.js';
import './TeamTray.js';
import './ForecastNotice.js';
import './map/TurbineMap.js';
import './schedule/DispatchScheduler.js';

// The stop a team's job adds to a trip
const stopOf = (team, job, preview = false) => ({ turbine : job.turbine, minutes : job.minutes, team : team.id,
    preview });

/**
 * Offshore Wind Dispatch: the header with the weather window, the vessels and helicopters on the day's timeline with
 * the teams waiting at the port above it, and the map of the farm with the selected turbine beside it.
 *
 * The app holds the selection and the team being dragged, and refreshes the views when the plan changes: a team
 * dropped on a trip, a trip dragged, or a new forecast re-planning the day (ForecastPlanner).
 *
 * Below 760px wide it is a `phone` (the Responsive mixin): the schedule and the map are tabs.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Panel
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/mixin/Responsive
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Toast
 */
export default class DispatchApp extends Panel.mixin(Responsive) {
    static $name = 'DispatchApp';

    static type = 'dispatchapp';

    static configurable = {
        /**
         * The parsed data/farm.json
         * @config {Object}
         */
        data : null,

        /**
         * `true` at phone widths, set by the `responsive` states
         * @prp {Boolean}
         */
        phone : null,

        /**
         * The tab shown on a phone, `schedule` or `map`
         * @prp {String}
         */
        tab : 'schedule',

        /**
         * The map's view: `status` of every turbine, or `access`, where the selected trip can still go
         * @prp {String}
         */
        mapView : 'status',

        responsive : {
            small : { when : 760, phone : true },
            '*'   : { phone : false }
        },

        cls     : 'ow-app',
        bodyCls : 'ow-app-body',
        layout  : 'vbox'
    };

    construct(config) {
        const
            me       = this,
            dispatch = new DispatchState(config.data),
            { site } = dispatch;

        me.dispatch     = dispatch;
        TripModel.teams = dispatch.teams;

        super.construct({ ...config, items : me.itemsConfig(config.data, site) });

        const { scheduler, map, tray } = me.widgetMap;

        me.forecastPlanner = new ForecastPlanner({ dispatch, trips : () => me.trips });
        me.drag            = new TeamDrag({ source : tray.element, scheduler, handler : me });

        scheduler.on({
            eventSelectionChange : 'onTripSelectionChange',
            eventClick           : 'onTripClick',
            afterEventDrop       : 'onTripDrop',
            thisObj              : me
        });
        map.on({ turbineClick : 'onTurbineClick', thisObj : me });
        me.element.addEventListener('click', event => me.onAction(event));

        // The responsive state may have been set before the items existed
        me.updatePhone(Boolean(me.phone));
        me.evaluate();
        me.refreshAll();
    }

    // The header, the tabs, the schedule half and the map half
    itemsConfig(data, site) {
        const me = this;

        return {
            kpis : { type : 'kpibar' },
            tabs : { type : 'widget', cls : 'ow-tabs' },
            main : {
                type   : 'container',
                cls    : 'ow-main',
                flex   : 1,
                layout : 'hbox',
                items  : {
                    schedulePane : {
                        type   : 'container',
                        cls    : 'ow-schedule',
                        flex   : 1,
                        layout : 'vbox',
                        items  : {
                            scheduleBar : { type : 'widget', cls : 'ow-panel-bar' },
                            tray        : { type : 'teamtray', port : site.port },
                            notice      : { type : 'forecastnotice' },
                            scheduler   : me.schedulerConfig(data),
                            legend      : { type : 'widget', cls : 'ow-legend', html : legendHtml }
                        }
                    },
                    side : {
                        type   : 'container',
                        cls    : 'ow-side',
                        width  : 400,
                        layout : 'vbox',
                        items  : {
                            sideBar : { type : 'widget', cls : 'ow-panel-bar' },
                            map     : { type : 'turbinemap', flex : 1, site },
                            card    : { type : 'turbinecard' }
                        }
                    }
                }
            }
        };
    }

    doDestroy() {
        this.drag?.destroy();
        super.doDestroy();
    }

    // The scheduler: today 06:00 to 18:00, the vessels, the trips with their legs nested in them and the dependency
    schedulerConfig(data) {
        const { day } = this.dispatch;

        return {
            type      : 'dispatchscheduler',
            flex      : 1,
            dispatch  : this.dispatch,
            startDate : toDate(day.dayStart * 60),
            endDate   : toDate(day.dayEnd * 60),
            project   : TripModel.projectData(data)
        };
    }

    get scheduler() {
        return this.widgetMap.scheduler;
    }

    get trips() {
        return this.scheduler.trips;
    }

    /**
     * Shows the plan once painted: Northern Tern's trip selected, the forecast chart drawn
     * @param {Object} [options]
     * @param {String} [options.state] `forecast` brings in the next forecast, `drag` holds Team F over Northern Tern's
     * trip (for screenshots and tests)
     * @returns {Promise}
     */
    async start({ state } = {}) {
        const
            me            = this,
            { scheduler } = me,
            first         = me.trips.find(trip => trip.id === 'NT-1') ?? me.trips[0];

        if (!scheduler.isPainted) {
            await new Promise(resolve => scheduler.on({ paint : resolve, once : true }));
        }

        scheduler.selectEvent(first);

        if (state === 'forecast') {
            me.applyForecast();
        }
        else if (state === 'drag' && me.dispatch.waiting.length) {
            me.drag.showHeld(me.dispatch.waitingTeams[0].team.id, first);
        }

        await scheduler.forecastHeader.refresh();
    }

    //region Plan state

    /**
     * Sets each trip's status against its window: what the forecast changed, else past the window or on plan
     */
    evaluate() {
        const { dispatch } = this;

        this.trips.forEach(trip => {
            const status = trip.change ?? (trip.endMinute > dispatch.closeOf(trip.resource) ? 'at-risk' : 'on-plan');

            if (trip.status !== status) {
                trip.status = status;
            }
        });
    }

    onPlanChange() {
        this.evaluate();
        this.refreshAll();
    }

    // A trip dragged to a new departure: its legs are placed again from it
    onTripDrop({ eventRecords, valid }) {
        if (valid) {
            eventRecords.forEach(trip => trip.layout({ departs : toMinutes(trip.startDate) }));
            this.onPlanChange();
        }
    }

    /**
     * Draws everything that follows the plan
     */
    refreshAll() {
        const
            me                          = this,
            { dispatch }                = me,
            { kpis, tray, scheduler }   = me.widgetMap;

        kpis.draw({
            site   : dispatch.site.name,
            now    : dispatch.now,
            closes : dispatch.windows.ctv,
            was    : dispatch.previousWindows?.ctv,
            kpis   : dayKpis(me.trips, dispatch)
        });
        tray.draw(dispatch.waitingTeams, me.lifted);
        scheduler.refreshDispatch();
        me.refreshBars();
        me.refreshSide();
    }

    /**
     * Draws the map and the selected turbine
     */
    refreshSide() {
        const
            me                                           = this,
            { dispatch, trips, drop, selectedTurbine }   = me,
            { map, card }                                = me.widgetMap,
            selectedTrip                                 = me.scheduler.selectedEvents[0] ?? null,
            turbine                                      = drop?.job.turbine ?? selectedTurbine;

        map.draw(mapModel({
            state           : dispatch,
            trips,
            selectedTrip,
            selectedTurbine : turbine,
            drop,
            access          : me.access(selectedTrip)
        }));

        if (turbine) {
            card.draw(cardInfo({ state : dispatch, trips, turbine, drop }));
        }
    }

    // The Access view: the turbines the selected trip could still add an hour's stop at
    access(trip) {
        if (this.mapView !== 'access') {
            return null;
        }

        const close = trip ? this.dispatch.closeOf(trip.resource) : 0;

        return { trip, minutes : 60, close, reach : trip ? reachable(trip.plan, 60, close) : new Set() };
    }

    //endregion

    //region Forecast

    /**
     * Brings in the next forecast and re-plans the day against it
     */
    applyForecast() {
        const
            me      = this,
            changes = me.forecastPlanner.apply(me.dispatch.waiting);

        me.evaluate();
        me.reviewIndex = -1;

        if (changes.length) {
            me.widgetMap.notice.draw({ ...me.forecastPlanner.summary(changes), changes : changes.length });
            me.reviewNext();
        }

        me.refreshAll();
    }

    // Puts back the trips as they were before the forecast. The forecast stays, the trips past it are flagged
    undoForecast() {
        const me = this;

        me.dispatch.waiting = me.forecastPlanner.undo();
        me.widgetMap.notice.hidden = true;
        me.onPlanChange();
    }

    // Selects the next trip the forecast changed
    reviewNext() {
        const
            me          = this,
            { changes } = me.forecastPlanner,
            change      = changes[me.reviewIndex = (me.reviewIndex + 1) % changes.length];

        if (change) {
            me.selectedTurbine = change.removed[0] ?? change.trip.turbines[0];
            me.scheduler.selectEvent(change.trip);
            me.scheduler.scrollEventIntoView(change.trip, { block : 'center', highlight : true });
            me.refreshSide();
        }
    }

    //endregion

    //region Selection

    onTripSelectionChange({ selected }) {
        const
            me      = this,
            trip    = selected?.[0],
            current = me.selectedTurbine;

        // The trip's first turbine, unless the selected one is on the trip
        if (trip && !trip.allStops.some(stop => stop.turbine === current) && !trip.removed?.includes(current)) {
            me.selectedTurbine = trip.allStops[0]?.turbine;
        }

        me.refreshSide();
    }

    // A click on a stop selects its turbine. The legs let the pointer through to their trip, the stop is the one at
    // the time clicked
    onTripClick({ eventRecord, event }) {
        const
            minute = event && toMinutes(this.scheduler.getDateFromDomEvent(event)),
            stop   = minute != null && eventRecord.trip.legs.find(leg => leg.type === 'stop' && !leg.preview &&
                leg.from <= minute && minute < leg.to);

        if (stop) {
            this.selectedTurbine = stop.turbine;
            this.refreshSide();
        }
    }

    onTurbineClick({ turbine }) {
        const
            me   = this,
            trip = me.trips.find(each => each.turbines.includes(turbine) || each.removed?.includes(turbine));

        me.selectedTurbine = turbine;

        if (trip && !me.scheduler.isEventSelected(trip)) {
            me.scheduler.selectEvent(trip);
            me.scheduler.scrollEventIntoView(trip, { block : 'center' });
        }

        me.refreshSide();
    }

    //endregion

    //region Dragging a team, see TeamDrag

    liftTeam(teamId) {
        const entry = this.dispatch.waitingTeams.find(({ team }) => team.id === teamId);

        this.lifted = teamId;
        this.widgetMap.tray.draw(this.dispatch.waitingTeams, teamId);

        return entry;
    }

    /**
     * Previews a team on a trip: the trip shows the stop, the map what the trip can still reach, the card the turbine
     * @param {String} teamId
     * @param {TripModel|null} trip
     * @returns {Object|null} `{ trip, team, job, result, reach, close }`
     */
    previewDrop(teamId, trip) {
        const me = this;

        if (me.drop?.trip === trip && me.drop?.team.id === teamId) {
            return me.drop;
        }

        me.clearPreview();

        if (!trip) {
            me.refreshSide();

            return null;
        }

        const
            { team, job } = me.dispatch.waitingTeams.find(entry => entry.team.id === teamId),
            close         = me.dispatch.closeOf(trip.resource),
            result        = me.checkDrop(trip, team, job);

        // The previewed stop is a leg of the trip too, after the last one
        trip.layout({ stops : [...trip.stops, stopOf(team, job, true)] });

        me.drop = { trip, team, job, result, close, reach : reachable(trip.plan, job.minutes, close) };
        me.refreshSide();

        return me.drop;
    }

    // Whether a team's job fits on a trip, see Planner#previewDrop
    checkDrop(trip, team, job) {
        const { dispatch } = this;

        return previewDrop({
            trip   : trip.plan,
            team,
            job,
            close  : dispatch.closeOf(trip.resource),
            now    : dispatch.now,
            vessel : trip.resource.name
        });
    }

    clearPreview() {
        const trip = this.drop?.trip;

        if (trip && !trip.isDestroyed) {
            trip.layout({ stops : trip.stops });
        }

        this.drop = null;
    }

    // Released over a trip: booked when it fits
    dropTeam(teamId, trip) {
        const
            me            = this,
            { dispatch }  = me,
            { team, job } = dispatch.waitingTeams.find(entry => entry.team.id === teamId) ?? {},
            result        = team && me.checkDrop(trip, team, job);

        if (!result?.valid) {
            Toast.show({
                html : StringHelper.encodeHtml(result?.reason ?? 'The team is not waiting'),
                cls  : 'ow-toast-message'
            });

            return;
        }

        trip.layout({ stops : [...trip.stops, stopOf(team, job)] });
        dispatch.waiting = dispatch.waiting.filter(turbine => turbine !== job.turbine);
        me.selectedTurbine = job.turbine;
        me.scheduler.selectEvent(trip);
        me.onPlanChange();

        Toast.show({
            html : StringHelper.xss`${team.name} booked on ${trip.id}, back at port ${hhmm(result.back)}`,
            cls  : 'ow-toast-message'
        });
    }

    endDrag() {
        this.clearPreview();
        this.lifted = null;
        this.widgetMap.tray.draw(this.dispatch.waitingTeams);
        this.refreshSide();
    }

    //endregion

    //region Toolbar buttons, tabs and the responsive layout

    onAction(event) {
        const
            me     = this,
            button = event.target.closest?.('[data-action]'),
            action = button?.dataset.action,
            { scheduler } = me;

        const actions = {
            forecast   : () => me.applyForecast(),
            undo       : () => me.undoForecast(),
            review     : () => me.reviewNext(),
            'zoom-out' : () => scheduler.zoomStep = Math.max(scheduler.zoomStep - 1, 0),
            'zoom-in'  : () => scheduler.zoomStep = Math.min(scheduler.zoomStep + 1, scheduler.lastZoomStep),
            'zoom-day' : () => scheduler.zoomStep = 0,
            view       : () => me.mapView = button.dataset.view,
            tab        : () => me.tab = button.dataset.tab
        };

        if (actions[action]) {
            actions[action]();
            me.refreshBars();
        }
    }

    // The schedule's and the map's title bars, and the phone tabs
    refreshBars() {
        const
            { dispatch, scheduler, tab, mapView } = this,
            { scheduleBar, sideBar, tabs }        = this.widgetMap;

        scheduleBar.html = scheduleBarHtml({
            vessels      : dispatch.vessels,
            next         : dispatch.nextForecast,
            zoomStep     : scheduler.zoomStep,
            lastZoomStep : scheduler.lastZoomStep
        });
        sideBar.html = sideBarHtml({
            site     : dispatch.site.name,
            turbines : turbineIds.length,
            due      : dispatch.dueTurbines.length,
            mapView
        });
        tabs.html = tabsHtml(tab);
    }

    updateMapView() {
        if (this.widgetMap?.map) {
            this.refreshSide();
        }
    }

    updatePhone(phone) {
        const { scheduler, side } = this.widgetMap ?? {};

        // Applied again once the items exist, see construct
        if (!scheduler) {
            return;
        }

        scheduler.phone = phone;
        side.flex       = phone ? 1 : null;
        side.width      = phone ? null : 400;
        this.toggleCls('ow-phone', phone);
        this.updateTab(this.tab);
    }

    updateTab(tab) {
        const { schedulePane, side } = this.widgetMap ?? {};

        if (schedulePane) {
            schedulePane.hidden = this.phone && tab !== 'schedule';
            side.hidden         = this.phone && tab !== 'map';
        }
    }

    //endregion
}

DispatchApp.initClass();
