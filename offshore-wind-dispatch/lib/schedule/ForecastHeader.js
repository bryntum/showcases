import { DomHelper, StringHelper } from '@bryntum/core-enterprise';
import WaveChart from './WaveChart.js';
import { icon } from '../util/Icons.js';
import { dayAxis, toDate } from '../util/Time.js';

/**
 * The weather in the time axis. The Scheduler's header has four rows, defined by its view preset:
 *
 * 1. The day, "Nov 9 · Today"
 * 2. The hours, the ticks of the schedule
 * 3. The wave height, one cell over the whole day holding the AG Charts chart (WaveChart)
 * 4. The wind at hub height per hour, from 20 m/s in the helicopters' purple
 *
 * The vessel column's header beside them names the rows and the forecast they show. A header row is rendered by its
 * `renderer` whenever the time axis is drawn. The chart lives in one element of its own, moved into the wave height
 * cell each time that cell is drawn, so it is not recreated. A new forecast updates the wind values and the label in
 * place, the time axis itself does not change.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/preset/ViewPreset#config-headers
 * https://bryntum.com/products/scheduler/docs/api/Grid/column/Column#config-headerRenderer
 */
export default class ForecastHeader {
    /**
     * @param {DispatchState} state
     */
    constructor(state) {
        const me = this;

        me.state     = state;
        me.chartHost = DomHelper.createElement({ class : 'ow-wave-chart' });
        // Not the header's own content: DomSync keeps it where it is mounted instead of releasing (hiding) it
        me.chartHost.retainElement = true;
        me.chart     = new WaveChart({
            element : me.chartHost,
            limits  : { ctv : state.limits.ctv.hs, swath : state.limits.swath.hs },
            day     : state.day
        });
    }

    /**
     * The header rows of the view preset
     * @returns {Object[]}
     */
    get headers() {
        const me = this;

        return [
            {
                unit     : 'day',
                align    : 'start',
                renderer : (startDate, endDate, config) => {
                    config.headerCellCls = 'ow-day-cell';

                    return `<span class="ow-day">${dayAxis}<em>Today</em></span>`;
                }
            },
            { unit : 'hour', dateFormat : 'HH:mm', align : 'start', headerCellCls : 'ow-hour-cell' },
            {
                unit     : 'day',
                renderer : (startDate, endDate, config) => {
                    config.headerCellCls = 'ow-sea-cell ow-sea-today';

                    return '';
                }
            },
            {
                unit     : 'hour',
                align    : 'center',
                renderer : (startDate, endDate, config) => {
                    config.headerCellCls = 'ow-wind-cell';

                    return me.windHtml(startDate.getHours());
                }
            }
        ];
    }

    /**
     * The header rows of the week view, one column per day: the month, the days, then the wave chart and the peak wind
     * over today's column, the one day the forecast covers
     * @returns {Object[]}
     */
    get weekHeaders() {
        const
            me      = this,
            isToday = date => date.getTime() === toDate(0).getTime(),
            format  = (date, options) => date.toLocaleDateString('en-US', options);

        return [
            {
                unit     : 'month',
                align    : 'start',
                renderer : (startDate, endDate, config) => {
                    config.headerCellCls = 'ow-day-cell';

                    return `<span class="ow-day">${format(startDate, { month : 'long', year : 'numeric' })}</span>`;
                }
            },
            {
                unit     : 'day',
                align    : 'start',
                renderer : (startDate, endDate, config) => {
                    config.headerCellCls = 'ow-hour-cell';

                    return format(startDate, { weekday : 'short', day : 'numeric' });
                }
            },
            {
                unit     : 'day',
                renderer : (startDate, endDate, config) => {
                    config.headerCellCls = isToday(startDate) ? 'ow-sea-cell ow-sea-today' : 'ow-sea-cell';

                    return '';
                }
            },
            {
                unit     : 'day',
                align    : 'center',
                renderer : (startDate, endDate, config) => {
                    config.headerCellCls = 'ow-wind-cell';

                    return isToday(startDate) ? me.peakHtml() : '';
                }
            }
        ];
    }

    // The strongest wind of the day, the week view's one value for a day
    peakHtml() {
        const
            { forecast, limits } = this.state,
            peak                 = Math.max(...forecast.wind);

        return `<span class="ow-wind${peak > limits.heli.wind ? ' ow-wind-over' : ''}" data-peak>max ${peak}</span>`;
    }

