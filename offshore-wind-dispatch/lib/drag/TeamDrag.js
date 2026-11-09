import { DragHelper, Widget } from '@bryntum/core-enterprise';
import { createChip, showOnChip } from './DragChip.js';
import { toMinutes } from '../util/Time.js';
import KeyboardDrag, { chipSelector } from './KeyboardDrag.js';
// Also registers the tooltip type used below
import './DropTooltip.js';

/**
 * Dragging a team from the tray onto a vessel. Bryntum's DragHelper runs the drag: the threshold, the proxy following
 * the pointer for mouse, pen and touch, Escape, the animated return of an aborted or refused drop. The whole time axis
 * of the schedule is its drop target: over a trip bar, or anywhere on a vessel's row, the app previews the stop the
 * team would get (DispatchApp#previewDrop), on that trip or the vessel's best one, or on a new trip from port: the trip
 * shows it, the map rings the turbines the trip can still reach, and a Bryntum Tooltip (DropTooltip), shown by the
 * point the team is held at, says when the trip is back against the window. The dispatch check is the drag's
 * validation: a team that does not fit marks the drag invalid (`context.valid`), and released there the app says why.
 * The proxy says it too (DragChip), as it moves, from the same check: "Fits SR-1, back 12:40" or "35 min after
 * window", neutral over empty space. Released where it fits, the app books it.
 *
 * The keyboard drag is KeyboardDrag, which works through this class.
 *
 * The trip under the pointer is found from the event element's `data-event-id`, which Scheduler sets on each bar, the
 * vessel from the row's `data-id`.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/helper/DragHelper
 * https://bryntum.com/products/scheduler/examples/drag-from-grid/
 */
export default class TeamDrag {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.source The element holding the team chips (`.ow-team[data-team]`)
     * @param {Scheduler.view.Scheduler} options.scheduler
     * @param {WeekBoard} options.board The Week view: while it shows, its free cells are the drop targets
     * @param {Object} options.handler `{ liftTeam(id), previewDrop(id, trip), dropTeam(id, trip), endDrag(),
     * dropTargets() }`
     */
    constructor({ source, scheduler, board, handler }) {
        const me = this;

        Object.assign(me, { source, scheduler, board, handler });

        me.keys = new KeyboardDrag({ drag : me });

        me.dragHelper = new DragHelper({
            callOnFunctions      : true,
            outerElement         : source,
            targetSelector       : chipSelector,
            // The trips and the vessels' rows, the cells of the Week view
            dropTargetSelector   : '.ow-scheduler .b-time-axis-sub-grid, .ow-week-board .b-time-axis-sub-grid',
            // A small chip centred on the pointer, the team's place in the tray stays, dimmed
            cloneTarget          : true,
            autoSizeClonedTarget : false,
            constrain            : false,
            createProxy          : element => me.createProxy(element.dataset.team),
            // A team held from the keyboard goes back first
            isElementDraggable   : () => {
                me.keys.endHeld();

                return true;
            },
            onDragStart : ({ context }) => me.onDragStart(context),
            onDrag      : ({ context, event }) => me.onDrag(context, event),
            onDrop      : ({ context }) => me.onDrop(context),
            onReset     : () => me.end()
        });
    }

    destroy() {
        this.dragHelper.abort(true);
        this.dragHelper.destroy();
        this.keys.destroy();
    }

    get isDragging() {
        return Boolean(this.team);
    }

    /**
     * Shows a team held over a trip without a pointer (KeyboardDrag#showHeld)
     * @param {String} teamId
     * @param {TripModel} trip
     */
    showHeld(teamId, trip) {
        this.keys.showHeld(teamId, trip);
    }

    //region Pointer, DragHelper

    // The proxy DragHelper drags, the team's compact chip
    createProxy(teamId) {
        const { team, job } = this.handler.waitingTeam(teamId);

        return createChip(team, job);
    }

    onDragStart(context) {
        this.proxy = context.element;
        this.lift(context.grabbed.dataset.team);
    }

    onDrag(context, event) {
        const
            me    = this,
            point = { x : event.clientX, y : event.clientY };

        // Kept for refresh(), the plan may change under a still pointer
        me.point = point;

        // The dispatch check validates the drop: over a trip or a row where the team fits
        context.valid = Boolean(me.hover(me.targetAt(point), point)?.result.valid);
    }

