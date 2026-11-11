import { DateHelper } from '@bryntum/core-enterprise';
import { EventModelEnterprise } from '@bryntum/scheduler-enterprise';
import { turbinesOf } from '../plan/Planner.js';
import { bufferData, chainData, legsData, transitsOf } from './TripData.js';

/**
 * A trip, one run of a vessel or helicopter from the port and back, or one of its legs: one tree event store holds
 * both. The trip is a parent event from its first stop to its last, its children the stops and the hops between them.
 * The sail out and back are not children but the trip's buffer (`preamble`, `postamble`), so the departure and the
 * return are `outerStartDate` and `outerEndDate`.
 *
 * The records are the plan: the views read their dates, durations, kinds and teams. The times are the engine's, read
 * after `await project.commitAsync()`: a `startnoearlierthan` constraint holds the trip's first stop, `chain`
 * dependencies keep the legs in order, and a gap between two legs is a wait on station for another trip. The planner
 * counts in minutes since the trip's midnight: `plan` is the one snapshot it gets, `departs` and `endMinute` the trip's
 * ends in its minutes. A stop's ID is `<trip>:<turbine>` so a dependency can point at it; change the stops through
 * `layout()` only.
 *
 * Learn more:
 * https://bryntum.com/docs/api/Scheduler/feature/NestedEvents
 * https://bryntum.com/docs/api/Scheduler/model/EventModelEnterprise
 */
export default class TripModel extends EventModelEnterprise {
    static $name = 'TripModel';

    static fields = [
        // Set by the forecast: `pulled` (brought forward), `trimmed` (its last stops cut), or `carried` for the trip it
        // made of stops it cut from a trip the day before (ForecastPlanner#carry)
        { name : 'change', defaultValue : null },
        // The departure before the forecast brought it forward (`pulled`)
        { name : 'previousDeparture', type : 'date', defaultValue : null },
        // `on-plan`, `at-risk` or the change, kept up to date by the app (DispatchApp#evaluate)
        { name : 'status', defaultValue : 'on-plan' },
        // Drop-off, Pickup
        'note',
        // The day of the week the trip is on, 0 is today (data/farm.json)
        { name : 'day', type : 'number', defaultValue : 0 },

        // The legs (child events): `transit` or `stop`
        'kind',
        // A stop: the turbine and the team, its `duration` how long they work there (minutes)
        'turbine',
        'team',
        // A transit between two turbines, not to or from the port
        { name : 'hop', type : 'boolean' }
    ];

    get isLeg() {
        return Boolean(this.parent && !this.parent.isRoot);
    }

    get trip() {
        return this.isLeg ? this.parent : this;
    }

    get mode() {
        return this.trip.resource?.mode ?? 'vessel';
    }

    // The buffer as `{ out, back }`, minutes
    get transits() {
        const minutes = duration => Math.round((duration?.milliseconds ?? 0) / 60000);

        return { out : minutes(this.trip.preamble), back : minutes(this.trip.postamble) };
    }

    // Minute 0 of the planner's times
    get midnight() {
        return DateHelper.clearTime(this.trip.startDate);
    }

    minutesOf(date) {
        return DateHelper.diff(this.midnight, date, 'minute');
    }

    dateOf(minutes) {
        return DateHelper.add(this.midnight, minutes, 'minute');
    }

    // `outerStartDate`, so the sail out included
    get departs() {
        return this.minutesOf(this.trip.outerStartDate);
    }

    // Back at port: `outerEndDate`, the end the engine rolled up from the legs plus the sail back
    get endMinute() {
        return this.minutesOf(this.trip.outerEndDate);
    }

    // Minutes the trip waits on station for another trip: the gaps the engine left between its legs
    get wait() {
        return this.gapsBefore(this.legRecords.length - 1);
    }

    // The minutes the engine left between the legs, up to the one at an index
    gapsBefore(index) {
        const records = this.legRecords;

        return records.slice(1, index + 1).reduce((sum, leg, i) =>
            sum + Math.max(0, DateHelper.diff(records[i].endDate, leg.startDate, 'minute')), 0);
    }

    get legRecords() {
        return this.children?.length ? this.children : [];
    }

    get stopRecords() {
        return this.legRecords.filter(leg => leg.kind === 'stop');
    }

