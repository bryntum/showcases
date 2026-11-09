import { substation } from '../plan/Farm.js';
import { dayDate, duration, hhmm, minutesOn } from '../util/Time.js';

/**
 * The week as a day board, plain functions from the week's trips and the dispatch state to the Week view's data
 * (WeekBoard): one cell per vessel per day. A day a vessel has trips is ONE derived event over them, from the earliest
 * departure to the latest return, so cells never stack; a day without is a whole-day resource time range, `No-go` when
 * its window never opens, else `Free` until its window closes.
 */

const
    minuteMs = 60_000,
    dayCount = 7;

/**
 * A time of a day of the week as a date
 * @param {Number} index 0 is today
 * @param {Number} minutes Minutes since that day's midnight
 * @returns {Date}
 */
export function dateOn(index, minutes) {
    return new Date(dayDate(index).getTime() + minutes * minuteMs);
}

/**
 * The day of the week a date is on
 * @param {Date} date
 * @returns {Number} 0 is today, -1 or 7 outside the week
 */
export function dayOf(date) {
    return Math.max(-1, Math.min(dayCount, Math.floor(minutesOn(date, 0) / (24 * 60))));
}

/**
 * "Go until 14", "No CTV", "Go · all day": the crew transfer vessels' window of a day
 * @param {Number} close When it closes, minutes since midnight
 * @param {Object} day `{ dayStart, dayEnd }`
 * @returns {Object} `{ text, tone }`, tone `go`, `short` or `none`
 */
export function seaState(close, { dayStart, dayEnd }) {
    if (close <= dayStart * 60) {
        return { text : 'No CTV', tone : 'none' };
    }

    if (close >= dayEnd * 60) {
        return { text : 'Go · all day', tone : 'go' };
    }

    return { text : `Go until ${hourText(close)}`, tone : 'short' };
}

// "14" on the hour, else "14:30"
function hourText(minutes) {
    return minutes % 60 ? hhmm(minutes) : String(minutes / 60);
}

/**
 * A trip of the week on its own day: when it leaves port and is back, minutes since that day's midnight
 * @param {TripModel} trip
 * @returns {Object} `{ departs, back }`
 */
function timesOf(trip) {
    const departs = minutesOn(trip.startDate, trip.day) - trip.transits.out;

    // The trip's length does not depend on the day shown
    return { departs, back : departs + trip.endMinute - trip.departs };
}

/**
 * The days of the week, for the header and the summary
 * @param {DispatchState} state
 * @param {TripModel[]} trips The trips of the whole week
 * @returns {Object[]} `{ index, date, sea, hs, wind, due, planned }`
 */
export function weekDays(state, trips) {
    return Array.from({ length : dayCount }, (_, index) => {
        const
            { hs, wind } = state.forecastOf(index),
            planned      = new Set(trips.filter(trip => trip.day === index && trip.change !== 'moved' && !trip.draft)
                .flatMap(trip => trip.turbines));

        return {
            index,
            date    : dayDate(index),
            sea     : seaState(state.windowsOf(index).ctv, state.day),
            hs      : [Math.min(...hs), Math.max(...hs)],
            wind    : Math.max(...wind),
            due     : state.dueOn(index).length,
            planned : planned.size
        };
    });
}

/**
 * The Week view's data: a cell event per vessel and day with trips, a resource time range per vessel and day without
 * @param {DispatchState} state
 * @param {Object[]} vessels `{ id, window, seats }`
 * @param {TripModel[]} trips The trips of the whole week
 * @returns {Object} `{ events, ranges }`
 */
export function weekCells(state, vessels, trips) {
    const
        events = [],
        ranges = [];

    for (let index = 0; index < dayCount; index++) {
        const
            windows = state.windowsOf(index),
            open    = state.day.dayStart * 60,
            end     = state.day.dayEnd * 60;

        for (const vessel of vessels) {
            const
                close = windows[vessel.window],
                own   = trips.filter(trip => trip.day === index && trip.resource?.id === vessel.id &&
                    trip.change !== 'moved' && !trip.draft),
                id    = `${vessel.id}:${index}`;

            if (own.length) {
                const
                    times    = own.map(timesOf),
                    departs  = Math.min(...times.map(time => time.departs)),
                    back     = Math.max(...times.map(time => time.back)),
                    // Each turbine once, the substation by its name: a helicopter's drop-off and pick-up are one visit
                    turbines = [...new Set(own.flatMap(trip => trip.stops.map(stop => stop.turbine)))],
                    pax      = Math.max(...own.map(trip => trip.pax));

                events.push({
                    id,
                    resourceId  : vessel.id,
                    day         : index,
                    startDate   : dateOn(index, departs),
                    endDate     : dateOn(index, back),
                    name        : `${hhmm(departs)}–${hhmm(back)}`,
                    trips       : own.map(trip => trip.id).join(' '),
                    turbines    : turbines.map(turbine => (turbine === substation ? 'OSS' : turbine)).join(' '),
                    pax,
                    seats       : vessel.seats,
                    late        : Math.max(0, back - close),
                    // The seats bar, the PercentBar feature's value
                    percentDone : Math.round(pax / vessel.seats * 100)
                });
            }
            else {
                const free = close > open;

                ranges.push({
                    id,
                    resourceId : vessel.id,
                    day        : index,
                    startDate  : dateOn(index, 0),
                    endDate    : dateOn(index + 1, 0),
                    kind       : free ? 'free' : 'nogo',
                    name       : free ? `Free · ${close >= end ? 'all day' : `until ${hourText(close)}`}` : 'No-go'
                });
            }
        }
    }

    return { events, ranges };
}

/**
 * How late a cell's last return is, "+17 min"
 * @param {Number} late Minutes
 * @returns {String}
 */
export function lateText(late) {
    return `+${duration(late)}`;
}
