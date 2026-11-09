import { StringHelper, Toast } from '@bryntum/core-enterprise';
import { nextSailing, previewDrop, reachable } from './plan/Planner.js';
import TripModel from './model/TripModel.js';
import { addTrip } from './model/TripData.js';
import { hhmm } from './util/Time.js';

// The stop a team's job adds to a trip
const stopOf = (team, job, preview = false) => ({ turbine : job.turbine, minutes : job.minutes, team : team.id,
    preview });

/**
 * The app's side of dragging a team onto a vessel (TeamDrag calls it): lifting the team from the tray, previewing its
 * stop on a trip and checking it against the weather window, booking it on release. The team held and its check are
 * `drop`, which DispatchApp#replan checks again whenever the plan or the forecast changes.
 *
 * A team is held over a trip bar or anywhere on a vessel's row. Over a trip it can still join, the stop goes on that
 * trip. Elsewhere on the row it goes on the vessel's best trip: the one it fits on that is back first, else the first
 * one, so the tooltip says why it does not fit. A vessel with no trip left to join gets a new trip from port at its
 * next sailing, a draft trip shown until the team is booked or moves on.
 *
 * A mixin of DispatchApp, which provides `dispatch`, `trips`, `scheduler`, `refreshSide()` and `onPlanChange()`.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Toast
 */
export default Target => class DropPreview extends Target {
    static $name = 'DropPreview';

    /**
     * A team waiting at the port, and its job
     * @param {String} teamId
     * @returns {Object} `{ team, job }`
     */
    waitingTeam(teamId) {
        return this.dispatch.waitingTeams.find(({ team }) => team.id === teamId);
    }

    // The team's chip stays in the tray, dimmed. Not drawn anew, DragHelper holds on to the chip it drags from
    liftTeam(teamId) {
        const chip = this.widgetMap.tray.chipOf(teamId);

        this.lifted = teamId;

        if (chip) {
            chip.lifted = true;
        }
    }

    /**
     * Previews a team on a trip or a vessel: the trip shows the stop, the map what the trip can still reach, the card
     * the turbine
     * @param {String} teamId
     * @param {TripModel|VesselModel|null} target The trip or the vessel's row the team is held over
     * @param {Number|null} [at] Minutes since midnight at the point held on the time axis, none from the keyboard
     * @returns {Object|null} `{ target, trip, team, job, result, reach, close }`
     */
    previewDrop(teamId, target, at = null) {
        const
            me      = this,
            vessel  = target instanceof TripModel ? target.resource : target,
            // Held where the weather is over the vessel's limit
            blocked = at != null && at >= me.dispatch.closeOf(vessel);

        if (me.drop?.target === target && me.drop?.team.id === teamId && (me.drop.at != null) === blocked) {
            return me.drop;
        }

        me.clearPreview();

        if (target) {
            me.holdPreview(teamId, target, blocked ? at : null);
        }

        me.refreshSide();

        return me.drop;
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

        const
            { team, job }          = entry,
            { plan, trip, vessel } = me.tripFor(target, team, job),
            close                  = me.dispatch.closeOf(vessel),
            result          = me.checkPlan(plan, vessel, team, job, at),
            stop           = stopOf(team, job, true);

        // The previewed stop is a leg of the trip too, after the last one, on a new trip if there is none to join. Not
        // on a helicopter, which never takes a team
        const held = trip ?? addTrip(me.scheduler.eventStore, vessel,
            { id : plan.id, departs : plan.start, draft : true }, [stop]);

        if (trip && vessel.mode !== 'heli') {
            trip.layout({ stops : [...trip.stops, stop] });
        }

        return me.drop = {
            target, at, trip : held, team, job, result, close, reach : reachable(plan, job.minutes, close)
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
            const checked = open.map(option => ({ ...option, result : me.checkPlan(option.plan, vessel, team, job) }));

            return checked.filter(option => option.result.valid).sort((a, b) => a.result.back - b.result.back)[0] ??
                checked[0];
        }

        // None to join: a new trip from port, once the vessel is back from its last one
        const
            backs  = trips.filter(trip => trip.status !== 'moved').map(trip => trip.endMinute),
            prefix = trips[0]?.id.replace(/-\d+$/, '') ?? String(vessel.id).toUpperCase();

        return {
            trip : null,
            vessel,
            plan : {
                id     : `${prefix}-${trips.length + 1}`,
                start  : nextSailing(backs, now),
                stops  : [],
                mode   : vessel.mode,
                wait   : 0,
                change : null,
                pax    : 0,
                seats  : vessel.seats
            }
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

    // Whether a team's job fits on a trip's plan, on a vessel
    checkPlan(plan, vessel, team, job, at = null) {
        const { dispatch } = this;

        return previewDrop({
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

    clearPreview() {
        const trip = this.drop?.trip;

        if (trip && !trip.isDestroyed) {
            if (trip.draft) {
                this.scheduler.eventStore.remove(trip);
            }
            else {
                trip.layout({ stops : trip.stops });
            }
        }

        this.drop = null;
    }

    /**
     * Released over a trip or a vessel's row: booked when it fits, else the reason is shown
     * @param {String} teamId
     * @param {TripModel|VesselModel} target
     */
    dropTeam(teamId, target) {
        const me = this;

        let { drop } = me;

        if (drop?.team.id !== teamId || drop.target !== target) {
            me.clearPreview();
            drop = target ? me.holdPreview(teamId, target) : null;
        }

        if (!drop?.result.valid) {
            Toast.show({
                html : StringHelper.encodeHtml(drop?.result.reason ?? 'The team is not waiting'),
                cls  : 'ow-toast-message'
            });

            return;
        }

        const { trip, team, job, result } = drop;

        // Booked: the previewed stop becomes the trip's, a draft trip a trip of the plan
        me.drop    = null;
        trip.draft = false;
        trip.layout({ stops : [...trip.stops, stopOf(team, job)] });
        me.dispatch.waiting = me.dispatch.waiting.filter(turbine => turbine !== job.turbine);
        me.selectedTurbine  = job.turbine;
        me.scheduler.selectEvent(trip);
        me.onPlanChange();

        Toast.show({
            html : StringHelper.xss`${team.name} booked on ${trip.id}, back in port by ${hhmm(result.back)}`,
            cls  : 'ow-toast-message'
        });
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
        this.clearPreview();
        this.lifted = null;
        this.widgetMap.tray.draw(this.dispatch.waitingTeams);
        this.refreshSide();
    }
};
