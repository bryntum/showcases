import { DomHelper } from '@bryntum/core-enterprise';

/**
 * A custom AG Grid status bar panel, on the right of the footer: the late trucks and the slot conflicts among all
 * shipments. Set from the app on every tick through `setCounts()`, reached with `api.getStatusPanel('lateCount')`.
 *
 * Learn more:
 * https://www.ag-grid.com/javascript-data-grid/component-status-bar/
 */
export default class LateCountPanel {
    init() {
        const
            me      = this,
            counter = (parent, label) => {
                const item = DomHelper.createElement({ parent, class : 'lct-footer-item', children : [label] });

                return DomHelper.createElement({ parent : item, tag : 'strong', class : 'lct-footer-alert', text : '0' });
            };

        me.gui       = DomHelper.createElement({ class : 'lct-footer lct-late-panel' });
        me.late      = counter(me.gui, 'Late');
        me.conflicts = counter(me.gui, 'Conflicts');
    }

    getGui() {
        return this.gui;
    }

    /**
     * @param {Object} counts
     * @param {Number} counts.late Late trucks
     * @param {Number} counts.conflicts Slots ending after the shipment's due time
     */
    setCounts({ late, conflicts }) {
        this.late.textContent      = late.toLocaleString('en-US');
        this.conflicts.textContent = conflicts.toLocaleString('en-US');
    }

    refresh() {
        return true;
    }

    destroy() {
        this.gui = this.late = this.conflicts = null;
    }
}
