import { Rectangle, StringHelper, Tooltip } from '@bryntum/core-enterprise';
import { icon } from '../util/Icons.js';
import { hhmm } from '../util/Time.js';

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

/**
 * The tooltip of a team held over a trip: a Bryntum Tooltip shown by the point the team is held at, not by hovering an
 * element. Its alignment keeps it in the viewport. It is a live region, so a screen reader reads what each trip would
 * give as the team moves from trip to trip.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Tooltip
 */
export default class DropTooltip extends Tooltip {
    static $name = 'DropTooltip';

    static type = 'droptooltip';

    static configurable = {
        cls          : 'ow-drop-tip',
        anchor       : false,
        // Shown and hidden by showDrop(), not by hovering an element
        autoShow     : false,
        hideDelay    : false,
        dismissDelay : 0
    };

    afterConstruct() {
        super.afterConstruct();

        this.element.setAttribute('role', 'status');
        this.element.setAttribute('aria-live', 'polite');
    }

    /**
     * Shows what a team gives on a trip, below a point
     * @param {Object} drop See DispatchApp#previewDrop
     * @param {{x: Number, y: Number}} point In the viewport: a one px rectangle at the pointer, or at the stop held
     * from the keyboard
     * @param {Boolean} keyboard Held from the keyboard
     */
    showDrop(drop, point, keyboard) {
        this.html = dropTipHtml(drop, keyboard);
        this.element.classList.toggle('ow-drop-tip-invalid', !drop.result.valid);
        this.showBy({
            target : new Rectangle(point.x, point.y, 1, 1),
            align  : 't0-b0',
            offset : 42
        });
    }
}

DropTooltip.initClass();
