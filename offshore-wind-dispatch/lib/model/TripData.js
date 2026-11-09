import { buildLegs, timeLegs } from '../plan/Planner.js';
import { parseTime, toDate } from '../util/Time.js';

/**
 * A trip and its legs as Scheduler data, and the links between the legs: plain functions from the planner's trips and
 * legs (Planner) to the records of TripModel
 */

/**
 * The sail out from the port and back to it, minutes: the trip's event buffer (EventBuffer feature), its `preamble`
 * and `postamble`
 * @param {Object[]} stops `{ turbine, minutes, team, preview }`
 * @param {String} mode
 * @returns {Object} `{ out, back }`
 */
export function transitsOf(stops, mode) {
    const legs = buildLegs(stops, mode);

    return { out : legs[0]?.minutes ?? 0, back : legs.length > 1 ? legs.at(-1).minutes : 0 };
}

/**
 * The buffer fields of a trip: the sail out before its first stop, the sail back after its last
 * @param {Object} transits `{ out, back }`, minutes
 * @returns {Object} `{ preamble, postamble }`
 */
export function bufferData({ out, back }) {
    return {
        preamble  : out ? { magnitude : out, unit : 'minute' } : null,
        postamble : back ? { magnitude : back, unit : 'minute' } : null
    };
}

/**
 * The data of a trip's legs at sea: the turbine stops and the short hops between them. The sail out and back are not
 * legs but the trip's event buffer (`transitsOf`). Their start is where the planner expects them, the engine then
 * places each after the one before it
 * @param {Object} trip `{ id, departs }`
 * @param {Object[]} stops `{ turbine, minutes, team, preview }`
 * @param {String} mode
 * @returns {Object[]}
 */
export function legsData({ id, departs }, stops, mode) {
    return timeLegs(departs, buildLegs(stops, mode)).slice(1, -1).map(({ type, from, to, ...leg }, index) => ({
        // A hop keeps its place among all the legs, the sail out counted, in its ID
        id           : type === 'stop' ? `${id}:${leg.preview ? 'preview' : leg.turbine}` : `${id}:leg-${index + 1}`,
        name         : leg.turbine ?? '',
        kind         : type,
        turbine      : leg.turbine ?? null,
        team         : leg.team ?? null,
        minutes      : leg.minutes,
        hop          : Boolean(leg.hop),
        preview      : Boolean(leg.preview),
        startDate    : toDate(from),
        duration     : to - from,
        durationUnit : 'minute',
        // A leg moves with its trip, never on its own
        draggable    : false,
        resizable    : false
    }));
}

/**
 * The data of a trip and its legs
 * @param {Object} trip `{ id, departs, ... }`, `departs` in minutes since midnight
 * @param {Object[]} stops `{ turbine, minutes, team, preview }`
 * @param {String} mode `vessel` or `heli`
 * @returns {Object} The trip's data, its legs at sea as `children`, the sail out and back as its buffer. The trip
 * starts at its first stop, it has no duration of its own, the engine rolls it up from its legs
 */
export function tripData({ departs, ...trip }, stops, mode) {
    const
        transits = transitsOf(stops, mode),
        start    = toDate(departs + transits.out);

    return {
        ...trip,
        ...bufferData(transits),
        durationUnit   : 'minute',
        startDate      : start,
        constraintType : 'startnoearlierthan',
        constraintDate : start,
        children       : legsData({ id : trip.id, departs }, stops, mode)
    };
}

/**
 * The links that keep a trip's legs in order: each leg starts when the one before it ends (PlanDependencyModel, kind
 * `chain`)
 * @param {Object[]} legs The legs' data or records, in order, `{ id }`
 * @returns {Object[]} Dependency data, `chain:<leg>`
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
 * A dependency of data/farm.json as Scheduler data (PlanDependencyModel, kind `plan`): from a trip into one stop of
 * another trip, finish-to-start, with the lag (minutes) the stop waits after the trip. The engine starts the stop once
 * the trip is done and the lag has passed
 * @param {Object} dependency `{ id, from, to, toStop, lag, sides, text }`, `sides` the sides of the two ends the line
 * leaves and enters by, when the default way round would run along the trips' own line
 * @returns {Object}
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
 * The Scheduler project's data from data/farm.json: the vessels, the trips with their legs as children, each trip
 * and leg assigned to the trip's vessel (a nested event shows where both it and its parent are assigned), the links
 * between the legs and the dependencies of the plan. The trips of the whole week, each on its `day` (0 is today), today
 * being the day shown
 * @param {Object} data `{ vessels, trips, dependencies }`
 * @returns {Object} `{ resources, events, assignments, dependencies }`
 */
export function projectData({ vessels, trips, dependencies }) {
    const
        modeOf      = id => vessels.find(vessel => vessel.id === id)?.mode ?? 'vessel',
        events      = trips.map(({ start, resourceId, stops, day = 0, ...trip }) =>
            tripData({ ...trip, day, departs : parseTime(start) + day * 24 * 60 }, stops, modeOf(resourceId))),
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

/**
 * Adds a trip and its legs to an event store, assigned to a vessel, its legs linked in order
 * @param {Scheduler.data.EventStore} eventStore
 * @param {VesselModel} vessel
 * @param {Object} trip `{ id, departs, draft }`
 * @param {Object[]} stops
 * @returns {TripModel}
 */
export function addTrip(eventStore, vessel, trip, stops) {
    const [added] = eventStore.rootNode.appendChild([tripData(trip, stops, vessel.mode)]);

    [added, ...added.children].forEach(event => event.assign(vessel));
    added.project.dependencyStore.add(chainData(added.children));
    added.layoutPending = true;

    return added;
}
