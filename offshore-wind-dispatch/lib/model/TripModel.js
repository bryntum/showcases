import { EventModelEnterprise } from '@bryntum/scheduler-enterprise';
import { buildLegs, timeLegs, turbinesOf } from '../plan/Planner.js';
import { parseTime, toDate } from '../util/Time.js';

/**
 * A trip, one run of a vessel or a helicopter from the port and back, and its legs, all in one tree event store. The
 * trip is a parent event; its children are its legs: the transit out, the turbine stops with the short hops between
 * them, and the transit back. The NestedEvents feature draws the legs inside the trip, each at its own time.
 *
 * The trip's stops are read from its stop children (`stops`). Changing them goes through `layout()`, which places
 * every leg from the departure and the farm's geography (Planner#buildLegs). The trip and its legs are manually
 * scheduled, so the engine keeps the times the planner gives them. A stop child's ID is `<trip>:<turbine>`, so a
 * dependency can point at it.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/NestedEvents
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/model/EventModelEnterprise
 */
export default class TripModel extends EventModelEnterprise {
    static $name = 'TripModel';

    static fields = [
        // The trip's departure, minutes since midnight. Plain data the planner reads, `startDate` follows it
        { name : 'departs', type : 'number', defaultValue : null },
        // Set by the forecast: `trimmed` (last stops to tomorrow), `moved` (all of it) or `pulled` (brought forward)
        { name : 'change', defaultValue : null },
        // The turbines the forecast moved to tomorrow
        { name : 'removed', type : 'array' },
        // The departure before the forecast brought it forward, minutes since midnight
        { name : 'was', type : 'number', defaultValue : null },
        // `on-plan`, `at-risk` or the change, kept up to date by the app (DispatchApp#evaluate)
        { name : 'status', defaultValue : 'on-plan' },
        // Drop-off, Pickup
        'note',

        // The legs (child events): `transit` or `stop`
        'kind',
        // A stop: the turbine, the team and how long they work there. A transit: how long it takes
        'turbine',
        'team',
        { name : 'minutes', type : 'number' },
        // A transit between two turbines, not to or from the port
        { name : 'hop', type : 'boolean' },
        // The stop shown while a team is dragged over the trip, not part of the plan
        { name : 'preview', type : 'boolean' }
    ];

    /**
     * Data every trip and leg has: durations in minutes, and manually scheduled, the planner gives the times and the
     * engine keeps them
     * @type {Object}
     */
    static scheduling = { durationUnit : 'minute', manuallyScheduled : true };

    /**
     * The teams by ID, set once the data is loaded
     * @type {Map<String,Object>}
     */
    static teams = new Map();

    /**
     * The data of a trip and its legs, from a trip of data/farm.json
     * @param {Object} trip `{ id, departs, stops, ... }`
     * @param {String} mode `vessel` or `heli`
     * @returns {Object} The trip's data, its legs as `children`
     */
    static tripData({ stops, ...trip }, mode) {
        const children = TripModel.legsData(trip, stops, mode);

        return {
            ...trip,
            ...TripModel.scheduling,
            startDate : toDate(trip.departs),
            duration  : children.reduce((sum, leg) => sum + leg.duration, 0),
            children
        };
    }

    /**
     * The data of a trip's legs
     * @param {Object} trip `{ id, departs }`
     * @param {Object[]} stops `{ turbine, minutes, team, preview }`
     * @param {String} mode
     * @returns {Object[]}
     */
    static legsData({ id, departs }, stops, mode) {
        return timeLegs(departs, buildLegs(stops, mode)).map(({ type, from, to, ...leg }, index) => ({
            ...TripModel.scheduling,
            id        : type === 'stop' ? `${id}:${leg.preview ? 'preview' : leg.turbine}` : `${id}:leg-${index}`,
            name      : leg.turbine ?? '',
            kind      : type,
            turbine   : leg.turbine ?? null,
            team      : leg.team ?? null,
            minutes   : leg.minutes,
            hop       : Boolean(leg.hop),
            preview   : Boolean(leg.preview),
            startDate : toDate(from),
            duration  : to - from,
            // A leg moves with its trip, never on its own
            draggable : false,
            resizable : false
        }));
    }

    /**
     * A dependency of data/farm.json as Scheduler data: from a trip into one stop of another trip, finish-to-start.
     * It is active, the Dependencies feature's own default: a trip drag that would start the stop before its
     * predecessor is back is refused (DispatchScheduler#validateTripDrag), and one the forecast breaks shows red
     * @param {Object} dependency `{ id, from, to, toStop }`
     * @returns {Object}
     */
    static dependencyData({ id, from, to, toStop }) {
        return { id, fromEvent : from, toEvent : `${to}:${toStop}` };
    }

    /**
     * The Scheduler project's data from data/farm.json: the vessels, the trips with their legs as children, each trip
     * and leg assigned to the trip's vessel (a nested event shows where both it and its parent are assigned), and the
     * dependencies
     * @param {Object} data `{ vessels, trips, dependencies }`
     * @returns {Object} `{ resources, events, assignments, dependencies }`
     */
    static projectData({ vessels, trips, dependencies }) {
        const
            modeOf      = id => vessels.find(vessel => vessel.id === id)?.mode ?? 'vessel',
            events      = trips.map(({ start, resourceId, ...trip }) =>
                TripModel.tripData({ ...trip, departs : parseTime(start) }, modeOf(resourceId))),
            assignments = events.flatMap((trip, index) => [trip, ...trip.children].map(event => ({
                id       : `a-${event.id}`,
                event    : event.id,
                resource : trips[index].resourceId
            })));

        return {
            resources    : vessels,
            events,
            assignments,
            dependencies : dependencies.map(dependency => TripModel.dependencyData(dependency))
        };
    }

