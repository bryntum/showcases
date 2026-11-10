import { Container, StringHelper } from '@bryntum/core-enterprise';
// Also registers the widget types used below
import './TeamChip.js';

/**
 * The crews waiting at the port, in the header: a TeamChip per record of DispatchState#waitingStore, in its order,
 * kept in step by the store's `add`, `remove` and `refresh` events.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/data/Store#event-change
 */
export default class TeamTray extends Container {
    static $name = 'TeamTray';

    static type = 'teamtray';

    static configurable = {
        port : null,

        // WaitingTeamModel records
        store : null,

        // The ID of the team dragged: its chip is dimmed
        lifted : null,

        cls    : 'ow-tray',
        layout : { type : 'hbox', align : 'center' },
        items  : {
            head : {
                type   : 'container',
                cls    : 'ow-tray-head',
                layout : 'vbox',
                items  : {
                    title : { type : 'widget', cls : 'ow-tray-title' },
                    hint  : { type : 'widget', cls : 'ow-tray-hint', html : 'Drag onto a trip' }
                }
            },
            empty : { type : 'widget', cls : 'ow-tray-empty', html : 'Every team has a trip' }
        }
    };

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

    fill() {
        const me = this;

        me.chips.forEach(chip => chip.destroy());
        me.onStoreAdd({ records : me.store?.records ?? [], index : 0 });
    }

    // Chips go after the title and the empty note
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

    onStoreRemove({ records }) {
        records.forEach(({ id }) => this.chipOf(id)?.destroy());
        this.updateCount();
    }

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

    chipOf(id) {
        return this.chips.find(chip => chip.waitingId === id);
    }
}

TeamTray.initClass();
