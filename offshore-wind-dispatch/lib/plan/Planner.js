import { hopMinutes, portMinutes, substation, turbineIds } from './Farm.js';

/**
 * The dispatch rules, plain functions on plain values so they read on their own. A trip is a run of a vessel or a
 * helicopter from the port and back, `{ start, stops, mode }`: its start in minutes since midnight, its turbine stops
 * in order (`{ turbine, minutes, team }`), and `vessel` or `heli`. The legs between the stops follow from the farm's
 * geography (Farm.js), so a trip's length is known from its stops alone.
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
export function replanTrip({ start, stops, mode }, { close, now, earliest }) {
    const fits = kept => start + tripMinutes(kept, mode) <= close;

    if (!stops.length || fits(stops)) {
        return null;
    }

    const started = start <= now;

    // Not gone yet: the whole trip earlier, starting on a quarter hour
    if (!started) {
        const latest = Math.floor((close - tripMinutes(stops, mode)) / quarter) * quarter;

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
 * What dropping a team on a trip would do: its stop, when the trip is back, and whether it may go there
 * @param {Object} options
 * @param {Object} options.trip `{ id, start, stops, mode, pax, seats, change }`
 * @param {Object} options.team `{ id, name, techs, certs }`
 * @param {Object} options.job `{ turbine, minutes, certs }`
 * @param {Number} options.close When the trip's window closes
 * @param {Number} options.now
 * @param {String} options.vessel The vessel's name, for the messages
 * @returns {Object} `{ valid, reason, stops, stop, back, margin, seats, certs }`
 */
export function previewDrop({ trip, team, job, close, now, vessel }) {
    const
        stops   = [...trip.stops, { turbine : job.turbine, minutes : job.minutes, team : team.id, preview : true }],
        legs    = timeLegs(trip.start, buildLegs(stops, trip.mode)),
        stop    = legs.at(-2),
        back    = legs.at(-1).to,
        seats   = trip.pax + team.techs,
        missing = (job.certs ?? []).filter(cert => !team.certs.includes(cert)),
        reason  = trip.change === 'moved' ? `${trip.id} is moved to tomorrow` :
            trip.mode === 'heli' ? 'Helicopters hoist teams on and off, drop it on a vessel trip' :
                trip.start <= now ? `${vessel} left port with ${trip.id} already` :
                    seats > trip.seats ? `${seats} people, ${vessel} seats ${trip.seats}` :
                        missing.length ? `${team.name} lacks ${missing.join(', ')}` :
                            back > close ? 'Back at port after the window closes' : null;

    return {
        valid  : !reason,
        reason,
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
 * @param {Object} trip `{ start, stops, mode, change }`
 * @param {Number} minutes The work at the turbine
 * @param {Number} close
 * @returns {Set<String>}
 */
export function reachable(trip, minutes, close) {
    const visited = new Set(turbinesOf(trip.stops));

    if (trip.change === 'moved' || !trip.stops.length) {
        return new Set();
    }

    return new Set(turbineIds.filter(id => !visited.has(id) &&
        trip.start + tripMinutes([...trip.stops, { turbine : id, minutes }], trip.mode) <= close));
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
