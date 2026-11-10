import { Base, DateHelper, Events, Store } from '@bryntum/core-enterprise';
import WaitingTeamModel from '../model/WaitingTeamModel.js';
import { firstSailing, substation } from './Farm.js';
import { parseTime } from '../util/Time.js';

/**
 * The hourly value of a forecast at a time, the last one past its end. A forecast holds one value per hour from
 * `dayStart`: the significant wave height (Hs, metres) and the wind at hub height (m/s)
 * @param {Number[]} series Hourly values from `dayStart`
 * @param {Number} minutes Minutes since midnight
 * @param {Number} dayStart Hour of the first value
 * @returns {Number}
 */
function valueAt(series, minutes, dayStart) {
    const index = Math.floor(minutes / 60) - dayStart;

    return series[Math.min(Math.max(index, 0), series.length - 1)];
}

/**
 * When each weather window closes, minutes since midnight: at the start of the first hour over its limit, at the end
 * of the day when it stays open. A crew transfer vessel pushes on to a boat landing up to Hs 1.5 m, a SWATH up to
 * 2.0 m, a helicopter hoists up to 20 m/s wind (data/farm.json `limits`)
 * @param {Object} forecast `{ hs, wind }`
 * @param {Object} limits By window: `ctv`, `swath`, `heli`, each `{ hs }` or `{ wind }`
 * @param {Object} day `{ dayStart, dayEnd }`, hours
 * @returns {Object} By window, minutes
 */
function closingTimes(forecast, limits, { dayStart, dayEnd }) {
    return Object.fromEntries(Object.entries(limits).map(([key, limit]) => {
        const index = forecast.hs.findIndex((hs, i) => (limit.hs ? hs > limit.hs : forecast.wind[i] > limit.wind));

        return [key, (index < 0 || dayStart + index > dayEnd ? dayEnd : dayStart + index) * 60];
    }));
}

/**
 * What the dispatcher knows apart from the trips: the site, the forecasts and the weather windows they give, the
 * teams and their jobs, and the clock. The trips live in the Scheduler's event store, the views read both.
 *
 * The page opens at 07:40 with the 06:00 forecast. When the 08:00 forecast comes in (`applyForecast`), the clock
 * moves to when it was received and the windows close where the new forecast says, the previous closing times are
 * kept to show what changed.
 *
 * The week is today and the six days after it, from the real current date: data/farm.json holds today at its top level
 * and the other days, each with its forecast, its trips and the turbines due, under `week`. The Day view shows one day
 * at a time (`dayIndex`, `showDay`): the forecast, the windows, the clock and the dependencies are that day's. A later
 * day is planned before it starts, its clock stands at the start of the day.
 *
 * The planner counts the times of the day shown in minutes since its `midnight` (Planner), the records and the
 * Scheduler in Dates, DateHelper converts between the two. `dateOf` gives a day's midnight, the day's labels
 * (`dayShort`, `nextDay`, `nextLong`) are formatted by DateHelper.
 *
 * The teams waiting at the port are a Store (`waitingStore`, WaitingTeamModel), the team tray follows it. The state
 * fires `change` when the day shown or the forecast changes, the views follow it.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/mixin/Events
 * https://bryntum.com/products/scheduler/docs/api/Core/helper/DateHelper
 */
export default class DispatchState extends Base.mixin(Events) {
    static $name = 'DispatchState';

    /**
     * Fired when the day shown or the forecast in use changes
     * @event change
     * @param {String} name `day` or `forecast`
     */

