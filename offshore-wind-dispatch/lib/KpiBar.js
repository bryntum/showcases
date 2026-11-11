import { Container } from '@bryntum/core-enterprise';
// Also registers the widget types used below
import './TeamTray.js';
import './RiskNote.js';

const
    hbox = { type : 'hbox', align : 'center' },
    // One of the day's counts, the figure over its label; drawn by draw()
    kpi  = { type : 'widget', cls : 'ow-kpi' };

/**
 * The app's header: over the schedule the site, the day and the crews waiting (TeamTray); over the map the day's
 * counts, what needs acting on after a divider. On a phone the counts give way to the trips back after their window
 * (RiskNote), whose Show calls the app's `showRisk` (`up.`).
 *
 * Learn more:
 * https://bryntum.com/docs/api/Core/widget/Container
 */
export default class KpiBar extends Container {
    static $name = 'KpiBar';

    static type = 'kpibar';

    static configurable = {
        // `{ port, portShort }`
        site : null,

        cls    : 'ow-kpis',
        layout : hbox
    };

    construct(config) {
        const { site } = config;

        super.construct({
            ...config,
            items : {
                lead : {
                    type   : 'container',
                    cls    : 'ow-kpis-lead',
                    flex   : 1,
                    layout : { ...hbox, justify : 'space-between' },
                    items  : {
                        clock : { type : 'widget', cls : 'ow-clock' },
                        tray  : { type : 'teamtray', port : site.portShort ?? site.port }
                    }
                },
                counts : {
                    type   : 'container',
                    cls    : 'ow-kpis-counts',
                    layout : { ...hbox, justify : 'end' },
                    items  : {
                        kpi0  : { ...kpi },
                        kpi1  : { ...kpi },
                        split : { type : 'widget', cls : 'ow-kpi-split', ariaHidden : true },
                        kpi2  : { ...kpi },
                        kpi3  : { ...kpi },
                        risk  : { type : 'risknote', onLocate : 'up.showRisk' }
                    }
                }
            }
        });
    }

    /**
     * @param {DispatchState} dispatch
     * @param {TripModel[]} trips The trips of the day shown
     * @param {Boolean} phone
     */
    draw(dispatch, trips, phone) {
        const { widgetMap } = this;

        widgetMap.clock.html = [{ tag : 'b', text : dispatch.site.name }, { tag : 'small', text : dispatch.dayShort }];
        dispatch.kpis(trips).forEach(({ label, value, tone }, index) => {
            const widget = widgetMap[`kpi${index}`];

            widget.html = [{ tag : 'b', text : String(value) }, { tag : 'small', text : label }];
            // `warn` past the window, `stop` stopped: tinted while above zero
            tone && widget.element.classList.toggle(`ow-kpi-${tone}`, value > 0);
        });
        widgetMap.risk.trips = phone ? dispatch.lateTrips(trips) : [];
    }
}

KpiBar.initClass();
