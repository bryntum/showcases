import { DateHelper, StringHelper, Toast } from '@bryntum/core-enterprise';
import { nextSailing, noGoText, previewDrop, reachable } from './plan/Planner.js';
import TripModel from './model/TripModel.js';
import { busyOf } from './schedule/TripValidator.js';
import { addTrip, nextTripId } from './model/TripData.js';
import { hhmm } from './util/Time.js';

const
    stopOf       = (team, job, preview = false) => ({ turbine : job.turbine, minutes : job.minutes, team : team.id,
        preview }),
    newPlan      = (id, start, vessel) => ({
        id, start, stops : [], mode : vessel.mode, wait : 0, pax : 0, seats : vessel.seats
    }),
    // A new trip only described, not in the plan: on a free cell of the Week view, or the trip a helicopter refuses
    draftOf      = (plan, vessel) => ({ id : plan.id, draft : true, departs : plan.start, resource : vessel }),
    // Encoded: the reason comes from the plan
    tell         = text => Toast.show({ html : StringHelper.encodeHtml(text), cls : 'ow-toast-message' });

/**
 * The `handler` TeamDrag calls (see TeamDrag's DropHandler): lifts a team, previews its stop where it is held, books it
 * on release. Held over a vessel's row rather than a trip, the team goes on the vessel's best trip (the one it fits on
 * that is back first, else the first, so the tooltip says why), or a draft trip from port when none is left to join.
 *
 * The preview check is synchronous, on the planner's plain values (Planner#previewDrop): the engine is too slow to ask
 * on every pointer move. Only a booking is placed by the engine.
 */
export default class DropController {
    /**
     * @param {Object} options
     * @param {DispatchState} options.dispatch
     * @param {DispatchScheduler} options.scheduler The Day view
     * @param {AppState} options.state
     * @param {Function} options.onBooked Called with `{ trip, turbine }` once a team is booked: on a trip of the Day
     * view, or (no `trip`) on a new trip on a day of the Week view
     */
    constructor({ dispatch, scheduler, state, onBooked }) {
        Object.assign(this, { dispatch, scheduler, state, onBooked });
    }

    // See previewDrop, kept in the app state
    get held() {
        return this.state.held;
    }

    set held(held) {
        this.state.held = held;
    }

    get trips() {
        return this.scheduler.trips;
    }

    // `{ team, job }`, the waiting record (WaitingTeamModel)
    waitingTeam(teamId) {
        return this.dispatch.waitingStore.getById(teamId);
    }

    // The chip stays in the tray, dimmed, until the team is booked
    liftTeam(teamId) {
        this.state.lifted = teamId;
        this.markFitting(teamId);
    }

    /**
     * Previews a team where it is held and checks it. The hover and the release both go through it, so what is booked
     * is what was shown. The same team over the same target, on the same side of the window's close, keeps its check
     * @param {String} teamId
     * @param {TripModel|VesselModel|Object|null} target The trip, the vessel's row or the Week view's cell held over
     * @param {Number|null} [at] Minutes since midnight at the point held on the Day view's time axis, none over the
     * Week view
     * @param {Boolean} [fresh] Checked again even if unchanged, as a booking is
     * @returns {Object|null} `{ id, target, trip, team, job, result, reach, close, at }`, `id` the waiting record's
     */
    previewDrop(teamId, target, at = null, fresh = false) {
        const
            me       = this,
            blocked  = me.blockedAt(target, at),
            { held } = me;

        if (!fresh && held?.target === target && held.id === teamId && (held.at != null) === (blocked != null)) {
            return held;
        }

        me.clearPreview();

        if (target) {
            me.holdPreview(teamId, target, blocked);
        }

        return me.held;
    }

    // The minute held at when it is in the vessel's no-go range, else none. A cell of the week is the whole day
    blockedAt(target, at) {
        const vessel = target instanceof TripModel ? target.resource : target;

        return at != null && vessel && !target.isWeekCell && at >= this.dispatch.closeOf(vessel) ? at : null;
    }

    /**
     * A team held over a free cell of the Week view (WeekBoard#cellAt): a new trip from port that day, at the next
     * sailing today or the first sailing on a later day, checked against that day's window
     * @param {String} teamId
     * @param {Object} cell `{ vesselId, day }`
     * @returns {Object|null} See previewDrop, with the new trip's `plan`, its `vessel` and `day`
     */
    cellDrop(teamId, cell) {
        const entry = this.waitingTeam(teamId);

        if (!entry) {
            return null;
        }

        const
            { dispatch }  = this,
            { team, job } = entry,
            { day }       = cell,
            vessel        = this.scheduler.resourceStore.getById(cell.vesselId),
            close         = dispatch.windowsOf(day)[vessel.window],
            now           = day ? dispatch.day.dayStart * 60 : dispatch.days[0].now,
            plan          = newPlan(nextTripId(this.scheduler.weekTrips, vessel),
                day ? dispatch.firstSailing : nextSailing([], now), vessel),
            limit         = dispatch.limits[vessel.window];

        return {
            id     : entry.id,
            target : cell,
            at     : null,
            trip   : draftOf(plan, vessel),
            team,
            job,
            result : previewDrop({ trip : plan, team, job, close, limit, now, vessel : vessel.name }),
            close,
            reach  : reachable(plan, job.minutes, close),
            plan,
            vessel,
            day
        };
    }

