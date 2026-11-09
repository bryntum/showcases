import { AgCharts, AllCommunityModule, ModuleRegistry } from 'ag-charts-community';
import { hhmm } from '../util/Time.js';

ModuleRegistry.registerModules([AllCommunityModule]);

/**
 * The wave height row of the time axis, an AG Charts Community area chart: the hourly significant wave height against
 * the CTV and SWATH limits, and the time the CTV window closes. Its x axis is the schedule's own day with no padding,
 * so each hour of the chart sits over the same hour of the trips. Points are coloured by limit, hovering one tells
 * which vessels can still transfer.
 *
 * Colours are read from the showcase's CSS custom properties, so the chart takes the Svalbard palette, and it is drawn
 * again when the page switches between light and dark.
 *
 * Learn more:
 * https://www.ag-grid.com/charts/javascript/area-series/
 * https://www.ag-grid.com/charts/javascript/axes-cross-lines/
 */

const fontFamily = 'Montserrat Variable, Helvetica Neue, Arial, sans-serif';

/**
 * The resolved colour of a CSS custom property, after `light-dark()` and `color-mix()`
 * @param {HTMLElement} element Where the property is read
 * @param {String} name
 * @returns {String}
 */
function cssColor(element, name) {
    const probe = document.createElement('span');

    probe.style.color = `var(${name})`;
    element.append(probe);

    const { color } = getComputedStyle(probe);

    probe.remove();

    return toRgba(color);
}

let pixel;

/**
 * A colour as `rgba()`. The browser computes `color-mix()` to `color(srgb …)`, which AG Charts does not read, so the
 * colour is painted on a one pixel canvas and read back
 * @param {String} color Any CSS colour
 * @returns {String}
 */
