import { DateHelper } from '@bryntum/core-enterprise';
import { nextSailing, previewDrop, reachable } from './plan/Planner.js';
import TripModel from './model/TripModel.js';
import { busyOf, planBreak, planSnapshot } from './schedule/TripValidator.js';
import { addTrip, nextTripId } from './model/TripData.js';
import { tell } from './util/Message.js';
import { hhmm } from './util/Time.js';

const
    stopOf  = (team, job) => ({ turbine : job.turbine, minutes : job.minutes, team : team.id }),
    newPlan = (id, start, vessel) => ({
        id, start, stops : [], mode : vessel.mode, wait : 0, pax : 0, seats : vessel.seats
    }),
    // A new trip from port, only described until the team is dropped on it
    draftOf = ({ id, start }, vessel) => ({ id, draft : true, departs : start, resource : vessel, turbines : [] });

/**
 * The `handler` TeamDrag calls: lifts a team, checks it where it is held, books it on release. Held over a vessel's
 * row rather than a trip, the team goes on the vessel's best trip (the one it fits on that is back first, else the
 * first, so the tooltip says why), or a new trip from port when none is left to join.
 *
 * The check is synchronous, on the planner's plain values (Planner#previewDrop): the engine is too slow to ask on every
 * pointer move. Nothing is written to the project until the drop, which the engine places.
 */
export default class DropController {
    /**
     * @param {Object} options
     * @param {DispatchState} options.dispatch
     * @param {DispatchScheduler} options.scheduler The Day view
     * @param {DispatchApp} options.state Holds `held`, `lifted` and `booking`
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

    // The chip stays in the tray, dimmed, until the team is booked. The trips it fits on are outlined, checked once
    liftTeam(teamId) {
        const
            me    = this,
            entry = me.waitingTeam(teamId);

        me.state.lifted = teamId;
        me.scheduler.features.dropTarget.fitting = entry ?
            me.trips.filter(trip => me.checkDrop(trip, entry.team, entry.job).valid) : [];
    }

    /**
     * Checks a team where it is held. The hover and the release both go through it, so what is booked is what was
     * shown. The same team over the same target, on the same side of the window's close, keeps its check
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

        return me.held = target ? me.check(teamId, target, blocked) : null;
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
    check(teamId, target, at = null) {
        const
            me    = this,
            entry = me.waitingTeam(teamId);

        if (!entry || target.isDestroyed) {
            return null;
        }

        if (target.isWeekCell) {
            return me.cellDrop(teamId, target);
        }

        const
            { team, job }          = entry,
            { plan, trip, vessel } = me.tripFor(target, team, job),
            close                  = me.dispatch.closeOf(vessel);

        return {
            id     : entry.id,
            target,
            at,
            team,
            job,
            result : me.checkPlan(plan, vessel, team, job, at),
            trip   : trip ?? draftOf(plan, vessel),
            close,
            reach  : reachable(plan, job.minutes, close)
        };
    }

    // `{ trip, plan, vessel }`: the trip under the team if it can still be joined, else the vessel's best trip, else
    // (`trip` null) a new trip from port at the vessel's next sailing
    tripFor(target, team, job) {
        const
            { now }  = this.dispatch,
            joinable = trip => trip.departs > now,
            isTrip   = target instanceof TripModel;

        if (isTrip && joinable(target)) {
            return { trip : target, plan : target.plan, vessel : target.resource };
        }

        const
            vessel = isTrip ? target.resource : target,
            trips  = this.trips.filter(trip => trip.resource === vessel),
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

    /**
     * Checks the team again where it is released and books it. The check is the planner's prediction, the booking the
     * engine's: the team leaves the tray and the booking is told only once the engine has placed it and every trip it
     * moved is still back in its window and clear of its vessel's other trips (planBreak). Else the trip is put back
     * and the reason shown.
     * One change of the plan at a time (DispatchProject#runChange): while the engine places it, the team is reserved
     * (`state.booking`, its card in the tray shows it pending) and no other change starts
     * @param {String} teamId
     * @param {TripModel|VesselModel|Object|null} target
     * @param {Number|null} [at] Minutes since midnight at the point released, see previewDrop
     * @returns {Promise<Boolean>} Booked
     */
    async dropTeam(teamId, target, at = null) {
        const
            me          = this,
            { project } = me.scheduler,
            drop        = me.previewDrop(teamId, target, at, true);

        if (project.changePending) {
            tell('The last change is still being placed, try again');

            return false;
        }

        if (!drop?.result.valid) {
            tell(drop?.result.reason ?? 'The team is not waiting');

            return false;
        }

        return project.runChange(async() => {
            me.state.booking = drop.id;

            try {
                return await me.commitDrop(drop, target);
            }
            finally {
                me.state.booking = null;
            }
        });
    }

    async commitDrop(drop, target) {
        const
            me            = this,
            { dispatch }  = me,
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

    // Taken back when the engine's result breaks the plan (planBreak) or the engine fails, `why` then says how
    async book({ trip, team, job, vessel = trip.resource }, day) {
        const
            me                      = this,
            { project, eventStore } = me.scheduler,
            stop                    = stopOf(team, job),
            fresh                   = trip.draft && { id : trip.id, departs : trip.departs, day },
            before                  = !fresh && trip.plan.stops,
            plan                    = planSnapshot(me.scheduler.weekTrips);

        let booked = fresh ? null : trip, why;

        try {
            if (fresh) {
                booked = addTrip(eventStore, vessel, { ...fresh, midnight : me.dispatch.dateOf(day) }, [stop]);
            }
            else {
                trip.layout({ stops : [...before, stop] });
            }

            await project.commitAsync();
            why = planBreak(me.scheduler, plan, [booked]);
        }
        catch(error) {
            console.warn(error);
            why = `${team.name} could not be booked, the plan is as it was`;
        }

        if (why) {
            if (before) {
                trip.layout({ stops : before });
            }
            else if (booked) {
                eventStore.remove(booked);
            }

            await project.commitAsync();
        }

        return { trip : booked, why };
    }

    endDrag() {
        this.scheduler.features.dropTarget.fitting = [];
        this.held         = null;
        this.state.lifted = null;
    }
}
