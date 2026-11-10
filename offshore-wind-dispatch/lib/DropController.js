import { DateHelper, StringHelper, Toast } from '@bryntum/core-enterprise';
import { nextSailing, previewDrop, reachable } from './plan/Planner.js';
import TripModel from './model/TripModel.js';
import { busyOf } from './schedule/TripValidator.js';
import { addTrip } from './model/TripData.js';
import { hhmm } from './util/Time.js';

const
    // The stop a team's job adds to a trip
    stopOf       = (team, job, preview = false) => ({ turbine : job.turbine, minutes : job.minutes, team : team.id,
        preview }),
    // The plan of a new trip from port, with no stops yet
    newPlan      = (id, start, vessel) => ({
        id, start, stops : [], mode : vessel.mode, wait : 0, change : null, pax : 0, seats : vessel.seats
    }),
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
     * The team held and its check, `{ target, trip, team, job, result, reach, close }` (see previewDrop), `null` while
     * it is over nothing: the app state's
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
     * @param {String} teamId
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
     * Previews a team where it is held and checks it: the one check of a drop. The pointer's hover, its release and
     * the keyboard all go through it, so what is booked is what was shown. Over a trip or a vessel's row of the Day
     * view the trip shows the stop, the map what the trip can still reach, the card the turbine; over a free cell of
     * the Week view a new trip that day is checked (cellDrop). The same team over the same target with the same
     * position against the weather keeps its check
     * @param {String} teamId
     * @param {TripModel|VesselModel|Object|null} target The trip, the vessel's row or the Week view's cell held over
     * @param {Number|null} [at] Minutes since midnight at the point held on the Day view's time axis, none from the
     * keyboard or over the Week view
     * @param {Boolean} [fresh] Checked again even if unchanged, as a booking is
     * @returns {Object|null} `{ target, trip, team, job, result, reach, close, at }`
     */
    previewDrop(teamId, target, at = null, fresh = false) {
        const
            me       = this,
            // Held where the weather is over the vessel's limit: only that position changes the check
            blocked  = me.blockedAt(target, at),
            { held } = me;

        if (!fresh && held?.target === target && held.team.id === teamId && (held.at != null) === (blocked != null)) {
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
        const
            me    = this,
            entry = me.waitingTeam(teamId);

        if (!entry) {
            return null;
        }

        const
            { dispatch }  = me,
            { team, job } = entry,
            { day }       = cell,
            vessel        = me.scheduler.resourceStore.getById(cell.vesselId),
            close         = dispatch.windowsOf(day)[vessel.window],
            now           = day ? dispatch.day.dayStart * 60 : dispatch.days[0].now,
            start         = day ? dispatch.firstSailing : nextSailing([], now),
            plan          = newPlan(me.newTripId(vessel), start, vessel),
            limit         = dispatch.limits[vessel.window],
            result        = previewDrop({ trip : plan, team, job, close, limit, now, vessel : vessel.name });

        return {
            target : cell,
            at     : null,
            trip   : { id : plan.id, draft : true, departs : start, resource : vessel },
            team,
            job,
            result,
            close,
            reach  : reachable(plan, job.minutes, close),
            plan,
            vessel,
            day
        };
    }

    /**
     * The ID of a vessel's next trip: its trips are numbered through the week, "SR-7"
     * @param {VesselModel} vessel
     * @returns {String}
     */
    newTripId(vessel) {
        const numbers = this.scheduler.weekTrips.filter(trip => trip.resource === vessel && !trip.draft)
            .map(trip => Number(String(trip.id).split('-').at(-1)) || 0);

        return `${String(vessel.id).toUpperCase()}-${Math.max(0, ...numbers) + 1}`;
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
            close                  = me.dispatch.closeOf(vessel),
            stop                   = stopOf(team, job, true),
            result                 = me.checkPlan(plan, vessel, team, job, at);

        // The previewed stop is a leg of the trip too, after the last one, on a new trip if there is none to join. Not
        // on a helicopter, which never takes a team: its refusal is explained without a record in the plan, the new
        // trip it would be only described, as a free cell of the Week view is (cellDrop)
        const
            { midnight, dayIndex } = me.dispatch,
            heli                   = vessel.mode === 'heli',
            shown                  = trip ?? (heli ?
                { id : plan.id, draft : true, departs : plan.start, resource : vessel } :
                addTrip(me.scheduler.eventStore, vessel,
                    { id : plan.id, departs : plan.start, midnight, draft : true, day : dayIndex }, [stop]));

        if (trip && !heli) {
            trip.layout({ stops : [...trip.stops, stop] });
        }

        return me.held = {
            target, at, trip : shown, team, job, result, close, reach : reachable(plan, job.minutes, close)
        };
    }

    /**
     * The trip a team held over a trip or a vessel's row goes on, and its plan: the trip under it if it can still be
     * joined, else the vessel's best trip, else a new trip from port at the vessel's next sailing (`trip` is `null`)
     * @param {TripModel|VesselModel} target
     * @param {Object} team
     * @param {Object} job
     * @returns {Object} `{ trip, plan, vessel }`
     */
    tripFor(target, team, job) {
        const
            me       = this,
            { now }  = me.dispatch,
            joinable = trip => !trip.draft && trip.status !== 'moved' && trip.departs > now;

        const isTrip = target instanceof TripModel;

        if (isTrip && joinable(target)) {
            return { trip : target, plan : target.plan, vessel : target.resource };
        }

        const
            vessel = isTrip ? target.resource : target,
            trips  = me.trips.filter(trip => trip.resource === vessel && !trip.draft),
            open   = trips.filter(joinable).map(trip => ({ trip, plan : trip.plan, vessel }));

        if (open.length) {
            const checked = open.map(option => ({ ...option, result : me.rawCheck(option.plan, vessel, team, job) }));

            return checked.filter(option => option.result.valid).sort((a, b) => a.result.back - b.result.back)[0] ??
                checked[0];
        }

        // None to join: a new trip from port, once the vessel is back from its last one
        const backs = trips.filter(trip => trip.status !== 'moved').map(trip => trip.endMinute);

        return {
            trip : null,
            vessel,
            plan : newPlan(me.newTripId(vessel), nextSailing(backs, now), vessel)
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
        entry && me.dropTargets().filter(trip => me.checkDrop(trip, entry.team, entry.job).valid)
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
     * (previewDrop) against the plan as it is now, booked when it fits, else the reason is shown
     * @param {String} teamId
     * @param {TripModel|VesselModel|Object|null} target
     * @param {Number|null} [at] Minutes since midnight at the point released, see previewDrop
     */
    dropTeam(teamId, target, at = null) {
        const
            me   = this,
            drop = me.previewDrop(teamId, target, at, true);

        if (!drop?.result.valid) {
            tell(drop?.result.reason ?? 'The team is not waiting');

            return;
        }

        if (target.isWeekCell) {
            me.bookCell(drop);

            return;
        }

        const { trip, team, job, result } = drop;

        // Booked: the previewed stop becomes the trip's, a draft trip a trip of the plan
        me.held    = null;
        trip.draft = false;
        trip.layout({ stops : [...trip.stops, stopOf(team, job)] });
        me.dispatch.waitingStore.remove(team.id);
        me.onBooked({ trip, turbine : job.turbine });

        tell(`${team.name} booked on ${trip.id}, back in port by ${hhmm(result.back)}`);
    }

    /**
     * Books a team on a new trip on a vessel's free day of the week: the trip goes in the plan of that day
     * @param {Object} drop See cellDrop
     */
    bookCell({ team, job, result, plan, vessel, day }) {
        const me = this;

        me.held = null;
        // Its departure in minutes of that day
        addTrip(me.scheduler.eventStore, vessel,
            { id : plan.id, departs : plan.start, midnight : me.dispatch.dateOf(day), day }, [stopOf(team, job)]);
        me.dispatch.waitingStore.remove(team.id);
        me.onBooked({ trip : null, turbine : job.turbine });

        tell(`${team.name} booked on ${plan.id}, ${DateHelper.format(me.dispatch.dateOf(day), 'ddd D')}, ` +
            `back in port by ${hhmm(result.back)}`);
    }

    /**
     * The trips a team held from the keyboard steps through: those still on the day, by vessel row then departure
     * @returns {TripModel[]}
     */
    dropTargets() {
        const { resourceStore } = this.scheduler;

        return this.trips.filter(trip => trip.status !== 'moved' && trip.resource && !trip.draft)
            .sort((a, b) => resourceStore.indexOf(a.resource) - resourceStore.indexOf(b.resource) ||
                a.startDate - b.startDate);
    }

    endDrag() {
        this.clearFitting();
        this.clearPreview();
        this.state.lifted = null;
    }
}
