import { DomHelper, DragHelper, Rectangle, StringHelper, Tooltip } from '@bryntum/core-enterprise';
import { teamChipHtml } from './TeamTray.js';
import { icon } from './util/Icons.js';
import { duration, hhmm } from './util/Time.js';

/**
 * Dragging a team from the tray onto a trip. Bryntum's DragHelper runs the drag: the threshold, the proxy following
 * the pointer for mouse, pen and touch, Escape, the animated return of an aborted or refused drop, and the trip bars
 * (`.b-sch-event-wrap`) as the drop targets. Over a trip the app previews the stop the team would get
 * (DispatchApp#previewDrop): the trip shows it, the map rings the turbines the trip can still reach, and a Bryntum
 * Tooltip, shown by the point the team is held at, says when the trip is back against the window. The dispatch checks
 * are the drag's validation: a team that does not fit marks the drag invalid, and released there the app says why.
 * Released over a trip that fits, the app books it.
 *
 * DragHelper has no keyboard drag, so the keyboard holds a team over a trip itself: Enter or Space on a focused chip
 * holds the team over the selected trip (or the first one), the arrow keys move it to the previous or next trip,
 * Enter or Space books it, and Escape or Tab puts it back. The tooltip is a live region, so a screen reader reads what
 * each trip would give.
 *
 * The trip under the pointer is found from the event element's `data-event-id`, which Scheduler sets on each bar.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/helper/DragHelper
 * https://bryntum.com/products/scheduler/examples/drag-from-grid/
 */

/**
 * The tooltip of a team held over a trip
 * @param {Object} drop See DispatchApp#previewDrop
 * @param {Boolean} [keyboard] Held from the keyboard, the tooltip lists the keys
 * @returns {String} HTML
 */
export function dropTipHtml({ trip, team, job, result, reach, close }, keyboard = false) {
    const
        text  = StringHelper.encodeHtml,
        head  = result.valid ? `${icon('check-circle')} ${text(job.turbine)} fits on ${text(trip.id)}` :
            `${icon('warning')} ${text(job.turbine)} does not fit on ${text(trip.id)}`,
        certs = result.certs.map(cert => `${text(cert)} ${team.certs.includes(cert) ? '✓' : '✗'}`).join(' '),
        keys  = keyboard ?
            '<div class="ow-drop-tip-keys"><kbd>←</kbd> <kbd>→</kbd> another trip · <kbd>Enter</kbd> book · <kbd>Esc</kbd> cancel</div>' :
            '';

    return `
        <div class="ow-drop-tip-head">${head}</div>
        <dl>
            <dt>On station</dt><dd>${hhmm(result.stop.from)} – ${hhmm(result.stop.to)}</dd>
            <dt>Back in port by</dt><dd><b>${hhmm(result.back)}</b>, window closes ${hhmm(close)}</dd>
            <dt>Seats</dt><dd>${result.seats} / ${trip.resource?.seats} PAX</dd>
            <dt>Certificates</dt><dd>${certs}</dd>
        </dl>
        <div class="ow-drop-tip-foot">${result.valid ?
        `${text(trip.id)} can still reach ${reach.size} turbines before ${hhmm(close)}, see the map` :
        text(result.margin < 0 ? `${result.reason}, ${duration(-result.margin)} late` : result.reason)}</div>${keys}`;
}

const chipSelector = '.ow-team[data-team]';

export default class TeamDrag {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.source The element holding the team chips (`.ow-team[data-team]`)
     * @param {Scheduler.view.Scheduler} options.scheduler
     * @param {Object} options.handler `{ liftTeam(id), previewDrop(id, trip), dropTeam(id, trip), endDrag(),
     * dropTargets() }`
     */
    constructor({ source, scheduler, handler }) {
        const me = this;

        Object.assign(me, { source, scheduler, handler });

        me.dragHelper = new DragHelper({
            callOnFunctions      : true,
            outerElement         : source,
            targetSelector       : chipSelector,
            dropTargetSelector   : '.b-sch-event-wrap[data-event-id]',
            // A small chip centred on the pointer, the team's place in the tray stays, dimmed
            cloneTarget          : true,
            autoSizeClonedTarget : false,
            constrain            : false,
            createProxy          : element => me.createChip(element.dataset.team),
            // A team held from the keyboard goes back first
            isElementDraggable   : () => {
                me.endHeld();

                return true;
            },
            onDragStart : ({ context }) => me.onDragStart(context),
            onDrag      : ({ context, event }) => me.onDrag(context, event),
            onDrop      : ({ context }) => me.onDrop(context),
            onReset     : () => me.end()
        });

        me.onChipKey = event => me.onChipKeyDown(event);
        me.onHeldKey = event => me.onHeldKeyDown(event);
        source.addEventListener('keydown', me.onChipKey);
    }

