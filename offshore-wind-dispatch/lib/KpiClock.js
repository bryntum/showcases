import { Widget } from '@bryntum/core-enterprise';
import { dayShort, hhmm } from './util/Time.js';

/**
 * The site, today and the time, quiet beside the weather window
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Widget#config-html
 */
export default class KpiClock extends Widget {
    static $name = 'KpiClock';

    static type = 'kpiclock';

    static configurable = {
        cls : 'ow-clock'
    };

    /**
     * Shows the clock
     * @param {Object} values
     * @param {String} values.site
     * @param {Number} values.now Minutes of the day
     */
    draw({ site, now }) {
        this.html = [
            { tag : 'b', text : site },
            {
                tag      : 'small',
                children : [`${dayShort} · `, { tag : 'span', class : 'ow-clock-time', text : hhmm(now) }]
            }
        ];
    }
}

KpiClock.initClass();
