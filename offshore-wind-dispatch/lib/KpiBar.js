import { StringHelper, Widget } from '@bryntum/core-enterprise';
import { icon } from './util/Icons.js';
import { dayShort, duration, hhmm, nextDay } from './util/Time.js';

/**
 * The day's counts: turbines due, turbines on a trip, and either the turbines a forecast moved to the next day or the
 * trips past their window
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
        moved.size ?
            { label : `Moved to ${nextDay}`, value : moved.size, tone : 'alert' } :
            { label : 'At risk', value : atRisk, tone : 'warn' }
    ];
}

/**
 * The header: the site, today and the time, then the headline, when the crew transfer vessels' weather window closes
 * and how long is left, then the day's counts. Everything else on screen explains the window. When a forecast closes
 * it earlier the headline turns red and keeps the old time struck through.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Widget#config-html
 */
export default class KpiBar extends Widget {
    static $name = 'KpiBar';

    static type = 'kpibar';

    static configurable = {
        cls : 'ow-kpis'
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
        const
            text  = StringHelper.encodeHtml,
            moved = was != null && was !== closes;

        this.html = `
            <div class="ow-clock"><small>${text(site)} · today</small><b>${dayShort}<span class="ow-clock-time">${hhmm(now)}</span></b></div>
            <div class="ow-window${moved ? ' ow-window-short' : ''}">
                ${icon('waves')}
                <span><small>CTV weather window</small><b>Closes ${hhmm(closes)}</b></span>
                <span class="ow-window-left">${closes > now ? `${duration(closes - now)} left` : 'Closed'}${moved ? `<em>was ${hhmm(was)}</em>` : ''}</span>
            </div>
            ${kpis.map(({ label, value, tone }) => `
            <div class="ow-kpi${tone && value ? ` ow-kpi-${tone}` : ''}"><small>${text(label)}</small><b>${value}</b></div>`).join('')}`;
    }
}

KpiBar.initClass();
