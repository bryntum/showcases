import { DomHelper, StringHelper } from '@bryntum/core-enterprise';
import { teamChipHtml } from './TeamTray.js';
import { icon } from './util/Icons.js';
import { duration, hhmm } from './util/Time.js';

/**
 * Dragging a team from the tray onto a trip, with pointer events, so mouse, pen and touch work alike. The chip follows
 * the pointer. Over a trip the app previews the stop the team would get (DispatchApp#previewDrop): the trip shows it,
 * the map rings the turbines the trip can still reach, and a tooltip says when the trip is back against the window.
 * Released over a trip the app books it if it fits. Escape or releasing anywhere else puts the team back.
 *
 * From the keyboard, Enter or Space on a focused chip holds the team over the selected trip (or the first one), the
 * arrow keys move it to the previous or next trip, Enter or Space books it, and Escape or Tab puts it back. The tooltip
 * is a live region, so a screen reader reads what each trip would give.
 *
 * The trip under the pointer is found from the event element's `data-event-id`, which Scheduler sets on each bar.
 */

const
    // How far the pointer moves before a press becomes a drag, px
    threshold = 4;

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
            <dt>Back at port</dt><dd><b>${hhmm(result.back)}</b>, window closes ${hhmm(close)}</dd>
            <dt>Seats</dt><dd>${result.seats} / ${trip.resource?.seats} PAX</dd>
            <dt>Certificates</dt><dd>${certs}</dd>
        </dl>
        <div class="ow-drop-tip-foot">${result.valid ?
        `${text(trip.id)} can still reach ${reach.size} turbines before ${hhmm(close)}, see the map` :
        text(result.margin < 0 ? `${result.reason}, ${duration(-result.margin)} late` : result.reason)}</div>${keys}`;
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

        me.listeners = {
            pointermove   : event => me.onPointerMove(event),
            pointerup     : event => me.onPointerUp(event),
            pointercancel : () => me.cancel(),
            keydown       : event => event.key === 'Escape' && me.cancel()
        };
        me.onPointerDown = event => me.onDown(event);
        me.onChipKey     = event => me.onChipKeyDown(event);
        me.onHeldKey     = event => me.onHeldKeyDown(event);
        source.addEventListener('pointerdown', me.onPointerDown);
        source.addEventListener('keydown', me.onChipKey);
    }

    destroy() {
        this.cancel();
        this.source.removeEventListener('pointerdown', this.onPointerDown);
        this.source.removeEventListener('keydown', this.onChipKey);
    }

    //region Keyboard

    // Enter or Space on a team's chip holds it over a trip
    onChipKeyDown(event) {
        const chip = (event.key === 'Enter' || event.key === ' ') && !this.isDragging &&
            event.target.closest('.ow-team[data-team]');

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
            document.addEventListener('keydown', me.onHeldKey, true);
        }
    }

    // While held from the keyboard: the arrows move the team to another trip, Enter or Space books, Escape cancels,
    // Tab puts it back and moves on
    onHeldKeyDown(event) {
        const
            me           = this,
            { keyboard } = me,
            team         = me.press?.team,
            step         = { ArrowRight : 1, ArrowDown : 1, ArrowLeft : -1, ArrowUp : -1 }[event.key];

        if (!keyboard || !team) {
            return;
        }

        if (event.key === 'Tab') {
            me.cancel();

            return;
        }

        if (step) {
            me.step(step);
        }
        else if (event.key === 'Enter' || event.key === ' ') {
            me.book(team);
        }
        else if (event.key === 'Escape') {
            me.cancel();
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

        me.end();

        if (trip) {
            me.handler.dropTeam(team, trip);
        }

        me.focusChip(team);
    }

    // Focus back on the team's chip, or the first one once it is booked
    focusChip(teamId) {
        const { source } = this;

        (source.querySelector(`.ow-team[data-team="${teamId}"]`) ?? source.querySelector('.ow-team[data-team]'))
            ?.focus();
    }

    //endregion

    get isDragging() {
        return Boolean(this.chip);
    }

    onDown(event) {
        const chip = event.button === 0 && event.target.closest('.ow-team[data-team]');

        if (chip) {
            event.preventDefault();
            // A team held from the keyboard goes back first
            this.cancel();
            this.press = { x : event.clientX, y : event.clientY, team : chip.dataset.team };
            Object.entries(this.listeners).forEach(([name, fn]) => document.addEventListener(name, fn));
        }
    }

    onPointerMove(event) {
        const
            me        = this,
            { press } = me;

        if (!press) {
            return;
        }

        if (!me.isDragging) {
            if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < threshold) {
                return;
            }

            me.begin(press.team);
        }

        // Kept for refresh(), the plan may change under a still pointer
        press.point = { x : event.clientX, y : event.clientY };
        me.moveTo(press.point.x, press.point.y);
        me.hover(me.tripAt(press.point.x, press.point.y), press.point);
    }

    /**
     * Checks the team again where it is held, after the plan or the forecast changed (DispatchApp#replan): the trip
     * under the pointer, or the trip held over without one, previewed and its tooltip redrawn against the plan as it is
     * now. From the keyboard, the trips the arrows step through are read again, the forecast may have moved some to
     * tomorrow
     */
    refresh() {
        const
            me            = this,
            { press }     = me,
            trip          = me.handler.drop?.trip;

        if (!me.isDragging) {
            return;
        }

        if (me.keyboard) {
            me.keyboard.trips = me.handler.dropTargets();
            me.keyboard.index = me.keyboard.trips.indexOf(trip);
        }

        if (press.point) {
            me.hover(me.tripAt(press.point.x, press.point.y), press.point);
        }
        else if (trip) {
            me.holdOver(trip);
        }
        // Held without a pointer, the team no longer waits: put it back
        else {
            me.cancel();
        }
    }

    onPointerUp(event) {
        const
            me   = this,
            trip = me.isDragging && me.tripAt(event.clientX, event.clientY),
            team = me.press?.team;

        me.end();

        if (trip) {
            me.handler.dropTeam(team, trip);
        }
    }

    // The trip under a point, the chip and the tooltip let the pointer through
    tripAt(x, y) {
        const
            { scheduler } = this,
            wrap          = document.elementFromPoint(x, y)?.closest('.b-sch-event-wrap[data-event-id]');

        // A leg's trip, should the pointer be over a leg
        return wrap && scheduler.element.contains(wrap) ?
            scheduler.eventStore.getById(wrap.dataset.eventId)?.trip ?? null : null;
    }

    begin(teamId) {
        const
            me              = this,
            { team, job }   = me.handler.liftTeam(teamId);

        me.chip = DomHelper.createElement({
            class  : 'ow-drag-chip',
            parent : document.body,
            html   : `${teamChipHtml(team, job, true)}${icon('hand-grabbing', 'ow-drag-hand')}`
        });
        me.tip = DomHelper.createElement({ class : 'ow-drop-tip', parent : document.body, hidden : true });
        // Read out as the team moves from trip to trip
        me.tip.setAttribute('role', 'status');
        me.tip.setAttribute('aria-live', 'polite');
    }

    moveTo(x, y) {
        Object.assign(this.chip.style, { left : `${x - 20}px`, top : `${y - 14}px` });
    }

    /**
     * Previews the team on a trip, or none, and places the tooltip below the point
     * @param {TripModel|null} trip
     * @param {{x: Number, y: Number}} point In the viewport
     */
    hover(trip, point) {
        const
            me   = this,
            drop = me.handler.previewDrop(me.press.team, trip);

        me.tip.hidden = !drop;

        if (drop) {
            me.tip.innerHTML = dropTipHtml(drop, Boolean(me.keyboard));
            me.tip.classList.toggle('ow-drop-tip-invalid', !drop.result.valid);
            Object.assign(me.tip.style, {
                left : `${Math.min(point.x + 4, innerWidth - me.tip.offsetWidth - 8)}px`,
                top  : `${Math.min(point.y + 42, innerHeight - me.tip.offsetHeight - 8)}px`
            });
        }
    }

    /**
     * Shows a team held over a trip without a pointer, the chip on the trip's previewed stop. For the URL state
     * `?state=drag`, the screenshots and the tests, and for the keyboard. Escape puts the team back, as in a drag
     * @param {String} teamId
     * @param {TripModel} trip
     */
    showHeld(teamId, trip) {
        const me = this;

        me.press = { team : teamId };
        me.begin(teamId);
        // Removed by end() with the other drag listeners. Held from the keyboard, onHeldKeyDown sees Escape first
        document.addEventListener('keydown', me.listeners.keydown);
        me.holdOver(trip);
    }

    /**
     * Moves a team held without a pointer over a trip, the chip and the tooltip on the trip's previewed stop
     * @param {TripModel} trip
     */
    holdOver(trip) {
        const me = this;

        me.handler.previewDrop(me.press.team, trip);

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
            if (me.chip && me.handler.drop?.trip === trip) {
                me.moveTo(point.x, point.y + 22);
                me.hover(trip, point);
            }
        }));
    }

    end() {
        const me = this;

        Object.entries(me.listeners).forEach(([name, fn]) => document.removeEventListener(name, fn));
        document.removeEventListener('keydown', me.onHeldKey, true);
        me.keyboard = null;

        if (me.chip) {
            me.chip.remove();
            me.tip.remove();
            me.chip = me.tip = null;
            me.handler.endDrag();
        }

        me.press = null;
    }

    cancel() {
        this.end();
    }
}
