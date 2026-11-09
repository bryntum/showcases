import { Panel, Responsive } from '@bryntum/core-enterprise';
import DispatchState from './plan/DispatchState.js';
import ForecastPlanner from './plan/ForecastPlanner.js';
import { dayKpis } from './plan/Kpis.js';
import TripModel from './model/TripModel.js';
import DropPreview from './DropPreview.js';
import TeamDrag from './drag/TeamDrag.js';
import MapLink, { tripsOf } from './MapLink.js';
import { mapModel } from './map/MapModel.js';
import { cardInfo, tipContent, tipInfo } from './map/TurbineCard.js';
import { showDay, toMinutes } from './util/Time.js';
// Also registers the widget types used below
import './KpiBar.js';
import './TeamTray.js';
import './panel/SchedulePanel.js';
import './panel/MapPanel.js';
import './panel/PhoneTabs.js';

// The turbine the page opens on: the one the weather puts at risk
const openingTurbine = 'T-41';

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

        const { scheduler, board, map, tray, schedulePane, notice } = me.widgetMap;

        me.forecastPlanner = new ForecastPlanner({ dispatch, trips : () => me.trips });
        me.drag            = new TeamDrag({ tray, scheduler, board, handler : me });

        board.on({ dayClick : ({ index }) => me.openDay(index) });

        scheduler.on({
            eventSelectionChange : 'onTripSelectionChange',
            eventClick           : 'onTripClick',
            afterEventDrop       : 'onTripDrop',
            tripTimeChange       : 'onTripTimeChange',
            waitChange           : 'onWaitChange',
            thisObj              : me
        });
        map.on({ selectionChange : 'onTurbineSelectionChange', wholeFarm : 'onWholeFarm', thisObj : me });
        me.mapLink = new MapLink({ map, scheduler, focusTrip : () => me.drop?.trip ?? scheduler.selectedEvents[0] });
        schedulePane.on({ forecast : 'applyForecast', thisObj : me });
        notice.on({ undo : 'undoForecast', review : 'reviewNext', thisObj : me });

        // The responsive state may have been set before the items existed
        me.updatePhone(Boolean(me.phone));
        // The card shows the opening turbine from the first paint, so the rail keeps its layout while start() runs
        me.selectedTurbine = openingTurbine;
        me.evaluate();
        me.refreshAll();
    }

    // The header, the schedule half and the map half, and the tab panel that holds the two halves on a phone
    itemsConfig(data, site) {
        const me = this;

        return {
            kpis : { type : 'kpibar' },
            // On a phone the schedule and the map are its tabs (updatePhone)
            tabs : {
                type : 'phonetabs',
                onTabChange({ activeItem }) {
                    me.tab = activeItem && activeItem === me.widgetMap.side ? 'map' : 'schedule';
                }
            },
            main : {
                type   : 'container',
                cls    : 'ow-main',
                flex   : 1,
                layout : 'hbox',
                items  : {
                    // The schedule's card, the crews waiting at the port under it on the page. On a phone this is
                    // the Schedule tab
                    column : {
                        type   : 'container',
                        cls    : 'ow-left',
                        title  : 'Schedule',
                        flex   : 1,
                        layout : 'vbox',
                        items  : {
                            schedulePane : { type : 'schedulepanel', flex : 1, dispatch : me.dispatch, data },
                            tray         : { type : 'teamtray', port : site.portShort ?? site.port }
                        }
                    },
                    side : {
                        type       : 'mappanel',
                        site,
                        tipContent : turbine => me.turbineTip(turbine)
                    }
                }
            }
        };
    }

    doDestroy() {
        this.drag?.destroy();
        super.doDestroy();
    }

    get scheduler() {
        return this.widgetMap.scheduler;
    }

    get trips() {
        return this.scheduler.trips;
    }

    /**
     * Shows the plan: T-41 selected, the turbine the story is about, its trip with it, the forecast chart
     * drawn
     * @param {Object} [options]
     * @param {String} [options.state] `forecast` brings in the next forecast, `drag` holds Team F over Northern Tern's
     * trip (for screenshots and tests)
     * @param {String} [options.view] `week` opens the Week view
     * @returns {Promise}
     */
    async start({ state, view } = {}) {
        const
            me            = this,
            { scheduler } = me,
            first         = me.trips.find(trip => trip.id === 'NT-1') ?? me.trips[0],
            // Its trip, Sea Puffin's
            opening       = tripsOf(me.trips, openingTurbine)[0] ?? first;

        // No need to wait for the scheduler's `paint`: the app is constructed into the page, and a widget rendered into
        // a visible element paints as it renders. The engine's first calculation: the legs placed, the waits known
        await scheduler.project.commitAsync();
        me.evaluate();
        me.refreshAll();

        // The turbine first: selecting its trip keeps it, as it is on the trip (onTripSelectionChange)
        me.selectedTurbine = openingTurbine;
        scheduler.selectEvent(opening);
        // From here on, a trip or turbine the user selects fits the map to it
        me.started = true;

        if (state === 'forecast') {
            await me.applyForecast();
        }
        else if (state === 'drag' && me.dispatch.waiting.length) {
            me.drag.showHeld(me.dispatch.waitingTeams[0].team.id, first);
        }

        await scheduler.forecastHeader.refresh();

        if (view === 'week') {
            me.widgetMap.schedulePane.showView('week');
        }
    }

    /**
     * Opens the Day view on a day of the week, a click on the Week view's day or cell
     * @param {Number} index 0 is today
     * @returns {Promise} Resolves once drawn
     */
    async openDay(index) {
        const me = this;

        me.widgetMap.schedulePane.showView('day');

        if (index !== me.dispatch.dayIndex) {
            me.clearPreview();
            me.scheduler.clearEventSelection();
            me.dispatch.showDay(index);
            showDay(index);
            me.scheduler.showDay();
            me.fitKey = null;
            await me.replan();
            await me.scheduler.forecastHeader.refresh();
        }
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
            // A trip that has left port is under way: no drag, no grab cursor (EventDrag reads the field)
            trip.draggable = trip.departs > dispatch.now && trip.status !== 'moved' && !trip.draft;
        });
    }

    onPlanChange() {
        this.replan();
    }

    /**
     * Changes the plan, lets the scheduling engine place it, and draws it. A team held over a trip has its previewed
     * stop taken off first, so the change and the trips' status see the plan only, then previewed again and checked
     * against the plan and forecast as they are now: the trip, the map, the card and the drag's tooltip never show a
     * check made against the old ones
     * @param {Function} [change] Changes the plan
     * @returns {Promise} Resolves once drawn
     */
    async replan(change) {
        const
            me   = this,
            held = me.drop && { teamId : me.drop.team.id, target : me.drop.target, at : me.drop.at };

        me.replanning = true;
        me.clearPreview();
        change?.();

        try {
            // The engine pushes the stops that wait for another trip, and the legs after them
            await me.scheduler.project.commitAsync();
        }
        finally {
            me.replanning = false;
        }

        if (me.isDestroyed) {
            return;
        }

        me.evaluate();

        // Held again, unless the pointer has moved on to another trip meanwhile
        if (held && !me.drop) {
            me.holdPreview(held.teamId, held.target, held.at);
        }

        me.refreshAll();
        me.drag?.refresh();
    }

    // The engine changed how long a trip waits on station, outside a change of the app's own (a trip dragged): its end
    // and status follow. Not while a team is held: its previewed stop is no change of the plan, the plan is checked
    // again once it comes off
    onWaitChange() {
        if (!this.replanning && !this.drop) {
            this.replan();
        }
    }

    // A trip dragged to a new departure: the engine moves its legs with it, and pushes any stop that waits for it. The
    // departure is snapped, not the trip's start at its first stop (DispatchScheduler#departsAt)
    onTripDrop({ valid, eventRecords }) {
        const
            { scheduler } = this,
            trip          = eventRecords?.[0];

        return valid ? this.replan(() => trip?.layout({ departs : scheduler.departsAt(trip, trip.startDate) })) : null;
    }

    // The trip editor saved a new time on station
    onTripTimeChange({ trip, startDate }) {
        return this.replan(() => trip.layout({ departs : this.scheduler.departsAt(trip, startDate) }));
    }

    /**
     * Draws everything that follows the plan
     */
    refreshAll() {
        const
            me                               = this,
            { dispatch }                     = me,
            { kpis, tray, scheduler, board } = me.widgetMap;

        kpis.draw({ site : dispatch.site.name, kpis : dayKpis(me.trips, dispatch) });
        tray.draw(dispatch.waitingTeams, me.lifted);
        scheduler.refreshDispatch();
        board.draw(scheduler.weekTrips);
        me.widgetMap.schedulePane.refreshBar();
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
            drop
        }));
        // The plan under the pointer may have changed
        me.mapLink?.refresh();
        me.fitMap(selectedTrip, turbine);

        if (turbine) {
            card.draw(cardInfo({ state : dispatch, trips, turbine, drop, selectedTrip }));
        }
    }

    // The map's tooltip on a turbine: the card's turbine at the forecast wave height, its job, team and when a trip
    // reaches it, and its rotor
    turbineTip(turbine) {
        const
            { dispatch, trips, drop } = this,
            selectedTrip              = this.scheduler.selectedEvents[0] ?? null,
            info                      = tipInfo({ state : dispatch, trips, turbine, drop, selectedTrip });

        return tipContent(info);
    }

    //endregion

    //region Forecast

    /**
     * Brings in the next forecast and re-plans the day against it
     * @returns {Promise} Resolves once the plan is drawn
     */
    async applyForecast() {
        const me = this;

        let changes = [];

        await me.replan(() => {
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

        return me.replan(() => {
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

        me.mapFollows = Boolean(me.started);

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
            this.mapFollows      = true;
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
        me.mapFollows      = true;
        // A turbine picked on the map is already in view: the map stays where it is (fitMap)
        me.keepMapView     = true;

        if (trip && !me.scheduler.isEventSelected(trip)) {
            me.scheduler.selectEvent(trip);
            me.scheduler.scrollEventIntoView(trip, { block : 'center' });
        }

        me.refreshSide();
        me.keepMapView = false;
    }

    /**
     * Fits the map to the selected trip's turbines and the port, or to the selected turbine and the port, once the
     * user selected one. A team held over a trip shows the whole farm, what the trip can still reach is all over it.
     *
     * Only a change of what is shown moves the map: another trip or turbine selected, the map following or not, a team
     * held or not. Not a turbine picked on the map itself (`keepMapView`). A redraw of the same selection (the plan,
     * the clock, a hover) leaves the view the user panned or zoomed to where it is
     * @param {TripModel|null} trip
     * @param {String|null} turbine
     */
    fitMap(trip, turbine) {
        const
            me       = this,
            follow   = Boolean(me.mapFollows && !me.drop),
            key      = me.fitKeyOf(trip, turbine),
            turbines = trip ? [...trip.turbines, ...(trip.removed ?? [])] : [],
            fit      = !turbine || turbines.includes(turbine) ? turbines : [turbine];

        if (key !== me.fitKey) {
            me.fitKey = key;

            if (!me.keepMapView) {
                me.widgetMap.map.fitTo(follow ? fit : null);
            }
        }
    }

    // What the map is fitted to, see fitMap
    fitKeyOf(trip, turbine) {
        return [trip?.id, turbine, Boolean(this.mapFollows && !this.drop), Boolean(this.drop)].join('|');
    }

    // The map's Show all button (it has gone to the whole farm): the map stays there, or where the user pans or zooms
    // it, until the user selects another trip or turbine
    onWholeFarm() {
        const me = this;

        me.mapFollows = false;
        me.fitKey     = me.fitKeyOf(me.scheduler.selectedEvents[0] ?? null, me.drop?.job.turbine ?? me.selectedTurbine);
    }

    //endregion

    //region Toolbar buttons, tabs and the responsive layout

    // On a phone the two halves move into the tab panel, back side by side on a wider screen
    updatePhone(phone) {
        const { scheduler, board, column, schedulePane, side, main, tabs } = this.widgetMap ?? {};

        // Applied again once the items exist, see construct
        if (!scheduler) {
            return;
        }

        const home = phone ? tabs : main;

        scheduler.phone = board.phone = schedulePane.phone = side.phone = phone;
        side.flex       = phone ? 1 : null;
        side.width      = phone ? null : 400;

        if (column.owner !== home) {
            home.add([column, side]);
            // A tab panel shows one of them, side by side both
            column.hidden = side.hidden = false;
        }

        tabs.hidden = !phone;
        main.hidden = phone;
        this.element?.classList.toggle('ow-phone', phone);
        this.updateTab(this.tab);
    }

    updateTab(tab) {
        const { tabs } = this.widgetMap ?? {};

        if (tabs && this.phone) {
            tabs.activeTab = tab === 'map' ? 1 : 0;
        }
    }

    //endregion
}

DispatchApp.initClass();
