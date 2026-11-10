import { Panel, Responsive, StringHelper, Toast } from '@bryntum/core-enterprise';
import AppState from './AppState.js';
import DispatchState from './plan/DispatchState.js';
import ForecastPlanner from './plan/ForecastPlanner.js';
import DropController from './DropController.js';
import TeamDrag from './drag/TeamDrag.js';
import MapLink, { tripsOf } from './MapLink.js';
import PhoneLayout from './PhoneLayout.js';
import { tipContent, tipInfo } from './map/TurbineCard.js';
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
 * The app is the wiring between three sources of truth and the views:
 *
 * - The plan: the trips in the Scheduler's project, placed by its scheduling engine. A change of the plan (a team
 *   booked, a trip dragged or edited, a new forecast, its Undo) goes through `replan()`, which lets the engine
 *   calculate it; the project's `dataReady` then redraws the views
 * - The dispatch state (DispatchState): the day shown, the forecast and its windows, the teams waiting. Its `change`
 *   redraws the views
 * - The app state (AppState): the turbine selected, whether the map follows it, the team held over a trip. Its
 *   `change` redraws the map and the card. The trip selected is the Scheduler's own selection
 *
 * The trips' bars, the legs and the vessel column are drawn by the Scheduler's renderers from the records. The map and
 * the schedule share the selection both ways, and the hover through MapLink. DropController previews and books a held
 * team, ForecastPlanner re-plans the day for a new forecast.
 *
 * Below 760px wide it is a `phone` (the Responsive mixin): the schedule and the map are tabs.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Panel
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/mixin/Responsive
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/model/ProjectModelEnterprise#event-dataReady
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
            // The card shows the opening turbine from the first paint, so the rail keeps its layout while start() runs
            state    = new AppState({ selectedTurbine : openingTurbine }),
            { site } = dispatch;

        // Not `state`: that is the widget's own Stateful state
        Object.assign(me, { dispatch, appState : state });

        super.construct({ ...config, items : me.itemsConfig(config.data, site) });

        // The app's parts by ref, kept from here on: moving the halves into the tab panel and back (PhoneLayout) takes
        // their widgets out of the container's own widgetMap
        me.parts = { ...me.widgetMap };

        const { scheduler, board, map, tray, schedulePane, notice, main, tabs, column, side } = me.parts;

        me.phoneLayout     = new PhoneLayout({
            main,
            tabs,
            halves : [column, side],
            views  : [scheduler, board, schedulePane, side]
        });

        me.forecastPlanner = new ForecastPlanner({ dispatch, project : scheduler.project, trips : () => me.trips });
        me.dropController  = new DropController({
            dispatch,
            scheduler,
            state,
            onBooked : booked => me.onTeamBooked(booked)
        });
        me.drag            = new TeamDrag({
            tray,
            scheduler,
            board,
            handler : me.dropController,
            showDay : () => me.showDayForKeyboard()
        });
        me.mapLink         = new MapLink({ map, scheduler, focusTrip : () => state.held?.trip ?? me.selectedTrip });

        // What the views follow: the plan as the engine placed it, the dispatch state and the app state. Several
        // changes made together redraw once (`buffer`)
        scheduler.project.on({ dataReady : 'onPlanReady', buffer : 1, thisObj : me });
        dispatch.on({ change : 'onDispatchChange', buffer : 1, thisObj : me });
        state.on({ change : 'refreshSide', buffer : 1, thisObj : me });
        state.on({ change : 'onStateChange', thisObj : me });
        // The trip selected is the Scheduler's own state
        scheduler.on({ eventSelectionChange : 'refreshSide', buffer : 1, thisObj : me });

        // The crews waiting at the port are the dispatch state's store
        tray.store = dispatch.waitingStore;
        board.on({ dayClick : ({ index }) => me.openDay(index) });
        scheduler.on({
            eventSelectionChange : 'onTripSelectionChange',
            eventClick           : 'onTripClick',
            afterEventDrop       : 'onTripDrop',
            tripTimeChange       : 'onTripTimeChange',
            thisObj              : me
        });
        map.on({ selectionChange : 'onTurbineSelectionChange', wholeFarm : 'onWholeFarm', thisObj : me });
        schedulePane.on({ forecast : 'applyForecast', thisObj : me });
        notice.on({ undo : 'undoForecast', review : 'reviewNext', thisObj : me });

        // The no-go ranges and the now line follow from the dispatch state alone, the rest of the views is drawn once
        // the engine has placed the plan (start)
        scheduler.refreshDispatch();
        // The responsive state may have been set before the items existed
        me.updatePhone(Boolean(me.phone));
    }

    // The header, the schedule half and the map half, and the tab panel that holds the two halves on a phone
    itemsConfig(data, site) {
        const me = this;

        return {
            // The header: the site and the crews waiting over the schedule, the counts over the map
            kpis : { type : 'kpibar', port : site.portShort ?? site.port },
            // On a phone the schedule and the map are its tabs (updatePhone)
            tabs : {
                type : 'phonetabs',
                onTabChange({ activeItem }) {
                    me.tab = me.phoneLayout.tabOf(activeItem);
                }
            },
            main : {
                type   : 'container',
                cls    : 'ow-main',
                flex   : 1,
                layout : 'hbox',
                items  : {
                    // The schedule's card. On a phone this is the Schedule tab
                    column : {
                        type   : 'container',
                        cls    : 'ow-left',
                        title  : 'Schedule',
                        flex   : 1,
                        layout : 'vbox',
                        items  : {
                            schedulePane : { type : 'schedulepanel', flex : 1, dispatch : me.dispatch, data }
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
        this.appState?.destroy();
        this.dispatch?.destroy();
        super.doDestroy();
    }

    get scheduler() {
        return this.parts.scheduler;
    }

    /**
     * The trips of the day shown
     * @property {TripModel[]}
     */
    get trips() {
        return this.scheduler.trips;
    }

    /**
     * The trip selected in the schedule
     * @property {TripModel|null}
     */
    get selectedTrip() {
        return this.scheduler.selectedEvents[0] ?? null;
    }

    /**
     * The team held over a trip and its check, see AppState#held
     * @property {Object|null}
     */
    get held() {
        return this.appState.held;
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

        // The turbine first: selecting its trip keeps it, as it is on the trip (onTripSelectionChange). The opening
        // selection is the page's, not the user's: the map stays on the whole farm until the user selects
        me.appState.selectedTurbine = openingTurbine;
        scheduler.selectEvent(opening);
        me.appState.mapFollows = false;

        if (state === 'forecast') {
            await me.applyForecast();
        }
        else if (state === 'drag' && me.dispatch.waitingStore.count) {
            me.drag.showHeld(me.dispatch.waitingStore.first.id, first);
        }

        await scheduler.forecastHeader.refresh();

        if (view === 'week') {
            me.parts.schedulePane.showView('week');
        }
    }

    /**
     * Opens the Day view on a day of the week, a click on the Week view's day or cell
     * @param {Number} index 0 is today
     * @returns {Promise} Resolves once drawn
     */
    async openDay(index) {
        const me = this;

        me.parts.schedulePane.showView('day');

        if (index !== me.dispatch.dayIndex) {
            me.dropController.clearPreview();
            me.scheduler.clearEventSelection();
            me.dispatch.showDay(index);
            me.scheduler.showDay();
            await me.replan();
            await me.scheduler.forecastHeader.refresh();
        }
    }

    // A team held from the keyboard while the Week view shows: the keys move it over the Day view's trips, so that
    // view is shown, and said so
    showDayForKeyboard() {
        const { dispatch, parts } = this;

        parts.schedulePane.showView('day');
        Toast.show({
            html : StringHelper.encodeHtml(`Showing the Day view, ${dispatch.dayShort}: pick a trip with the arrow keys`),
            cls  : 'ow-toast-message'
        });
    }

    //region Plan

    /**
     * Sets each trip's status from the plan as the engine placed it: past its window (even if the forecast changed it),
     * else as the forecast left it, else on plan
     */
    evaluate() {
        const { dispatch } = this;

        this.trips.forEach(trip => {
            const late = trip.endMinute > dispatch.closeOf(trip.resource);

            // A field set to its own value is no change, the trip is not redrawn
            trip.status = late ? 'at-risk' : trip.change ?? 'on-plan';
            // A trip that has left port is under way: no drag, no grab cursor (EventDrag reads the field)
            trip.draggable = trip.departs > dispatch.now && !trip.draft;
        });
    }

    // A team dropped and booked: on a trip of the Day view, its turbine and the trip selected
    onTeamBooked({ trip, turbine }) {
        const me = this;

        me.planEdited();

        if (trip) {
            me.appState.selectedTurbine = turbine;
            me.scheduler.selectEvent(trip);
        }

        return me.replan();
    }

    // The dispatcher changed the plan after a forecast: undoing the forecast now would replay its changes over records
    // that changed since, so its Undo goes
    planEdited() {
        const { forecastPlanner, parts } = this;

        if (forecastPlanner.canUndo) {
            forecastPlanner.invalidateUndo();
            parts.notice.dropUndo();
        }
    }

    /**
     * Changes the plan and lets the scheduling engine place it; the views follow the project's `dataReady`. A team
     * held over a trip has its previewed stop taken off first, so the change and the trips' status see the plan only,
     * then previewed again and checked against the plan and forecast as they are now: the trip, the map, the card and
     * the drag's tooltip never show a check made against the old ones
     * @param {Function} [change] Changes the plan, may return a Promise
     * @returns {Promise} Resolves once the engine has placed it
     */
    async replan(change) {
        const
            me                       = this,
            { held, dropController } = me,
            // The team held, to hold it again once the plan has changed
            again                    = held && { teamId : held.id, target : held.target, at : held.at };

        dropController.clearPreview();

        // Taken after the preview is cleared above: any later clear means the drag was cancelled, ended or moved on
        const generation = dropController.generation;

        await change?.();
        // The engine pushes the stops that wait for another trip, and the legs after them
        await me.scheduler.project.commitAsync();

        if (me.isDestroyed) {
            return;
        }

        me.evaluate();

        // Held again, unless the drag ended or moved on meanwhile: a cancelled preview is not brought back
        if (again && !me.held && dropController.generation === generation && me.drag?.isDragging) {
            dropController.previewDrop(again.teamId, again.target, again.at);
        }

        me.drag?.refresh();
    }

    // A trip dragged to a new departure: the engine moves its legs with it, and pushes any stop that waits for it. The
    // departure is snapped, not the trip's start at its first stop (DispatchScheduler#departsAt)
    onTripDrop({ valid, eventRecords }) {
        const
            { scheduler } = this,
            trip          = eventRecords?.[0];

        if (!valid) {
            return null;
        }

        this.planEdited();

        return this.replan(() => trip?.layout({ departs : scheduler.departsAt(trip, trip.startDate) }));
    }

    // The trip editor saved a new time on station, the trip already laid out from it
    onTripTimeChange() {
        this.planEdited();

        return this.replan();
    }

    // The engine has placed a change. While a team is held that is its previewed stop: only the map and the card
    // follow it, the plan's own counts and ranges are unchanged
    onPlanReady() {
        if (this.held) {
            this.refreshSide();
        }
        else {
            this.refreshAll();
        }
    }

    // The day, the forecast or the teams waiting changed, mostly with the plan: drawn once the engine has placed it
    async onDispatchChange() {
        await this.scheduler?.project.commitAsync();
        this.refreshAll();
    }

    /**
     * Draws everything that follows the plan and the dispatch state
     */
    refreshAll() {
        const
            me                    = this,
            { dispatch }          = me,
            { kpis, scheduler }   = me.parts ?? {};

        if (me.isDestroyed || !kpis) {
            return;
        }

        kpis.draw({ site : dispatch.site.name, day : dispatch.dayShort, kpis : dispatch.kpis(me.trips) });
        scheduler.refreshDispatch();
        me.parts.schedulePane.refreshBar();
        me.refreshSide();
    }

    /**
     * Draws the map and the selected turbine
     */
    refreshSide() {
        const
            me                             = this,
            { dispatch, appState : state } = me,
            // A team held over a cell of the Week view, or refused by a helicopter, previews nothing on the day the map
            // shows: no trip of the plan has its stop
            held                           = state.held?.trip?.isModel ? state.held : null;

        if (me.isDestroyed || !me.parts) {
            return;
        }

        me.parts.side.draw({
            state        : dispatch,
            trips        : me.trips,
            selectedTrip : me.selectedTrip,
            turbine      : held?.job.turbine ?? state.selectedTurbine,
            held,
            follow       : state.mapFollows
        });
        // The plan under the pointer may have changed
        me.mapLink.refresh();
    }

    // The chip of the team lifted is dimmed in the tray, at once
    onStateChange({ name, value }) {
        if (name === 'lifted') {
            this.parts.tray.lifted = value;
        }
    }

    // The map's tooltip on a turbine: the card's turbine at the forecast wave height, its job, team and when a trip
    // reaches it, and its rotor
    turbineTip(turbine) {
        const { dispatch, trips, held, selectedTrip } = this;

        return tipContent(tipInfo({ state : dispatch, trips, turbine, drop : held, selectedTrip }));
    }

    //endregion

    //region Forecast

    /**
     * Brings in the next forecast and re-plans the day against it
     * @returns {Promise} Resolves once the plan is placed
     */
    async applyForecast() {
        const
            me                  = this,
            { forecastPlanner } = me;

        let changes = [];

        await me.replan(async() => {
            changes = await forecastPlanner.apply();
        });

        if (changes.length) {
            me.parts.notice.draw({ ...forecastPlanner.summary(changes), changes : forecastPlanner.reviewable.length });
            me.reviewNext();
        }
    }

    // Puts back the trips as they were before the forecast. The forecast stays, the trips past it are flagged
    undoForecast() {
        const me = this;

        me.parts.notice.hidden = true;

        return me.replan(() => me.forecastPlanner.undo());
    }

    // Selects the next trip the forecast changed
    reviewNext() {
        const
            me     = this,
            change = me.forecastPlanner.nextChange();

        if (change) {
            me.appState.selectedTurbine = change.trip.turbines[0];
            me.scheduler.selectEvent(change.trip);
            me.scheduler.scrollEventIntoView(change.trip, { block : 'center', highlight : true });
        }
    }

    //endregion

    //region Selection

    // A trip selected: the map follows it, the turbine selected stays if it is on the trip, else it is the trip's first
    onTripSelectionChange({ selected }) {
        const
            { appState : state } = this,
            trip      = selected?.[0],
            current   = state.selectedTurbine;

        state.mapFollows = true;

        if (trip && !trip.allStops.some(stop => stop.turbine === current)) {
            state.selectedTurbine = trip.allStops[0]?.turbine;
        }
    }

    // A click on a stop selects its turbine. The legs let the pointer through to their trip, the stop is the one at
    // the time clicked
    onTripClick({ eventRecord, event }) {
        const
            { trip } = eventRecord,
            minute   = event && trip.minutesOf(this.scheduler.getDateFromDomEvent(event)),
            stop     = minute != null && trip.legs.find(leg => leg.type === 'stop' && !leg.preview &&
                leg.from <= minute && minute < leg.to);

        if (stop) {
            this.appState.mapFollows      = true;
            this.appState.selectedTurbine = stop.turbine;
        }
    }

    // A turbine selected on the map, by a click or the keyboard, selects its trip
    onTurbineSelectionChange({ selection, user }) {
        const
            me        = this,
            { appState : state } = me,
            turbine   = selection[0]?.id,
            trip      = tripsOf(me.trips, turbine)[0];

        if (!user || !turbine) {
            return;
        }

        state.selectedTurbine = turbine;
        state.mapFollows      = true;

        if (!trip) {
            // No trip serves it: no other trip stays selected, as if it were
            me.scheduler.clearEventSelection();
        }
        else if (!me.scheduler.isEventSelected(trip)) {
            me.scheduler.selectEvent(trip);
            me.scheduler.scrollEventIntoView(trip, { block : 'center' });
        }

        // A turbine picked on the map is already in view: the map stays where it is
        me.parts.side.keepView(me.selectedTrip, turbine, true);
    }

    // The map's Show all button (it has gone to the whole farm): the map stays there, or where the user pans or zooms
    // it, until the user selects another trip or turbine
    onWholeFarm() {
        const { appState : state } = this;

        state.mapFollows = false;
        this.parts.side.keepView(this.selectedTrip, state.held?.job.turbine ?? state.selectedTurbine, false);
    }

    //endregion

    //region The responsive layout

    // On a phone the two halves are tabs, side by side on a wider screen
    updatePhone(phone) {
        // Applied again once the halves exist, see construct
        this.phoneLayout?.apply(phone);
        this.element?.classList.toggle('ow-phone', phone);
        this.updateTab(this.tab);
    }

    updateTab(tab) {
        if (this.phone) {
            this.phoneLayout?.showTab(tab);
        }
    }

    //endregion
}

DispatchApp.initClass();
