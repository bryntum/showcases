import { hopMinutes, portMinutes, substation, turbineIds } from './Farm.js';
import { duration, hhmm } from '../util/Time.js';

/**
 * The dispatch rules, plain synchronous functions on plain values. A trip is `{ start, stops, mode, wait }`: its
 * departure in minutes since its midnight, its stops `{ turbine, minutes, team }` in order, `vessel` or `heli`, and the
 * minutes the engine holds it on station for another trip (TripModel#wait). The drop check calls these on every
 * pointer move, so they do not ask the engine: about 2 ms a hover with the reach, against about 90 ms for one trial
 * change placed by the engine and taken back.
 */

const
    // Pulled forward trips start on a quarter hour, at least this long from now
    quarter  = 15,
    // GWO basic safety training, required of every technician offshore on top of what the job asks for
    baseline = ['GWO'];

// One list, both checked against the team and shown
function requiredCerts(job) {
    return [...new Set([...(job.certs ?? []), ...baseline])];
}

/**
 * The legs of a trip: out from the port, the stops with the hops between them, back to the port
 * @param {Object[]} stops `{ turbine, minutes, team }`
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

function tripMinutes(stops, mode) {
    return buildLegs(stops, mode).reduce((sum, leg) => sum + leg.minutes, 0);
}

// Adds `from` and `to` to each leg, minutes since midnight
export function timeLegs(start, legs) {
    let time = start;

    return legs.map(leg => {
        const from = time;

        time += leg.minutes;

        return { ...leg, from, to : time };
    });
}

/**
 * A stop added after a trip's last one. The trip's wait on station is put before it, at the stops already there
 * @param {Object} trip `{ start, stops, mode, wait }`
 * @param {Object} stop `{ turbine, minutes, team }`
 * @returns {Object} `{ stops, stop, back }`, `stop` is the added leg with its `from` and `to`
 */
export function appendStop({ start, stops, mode, wait = 0 }, stop) {
    const
        all  = [...stops, stop],
        legs = timeLegs(start + wait, buildLegs(all, mode));

    return { stops : all, stop : legs.at(-2), back : legs.at(-1).to };
}

export function turbinesOf(stops) {
    return stops.map(stop => stop.turbine).filter(id => id !== substation);
}

/**
 * The trip as a new forecast leaves it, or `null` when it still fits or has left port
 * @param {Object} trip `{ start, stops, mode, wait }`
 * @param {Object} context `{ close, now, earliest }`, `earliest` the end of the trip before it
 * @returns {Object|null} `{ change, start, stops, later }`: `change` is `pulled`, `trimmed` or `moved` (nothing kept),
 * `stops` the stops it keeps today, `later` the ones that wait for tomorrow
 */
export function replanTrip({ start, stops, mode, wait = 0 }, { close, now, earliest }) {
    const fits = kept => start + wait + tripMinutes(kept, mode) <= close;

    // A trip that has left port is not rewritten, its stops may be under way or done: it stays, flagged
    if (!stops.length || start <= now || fits(stops)) {
        return null;
    }

    // The whole trip earlier, starting on a quarter hour
    const latest = Math.floor((close - wait - tripMinutes(stops, mode)) / quarter) * quarter;

    if (latest >= Math.max(earliest, now + quarter)) {
        return { change : 'pulled', start : latest, stops, later : [] };
    }

    // The last stops wait for tomorrow, all of them when not even the first fits
    let count = stops.length - 1;

    while (count > 0 && !fits(stops.slice(0, count))) {
        count--;
    }

    return { change : count ? 'trimmed' : 'moved', start, stops : stops.slice(0, count), later : stops.slice(count) };
}

/**
 * The next day's departure for the stops a forecast cut: the vessel's first sailing that day after its other trips,
 * or `null` when that is not back before the window closes (the teams then wait at the port)
 * @param {Object} vessel `{ mode }`
 * @param {Object} day That day's `{ close, firstSailing, busy }`, `busy` the vessel's trips that day, see clashOf
 */
export function nextDayStart(stops, vessel, { close, firstSailing, busy }) {
    const
        start = Math.max(firstSailing, ...busy.map(trip => nextSailing([trip.end], 0))),
        end   = start + tripMinutes(stops, vessel.mode);

    return end <= close && !clashOf({ start, end }, busy) ? start : null;
}

