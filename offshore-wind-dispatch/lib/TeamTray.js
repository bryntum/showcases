import { Container, StringHelper } from '@bryntum/core-enterprise';
// Also registers the widget types used below
import './TeamChip.js';

/**
 * The crews waiting at the port with no trip yet, a slim tray in the header (KpiBar): its title with their count,
 * then a small card per team (TeamChip). Cards are dragged onto a trip, or held over one from the keyboard with Enter,
 * see TeamDrag.
 *
 * It shows a Store of the teams waiting (DispatchState#waitingStore, WaitingTeamModel): a chip per record, in the
 * store's order, kept in step by the store's `add`, `remove` and `refresh` events. A team booked is removed from the
 * store, and its chip from the tray; the chip of a team still waiting stays, DragHelper holds on to the chip it drags.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Container
 * https://bryntum.com/products/scheduler/docs/api/Core/data/Store#event-change
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

        /**
         * The teams waiting, WaitingTeamModel records
         * @config {Core.data.Store}
         */
        store : null,

        /**
         * The ID of the team dragged: its chip stays in the tray, dimmed
         * @prp {String|null}
         */
        lifted : null,

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

    updateStore(store) {
        const me = this;

        me.detachListeners('store');
        store?.on({ name : 'store', add : 'onStoreAdd', remove : 'onStoreRemove', refresh : 'fill', thisObj : me });
        me.fill();
    }

    updatePort() {
        this.updateCount();
    }

    updateLifted(lifted) {
        this.chips.forEach(chip => chip.lifted = chip.team.id === lifted);
    }

    // A chip per team, in the store's order
    fill() {
        const me = this;

        me.chips.forEach(chip => chip.destroy());
        me.onStoreAdd({ records : me.store?.records ?? [], index : 0 });
    }

    // Teams waiting again or for the first time: their chips at their place, after the title and the empty note
    onStoreAdd({ records, index }) {
        const
            me    = this,
            first = me.items.indexOf(me.widgetMap.empty) + 1;

        records.forEach(({ team, job, fault }, i) => me.insert({
            type   : 'teamchip',
            lifted : team.id === me.lifted,
            team,
            job,
            fault
        }, first + index + i));
        me.updateCount();
    }

    // Teams booked: their chips go
    onStoreRemove({ records }) {
        records.forEach(({ id }) => this.chipOf(id)?.destroy());
        this.updateCount();
    }

    // The title's count and the note shown when no team waits
    updateCount() {
        const
            { title, empty } = this.widgetMap ?? {},
            count            = this.store?.count ?? 0;

        if (title) {
            title.html   = `Crews waiting at ${StringHelper.encodeHtml(this.port ?? 'the port')} · ${count}`;
            empty.hidden = Boolean(count);
        }
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
