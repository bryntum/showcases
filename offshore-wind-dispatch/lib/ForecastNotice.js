import { StringHelper, Widget } from '@bryntum/core-enterprise';
import { icon } from './util/Icons.js';

/**
 * The notice of a new forecast above the schedule: what it says, what the planner changed because of it, an Undo and
 * a button to go through the changes. Hidden until a forecast changes the plan.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Widget#config-html
 */
export default class ForecastNotice extends Widget {
    static $name = 'ForecastNotice';

    static type = 'forecastnotice';

    static configurable = {
        cls    : 'ow-toast',
        hidden : true
    };

    /**
     * Draws the notice and shows it
     * @param {Object} options
     * @param {String} options.headline
     * @param {String} options.detail
     * @param {Number} options.changes How many trips changed
     */
    draw({ headline, detail, changes }) {
        const text = StringHelper.encodeHtml;

        this.html = `
            ${icon('warning')}
            <span><b>${text(headline)}</b> ${text(detail)}</span>
            <button type="button" data-action="undo">${icon('arrow-undo')} Undo</button>
            <button type="button" class="ow-toast-primary" data-action="review">Review ${changes} ${changes === 1 ? 'change' : 'changes'}</button>`;
        this.element.setAttribute('role', 'status');
        this.hidden = false;
    }
}

ForecastNotice.initClass();