/**
 * The first of the vessel's other trips a span would overlap, port to port (buffer included). Pass top-level trips
 * only: a trip's own legs overlap it by design
 * @param {Object} span `{ start, end }`, minutes since midnight
 * @param {Object[]} busy The vessel's other trips, `{ id, start, end }`
 */
export function clashOf({ start, end }, busy) {
    return busy.find(other => start < other.end && other.start < end) ?? null;
}

// "Sea Puffin is out on SP-2 09:30–13:10"
export function clashText(vessel, clash) {
    return `${vessel} is out on ${clash.id} ${hhmm(clash.start)}–${hhmm(clash.end)}`;
}

// "waves over 1.5 m", "wind over 20 m/s"
function weatherText(limit) {
    return limit.hs ? `waves over ${limit.hs.toFixed(1)} m` : `wind over ${limit.wind} m/s`;
}

// "Back in port 14:35, the CTV window closes 14:00 (waves over 1.5 m)"
export function noGoText(back, close, limit) {
    return `Back in port ${hhmm(back)}, the ${limit.name} window closes ${hhmm(close)} (${weatherText(limit)})`;
}

/**
 * The first dispatch rule a team on a trip breaks, as a sentence for the tooltip and short for the drag proxy. One
 * check gives both, so they never disagree
 * @returns {String[]} `[reason, short]`, `[null, null]` when it breaks none
 */
function brokenRule({ trip, team, job, certs, close, limit, now, vessel, seats, back, at, nowhere, busy }) {
    const
        missing = certs.filter(cert => !team.certs.includes(cert)),
        late    = back - close,
        clash   = clashOf({ start : trip.start, end : back }, busy);

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
        // A job that fits nowhere today says so, rather than how late this one trip would be
        return nowhere ?
            [`${duration(job.minutes)} on site does not fit before any window closes today`, 'Fits nowhere today'] :
            [noGoText(back, close, limit), `${duration(late)} after window`];
    }

    if (clash) {
        return [clashText(vessel, clash), `Clashes with ${clash.id}`];
    }

    // Dropped where the weather is already over the limit
    if (at != null && at >= close) {
        return [noGoText(back, close, limit), 'In weather no-go'];
    }

    return [null, null];
}

/**
 * What dropping a team on a trip would do: its stop, when the trip is back, and whether it may go there
 * @param {Object} options
 * @param {Object} options.trip `{ id, start, stops, mode, wait, pax, seats }` (TripModel#plan)
 * @param {Object} options.team `{ id, name, techs, certs }`
 * @param {Object} options.job `{ turbine, minutes, certs }`
 * @param {Object} options.limit `{ name, hs }` or `{ name, wind }`
 * @param {String} options.vessel The vessel's name, for the messages
 * @param {Number} [options.at] Where on the time axis the team is dropped, minutes. Not inside the no-go range
 * @param {Boolean} [options.nowhere] The job fits on no trip or vessel today
 * @param {Object[]} [options.busy] The vessel's other trips, `{ id, start, end }`
 * @returns {Object} `{ valid, reason, short, stops, stop, back, margin, seats, certs }`. `reason` is a sentence,
 * `short` a few words for the drag proxy: why it does not fit, or "Fits SR-1, back 12:40"
 */
export function previewDrop({ trip, team, job, close, limit, now, vessel, at, nowhere = false, busy = [] }) {
    const
        { stops, stop, back } = appendStop(trip, { turbine : job.turbine, minutes : job.minutes, team : team.id }),
        seats                 = trip.pax + team.techs,
        certs                 = requiredCerts(job),
        [reason, short]       = brokenRule({ trip, team, job, certs, close, limit, now, vessel, seats, back, at,
            nowhere, busy });

    return {
        valid  : !reason,
        reason,
        short  : short ?? `Fits ${trip.id}, back ${hhmm(back)}`,
        stops,
        stop,
        back,
        margin : close - back,
        seats,
        certs
    };
}

// The turbines a trip could still add a stop of `minutes` at and be back by `close`
export function reachable(trip, minutes, close) {
    const visited = new Set(turbinesOf(trip.stops));

    return new Set(turbineIds.filter(id => !visited.has(id) &&
        appendStop(trip, { turbine : id, minutes }).back <= close));
}

// A quarter hour after the vessel is back from its last trip (`backs`) or after now, on the quarter hour
export function nextSailing(backs, now) {
    return Math.ceil((Math.max(now, ...backs) + quarter) / quarter) * quarter;
}
