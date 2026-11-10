import { Container, StringHelper } from '@bryntum/core-enterprise';
// Also registers the widget types used below
import './TeamChip.js';

/**
 * The crews waiting at the port with no trip yet, in the header (KpiBar): the title with their count over a hint on
 * how to book one, then a card per team (TeamChip), dragged onto a trip or held over one with Enter (TeamDrag).
 *
 * A chip per record of the teams' Store (DispatchState#waitingStore), in its order, kept in step by its `add`,
 * `remove` and `refresh` events. A booked team's chip goes; DragHelper holds on to the chip it drags.
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
            // The title, and under it how a team is booked
            head : {
                type   : 'container',
                cls    : 'ow-tray-head',
                layout : 'vbox',
                items  : {
                    title : { type : 'widget', cls : 'ow-tray-title' },
                    hint  : { type : 'widget', cls : 'ow-tray-hint', html : 'Drag onto a trip, or press Enter' }
                }
            },
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
        this.chips.forEach(chip => chip.lifted = chip.waitingId === lifted);
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

        records.forEach(({ id, team, job, fault }, i) => me.insert({
            type      : 'teamchip',
            waitingId : id,
            lifted    : id === me.lifted,
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

    // The title's count, and the note shown when no team waits in place of the hint
    updateCount() {
        const
            { title, hint, empty } = this.widgetMap ?? {},
            count                  = this.store?.count ?? 0;

        if (title) {
            title.html   = `Crews waiting at ${StringHelper.encodeHtml(this.port ?? 'the port')} · ${count}`;
            empty.hidden = Boolean(count);
            hint.hidden  = !count;
        }
    }

    /**
     * The chip of a team waiting
     * @param {String} id Its record's ID in the waiting store
     * @returns {TeamChip|undefined}
     */
    chipOf(id) {
        return this.chips.find(chip => chip.waitingId === id);
    }
}

TeamTray.initClass();
