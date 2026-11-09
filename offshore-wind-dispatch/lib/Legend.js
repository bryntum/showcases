import { Widget } from '@bryntum/core-enterprise';

/**
 * The legend under the schedule: what the trip bars' colours and outlines mean, and the products the page is built
 * from. Its swatches are drawn by resources/layout/legend.css.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Widget#config-html
 */
export default class Legend extends Widget {
    static $name = 'Legend';

    static type = 'legend';

    static configurable = {
        cls : 'ow-legend'
    };

    afterConstruct() {
        super.afterConstruct();

        this.html = [
            { tag : 'span', class : 'ow-l-plan', text : 'On plan' },
            { tag : 'span', class : 'ow-l-risk', text : 'Past window' },
            { tag : 'span', class : 'ow-l-trim', text : 'Trimmed' },
            { tag : 'span', class : 'ow-l-cancel', text : 'Moved' },
            { tag : 'span', class : 'ow-l-nogo', text : 'Weather no-go' },
            { tag : 'span', class : 'ow-l-dep', text : 'Must finish first' },
            { tag : 'span', class : 'ow-legend-credit', text : 'Schedule: Bryntum Scheduler · Wave height: AG Charts' }
        ];
    }
}

Legend.initClass();
