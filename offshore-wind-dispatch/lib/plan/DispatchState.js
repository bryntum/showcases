import { Base, DateHelper, Events, Store } from '@bryntum/core-enterprise';
import WaitingTeamModel from '../model/WaitingTeamModel.js';
import { firstSailing, substation } from './Farm.js';
import { parseTime } from '../util/Time.js';

// A forecast series holds one value per hour from the hour `dayStart`; past its end the last one holds
function valueAt(series, minutes, dayStart) {
    const index = Math.floor(minutes / 60) - dayStart;

    return series[Math.min(Math.max(index, 0), series.length - 1)];
}

/**
 * When each weather window closes, minutes since midnight: at the start of the first hour over its limit, at the end
 * of the day when it stays open
 * @param {Object} forecast `{ hs, wind }`, hourly Hs in metres and wind in m/s
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
 * What the dispatcher knows apart from the trips: the site, the forecasts and their weather windows, the teams waiting
 * and the clock, for each day of the week (today and the six after it, from the real current date). Most getters read
 * the day shown (`dayIndex`); times are minutes since that day's `midnight`. On a later day the clock stands at the
 * start of the day. Fires `change` with `name` `day` or `forecast`.
 *
 * Learn more:
 * https://bryntum.com/docs/api/Core/mixin/Events
 * https://bryntum.com/docs/api/Core/Base
 */
export default class DispatchState extends Base.mixin(Events) {
    static $name = 'DispatchState';

    static configurable = {
        /**
         * The day shown, 0 is today, kept within the week. Each day keeps its own forecast in use
         * @prp {Number}
         */
        dayIndex : 0,

        /**
         * The forecast in use on the day shown, 0 is the one the day was planned on, kept within the day's forecasts.
         * Setting it moves the day's weather windows and its clock (the old windows are kept to show what changed)
         * @prp {Number}
         */
        forecastIndex : 0
    };

    // `data` is the parsed data/farm.json. Read before the configs are applied: they are kept within the days
    construct(data) {
        const me = this;

        me.site     = data.site;
        me.limits   = data.limits;
        me.vessels  = data.vessels;
        me.teams    = new Map(data.teams.map(team => [team.id, team]));
        // data/farm.json holds today at its top level, the six days after it under `week`
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
        me.dayJobs  = data.jobs;
        me.allJobs  = { ...me.week.jobs, ...data.jobs };
        me.faults   = new Set(data.faults);
        me.day      = { dayStart : data.site.dayStart, dayEnd : data.site.dayEnd };
        // Each day's own state, read through the getters below for the day shown
        me.days     = me.week.days.map(({ forecasts }, index) => ({
            forecasts,
            forecastIndex   : 0,
            now             : index ? me.day.dayStart * 60 : parseTime(data.site.now),
            windows         : closingTimes(forecasts[0], me.limits, me.day),
            previousWindows : null
        }));
        // Tracked by the project's STM during a forecast's re-plan (ForecastPlanner), so its Undo restores it too
        me.waitingStore = new Store({
            modelClass : WaitingTeamModel,
            data       : data.waiting.map(turbine => me.waitingOf(turbine))
        });
        me.weekStart = DateHelper.clearTime(new Date());

        super.construct();
    }

    changeDayIndex(index) {
        return Math.min(Math.max(index, 0), this.days.length - 1);
    }

    // The day's own forecast; no `forecast` change, the day already has it (updateForecastIndex)
    updateDayIndex(index) {
        this.forecastIndex = this.days[index].forecastIndex;

        if (!this.isConfiguring) {
            this.trigger('change', { name : 'day' });
        }
    }

    changeForecastIndex(index) {
        return Math.min(Math.max(index, 0), this.current.forecasts.length - 1);
    }

    // The clock moves to when the forecast was received
    updateForecastIndex(index) {
        const
            me          = this,
            { current } = me,
            forecast    = current.forecasts[index];

        if (index !== current.forecastIndex) {
            Object.assign(current, {
                forecastIndex   : index,
                previousWindows : current.windows,
                windows         : closingTimes(forecast, me.limits, me.day),
                now             : parseTime(forecast.received ?? forecast.issued)
            });
            me.trigger('change', { name : 'forecast' });
        }
    }

    // Midnight of a day of the week, 0 is today
    dateOf(index) {
        return DateHelper.add(this.weekStart, index, 'day');
    }

    // Minute 0 of the planner's times
    get midnight() {
        return this.dateOf(this.dayIndex);
    }

    // Minutes since midnight of the day shown as a Date
    dateAt(minutes) {
        return DateHelper.add(this.midnight, minutes, 'minute');
    }

    get dayShort() {
        return DateHelper.format(this.midnight, 'ddd D MMM');
    }