function toRgba(color) {
    pixel ??= Object.assign(document.createElement('canvas'), { width : 1, height : 1 })
        .getContext('2d', { willReadFrequently : true });

    pixel.clearRect(0, 0, 1, 1);
    pixel.fillStyle = color;
    pixel.fillRect(0, 0, 1, 1);

    const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data;

    return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

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

        // The shell's light / dark switch sets `data-theme` and `color-scheme` on the root, the system setting can
        // change too
        me.observer = new MutationObserver(() => me.redraw());
        me.observer.observe(document.documentElement, { attributes : true, attributeFilter : ['data-theme', 'style'] });
        me.media = matchMedia('(prefers-color-scheme: dark)');
        me.onMedia = () => me.redraw();
        me.media.addEventListener('change', me.onMedia);
        // AG Charts sizes itself to its container. A chart created while the header cell had no size yet (being
        // drawn, a hidden phone tab) stays empty, so it is drawn again once the container has a size
        me.sized = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;

            if (width && height) {
                me.redraw();
            }
        });
        me.sized.observe(element);
    }

    /**
     * Draws a forecast
     * @param {Object} forecast
     * @param {Number[]} forecast.hs Hourly wave height from `dayStart`
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

        // Not in the page or not sized yet: drawn by the ResizeObserver once it is
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
        this.media.removeEventListener('change', this.onMedia);
        this.chart?.destroy();
    }

    // The data: one point mid hour, the first and the last value held to the edges so the area spans the whole day
    data() {
        const
            { hs }                 = this.forecast,
            { dayStart, dayEnd }   = this.day,
            hours                  = hs.slice(0, dayEnd - dayStart);

        return [
            { t : dayStart, hs : hours[0], edge : true },
            ...hours.map((value, i) => ({ t : dayStart + i + 0.5, hs : value })),
            { t : dayEnd, hs : hours.at(-1), edge : true }
        ];
    }

    options() {
        const
            me      = this,
            color   = name => cssColor(me.element, name),
            colors  = { ok : color('--ow-sea-ok'), amber : color('--ow-sea-amb'), red : color('--ow-sea-red') },
            { ctv, swath } = me.limits,
            tone    = hs => hs > swath ? colors.red : hs > ctv ? colors.amber : colors.ok;

        return {
            container  : me.element,
            data       : me.data(),
            theme      : { baseTheme : 'ag-default' },
            background : { visible : false },
            padding    : { top : 0, right : 0, bottom : 0, left : 0 },
            seriesArea : { padding : { top : 0, right : 0, bottom : 0, left : 0 } },
            animation  : { enabled : false },
            legend     : { enabled : false },
            series     : [me.series(colors, tone), me.valueLabels(tone)],
            axes       : {
                x : me.timeAxis(colors, color('--ow-ink-sub'), color('--ow-grid')),
                y : me.heightAxis(colors)
            }
        };
    }

    series(colors, tone) {
        const { ctv, swath } = this.limits;

        return {
            type          : 'area',
            xKey          : 't',
            yKey          : 'hs',
            yName         : 'Wave height',
            interpolation : { type : 'smooth' },
            fill          : colors.ok,
            fillOpacity   : 0.2,
            stroke        : colors.ok,
            strokeWidth   : 2,
            marker        : {
                enabled     : true,
                size        : 6,
                strokeWidth : 1.5,
                itemStyler  : ({ datum }) => datum.edge ?
                    { size : 0 } :
                    { fill : tone(datum.hs), stroke : tone(datum.hs) }
            },
            // The values are labelled by valueLabels(), under their points
            label   : { enabled : false },
            tooltip : {
                renderer : ({ datum }) => ({
                    heading : `${hhmm(Math.floor(datum.t) * 60)} – ${hhmm((Math.floor(datum.t) + 1) * 60)}`,
                    title   : 'Significant wave height',
                    data    : [
                        { label : 'Hs', value : `${datum.hs.toFixed(1)} m` },
                        {
                            label : 'Crew transfer',
                            value : datum.hs > swath ? 'No vessel' : datum.hs > ctv ? 'SWATH only' : 'CTV and SWATH'
                        }
                    ]
                })
            }
        };
    }

    // The value of each hour under its point: an area series cannot place its labels, a line series can. Under the
    // points, the labels keep clear of the CTV and SWATH labels above their lines and of the window's label at the foot
    valueLabels(tone) {
        return {
            type         : 'line',
            xKey         : 't',
            yKey         : 'hs',
            yName        : 'Wave height',
            strokeWidth  : 0,
            marker       : { enabled : false },
            showInLegend : false,
            tooltip      : { enabled : false },
            label        : {
                enabled    : true,
                placement  : 'bottom',
                fontFamily,
                fontSize   : 10,
                fontWeight : 600,
                formatter  : ({ datum }) => datum.edge ? '' : datum.hs.toFixed(1),
                itemStyler : ({ datum }) => ({ color : tone(datum.hs) })
            }
        };
    }

    // The day of the schedule, the hour lines, and the window's close as a cross line (with the old one dashed)
    timeAxis(colors, ink, grid) {
        const
            { closes, was }      = this.forecast,
            { dayStart, dayEnd } = this.day,
            tone                 = was == null ? colors.amber : colors.red,
            label                = { fontFamily, fontSize : 9.5 },
            // At the top of the chart, clear of the value labels under the points. The earlier of the two lines has its
            // label on its left, the later one on its right, so they part
            side                 = later => later ? 'right-top' : 'left-top';

        return {
            type       : 'number',
            position   : 'bottom',
            min        : dayStart,
            max        : dayEnd,
            nice       : false,
            thickness  : 0,
            interval   : { step : 1 },
            label      : { enabled : false },
            line       : { enabled : false },
            tick       : { enabled : false },
            gridLine   : { enabled : true, style : [{ stroke : grid, lineDash : [] }] },
            crossLines : [
                was == null ? null : {
                    type        : 'line',
                    value       : was / 60,
                    stroke      : ink,
                    lineDash    : [2, 3],
                    strokeWidth : 1,
                    label       : { ...label, text : `was ${hhmm(was)}`, placement : side(was > closes), color : ink }
                },
                {
                    type        : 'line',
                    value       : closes / 60,
                    stroke      : tone,
                    strokeWidth : 1.5,
                    label       : {
                        ...label,
                        text       : `CTV window closes ${hhmm(closes)}`,
                        placement  : side(was != null && closes > was),
                        color      : tone,
                        fontWeight : 700
                    }
                }
            ].filter(Boolean)
        };
    }

    // Metres, with the CTV and SWATH limits as dashed lines and the heights above them tinted
    heightAxis(colors) {
        const
            { ctv, swath } = this.limits,
            // From calm water, so the area fills the row to its foot, with room under the calmest hour (0.9 m) for its
            // value label under its point, and above the roughest one for its point and label: no label is cut at the
            // chart's edges. The CTV and SWATH lines are far enough apart for a label above each
            bottom         = 0,
            top            = 2.9,
            // Above its line at the left. The value labels are under their points
            label          = (text, color) => ({
                text,
                color,
                placement  : 'top-left',
                padding    : 2,
                fontSize   : 9,
                fontWeight : 700,
                fontFamily
            });

        return {
            type       : 'number',
            position   : 'left',
            min        : bottom,
            max        : top,
            nice       : false,
            thickness  : 0,
            label      : { enabled : false },
            line       : { enabled : false },
            tick       : { enabled : false },
            gridLine   : { enabled : false },
            crossLines : [
                { type : 'range', range : [ctv, swath], fill : colors.amber, fillOpacity : 0.07, strokeWidth : 0 },
                { type : 'range', range : [swath, top], fill : colors.red, fillOpacity : 0.07, strokeWidth : 0 },
                {
                    type        : 'line',
                    value       : ctv,
                    stroke      : colors.amber,
                    lineDash    : [4, 3],
                    strokeWidth : 1,
                    label       : label(`CTV ${ctv.toFixed(1)}`, colors.amber)
                },
                {
                    type        : 'line',
                    value       : swath,
                    stroke      : colors.red,
                    lineDash    : [4, 3],
                    strokeWidth : 1,
                    label       : label(`SWATH ${swath.toFixed(1)}`, colors.red)
                }
            ]
        };
    }
}