    // `at` only when it is in the vessel's no-go range. Null when the team no longer waits
    holdPreview(teamId, target, at = null) {
        const
            me    = this,
            entry = me.waitingTeam(teamId);

        if (!entry || target.isDestroyed) {
            return null;
        }

        if (target.isWeekCell) {
            return me.held = me.cellDrop(teamId, target);
        }

        const
            { team, job }          = entry,
            { plan, trip, vessel } = me.tripFor(target, team, job),
            close                  = me.dispatch.closeOf(vessel);

        // Checked before the stop is previewed, against the plan alone
        return me.held = {
            id     : entry.id,
            target,
            at,
            team,
            job,
            result : me.checkPlan(plan, vessel, team, job, at),
            trip   : me.previewStop(trip, plan, vessel, stopOf(team, job, true)),
            close,
            reach  : reachable(plan, job.minutes, close)
        };
    }

    // The previewed stop is a leg of the trip, or of a new draft trip. Not on a helicopter, which never takes a team:
    // its refusal needs no record in the plan, the new trip is only described, as for a Week cell (cellDrop)
    previewStop(trip, plan, vessel, stop) {
        const { midnight, dayIndex } = this.dispatch;

        if (vessel.mode === 'heli') {
            return trip ?? draftOf(plan, vessel);
        }

        if (trip) {
            trip.layout({ stops : [...trip.stops, stop] });

            return trip;
        }

        return addTrip(this.scheduler.eventStore, vessel,
            { id : plan.id, departs : plan.start, midnight, draft : true, day : dayIndex }, [stop]);
    }

    // `{ trip, plan, vessel }`: the trip under the team if it can still be joined, else the vessel's best trip, else
    // (`trip` null) a new trip from port at the vessel's next sailing
    tripFor(target, team, job) {
        const
            { now }  = this.dispatch,
            joinable = trip => !trip.draft && trip.departs > now,
            isTrip   = target instanceof TripModel;

        if (isTrip && joinable(target)) {
            return { trip : target, plan : target.plan, vessel : target.resource };
        }

        const
            vessel = isTrip ? target.resource : target,
            trips  = this.trips.filter(trip => trip.resource === vessel && !trip.draft),
            open   = trips.filter(joinable).map(trip => {
                const plan = trip.plan;

                return { trip, plan, vessel, result : this.rawCheck(plan, vessel, team, job) };
            });

        if (open.length) {
            return open.filter(({ result }) => result.valid).sort((a, b) => a.result.back - b.result.back)[0] ??
                open[0];
        }

        // None to join: a new trip from port, once the vessel is back from its last one
        const backs = trips.map(trip => trip.endMinute);

        return {
            trip : null,
            vessel,
            plan : newPlan(nextTripId(this.scheduler.weekTrips, vessel), nextSailing(backs, now), vessel)
        };
    }

    checkDrop(trip, team, job) {
        return this.checkPlan(trip.plan, trip.resource, team, job);
    }

    // On the trip it would join or a new trip, of any vessel
    fitsAnywhere(team, job) {
        const
            me      = this,
            vessels = me.scheduler.resourceStore.records.filter(each => !each.isSpecialRow && !each.isGroupHeader);

        return vessels.some(vessel => {
            const { plan } = me.tripFor(vessel, team, job);

            return me.rawCheck(plan, vessel, team, job).valid;
        });
    }

    // A job that fits nowhere today says so, rather than how late this one trip would be
    checkPlan(plan, vessel, team, job, at = null) {
        const
            me     = this,
            result = me.rawCheck(plan, vessel, team, job, at);

        return !result.valid && result.back > me.dispatch.closeOf(vessel) && !me.fitsAnywhere(team, job) ?
            me.rawCheck(plan, vessel, team, job, at, true) : result;
    }

    // Outlines the trips the team fits on, checked once when it is lifted
    markFitting(teamId) {
        const
            me    = this,
            entry = me.waitingTeam(teamId);

        me.clearFitting();
        entry && me.trips.filter(trip => !trip.draft && me.checkDrop(trip, entry.team, entry.job).valid)
            .forEach(trip => me.scheduler.fittingTrips.add(trip));
        me.outlineFitting(true);
    }

    clearFitting() {
        this.outlineFitting(false);
        this.scheduler.fittingTrips.clear();
    }

