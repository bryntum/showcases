import { hopMinutes, portMinutes, substation, turbineIds } from './Farm.js';
import { duration, hhmm } from '../util/Time.js';

/**
 * The dispatch rules, plain functions on plain values so they read on their own. A trip is a run of a vessel or a
 * helicopter from the port and back, `{ start, stops, mode, wait }`: its start in minutes since midnight, its turbine
 * stops in order (`{ turbine, minutes, team }`), `vessel` or `heli`, and the minutes it waits on station for another
 * trip. The legs between the stops follow from the farm's geography (Farm.js). The wait is the scheduling engine's: a
 * stop that depends on another trip starts once that trip is back, the engine pushes it and the legs after it
 * (TripModel). So a trip's length is its stops, the legs between them and that wait.
 *
 * - A trip has to be back at port before the weather window of its vessel closes
 * - When a forecast closes the window earlier, a trip not yet gone is brought forward if it fits before the close,
 *   otherwise the last stops are cut and wait for tomorrow, and a trip left with nothing is moved to tomorrow
 * - A team dropped on a trip gets a stop after the last one, if the seats, the certificates and the window allow it
 */

const
    // Pulled forward trips start on a quarter hour, at least this long from now
    quarter = 15;

/**
 * The legs of a trip: out from the port, the stops with the short hops between them, back to the port
 * @param {Object[]} stops `{ turbine, minutes, team, preview }`
 * @param {String} mode `vessel` or `heli`
 * @returns {Object[]} `{ type : 'transit' | 'stop', minutes, ...stop }`
 */
export function buildLegs(stops, mode) {
    if (!stops.length) {
        return [];
    }

    const legs = [{ type : 'transit', minutes : portMinutes(stops[0].turbine, mode) }];

    stops.forEach((stop, i) => {
        const hop = i ? hopMinutes(stops[i - 1].turbine, stop.turbine, mode) : 0;

        if (hop) {
            legs.push({ type : 'transit', minutes : hop, hop : true });
        }

        legs.push({ type : 'stop', ...stop });
    });

    legs.push({ type : 'transit', minutes : portMinutes(stops.at(-1).turbine, mode) });

    return legs;
}

/**
 * How long a trip takes, out and back
 * @param {Object[]} stops
 * @param {String} mode
 * @returns {Number} Minutes
 */
export function tripMinutes(stops, mode) {
    return buildLegs(stops, mode).reduce((sum, leg) => sum + leg.minutes, 0);
}

/**
 * The legs with their times, `from` and `to` in minutes since midnight
 * @param {Number} start
 * @param {Object[]} legs
 * @returns {Object[]}
 */
export function timeLegs(start, legs) {
    let time = start;

    return legs.map(leg => {
        const from = time;

        time += leg.minutes;

        return { ...leg, from, to : time };
    });
}

/**
 * When a trip is back at port: its start, its legs and the time it waits on station for another trip
 * @param {Object} trip `{ start, stops, mode, wait }`
 * @returns {Number} Minutes since midnight
 */
export function tripEnd({ start, stops, mode, wait = 0 }) {
    return start + wait + tripMinutes(stops, mode);
}

/**
 * A stop added after a trip's last one: the stops, when it would be on station and when the trip would be back. A
 * wait on station comes before it, at the stops already there
 * @param {Object} trip `{ start, stops, mode, wait }`
 * @param {Object} stop `{ turbine, minutes, team, preview }`
 * @returns {Object} `{ stops, stop, back }`, `stop` is the added leg with its `from` and `to`
 */
export function appendStop({ start, stops, mode, wait = 0 }, stop) {
    const
        all  = [...stops, stop],
        legs = timeLegs(start + wait, buildLegs(all, mode));

    return { stops : all, stop : legs.at(-2), back : legs.at(-1).to };
}

/**
 * The turbine IDs a trip serves, the substation left out
 * @param {Object[]} stops
 * @returns {String[]}
 */
export function turbinesOf(stops) {
    return stops.map(stop => stop.turbine).filter(id => id !== substation);
}

/**
 * The trip as the new forecast leaves it, or nothing when it still fits
 * @param {Object} trip `{ start, stops, mode }`
 * @param {Object} context
 * @param {Number} context.close When its window closes
 * @param {Number} context.now
 * @param {Number} context.earliest The earliest start it could be brought forward to: the end of the trip before it
 * @returns {Object|null} `{ change, start, stops, removed, was }`, `change` is `pulled`, `trimmed` or `moved`
 */
export function replanTrip({ start, stops, mode, wait = 0 }, { close, now, earliest }) {
    const fits = kept => start + wait + tripMinutes(kept, mode) <= close;

    if (!stops.length || fits(stops)) {
        return null;
    }

    const started = start <= now;

    // Not gone yet: the whole trip earlier, starting on a quarter hour
    if (!started) {
        const latest = Math.floor((close - wait - tripMinutes(stops, mode)) / quarter) * quarter;

        if (latest >= Math.max(earliest, now + quarter)) {
            return { change : 'pulled', start : latest, stops, removed : [], was : start };
        }
    }

    // The last stops wait for tomorrow
    for (let count = stops.length - 1; count > 0; count--) {
        const kept = stops.slice(0, count);

        if (fits(kept)) {
            return { change : 'trimmed', start, stops : kept, removed : turbinesOf(stops.slice(count)) };
        }
    }

    // Nothing fits: a trip in port moves to tomorrow, one at sea stays flagged past the window
    return started ? null : { change : 'moved', start, stops, removed : turbinesOf(stops) };
}

