import { statusText } from '../util/Status.js';

/**
 * The status pill, a dot in the status colour (grid.css) and the text. A component renderer, refreshed in place when
 * the status changes, the cell flashes as the simulation moves it on.
 *
 * Learn more:
 * https://www.ag-grid.com/javascript-data-grid/component-cell-renderer/
 */
export default class StatusCellRenderer {
    init(params) {
        this.eGui = document.createElement('span');
        this.refresh(params);
    }

    getGui() {
        return this.eGui;
    }

    refresh({ value }) {
        this.eGui.className   = `lct-pill lct-status-${value}`;
        this.eGui.textContent = statusText[value];

        return true;
    }
}
