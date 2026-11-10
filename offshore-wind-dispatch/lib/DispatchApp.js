import { Panel, Responsive } from '@bryntum/core-enterprise';
import DispatchState from './plan/DispatchState.js';
import ForecastPlanner from './plan/ForecastPlanner.js';
import DropController from './DropController.js';
import TeamDrag from './drag/TeamDrag.js';
import { tripsOf } from './feature/MapLink.js';
import { tipContent, tipInfo } from './map/TurbineCard.js';
// Also registers the widget types used below
import './TeamTray.js';
import './panel/SchedulePanel.js';
import './panel/MapPanel.js';

// The turbine the page opens on: the one the weather puts at risk
const
    openingTurbine = 'T-41',
    hbox           = { type : 'hbox', align : 'center' },
    // One of the day's counts, the figure over its label; drawn by refreshPlan
    kpi            = { type : 'widget', cls : 'ow-kpi' };

/**
 * The app: the header, the schedule and the map, wired to the plan (the Scheduler's project), the dispatch state and
 * its own view state (the turbine selected, the team held). Every change of the plan goes through `replan()`, which
 * lets the engine place it; the views redraw from the project's `dataReady`, never by hand. Below 760px wide it is a
 * `phone` (the Responsive mixin), which shows the schedule or the map, picked with a ButtonGroup.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/mixin/Responsive
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/model/ProjectModelEnterprise#event-dataReady
 */
export default class DispatchApp extends Panel.mixin(Responsive) {
    static $name = 'DispatchApp';

    static type = 'dispatchapp';

    static configurable = {
        // The parsed data/farm.json
        data : null,

        // Set by the `responsive` states
        phone : null,

        // `schedule` or `map`
        tab : 'schedule',

        // The view state; a change redraws the map and the turbine card. The card shows the opening turbine from the
        // first paint, so the side keeps its layout while start() runs
        selectedTurbine : openingTurbine,

        // The map fits itself to the selected trip or turbine. Off until the user selects one, and after Show all
        mapFollows : false,

        // The ID of the team dragged from the tray
        lifted : null,

        /**
         * The team held and its check, `{ id, target, trip, team, job, result, reach, close, at }`
         * (DropController#previewDrop), `null` while it is over nothing
         * @prp {Object|null}
         */
        held : null,

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

        me.dispatch = dispatch;

        super.construct({ ...config, items : me.itemsConfig(config.data, site) });

        // The app's parts by ref
        me.parts = me.widgetMap;

        const { scheduler, board, map, tray, schedulePane } = me.parts;

        me.forecastPlanner = new ForecastPlanner({ dispatch, project : scheduler.project, trips : () => me.trips });
        me.dropController  = new DropController({
            dispatch,
            scheduler,
            state    : me,
            onBooked : booked => me.onTeamBooked(booked)
        });
        me.drag            = new TeamDrag({ tray, scheduler, board, handler : me.dropController });
        scheduler.features.mapLink.setConfig({ map, focusTrip : () => me.held?.trip ?? me.selectedTrip });

        // Several changes made together redraw once (`buffer`)
        scheduler.project.on({ dataReady : 'onPlanReady', buffer : 1, thisObj : me });
        dispatch.on({ change : 'onDispatchChange', buffer : 1, thisObj : me });
        // Several view state changes made together redraw once
        me.redrawSide = me.buffer('refreshSide', 1);
        scheduler.on({ eventSelectionChange : 'refreshSide', buffer : 1, thisObj : me });

        tray.store = dispatch.waitingStore;
        board.on({ dayClick : ({ index }) => me.openDay(index) });
        scheduler.on({
            eventSelectionChange : 'onTripSelectionChange',
            eventClick           : 'onTripClick',
            afterEventDrop       : 'onTripDrop',
            tripTimeChange       : 'onTripTimeChange',
            thisObj              : me
        });
        map.on({ turbineSelect : 'onTurbineSelect', wholeFarm : 'onWholeFarm', thisObj : me });
        schedulePane.on({ forecast : 'applyForecast', thisObj : me });

        // The no-go ranges and the now line follow from the dispatch state alone, the rest of the views is drawn once
        // the engine has placed the plan (start)
        scheduler.refreshDispatch();
        // The responsive state may have been set before the items existed
        me.updatePhone(Boolean(me.phone));
    }

