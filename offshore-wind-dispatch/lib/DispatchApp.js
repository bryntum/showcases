import { Panel, Responsive } from '@bryntum/core-enterprise';
import DispatchState from './plan/DispatchState.js';
import ForecastPlanner from './plan/ForecastPlanner.js';
import { reachable } from './plan/Planner.js';
import { turbineIds } from './plan/Farm.js';
import TripModel from './model/TripModel.js';
import DropPreview from './DropPreview.js';
import TeamDrag from './TeamDrag.js';
import MapLink, { tripsOf } from './MapLink.js';
import { mapModel } from './map/MapModel.js';
import { cardHtml, cardInfo, tipInfo } from './map/TurbineCard.js';
import { legendHtml, scheduleBarHtml, sideBarHtml, tabsHtml } from './TitleBars.js';
import { toDate, toMinutes } from './util/Time.js';
// Also registers the widget types used below
import { dayKpis } from './KpiBar.js';
import './TeamTray.js';
import './ForecastNotice.js';
import './map/TurbineMap.js';
import './schedule/DispatchScheduler.js';

/**
 * Offshore Wind Dispatch: the header with the weather window, the vessels and helicopters on the day's timeline with
 * the teams waiting at the port above it, and the map of the farm with the selected turbine beside it.
 *
 * The app holds the selection and the team being dragged (DropPreview), and refreshes the views when the plan changes:
 * a team dropped on a trip, a trip dragged, or a new forecast re-planning the day (ForecastPlanner). The map and the
 * schedule share the selection both ways, and the hover through MapLink.
 *
 * Below 760px wide it is a `phone` (the Responsive mixin): the schedule and the map are tabs.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Panel
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/mixin/Responsive
 */
export default class DispatchApp extends DropPreview(Panel.mixin(Responsive)) {
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
        map.on({ selectionChange : 'onTurbineSelectionChange', thisObj : me });
        me.mapLink = new MapLink({ map, scheduler, focusTrip : () => me.drop?.trip ?? scheduler.selectedEvents[0] });
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
                            map     : {
                                type    : 'turbinemap',
                                flex    : 1,
                                site,
                                tipHtml : turbine => me.turbineTipHtml(turbine)
                            },
                            card : { type : 'turbinecard' }
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
     * Sets each trip's status: moved to tomorrow, else past its window (even if the forecast changed it), else as is
     */
    evaluate() {
        const { dispatch } = this;

        this.trips.forEach(trip => {
            const late = trip.endMinute > dispatch.closeOf(trip.resource);

            // A field set to its own value is no change, the trip is not redrawn
            trip.status = trip.change === 'moved' ? 'moved' : late ? 'at-risk' : trip.change ?? 'on-plan';
        });
    }

    onPlanChange() {
        this.replan();
    }

    /**
     * Changes the plan and draws it. A team held over a trip has its previewed stop taken off first, so the change and
     * the trips' status see the plan only, then previewed again and checked against the plan and forecast as they are
     * now: the trip, the map, the card and the drag's tooltip never show a check made against the old ones
     * @param {Function} [change] Changes the plan
     */
    replan(change) {
        const
            me   = this,
            held = me.drop && { teamId : me.drop.team.id, trip : me.drop.trip };

        me.clearPreview();
        change?.();
        me.evaluate();

        if (held) {
            me.holdPreview(held.teamId, held.trip);
        }

        me.refreshAll();
        me.drag?.refresh();
    }

    // A trip dragged to a new departure: its legs are placed again from it
    onTripDrop({ eventRecords, valid }) {
        if (valid) {
            // Read before the preview comes off, which lays the trip out again
            const departures = eventRecords.map(trip => [trip, toMinutes(trip.startDate)]);

            this.replan(() => departures.forEach(([trip, departs]) => trip.layout({ departs })));
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
        // The plan under the pointer may have changed
        me.mapLink?.refresh();

        if (turbine) {
            card.draw(cardInfo({ state : dispatch, trips, turbine, drop }));
        }
    }

    // The map's tooltip on a turbine: the card's turbine at the forecast wave height, its job, team and when a trip
    // reaches it
    turbineTipHtml(turbine) {
        const
            { dispatch, trips, drop } = this,
            info                      = tipInfo({ state : dispatch, trips, turbine, drop });

        return `<div class="ow-card ow-card-tip" data-tone="${info.tone}">${cardHtml(info, 'ow-tip')}</div>`;
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
        const me = this;

        let changes = [];

        me.replan(() => {
            changes = me.forecastPlanner.apply(me.dispatch.waiting);
        });
        me.reviewIndex = -1;

        if (changes.length) {
            me.widgetMap.notice.draw({ ...me.forecastPlanner.summary(changes), changes : changes.length });
            me.reviewNext();
        }
    }

    // Puts back the trips as they were before the forecast. The forecast stays, the trips past it are flagged
    undoForecast() {
        const me = this;

        me.widgetMap.notice.hidden = true;
        me.replan(() => {
            me.dispatch.waiting = me.forecastPlanner.undo();
        });
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

    // A turbine selected on the map, by a click or the keyboard, selects its trip
    onTurbineSelectionChange({ selection, user }) {
        const
            me      = this,
            turbine = selection[0]?.id,
            trip    = tripsOf(me.trips, turbine)[0];

        if (!user || !turbine) {
            return;
        }

        me.selectedTurbine = turbine;

        if (trip && !me.scheduler.isEventSelected(trip)) {
            me.scheduler.selectEvent(trip);
            me.scheduler.scrollEventIntoView(trip, { block : 'center' });
        }

        me.refreshSide();
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
