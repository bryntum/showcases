/**
 * A custom AG Grid status bar panel: the late trucks and the slot conflicts, among all shipments. Set from the app on
 * every tick through `setCounts()`, reached with `api.getStatusPanel('lateCount')`.
 *
 * Learn more:
 * https://www.ag-grid.com/javascript-data-grid/component-status-bar/
 */
export default class LateCountPanel {
    init() {
        const gui = this.gui = document.createElement('div');

        gui.className = 'ag-status-name-value lct-late-panel';
        gui.innerHTML = '<span>Late:&nbsp;</span><span class="ag-status-name-value-value" data-late>0</span>' +
            '<span class="lct-late-panel-sep">Conflicts:&nbsp;</span><span class="ag-status-name-value-value" data-conflicts>0</span>';

        this.late      = gui.querySelector('[data-late]');
        this.conflicts = gui.querySelector('[data-conflicts]');
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