    destroy() {
        this.dragHelper.abort(true);
        this.dragHelper.destroy();
        this.endHeld();
        this.source.removeEventListener('keydown', this.onChipKey);
    }

    get isDragging() {
        return Boolean(this.team);
    }

    //region Pointer, DragHelper

    // The proxy DragHelper drags, the team's compact chip
    createChip(teamId) {
        const { team, job } = this.handler.waitingTeam(teamId);

        return DomHelper.createElement({
            class : 'ow-drag-chip',
            html  : `${teamChipHtml(team, job, true)}${icon('hand-grabbing', 'ow-drag-hand')}`
        });
    }

    onDragStart(context) {
        this.lift(context.grabbed.dataset.team);
    }

    onDrag(context, event) {
        const
            me    = this,
            point = { x : event.clientX, y : event.clientY };

        // Kept for refresh(), the plan may change under a still pointer
        me.point = point;

        // The dispatch checks validate the drop: over a trip the team fits on
        context.valid = Boolean(me.hover(me.tripOf(context.target), point)?.result.valid);
    }

    // Released over a trip, booked if it fits, else the app says why (DropPreview#dropTeam)
    onDrop(context) {
        const
            me    = this,
            // The preview redraws the trip under the pointer, its element then may not be the one of the last move
            { point } = me,
            trip  = me.tripOf(point ? document.elementFromPoint(point.x, point.y) : context.target),
            team  = me.team;

        me.end();

        if (trip && team) {
            me.handler.dropTeam(team, trip);
        }
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
            trip = me.handler.drop?.trip;

        if (!me.isDragging) {
            return;
        }

        if (me.keyboard) {
            me.keyboard.trips = me.handler.dropTargets();
            me.keyboard.index = me.keyboard.trips.indexOf(trip);
        }

        if (me.point) {
            me.hover(me.tripOf(document.elementFromPoint(me.point.x, me.point.y)), me.point);
        }
        else if (trip) {
            me.holdOver(trip);
        }
        // Held without a pointer, the team no longer waits: put it back
        else {
            me.end();
        }
    }

    // The trip of an element in a trip bar, should it be over a leg
    tripOf(element) {
        const wrap = element?.closest?.('.b-sch-event-wrap[data-event-id]');

        return wrap && this.scheduler.element.contains(wrap) ?
            this.scheduler.eventStore.getById(wrap.dataset.eventId)?.trip ?? null : null;
    }

    //endregion

    //region Keyboard

    // Enter or Space on a team's chip holds it over a trip
    onChipKeyDown(event) {
        const chip = (event.key === 'Enter' || event.key === ' ') && !this.isDragging &&
            event.target.closest(chipSelector);

        if (chip) {
            event.preventDefault();
            this.startKeyboard(chip.dataset.team);
        }
    }

    /**
     * Holds a team over the selected trip, or the first one, for the keyboard to move and drop
     * @param {String} teamId
     */
    startKeyboard(teamId) {
        const
            me    = this,
            trips = me.handler.dropTargets(),
            index = Math.max(0, trips.indexOf(me.scheduler.selectedEvents[0]));

        if (trips.length) {
            me.keyboard = { trips, index };
            me.showHeld(teamId, trips[index]);
        }
    }