    itemsConfig(data, site) {
        const me = this;

        return {
            kpis : me.kpisConfig(site),
            // On a phone the schedule and the map are shown one at a time, picked here (updatePhone). Its value is the
            // half shown
            tabs : {
                type        : 'buttongroup',
                cls         : 'ow-view-toggle ow-phone-switch',
                rendition   : 'padded',
                toggleGroup : true,
                hidden      : true,
                margin      : '8 12',
                // As wide as the phone, a half each: `columns` fills the group with its buttons, their flex keeps them
                // on one row inside its padding, and the vbox stretches the group within its margin (`auto`, not the
                // columned group's 100%)
                columns     : 2,
                width       : 'auto',
                defaults    : { flex : 1 },
                items       : [
                    { value : 'schedule', text : 'Schedule', pressed : true },
                    { value : 'map', text : 'Map' }
                ],
                onChange({ value }) {
                    me.tab = value;
                }
            },
            main : {
                type   : 'container',
                cls    : 'ow-main',
                flex   : 1,
                layout : 'hbox',
                items  : {
                    column : {
                        type   : 'container',
                        cls    : 'ow-left',
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

    // Over the schedule the site, the day and the crews waiting; over the map the day's counts, what needs acting on
    // after a divider
    kpisConfig(site) {
        return {
            type   : 'container',
            cls    : 'ow-kpis',
            layout : hbox,
            items  : {
                lead : {
                    type   : 'container',
                    cls    : 'ow-kpis-lead',
                    flex   : 1,
                    layout : { ...hbox, justify : 'space-between' },
                    items  : {
                        clock : { type : 'widget', cls : 'ow-clock' },
                        tray  : { type : 'teamtray', port : site.portShort ?? site.port }
                    }
                },
                counts : {
                    type   : 'container',
                    cls    : 'ow-kpis-counts',
                    layout : { ...hbox, justify : 'end' },
                    items  : {
                        kpi0  : { ...kpi },
                        kpi1  : { ...kpi },
                        split : { type : 'widget', cls : 'ow-kpi-split', ariaHidden : true },
                        kpi2  : { ...kpi },
                        kpi3  : { ...kpi }
                    }
                }
            }
        };
    }

    doDestroy() {
        this.drag?.destroy();
        this.dispatch?.destroy();
        super.doDestroy();
    }

    get scheduler() {
        return this.parts.scheduler;
    }

    get trips() {
        return this.scheduler.trips;
    }

    get selectedTrip() {
        return this.scheduler.selectedEvents[0] ?? null;
    }

    updateSelectedTurbine() {
        this.redrawSide?.();
    }

    updateMapFollows() {
        this.redrawSide?.();
    }

    updateHeld(held) {
        if (this.parts) {
            this.scheduler.features.dropTarget.drop = held;
        }

        this.redrawSide?.();
    }

    // At once: the lifted card dims as the drag starts
    updateLifted(lifted) {
        if (this.parts) {
            this.parts.tray.lifted = lifted;
        }
    }

    /**
     * Shows the plan with T-41 and its trip selected, and the forecast chart drawn
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
            opening       = tripsOf(me.trips, openingTurbine)[0] ?? first;

        // No need to wait for the scheduler's `paint`: the app is constructed into the page, and a widget rendered into
        // a visible element paints as it renders. The engine's first calculation: the legs placed, the waits known
        await scheduler.project.commitAsync();
        me.evaluate();
        me.refreshPlan(true);

        // The turbine first: selecting its trip keeps it, as it is on the trip (onTripSelectionChange). The opening
        // selection is the page's, not the user's: the map stays on the whole farm until the user selects
        me.selectedTurbine = openingTurbine;
        scheduler.selectEvent(opening);
        me.mapFollows = false;

        if (state === 'forecast') {
            await me.applyForecast();
        }
        else if (state === 'drag' && me.dispatch.waitingStore.count) {
            await me.drag.showHeld(me.dispatch.waitingStore.first.id, first);
        }

        await scheduler.features.forecastHeader.refresh();

        if (view === 'week') {
            me.parts.schedulePane.showView('week');
        }
    }

    /**
     * Opens the Day view on a day of the week
     * @param {Number} index 0 is today
     * @returns {Promise} Resolves once drawn
     */
    async openDay(index) {
        const me = this;

        me.parts.schedulePane.showView('day');

        if (index !== me.dispatch.dayIndex) {
            me.scheduler.clearEventSelection();
            me.dispatch.showDay(index);
            me.scheduler.showDay();
            await me.replan();
            await me.scheduler.features.forecastHeader.refresh();
        }
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
            trip.draggable = trip.departs > dispatch.now;
        });
    }

    // `trip` is null for a new trip on a day of the Week view
    onTeamBooked({ trip, turbine }) {
        const me = this;

        me.planEdited();

        if (trip) {
            me.selectedTurbine = turbine;
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
            parts.undo.hidden = true;
        }
    }

    /**
     * Changes the plan and lets the scheduling engine place it. A team held meanwhile is checked again against the new
     * plan: no view keeps showing a check made against the old one
     * @param {Function} [change] Changes the plan, may return a Promise
     * @returns {Promise} Resolves once the engine has placed it
     */
    async replan(change) {
        const me = this;

        await change?.();
        // The engine pushes the stops that wait for another trip, and the legs after them
        await me.scheduler.project.commitAsync();

        if (!me.isDestroyed) {
            me.evaluate();
            me.drag?.refresh();
        }
    }

    // The departure is snapped, not the trip's start at its first stop (DispatchScheduler#departsAt)
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

    // The trip editor has already laid the trip out from its new time on station
    onTripTimeChange() {
        this.planEdited();

        return this.replan();
    }

    // The engine has placed a change
    onPlanReady() {
        this.refreshPlan();
    }

    // The day or the forecast changed, mostly with the plan: drawn once the engine has placed it, the weather too
    async onDispatchChange() {
        await this.scheduler?.project.commitAsync();
        this.refreshPlan(true);
    }

    // The header's counts, the schedule and the map. `weather` also the time axis rows and the no-go ranges
    refreshPlan(weather = false) {
        const
            me                    = this,
            { dispatch }          = me,
            { clock, scheduler }  = me.parts ?? {};

        if (me.isDestroyed || !clock) {
            return;
        }

        clock.html = [{ tag : 'b', text : dispatch.site.name }, { tag : 'small', text : dispatch.dayShort }];
        dispatch.kpis(me.trips).forEach(({ label, value, tone }, index) => {
            const widget = me.parts[`kpi${index}`];

            widget.html = [{ tag : 'b', text : String(value) }, { tag : 'small', text : label }];
            // `warn` past the window, `stop` stopped: tinted while above zero
            tone && widget.element.classList.toggle(`ow-kpi-${tone}`, value > 0);
        });
        // The forecast's notice is about the day it re-planned
        me.parts.notice.hidden = !me.forecastPlanner?.changes.length || me.forecastPlanner.day !== dispatch.dayIndex;
        weather ? scheduler.refreshDispatch() : scheduler.refreshPlan();
        me.parts.schedulePane.refreshBar();
        me.refreshSide();
    }

    // The map and the turbine card
    refreshSide() {
        const
            me   = this,
            // A team held over a cell of the Week view is not on the day the map shows
            held = me.held?.target.isWeekCell ? null : me.held;

        if (me.isDestroyed || !me.parts) {
            return;
        }

        me.parts.side.draw({
            state        : me.dispatch,
            trips        : me.trips,
            selectedTrip : me.selectedTrip,
            turbine      : held?.job.turbine ?? me.selectedTurbine,
            held,
            follow       : me.mapFollows
        });
        // The plan under the pointer may have changed
        me.scheduler.features.mapLink.refresh();
    }

    turbineTip(turbine) {
        const { dispatch, trips, held, selectedTrip } = this;

        return tipContent(tipInfo({ state : dispatch, trips, turbine, drop : held, selectedTrip }));
    }

    //endregion

    //region Forecast

    async applyForecast() {
        const
            me                  = this,
            { forecastPlanner } = me;

        let changes = [];

        await me.replan(async() => {
            changes = await forecastPlanner.apply();
        });

        if (changes.length) {
            me.parts.schedulePane.showNotice({
                ...forecastPlanner.summary(changes),
                changes : forecastPlanner.reviewable.length
            });
            me.reviewNext();
        }
    }

    // Puts back the trips as they were before the forecast. The forecast stays, the trips past it are flagged
    undoForecast() {
        const me = this;

        me.parts.notice.hidden = true;

        return me.replan(() => me.forecastPlanner.undo());
    }

    reviewNext() {
        const
            me     = this,
            change = me.forecastPlanner.nextChange();

        if (change) {
            me.selectedTurbine = change.trip.turbines[0];
            me.scheduler.selectEvent(change.trip);
            me.scheduler.scrollEventIntoView(change.trip, { block : 'center', highlight : true });
        }
    }

    //endregion

    //region Selection

    // The turbine selected stays if it is on the trip, else it is the trip's first
    onTripSelectionChange({ selected }) {
        const trip = selected?.[0];

        this.mapFollows = true;

        if (trip && !trip.stopRecords.some(stop => stop.turbine === this.selectedTurbine)) {
            this.selectedTurbine = trip.stopRecords[0]?.turbine;
        }
    }

    // A click on a stop selects its turbine. The legs let the pointer through to their trip, the stop is the one at
    // the time clicked
    onTripClick({ eventRecord, event }) {
        const
            { trip } = eventRecord,
            date     = event && this.scheduler.getDateFromDomEvent(event),
            stop     = date && trip.stopRecords.find(leg => leg.startDate <= date && date < leg.endDate);

        if (stop) {
            this.mapFollows      = true;
            this.selectedTurbine = stop.turbine;
        }
    }

    // A turbine picked on the map
    onTurbineSelect({ turbine }) {
        const
            me   = this,
            trip = tripsOf(me.trips, turbine)[0];

        me.selectedTurbine = turbine;
        me.mapFollows      = true;

        if (!trip) {
            // No trip serves it: no other trip may stay selected as if it did
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
        this.mapFollows = false;
        this.parts.side.keepView(this.selectedTrip, this.held?.job.turbine ?? this.selectedTurbine, false);
    }

    //endregion

    //region The responsive layout

    // Side by side, or on a phone one half at a time (updateTab). The halves stay where they are, only their size and
    // visibility change. Applied again once the halves exist, see construct
    updatePhone(phone) {
        const { parts } = this;

        this.element?.classList.toggle('ow-phone', phone);

        if (parts) {
            const { scheduler, board, schedulePane, side, tabs } = parts;

            [scheduler, board, schedulePane, side].forEach(view => view.phone = phone);
            side.flex   = phone ? 1 : null;
            side.width  = phone ? null : 400;
            tabs.hidden = !phone;
            this.updateTab(this.tab);
        }
    }

    // `schedule` or `map`: the half shown on a phone
    updateTab(tab) {
        const { parts, phone } = this;

        if (parts) {
            parts.column.hidden = phone && tab === 'map';
            parts.side.hidden   = phone && tab !== 'map';
            parts.tabs.value    = tab;
        }
    }

    //endregion
}

DispatchApp.initClass();
