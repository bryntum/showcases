import { replanTrip } from './Planner.js';
import { duration, hhmm } from '../util/Time.js';

/**
 * Re-plans the day when a new forecast comes in. Each trip that no longer gets back before its window closes is
 * changed by the rules of Planner#replanTrip: brought forward, trimmed, or moved to tomorrow. The trips as they were
 * are kept, so the change can be undone.
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
        Object.assign(this, { dispatch, project, getTrips : trips, changes : [], snapshot : null });
    }

    /**
     * Takes the next forecast and re-plans the trips against it, a vessel's trips in departure order: each trip changed
     * is placed by the engine before the next one is planned, which may not leave before it is back
     * @param {String[]} waiting The turbines whose team waits at the port, kept for the undo
     * @returns {Promise<Object[]>} The changes, `{ trip, change, removed, was }`
     */
    async apply(waiting) {
        const
            me           = this,
            { dispatch } = me,
            // Not a new trip shown for a team held over a vessel
            trips        = me.getTrips().filter(trip => !trip.draft).sort((a, b) => a.departs - b.departs),
            ends         = new Map();

        me.snapshot = {
            waiting : [...waiting],
            trips   : trips.map(trip => ({
                trip,
                departs           : trip.departs,
                stops             : trip.stops,
                change            : trip.change,
                // Never undefined: until the app evaluates the trips again, a trip put back may still render as trimmed
                removed           : [...(trip.removed ?? [])],
                previousDeparture : trip.previousDeparture
            }))
        };

        dispatch.applyForecast();

        me.changes = [];

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

        me.changes.sort((a, b) => reviewOrder[a.change] - reviewOrder[b.change]);
        me.reviewIndex = -1;

        return me.changes;
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
     * Puts the trips back as they were before the forecast
     * @returns {String[]} The turbines waiting at the port then
     */
    undo() {
        const { snapshot } = this;

        snapshot?.trips.forEach(({ trip, departs, stops, change, removed, previousDeparture }) => {
            if (!trip.isDestroyed) {
                trip.set({ change, removed, previousDeparture });
                trip.layout({ departs, stops });
            }
        });

        this.changes  = [];
        this.snapshot = null;

        return snapshot?.waiting ?? this.dispatch.waiting;
    }
}
