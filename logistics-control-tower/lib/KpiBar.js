import { DateHelper, DomHelper, Widget } from '@bryntum/core-enterprise';
import { hourMs } from './util/Time.js';

/**
 * The control tower's header: the date, the site and the simulated clock, then the live KPI counters, each a small
 * label above its value. On time shows its trend against an hour ago, Late and Conflicts are tinted while there are
 * any. Each value has a fixed width and tabular figures (toolbar.css), so nothing shifts while the numbers change.
 * Built once, then only the text of the values changes.
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

    // The counters flagged red while above zero
    static alerts = new Set(['late', 'conflicts']);

    static configurable = {
        /**
         * The site's name, shown after the date
         * @config {String}
         */
        site : null,

        /**
         * The simulated time at the start, shown before the first counters, so the clock does not pop in and push
         * them along as the grid loads
         * @config {Date|String}
         */
        now : null,

        cls : 'lct-kpis'
    };

    construct(config) {
        super.construct(config);

        const
            me   = this,
            make = (className, parent, text = '') => DomHelper.createElement({ className, parent, text });

        me.clock     = make('lct-clock', me.element);
        me.clockDay  = make('lct-clock-day', me.clock);
        me.clockDate = make('lct-clock-date', me.clockDay);
        me.clockTime = make('lct-clock-time', me.clock);

        if (me.site) {
            make('lct-clock-site', me.clockDay, ` · ${me.site}`);
        }

        me.values  = {};
        // On time percentages by simulated time, the last hour of them, for the trend
        me.history = [];

        Object.entries(KpiBar.kpis).forEach(([key, label]) => {
            const kpi = make(`lct-kpi lct-kpi-${key}`, me.element);

            make('lct-kpi-label', kpi, label);
            me.values[key] = make('lct-kpi-value', kpi, '–');
        });

        me.trend = make('lct-kpi-trend', me.values.onTime.parentElement);

        if (me.now) {
            me.showClock(new Date(me.now));
        }
    }

    /**
     * Shows the date and the simulated time
     * @param {Date} now The simulated time
     */
    showClock(now) {
        this.clockDate.textContent = DateHelper.format(now, 'ddd D MMM');
        this.clockTime.textContent = DateHelper.format(now, 'HH:mm');
    }

    /**
     * Shows the clock and the counters
     * @param {Date} now The simulated time
     * @param {Object<String,Number>} counts By KPI key, `onTime` is a percentage
     */
    setValues(now, counts) {
        const me = this;

        me.showClock(now);

        Object.keys(KpiBar.kpis).forEach(key => {
            const
                value = counts[key] ?? 0,
                cell  = me.values[key];

            cell.textContent = key === 'onTime' ? `${Math.round(value)}%` : value.toLocaleString('en-US');
            cell.parentElement.classList.toggle('lct-kpi-alert', KpiBar.alerts.has(key) && value > 0);
        });

        me.showTrend(now, Math.round(counts.onTime ?? 0));
    }

    // The change in on time points since an hour ago, or since the oldest value while there is no hour of history yet
    showTrend(now, onTime) {
        const
            { history, trend } = this,
            time               = now.getTime();

        history.push({ time, onTime });

        // Keeps the newest value at least an hour old as the base, drops the older ones
        while (history.length > 2 && history[1].time <= time - hourMs) {
            history.shift();
        }

        const
            points = onTime - history[0].onTime,
            unit   = Math.abs(points) === 1 ? 'pt' : 'pts';

        trend.textContent = points > 0 ? `▲ ${points} ${unit}` : points < 0 ? `▼ ${-points} ${unit}` : '';
        trend.className   = `lct-kpi-trend lct-trend-${points > 0 ? 'up' : 'down'}`;
        trend.title       = points ? 'Since an hour ago' : '';
    }
}

KpiBar.initClass();