    get nextDay() {
        return DateHelper.format(this.dateOf(this.dayIndex + 1), 'ddd');
    }

    get nextLong() {
        return DateHelper.format(this.dateOf(this.dayIndex + 1), 'dddd');
    }

    /**
     * The data of a waiting store record for the team of a turbine's job
     * @param {String} turbine
     * @param {Object} [options] `{ id, minutes }`: the record's ID (the team's by default), and the job's minutes
     * when a cut stop has them
     * @returns {Object} `{ id, team, job, fault }`
     */
    waitingOf(turbine, { id, minutes } = {}) {
        const job = { turbine, minutes : 60, ...this.allJobs[turbine], ...(minutes && { minutes }) };

        return { id : id ?? job.team, team : this.teams.get(job.team), job, fault : this.faults.has(turbine) };
    }

    get waiting() {
        return this.waitingStore.map(record => record.job.turbine);
    }

    // Minutes since midnight
    get firstSailing() {
        return this.day.dayStart * 60 + firstSailing;
    }

    get isToday() {
        return this.dayIndex === 0;
    }

    // By turbine. A later day sees the week's jobs as well as today's
    get jobs() {
        return this.isToday ? this.dayJobs : this.allJobs;
    }

    // The day shown's own state
    get current() {
        return this.days[this.dayIndex];
    }

    // Minutes since midnight
    get now() {
        return this.current.now;
    }

    // By window, `ctv`, `swath`, `heli`, minutes since midnight
    get windows() {
        return this.current.windows;
    }

    // The windows of the forecast before the one in use, null on the forecast the day was planned on
    get previousWindows() {
        return this.current.previousWindows;
    }

    // `{ issued, received, hs, wind }`
    get forecast() {
        return this.forecastOf(this.dayIndex);
    }

    forecastOf(index) {
        const { forecasts, forecastIndex } = this.days[index];

        return forecasts[forecastIndex];
    }

    windowsOf(index) {
        return this.days[index].windows;
    }

    get nextForecast() {
        return this.current.forecasts[this.forecastIndex + 1] ?? null;
    }

    // The forecast in use replaced the one the day was planned on
    get isUpdated() {
        return this.forecastIndex > 0;
    }

    // The next forecast in use on the day shown, see updateForecastIndex
    applyForecast() {
        this.forecastIndex++;
    }

    // Minutes since midnight
    closeOf(vessel) {
        return this.windows[vessel?.window ?? 'ctv'];
    }

    hsAt(minutes) {
        return valueAt(this.forecast.hs, minutes, this.day.dayStart);
    }

    // Metres per second, at hub height
    windAt(minutes = this.now) {
        return valueAt(this.forecast.wind, minutes, this.day.dayStart);
    }

    // `{ turbine, job, team, certs, minutes }`
    jobAt(turbine) {
        const job = this.jobs[turbine];

        return job ? { turbine, minutes : 60, ...job } : null;
    }

    get waitingTeams() {
        return this.waitingStore.records;
    }

    /**
     * A day's work, counted the same for the KPI header and the Week view: the turbines due, the ones its trips visit
     * (`planned`) and its trips past their window. Work booked or carried over onto the day is due on it too
     * @param {Number} index 0 is today
     * @param {TripModel[]} trips The trips of that day
     * @returns {Object} `{ due, planned, atRisk }`
     */
    daySummary(index, trips) {
        const planned = new Set(trips.flatMap(trip => trip.turbines));

        return {
            due     : new Set([...this.dueOn(index), ...planned]).size,
            planned : planned.size,
            atRisk  : trips.filter(trip => trip.status === 'at-risk').length
        };
    }

    /**
     * The counts of the KPI header
     * @param {TripModel[]} trips The trips of the day shown
     * @returns {Object[]} `{ label, value, tone }`
     */
    kpis(trips) {
        const { due, planned, atRisk } = this.daySummary(this.dayIndex, trips);

        return [
            { label : this.isToday ? 'Due today' : 'Due', value : due },
            { label : 'Assigned', value : planned },
            { label : 'At risk', value : atRisk, tone : 'warn' },
            { label : 'Stopped', value : this.faults.size, tone : 'stop' }
        ];
    }

    /**
     * The trips back after their window closes, the latest first. Their status is set once the engine has placed them
     * (DispatchApp#evaluate)
     * @param {TripModel[]} trips The trips of the day shown
     * @returns {Object[]} `{ trip, late }`, `late` in minutes
     */
    lateTrips(trips) {
        return trips
            .filter(trip => trip.status === 'at-risk')
            .map(trip => ({ trip, late : trip.endMinute - this.closeOf(trip.resource) }))
            .sort((a, b) => b.late - a.late);
    }

    dueOn(index) {
        return this.week.days[index].due;
    }
}

DispatchState.initClass();