    // Released over a trip or a row, booked if it fits, else the app says why (DropPreview#dropTeam). Booked before
    // the drag ends, so a new trip previewed for the team is kept
    onDrop() {
        const
            me     = this,
            // The preview redraws the trip under the pointer, its element then may not be the one of the last move
            target = me.point ? me.targetAt(me.point) : null,
            team   = me.team;

        if (target && team) {
            me.handler.dropTeam(team, target);
        }

        me.end();
    }

    /**
     * Checks the team again where it is held, after the plan or the forecast changed (DispatchApp#replan): the trip
     * under the pointer, or the trip held over without one, previewed and its tooltip redrawn against the plan as it is
     * now. From the keyboard, the trips the arrows step through are read again, the forecast may have moved some to
     * tomorrow
     */
    refresh() {
        const
            me   = this,
            trip = me.handler.drop?.target;

        if (!me.isDragging) {
            return;
        }

        me.keys.refreshTrips(trip);

        if (me.point) {
            me.hover(me.targetAt(me.point), me.point);
        }
        else if (trip) {
            me.keys.holdOver(trip);
        }
        // Held without a pointer, the team no longer waits: put it back
        else {
            me.end();
        }
    }

    /**
     * What a team held at a point is over: a trip bar (a draft trip counts as its vessel's row), else a vessel's row in
     * the time axis, else nothing. In the Week view, a vessel's day without a trip (WeekBoard#cellAt)
     * @param {{x: Number, y: Number}} point In the viewport
     * @returns {TripModel|VesselModel|Object|null}
     */
    targetAt(point) {
        const { board } = this;

        return board && !board.hidden ? board.cellAt(point) : this.rowTargetAt(point);
    }

    // What a team held at a point of the Day view is over, see targetAt
    rowTargetAt({ x, y }) {
        const
            { scheduler } = this,
            axis          = scheduler.timeAxisSubGridElement,
            elements      = document.elementsFromPoint(x, y).filter(element => axis?.contains(element)),
            wrap          = elements.find(element => element.matches('.b-sch-event-wrap[data-event-id]')),
            trip          = wrap && scheduler.eventStore.getById(wrap.dataset.eventId)?.trip,
            row           = elements.find(element => element.matches('.b-grid-row[data-id]')),
            vessel        = row && scheduler.resourceStore.getById(row.dataset.id);

        if (trip && !trip.draft) {
            return trip;
        }

        return vessel && !vessel.isSpecialRow && !vessel.isGroupHeader ? vessel : trip?.resource ?? null;
    }

    //endregion

    //region Shared with the keyboard drag

    // Lifts the team from the tray, with the tooltip of the trip it is over
    lift(teamId) {
        const me = this;

        me.team = teamId;
        // The trip's own tooltip stays away while a team is held: the drop tooltip speaks for the trip
        me.scheduler.features.eventTooltip.disabled = true;
        me.handler.liftTeam(teamId);
        me.tip = Widget.create({ type : 'droptooltip' });
    }

    /**
     * Previews the team on a trip or a vessel, or none, and shows the tooltip below the point. The tooltip, the proxy
     * and the trip's highlight all show this one check
     * @param {TripModel|VesselModel|null} target
     * @param {{x: Number, y: Number}} point In the viewport
     * @returns {Object|null} See DispatchApp#previewDrop
     */
    hover(target, point) {
        const
            me   = this,
            // Where on the time axis the team is held, the keyboard has no point
            at   = me.keys.keyboard ? null : toMinutes(me.scheduler.getDateFromCoordinate(point.x, null, false)),
            // A cell of the week is the whole day
            drop = target?.isWeekCell ? me.handler.previewCell(me.team, target) :
                me.handler.previewDrop(me.team, target, at);

        showOnChip(me.keys.held ?? me.proxy, drop);

        if (drop) {
            me.tip.showDrop(drop, point, Boolean(me.keys.keyboard));
        }
        else {
            me.tip.hide();
        }

        return drop;
    }

    // The team goes back to the tray, or was booked, the preview ends
    end() {
        const me = this;

        if (me.team) {
            me.tip.destroy();
            me.tip = me.team = me.point = me.proxy = null;
            me.scheduler.features.eventTooltip.disabled = false;
            me.handler.endDrag();
        }
    }

    //endregion
}
