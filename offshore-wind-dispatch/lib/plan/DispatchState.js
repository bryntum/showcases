import { closingTimes, valueAt } from './Weather.js';
import { firstSailing } from './Farm.js';
import { weekPlan } from './WeekPlan.js';
import { parseTime } from '../util/Time.js';

/**
 * What the dispatcher knows apart from the trips: the site, the forecasts and the weather windows they give, the
 * teams and their jobs, and the clock. The trips live in the Scheduler's event store, the views read both.
 *
 * The page opens at 07:40 with the 06:00 forecast. When the 08:00 forecast comes in (`applyForecast`), the clock
 * moves to when it was received and the windows close where the new forecast says, the previous closing times are
 * kept to show what changed.
 *
 * The week (WeekPlan) gives each of the next six days a forecast of its own. The Day view shows one day at a time
 * (`showDay`): the forecast, the windows, the clock and the dependencies are that day's. A later day is planned
 * before it starts, its clock stands at the start of the day.
 */
export default class DispatchState {
    /**
     * @param {Object} data The parsed data/farm.json
     */
    constructor(data) {
        const me = this;

        me.site     = data.site;
        me.limits   = data.limits;
        me.vessels  = data.vessels;
        me.teams    = new Map(data.teams.map(team => [team.id, team]));
        me.week     = weekPlan(data);
        // Today's jobs, and with them the rest of the week's on a later day
        me.dayJobs  = data.jobs;
        me.allJobs  = { ...me.week.jobs, ...data.jobs };
        me.faults   = new Set(data.faults);
        // The turbines whose team waits at the port for a trip
        me.waiting  = [...data.waiting];
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
    }

    /**
     * Shows a day of the week, 0 is today
     * @param {Number} index
     */
    showDay(index) {
        this.dayIndex = index;
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
     * @property {Object[]} `{ team, job, fault }`
     */
    get waitingTeams() {
        return this.waiting.map(turbine => {
            const job = this.jobAt(turbine);

            return { team : this.teams.get(job.team), job, fault : this.faults.has(turbine) };
        });
    }

    /**
     * The turbines with work due on the day shown
     * @property {String[]}
     */
    get dueTurbines() {
        return this.dueOn(this.dayIndex);
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
