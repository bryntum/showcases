import { EventModelEnterprise } from '@bryntum/scheduler-enterprise';
import { buildLegs, timeLegs, tripEnd, turbinesOf } from '../plan/Planner.js';
import { parseTime, toDate, toMinutes } from '../util/Time.js';

/**
 * A trip, one run of a vessel or a helicopter from the port and back, and its legs, all in one tree event store. The
 * trip is a parent event; its children are its legs: the transit out, the turbine stops with the short hops between
 * them, and the transit back. The NestedEvents feature draws the legs inside the trip, each at its own time.
 *
 * The scheduling engine of Scheduler Enterprise places them (the project is a ProjectModelEnterprise):
 *
 * - The trip leaves port no earlier than its departure, a `startnoearlierthan` constraint. A trip dragged moves it
 * - Each leg follows the one before it, a finish-to-start dependency (`chain:<leg>`), so the legs run in order from
 *   the departure and a leg pushed later pushes the rest of the trip. These links are not drawn (TripRendering)
 * - A stop that waits for another trip, the HV isolation before T-45, has a dependency from that trip: the engine
 *   starts the stop once it is back. The vessel waits on station, and the legs after the stop move on with it
 * - The trip is a summary of its legs, the engine rolls its end up from them
 *
 * The trip's stops are read from its stop children (`stops`). Changing them goes through `layout()`, which puts the
 * legs between them from the farm's geography (Planner#buildLegs). A stop child's ID is `<trip>:<turbine>`, so a
 * dependency can point at it. After each calculation `wait` holds the minutes the trip waits on station, so the planner
 * knows when it is back without waiting for the next calculation (`endMinute`, `plan`).
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/NestedEvents
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/model/EventModelEnterprise
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/model/ProjectModelEnterprise
 */
export default class TripModel extends EventModelEnterprise {
    static $name = 'TripModel';

