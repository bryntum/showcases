import { DomHelper, StringHelper } from '@bryntum/core-enterprise';
import WaveChart from './WaveChart.js';

/**
 * The time axis rows of the Day view (hours, wave height, wind) and the vessel column's header naming them. The wave
 * height row is one cell over the day; the chart lives in an element of its own, moved into that cell whenever the
 * time axis is drawn, never recreated. A new forecast updates the wind values and the label in place, the time axis
 * itself does not change.
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
        // Not the header's own content: DomSync leaves it where it is mounted instead of releasing (hiding) it
        me.chartHost.retainElement = true;
        me.chart     = new WaveChart({
            element : me.chartHost,
            limits  : { ctv : state.limits.ctv.hs, swath : state.limits.swath.hs },
            day     : state.day
        });
    }

    /**
     * The header rows of the view preset. The day is in the page's header, not a row
     * @returns {Object[]}
     */
    get headers() {
        const me = this;

        return [
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

    // The wind of an hour, marked when it is over the helicopters' limit
    windHtml(hour) {
        const { wind, over } = this.windAt(hour);

        return `<span class="ow-wind${over ? ' ow-wind-over' : ''}" data-hour="${hour}">${wind ?? ''}</span>`;
    }

    windAt(hour) {
        const
            { forecast, limits, day } = this.state,
            wind                      = forecast.wind[hour - day.dayStart];

        // Strictly above, as DispatchState closes the window
        return { wind, over : wind > limits.heli.wind };
    }

    /**
     * The vessel column's header: the forecast shown and the names of the weather rows
     * @returns {String} HTML
     */
    get labelHtml() {
        return `
        <div class="ow-axis-label">
            <span class="ow-axis-row ow-axis-row-head">${this.forecastLabel}</span>
            <span class="ow-axis-row ow-axis-row-sea"><span>Wave height<small>Hs, metres</small></span></span>
            <span class="ow-axis-row ow-axis-row-wind"><span>Wind<small>m/s at hub</small></span></span>
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
     * Puts the chart in the wave height cell, and again whenever the Scheduler draws its time axis anew (another view
     * preset or time span), which makes a new cell. The header's own redraws (scroll, resize) keep the cell, and the
     * `retainElement` chart stays in it
     * @param {Scheduler.view.Scheduler} scheduler
     */
    attach(scheduler) {
        const me = this;

        if (me.scheduler !== scheduler) {
            me.scheduler = scheduler;
            me.detach    = scheduler.ion({
                presetChange   : 'mount',
                timeAxisChange : 'mount',
                thisObj        : me
            });
        }

        me.mount();
    }

    mount() {
        const
            me   = this,
            cell = me.scheduler?.element.querySelector('.ow-sea-today');

        // Moved, and drawn again, only into a new cell
        if (cell && (me.chartHost.parentElement !== cell)) {
            cell.append(me.chartHost);
            me.chart.redraw();
        }
    }

    /**
     * Shows the state's forecast: the chart, the wind values and the label, updated in place
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
            label.innerHTML = me.forecastLabel;
        }

        return me.chart.show({
            hs     : state.forecast.hs,
            closes : state.windows.ctv,
            was    : state.previousWindows?.ctv
        });
    }

    destroy() {
        this.detach?.();
        this.chart.destroy();
    }
}
