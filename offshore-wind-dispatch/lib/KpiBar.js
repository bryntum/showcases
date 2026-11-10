import { Container } from '@bryntum/core-enterprise';
// Also registers the widget types used below
import './Kpi.js';
import './TeamTray.js';

/**
 * The header, in two parts as the app under it: over the schedule the site and the day shown, and at its right end the
 * crews waiting at the port (TeamTray); over the map the day's counts (Kpi), what needs acting on after a divider.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Container
 */
export default class KpiBar extends Container {
    static $name = 'KpiBar';

    static type = 'kpibar';

    static configurable = {
        /**
         * The port's name, for the crews' title
         * @config {String}
         */
        port : null,

        cls    : 'ow-kpis',
        layout : { type : 'hbox', align : 'center' },
        items  : {
            // Over the schedule: the site, and the crews at its right end
            lead : {
                type   : 'container',
                cls    : 'ow-kpis-lead',
                flex   : 1,
                layout : { type : 'hbox', align : 'center' },
                items  : {
                    // The site over the day shown, quiet
                    clock : { type : 'widget', cls : 'ow-clock' },
                    // Pushes the crews to the right end
                    fill  : { type : 'widget', cls : 'ow-kpi-fill', flex : '1 1 0' },
                    tray  : { type : 'teamtray' }
                }
            },
            // Over the map, as wide as it: the counts at its right end
            counts : {
                type   : 'container',
                cls    : 'ow-kpis-counts',
                layout : { type : 'hbox', align : 'center' },
                items  : {
                    // Pushes the counts to the right end
                    push   : { type : 'widget', cls : 'ow-kpi-fill', flex : '1 1 0' },
                    first  : { type : 'kpi' },
                    second : { type : 'kpi' },
                    // Between the plan and what needs acting on
                    split  : { type : 'widget', cls : 'ow-kpi-split', ariaHidden : true },
                    third  : { type : 'kpi' },
                    fourth : { type : 'kpi' }
                }
            }
        }
    };

    afterConstruct() {
        super.afterConstruct();

        this.widgetMap.tray.port = this.port;
    }

    /**
     * Shows the site and the day's counts
     * @param {Object} values
     * @param {String} values.site
     * @param {String} values.day The day shown, "Mon 9 Nov"
     * @param {Object[]} values.kpis `{ label, value, tone }`, tone `warn`, `alert` or `stop` when it needs attention
     */
    draw({ site, day, kpis }) {
        const { clock, first, second, third, fourth } = this.widgetMap;

        clock.html = [{ tag : 'b', text : site }, { tag : 'small', text : day }];
        [first, second, third, fourth].forEach((kpi, index) => kpi.draw(kpis[index]));
    }
}

KpiBar.initClass();
