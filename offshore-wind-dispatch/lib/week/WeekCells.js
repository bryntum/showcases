import { substation } from '../plan/Farm.js';
import { DateHelper } from '@bryntum/core-enterprise';
import { duration, hhmm } from '../util/Time.js';

/**
 * The week as a day board, plain functions from the week's trips and the dispatch state to the Week view's data
 * (WeekBoard): one cell per vessel per day. A day a vessel has trips is ONE derived event over them, from the earliest
 * departure to the latest return, so cells never stack, a trip moved to tomorrow on the day it went to (workDayOf); a
 * day without is a whole-day resource time range, `No-go` when its window never opens, else `Free` until its window
 * closes.
 */

const dayCount = 7;

/**
 * The day a trip's work is on: its own, or the next one for a trip a forecast moved to tomorrow. The trip keeps its
 * record and its day in the plan (the Day view shows it greyed where it was, the forecast's Undo puts it back); the
 * week shows its work where it went, at the same times
 * @param {TripModel} trip
 * @returns {Number}
 */
function workDayOf(trip) {
    return trip.change === 'moved' ? trip.day + 1 : trip.day;
}

/**
 * The day of the week a date is on
 * @param {DispatchState} state
 * @param {Date} date
 * @returns {Number} 0 is today, -1 or 7 outside the week
 */
export function dayOf(state, date) {
    return Math.max(-1, Math.min(dayCount, Math.floor(DateHelper.diff(state.dateOf(0), date, 'day', true))));
}

/**
 * "Go until 14", "No CTV", "Go · all day": the crew transfer vessels' window of a day
 * @param {Number} close When it closes, minutes since midnight
 * @param {Object} day `{ dayStart, dayEnd }`
 * @returns {Object} `{ text, tone }`, tone `go`, `short` or `none`
 */
function seaState(close, { dayStart, dayEnd }) {
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
 * The days of the week, for the header and the summary
 * @param {DispatchState} state
 * @param {TripModel[]} trips The trips of the whole week
 * @returns {Object[]} `{ index, date, sea, hs, wind, due, planned }`
 */
export function weekDays(state, trips) {
    return Array.from({ length : dayCount }, (_, index) => {
        const
            { hs, wind } = state.forecastOf(index),
            planned      = new Set(trips.filter(trip => workDayOf(trip) === index && !trip.draft)
                .flatMap(trip => trip.turbines));

        return {
            index,
            date    : state.dateOf(index),
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
                own   = trips.filter(trip => workDayOf(trip) === index && trip.resource?.id === vessel.id &&
                    !trip.draft),
                id    = `${vessel.id}:${index}`;

            if (own.length) {
                // When the first trip leaves port and the last one is back, as the engine placed them
                const
                    departs  = Math.min(...own.map(trip => trip.departs)),
                    back     = Math.max(...own.map(trip => trip.endMinute)),
                    // Each turbine once, the substation by its name: a helicopter's drop-off and pick-up are one visit
                    turbines = [...new Set(own.flatMap(trip => trip.stops.map(stop => stop.turbine)))],
                    pax      = Math.max(...own.map(trip => trip.pax));

                events.push({
                    id,
                    resourceId  : vessel.id,
                    day         : index,
                    startDate   : DateHelper.add(state.dateOf(index), departs, 'minute'),
                    endDate     : DateHelper.add(state.dateOf(index), back, 'minute'),
                    name        : `${hhmm(departs)}–${hhmm(back)}`,
                    trips       : own.map(trip => trip.id).join(' '),
                    // Moved here from the day before by its forecast
                    moved       : own.filter(trip => trip.change === 'moved').map(trip => trip.id).join(' '),
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
                    startDate  : state.dateOf(index),
                    endDate    : state.dateOf(index + 1),
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
