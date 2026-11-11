import { DateHelper, DomHelper, DragHelper, Widget } from '@bryntum/core-enterprise';
// Also registers the tooltip type used below
import './DropTooltip.js';

// The drag proxy. Every technician has the GWO basics, only a certificate that limits where a team can go is shown
function createChip(team) {
    return DomHelper.createElement({
        class    : 'ow-drag-chip',
        dataset  : { state : 'neutral' },
        children : [
            {
                tag      : 'span',
                class    : 'ow-drag-team',
                children : [
                    { tag : 'b', text : team.name },
                    {
                        tag      : 'span',
                        class    : 'ow-certs',
                        children : team.certs.filter(cert => cert !== 'GWO')
                            .map(cert => ({ tag : 'span', class : `ow-cert ow-cert-${cert.toLowerCase()}`, text : cert }))
                    }
                ]
            },
            { tag : 'span', class : 'ow-pill ow-drag-status', hidden : true, 'aria-hidden' : 'true' }
        ]
    });
}

// The proxy's status from the same check as the tooltip (DropController#previewDrop). Only touched when it changes,
// so it does not flicker
function showOnChip(chip, drop) {
    const
        state  = drop ? (drop.result.valid ? 'valid' : 'invalid') : 'neutral',
        text   = drop?.result.short ?? '',
        status = chip?.querySelector('.ow-drag-status');

    if (!status || (chip.dataset.state === state && status.textContent === text)) {
        return;
    }

    chip.dataset.state = state;
    status.textContent = text;
    status.hidden      = !text;
}

/**
 * Dragging a team from the tray onto a vessel, run by Bryntum's DragHelper. The pointer side only: the handler
 * (DropController) checks and books, and that one check sets `context.valid`, the proxy's colour, the DropTooltip and
 * the outline of where the stop would go.
 *
 * Learn more:
 * https://bryntum.com/docs/api/Core/helper/DragHelper
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
            // Not a team whose booking the engine is placing
            targetSelector       : '.ow-team[data-team]:not(.ow-team-pending)',
            // A small chip centred on the pointer, the team's place in the tray stays, dimmed
            cloneTarget          : true,
            autoSizeClonedTarget : false,
            constrain            : false,
            createProxy          : element => createChip(handler.waitingTeam(element.dataset.team).team),
            onDragStart          : ({ context }) => me.onDragStart(context),
            onDrag               : ({ context, event }) => me.onDrag(context, event),
            onDrop               : ({ context }) => me.onDrop(context),
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
     * Only for the `?state=drag` URL state (the screenshots): holds a team over a trip as a pointer resting on the
     * outline of its stop would, with no pointer. Escape puts it back
     * @param {String} teamId
     * @param {TripModel} trip
     * @returns {Promise} Resolves once it is shown
     */
    async showHeld(teamId, trip) {
        const
            me          = this,
            { handler } = me,
            outline     = () => me.scheduler.element.querySelector('.ow-drop-outline');

        me.lift(teamId);
        me.target = trip;
        me.proxy = document.body.appendChild(createChip(handler.waitingTeam(teamId).team));
        me.onKey = event => event.key === 'Escape' && me.end();
        document.addEventListener('keydown', me.onKey);
        handler.previewDrop(teamId, trip);

        // The outline is drawn a frame later
        for (let frame = 0; frame < 30 && !outline(); frame++) {
            await new Promise(resolve => requestAnimationFrame(resolve));
        }

        const rect = outline()?.getBoundingClientRect();

        if (me.team === teamId) {
            me.point = rect ? { x : rect.left + rect.width / 2, y : rect.top + rect.height / 2 } :
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

    // DragHelper's asynchronous drop: the drop is finalized once the booking is placed, its proxy goes back to the
    // tray if it is not. Meanwhile no other team can be picked up (DragHelper waits for the finalize)
    onDrop(context) {
        const
            me              = this,
            { team, point } = me,
            target          = point ? me.targetAt(point) : null;

        if (!target || !team) {
            me.end();

            return;
        }

        context.async = true;

        // Reserves the team before the tooltip and the outline go
        const booked = me.handler.dropTeam(team, target, me.minuteAt(target, point));

        me.end();
        booked.catch(error => {
            console.warn(error);

            return false;
        }).then(valid => context.finalize(valid));
    }

    // Minutes since midnight on the Day view's time axis. None over a cell of the week, which is the whole day
    minuteAt(target, point) {
        const
            { scheduler } = this,
            date          = target && !target.isWeekCell ? scheduler.getDateFromCoordinate(point.x, null, false) : null;

        return date ? DateHelper.diff(scheduler.dispatch.midnight, date, 'minute') : null;
    }

    // Called by DispatchApp#replan: the pointer may be still while the trips move under it, checked again
    refresh() {
        if (this.isDragging && this.point) {
            this.hover(this.target ?? this.targetAt(this.point), this.point, true);
        }
    }

    // A trip bar, else a vessel's row, else null. In the Week view, a free cell (WeekBoard#cellAt). `point` is in the
    // viewport
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

        // Not a group header, which resolves to no resource
        return trip ?? vessel ?? null;
    }

    lift(teamId) {
        const me = this;

        me.team = teamId;
        // The drop tooltip speaks for the trip while a team is held
        me.scheduler.features.eventTooltip.disabled = true;
        me.handler.liftTeam(teamId);
        me.tip = Widget.create({ type : 'droptooltip' });
    }

    // The tooltip, the proxy and the outline all show this one check, see DropController#previewDrop
    hover(target, point, fresh = false) {
        const
            me   = this,
            drop = me.handler.previewDrop(me.team, target, me.minuteAt(target, point), fresh);

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
