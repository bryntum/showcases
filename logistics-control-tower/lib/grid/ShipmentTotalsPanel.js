import { DomHelper } from '@bryntum/core-enterprise';
import { formatMinutes } from '../util/Time.js';

/**
 * A custom AG Grid status bar panel, on the left of the footer: the shipments shown of all of them, their pallets and
 * their average delay. Set by the grid panel whenever the rows or the filters change, through `setTotals()`, reached
 * with `api.getStatusPanel('totals')`.
 *
 * Learn more:
 * https://www.ag-grid.com/javascript-data-grid/component-status-bar/
 */
export default class ShipmentTotalsPanel {
    init() {
        const
            me   = this,
            item = children => DomHelper.createElement({ parent : me.gui, class : 'lct-footer-item', children });

        me.gui = DomHelper.createElement({ class : 'lct-footer lct-totals-panel' });

        // Each value is a strong, filled in by setTotals()
        [me.shown, me.pallets, me.delay] = [
            item([{ tag : 'strong' }, { tag : 'span', class : 'lct-footer-of' }]),
            item(['Pallets', { tag : 'strong' }]),
            item(['Avg delay', { tag : 'strong' }])
        ].map(element => element.querySelector('strong'));

        me.of = me.gui.querySelector('.lct-footer-of');
    }

    getGui() {
        return this.gui;
    }

    /**
     * @param {Object} totals
     * @param {Number} totals.shown The shipments the filters and the search leave
     * @param {Number} totals.total All shipments
     * @param {Number} totals.pallets The pallets of those shown
     * @param {Number} totals.delay Their average delay in minutes
     */
    setTotals({ shown, total, pallets, delay }) {
        const me = this;

        me.shown.textContent   = shown.toLocaleString('en-US');
        me.of.textContent      = `of ${total.toLocaleString('en-US')} shown`;
        me.pallets.textContent = pallets.toLocaleString('en-US');
        me.delay.textContent   = formatMinutes(delay, true);
    }

    refresh() {
        return true;
    }

    destroy() {
        this.gui = this.shown = this.of = this.pallets = this.delay = null;
    }
}
