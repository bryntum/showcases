import { DateHelper, DomHelper, Widget } from '@bryntum/core-enterprise';

/**
 * The control tower's header: the simulated clock and the live KPI counters. Each value has a fixed width and tabular
 * figures (kpi.css), so nothing shifts while the numbers change. Built once, then only the text of the values changes.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Widget
 */
export default class KpiBar extends Widget {
    static $name = 'KpiBar';

    static type = 'kpibar';

    // The counters, by key
    static kpis = {
        inTransit : 'In transit',
        onTime    : 'On time',
        late      : 'Late',
        yard      : 'At yard',
        unloading : 'Unloading',
        done      : 'Unloaded',
        conflicts : 'Conflicts'
    };

    static configurable = {
        cls : 'lct-kpis'
    };

    construct(config) {
        super.construct(config);

        const
            me   = this,
            make = (className, parent, text = '') => DomHelper.createElement({ className, parent, text });

        me.clock     = make('lct-clock', me.element);
        me.clockDay  = make('lct-clock-day', me.clock);
        me.clockTime = make('lct-clock-time', me.clock);
        me.values    = {};

        Object.entries(KpiBar.kpis).forEach(([key, label]) => {
            const kpi = make(`lct-kpi lct-kpi-${key}`, me.element);

            me.values[key] = make('lct-kpi-value', kpi, '–');
            make('lct-kpi-label', kpi, label);
        });
    }

    /**
     * Shows the clock and the counters
     * @param {Date} now The simulated time
     * @param {Object<String,Number>} counts By KPI key, `onTime` is a percentage
     */
    setValues(now, counts) {
        const me = this;

        me.clockDay.textContent  = DateHelper.format(now, 'ddd D MMM');
        me.clockTime.textContent = DateHelper.format(now, 'HH:mm');

        Object.keys(KpiBar.kpis).forEach(key => {
            const
                value = counts[key] ?? 0,
                cell  = me.values[key];

            cell.textContent = key === 'onTime' ? `${Math.round(value)}%` : value.toLocaleString('en-US');
            cell.parentElement.classList.toggle('lct-kpi-alert', (key === 'late' || key === 'conflicts') && value > 0);
        });
    }
}

KpiBar.initClass();
