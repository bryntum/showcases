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
 * The trip under the pointer is found from the event element's `data-event-id`, which Scheduler sets on each bar.
 */

const
    // How far the pointer moves before a press becomes a drag, px
    threshold = 4;

/**
 * The tooltip of a team held over a trip
 * @param {Object} drop See DispatchApp#previewDrop
 * @returns {String} HTML
 */
export function dropTipHtml({ trip, team, job, result, reach, close }) {
    const
        text  = StringHelper.encodeHtml,
        head  = result.valid ? `${icon('check-circle')} ${text(job.turbine)} fits on ${text(trip.id)}` :
            `${icon('warning')} ${text(job.turbine)} does not fit on ${text(trip.id)}`,
        certs = result.certs.map(cert => `${text(cert)} ${team.certs.includes(cert) ? '✓' : '✗'}`).join(' ');

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
        text(result.margin < 0 ? `${result.reason}, ${duration(-result.margin)} late` : result.reason)}</div>`;
}

export default class TeamDrag {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.source The element holding the team chips (`.ow-team[data-team]`)
     * @param {Scheduler.view.Scheduler} options.scheduler
     * @param {Object} options.handler `{ liftTeam(id), previewDrop(id, trip), dropTeam(id, trip), endDrag() }`
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
        source.addEventListener('pointerdown', me.onPointerDown);
    }

    destroy() {
        this.cancel();
        this.source.removeEventListener('pointerdown', this.onPointerDown);
    }

    get isDragging() {
        return Boolean(this.chip);
    }

    onDown(event) {
        const chip = event.button === 0 && event.target.closest('.ow-team[data-team]');

        if (chip) {
            event.preventDefault();
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

        me.moveTo(event.clientX, event.clientY);
        me.hover(me.tripAt(event.clientX, event.clientY), { x : event.clientX, y : event.clientY });
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
            me.tip.innerHTML = dropTipHtml(drop);
            me.tip.classList.toggle('ow-drop-tip-invalid', !drop.result.valid);
            Object.assign(me.tip.style, {
                left : `${Math.min(point.x + 4, innerWidth - me.tip.offsetWidth - 8)}px`,
                top  : `${Math.min(point.y + 42, innerHeight - me.tip.offsetHeight - 8)}px`
            });
        }
    }

    /**
     * Shows a team held over a trip without a pointer, the chip on the trip's previewed stop. For the URL state
     * `?state=drag`, the screenshots and the tests
     * @param {String} teamId
     * @param {TripModel} trip
     */
    showHeld(teamId, trip) {
        const me = this;

        me.press = { team : teamId };
        me.begin(teamId);
        me.handler.previewDrop(teamId, trip);

        // Placed once the trip shows the previewed stop
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const
                selector = `.b-sch-event-wrap[data-event-id="${trip.id}"] .ow-seg-preview`,
                rect     = me.scheduler.element.querySelector(selector)?.getBoundingClientRect(),
                point    = rect ?
                    { x : rect.left + rect.width / 2, y : rect.top + 8 } :
                    { x : innerWidth / 2, y : innerHeight / 2 };

            if (me.chip) {
                me.moveTo(point.x, point.y + 22);
                me.hover(trip, point);
            }
        }));
    }

    end() {
        const me = this;

        Object.entries(me.listeners).forEach(([name, fn]) => document.removeEventListener(name, fn));

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
