import { Widget } from '@bryntum/core-enterprise';
import { dayShort } from './util/Time.js';

/**
 * The site and the day, quiet; the time is the schedule's now line
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
     */
    draw({ site }) {
        this.html = [
            { tag : 'b', text : site },
            { tag : 'small', text : dayShort }
        ];
    }
}

KpiClock.initClass();
