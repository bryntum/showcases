import { dependencyData } from '../model/TripData.js';
import { DateHelper } from '@bryntum/core-enterprise';
import { hhmm } from '../util/Time.js';

/**
 * Brings the scheduling project's stores in line with the dispatch state (DispatchState): the weather no-go of each
 * vessel and the old place of trips brought forward as resource time ranges (VesselRangeModel, by their `kind`), the
 * now line as a time range, and the dependencies of the plan. Not a widget: it works on the stores of the
 * DispatchScheduler that owns it.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/ResourceTimeRanges
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/TimeRanges
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/Dependencies
 */
export default class DispatchSync {
    /**
     * @param {Object} options
     * @param {DispatchScheduler} options.scheduler
     */
    constructor({ scheduler }) {
        this.scheduler = scheduler;
    }

    /**
     * Brings a store's records in line with the passed data, by ID: updated in place, added or removed. The stores are
     * the scheduling project's, replacing every record would leave the ones drawn before behind
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

    /**
     * Draws the state anew after the forecast or the plan changed: the ranges, the now line, the dependencies
     */
    refresh() {
        this.syncRanges();
        this.syncNow();
        this.syncDependencies();
    }

    /**
     * The weather no-go of each vessel and the old place of trips brought forward, as resource time ranges
     */
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
                // As long as the trip is now, from its old departure
                startDate  : trip.previousDeparture,
                endDate    : DateHelper.add(trip.previousDeparture,
                    trip.outerEndDate.getTime() - trip.outerStartDate.getTime(), 'millisecond')
            })),
            shown         = ghosts.filter(ghost => ghost.startDate < end);

        DispatchSync.syncStore(scheduler.resourceTimeRangeStore, [...nogo, ...shown]);
    }

    /**
     * The dependencies of the data whose ends are in the plan. A stop the forecast moves to tomorrow takes its
     * dependency with it, Undo brings the stop back and this the dependency
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

    /**
     * The now line and the lightly shaded past, today only: a later day is all ahead
     */
    syncNow() {
        const
            { scheduler } = this,
            state         = scheduler.dispatch,
            now           = DateHelper.add(state.midnight, state.now, 'minute');

        DispatchSync.syncStore(scheduler.project.timeRangeStore, !state.isToday ? [] : [
            { id : 'past', startDate : scheduler.startDate, endDate : now, cls : 'ow-past' },
            { id : 'now', startDate : now, name : hhmm(state.now), cls : 'ow-now' }
        ]);
    }
}
