import { Container } from '@bryntum/core-enterprise';
// Also registers the widget types used below
import './Kpi.js';
import './KpiClock.js';

/**
 * The header, clean: the site and the day shown (KpiClock) on the left, the day's counts (Kpi, from plan/Kpis.js) on
 * the right, the plan's first and what needs acting on after a divider. The time is the schedule's now line, and the
 * weather window is told by the schedule itself: the wave chart's crossing, the no-go hatch and the late trip's tag.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Container
 */
export default class KpiBar extends Container {
    static $name = 'KpiBar';

    static type = 'kpibar';

    static configurable = {
        cls    : 'ow-kpis',
        layout : { type : 'hbox', align : 'center' },
        items  : {
            clock  : { type : 'kpiclock' },
            // Pushes the counts to the right end
            fill   : { type : 'widget', cls : 'ow-kpi-fill', flex : '1 1 0' },
            first  : { type : 'kpi' },
            second : { type : 'kpi' },
            // Between the plan and what needs acting on
            split  : { type : 'widget', cls : 'ow-kpi-split', ariaHidden : true },
            third  : { type : 'kpi' },
            fourth : { type : 'kpi' }
        }
    };

    /**
     * Shows the site and the day's counts
     * @param {Object} values
     * @param {String} values.site
     * @param {Object[]} values.kpis `{ label, value, tone }`, tone `warn`, `alert` or `stop` when it needs attention
     */
    draw({ site, kpis }) {
        const { clock, first, second, third, fourth } = this.widgetMap;

        clock.draw({ site });
        [first, second, third, fourth].forEach((kpi, index) => kpi.draw(kpis[index]));
    }
}

KpiBar.initClass();
