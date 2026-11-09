import { DomHelper, StringHelper } from '@bryntum/core-enterprise';
import WaveChart from './WaveChart.js';
import { icon } from '../util/Icons.js';
import { dayLong } from '../util/Time.js';

/**
 * The weather in the time axis. The Scheduler's header has four rows, defined by its view preset:
 *
 * 1. The day, "Sunday 8 November 2026 · Today"
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

                    return `<span class="ow-day">${dayLong}<em>Today</em></span>`;
                }
            },
            { unit : 'hour', dateFormat : 'HH:mm', align : 'start', headerCellCls : 'ow-hour-cell' },
            {
                unit     : 'day',
                renderer : (startDate, endDate, config) => {
                    config.headerCellCls = 'ow-sea-cell';

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

    // The wind of an hour, marked when it is at or over the helicopters' limit
    windHtml(hour) {
        const { wind, over } = this.windAt(hour);

        return `<span class="ow-wind${over ? ' ow-wind-over' : ''}" data-hour="${hour}">${wind ?? ''}</span>`;
    }

    windAt(hour) {
        const
            { forecast, limits, day } = this.state,
            wind                      = forecast.wind[hour - day.dayStart];

        // Marked from the limit itself, so the hour at the limit stands out before the one that closes the window
        // (Weather.js closes it above the limit)
        return { wind, over : wind >= limits.heli.wind };
    }

    /**
     * The vessel column's header: the forecast shown, and the names of the weather rows
     * @returns {String} HTML
     */
    get labelHtml() {
        return `
        <div class="ow-axis-label">
            <span class="ow-axis-row ow-axis-row-head">${icon('broadcast')}${this.forecastLabel}</span>
            <span class="ow-axis-row ow-axis-row-sea">${icon('waves')}<span>Wave height<small>Hs, metres</small></span></span>
            <span class="ow-axis-row ow-axis-row-wind">${icon('wind')}<span>Wind<small>m/s at hub</small></span></span>
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
        me.observer.observe(header, { childList : true, subtree : true });
        me.mount();
    }

    mount() {
        const
            me   = this,
            cell = me.scheduler?.element.querySelector('.ow-sea-cell');

        if (cell && me.chartHost.parentElement !== cell) {
            cell.append(me.chartHost);
            me.chart.redraw();
        }
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

        const label = scheduler?.element.querySelector('.ow-axis-row-head');

        if (label) {
            label.innerHTML = `${icon('broadcast')}${me.forecastLabel}`;
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