    // While held from the keyboard: the arrows move the team to another trip, Enter or Space books, Escape cancels,
    // Tab puts it back and moves on
    onHeldKeyDown(event) {
        const
            me   = this,
            team = me.team,
            step = { ArrowRight : 1, ArrowDown : 1, ArrowLeft : -1, ArrowUp : -1 }[event.key];

        if (!team || !me.held) {
            return;
        }

        if (event.key === 'Tab') {
            me.endHeld();

            return;
        }

        if (step && me.keyboard) {
            me.step(step);
        }
        else if ((event.key === 'Enter' || event.key === ' ') && me.keyboard) {
            me.book(team);
        }
        else if (event.key === 'Escape') {
            me.endHeld();
            me.focusChip(team);
        }
        else {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
    }

    // Holds the team over the previous or next trip
    step(step) {
        const
            { keyboard } = this,
            count        = keyboard.trips.length,
            // Held over a trip no longer in the list (the forecast moved it), the arrows start from either end
            from         = keyboard.index < 0 ? (step > 0 ? -1 : 0) : keyboard.index;

        if (count) {
            keyboard.index = (from + step + count) % count;
            this.holdOver(keyboard.trips[keyboard.index]);
        }
    }

    // Books the team on the trip it is held over
    book(team) {
        const
            me   = this,
            trip = me.handler.drop?.trip ?? me.keyboard.trips[me.keyboard.index];

        me.endHeld();

        if (trip) {
            me.handler.dropTeam(team, trip);
        }

        me.focusChip(team);
    }

    // Focus back on the team's chip, or the first one once it is booked
    focusChip(teamId) {
        const { source } = this;

        (source.querySelector(`.ow-team[data-team="${teamId}"]`) ?? source.querySelector(chipSelector))?.focus();
    }

    /**
     * Shows a team held over a trip without a pointer, the chip on the trip's previewed stop. For the URL state
     * `?state=drag`, the screenshots and the tests, and for the keyboard. Escape puts the team back, as in a drag
     * @param {String} teamId
     * @param {TripModel} trip
     */
    showHeld(teamId, trip) {
        const me = this;

        me.lift(teamId);
        me.held = me.createChip(teamId);
        document.body.appendChild(me.held);
        document.addEventListener('keydown', me.onHeldKey, true);
        me.holdOver(trip);
    }

    /**
     * Moves a team held without a pointer over a trip, the chip and the tooltip on the trip's previewed stop
     * @param {TripModel} trip
     */
    holdOver(trip) {
        const me = this;

        me.handler.previewDrop(me.team, trip);

        if (me.keyboard) {
            me.scheduler.scrollEventIntoView(trip, { block : 'nearest' });
        }

        // Placed once the trip shows the previewed stop
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const
                selector = `.b-sch-event-wrap[data-event-id="${trip.id}"] .ow-seg-preview`,
                rect     = me.scheduler.element.querySelector(selector)?.getBoundingClientRect(),
                point    = rect ?
                    { x : rect.left + rect.width / 2, y : rect.top + 8 } :
                    { x : innerWidth / 2, y : innerHeight / 2 };

            // Still held over this trip, the keys may have moved on
            if (me.held && me.handler.drop?.trip === trip) {
                DomHelper.setTranslateXY(me.held, point.x - 20, point.y + 8);
                me.hover(trip, point);
            }
        }));
    }

    endHeld() {
        const me = this;

        if (me.held) {
            document.removeEventListener('keydown', me.onHeldKey, true);
            me.held.remove();
            me.held = me.keyboard = null;
            me.end();
        }
    }

    //endregion

    //region Shared

    // Lifts the team from the tray, with the tooltip of the trip it is over
    lift(teamId) {
        const me = this;

        me.team = teamId;
        me.handler.liftTeam(teamId);
        // A Bryntum Tooltip, shown by the point the team is held at. Its alignment keeps it in the viewport
        me.tip = new Tooltip({
            cls          : 'ow-drop-tip',
            anchor       : false,
            // Shown and hidden by hover(), not by hovering an element
            autoShow     : false,
            hideDelay    : false,
            dismissDelay : 0
        });
        // Read out as the team moves from trip to trip
        me.tip.element.setAttribute('role', 'status');
        me.tip.element.setAttribute('aria-live', 'polite');
    }

    /**
     * Previews the team on a trip, or none, and shows the tooltip below the point
     * @param {TripModel|null} trip
     * @param {{x: Number, y: Number}} point In the viewport
     * @returns {Object|null} See DispatchApp#previewDrop
     */
    hover(trip, point) {
        const
            me      = this,
            { tip } = me,
            drop    = me.handler.previewDrop(me.team, trip);

        if (!drop) {
            tip.hide();

            return drop;
        }

        tip.html = dropTipHtml(drop, Boolean(me.keyboard));
        tip.element.classList.toggle('ow-drop-tip-invalid', !drop.result.valid);
        // By a point: a one px rectangle at the pointer, or at the stop held from the keyboard
        tip.showBy({
            target : new Rectangle(point.x, point.y, 1, 1),
            align  : 't0-b0',
            offset : 42
        });

        return drop;
    }

    // The team goes back to the tray, or was booked, the preview ends
    end() {
        const me = this;

        if (me.team) {
            me.tip.destroy();
            me.tip = me.team = me.point = null;
            me.handler.endDrag();
        }
    }

    //endregion
}
