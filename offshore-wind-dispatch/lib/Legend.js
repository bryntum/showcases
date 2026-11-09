import { Widget } from '@bryntum/core-enterprise';

/**
 * The schedule's footer, under its last row: what the work blocks, the transit line, the orange outline and the
 * hatching mean, and the products the page is built from. Its swatches are drawn by resources/layout/legend.css.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Widget#config-html
 */
export default class Legend extends Widget {
    static $name = 'Legend';

    static type = 'legend';

    static configurable = {
        cls : 'ow-legend',

        /**
         * The view it explains, `day` or `week`
         * @prp {'day'|'week'}
         */
        view : 'day'
    };

    updateView(view) {
        const item = (kind, text) => ({ tag : 'span', class : `ow-l ow-l-${kind}`, children : [{ tag : 'i' }, text] });

        this.html = view === 'week' ? [
            item('cell', 'Trips: times, seats, turbines; bar = seats used'),
            item('free', 'Workable, free'),
            item('nogo', 'No-go'),
            { tag : 'span', class : 'ow-legend-credit', text : 'Drag a crew onto a free cell to plan it' }
        ] : [
            item('work', 'Work'),
            item('transit', 'Transit'),
            item('dependency', 'Must finish first'),
            item('risk', 'At risk'),
            item('nogo', 'Weather no-go'),
            { tag : 'span', class : 'ow-legend-credit', text : 'Schedule: Bryntum Scheduler · Wave height: AG Charts' }
        ];
    }
}

Legend.initClass();
