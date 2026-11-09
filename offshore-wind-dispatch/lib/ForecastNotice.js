import { Container } from '@bryntum/core-enterprise';
import { iconConfig } from './util/Icons.js';
// Also registers the widget types used below
import './IconButton.js';

/**
 * The notice of a new forecast above the schedule: what it says, what the planner changed because of it, an Undo and
 * a button to go through the changes. Hidden until a forecast changes the plan. The buttons trigger `undo` and
 * `review`.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Container
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Button
 */
export default class ForecastNotice extends Container {
    static $name = 'ForecastNotice';

    static type = 'forecastnotice';

    static configurable = {
        cls    : 'ow-toast',
        hidden : true,
        layout : { type : 'hbox', align : 'center' },
        items  : {
            text : { type : 'widget', cls : 'ow-toast-text' },
            undo : {
                type      : 'iconbutton',
                rendition : 'text',
                text      : 'Undo',
                svg       : 'arrow-undo',
                onClick   : 'up.clickUndo'
            },
            // The theme's own filled blue button: white text on the work blue
            review : {
                type      : 'button',
                rendition : 'filled',
                color     : 'b-blue',
                cls       : 'ow-toast-primary',
                onClick   : 'up.clickReview'
            }
        }
    };

    afterConstruct() {
        super.afterConstruct();

        this.element.setAttribute('role', 'status');
    }

    /**
     * Draws the notice and shows it
     * @param {Object} options
     * @param {String} options.headline
     * @param {String} options.detail
     * @param {Number} options.changes How many trips changed
     */
    draw({ headline, detail, changes }) {
        const { text, review } = this.widgetMap;

        text.html = [
            iconConfig('warning'),
            { tag : 'span', children : [{ tag : 'b', text : headline }, ` ${detail}`] }
        ];
        review.text = `Review ${changes} ${changes === 1 ? 'change' : 'changes'}`;
        this.hidden = false;
    }

    // Not named onUndo and onReview: trigger() calls such a method for the event
    clickUndo() {
        this.trigger('undo');
    }

    clickReview() {
        this.trigger('review');
    }
}

ForecastNotice.initClass();