    /**
     * Whether a dragged team's stop is previewed on the trip
     * @property {Boolean}
     */
    get hasPreview() {
        return this.legRecords.some(leg => leg.preview);
    }

    /**
     * `true` for a leg, a child of a trip
     * @property {Boolean}
     */
    get isLeg() {
        return Boolean(this.parent && !this.parent.isRoot);
    }

    /**
     * The trip: itself, or the trip of a leg
     * @property {TripModel}
     */
    get trip() {
        return this.isLeg ? this.parent : this;
    }

    /**
     * `vessel` or `heli`, from the trip's resource
     * @property {String}
     */
    get mode() {
        return this.trip.resource?.mode ?? 'vessel';
    }

    /**
     * The departure, minutes since midnight
     * @property {Number}
     */
    get startMinute() {
        return this.departs;
    }

    /**
     * Back at port, minutes since midnight, from the legs
     * @property {Number}
     */
    get endMinute() {
        return this.legs.at(-1)?.to ?? this.departs;
    }

    /**
     * The legs (child events), in order
     * @property {TripModel[]}
     */
    get legRecords() {
        return this.children?.length ? this.children : [];
    }

    /**
     * The stops, `{ turbine, minutes, team }`, from the stop children, the previewed one left out
     * @property {Object[]}
     */
    get stops() {
        return this.legRecords
            .filter(leg => leg.kind === 'stop' && !leg.preview)
            .map(({ turbine, minutes, team }) => ({ turbine, minutes, team }));
    }

    /**
     * The stops, with the previewed one of a dragged team at the end
     * @property {Object[]}
     */
    get allStops() {
        const preview = this.legRecords.find(leg => leg.preview);

        return preview ? [...this.stops, { turbine : preview.turbine, minutes : preview.minutes, team    : preview.team,
            preview : true }] : this.stops;
    }

    /**
     * The legs with their times, `{ type, minutes, from, to, turbine, hop, preview }`, see Planner#timeLegs
     * @property {Object[]}
     */
    get legs() {
        return timeLegs(this.departs, buildLegs(this.allStops, this.mode));
    }

    /**
     * The turbines it serves
     * @property {String[]}
     */
    get turbines() {
        return turbinesOf(this.stops);
    }

    /**
     * The teams on board, by ID, in order
     * @property {String[]}
     */
    get teamIds() {
        return [...new Set(this.stops.map(stop => stop.team))];
    }

    /**
     * "Team B", "Teams D, E"
     * @property {String}
     */
    get teamText() {
        const
            { teams } = TripModel,
            ids       = this.teamIds;

        if (ids.length === 1) {
            return teams.get(ids[0])?.name ?? ids[0];
        }

        return `Teams ${ids.join(', ')}`;
    }

    /**
     * People on board
     * @property {Number}
     */
    get pax() {
        return this.teamIds.reduce((sum, id) => sum + (TripModel.teams.get(id)?.techs ?? 0), 0);
    }

    /**
     * The trip as the planner reads it
     * @property {Object}
     */
    get plan() {
        const me = this;

        return {
            id     : me.id,
            start  : me.departs,
            stops  : me.stops,
            mode   : me.mode,
            change : me.change,
            pax    : me.pax,
            seats  : me.resource?.seats ?? 0
        };
    }

    /**
     * Places the trip and its legs: from the departure, the passed stops in order with the transits between them. Legs
     * that stay (same ID) are updated, so a dependency into a stop stays attached; new ones are added and assigned to
     * the trip's vessel, the ones gone are removed
     * @param {Object} [options]
     * @param {Number} [options.departs] The new departure, minutes since midnight
     * @param {Object[]} [options.stops] The new stops, `{ turbine, minutes, team, preview }`
     */
    layout({ departs = this.departs, stops = this.allStops } = {}) {
        const
            me           = this,
            { resource } = me,
            existing     = new Map(me.legRecords.map(leg => [leg.id, leg])),
            wanted       = TripModel.legsData({ id : me.id, departs }, stops, me.mode),
            ids          = new Set(wanted.map(leg => leg.id)),
            gone         = me.legRecords.filter(leg => !ids.has(leg.id));

        if (gone.length) {
            me.removeChild(gone);
        }

        wanted.forEach((data, index) => {
            const
                leg  = existing.get(data.id),
                // The child now at this place, the legs are kept in order
                here = me.legRecords[index] ?? null;

            if (leg) {
                const values = { ...data };

                // The ID is the leg's key, not changed
                delete values.id;
                leg.set(values);

                if (here !== leg) {
                    me.insertChild(leg, here);
                }
            }
            else {
                const added = me.insertChild(data, here);

                if (resource) {
                    added.assign(resource);
                }
            }
        });

        me.set({
            departs,
            startDate : toDate(departs),
            duration  : wanted.reduce((sum, leg) => sum + leg.duration, 0)
        });
    }
}
