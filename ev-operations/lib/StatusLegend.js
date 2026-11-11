import { List, StringHelper } from '@bryntum/core-enterprise';
import { statusKeys } from './util/Time.js';

/**
 * Horizontal List of the status colors with a live count each. A List, so the statuses get keyboard navigation and
 * multi selection for free: its selection toggles the statuses in and out of view, the view filters, see
 * SimulatedView#visibleStatuses. One legend per view, so each view keeps its own filter. The key for the blocked time
 * hatches after it is a widget of its own, see StatusKey. The listener on the view uses `thisObj`, so it is removed
 * when the legend is destroyed.
 *
 * Learn more:
 * https://bryntum.com/docs/api/Core/widget/List
 */
export default class StatusLegend extends List {
    static $name = 'StatusLegend';

    static type = 'statuslegend';

    static configurable = {
        cls         : 'ev-legend',
        multiSelect : true,
        // The record id is the status, which maps to a status color in CSS
        itemTpl     : record => StringHelper.xss`<i class="ev-legend-swatch ev-status-${record.id}"></i><span class="ev-legend-label">${record.text}</span><span class="ev-legend-count">${record.count}</span>`,
        listeners   : {
            beforeItem      : 'onBeforeStatusToggle',
            selectionChange : 'onStatusSelectionChange'
        },

        /**
         * The view to filter
         * @config {SimulatedView}
         */
        view : null
    };

    updateView(view) {
        const me = this;

        me.detachViewListener?.();
        me.detachViewListener = null;

        if (!view) {
            return;
        }

        // Labels per view
        me.items = statusKeys.map(id => ({ id, text : view.scenario.legend[id], count : 0 }));
        // All statuses are shown initially
        me.selectAll();

        // Counts follow the simulated time and data changes, once the view has synced its statuses
        me.detachViewListener = view.on({ legendStatusesSync : 'refreshCounts', thisObj : me });
        me.refreshCounts();
    }

    // Only the items whose count changed re-render
    refreshCounts() {
        const counts = this.view.getStatusCounts();

        this.store.forEach(record => {
            record.count = counts[record.id] || 0;
        });
    }

    // Keep at least one status visible, ignore toggling off the last one
    onBeforeStatusToggle({ record }) {
        const { selected } = this;

        if (selected.count === 1 && selected.includes(record)) {
            return false;
        }
    }

    onStatusSelectionChange() {
        const { view, selected, store } = this;

        if (view) {
            // All selected means nothing is filtered
            view.visibleStatuses = selected.count && selected.count < store.count ?
                new Set(selected.values.map(record => record.id)) :
                null;
        }
    }
}

StatusLegend.initClass();
