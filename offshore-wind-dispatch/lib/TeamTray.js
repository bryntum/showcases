import { StringHelper, Widget } from '@bryntum/core-enterprise';
import { duration } from './util/Time.js';
import { icon } from './util/Icons.js';

/**
 * The teams waiting at the port with no trip yet: a chip per team with its turbine, its job, how long it takes and the
 * certificates it holds. Chips are dragged onto a trip, or held over one from the keyboard with Enter, see TeamDrag.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Widget#config-html
 */

/**
 * A team's chip, also the one following the pointer while it is dragged
 * @param {Object} team `{ id, name, techs, certs }`
 * @param {Object} job `{ turbine, job, short, minutes }`, `short` names the job in a few words for the chip
 * @param {Boolean} [compact] Its name and certificates only
 * @returns {String} HTML
 */
export function teamChipHtml(team, job, compact = false) {
    const
        text  = StringHelper.encodeHtml,
        // Every technician has the GWO basics, only a certificate that limits where a team can go is worth a word
        certs = team.certs.filter(cert => cert !== 'GWO')
            .map(cert => `<span class="ow-cert ow-cert-${cert.toLowerCase()}">${text(cert)}</span>`).join('');

    if (compact) {
        return `<b>${text(team.name)}</b><span class="ow-certs">${certs}</span>`;
    }

    return `
        <span class="ow-team-crew">${icon('hard-hat')}</span>
        <span class="ow-team-text">
            <span class="ow-team-name"><b>${text(team.name)}</b><span class="ow-certs">${certs}</span></span>
            <span class="ow-team-job">${text(job.turbine)} · ${duration(job.minutes)}</span>
        </span>`;
}

/**
 * What the chip leaves out, for its hover tooltip: the technicians and the job
 * @param {Object} team `{ techs }`
 * @param {Object} job `{ job }`
 * @returns {String}
 */
function teamTitle(team, job) {
    return `${team.techs} technicians · ${job.job}`;
}

export default class TeamTray extends Widget {
    static $name = 'TeamTray';

    static type = 'teamtray';

    static configurable = {
        /**
         * The port's name
         * @config {String}
         */
        port : null,

        cls : 'ow-tray'
    };

    /**
     * Shows the waiting teams
     * @param {Object[]} waiting `{ team, job }`
     * @param {String} [lifted] The team being dragged
     */
    draw(waiting, lifted) {
        const chips = waiting.map(({ team, job }) => `
            <div class="ow-team${team.id === lifted ? ' ow-team-lifted' : ''}" data-team="${StringHelper.encodeHtml(team.id)}" data-btip="${StringHelper.encodeHtml(teamTitle(team, job))}"
                role="button" tabindex="0" aria-label="${StringHelper.encodeHtml(`${team.name}, ${job.turbine}. Drag onto a trip, or press Enter to choose a trip with the arrow keys`)}">
                ${teamChipHtml(team, job)}
            </div>`).join('');

        this.html = `
            <span class="ow-tray-title">${icon('anchor')} Waiting at ${StringHelper.encodeHtml(this.port ?? 'the port')}</span>
            ${chips || '<span class="ow-tray-empty">Every team has a trip</span>'}`;
    }
}

TeamTray.initClass();
