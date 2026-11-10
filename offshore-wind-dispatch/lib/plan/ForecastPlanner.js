import { nextDayStart, replanTrip } from './Planner.js';
import { addTrip, nextTripId } from '../model/TripData.js';
import { busyOf } from '../schedule/TripValidator.js';
import { duration, hhmm } from '../util/Time.js';

/**
 * Re-plans the day on a new forecast: Planner#replanTrip per trip, then `carry()` for the stops it cut.
 *
 * It owns the project's StateTrackingManager. The STM is enabled only for the re-plan's one transaction and its undo,
 * so Undo puts back exactly the re-plan (the engine's own changes and the waiting store included) and nothing else is
 * ever recorded. Any later change of the plan drops the Undo (`invalidateUndo`). A
 * failed re-plan is rolled back. The forecast itself stays either way.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/data/stm/StateTrackingManager
 */

// Changes are reviewed lost work first
const reviewOrder = { moved : 0, trimmed : 1, pulled : 2 };

export default class ForecastPlanner {
    // `trips` is a function returning the TripModel records
    constructor({ dispatch, trips, project }) {
        Object.assign(this, { dispatch, project, getTrips : trips, changes : [] });
        project.stm.addStore(dispatch.waitingStore);
    }

    /**
     * Takes the next forecast and re-plans the trips in departure order
     * @returns {Promise<Object[]>} The changes, `{ trip, vessel, change, start, stops, later, carried }`
     */
    async apply() {
        const
            me                    = this,
            { dispatch, project } = me,
            { stm }               = project,
            trips                 = me.getTrips().sort((a, b) => a.departs - b.departs);

        dispatch.applyForecast();

        // The notice shows on this day only
        me.day     = dispatch.dayIndex;
        me.changes = [];
        // Only the latest forecast's re-plan can be undone
        stm.resetQueue();
        stm.enable();
        stm.startTransaction('Forecast');

        try {
            await me.replan(trips);
            await project.commitAsync();
            stm.stopTransaction();
        }
        catch(error) {
            // The trips go back as they were, the new forecast stays: the trips past its window show as late
            me.changes = [];
            stm.rejectTransaction();
            await project.commitAsync();
            throw error;
        }
        finally {
            // Nothing else is recorded
            stm.disable();
        }

        me.changes.sort((a, b) => reviewOrder[a.change] - reviewOrder[b.change]);
        me.reviewIndex = -1;

        return me.changes;
    }

    // Each changed trip is committed before the next is planned: the next on the vessel may not leave before it is back
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
                    // Brought forward, the stops stay: only the departure moves
                    trip.layout({ departs : result.start, stops : result.later.length ? result.stops : undefined });
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
     * Moves the stops a forecast cut to the next day: a `carried` trip of the same vessel if they fit there, else each
     * stop's team waits at the port again
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

    // The changed trips still on the day
    get reviewable() {
        return this.changes.filter(change => change.stops.length);
    }

    // The next change to review, cycling, the first after a new forecast
    nextChange() {
        const { reviewable } = this;

        this.reviewIndex = ((this.reviewIndex ?? -1) + 1) % Math.max(1, reviewable.length);

        return reviewable[this.reviewIndex];
    }

    // The notice's `{ headline, detail }`
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

    get canUndo() {
        // Not `stm.canUndo`: that is false while the STM is disabled, as it is between the forecast and its Undo
        return this.project.stm.position > 0;
    }

    // Called when the plan changes after the forecast: undoing then would replay over records changed since
    invalidateUndo() {
        this.project.stm.resetQueue();
    }

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