    /**
     * The stops that wait on station, and for which trip
     * @property {Object[]} `{ turbine, minutes, after }`, `after` the ID of the trip waited for
     */
    get waits() {
        const records = this.legRecords;

        return records.flatMap((record, i) => {
            const
                minutes = i ? DateHelper.diff(records[i - 1].endDate, record.startDate, 'minute') : 0,
                after   = record.predecessors?.find(dependency => !dependency.isChain)?.fromEvent;

            return minutes > 0 ? [{ turbine : record.turbine, minutes, after : after?.id ?? '' }] : [];
        });
    }

    /**
     * The earliest departure the dependencies into the stops allow, minutes since midnight, 0 when none waits: for
     * each, the end of the trip waited for plus the lag, less how far into the trip the stop is without waiting
     * @property {Number}
     */
    get earliestDeparture() {
        const me = this;

        return Math.max(0, ...me.legRecords.map((record, i) => {
            const dependency = record.predecessors?.find(each => !each.isChain);

            if (!dependency?.fromEvent?.endDate) {
                return 0;
            }

            // The engine's waiting before the stop taken off
            const offset = me.minutesOf(record.startDate) - me.gapsBefore(i) - me.departs;

            return me.minutesOf(dependency.fromEvent.endDate) + (dependency.lag ?? 0) - offset;
        }));
    }

    get turbines() {
        return turbinesOf(this.stopRecords);
    }

    get teamIds() {
        return [...new Set(this.stopRecords.map(stop => stop.team))];
    }

    // People on board: what the seats are checked against
    get pax() {
        return this.teamIds.reduce((sum, id) => sum + (this.project?.teams?.get(id)?.techs ?? 0), 0);
    }

    /**
     * The trip as the planner reads it: a snapshot of the records in minutes since the trip's midnight, its stops
     * `{ turbine, minutes, team }`. The planner is synchronous, fast enough for every pointer move; the engine is not
     * @property {Object}
     */
    get plan() {
        const me = this;

        return {
            id    : me.id,
            start : me.departs,
            stops : me.stopRecords.map(({ turbine, duration, team }) => ({ turbine, minutes : duration, team })),
            mode  : me.mode,
            wait  : me.wait,
            pax   : me.pax,
            seats : me.resource?.seats ?? 0
        };
    }

    /**
     * Lays the trip out from its departure and, when they change, its stops, the transits between them from the farm's
     * geography. A new departure alone only moves the constraint: the engine moves the legs with it. Read the times
     * after `project.commitAsync()`
     * @param {Object} [options]
     * @param {Number} [options.departs] The new departure, minutes since midnight
     * @param {Object[]} [options.stops] The new stops, `{ turbine, minutes, team }`
     */
    layout({ departs = this.departs, stops } = {}) {
        const me = this;

        if (stops) {
            me.placeLegs(legsData({ id : me.id, departs, midnight : me.midnight }, stops, me.mode));
        }

        me.placeStart(departs, stops ? transitsOf(stops, me.mode) : me.transits);
    }

    // A leg that stays is updated, not replaced, so a dependency into a stop stays attached. The chain is laid again
    placeLegs(wanted) {
        const
            me                  = this,
            { dependencyStore } = me.project,
            ids                 = new Set(wanted.map(leg => leg.id)),
            gone                = me.legRecords.filter(leg => !ids.has(leg.id));

        dependencyStore.remove(me.legRecords.flatMap(leg => (leg.predecessors ?? []).filter(link => link.isChain)));

        if (gone.length) {
            me.removeChild(gone);
        }

        // The start is the engine's: set on a leg that stays, it would become a constraint
        wanted.forEach(({ id, startDate, ...values }, index) => {
            const
                leg  = me.legRecords.find(each => each.id === id),
                here = me.legRecords[index] ?? null;

            if (!leg) {
                me.insertChild({ id, startDate, ...values }, here).assign(me.resource);
            }
            else {
                leg.set(values);

                if (here !== leg) {
                    me.insertChild(leg, here);
                }
            }
        });

        dependencyStore.add(chainData(me.legRecords));
    }

    // The trip starts at its first stop, after the sail out. Set also when only the constraint differs: the trip
    // editor sets the start without it
    placeStart(departs, transits) {
        const
            me   = this,
            date = me.dateOf(departs + transits.out);

        if (transits.out !== me.transits.out || transits.back !== me.transits.back) {
            me.set(bufferData(transits));
        }

        if (date.getTime() !== me.startDate?.getTime() || date.getTime() !== me.constraintDate?.getTime()) {
            me.set({ startDate : date, constraintType : 'startnoearlierthan', constraintDate : date });
        }
    }
}
