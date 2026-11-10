import { DateHelper, StringHelper, Toast } from '@bryntum/core-enterprise';
import { nextSailing, noGoText, previewDrop, reachable } from './plan/Planner.js';
import TripModel from './model/TripModel.js';
import { busyOf } from './schedule/TripValidator.js';
import { addTrip, nextTripId } from './model/TripData.js';
import { hhmm } from './util/Time.js';

const
    // The stop a team's job adds to a trip
    stopOf       = (team, job, preview = false) => ({ turbine : job.turbine, minutes : job.minutes, team : team.id,
        preview }),
    // The plan of a new trip from port, with no stops yet
    newPlan      = (id, start, vessel) => ({
        id, start, stops : [], mode : vessel.mode, wait : 0, pax : 0, seats : vessel.seats
    }),
    // A new trip only described, not in the plan: on a free cell of the Week view, or the trip a helicopter refuses
    draftOf      = (plan, vessel) => ({ id : plan.id, draft : true, departs : plan.start, resource : vessel }),
    // What a drop gave, a Toast: booked, or why not. The text is encoded, the reason comes from the plan
    tell         = text => Toast.show({ html : StringHelper.encodeHtml(text), cls : 'ow-toast-message' });

/**
 * The app's side of dragging a team onto a vessel, the `handler` TeamDrag calls (see TeamDrag's DropHandler): lifting
 * the team from the tray, previewing its stop on a trip and checking it against the weather window, booking it on
 * release. The team held and its check are the app state's `held` (AppState), which DispatchApp#replan checks again
 * whenever the plan or the forecast changes; the map and the card follow it.
 *
 * A team is held over a trip bar or anywhere on a vessel's row. Over a trip it can still join, the stop goes on that
 * trip. Elsewhere on the row it goes on the vessel's best trip: the one it fits on that is back first, else the first
 * one, so the tooltip says why it does not fit. A vessel with no trip left to join gets a new trip from port at its
 * next sailing, a draft trip shown until the team is booked or moves on.
 *
 * The check runs on the planner's plain values (Planner#previewDrop), synchronously: the scheduling engine is too slow
 * to calculate a preview on every pointer move. Once a team is booked, the engine places its stop.
 *
 * DispatchApp creates it with what it needs, and is told through a callback when a team was booked (the plan
 * changed).
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Toast
 */
export default class DropController {
    /**
     * @param {Object} options
     * @param {DispatchState} options.dispatch
     * @param {DispatchScheduler} options.scheduler The Day view, whose event store holds the trips
     * @param {AppState} options.state Holds the team lifted and the team held with its check
     * @param {Function} options.onBooked Called with `{ trip, turbine }` once a team is booked: on a trip of the Day
     * view, or (no `trip`) on a new trip on a day of the Week view
     */
    constructor({ dispatch, scheduler, state, onBooked }) {
        Object.assign(this, { dispatch, scheduler, state, onBooked });
    }

    /**
     * The team held and its check, `{ id, target, trip, team, job, result, reach, close }` (see previewDrop), `null`
     * while it is over nothing: the app state's
     * @property {Object|null}
     */
    get held() {
        return this.state.held;
    }

    set held(held) {
        this.state.held = held;
    }

    /**
     * The trips of the day shown
     * @property {TripModel[]}
     */
    get trips() {
        return this.scheduler.trips;
    }

    /**
     * A team waiting at the port, and its job
     * @param {String} teamId The waiting record's ID, see WaitingTeamModel
     * @returns {Object} `{ team, job }`
     */
    waitingTeam(teamId) {
        return this.dispatch.waitingStore.getById(teamId);
    }

    // The team's chip stays in the tray, dimmed (TeamTray follows the state's `lifted`)
    liftTeam(teamId) {
        this.state.lifted = teamId;
        this.markFitting(teamId);
    }