    /**
     * @param {Object} data The parsed data/farm.json
     */
    construct(data) {
        const me = this;

        super.construct();

        me.site     = data.site;
        me.limits   = data.limits;
        me.vessels  = data.vessels;
        me.teams    = new Map(data.teams.map(team => [team.id, team]));
        // Today, then the rest of the week as the data has it
        me.week     = {
            jobs : data.week.jobs,
            days : [
                {
                    forecasts : data.forecasts,
                    trips     : data.trips,
                    due       : Object.keys(data.jobs).filter(turbine => turbine !== substation)
                },
                ...data.week.days
            ]
        };
        // Today's jobs, and with them the rest of the week's on a later day
        me.dayJobs  = data.jobs;
        me.allJobs  = { ...me.week.jobs, ...data.jobs };
        me.faults   = new Set(data.faults);
        me.day      = { dayStart : data.site.dayStart, dayEnd : data.site.dayEnd };
        // Each day's own: its forecasts and the one in use, its windows, its clock, the dependencies of its plan
        me.days     = me.week.days.map(({ forecasts }, index) => ({
            forecasts,
            forecastIndex   : 0,
            now             : index ? me.day.dayStart * 60 : parseTime(data.site.now),
            windows         : closingTimes(forecasts[0], me.limits, me.day),
            previousWindows : null,
            dependencies    : index ? [] : data.dependencies
        }));
        me.dayIndex = 0;
        /**
         * The teams waiting at the port for a trip, with their job, in the order they wait
         * @member {Core.data.Store} waitingStore
         */
        me.waitingStore = new Store({
            modelClass : WaitingTeamModel,
            data       : data.waiting.map(turbine => {
                const job = me.jobAt(turbine);

                return { id : job.team, team : me.teams.get(job.team), job, fault : me.faults.has(turbine) };
            })
        });
        // Midnight of today, the first day of the week
        me.weekStart = DateHelper.clearTime(new Date());
    }

    /**
     * Midnight of a day of the week
     * @param {Number} index 0 is today
     * @returns {Date}
     */
    dateOf(index) {
        return DateHelper.add(this.weekStart, index, 'day');
    }

    /**
     * Midnight of the day shown, minute 0 of the planner's times
     * @property {Date}
     */
    get midnight() {
        return this.dateOf(this.dayIndex);
    }

    /**
     * The day shown, short, "Mon 9 Nov", for the KPI bar
     * @property {String}
     */
    get dayShort() {
        return DateHelper.format(this.midnight, 'ddd D MMM');
    }

    /**
     * Where work the weather pushes out goes, the day after the one shown, "Tue"
     * @property {String}
     */
    get nextDay() {
        return DateHelper.format(this.dateOf(this.dayIndex + 1), 'ddd');
    }

    /**
     * The day after the one shown in full, "Tuesday"
     * @property {String}
     */
    get nextLong() {
        return DateHelper.format(this.dateOf(this.dayIndex + 1), 'dddd');
    }

    /**
     * Shows a day of the week, 0 is today
     * @param {Number} index
     */
    showDay(index) {
        this.dayIndex = index;
        this.trigger('change', { name : 'day' });
    }

    /**
     * The turbines whose team waits at the port for a trip
     * @property {String[]}
     */
    get waiting() {
        return this.waitingStore.map(record => record.job.turbine);
    }

    /**
     * The first sailing of a day, minutes since midnight: the start of the working day and the farm's `firstSailing`
     * @property {Number}
     */
    get firstSailing() {
        return this.day.dayStart * 60 + firstSailing;
    }

    /**
     * Today is the day shown
     * @property {Boolean}
     */
    get isToday() {
        return this.dayIndex === 0;
    }

    /**
     * The jobs by turbine: today's, and the week's on a later day
     * @property {Object}
     */
    get jobs() {
        return this.isToday ? this.dayJobs : this.allJobs;
    }

    // The day shown's own state
    get current() {
        return this.days[this.dayIndex];
    }

    get forecasts() {
        return this.current.forecasts;
    }

    get forecastIndex() {
        return this.current.forecastIndex;
    }

    set forecastIndex(value) {
        this.current.forecastIndex = value;
    }

    /**
     * The time, minutes since midnight. The start of the day on a later day
     * @property {Number}
     */
    get now() {
        return this.current.now;
    }

    set now(value) {
        this.current.now = value;
    }

    /**
     * When each window closes, by window: `ctv`, `swath`, `heli`, minutes since midnight
     * @property {Object}
     */
    get windows() {
        return this.current.windows;
    }

    set windows(value) {
        this.current.windows = value;
    }

    get previousWindows() {
        return this.current.previousWindows;
    }

    set previousWindows(value) {
        this.current.previousWindows = value;
    }

    /**
     * The dependencies of the plan of the day shown
     * @property {Object[]}
     */
    get dependencies() {
        return this.current.dependencies;
    }

