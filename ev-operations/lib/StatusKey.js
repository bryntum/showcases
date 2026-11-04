import { Widget } from '@bryntum/core-enterprise';

/**
 * Key for the blocked time hatches of the timeline, shown after the status legend. It only explains the hatches, so it
 * is a plain widget of its own, outside the legend's list: not selectable, not focusable and hidden from assistive
 * technology. Uses `compose()`, which re-renders when a config it reads changes.
 *
 * Learn more:
 * https://bryntum.com/products/gantt/docs/api/Core/widget/Widget#function-compose
 */
export default class StatusKey extends Widget {
    static $name = 'StatusKey';

    static type = 'statuskey';

    static configurable = {
        // On the widget, not in compose(), whose root class would replace the widget's own, `b-hidden` included
        cls : 'ev-legend-key',

        /**
         * Key entries, `[{ text, down }]`. Each shows the hatch of a blocked time range, red tinted for `down` (a
         * breakdown)
         * @config {Object[]}
         */
        keyItems : null
    };

    compose() {
        return {
            'aria-hidden' : 'true',
            children      : (this.keyItems || []).map(({ text, down }) => ({
                tag      : 'span',
                class    : { 'ev-key-item' : 1, 'ev-key-down' : down },
                children : [
                    { tag : 'i', class : 'ev-key-swatch' },
                    { tag : 'span', text }
                ]
            }))
        };
    }
}

StatusKey.initClass();
