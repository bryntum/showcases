import { Widget } from '@bryntum/core-enterprise';
import { duration } from './util/Time.js';
import { iconConfig } from './util/Icons.js';

/**
 * A team's chip as DomConfigs, also the content of the one following the pointer while it is dragged
 * @param {Object} team `{ id, name, techs, certs }`
 * @param {Object} job `{ turbine, job, minutes }`
 * @param {Boolean} [compact] Its name and certificates only
 * @returns {Object[]} DomConfig
 */
export function teamChipContent(team, job, compact = false) {
    // Every technician has the GWO basics, only a certificate that limits where a team can go is worth a word
    const
        certs = {
            tag      : 'span',
            class    : 'ow-certs',
            children : team.certs.filter(cert => cert !== 'GWO')
                .map(cert => ({ tag : 'span', class : `ow-cert ow-cert-${cert.toLowerCase()}`, text : cert }))
        },
        name  = { tag : 'b', text : team.name };

    if (compact) {
        return [name, certs];
    }

    return [
        { tag : 'span', class : 'ow-team-crew', children : [iconConfig('hard-hat')] },
        {
            tag      : 'span',
            class    : 'ow-team-text',
            children : [
                { tag : 'span', class : 'ow-team-name', children : [name, certs] },
                { tag : 'span', class : 'ow-team-job', text : `${job.turbine} · ${duration(job.minutes)}` }
            ]
        }
    ];
}

/**
 * A team waiting at the port: a chip with its turbine, its job, how long it takes and the certificates it holds. It is
 * what DragHelper drags (TeamDrag), or holds over a trip from the keyboard with Enter (KeyboardDrag). Its tooltip
 * has what the chip leaves out, the technicians and the job.
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
         * Held over a trip, the chip stays in the tray, dimmed
         * @prp {Boolean}
         */
        lifted : false,

        cls : 'ow-team'
    };

    afterConstruct() {
        super.afterConstruct();

        // A focusable button: a chip is held with Enter (KeyboardDrag)
        this.element.setAttribute('role', 'button');
        this.element.tabIndex = 0;
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

        me.job            = job;
        me.element.dataset.team = team.id;
        me.tooltip        = `${team.techs} technicians · ${job.job}`;
        me.ariaLabel      = `${team.name}, ${job.turbine}. Drag onto a trip, or press Enter to choose a trip with the arrow keys`;
        me.html           = teamChipContent(team, job);
    }

    updateLifted(lifted) {
        this.toggleCls('ow-team-lifted', lifted);
    }
}

TeamChip.initClass();