    /**
     * Previews a team where it is held and checks it: the one check of a drop. The pointer's hover and its release
     * both go through it, so what is booked is what was shown. Over a trip or a vessel's row of the Day
     * view the trip shows the stop, the map what the trip can still reach, the card the turbine; over a free cell of
     * the Week view a new trip that day is checked (cellDrop). The same team over the same target with the same
     * position against the weather keeps its check
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
            // Held where the weather is over the vessel's limit: only that position changes the check
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
     * A team held over a vessel's day without a trip in the Week view (WeekBoard#cellAt): a new trip from port that
     * day, at the next sailing today, at the first sailing on a later day, checked against that day's window
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

    /**
     * Previews a team's stop on the trip it goes on, checked against the plan and the forecast as they are now
     * @param {String} teamId
     * @param {TripModel|VesselModel} target
     * @param {Number|null} [at] Minutes since midnight at the point held, when that is in the vessel's no-go range
     * @returns {Object|null} See previewDrop, `null` when the team no longer waits
     */
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

    // The previewed stop is a leg of the trip too, after the last one, on a new draft trip if there is none to join.
    // Not on a helicopter, which never takes a team: its refusal is explained without a record in the plan, the new
    // trip it would be only described, as a free cell of the Week view is (cellDrop)
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

    /**
     * The trip a team held over a trip or a vessel's row goes on, and its plan: the trip under it if it can still be
     * joined, else the vessel's best trip (the one it fits on that is back first, else the first), else a new trip from
     * port at the vessel's next sailing (`trip` is `null`)
     * @param {TripModel|VesselModel} target
     * @param {Object} team
     * @param {Object} job
     * @returns {Object} `{ trip, plan, vessel }`
     */
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

    /**
     * Whether a team's job fits on a trip, see Planner#previewDrop
     * @param {TripModel} trip
     * @param {Object} team
     * @param {Object} job
     * @returns {Object}
     */
    checkDrop(trip, team, job) {
        return this.checkPlan(trip.plan, trip.resource, team, job);
    }

    /**
     * Whether a team's job fits anywhere today: on the trip it would join, or on a new trip, of any vessel
     * @param {Object} team
     * @param {Object} job
     * @returns {Boolean}
     */
    fitsAnywhere(team, job) {
        const
            me      = this,
            vessels = me.scheduler.resourceStore.records.filter(each => !each.isSpecialRow && !each.isGroupHeader);

        return vessels.some(vessel => {
            const { plan } = me.tripFor(vessel, team, job);

            return me.rawCheck(plan, vessel, team, job).valid;
        });
    }

    // Whether a team's job fits on a trip's plan, on a vessel. A job that fits nowhere today says so, rather than how
    // late this one trip would be
    checkPlan(plan, vessel, team, job, at = null) {
        const
            me     = this,
            result = me.rawCheck(plan, vessel, team, job, at);

        return !result.valid && result.back > me.dispatch.closeOf(vessel) && !me.fitsAnywhere(team, job) ?
            me.rawCheck(plan, vessel, team, job, at, true) : result;
    }

    /**
     * Outlines the trips a team would fit on, for as long as it is dragged: the same dispatch check as the drop, run
     * once when the team is lifted
     * @param {String} teamId
     */
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

    // The dispatch check itself, see Planner#previewDrop. The vessel's other trips of the day are kept clear of
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
     * Counts the previews ended: a change of the plan awaited while a team is held shows its preview again only if
     * nothing ended it meanwhile (DispatchApp#replan)
     * @property {Number}
     */
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
     * Released over a trip, a vessel's row or a free cell of the Week view: checked again there as the preview is
     * (previewDrop) against the plan as it is now, then booked when it fits, else the reason is shown.
     *
     * The check is the planner's prediction; the booking is the engine's. So the stop is laid out and the engine
     * places it (`commitAsync()`) before anything is told: only when the trip, and every trip with a stop that waits
     * for it, is still back before its window does the team leave the tray and the booking get announced. Else the
     * trip is put back as it was and the reason shown. The preview is taken off and placed first, so the trips that
     * wait for this one are measured against the plan alone
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

    // Lays the team's stop out on its trip, or on a new trip from port (a draft, or a free cell of the Week view), and
    // lets the engine place it. Taken back when the engine's result breaks a window, `why` then says how
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
            // The trips that wait for this one, and when each is back without the team
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

    // The dependencies of the plan from a trip into a stop of another trip
    waitingOn(trip) {
        return this.scheduler.dependencyStore.records.filter(link => !link.isChain && link.fromEvent?.trip === trip &&
            link.toEvent?.trip);
    }

    // Why a booking the engine has placed cannot stay: the trip is back after its window, or a trip that waits for it
    // now is, later than it was
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
