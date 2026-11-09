import { Widget } from '@bryntum/core-enterprise';
import { iconConfig } from './util/Icons.js';
import { duration } from './util/Time.js';

/**
 * A team's chip as DomConfigs, also the content of the one following the pointer while it is dragged
 * @param {Object} team `{ id, name, techs, certs }`
 * @param {Object} job `{ turbine, job, short, minutes }`
 * @param {Boolean} [compact] Its name and certificates only, for the one dragged
 * @param {Boolean} [fault] Its turbine is stopped
 * @returns {Object[]} DomConfig
 */
export function teamChipContent(team, job, compact = false, fault = false) {
    // Every technician has the GWO basics, only a certificate that limits where a team can go is worth a word
    const name = { tag : 'b', text : team.name };

    if (compact) {
        return [name, {
            tag      : 'span',
            class    : 'ow-certs',
            children : team.certs.filter(cert => cert !== 'GWO')
                .map(cert => ({ tag : 'span', class : `ow-cert ow-cert-${cert.toLowerCase()}`, text : cert }))
        }];
    }

    // Two short lines that never wrap: "Team F · 2" over "T-34 fault · 48 min"
    return [
        { tag : 'span', class : 'ow-team-crew', ariaHidden : true, children : [iconConfig('users')] },
        {
            tag      : 'span',
            class    : 'ow-team-text',
            children : [
                { tag : 'span', class : 'ow-team-name', children : [name, ` · ${team.techs}`] },
                { tag : 'span', class : 'ow-team-job', text : `${jobText(job, fault)} · ${duration(job.minutes)}` }
            ]
        }
    ];
}

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
 * is tinted red. It is what DragHelper drags (TeamDrag), or holds over a trip from the keyboard with Enter
 * (KeyboardDrag).
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Widget#config-tooltip
 */
export default class TeamChip extends Widget {
    static $name = 'TeamChip';

    static type = 'teamchip';

    static configurable = {
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

        cls               : 'ow-team',
        // A focusable button: a chip is held with Enter (KeyboardDrag)
        role              : 'button',
        elementAttributes : { tabindex : '0' }
    };

    afterConstruct() {
        super.afterConstruct();

        this.draw();
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
        me.element.dataset.team = team.id;
        me.tooltip              = `${team.techs} technicians, ${team.certs.join(', ')} · ${job.turbine} ${job.job}`;
        me.ariaLabel            = `${team.name}, ${job.turbine}. Drag onto a trip, or press Enter to choose a trip with the arrow keys`;
        me.html                 = teamChipContent(team, job, false, me.fault);
        me.element.classList.toggle('ow-team-fault', Boolean(me.fault));
    }

    updateLifted(lifted) {
        this.element?.classList.toggle('ow-team-lifted', lifted);
    }
}

TeamChip.initClass();