    static fields = [
        // Set by the forecast: `trimmed` (last stops to tomorrow), `moved` (all of it) or `pulled` (brought forward)
        { name : 'change', defaultValue : null },
        // The turbines the forecast moved to tomorrow
        { name : 'removed', type : 'array' },
        // The departure before the forecast brought it forward, minutes since midnight
        { name : 'was', type : 'number', defaultValue : null },
        // `on-plan`, `at-risk` or the change, kept up to date by the app (DispatchApp#evaluate)
        { name : 'status', defaultValue : 'on-plan' },
        // Minutes the trip waits on station for another trip, from the engine's last calculation (updateWait)
        { name : 'wait', type : 'number', defaultValue : 0, persist : false },
        // A new trip from port, shown while a team is held over a vessel that has no trip it could join
        { name : 'draft', type : 'boolean', persist : false },
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
     * The teams by ID, set once the data is loaded
     * @type {Map<String,Object>}
     */
    static teams = new Map();

    /**
     * The data of a trip and its legs
     * @param {Object} trip `{ id, departs, ... }`, `departs` in minutes since midnight
     * @param {Object[]} stops `{ turbine, minutes, team, preview }`
     * @param {String} mode `vessel` or `heli`
     * @returns {Object} The trip's data, its legs as `children`. The trip has no duration of its own, the engine rolls
     * it up from its legs
     */
    static tripData({ departs, ...trip }, stops, mode) {
        const start = toDate(departs);

        return {
            ...trip,
            durationUnit   : 'minute',
            startDate      : start,
            constraintType : 'startnoearlierthan',
            constraintDate : start,
            children       : TripModel.legsData({ id : trip.id, departs }, stops, mode)
        };
    }

    /**
     * The data of a trip's legs. Their start is where the planner expects them, the engine then places each after the
     * one before it
     * @param {Object} trip `{ id, departs }`
     * @param {Object[]} stops `{ turbine, minutes, team, preview }`
     * @param {String} mode
     * @returns {Object[]}
     */
    static legsData({ id, departs }, stops, mode) {
        return timeLegs(departs, buildLegs(stops, mode)).map(({ type, from, to, ...leg }, index) => ({
            id           : type === 'stop' ? `${id}:${leg.preview ? 'preview' : leg.turbine}` : `${id}:leg-${index}`,
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
     * The links that keep a trip's legs in order: each leg starts when the one before it ends
     * @param {Object[]} legs The legs' data or records, in order, `{ id }`
     * @returns {Object[]} Dependency data, `chain:<leg>`
     */
    static chainData(legs) {
        return legs.slice(1).map((leg, i) => ({ id : `chain:${leg.id}`, fromEvent : legs[i].id, toEvent : leg.id }));
    }

    /**
     * Whether a dependency is one of the links between a trip's legs, not one of the plan
     * @param {Scheduler.model.DependencyModel|Object} dependency
     * @returns {Boolean}
     */
    static isChain(dependency) {
        return String(dependency.id).startsWith('chain:');
    }

    /**
     * A dependency of data/farm.json as Scheduler data: from a trip into one stop of another trip, finish-to-start. The
     * engine starts the stop once the trip is back
     * @param {Object} dependency `{ id, from, to, toStop }`
     * @returns {Object}
     */
    static dependencyData({ id, from, to, toStop }) {
        return { id, fromEvent : from, toEvent : `${to}:${toStop}` };
    }

    /**
     * The Scheduler project's data from data/farm.json: the vessels, the trips with their legs as children, each trip
     * and leg assigned to the trip's vessel (a nested event shows where both it and its parent are assigned), the links
     * between the legs and the dependencies of the plan
     * @param {Object} data `{ vessels, trips, dependencies }`
     * @returns {Object} `{ resources, events, assignments, dependencies }`
     */
    static projectData({ vessels, trips, dependencies }) {
        const
            modeOf      = id => vessels.find(vessel => vessel.id === id)?.mode ?? 'vessel',
            events      = trips.map(({ start, resourceId, stops, ...trip }) =>
                TripModel.tripData({ ...trip, departs : parseTime(start) }, stops, modeOf(resourceId))),
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
                ...events.flatMap(trip => TripModel.chainData(trip.children)),
                ...dependencies.map(dependency => TripModel.dependencyData(dependency))
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
    static addTrip(eventStore, vessel, trip, stops) {
        const [added] = eventStore.rootNode.appendChild([TripModel.tripData(trip, stops, vessel.mode)]);

        [added, ...added.children].forEach(event => event.assign(vessel));
        added.project.dependencyStore.add(TripModel.chainData(added.children));
        added.layoutPending = true;

        return added;
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
     * The departure, minutes since midnight: when the trip starts
     * @property {Number}
     */
    get departs() {
        return toMinutes(this.trip.startDate);
    }

    /**
     * The departure, minutes since midnight
     * @property {Number}
     */
    get startMinute() {
        return this.departs;
    }

    /**
     * Back at port, minutes since midnight: the departure, the legs and the wait on station. The same as the engine's
     * end once it has calculated, and right away after a change, before it has
     * @property {Number}
     */
    get endMinute() {
        return tripEnd({ start : this.departs, stops : this.allStops, mode : this.mode, wait : this.wait });
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
     * The legs with their times, `{ type, minutes, from, to, turbine, team, hop, preview }`: as the engine placed them,
     * or, until it has calculated a change, as the planner expects them (Planner#timeLegs)
     * @property {Object[]}
     */
    get legs() {
        const records = this.legRecords;

        if (records.length && !this.layoutPending && records.every(leg => leg.startDate && leg.endDate)) {
            return records.map(leg => ({
                type    : leg.kind,
                minutes : leg.minutes,
                from    : toMinutes(leg.startDate),
                to      : toMinutes(leg.endDate),
                turbine : leg.turbine,
                team    : leg.team,
                hop     : leg.hop,
                preview : leg.preview
            }));
        }

        return timeLegs(this.departs, buildLegs(this.allStops, this.mode));
    }

    /**
     * The stops that wait on station for another trip, and for which, from the engine's last calculation
     * @property {Object[]} `{ turbine, minutes, after }`, `after` is the trip it waits for
     */
    get waits() {
        const legs = this.legs;

        return legs.flatMap((leg, i) => {
            const
                minutes = i ? leg.from - legs[i - 1].to : 0,
                record  = this.legRecords[i],
                after   = record?.predecessors?.find(dependency => !TripModel.isChain(dependency))?.fromEvent;

            return minutes > 0 ? [{ turbine : leg.turbine, minutes, after : after?.id ?? '' }] : [];
        });
    }

    /**
     * Reads the minutes the trip waits on station from the engine's calculation: the gaps between its legs
     * @returns {Boolean} Whether it changed
     */
    updateWait() {
        const
            me      = this,
            records = me.legRecords;

        me.layoutPending = false;

        if (!records.every(leg => leg.startDate && leg.endDate)) {
            return false;
        }

        const wait = records.reduce((sum, leg, i) => i ? sum + Math.max(0,
            toMinutes(leg.startDate) - toMinutes(records[i - 1].endDate)) : 0, 0);

        if (wait !== me.wait) {
            me.wait = wait;

            return true;
        }

        return false;
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

        return ids.length ? `Teams ${ids.join(', ')}` : 'New trip';
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
            wait   : me.wait,
            change : me.change,
            pax    : me.pax,
            seats  : me.resource?.seats ?? 0
        };
    }

    /**
     * Places the trip and its legs: the passed stops in order with the transits between them, linked so each starts
     * when the one before it ends. Legs that stay (same ID) are updated, so a dependency into a stop stays attached;
     * new ones are added and assigned to the trip's vessel, the ones gone are removed. A new departure moves the trip's
     * constraint, its legs follow. The engine then calculates the times, `layoutPending` until it has
     * @param {Object} [options]
     * @param {Number} [options.departs] The new departure, minutes since midnight
     * @param {Object[]} [options.stops] The new stops, `{ turbine, minutes, team, preview }`
     */
    layout({ departs = this.departs, stops = this.allStops } = {}) {
        const
            me                  = this,
            { resource }        = me,
            { dependencyStore } = me.project,
            existing            = new Map(me.legRecords.map(leg => [leg.id, leg])),
            wanted              = TripModel.legsData({ id : me.id, departs }, stops, me.mode),
            ids                 = new Set(wanted.map(leg => leg.id)),
            gone                = me.legRecords.filter(leg => !ids.has(leg.id)),
            prefix              = `chain:${me.id}:`;

        // The links between the legs are laid again below, in the new order
        dependencyStore.remove(dependencyStore.records.filter(dependency => String(dependency.id).startsWith(prefix)));

        if (gone.length) {
            me.removeChild(gone);
        }

        wanted.forEach((data, index) => {
            const
                leg  = existing.get(data.id),
                // The child now at this place, the legs are kept in order
                here = me.legRecords[index] ?? null;

            if (leg) {
                // The ID is the leg's key, and its start is the engine's: set, it would become a constraint
                const values = { ...data };

                delete values.id;
                delete values.startDate;
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

        dependencyStore.add(TripModel.chainData(me.legRecords));

        if (departs !== me.departs) {
            const start = toDate(departs);

            me.set({ startDate : start, constraintType : 'startnoearlierthan', constraintDate : start });
        }

        me.layoutPending = true;
    }
}
