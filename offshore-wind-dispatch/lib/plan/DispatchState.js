import { closingTimes, valueAt } from './Weather.js';
import { substation } from './Farm.js';
import { parseTime } from '../util/Time.js';

/**
 * What the dispatcher knows apart from the trips: the site, the forecasts and the weather windows they give, the
 * teams and their jobs, and the clock. The trips live in the Scheduler's event store, the views read both.
 *
 * The page opens at 07:40 with the 06:00 forecast. When the 08:00 forecast comes in (`applyForecast`), the clock
 * moves to when it was received and the windows close where the new forecast says, the previous closing times are
 * kept to show what changed.
 */
export default class DispatchState {
    /**
     * @param {Object} data The parsed data/farm.json
     */
    constructor(data) {
        const me = this;

        me.site            = data.site;
        me.limits          = data.limits;
        me.forecasts       = data.forecasts;
        me.vessels         = data.vessels;
        me.dependencies    = data.dependencies;
        me.teams           = new Map(data.teams.map(team => [team.id, team]));
        me.jobs            = data.jobs;
        me.faults          = new Set(data.faults);
        // The turbines whose team waits at the port for a trip
        me.waiting         = [...data.waiting];
        me.day             = { dayStart : data.site.dayStart, dayEnd : data.site.dayEnd };
        me.forecastIndex   = 0;
        me.now             = parseTime(data.site.now);
        me.windows         = closingTimes(me.forecast, me.limits, me.day);
        me.previousWindows = null;
    }

    /**
     * The forecast in use, `{ issued, hs, wind }`
     * @property {Object}
     */
    get forecast() {
        return this.forecasts[this.forecastIndex];
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
     * When the window of a vessel closed in the previous forecast, if it was different
     * @param {VesselModel|Object} vessel
     * @returns {Number|null}
     */
    previousCloseOf(vessel) {
        const was = this.previousWindows?.[vessel?.window];

        return was != null && was !== this.closeOf(vessel) ? was : null;
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
     * The teams waiting at the port with their job
     * @property {Object[]} `{ team, job }`
     */
    get waitingTeams() {
        return this.waiting.map(turbine => {
            const job = this.jobAt(turbine);

            return { team : this.teams.get(job.team), job };
        });
    }

    /**
     * The turbines with work due today
     * @property {String[]}
     */
    get dueTurbines() {
        return Object.keys(this.jobs).filter(turbine => turbine !== substation);
    }
}