    /**
     * The forecast in use, `{ issued, hs, wind }`
     * @property {Object}
     */
    get forecast() {
        return this.forecastOf(this.dayIndex);
    }

    /**
     * The forecast in use on a day of the week
     * @param {Number} index 0 is today
     * @returns {Object} `{ issued, hs, wind }`
     */
    forecastOf(index) {
        const { forecasts, forecastIndex } = this.days[index];

        return forecasts[forecastIndex];
    }

    /**
     * When each window closes on a day of the week
     * @param {Number} index 0 is today
     * @returns {Object} By window, minutes since midnight
     */
    windowsOf(index) {
        return this.days[index].windows;
    }

    /**
     * A newer forecast is waiting to be applied
     * @property {Object|null}
     */
    get nextForecast() {
        return this.forecasts[this.forecastIndex + 1] ?? null;
    }

    /**
     * The forecast in use replaced the one the day was planned on
     * @property {Boolean}
     */
    get isUpdated() {
        return this.forecastIndex > 0;
    }

    /**
     * Takes the next forecast: the windows close where it says, the clock moves to when it was received
     */
    applyForecast() {
        const me = this;

        me.previousWindows = me.windows;
        me.forecastIndex++;
        me.windows = closingTimes(me.forecast, me.limits, me.day);
        me.now     = parseTime(me.forecast.received ?? me.forecast.issued);
        me.trigger('change', { name : 'forecast' });
    }

    /**
     * When the window of a vessel closes
     * @param {VesselModel|Object} vessel
     * @returns {Number} Minutes since midnight
     */
    closeOf(vessel) {
        return this.windows[vessel?.window ?? 'ctv'];
    }

    /**
     * The wave height at a time
     * @param {Number} minutes
     * @returns {Number}
     */
    hsAt(minutes) {
        return valueAt(this.forecast.hs, minutes, this.day.dayStart);
    }

    /**
     * The wind at hub height at a time, now by default
     * @param {Number} [minutes]
     * @returns {Number} m/s
     */
    windAt(minutes = this.now) {
        return valueAt(this.forecast.wind, minutes, this.day.dayStart);
    }

    /**
     * The job at a turbine, with the turbine and the minutes it takes
     * @param {String} turbine
     * @returns {Object|null} `{ turbine, job, team, certs, minutes }`
     */
    jobAt(turbine) {
        const job = this.jobs[turbine];

        return job ? { turbine, minutes : 60, ...job } : null;
    }

    /**
     * The teams waiting at the port with their job, and whether its turbine is stopped
     * @property {WaitingTeamModel[]} `{ team, job, fault }`
     */
    get waitingTeams() {
        return this.waitingStore.records;
    }

    /**
     * The turbines with work due on the day shown
     * @property {String[]}
     */
    get dueTurbines() {
        return this.dueOn(this.dayIndex);
    }

    /**
     * The day's counts of the KPI header (KpiBar): turbines due, turbines on a trip, either the trips past their window
     * (when any) or the turbines a forecast moved to the next day, and the turbines stopped
     * @param {TripModel[]} trips The trips of the day shown
     * @returns {Object[]} `{ label, value, tone }`
     */
    kpis(trips) {
        const
            assigned = new Set(trips.filter(trip => trip.status !== 'moved').flatMap(trip => trip.turbines)),
            moved    = new Set(trips.flatMap(trip => trip.status === 'moved' ? trip.turbines : trip.removed ?? [])),
            atRisk   = trips.filter(trip => trip.status === 'at-risk').length;

        return [
            { label : this.isToday ? 'Due today' : 'Due', value : this.dueTurbines.length },
            { label : 'Assigned', value : assigned.size },
            // One slot: trips past their window need acting on now, so they win over what a forecast already moved
            atRisk || !moved.size ?
                { label : 'At risk', value : atRisk, tone : 'warn' } :
                { label : `Moved to ${this.nextDay}`, value : moved.size, tone : 'alert' },
            { label : 'Stopped', value : this.faults.size, tone : 'stop' }
        ];
    }

    /**
     * The turbines with work due on a day of the week
     * @param {Number} index 0 is today
     * @returns {String[]}
     */
    dueOn(index) {
        return this.week.days[index].due;
    }
}

DispatchState.initClass();
