import { StringHelper, Toast } from '@bryntum/core-enterprise';
import { previewDrop, reachable } from './plan/Planner.js';
import { hhmm } from './util/Time.js';

// The stop a team's job adds to a trip
const stopOf = (team, job, preview = false) => ({ turbine : job.turbine, minutes : job.minutes, team : team.id,
    preview });

/**
 * The app's side of dragging a team onto a trip (TeamDrag calls it): lifting the team from the tray, previewing its
 * stop on the trip under it and checking it against the weather window, booking it on release. The team held and its
 * check are `drop`, which DispatchApp#replan checks again whenever the plan or the forecast changes.
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
        this.lifted = teamId;
        this.widgetMap.tray.element.querySelector(`.ow-team[data-team="${CSS.escape(teamId)}"]`)
            ?.classList.add('ow-team-lifted');
    }

    /**
     * Previews a team on a trip: the trip shows the stop, the map what the trip can still reach, the card the turbine
     * @param {String} teamId
     * @param {TripModel|null} trip
     * @returns {Object|null} `{ trip, team, job, result, reach, close }`
     */
    previewDrop(teamId, trip) {
        const me = this;

        if (me.drop?.trip === trip && me.drop?.team.id === teamId) {
            return me.drop;
        }

        me.clearPreview();

        if (trip) {
            me.holdPreview(teamId, trip);
        }

        me.refreshSide();

        return me.drop;
    }

    /**
     * Previews a team's stop on a trip and checks it against the plan and the forecast as they are now
     * @param {String} teamId
     * @param {TripModel} trip
     * @returns {Object|null} See previewDrop, `null` when the team no longer waits
     */
    holdPreview(teamId, trip) {
        const
            me    = this,
            entry = me.dispatch.waitingTeams.find(({ team }) => team.id === teamId);

        if (!entry || trip.isDestroyed) {
            return null;
        }

        const
            { team, job } = entry,
            close         = me.dispatch.closeOf(trip.resource),
            result        = me.checkDrop(trip, team, job);

        // The previewed stop is a leg of the trip too, after the last one
        trip.layout({ stops : [...trip.stops, stopOf(team, job, true)] });

        return me.drop = { trip, team, job, result, close, reach : reachable(trip.plan, job.minutes, close) };
    }

    // Whether a team's job fits on a trip, see Planner#previewDrop
    checkDrop(trip, team, job) {
        const { dispatch } = this;

        return previewDrop({
            trip   : trip.plan,
            team,
            job,
            close  : dispatch.closeOf(trip.resource),
            now    : dispatch.now,
            vessel : trip.resource.name
        });
    }

    clearPreview() {
        const trip = this.drop?.trip;

        if (trip && !trip.isDestroyed) {
            trip.layout({ stops : trip.stops });
        }

        this.drop = null;
    }

    // Released over a trip: booked when it fits
    dropTeam(teamId, trip) {
        const
            me            = this,
            { dispatch }  = me,
            { team, job } = dispatch.waitingTeams.find(entry => entry.team.id === teamId) ?? {},
            result        = team && me.checkDrop(trip, team, job);

        if (!result?.valid) {
            Toast.show({
                html : StringHelper.encodeHtml(result?.reason ?? 'The team is not waiting'),
                cls  : 'ow-toast-message'
            });

            return;
        }

        trip.layout({ stops : [...trip.stops, stopOf(team, job)] });
        dispatch.waiting = dispatch.waiting.filter(turbine => turbine !== job.turbine);
        me.selectedTurbine = job.turbine;
        me.scheduler.selectEvent(trip);
        me.onPlanChange();

        Toast.show({
            html : StringHelper.xss`${team.name} booked on ${trip.id}, back at port ${hhmm(result.back)}`,
            cls  : 'ow-toast-message'
        });
    }

    /**
     * The trips a team held from the keyboard steps through: those still on the day, by vessel row then departure
     * @returns {TripModel[]}
     */
    dropTargets() {
        const { resourceStore } = this.scheduler;

        return this.trips.filter(trip => trip.status !== 'moved' && trip.resource)
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
