import { DateHelper, DomHelper, DragHelper, Widget } from '@bryntum/core-enterprise';
import { createChip, showOnChip } from '../TeamChip.js';
// Also registers the tooltip type used below
import './DropTooltip.js';

/**
 * Dragging a team from the tray onto a vessel, run by Bryntum's DragHelper. The pointer side only: the handler
 * (DropController) previews, checks and books, and that one check sets `context.valid`, the proxy's colour and the
 * DropTooltip.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/helper/DragHelper
 * https://bryntum.com/products/scheduler/examples/drag-from-grid/
 */
export default class TeamDrag {
    /**
     * @param {Object} options
     * @param {TeamTray} options.tray
     * @param {Scheduler.view.Scheduler} options.scheduler
     * @param {WeekBoard} options.board While it shows, its free cells are the drop targets
     * @param {DropController} options.handler
     */
    constructor({ tray, scheduler, board, handler }) {
        const me = this;

        Object.assign(me, { tray, scheduler, board, handler });

        me.dragHelper = new DragHelper({
            callOnFunctions      : true,
            outerElement         : tray.element,
            targetSelector       : '.ow-team[data-team]',
            // A small chip centred on the pointer, the team's place in the tray stays, dimmed
            cloneTarget          : true,
            autoSizeClonedTarget : false,
            constrain            : false,
            createProxy          : element => createChip(handler.waitingTeam(element.dataset.team).team),
            onDragStart          : ({ context }) => me.onDragStart(context),
            onDrag               : ({ context, event }) => me.onDrag(context, event),
            onDrop               : () => me.onDrop(),
            onReset              : () => me.end()
        });
    }

    destroy() {
        this.dragHelper.abort(true);
        this.dragHelper.destroy();
        this.end();
    }

    get isDragging() {
        return Boolean(this.team);
    }

    /**
     * Only for the `?state=drag` URL state (the screenshots): holds a team over a trip as a pointer resting on its
     * previewed stop would, with no pointer. Escape puts it back
     * @param {String} teamId
     * @param {TripModel} trip
     * @returns {Promise} Resolves once it is shown
     */
    async showHeld(teamId, trip) {
        const
            me                     = this,
            { scheduler, handler } = me,
            // On the trip, or on a new trip from port when the trip can no longer be joined
            leg                    = () => handler.held?.trip.legRecords?.find(each => each.preview);

        me.lift(teamId);
        me.target = trip;
        me.proxy = document.body.appendChild(createChip(handler.waitingTeam(teamId).team));
        me.onKey = event => event.key === 'Escape' && me.end();
        document.addEventListener('keydown', me.onKey);

        // The stop's place is known once the engine has placed it and NestedEvents has drawn it, a frame later
        handler.previewDrop(teamId, trip);
        await scheduler.project.commitAsync();

        for (let frame = 0; frame < 30 && leg() && !scheduler.getElementFromEventRecord(leg()); frame++) {
            await new Promise(resolve => requestAnimationFrame(resolve));
        }

        const rect = leg() && scheduler.getElementFromEventRecord(leg())?.getBoundingClientRect();

        if (me.team === teamId) {
            me.point = rect ? { x : rect.left + rect.width / 2, y : rect.top + 8 } :
                { x : innerWidth / 2, y : innerHeight / 2 };
            DomHelper.setTranslateXY(me.proxy, me.point.x - 20, me.point.y + 8);
            me.hover(trip, me.point);
        }
    }

    onDragStart(context) {
        const me = this;

        // A team held by `?state=drag` goes back first
        me.end();
        me.proxy = context.element;
        me.lift(context.grabbed.dataset.team);
    }

    onDrag(context, event) {
        const me = this;

        me.point = { x : event.clientX, y : event.clientY };
        // Over anything but a trip or a row where the team fits, the drop is invalid and the chip goes back
        context.valid = Boolean(me.hover(me.targetAt(me.point), me.point)?.result.valid);
    }

    // The preview redraws the trip under the pointer, so the target is found again
    onDrop() {
        const
            me     = this,
            target = me.point ? me.targetAt(me.point) : null;

        if (target && me.team) {
            me.handler.dropTeam(me.team, target, me.minuteAt(target, me.point));
        }

        me.end();
    }

    // Minutes since midnight on the Day view's time axis. None over a cell of the week, which is the whole day
    minuteAt(target, point) {
        const
            { scheduler } = this,
            date          = target && !target.isWeekCell ? scheduler.getDateFromCoordinate(point.x, null, false) : null;

        return date ? DateHelper.diff(scheduler.dispatch.midnight, date, 'minute') : null;
    }

    // Called by DispatchApp#replan: the pointer may be still while the trips move under it
    refresh() {
        if (this.isDragging && this.point) {
            this.hover(this.target ?? this.targetAt(this.point), this.point);
        }
    }

    // A trip bar (a draft trip counts as its vessel's row), else a vessel's row, else null. In the Week view, a free
    // cell (WeekBoard#cellAt). `point` is in the viewport
    targetAt(point) {
        const { board } = this;

        return board && !board.hidden ? board.cellAt(point) : this.rowTargetAt(point);
    }

    // The Scheduler resolves the trip (or the leg, whose trip it is) and the vessel from the elements at the point
    rowTargetAt({ x, y }) {
        const
            { scheduler } = this,
            axis          = scheduler.timeAxisSubGridElement,
            elements      = document.elementsFromPoint(x, y).filter(element => axis?.contains(element)),
            trip          = elements.map(element => scheduler.resolveEventRecord(element)).find(Boolean)?.trip,
            vessel        = elements.map(element => scheduler.resolveResourceRecord(element, [x, y])).find(Boolean);

        if (trip && !trip.draft) {
            return trip;
        }

        // Not a group header, which resolves to no resource
        return vessel ?? trip?.resource ?? null;
    }

    lift(teamId) {
        const me = this;

        me.team = teamId;
        // The drop tooltip speaks for the trip while a team is held
        me.scheduler.features.eventTooltip.disabled = true;
        me.handler.liftTeam(teamId);
        me.tip = Widget.create({ type : 'droptooltip' });
    }

    // The tooltip, the proxy and the trip's highlight all show this one check, see DropController#previewDrop
    hover(target, point) {
        const
            me   = this,
            drop = me.handler.previewDrop(me.team, target, me.minuteAt(target, point));

        showOnChip(me.proxy, drop);

        if (me.board) {
            me.board.dropCell = target?.isWeekCell ? target : null;
        }

        if (drop) {
            me.tip.showDrop(drop, point);
        }
        else {
            me.tip.hide();
        }

        return drop;
    }

    end() {
        const me = this;

        if (!me.team) {
            return;
        }

        // The chip of a team held by `?state=drag` is ours, DragHelper removes its own proxy
        if (me.onKey) {
            document.removeEventListener('keydown', me.onKey);
            me.proxy.remove();
        }

        me.tip.destroy();

        if (me.board) {
            me.board.dropCell = null;
        }

        me.tip = me.team = me.point = me.proxy = me.onKey = me.target = null;
        me.scheduler.features.eventTooltip.disabled = false;
        me.handler.endDrag();
    }
}
