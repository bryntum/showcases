import { icon } from '../util/Icons.js';

// More than this many degrees off the set point is an excursion
const tolerance = 2;

/**
 * Reefer temperature after a snowflake, an amber warning chip when it is off its set point, nothing for the loads
 * which are not chilled. A component renderer, updated in place as the simulation moves the temperatures.
 *
 * Learn more:
 * https://www.ag-grid.com/javascript-data-grid/component-cell-renderer/
 */
export default class TemperatureCellRenderer {
    init(params) {
        const me = this;

        me.eGui = document.createElement('span');
        me.icon = document.createElement('i');
        me.text = document.createTextNode('');

        me.icon.setAttribute('aria-hidden', 'true');
        me.refresh(params);
    }

    getGui() {
        return this.eGui;
    }

    refresh({ data, value }) {
        const
            me       = this,
            { eGui } = me;

        if (value == null) {
            eGui.className = '';
            eGui.replaceChildren();
            eGui.removeAttribute('title');

            return true;
        }

        const off = Math.abs(value - data.setpoint) > tolerance;

        eGui.className    = off ? 'lct-temp lct-temp-off' : 'lct-temp';
        eGui.title        = `Set point ${data.setpoint} °C`;
        me.icon.className = icon(off ? 'warning' : 'snowflake');
        me.text.data      = `${value.toFixed(1).replace('-', '−')} °C`;
        eGui.replaceChildren(me.icon, me.text);

        return true;
    }
}
