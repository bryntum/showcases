import { replanTrip } from './Planner.js';
import { duration, hhmm } from '../util/Time.js';

/**
 * Re-plans the day when a new forecast comes in. Each trip that no longer gets back before its window closes is
 * changed by the rules of Planner#replanTrip: brought forward, trimmed, or moved to tomorrow.
 *
 * The re-plan is one transaction of the project's StateTrackingManager, so Undo is the STM's `undo()`: every change to
 * the trips, their legs and their dependencies, the engine's own included, goes back. The STM records nothing else:
 * it is enabled for the forecast's transaction and its undo only, a team previewed on a trip is no change to undo. The
 * forecast itself is the dispatch state's and stays.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/data/stm/StateTrackingManager
 */

// The order the changes are reviewed in: what is lost first
const reviewOrder = { moved : 0, trimmed : 1, pulled : 2 };

export default class ForecastPlanner {
    /**
     * @param {Object} options
     * @param {DispatchState} options.dispatch
     * @param {Function} options.trips Returns the trips, TripModel records
     * @param {Scheduler.model.ProjectModelEnterprise} options.project The project whose engine places the trips
     */
    constructor({ dispatch, trips, project }) {
        Object.assign(this, { dispatch, project, getTrips : trips, changes : [] });
    }

    /**
     * Takes the next forecast and re-plans the trips against it, a vessel's trips in departure order: each trip changed
     * is placed by the engine before the next one is planned, which may not leave before it is back
     * @returns {Promise<Object[]>} The changes, `{ trip, change, removed }`
     */
    async apply() {
        const
            me                    = this,
            { dispatch, project } = me,
            { stm }               = project,
            // Not a new trip shown for a team held over a vessel
            trips                 = me.getTrips().filter(trip => !trip.draft).sort((a, b) => a.departs - b.departs);

        dispatch.applyForecast();

        me.changes = [];
        // An earlier forecast's re-plan is no longer undone
        stm.resetQueue();
        stm.enable();
        stm.startTransaction('Forecast');

        try {
            await me.replan(trips);
        }
        finally {
            await project.commitAsync();
            stm.stopTransaction();
            stm.disable();
        }

        me.changes.sort((a, b) => reviewOrder[a.change] - reviewOrder[b.change]);
        me.reviewIndex = -1;

        return me.changes;
    }

    // Each trip against the new windows, see apply()
    async replan(trips) {
        const
            me           = this,
            { dispatch } = me,
            ends         = new Map();

        for (const trip of trips) {
            const
                { resource } = trip,
                result       = replanTrip(trip.plan, {
                    close    : dispatch.closeOf(resource),
                    now      : dispatch.now,
                    // Not before the trip before it on the vessel is back, nor before what its stops wait for is done
                    earliest : Math.max(ends.get(resource) ?? 0, trip.earliestDeparture)
                });

            if (result) {
                trip.set({
                    change            : result.change,
                    removed           : result.removed,
                    previousDeparture : result.change === 'pulled' ? trip.outerStartDate : null
                });
                // Its legs placed again: from the new departure, without the stops cut. The engine places them, the
                // trips after it on the vessel wait for its return
                trip.layout({ departs : result.start, stops : result.stops });
                me.changes.push({ trip, ...result });
                await me.project.commitAsync();
            }

            if (trip.change !== 'moved') {
                ends.set(resource, trip.endMinute);
            }
        }
    }

    /**
     * The next change to review, round and round, the first after a new forecast
     * @returns {Object|undefined} `{ trip, change, removed }`
     */
    nextChange() {
        const { changes } = this;

        this.reviewIndex = ((this.reviewIndex ?? -1) + 1) % Math.max(1, changes.length);

        return changes[this.reviewIndex];
    }

    /**
     * What the forecast says and what it changed, for the notice
     * @param {Object[]} changes
     * @returns {{headline: String, detail: String}}
     */
    summary(changes) {
        const
            { dispatch }    = this,
            { forecast }    = dispatch,
            closes          = dispatch.windows.ctv,
            was             = dispatch.previousWindows?.ctv,
            count           = kind => changes.filter(change => change.change === kind),
            trimmed         = count('trimmed'),
            parts           = [
                trimmed.length ? `${trimmed.length} ${trimmed.length === 1 ? 'trip' : 'trips'} trimmed` : null,
                ...count('moved').map(({ trip }) => `${trip.resource.name} moved to ${dispatch.nextLong}`),
                ...count('pulled').map(({ trip }) => `${trip.resource.name}'s ${(trip.note ?? 'trip').toLowerCase()} brought forward`)
            ].filter(Boolean),
            earlier         = was != null && was > closes ? `, ${duration(was - closes)} earlier` : '';

        return {
            headline : `Forecast ${forecast.issued}: Hs passes ${dispatch.limits.ctv.hs.toFixed(1)} m at ${hhmm(closes)}${earlier}.`,
            detail   : `${parts.join(', ')}.`
        };
    }

    /**
     * Puts the trips back as they were before the forecast: the STM undoes its transaction
     * @returns {Promise} Resolves once the records are back, the engine then places them
     */
    async undo() {
        const { stm } = this.project;

        this.changes = [];

        // A disabled STM can undo nothing
        stm.enable();

        if (stm.canUndo) {
            await stm.undo();
        }

        stm.resetQueue();
        stm.disable();
    }
}
