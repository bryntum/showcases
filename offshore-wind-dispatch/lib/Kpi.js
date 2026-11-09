import { Widget } from '@bryntum/core-enterprise';

/**
 * One of the day's counts: a label over a number. A tone (`warn` or `alert`) tints it when the number is above zero.
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
     * @param {String} [values.tone] `warn` or `alert`, when it needs attention
     */
    draw({ label, value, tone }) {
        const me = this;

        me.toggleCls('ow-kpi-warn', Boolean(tone === 'warn' && value));
        me.toggleCls('ow-kpi-alert', Boolean(tone === 'alert' && value));
        me.html = [
            { tag : 'small', text : label },
            { tag : 'b', text : String(value) }
        ];
    }
}

Kpi.initClass();
