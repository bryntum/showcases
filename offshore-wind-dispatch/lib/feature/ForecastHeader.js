import { DomHelper, StringHelper } from '@bryntum/core-enterprise';
import { SchedulerFeature } from '@bryntum/scheduler-enterprise';
import WaveChart from '../schedule/WaveChart.js';

/**
 * The time axis rows of the Day view (hours, wave height, wind) and the vessel column's header naming them, for the
 * forecast of the Scheduler's `dispatch` state. The wave height row is one cell over the day; the chart lives in an
 * element of its own, moved into that cell whenever the time axis is drawn, never recreated. A new forecast updates the
 * wind values and the label in place, the time axis itself does not change.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/preset/ViewPreset#config-headers
 * https://bryntum.com/products/scheduler/docs/api/Grid/column/Column#config-headerRenderer
 */
export default class ForecastHeader extends SchedulerFeature {
    static $name = 'ForecastHeader';

    static type = 'forecastHeader';

    /**
     * The header rows of the view preset, which the Scheduler is configured with before its features exist: the
     * renderers ask for the feature when they run. The day is in the page's header, not a row
     * @param {Function} feature Returns this feature
     * @returns {Object[]}
     */
    static headers(feature) {
        return [
            { unit : 'hour', dateFormat : 'HH:mm', align : 'start', headerCellCls : 'ow-hour-cell' },
            {
                unit     : 'day',
                renderer : (startDate, endDate, config) => {
                    config.headerCellCls = 'ow-sea-cell ow-sea-today';
                    // The cell is in the page once the header is drawn
                    queueMicrotask(() => feature().mount());

                    return '';
                }
            },
            {
                unit     : 'hour',
                align    : 'center',
                renderer : (startDate, endDate, config) => {
                    config.headerCellCls = 'ow-wind-cell';

                    return feature().windHtml(startDate.getHours());
                }
            }
        ];
    }

    construct(config) {
        super.construct(config);

        this.chartHost = DomHelper.createElement({ class : 'ow-wave-chart' });
        // Not the header's own content: DomSync leaves it where it is mounted instead of releasing (hiding) it
        this.chartHost.retainElement = true;

        this.client.on({ paint : 'onClientPaint', thisObj : this });
    }

    doDestroy() {
        this._chart?.destroy();
        super.doDestroy();
    }

    // Made on first use: the features exist before the Scheduler's `dispatch` is set
    get chart() {
        const { limits, day } = this.state;

        return this._chart ??= new WaveChart({
            element : this.chartHost,
            limits  : { ctv : limits.ctv.hs, swath : limits.swath.hs },
            day
        });
    }

    get state() {
        return this.client.dispatch;
    }

    onClientPaint() {
        this.mount();
        this.refresh();
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
            StringHelper.xss`<span class="ow-axis-forecast ow-pill">Forecast ${forecast.issued}</span>` :
            StringHelper.xss`<span class="ow-axis-forecast">Forecast ${forecast.issued}</span>`;
    }

    /**
     * Puts the chart in the wave height cell, and again into the new cell whenever the Scheduler draws its time axis
     * anew (another view preset, time span or tick size). The header's own redraws (scroll, resize) keep the cell, and
     * the `retainElement` chart stays in it
     */
    mount() {
        const
            me   = this,
            cell = me.client.element?.querySelector('.ow-sea-today');

        // Moved, and drawn again, only into a new cell
        if (cell && me.chartHost.parentElement !== cell) {
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
            me                    = this,
            { state, client }     = me,
            { element }           = client;

        element?.querySelectorAll('.ow-wind[data-hour]').forEach(wind => {
            const { wind : value, over } = me.windAt(Number(wind.dataset.hour));

            wind.textContent = value ?? '';
            wind.classList.toggle('ow-wind-over', over);
        });

        const label = element?.querySelector('.ow-axis-row-head');

        if (label) {
            label.innerHTML = me.forecastLabel;
        }

        return me.chart.show({
            hs     : state.forecast.hs,
            low    : state.forecast.hsLow,
            high   : state.forecast.hsHigh,
            closes : state.windows.ctv,
            was    : state.previousWindows?.ctv
        });
    }
}

// Registers the feature, enabled by `features : { forecastHeader : true }`
ForecastHeader.initClass();
