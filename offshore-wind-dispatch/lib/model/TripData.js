import { DateHelper } from '@bryntum/core-enterprise';
import { buildLegs, timeLegs } from '../plan/Planner.js';
import { parseTime } from '../util/Time.js';

const at = (midnight, minutes) => DateHelper.add(midnight, minutes, 'minute');

/**
 * Plain functions turning the planner's trips and legs (Planner) into Scheduler data for TripModel records and the
 * links between their legs.
 */

/**
 * The sail out and back in minutes, which become the trip's event buffer (`preamble`, `postamble`)
 * @param {Object[]} stops `{ turbine, minutes, team }`
 * @param {String} mode
 * @returns {Object} `{ out, back }`
 */
export function transitsOf(stops, mode) {
    const legs = buildLegs(stops, mode);

    return { out : legs[0]?.minutes ?? 0, back : legs.length > 1 ? legs.at(-1).minutes : 0 };
}

export function bufferData({ out, back }) {
    return {
        preamble  : out ? { magnitude : out, unit : 'minute' } : null,
        postamble : back ? { magnitude : back, unit : 'minute' } : null
    };
}

/**
 * The data of a trip's stops and the hops between them. The sail out and back are cut off (`slice(1, -1)`): they are
 * the trip's buffer, not legs. The start dates are only a first guess, the engine places each leg after the one before
 * @param {Object} trip `{ id, departs, midnight }`, `departs` in minutes since the trip's `midnight`
 * @param {Object[]} stops `{ turbine, minutes, team }`
 * @param {String} mode
 */
export function legsData({ id, departs, midnight }, stops, mode) {
    return timeLegs(departs, buildLegs(stops, mode)).slice(1, -1).map(({ type, from, to, ...leg }, index) => ({
        // A hop keeps its place among all the legs, the sail out counted, in its ID
        id           : type === 'stop' ? `${id}:${leg.turbine}` : `${id}:leg-${index + 1}`,
        name         : leg.turbine ?? '',
        kind         : type,
        turbine      : leg.turbine ?? null,
        team         : leg.team ?? null,
        hop          : Boolean(leg.hop),
        startDate    : at(midnight, from),
        duration     : to - from,
        durationUnit : 'minute',
        // A leg moves with its trip, never on its own
        draggable    : false,
        resizable    : false
    }));
}

/**
 * The data of a trip with its legs as `children`. The trip starts at its first stop, after the sail out, and has no
 * duration of its own: the engine rolls it up from its legs. The constraint holds the departure, not a fixed date
 * @param {Object} trip `{ id, departs, midnight, ... }`, `departs` in minutes since the trip's `midnight`
 */
function tripData({ departs, midnight, ...trip }, stops, mode) {
    const
        transits = transitsOf(stops, mode),
        start    = at(midnight, departs + transits.out);

    return {
        ...trip,
        ...bufferData(transits),
        durationUnit   : 'minute',
        startDate      : start,
        constraintType : 'startnoearlierthan',
        constraintDate : start,
        children       : legsData({ id : trip.id, departs, midnight }, stops, mode)
    };
}

/**
 * The `chain` dependencies that keep a trip's legs in order, each leg starting when the one before it ends
 * @param {Object[]} legs The legs' data or records, in order
 */
export function chainData(legs) {
    return legs.slice(1).map((leg, i) => ({
        id        : `chain:${leg.id}`,
        kind      : 'chain',
        fromEvent : legs[i].id,
        toEvent   : leg.id
    }));
}

/**
 * A `plan` dependency of data/farm.json as Scheduler data: finish-to-start from a trip into one stop of another trip,
 * `lag` in minutes
 * @param {Object} dependency `{ id, from, to, toStop, lag, sides, text }`, `sides` the sides the line leaves and
 * enters by, for when the default way round would run along the trips' own line
 */
export function dependencyData({ id, from, to, toStop, lag = 0, sides = [], text = '' }) {
    return {
        id,
        kind      : 'plan',
        text,
        fromEvent : from,
        toEvent   : `${to}:${toStop}`,
        lag,
        lagUnit   : 'minute',
        fromSide  : sides[0] ?? null,
        toSide    : sides[1] ?? null
    };
}

/**
 * The Scheduler project's data from data/farm.json, the trips of the whole week, each on its `day` (0 is today). The
 * legs are assigned to the vessel as well as the trip: a nested event shows only where it and its parent both are
 * @param {Object} data `{ vessels, trips, dependencies }`
 * @param {Function} dateOf Midnight of a day of the week, `(index)`, see DispatchState#dateOf
 * @returns {Object} `{ resources, events, assignments, dependencies }`
 */
export function projectData({ vessels, trips, dependencies }, dateOf) {
    const
        modeOf      = id => vessels.find(vessel => vessel.id === id)?.mode ?? 'vessel',
        events      = trips.map(({ start, resourceId, stops, day = 0, ...trip }) =>
            tripData({ ...trip, day, departs : parseTime(start), midnight : dateOf(day) }, stops, modeOf(resourceId))),
        assignments = events.flatMap((trip, index) => [trip, ...trip.children].map(event => ({
            id       : `a-${event.id}`,
            event    : event.id,
            resource : trips[index].resourceId
        })));

    return {
        resources    : vessels,
        events,
        assignments,
        dependencies : [
            ...events.flatMap(trip => chainData(trip.children)),
            ...dependencies.map(dependency => dependencyData(dependency))
        ]
    };
}

// The ID of a vessel's next trip, "SR-7": a vessel's trips are numbered through the week
export function nextTripId(trips, vessel) {
    const numbers = trips.filter(trip => trip.resource === vessel)
        .map(trip => Number(String(trip.id).split('-').at(-1)) || 0);

    return `${String(vessel.id).toUpperCase()}-${Math.max(0, ...numbers) + 1}`;
}

/**
 * Adds a trip and its legs to an event store, all assigned to the vessel (see `projectData`), its legs chained
 * @param {Object} trip `{ id, departs, midnight, day, change, note }`, `departs` in minutes since `midnight`
 */
export function addTrip(eventStore, vessel, trip, stops) {
    const [added] = eventStore.rootNode.appendChild([tripData(trip, stops, vessel.mode)]);

    [added, ...added.children].forEach(event => event.assign(vessel));
    added.project.dependencyStore.add(chainData(added.children));

    return added;
}
