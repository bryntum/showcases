import { Widget } from '@bryntum/core-enterprise';

/**
 * The schedule's footer, under its last row: what the work blocks, the transit line, the orange outline and the
 * hatching mean, and the products the page is built from. Its swatches are drawn by resources/schedule/scheduler.css.
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
            {
                tag      : 'span',
                class    : 'ow-legend-credit',
                // The products the showcase is built with, linked to their pages (as on the gallery)
                children : [
                    'Schedule: ',
                    { tag : 'a', href : 'https://bryntum.com/products/scheduler/', target : '_blank', rel : 'noopener', text : 'Bryntum Scheduler' },
                    ' · Wave height: ',
                    { tag : 'a', href : 'https://www.ag-grid.com/charts/', target : '_blank', rel : 'noopener', text : 'AG Charts' }
                ]
            }
        ];
    }
}

Legend.initClass();
