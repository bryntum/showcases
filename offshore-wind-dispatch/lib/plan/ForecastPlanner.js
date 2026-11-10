import { nextDayStart, replanTrip } from './Planner.js';
import { addTrip, nextTripId } from '../model/TripData.js';
import { busyOf } from '../schedule/TripValidator.js';
import { duration, hhmm } from '../util/Time.js';

/**
 * Re-plans the day when a new forecast comes in. Each trip that no longer gets back before its window closes is
 * changed by the rules of Planner#replanTrip: brought forward, trimmed, or taken off the day. The stops it cuts go to
 * tomorrow for real: a trip of the same vessel on that day if it fits that day's window and the vessel's other trips
 * (Planner#nextDayStart), else their teams wait at the port again. A trip with no stop left is removed.
 *
 * The re-plan is one transaction of the project's StateTrackingManager, which also tracks the waiting teams' store, so
 * Undo is the STM's `undo()`: every change to the trips, their legs and their dependencies, the engine's own included,
 * the trips added tomorrow and the teams waiting again go back. The STM records nothing else:
 * it is enabled for the forecast's transaction and its undo only, a team previewed on a trip is no change to undo. The
 * forecast itself is the dispatch state's and stays. A change of the plan after the forecast drops its Undo
 * (`invalidateUndo`), a failed re-plan is rolled back.
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
        project.stm.addStore(dispatch.waitingStore);
    }

    /**
     * Takes the next forecast and re-plans the trips against it, a vessel's trips in departure order: each trip changed
     * is placed by the engine before the next one is planned, which may not leave before it is back
     * @returns {Promise<Object[]>} The changes, `{ trip, vessel, change, stops, later, carried }`, see replan()
     */
    async apply() {
        const
            me                    = this,
            { dispatch, project } = me,
            { stm }               = project,
            // Not a new trip shown for a team held over a vessel
            trips                 = me.getTrips().filter(trip => !trip.draft).sort((a, b) => a.departs - b.departs);

        dispatch.applyForecast();

        // The day it re-planned, the notice shows on that day only
        me.day     = dispatch.dayIndex;
        me.changes = [];
        // An earlier forecast's re-plan is no longer undone
        stm.resetQueue();
        stm.enable();
        stm.startTransaction('Forecast');

        try {
            await me.replan(trips);
            await project.commitAsync();
            stm.stopTransaction();
        }
        catch(error) {
            // The trips go back as they were, the new forecast stays: the trips past its window are flagged
            me.changes = [];
            stm.rejectTransaction();
            await project.commitAsync();
            throw error;
        }
        finally {
            // Nothing else is recorded: a team previewed on a trip is no change to undo
            stm.disable();
        }

        me.changes.sort((a, b) => reviewOrder[a.change] - reviewOrder[b.change]);
        me.reviewIndex = -1;

        return me.changes;
    }

    // Each trip against the new windows, see apply(). A change is Planner#replanTrip's, with the trip's vessel and
    // the trip its cut stops were `carried` to tomorrow, if any
    async replan(trips) {
        const
            me   = this,
            ends = new Map();

        for (const trip of trips) {
            const
                { resource } = trip,
                result       = replanTrip(trip.plan, {
                    close    : me.dispatch.closeOf(resource),
                    now      : me.dispatch.now,
                    // Not before the trip before it on the vessel is back, nor before what its stops wait for is done
                    earliest : Math.max(ends.get(resource) ?? 0, trip.earliestDeparture)
                });

            if (result) {
                me.changes.push({ trip, vessel : resource, ...result, carried : me.carry(trip, result.later) });

                if (result.stops.length) {
                    trip.set({
                        change            : result.change,
                        previousDeparture : result.change === 'pulled' ? trip.outerStartDate : null
                    });
                    // Its legs placed again: from the new departure, without the stops cut. The engine places them,
                    // the trips after it on the vessel wait for its return
                    trip.layout({ departs : result.start, stops : result.stops });
                }
                else {
                    trip.remove();
                }

                await me.project.commitAsync();
            }

            if (result?.stops.length !== 0) {
                ends.set(resource, trip.endMinute);
            }
        }
    }

    /**
     * The stops a forecast cut from a trip, on the next day: a trip of their own on the vessel, marked `carried`, if
     * they fit there, else their teams wait at the port, each for its own stop
     * @param {TripModel} trip
     * @param {Object[]} stops
     * @returns {TripModel|null} The trip they were carried to
     */
    carry(trip, stops) {
        if (!stops.length) {
            return null;
        }

        const
            { dispatch, project } = this,
            { eventStore }        = project,
            vessel                = trip.resource,
            day                   = trip.day + 1,
            trips                 = eventStore.rootNode.children,
            start                 = day < dispatch.days.length ? nextDayStart(stops, vessel, {
                close        : dispatch.windowsOf(day)[vessel.window],
                firstSailing : dispatch.firstSailing,
                busy         : busyOf(trips.filter(each => each.day === day), vessel)
            }) : null;

        if (start == null) {
            dispatch.waitingStore.add(stops.map(({ turbine, team, minutes }) =>
                dispatch.waitingOf(turbine, { id : `${team}:${turbine}`, minutes })));

            return null;
        }

        return addTrip(eventStore, vessel,
            { id : nextTripId(trips, vessel), departs : start, midnight : dispatch.dateOf(day), day, change : 'carried' },
            stops);
    }

    /**
     * The changes to review: the trips changed that are still on the day
     * @property {Object[]}
     */
    get reviewable() {
        return this.changes.filter(change => change.stops.length);
    }

    /**
     * The next change to review, round and round, the first after a new forecast
     * @returns {Object|undefined} See apply()
     */
    nextChange() {
        const { reviewable } = this;

        this.reviewIndex = ((this.reviewIndex ?? -1) + 1) % Math.max(1, reviewable.length);

        return reviewable[this.reviewIndex];
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
            // The stops cut that found no trip tomorrow: their teams wait at the port
            waiting         = changes.filter(change => !change.carried).flatMap(change => change.later).length,
            parts           = [
                trimmed.length ? `${trimmed.length} ${trimmed.length === 1 ? 'trip' : 'trips'} trimmed` : null,
                ...count('moved').map(({ vessel, carried }) =>
                    `${vessel.name}'s trip ${carried ? `moved to ${dispatch.nextLong} ${hhmm(carried.departs)}` : 'off today'}`),
                ...count('pulled').map(({ trip }) => `${trip.resource.name}'s ${(trip.note ?? 'trip').toLowerCase()} brought forward`),
                waiting ? `${waiting} ${waiting === 1 ? 'stop waits' : 'stops wait'} at the port, ${dispatch.nextLong} has no room` : null
            ].filter(Boolean),
            earlier         = was != null && was > closes ? `, ${duration(was - closes)} earlier` : '';

        return {
            headline : `Forecast ${forecast.issued}: Hs passes ${dispatch.limits.ctv.hs.toFixed(1)} m at ${hhmm(closes)}${earlier}.`,
            detail   : `${parts.join(', ')}.`
        };
    }

    /**
     * Whether the forecast's re-plan can still be undone: not once the plan was changed after it
     * @property {Boolean}
     */
    get canUndo() {
        // `canUndo` is false while the STM is disabled, as it is between the forecast and its Undo
        return this.project.stm.position > 0;
    }

    /**
     * Drops the forecast's Undo. Called when the plan changes after the forecast (a team booked, a trip moved): undoing
     * the forecast's transaction then would replay its changes over records that changed since
     */
    invalidateUndo() {
        this.project.stm.resetQueue();
    }

    /**
     * Puts the trips back as they were before the forecast: the STM undoes its transaction
     * @returns {Promise} Resolves once the records are back, the engine then places them
     */
    async undo() {
        const
            me      = this,
            { stm } = me.project;

        me.changes = [];

        // A disabled STM can undo nothing
        stm.enable();

        try {
            if (stm.canUndo) {
                await stm.undo();
            }
        }
        finally {
            stm.resetQueue();
            stm.disable();
        }
    }
}
