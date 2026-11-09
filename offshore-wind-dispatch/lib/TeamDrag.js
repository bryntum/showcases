import { DomHelper, DragHelper, Rectangle, StringHelper, Tooltip } from '@bryntum/core-enterprise';
import { teamChipHtml } from './TeamTray.js';
import { icon } from './util/Icons.js';
import { duration, hhmm } from './util/Time.js';

/**
 * Dragging a team from the tray onto a vessel. Bryntum's DragHelper runs the drag: the threshold, the proxy following
 * the pointer for mouse, pen and touch, Escape, the animated return of an aborted or refused drop. The whole time axis
 * of the schedule is its drop target: over a trip bar, or anywhere on a vessel's row, the app previews the stop the
 * team would get (DispatchApp#previewDrop), on that trip or the vessel's best one, or on a new trip from port: the trip
 * shows it, the map rings the turbines the trip can still reach, and a Bryntum Tooltip, shown by the point the team is
 * held at, says when the trip is back against the window. The dispatch check is the drag's validation: a team that
 * does not fit marks the drag invalid (`context.valid`), and released there the app says why. The proxy says it too,
 * as it moves, from the same check: "Fits SR-1, back 12:40" or "35 min after window", neutral over empty space.
 * Released where it fits, the app books it.
 *
 * DragHelper has no keyboard drag, so the keyboard holds a team over a trip itself: Enter or Space on a focused chip
 * holds the team over the selected trip (or the first one), the arrow keys move it to the previous or next trip,
 * Enter or Space books it, and Escape or Tab puts it back. The tooltip is a live region, so a screen reader reads what
 * each trip would give.
 *
 * The trip under the pointer is found from the event element's `data-event-id`, which Scheduler sets on each bar, the
 * vessel from the row's `data-id`.
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
        // A vessel with no trip left to join gets a new one
        name  = trip.draft ? `a new trip, ${text(trip.id)} from port at ${hhmm(trip.departs)}` : text(trip.id),
        head  = result.valid ? `${icon('check-circle')} ${text(job.turbine)} fits on ${name}` :
            `${icon('warning')} ${text(job.turbine)} does not fit on ${name}`,
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
        text(result.reason)}</div>${keys}`;
}

const chipSelector = '.ow-team[data-team]';

/**
 * Shows on the drag proxy what the team held gives, from the same check as the tooltip: green and "Fits SR-1, back
 * 12:40", red and the short reason, or neutral over empty space. Only touched when it changes, so it does not flicker
 * @param {HTMLElement} chip The proxy, or the chip held from the keyboard
 * @param {Object|null} drop See DispatchApp#previewDrop
 */
export function showOnChip(chip, drop) {
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
            // The trips and the vessels' rows
            dropTargetSelector   : '.ow-scheduler .b-time-axis-sub-grid',
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

        // The status line says what the trip under it gives (showOnChip)
        return DomHelper.createElement({
            class   : 'ow-drag-chip',
            dataset : { state : 'neutral' },
            html    : `<span class="ow-drag-team">${teamChipHtml(team, job, true)}</span>` +
                `<span class="ow-drag-status" aria-hidden="true" hidden></span>${icon('hand-grabbing', 'ow-drag-hand')}`
        });
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

        if (me.keyboard) {
            me.keyboard.trips = me.handler.dropTargets();
            me.keyboard.index = me.keyboard.trips.indexOf(trip);
        }

        if (me.point) {
            me.hover(me.targetAt(me.point), me.point);
        }
        else if (trip) {
            me.holdOver(trip);
        }
        // Held without a pointer, the team no longer waits: put it back
        else {
            me.end();
        }
    }

    /**
     * What a team held at a point is over: a trip bar (a draft trip counts as its vessel's row), else a vessel's row in
     * the time axis, else nothing
     * @param {{x: Number, y: Number}} point In the viewport
     * @returns {TripModel|VesselModel|null}
     */
    targetAt({ x, y }) {
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
            me     = this,
            target = me.handler.drop?.target ?? me.keyboard.trips[me.keyboard.index];

        if (target) {
            me.handler.dropTeam(team, target);
        }

        me.endHeld();
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

        // Placed once the trip shows the previewed stop, the engine places it first
        me.scheduler.project.commitAsync().then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
            const
                drop     = me.handler.drop,
                selector = `.b-sch-event-wrap[data-event-id="${CSS.escape(String(drop?.trip.id))}"] .ow-seg-preview`,
                rect     = me.scheduler.element.querySelector(selector)?.getBoundingClientRect(),
                point    = rect ?
                    { x : rect.left + rect.width / 2, y : rect.top + 8 } :
                    { x : innerWidth / 2, y : innerHeight / 2 };

            // Still held over this trip, the keys may have moved on
            if (me.held && drop?.target === trip) {
                DomHelper.setTranslateXY(me.held, point.x - 20, point.y + 8);
                me.hover(trip, point);
            }
        })));
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
     * Previews the team on a trip or a vessel, or none, and shows the tooltip below the point. The tooltip, the proxy
     * and the trip's highlight all show this one check
     * @param {TripModel|VesselModel|null} target
     * @param {{x: Number, y: Number}} point In the viewport
     * @returns {Object|null} See DispatchApp#previewDrop
     */
    hover(target, point) {
        const
            me      = this,
            { tip } = me,
            drop    = me.handler.previewDrop(me.team, target);

        showOnChip(me.held ?? me.proxy, drop);

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
            me.tip = me.team = me.point = me.proxy = null;
            me.handler.endDrag();
        }
    }

    //endregion
}
