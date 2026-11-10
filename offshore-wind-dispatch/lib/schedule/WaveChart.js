import {
    AgCharts, AllCommunityModule, LicenseManager, ModuleRegistry, RangeAreaSeriesModule
} from 'ag-charts-enterprise';
import { hhmm } from '../util/Time.js';

// AG Charts Enterprise is licensed separately. The key is read at build time from `VITE_AG_LICENSE_KEY` (a gitignored
// `.env.local` at the repository root); without it the chart shows a watermark and logs a licence notice
const licenseKey = import.meta.env.VITE_AG_LICENSE_KEY;

if (licenseKey) {
    LicenseManager.setLicenseKey(licenseKey);
}

ModuleRegistry.registerModules([AllCommunityModule, RangeAreaSeriesModule]);

const
    fontFamily = 'Montserrat Variable, Helvetica Neue, Arial, sans-serif',
    off        = { enabled : false },
    // An axis that only places the series: the schedule's own header has the hours
    bare       = { type : 'number', nice : false, thickness : 0, label : off, line : off, tick : off },
    label      = (placement, color, extra) => ({ placement, color, fontSize : 10, fontWeight : 500, ...extra }),
    // Split at `at`, the window's close: the colours of work before it, of risk after it
    split      = (at, [stroke, fill], [roughStroke, roughFill]) => ({
        key      : 'x',
        segments : [{ stop : at, stroke, fill }, { start : at, stroke : roughStroke, fill : roughFill }]
    });

let pixel;

