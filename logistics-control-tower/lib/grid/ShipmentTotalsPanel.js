import { formatMinutes } from '../util/Time.js';

/**
 * A custom AG Grid status bar panel, on the left of the footer: the shipments shown of all of them, their pallets and
 * their average delay. It follows the grid itself, through `modelUpdated` (rows changed, filtered or searched), and
 * counts at most once per frame, as a tick can update the model more than once.
 *
 * Learn more:
 * https://www.ag-grid.com/javascript-data-grid/component-status-bar/
 * https://www.ag-grid.com/javascript-data-grid/grid-events/#reference-miscellaneous-modelUpdated
 */
export default class ShipmentTotalsPanel {
    /**
     * The shipments of a grid, all of them and those its filters and search leave, with their pallets and average delay
     * @param {Object} api AG Grid API
     * @returns {Object} `{ shown, total, pallets, delay }`
     */
    static count(api) {
        let total = 0, shown = 0, pallets = 0, delay = 0;

        api.forEachLeafNode(() => total++);
        api.forEachNodeAfterFilter(({ group, data }) => {
            if (!group) {
                shown++;
                pallets += data.pallets;
                delay += data.delay;
            }
        });

        return { shown, total, pallets, delay : shown ? delay / shown : 0 };
    }

    init(params) {
        const
            me   = this,
            item = (...children) => {
                const element = document.createElement('div');

                element.className = 'lct-footer-item';
                element.append(...children);
                me.eGui.append(element);
            },
            value = () => document.createElement('strong');

        me.api     = params.api;
        me.eGui    = document.createElement('div');
        me.shown   = value();
        me.of      = document.createElement('span');
        me.pallets = value();
        me.delay   = value();

        me.eGui.className = 'lct-footer lct-totals-panel';
        me.of.className   = 'lct-footer-of';
        item(me.shown, me.of);
        item('Pallets', me.pallets);
        item('Avg delay', me.delay);

        me.onModelUpdated = () => {
            me.frame ||= requestAnimationFrame(() => {
                me.frame = 0;
                me.update();
            });
        };

        me.api.addEventListener('modelUpdated', me.onModelUpdated);
        me.onModelUpdated();
    }

    getGui() {
        return this.eGui;
    }

    update() {
        const
            me                               = this,
            { shown, total, pallets, delay } = ShipmentTotalsPanel.count(me.api);

        me.shown.textContent   = shown.toLocaleString('en-US');
        me.of.textContent      = `of ${total.toLocaleString('en-US')} shown`;
        me.pallets.textContent = pallets.toLocaleString('en-US');
        me.delay.textContent   = formatMinutes(delay, true);
    }

    // The status bar config never changes, the panel stays as it is
    refresh() {
        return true;
    }

    destroy() {
        const { api, onModelUpdated, frame } = this;

        cancelAnimationFrame(frame);

        if (!api.isDestroyed()) {
            api.removeEventListener('modelUpdated', onModelUpdated);
        }
    }
}
