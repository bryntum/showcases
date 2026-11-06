import { formatMinutes, formatTime, minuteMs } from '../util/Time.js';

/**
 * The ETA, then how long until the truck arrives, or how long it has been on site, relative to the simulated now in
 * the grid's `context`. A component renderer: the app refreshes the column (forced, as its values did not change) when
 * the clock moves, and `refresh()` updates the text of the rendered cells in place.
 *
 * Learn more:
 * https://www.ag-grid.com/javascript-data-grid/component-cell-renderer/#cell-renderer-component-refresh
 * https://www.ag-grid.com/javascript-data-grid/view-refresh/#refresh-cells
 * https://www.ag-grid.com/javascript-data-grid/context/
 */
export default class EtaCellRenderer {
    init(params) {
        const me = this;

        me.eGui     = document.createElement('span');
        me.time     = document.createElement('span');
        me.relative = document.createElement('span');

        me.eGui.className = 'lct-eta';
        me.time.className = 'lct-eta-time';
        me.eGui.append(me.time, me.relative);
        me.refresh(params);
    }

    getGui() {
        return this.eGui;
    }

    refresh({ data, context }) {
        const
            { relative } = this,
            minutes      = (data.eta - context.now) / minuteMs,
            arrived      = minutes <= 0;

        this.time.textContent = formatTime(data.eta);
        // Unloaded trucks have their ETA only
        relative.hidden       = data.status === 'done';
        relative.className    = !arrived && minutes <= 60 ? 'lct-eta-relative lct-eta-soon' : 'lct-eta-relative';
        relative.textContent  = arrived ? `on site ${formatMinutes(-minutes)}` : `in ${formatMinutes(minutes)}`;

        return true;
    }
}
