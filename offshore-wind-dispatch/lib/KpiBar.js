import { Container } from '@bryntum/core-enterprise';
import { nextDay } from './util/Time.js';
// Also registers the widget types used below
import './Kpi.js';
import './KpiClock.js';
import './KpiWindow.js';

/**
 * The day's counts: turbines due, turbines on a trip, and either the trips past their window (when any) or the turbines
 * a forecast moved to the next day
 * @param {TripModel[]} trips
 * @param {DispatchState} dispatch
 * @returns {Object[]} `{ label, value, tone }`
 */
export function dayKpis(trips, dispatch) {
    const
        assigned = new Set(trips.filter(trip => trip.status !== 'moved').flatMap(trip => trip.turbines)),
        moved    = new Set(trips.flatMap(trip => trip.status === 'moved' ? trip.turbines : trip.removed ?? [])),
        atRisk   = trips.filter(trip => trip.status === 'at-risk').length;

    return [
        { label : 'Due today', value : dispatch.dueTurbines.length },
        { label : 'Assigned', value : assigned.size },
        // One slot: trips past their window need acting on now, so they win over what a forecast already moved
        atRisk || !moved.size ?
            { label : 'At risk', value : atRisk, tone : 'warn' } :
            { label : `Moved to ${nextDay}`, value : moved.size, tone : 'alert' }
    ];
}

/**
 * The header: the site, today and the time (KpiClock), then the headline, when the crew transfer vessels' weather
 * window closes and how long is left (KpiWindow), then the day's counts (Kpi). Everything else on screen explains the
 * window.
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
            window : { type : 'kpiwindow' },
            first  : { type : 'kpi' },
            second : { type : 'kpi' },
            third  : { type : 'kpi' }
        }
    };

    /**
     * Shows the state
     * @param {Object} values
     * @param {String} values.site
     * @param {Number} values.now
     * @param {Number} values.closes When the CTV window closes
     * @param {Number} [values.was] When it closed before the latest forecast
     * @param {Object[]} values.kpis `{ label, value, tone }`, tone `warn` or `alert` when it needs attention
     */
    draw({ site, now, closes, was, kpis }) {
        const { clock, window, first, second, third } = this.widgetMap;

        clock.draw({ site, now });
        window.draw({ now, closes, was });
        [first, second, third].forEach((kpi, index) => kpi.draw(kpis[index]));
    }
}

KpiBar.initClass();
