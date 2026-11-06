/**
 * A custom AG Grid status bar panel, on the right of the footer: the late trucks and the slot conflicts among all
 * shipments, counted by the app (the slots live on the dock schedule, not in the grid) and set on every tick through
 * `api.getStatusPanel('lateCount').setCounts()`.
 *
 * Learn more:
 * https://www.ag-grid.com/javascript-data-grid/component-status-bar/#accessing-status-bar-panel-instances
 */
export default class LateCountPanel {
    init() {
        const
            me      = this,
            counter = label => {
                const
                    item  = document.createElement('div'),
                    value = document.createElement('strong');

                item.className    = 'lct-footer-item';
                value.className   = 'lct-footer-alert';
                value.textContent = '0';
                item.append(label, value);
                me.eGui.append(item);

                return value;
            };

        me.eGui           = document.createElement('div');
        me.eGui.className = 'lct-footer lct-late-panel';
        me.late           = counter('Late');
        me.conflicts      = counter('Conflicts');
    }

    getGui() {
        return this.eGui;
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

    // The status bar config never changes, the panel stays as it is
    refresh() {
        return true;
    }
}
