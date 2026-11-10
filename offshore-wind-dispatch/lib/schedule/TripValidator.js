import { clashOf, clashText, noGoText } from '../plan/Planner.js';
import { hhmm } from '../util/Time.js';

/**
 * The checks of a trip moved to a new time, by a drag (the EventDrag feature's `validatorFn`) or by the trip editor's
 * time field (DispatchScheduler#checkTripTime): plain functions on the DispatchScheduler, its dispatch state and its
 * dependency store.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/EventDrag#config-validatorFn
 */

/**
 * The other trips of a vessel on a day, port to port, that a trip has to keep clear of. Not the trip itself, not a
 * draft shown for a team held over the vessel
 * @param {TripModel[]} trips The trips of the day
 * @param {VesselModel} vessel
 * @param {String} [except] The ID of the trip being checked
 * @returns {Object[]} `{ id, start, end }`, minutes since midnight
 */
export function busyOf(trips, vessel, except) {
    return trips
        .filter(trip => trip.resource === vessel && trip.id !== except && !trip.draft)
        .map(trip => ({ id : trip.id, start : trip.departs, end : trip.endMinute }));
}

/**
 * The reason a trip moved to a new departure breaks a dependency of the plan, if it does: the engine would move the
 * dependent stop (its trip waits on station, or the trip's own stop moves later) and that trip would be back after its
 * weather window
 * @param {DispatchScheduler} scheduler
 * @param {TripModel} trip
 * @param {Number} departs The trip's new departure, minutes since midnight
 * @returns {String|null}
 */
function dependencyBreak({ dependencyStore, dispatch }, trip, departs) {
    const delta = departs - trip.departs;

    for (const dependency of dependencyStore.records.filter(each => !each.isChain)) {
        const
            { fromEvent, toEvent } = dependency,
            dependent              = toEvent?.trip;

        if (fromEvent?.endDate && dependent && (fromEvent.trip === trip || dependent === trip)) {
            const
                shift = record => (record.trip === trip ? delta : 0),
                // Where the stop could start without waiting on station, and where the trip it follows is done
                free  = toEvent.minutesOf(toEvent.startDate) - dependent.wait + shift(toEvent),
                done  = fromEvent.minutesOf(fromEvent.endDate) + shift(fromEvent) + (dependency.lag ?? 0),
                wait  = Math.max(0, done - free),
                back  = dependent.endMinute - dependent.wait + wait + shift(toEvent),
                close = dispatch.closeOf(dependent.resource);

            if (wait > 0 && back > close) {
                return `${dependency.text}: ${dependent.id} would be back ${hhmm(back)}, ` +
                    `after its window closes ${hhmm(close)}`;
            }
        }
    }

    return null;
}

/**
 * Whether a trip may leave at the departure it is dragged to: not in the past, back
 * before its window closes, not while its vessel is out on another trip, and without a dependency pushing a stop past
 * its window
 * @param {DispatchScheduler} scheduler
 * @param {Object} context The EventDrag feature's validation context, `{ eventRecords, startDate, newResource }`
 * @returns {Boolean|Object} `true`, or `{ valid : false, message }`
 */
export function validateTripDrag(scheduler, { eventRecords, startDate, newResource }) {
    const
        { dispatch } = scheduler,
        trip         = eventRecords[0],
        departs      = scheduler.departsAt(trip, startDate);

    // Trips under way are not draggable at all (their `draggable` field, DispatchApp#evaluate)
    if (departs < dispatch.now) {
        return { valid : false, message : 'Cannot leave port in the past' };
    }

    // Out at sea while the vessel's weather is over its limit
    const
        vessel = newResource ?? trip.resource,
        close  = dispatch.closeOf(vessel),
        back   = departs + trip.endMinute - trip.departs;

    if (back > close) {
        return { valid : false, message : noGoText(back, close, dispatch.limits[vessel.window]) };
    }

    const clash = clashOf({ start : departs, end : back }, busyOf(scheduler.trips, vessel, trip.id));

    if (clash) {
        return { valid : false, message : clashText(vessel.name, clash) };
    }

    // A stop that waits for another trip is not refused: the engine starts it once that trip is done. Unless that
    // leaves a trip back after its window
    const broken = dependencyBreak(scheduler, trip, departs);

    return broken ? { valid : false, message : broken } : true;
}

/**
 * Why a time typed in the trip editor is refused, checked as a drag to it is
 * @param {DispatchScheduler} scheduler
 * @param {TripModel} trip
 * @param {Date} time The time typed, its hours and minutes on the trip's day
 * @returns {String|null}
 */
export function tripTimeError(scheduler, trip, time) {
    if (!trip?.startDate || !time) {
        return null;
    }

    const start = new Date(trip.startDate);

    start.setHours(time.getHours(), time.getMinutes(), 0, 0);

    const check = validateTripDrag(scheduler, { eventRecords : [trip], startDate : start });

    return check === true ? null : check.message;
}
