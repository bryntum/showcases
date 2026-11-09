import { Container } from '@bryntum/core-enterprise';
// Also registers the widget types used below
import './TeamChip.js';

/**
 * The crews waiting at the port with no trip yet, a slim tray under the schedule: its title with their count, then a
 * small card per team (TeamChip). Cards are dragged onto a trip, or held over one from the keyboard with Enter, see
 * TeamDrag.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Container
 */
export default class TeamTray extends Container {
    static $name = 'TeamTray';

    static type = 'teamtray';

    static configurable = {
        /**
         * The port's name
         * @config {String}
         */
        port : null,

        cls    : 'ow-tray',
        layout : { type : 'hbox', align : 'center' },
        items  : {
            title : { type : 'widget', cls : 'ow-tray-title' },
            empty : { type : 'widget', cls : 'ow-tray-empty', html : 'Every team has a trip' }
        }
    };

    /**
     * The chips of the teams waiting
     * @property {TeamChip[]}
     */
    get chips() {
        return this.items.filter(item => item.isTeamChip);
    }

    /**
     * Shows the waiting teams: the chip of a team that is still waiting stays, DragHelper holds on to the chip it drags
     * @param {Object[]} waiting `{ team, job, fault }`
     * @param {String} [lifted] The team being dragged
     */
    draw(waiting, lifted) {
        const
            me               = this,
            { title, empty } = me.widgetMap,
            chips            = new Map(me.chips.map(chip => [chip.team.id, chip])),
            ids              = new Set(waiting.map(({ team }) => team.id));

        title.html = `Crews waiting at ${me.port ?? 'the port'} · ${waiting.length}`;

        // Out go the chips of the teams that have a trip now
        chips.forEach((chip, id) => {
            if (!ids.has(id)) {
                chip.destroy();
                chips.delete(id);
            }
        });

        // After the title and the empty note, in the order of the waiting teams
        waiting.forEach(({ team, job, fault }, index) => {
            const chip = chips.get(team.id);

            chip?.draw(job);

            if (!chip || me.items.indexOf(chip) !== index + 2) {
                me.insert(chip ?? { type : 'teamchip', team, job, fault }, index + 2);
            }
        });

        me.chips.forEach(chip => chip.lifted = chip.team.id === lifted);
        empty.hidden = Boolean(ids.size);
    }

    /**
     * The team's chip
     * @param {String} teamId
     * @returns {TeamChip|undefined}
     */
    chipOf(teamId) {
        return this.chips.find(chip => chip.team.id === teamId);
    }
}

TeamTray.initClass();