/**
 * The weather a limit stands for, "waves over 1.5 m", "wind over 20 m/s"
 * @param {Object} limit `{ hs }` or `{ wind }`
 * @returns {String}
 */
export function weatherText(limit) {
    return limit.hs ? `waves over ${limit.hs.toFixed(1)} m` : `wind over ${limit.wind} m/s`;
}

/**
 * The first dispatch rule a team on a trip breaks, as a sentence for the tooltip and the card, and short for the drag
 * proxy. One check gives both, so they never disagree
 * @returns {String[]} `[reason, short]`, `[null, null]` when it breaks none
 */
function brokenRule({ trip, team, job, close, limit, now, vessel, seats, back }) {
    const
        missing = (job.certs ?? []).filter(cert => !team.certs.includes(cert)),
        late    = back - close;

    if (trip.change === 'moved') {
        return [`${trip.id} is moved to tomorrow`, 'Moved to tomorrow'];
    }

    if (trip.mode === 'heli') {
        return ['Helicopters hoist teams on and off, drop it on a vessel', 'Vessels only'];
    }

    if (trip.start <= now) {
        return [`${trip.id} left port at ${hhmm(trip.start)}; ${team.name} is ashore`, 'Left port'];
    }

    if (seats > trip.seats) {
        return [`${seats} people, ${vessel} seats ${trip.seats}`, 'No seats'];
    }

    if (missing.length) {
        return [`${team.name} lacks ${missing.join(', ')}`, `Missing ${missing.join(', ')} cert`];
    }

    if (late > 0) {
        return [
            `Back at port ${hhmm(back)}, ${duration(late)} after the ${limit.name} weather window closes at ` +
                `${hhmm(close)} (${weatherText(limit)})`,
            `${duration(late)} after window`
        ];
    }

    return [null, null];
}

/**
 * What dropping a team on a trip would do: its stop, when the trip is back, and whether it may go there
 * @param {Object} options
 * @param {Object} options.trip `{ id, start, stops, mode, wait, pax, seats, change }`
 * @param {Object} options.team `{ id, name, techs, certs }`
 * @param {Object} options.job `{ turbine, minutes, certs }`
 * @param {Number} options.close When the trip's window closes
 * @param {Object} options.limit The trip's weather limit, `{ name, hs }` or `{ name, wind }`
 * @param {Number} options.now
 * @param {String} options.vessel The vessel's name, for the messages
 * @returns {Object} `{ valid, reason, short, stops, stop, back, margin, seats, certs }`. `reason` is a sentence,
 * `short` a few words for the drag proxy: why it does not fit, or "Fits SR-1, back 12:40"
 */
export function previewDrop({ trip, team, job, close, limit, now, vessel }) {
    const
        { stops, stop, back } = appendStop(trip,
            { turbine : job.turbine, minutes : job.minutes, team : team.id, preview : true }),
        seats                 = trip.pax + team.techs,
        [reason, short]       = brokenRule({ trip, team, job, close, limit, now, vessel, seats, back });

    return {
        valid  : !reason,
        reason,
        short  : short ?? `Fits ${trip.id}, back ${hhmm(back)}`,
        stops,
        stop,
        back,
        margin : close - back,
        seats,
        certs  : (job.certs ?? []).concat('GWO').filter((cert, i, all) => all.indexOf(cert) === i)
    };
}

/**
 * The turbines a trip could still add a stop at, of the passed length, and be back before its window closes
 * @param {Object} trip `{ start, stops, mode, wait, change }`
 * @param {Number} minutes The work at the turbine
 * @param {Number} close
 * @returns {Set<String>}
 */
export function reachable(trip, minutes, close) {
    const visited = new Set(turbinesOf(trip.stops));

    if (trip.change === 'moved') {
        return new Set();
    }

    return new Set(turbineIds.filter(id => !visited.has(id) &&
        appendStop(trip, { turbine : id, minutes }).back <= close));
}

/**
 * When a vessel could next leave port for a new trip: a quarter hour after it is back from its last trip, or from now,
 * on the quarter hour
 * @param {Number[]} backs When its trips of today are back, minutes since midnight
 * @param {Number} now
 * @returns {Number} Minutes since midnight
 */
export function nextSailing(backs, now) {
    return Math.ceil((Math.max(now, ...backs) + quarter) / quarter) * quarter;
}

/**
 * The share of the time from now until the window closes a resource is out on trips, 0 to 1
 * @param {Object[]} trips `{ start, end }` in minutes
 * @param {Number} now
 * @param {Number} close
 * @returns {Number}
 */
export function windowShare(trips, now, close) {
    if (close <= now) {
        return 1;
    }

    const used = trips.reduce((sum, { start, end }) =>
        sum + Math.max(0, Math.min(end, close) - Math.max(start, now)), 0);

    return Math.min(1, used / (close - now));
}