    // The wind of an hour, marked when it is over the helicopters' limit
    windHtml(hour) {
        const { wind, over } = this.windAt(hour);

        return `<span class="ow-wind${over ? ' ow-wind-over' : ''}" data-hour="${hour}">${wind ?? ''}</span>`;
    }

    windAt(hour) {
        const
            { forecast, limits, day } = this.state,
            wind                      = forecast.wind[hour - day.dayStart];

        // Above the limit, as Weather.js closes the window
        return { wind, over : wind > limits.heli.wind };
    }

    /**
     * The vessel column's header: the forecast shown, and the names of the weather rows
     * @returns {String} HTML
     */
    get labelHtml() {
        return `
        <div class="ow-axis-label">
            <span class="ow-axis-row ow-axis-row-head">${this.forecastLabel}</span>
            <span class="ow-axis-row ow-axis-row-sea">${icon('waves', 'ow-axis-icon')}<span>Wave height<small>Hs, metres</small></span></span>
            <span class="ow-axis-row ow-axis-row-wind">${icon('wind', 'ow-axis-icon')}<span>Wind<small>m/s at hub</small></span></span>
        </div>`;
    }

    // "Forecast 06:00", the newer one flagged
    get forecastLabel() {
        const { forecast, isUpdated } = this.state;

        return isUpdated ?
            StringHelper.xss`<span class="ow-axis-forecast ow-chip-new">Forecast ${forecast.issued}</span>` :
            StringHelper.xss`<span class="ow-axis-forecast">Forecast ${forecast.issued}</span>`;
    }

    /**
     * Keeps the chart in the wave height cell of a Scheduler's header, whenever the header is drawn
     * @param {Scheduler.view.Scheduler} scheduler
     */
    attach(scheduler) {
        const
            me     = this,
            header = scheduler.element.querySelector('.b-grid-header-container') ?? scheduler.element;

        me.scheduler = scheduler;
        me.observer?.disconnect();
        me.observer = new MutationObserver(() => me.mount());
        me.observer.observe(header, {
            childList       : true,
            subtree         : true,
            attributes      : true,
            attributeFilter : ['style']
        });
        me.mount();
    }

    mount() {
        const
            me   = this,
            cell = me.scheduler?.element.querySelector('.ow-sea-today');

        // Drawn again when moved or empty only (the chart's own changes also reach this observer)
        if (cell && (me.chartHost.parentElement !== cell)) {
            cell.append(me.chartHost);
            me.chart.redraw();
        }

        me.coverHours();
    }

    // The hour label the now pill covers is hidden while it does
    coverHours() {
        const
            root = this.scheduler?.element,
            pill = root?.querySelector('.b-grid-header .ow-now label');

        root?.querySelectorAll('.ow-hour-cell').forEach(cell => {
            const
                text = cell.querySelector('.b-sch-header-text') ?? cell,
                range = document.createRange();

            range.selectNodeContents(text);

            const
                a       = range.getBoundingClientRect(),
                b       = pill?.getBoundingClientRect(),
                covered = Boolean(b?.width) && a.right > b.left - 2 && a.left < b.right + 2;

            cell.classList.toggle('ow-covered', covered);
        });
    }

    /**
     * Shows the state's forecast: the chart, the wind values and the label
     * @returns {Promise} Resolves once the chart is drawn
     */
    refresh() {
        const
            me                  = this,
            { state, scheduler } = me;

        scheduler?.element.querySelectorAll('.ow-wind[data-hour]').forEach(element => {
            const { wind, over } = me.windAt(Number(element.dataset.hour));

            element.textContent = wind ?? '';
            element.classList.toggle('ow-wind-over', over);
        });

        const peak = scheduler?.element.querySelector('.ow-wind[data-peak]');

        if (peak) {
            peak.outerHTML = me.peakHtml();
        }

        const label = scheduler?.element.querySelector('.ow-axis-row-head');

        if (label) {
            label.innerHTML = me.forecastLabel;
        }

        return me.chart.show({
            hs     : state.forecast.hs,
            closes : state.windows.ctv,
            was    : state.previousWindows?.ctv
        });
    }

    destroy() {
        this.observer?.disconnect();
        this.chart.destroy();
    }
}
