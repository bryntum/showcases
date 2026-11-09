import { Widget } from '@bryntum/core-enterprise';

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
     * Shows the site and the day shown
     * @param {Object} values
     * @param {String} values.site
     * @param {String} values.day The day shown, "Mon 9 Nov"
     */
    draw({ site, day }) {
        this.html = [
            { tag : 'b', text : site },
            { tag : 'small', text : day }
        ];
    }
}

KpiClock.initClass();
