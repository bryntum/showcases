import { Widget } from '@bryntum/core-enterprise';
import { iconConfig } from './util/Icons.js';
import { duration, hhmm } from './util/Time.js';

/**
 * The headline: when the crew transfer vessels' weather window closes and how long is left. When a forecast closes it
 * earlier it turns red and keeps the old time struck through.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Widget#config-html
 */
export default class KpiWindow extends Widget {
    static $name = 'KpiWindow';

    static type = 'kpiwindow';

    static configurable = {
        cls : 'ow-window'
    };

    /**
     * Shows the window
     * @param {Object} values
     * @param {Number} values.now
     * @param {Number} values.closes When the CTV window closes
     * @param {Number} [values.was] When it closed before the latest forecast
     */
    draw({ now, closes, was }) {
        const
            me    = this,
            moved = was != null && was !== closes;

        me.toggleCls('ow-window-short', moved);
        me.html = [
            iconConfig('waves'),
            {
                tag      : 'span',
                children : [{ tag : 'small', text : 'CTV weather window' }, { tag : 'b', text : `Closes ${hhmm(closes)}` }]
            },
            {
                tag      : 'span',
                class    : 'ow-window-left',
                children : [
                    closes > now ? `${duration(closes - now)} left` : 'Closed',
                    moved ? { tag : 'em', text : `was ${hhmm(was)}` } : null
                ]
            }
        ];
    }
}

KpiWindow.initClass();
