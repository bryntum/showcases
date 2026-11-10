import { dependencyData } from '../model/TripData.js';
import { DateHelper } from '@bryntum/core-enterprise';
import { hhmm } from '../util/Time.js';

/**
 * Brings the DispatchScheduler's project stores in line with the dispatch state: the no-go and ghost resource time
 * ranges (VesselRangeModel, by `kind`), the now line, and the plan's dependencies.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/ResourceTimeRanges
 */
export default class DispatchSync {
    constructor({ scheduler }) {
        this.scheduler = scheduler;
    }

    /**
     * Brings a store's records in line with the data, by ID: updated in place, added or removed. Replacing every
     * record would leave the ones drawn before behind
     * @param {Core.data.Store} store
     * @param {Object[]} data
     */
    static syncStore(store, data) {
        const ids = new Set(data.map(({ id }) => id));

        store.remove(store.records.filter(record => !ids.has(record.id)));
        data.forEach(values => {
            const record = store.getById(values.id);

            if (record) {
                record.set(values);
            }
            else {
                store.add(values);
            }
        });
    }

    refresh() {
        this.syncRanges();
        this.syncNow();
        this.syncDependencies();
    }

    syncRanges() {
        const
            { scheduler } = this,
            state         = scheduler.dispatch,
            at            = minutes => DateHelper.add(state.midnight, minutes, 'minute'),
            end           = at(state.day.dayEnd * 60),
            // The Group feature's header rows are records of the store too
            nogo          = scheduler.resourceStore.allRecords.filter(vessel => !vessel.isGroupHeader).map(vessel => ({
                id         : `nogo-${vessel.id}`,
                kind       : 'nogo',
                resourceId : vessel.id,
                startDate  : at(state.closeOf(vessel)),
                endDate    : end,
                name       : state.limits[vessel.window].noGo
            })),
            ghosts        = scheduler.trips.filter(trip => trip.status === 'pulled' && trip.previousDeparture).map(trip => ({
                id         : `ghost-${trip.id}`,
                kind       : 'ghost',
                resourceId : trip.resource?.id,
                // From its old departure, as long as the trip is now
                startDate  : trip.previousDeparture,
                endDate    : DateHelper.add(trip.previousDeparture,
                    trip.outerEndDate.getTime() - trip.outerStartDate.getTime(), 'millisecond')
            })),
            shown         = ghosts.filter(ghost => ghost.startDate < end);

        DispatchSync.syncStore(scheduler.resourceTimeRangeStore, [...nogo, ...shown]);
    }

    /**
     * Adds the data's dependencies whose two ends are in the plan and that are missing: a stop a forecast cut takes
     * its dependency with it, which comes back here once Undo brings the stop back
     */
    syncDependencies() {
        const
            { dependencyStore, eventStore } = this.scheduler,
            missing                         = this.scheduler.dispatch.dependencies
                .map(dependency => dependencyData(dependency))
                .filter(({ id, fromEvent, toEvent }) => !dependencyStore.getById(id) &&
                    eventStore.getById(fromEvent) && eventStore.getById(toEvent));

        if (missing.length) {
            dependencyStore.add(missing);
        }
    }

    // The now line and the shaded past, today only
    syncNow() {
        const
            { scheduler } = this,
            state         = scheduler.dispatch,
            now           = DateHelper.add(state.midnight, state.now, 'minute');

        DispatchSync.syncStore(scheduler.project.timeRangeStore, !state.isToday ? [] : [
            { id : 'past', startDate : scheduler.startDate, endDate : now, cls : 'ow-past' },
            { id : 'now', startDate : now, endDate : now, name : hhmm(state.now), cls : 'ow-now' }
        ]);
    }
}
