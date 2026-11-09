import { Container } from '@bryntum/core-enterprise';
import { nextDay } from './util/Time.js';
// Also registers the widget types used below
import './Kpi.js';
import './KpiClock.js';

/**
 * The day's counts: turbines due, turbines on a trip, either the trips past their window (when any) or the turbines a
 * forecast moved to the next day, and the turbines stopped
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
        { label : dispatch.isToday ? 'Due today' : 'Due', value : dispatch.dueTurbines.length },
        { label : 'Assigned', value : assigned.size },
        // One slot: trips past their window need acting on now, so they win over what a forecast already moved
        atRisk || !moved.size ?
            { label : 'At risk', value : atRisk, tone : 'warn' } :
            { label : `Moved to ${nextDay}`, value : moved.size, tone : 'alert' },
        { label : 'Stopped', value : dispatch.faults.size, tone : 'stop' }
    ];
}

/**
 * The header, clean: the site, today and the time (KpiClock) on the left, the day's counts (Kpi) on the right, the
 * plan's first and what needs acting on after a divider. The weather window is told by the schedule itself: the wave
 * chart's crossing, the no-go hatch and the late trip's tag.
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
     * Shows the state
     * @param {Object} values
     * @param {String} values.site
     * @param {Number} values.now
     * @param {Boolean} [values.today] The day shown is today, a later day has no clock
     * @param {Object[]} values.kpis `{ label, value, tone }`, tone `warn`, `alert` or `stop` when it needs attention
     */
    draw({ site, now, today = true, kpis }) {
        const { clock, first, second, third, fourth } = this.widgetMap;

        clock.draw({ site, now : today ? now : null });
        [first, second, third, fourth].forEach((kpi, index) => kpi.draw(kpis[index]));
    }
}

KpiBar.initClass();
