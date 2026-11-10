import { DomHelper, Widget } from '@bryntum/core-enterprise';
import { iconConfig } from './util/Icons.js';
import { duration } from './util/Time.js';

// "T-34 fault", "T-02 annual service"
function jobText({ turbine, job, short }, fault) {
    return `${turbine} ${fault ? 'fault' : (short ?? job).toLowerCase()}`;
}

/**
 * A team waiting at the port, in the tray: the drag source of TeamDrag, which finds it by its `data-team`. Its
 * certificates and full job are in its tooltip, so the card stays two short lines.
 */
export default class TeamChip extends Widget {
    static $name = 'TeamChip';

    static type = 'teamchip';

    static configurable = {
        // The record's ID in the waiting store, the chip's `data-team`
        waitingId : null,

        // `{ id, name, techs, certs }`
        team : null,

        // `{ turbine, job, minutes }`
        job : null,

        // Its turbine is stopped
        fault : false,

        // Dragged: the chip stays in the tray, dimmed
        lifted : false,

        cls : 'ow-team'
    };

    afterConstruct() {
        super.afterConstruct();

        this.draw();
        this.updateLifted(this.lifted);
    }

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

// The drag proxy. Every technician has the GWO basics, only a certificate that limits where a team can go is shown
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

// The proxy's status from the same check as the tooltip (DropController#previewDrop). Only touched when it changes,
// so it does not flicker
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