    // The outline is the trip's class, put on its element now, no redraw (the renderer keeps it on a later one)
    outlineFitting(on) {
        const { scheduler } = this;

        scheduler.fittingTrips.forEach(trip => scheduler.getElementFromEventRecord(trip)
            ?.classList.toggle('ow-trip-fits', on));
    }

    // The vessel's other trips of the day are kept clear of
    rawCheck(plan, vessel, team, job, at = null, nowhere = false) {
        const { dispatch } = this;

        return previewDrop({
            nowhere,
            busy   : busyOf(this.trips, vessel, plan.id),
            trip   : plan,
            team,
            job,
            close  : dispatch.closeOf(vessel),
            limit  : dispatch.limits[vessel.window],
            now    : dispatch.now,
            vessel : vessel.name,
            at
        });
    }

    // Counts the previews ended: DispatchApp#replan previews a held team again only if nothing ended it meanwhile
    generation = 0;

    clearPreview() {
        const trip = this.held?.trip;

        this.generation++;

        // A cell of the week, or a helicopter's refused new trip, previews nothing in the store
        if (trip instanceof TripModel && !trip.isDestroyed) {
            if (trip.draft) {
                this.scheduler.eventStore.remove(trip);
            }
            else {
                trip.layout({ stops : trip.stops });
            }
        }

        this.held = null;
    }

    /**
     * Checks the team again where it is released and books it. The check is the planner's prediction, the booking the
     * engine's: the team leaves the tray and the booking is told only once the engine has placed it and the trip, and
     * every trip that waits for it, is still back in its window. Else the trip is put back and the reason shown
     * @param {String} teamId
     * @param {TripModel|VesselModel|Object|null} target
     * @param {Number|null} [at] Minutes since midnight at the point released, see previewDrop
     * @returns {Promise<Boolean>} Booked
     */
    async dropTeam(teamId, target, at = null) {
        const
            me           = this,
            { dispatch } = me,
            drop         = me.previewDrop(teamId, target, at, true);

        if (!drop?.result.valid) {
            tell(drop?.result.reason ?? 'The team is not waiting');

            return false;
        }

        const
            { team, job } = drop,
            day           = drop.day ?? dispatch.dayIndex,
            { trip, why } = await me.book(drop, day);

        if (why) {
            tell(why);

            return false;
        }

        const on = target.isWeekCell ? `, ${DateHelper.format(dispatch.dateOf(day), 'ddd D')}` : '';

        dispatch.waitingStore.remove(drop.id);
        tell(`${team.name} booked on ${trip.id}${on}, back in port by ${hhmm(trip.endMinute)}`);
        await me.onBooked({ trip : target.isWeekCell ? null : trip, turbine : job.turbine });

        return true;
    }

    // Taken back when the engine's result breaks a window, `why` then says how. The preview is taken off and placed
    // first, so the trips that wait for this one are measured against the plan alone
    async book({ trip, team, job, vessel = trip.resource }, day) {
        const
            me                      = this,
            { project, eventStore } = me.scheduler,
            stop                    = stopOf(team, job),
            fresh                   = trip.draft && { id : trip.id, departs : trip.departs, day };

        me.clearPreview();
        await project.commitAsync();

        const
            midnight = me.dispatch.dateOf(day),
            booked   = fresh ? addTrip(eventStore, vessel, { ...fresh, midnight }, [stop]) : trip,
            before   = !fresh && trip.stops,
            // When each trip that waits for this one is back without the team
            waits    = me.waitingOn(booked).map(link => ({ link, back : link.toEvent.trip.endMinute }));

        before && trip.layout({ stops : [...before, stop] });
        await project.commitAsync();

        const why = me.lateAfterBooking(booked, waits);

        if (why) {
            if (before) {
                trip.layout({ stops : before });
            }
            else {
                eventStore.remove(booked);
            }

            await project.commitAsync();
        }

        return { trip : booked, why };
    }

    // The dependencies from a trip into a stop of another trip
    waitingOn(trip) {
        return this.scheduler.dependencyStore.records.filter(link => !link.isChain && link.fromEvent?.trip === trip &&
            link.toEvent?.trip);
    }

    // The trip is back after its window, or a trip that waits for it now is, and later than it was
    lateAfterBooking(trip, waits) {
        const
            { dispatch } = this,
            closeOf      = each => dispatch.windowsOf(each.day)[each.resource.window];

        if (trip.endMinute > closeOf(trip)) {
            return noGoText(trip.endMinute, closeOf(trip), dispatch.limits[trip.resource.window]);
        }

        for (const { link, back } of waits) {
            const
                dependent = link.toEvent.trip,
                close     = closeOf(dependent);

            if (dependent.endMinute > Math.max(back, close)) {
                return `${link.text}: ${dependent.id} would be back ${hhmm(dependent.endMinute)}, ` +
                    `after its window closes ${hhmm(close)}`;
            }
        }

        return null;
    }

    endDrag() {
        this.clearFitting();
        this.clearPreview();
        this.state.lifted = null;
    }
}
