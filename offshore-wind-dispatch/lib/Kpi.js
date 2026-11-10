import { Widget } from '@bryntum/core-enterprise';

/**
 * One of the day's counts: a number over its label, no box. A tone tints it when the number is above zero: `warn` (past
 * the window) in the at risk orange, `stop` (turbines stopped) in red.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Widget#config-html
 */
export default class Kpi extends Widget {
    static $name = 'Kpi';

    static type = 'kpi';

    static configurable = {
        cls : 'ow-kpi'
    };

    /**
     * Shows a count
     * @param {Object} values
     * @param {String} values.label
     * @param {Number} values.value
     * @param {String} [values.tone] `warn` or `stop`, when it needs attention
     */
    draw({ label, value, tone }) {
        const me = this;

        ['warn', 'stop'].forEach(each => me.element.classList.toggle(`ow-kpi-${each}`, Boolean(tone === each && value)));
        me.html = [
            { tag : 'b', text : String(value) },
            { tag : 'small', text : label }
        ];
    }
}

Kpi.initClass();