// The resolved colour of a CSS custom property, as `rgba()`. The browser computes `light-dark()` and `color-mix()` to
// `color(srgb …)`, which AG Charts does not read, so the colour is painted on a one pixel canvas and read back
function cssColor(element, name) {
    const probe = document.createElement('span');

    probe.style.color = `var(${name})`;
    element.append(probe);

    const { color } = getComputedStyle(probe);

    probe.remove();
    pixel ??= Object.assign(document.createElement('canvas'), { width : 1, height : 1 })
        .getContext('2d', { willReadFrequently : true });
    pixel.clearRect(0, 0, 1, 1);
    pixel.fillStyle = color;
    pixel.fillRect(0, 0, 1, 1);

    const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data;

    return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

/**
 * The wave height row of the time axis, an AG Charts Enterprise area chart. Not a widget: it draws into the element it
 * is given, which ForecastHeader moves into the header cell. Its x axis is the schedule's day in hours with no
 * padding, so each hour of the chart sits over the same hour of the trips. The wave is one area series in two
 * segments, the forecast's spread a range area under it, the limits are axis cross lines and the window's close a line
 * series. Colours are read from CSS custom properties, so the chart is drawn again when the page switches between
 * light and dark.
 *
 * Learn more:
 * https://www.ag-grid.com/charts/javascript/area-series/
 * https://www.ag-grid.com/charts/javascript/series-segmentation/
 * https://www.ag-grid.com/charts/javascript/range-area-series/
 */
export default class WaveChart {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.element The chart's container
     * @param {Object} options.limits `{ ctv, swath }`, metres
     * @param {Object} options.day `{ dayStart, dayEnd }`, hours
     */
    constructor({ element, limits, day }) {
        const me = this;

        Object.assign(me, { element, limits, day, forecast : null });

        // Redrawn on a theme switch: the shell's switch sets `data-theme` on the root, or the system setting changes
        me.observer = new MutationObserver(() => me.redraw());
        me.observer.observe(document.documentElement, { attributes : true, attributeFilter : ['data-theme'] });
        me.media = matchMedia('(prefers-color-scheme: dark)');
        me.media.onchange = () => me.redraw();
        // AG Charts sizes itself to its container. A chart created while the container had no size (the header being
        // drawn, a hidden phone tab) stays empty, so it is drawn again once the container has a size
        me.sized = new ResizeObserver(([entry]) => entry.contentRect.width && entry.contentRect.height && me.redraw());
        me.sized.observe(element);
    }

    /**
     * @param {Object} forecast
     * @param {Number[]} forecast.hs Hourly wave height from `dayStart`
     * @param {Number[]} [forecast.low] The low end of its likely range, hour for hour
     * @param {Number[]} [forecast.high] The high end
     * @param {Number} forecast.closes When the CTV window closes, minutes since midnight
     * @param {Number} [forecast.was] When it closed in the previous forecast
     * @returns {Promise} Resolves once drawn
     */
    show(forecast) {
        this.forecast = forecast;

        return this.redraw();
    }

    redraw() {
        const me = this;

        // Not in the page or not sized yet: the ResizeObserver draws it once it is
        if (!me.forecast || !me.element.isConnected || !me.element.clientWidth || !me.element.clientHeight) {
            return Promise.resolve();
        }

        if (me.chart) {
            me.chart.update(me.options());
        }
        else {
            me.chart = AgCharts.create(me.options());
        }

        return me.chart.waitForUpdate();
    }

    destroy() {
        this.observer.disconnect();
        this.sized.disconnect();
        this.media.onchange = null;
        this.chart?.destroy();
    }

    // A point mid hour, the first and the last value held to the edges so the area spans the whole day
    data() {
        const
            { hs, low, high }    = this.forecast,
            { dayStart, dayEnd } = this.day,
            count                = dayEnd - dayStart,
            point                = (t, i, end) => ({ t, hs : hs[i], low : low?.[i], high : high?.[i], end });

        return [
            point(dayStart, 0),
            ...hs.slice(0, count).map((value, i) => point(dayStart + i + 0.5, i, !i || i === count - 1)),
            point(dayEnd, count - 1)
        ];
    }

    // The colours of the chart, read from the page's CSS custom properties each time it is drawn
    colors() {
        return Object.fromEntries([
            ['muted', '--b-neutral-40'], ['work', '--ow-c-work'], ['fill', '--ow-c-chart-fill'],
            ['rough', '--ow-c-risk-line'], ['roughInk', '--ow-c-risk-ink'], ['roughFill', '--ow-c-chart-risk'],
            ['surface', '--ow-surface'], ['grid', '--ow-tick']
        ].map(([key, name]) => [key, cssColor(this.element, name)]));
    }

    options() {
        const
            me     = this,
            c      = me.colors(),
            at     = me.forecast.closes / 60,
            range  = me.range(),
            series = { xKey : 't', showInLegend : false, highlight : off, tooltip : { renderer : me.tooltip.bind(me) } };

        return {
            container  : me.element,
            data       : me.data(),
            theme      : { baseTheme : 'ag-default', params : { fontFamily } },
            background : { visible : false },
            padding    : 0,
            seriesArea : { padding : 0 },
            animation  : off,
            legend     : off,
            // One tooltip, from the band or the wave, whichever is nearer: the same hour either way
            tooltip    : { mode : 'single' },
            series     : [
                // The forecast's likely range, a faint band without an outline under the wave
                me.forecast.low && {
                    ...series,
                    type         : 'range-area',
                    yLowKey      : 'low',
                    yHighKey     : 'high',
                    fillOpacity  : 0.14,
                    strokeWidth  : 0,
                    segmentation : split(at, [c.work, c.work], [c.rough, c.rough])
                },
                me.wave(at, c, series),
                me.closing(at, range, c, series)
            ].filter(Boolean),
            axes : { x : me.timeAxis(c), y : me.heightAxis(range, c) }
        };
    }

    // The wave, blue for work until the CTV window closes, orange for risk after; the close is the dispatch state's, so
    // chart and no-go ranges agree. The first and last hour are marked and labelled, on a chip no limit runs through
    wave(at, c, series) {
        return {
            ...series,
            type          : 'area',
            yKey          : 'hs',
            interpolation : { type : 'linear' },
            fillOpacity   : 1,
            strokeWidth   : 2,
            segmentation  : split(at, [c.work, c.fill], [c.rough, c.roughFill]),
            marker        : {
                size        : 8,
                strokeWidth : 0,
                itemStyler  : ({ datum }) => (datum.end ? { fill : datum.t < at ? c.work : c.rough } : { size : 0 })
            },
            // Away from the limits' names: under the line when they are over it
            label : label(this.forecast.hs[0] > this.limits.ctv ? ['top', 'bottom'] : ['bottom', 'top'], c.muted, {
                spacing    : 0,
                fill       : c.surface,
                padding    : { top : 0, bottom : 0, left : 2, right : 2 },
                formatter  : ({ datum }) => (datum.end ? datum.hs.toFixed(1) : ''),
                itemStyler : ({ datum }) => ({ color : datum.t < at ? c.muted : c.roughInk })
            })
        };
    }

    // The day in hours. After a new forecast, the close before is a dashed line, named at its foot on the side away
    // from the close
    timeAxis({ muted, grid }) {
        const
            { dayStart, dayEnd } = this.day,
            { closes, was }      = this.forecast;

        return {
            ...bare,
            position   : 'bottom',
            min        : dayStart,
            max        : dayEnd,
            interval   : { step : 1 },
            gridLine   : { enabled : true, style : [{ stroke : grid, lineDash : [] }] },
            crossLines : was == null ? [] : [{
                type     : 'line',
                value    : was / 60,
                stroke   : muted,
                lineDash : [2, 3],
                label    : label(closes > was ? 'left-bottom' : 'right-bottom', muted, {
                    text : `was ${hhmm(was)}`, padding : 4
                })
            }]
        };
    }

    // The forecast and both limits. A limit is named at its left end, over its line, or under it when the wave starts
    // the day above it, on a chip of the surface so the other limit's dashes don't run through it
    heightAxis([min, max], { muted, surface }) {
        const limit = (name, value) => ({
            type          : 'line',
            value,
            stroke        : muted,
            strokeOpacity : 0.45,
            lineDash      : [3, 3],
            label         : label(this.forecast.hs[0] > value ? 'bottom-left' : 'top-left', muted, {
                text     : `${name} limit ${value.toFixed(1)}`,
                fontSize : 9,
                fill     : surface,
                padding  : { top : 1, bottom : 1, left : 3, right : 3 }
            })
        });

        return {
            ...bare,
            position   : 'left',
            min,
            max,
            gridLine   : off,
            crossLines : [limit('CTV', this.limits.ctv), limit('SWATH', this.limits.swath)]
        };
    }

    // The forecast and both limits, with room over and under them for the labels, a little more under
    range() {
        const
            { ctv, swath } = this.limits,
            { hs }         = this.forecast,
            [low, high]    = [Math.min(ctv, ...hs), Math.max(swath, ...hs)],
            room           = (high - low) / 2;

        return [low - room * 1.4, high + room];
    }

    // The window's close, a line series over the wave, named at its top, ringed where it meets the wave line (half
    // way between the hours either side) by its own marker, which AG Charts draws over the line: the ring stays whole
    closing(at, [min, max], { rough, roughInk, surface }, series) {
        const
            { dayStart, dayEnd } = this.day,
            { hs }               = this.forecast;

        return at > dayStart && at < dayEnd && {
            ...series,
            type : 'line',
            data : [
                { t : at, y : min },
                { t : at, y : (hs[at - dayStart - 1] + hs[at - dayStart]) / 2, ring : true },
                { t : at, y : max, top : true }
            ],
            yKey        : 'y',
            stroke      : rough,
            strokeWidth : 1.5,
            marker      : {
                size        : 8,
                strokeWidth : 2,
                fill        : surface,
                stroke      : rough,
                itemStyler  : ({ datum }) => (datum.ring ? {} : { size : 0 })
            },
            label : label('bottom-right', roughInk, {
                fontWeight : 600,
                formatter  : ({ datum }) => (datum.top ? `CTV closes ${hhmm(at * 60)}` : '')
            }),
            tooltip : off
        };
    }

    // The hour under the pointer: who may transfer, its Hs and the forecast's likely range. Hs is the mean of the
    // highest third of the waves; the largest in a sea state reach about 1.9 × Hs
    tooltip({ datum : { t, hs, low, high } }) {
        const
            { ctv, swath } = this.limits,
            hour           = Math.min(Math.floor(t), this.day.dayEnd - 1);

        return {
            heading : `${hhmm(hour * 60)} – ${hhmm((hour + 1) * 60)}`,
            title   : hs > swath ? 'No crew transfer' : hs > ctv ? 'SWATH only' : 'CTV and SWATH can transfer',
            data    : [
                { label : 'Hs', value : `${hs.toFixed(1)} m` },
                low != null && { label : 'Likely', value : `${low.toFixed(1)} – ${high.toFixed(1)} m` },
                { label : 'Largest waves', value : `about ${(hs * 1.9).toFixed(1)} m` }
            ].filter(Boolean)
        };
    }
}
