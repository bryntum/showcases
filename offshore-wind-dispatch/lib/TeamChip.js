import { DomHelper, Widget } from '@bryntum/core-enterprise';
import { iconConfig } from './util/Icons.js';
import { duration } from './util/Time.js';

/**
 * A job in a word or two after its turbine: "T-34 fault", "T-02 annual service"
 * @param {Object} job `{ turbine, job, short }`
 * @param {Boolean} fault Its turbine is stopped
 * @returns {String}
 */
function jobText({ turbine, job, short }, fault) {
    return `${turbine} ${fault ? 'fault' : (short ?? job).toLowerCase()}`;
}

/**
 * A team waiting at the port: a small card with the people icon, the team and its size over its turbine, its job and
 * how long it takes. The team's certificates and its full job are in its tooltip. A team waiting for a stopped turbine
 * is tinted red. It is what DragHelper drags (TeamDrag).
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Widget#config-tooltip
 */
export default class TeamChip extends Widget {
    static $name = 'TeamChip';

    static type = 'teamchip';

    static configurable = {
        /**
         * The ID of its record in the waiting store, which the drag passes on as the chip's `data-team`
         * @config {String}
         */
        waitingId : null,

        /**
         * The team, `{ id, name, techs, certs }`
         * @config {Object}
         */
        team : null,

        /**
         * The team's job, `{ turbine, job, minutes }`
         * @config {Object}
         */
        job : null,

        /**
         * Its turbine is stopped
         * @config {Boolean}
         */
        fault : false,

        /**
         * Held over a trip, the chip stays in the tray, dimmed
         * @prp {Boolean}
         */
        lifted : false,

        cls : 'ow-team'
    };

    afterConstruct() {
        super.afterConstruct();

        this.draw();
        this.updateLifted(this.lifted);
    }

    /**
     * Shows the team and its job
     * @param {Object} [job] Its job now
     */
    draw(job = this.job) {
        const
            me           = this,
            { team }     = me;

        me.job                  = job;
        me.element.dataset.team = me.waitingId;
        me.tooltip              = `${team.techs} technicians, ${team.certs.join(', ')} · ${job.turbine} ${job.job}`;
        // Two short lines that never wrap: "Team F · 2" over "T-34 fault · 48 min"
        me.html                 = [
            { tag : 'span', class : 'ow-team-crew', ariaHidden : true, children : [iconConfig('users')] },
            {
                tag      : 'span',
                class    : 'ow-team-text',
                children : [
                    { tag : 'span', class : 'ow-team-name', children : [{ tag : 'b', text : team.name }, ` · ${team.techs}`] },
                    { tag : 'span', class : 'ow-team-job', text : `${jobText(job, me.fault)} · ${duration(job.minutes)}` }
                ]
            }
        ];
        me.element.classList.toggle('ow-team-fault', Boolean(me.fault));
    }

    updateLifted(lifted) {
        this.element?.classList.toggle('ow-team-lifted', lifted);
    }
}

TeamChip.initClass();

/**
 * The chip that follows the pointer while a team is dragged (TeamDrag): the team's name and its certificates, and a
 * status line that says what the trip under it gives (showOnChip). Every technician has the GWO basics, only a
 * certificate that limits where a team can go is worth a word
 * @param {Object} team `{ id, name, techs, certs }`
 * @returns {HTMLElement}
 */
export function createChip(team) {
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
            { tag : 'span', class : 'ow-drag-status', hidden : true, 'aria-hidden' : 'true' }
        ]
    });
}

/**
 * Shows on the drag proxy what the team held gives, from the same check as the tooltip: green and "Fits SR-1, back
 * 12:40", red and the short reason, or neutral over empty space. Only touched when it changes, so it does not flicker
 * @param {HTMLElement} chip The proxy
 * @param {Object|null} drop See DropController#previewDrop
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
