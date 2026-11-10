import { substation } from '../plan/Farm.js';
import { DateHelper } from '@bryntum/core-enterprise';
import { duration, hhmm } from '../util/Time.js';

/**
 * The Week view's data, plain functions from the week's trips and the dispatch state. A vessel's day with trips is ONE
 * derived event over them, from the earliest departure to the latest return, so cells never stack; a day without is a
 * whole-day resource time range, which a held team can be dropped on when it is `free`.
 */

const dayCount = 7;

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
 * "Go until 14", "No CTV", "Go · all day": the CTVs' window of a day
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
            { hs, wind }     = state.forecastOf(index),
            { due, planned } = state.daySummary(index, trips.filter(trip => trip.day === index));

        return {
            index,
            date : state.dateOf(index),
            sea  : seaState(state.windowsOf(index).ctv, state.day),
            hs   : [Math.min(...hs), Math.max(...hs)],
            wind : Math.max(...wind),
            due,
            planned
        };
    });
}

/**
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
                own   = trips.filter(trip => trip.day === index && trip.resource?.id === vessel.id),
                id    = `${vessel.id}:${index}`;

            if (own.length) {
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
                    // Has a trip carried over: made by a forecast of the stops it cut from the day before
                    carried     : own.some(trip => trip.change === 'carried'),
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

// How late a cell's last return is, "+17 min"
export function lateText(late) {
    return `+${duration(late)}`;
}
