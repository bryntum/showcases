import { EventModelEnterprise } from '@bryntum/scheduler-enterprise';
import { buildLegs, timeLegs, tripEnd, turbinesOf } from '../plan/Planner.js';
import { toDate, toMinutes } from '../util/Time.js';
import { bufferData, chainData, isChain, legsData, transitsOf } from './TripData.js';

/**
 * A trip, one run of a vessel or a helicopter from the port and back, and its legs, all in one tree event store. The
 * trip is a parent event from its first stop to its last; its children are its legs at sea: the turbine stops with the
 * short hops between them. The NestedEvents feature draws the legs inside the trip, each at its own time. The sail out
 * from the port and back to it are the trip's buffer time, its `preamble` and `postamble`, drawn by the EventBuffer
 * feature before and after it. `legs` still has them, as transits, so the planner reads the whole run.
 *
 * The scheduling engine of Scheduler Enterprise places them (the project is a ProjectModelEnterprise):
 *
 * - The trip reaches its first stop no earlier than its departure plus the sail out, a `startnoearlierthan`
 *   constraint. A trip dragged moves it
 * - Each leg follows the one before it, a finish-to-start dependency (`chain:<leg>`), so the legs run in order from
 *   the departure and a leg pushed later pushes the rest of the trip. These links are not drawn (TripRendering)
 * - A stop that waits for another trip, the HV isolation before T-45, has a dependency from that trip: the engine
 *   starts the stop once that trip's work is done (its end, before its sail back). The vessel waits on station, and
 *   the legs after the stop move on with it
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
     * The sail out from the port to the first stop and back from the last one, minutes: the trip's event buffer
     * @property {Object} `{ out, back }`
     */
    get transits() {
        const minutes = duration => Math.round((duration?.milliseconds ?? 0) / 60000);

        return { out : minutes(this.trip.preamble), back : minutes(this.trip.postamble) };
    }

    /**
     * The departure, minutes since midnight: the trip's start, at its first stop, less the sail out
     * @property {Number}
     */
    get departs() {
        return toMinutes(this.trip.startDate) - this.trip.transits.out;
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
            const
                { out, back } = this.transits,
                first         = toMinutes(records[0].startDate),
                last          = toMinutes(records.at(-1).endDate);

            // The sail out and back, the trip's buffer, around the legs at sea as the engine placed them
            return [
                { type : 'transit', minutes : out, from : first - out, to : first },
                ...records.map(leg => ({
                    type    : leg.kind,
                    minutes : leg.minutes,
                    from    : toMinutes(leg.startDate),
                    to      : toMinutes(leg.endDate),
                    turbine : leg.turbine,
                    team    : leg.team,
                    hop     : leg.hop,
                    preview : leg.preview
                })),
                { type : 'transit', minutes : back, from : last, to : last + back }
            ];
        }

        return timeLegs(this.departs, buildLegs(this.allStops, this.mode));
    }

    /**
     * The stops that wait on station for another trip, and for which, from the engine's last calculation
     * @property {Object[]} `{ turbine, minutes, after }`, `after` is the trip it waits for
     */
    get waits() {
        const records = this.legRecords;

        return records.flatMap((record, i) => {
            const
                minutes = i && record.startDate && records[i - 1].endDate ?
                    toMinutes(record.startDate) - toMinutes(records[i - 1].endDate) : 0,
                after   = record.predecessors?.find(dependency => !isChain(dependency))?.fromEvent;

            return minutes > 0 ? [{ turbine : record.turbine, minutes, after : after?.id ?? '' }] : [];
        });
    }

    /**
     * The earliest the trip can leave port for the dependencies into its stops: each stop starts a trip's end (and
     * its lag) after the trip it follows, the stop is its place in the trip after the sail out and the stops before it
     * @property {Number} Minutes since midnight, 0 when no stop waits for another trip
     */
    get earliestDeparture() {
        const
            me      = this,
            records = me.legRecords;

        return Math.max(0, ...records.map((record, i) => {
            const dependency = record.predecessors?.find(each => !isChain(each));

            if (!dependency?.fromEvent?.endDate || !record.startDate) {
                return 0;
            }

            // Where the stop is in the trip without any waiting on station: the engine's wait before it is taken off
            const waited = records.slice(0, i + 1).reduce((sum, leg, j) => j ? sum + Math.max(0,
                toMinutes(leg.startDate) - toMinutes(records[j - 1].endDate)) : sum, 0);

            return toMinutes(dependency.fromEvent.endDate) + (dependency.lag ?? 0) -
                (toMinutes(record.startDate) - waited - me.departs);
        }));
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
            wanted              = legsData({ id : me.id, departs }, stops, me.mode),
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

        dependencyStore.add(chainData(me.legRecords));

        // The sail out and back follow the first and last stop, the trip starts at the first stop
        const
            transits = transitsOf(stops, me.mode),
            start    = departs + transits.out,
            buffers  = bufferData(transits),
            changed  = transits.out !== me.transits.out || transits.back !== me.transits.back;

        if (changed) {
            me.set(buffers);
        }

        if (start !== toMinutes(me.startDate)) {
            const date = toDate(start);

            me.set({ startDate : date, constraintType : 'startnoearlierthan', constraintDate : date });
        }

        me.layoutPending = true;
    }
}
