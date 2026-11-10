import { AgCharts, AllCommunityModule, ModuleRegistry } from 'ag-charts-community';
import { hhmm } from '../util/Time.js';

ModuleRegistry.registerModules([AllCommunityModule]);

const
    fontFamily = 'Montserrat Variable, Helvetica Neue, Arial, sans-serif',
    none       = { top : 0, right : 0, bottom : 0, left : 0 },
    // Hovering a point only shows its tooltip: no dimming of the other series, no bigger marker
    highlight  = {
        highlightedSeries   : { opacity : 1 },
        unhighlightedSeries : { opacity : 1 },
        highlightedItem     : { strokeWidth : 2.5 },
        unhighlightedItem   : { opacity : 1 },
        bringToFront        : false
    },
    off        = { enabled : false },
    // An axis that only places the series: the schedule's own header has the hours
    bare       = { type : 'number', nice : false, thickness : 0, label : off, line : off, tick : off },
    label      = (text, placement, color, extra) => ({
        text, placement, color, fontSize : 10, fontWeight : 500, padding : 4, ...extra
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
 * The wave height row of the time axis, an AG Charts Community area chart. Not a widget: it draws into the element it
 * is given, which ForecastHeader moves into the header cell. Its x axis is the schedule's day in hours with no
 * padding, so each hour of the chart sits over the same hour of the trips. The limits and the window's close are axis
 * cross lines. Colours are read from CSS custom properties, so the chart is drawn again when the page switches between
 * light and dark.
 *
 * Learn more:
 * https://www.ag-grid.com/charts/javascript/area-series/
 * https://www.ag-grid.com/charts/javascript/axes-cross-lines/
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
        me.onMedia = () => me.redraw();
        me.media.addEventListener('change', me.onMedia);
        // AG Charts sizes itself to its container. A chart created while the container had no size (the header being
        // drawn, a hidden phone tab) stays empty, so it is drawn again once the container has a size
        me.sized = new ResizeObserver(([entry]) => entry.contentRect.width && entry.contentRect.height && me.redraw());
        me.sized.observe(element);
    }

    /**
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
        this.media.removeEventListener('change', this.onMedia);
        this.chart?.destroy();
    }

    // A point mid hour, the first and the last value held to the edges so the area spans the whole day. The line is
    // `calm` until the CTV window closes and `rough` after. The close is the dispatch state's (the start of the first
    // hour over the limit), not where the line crosses 1.5 m, so the chart and the no-go ranges agree; a point at the
    // close (`cross`), on the line between its neighbours, is in both halves so the line has no gap
    data() {
        const
            { hs, closes }       = this.forecast,
            { dayStart, dayEnd } = this.day,
            hours                = hs.slice(0, dayEnd - dayStart),
            split                = closes / 60,
            points               = [
                { t : dayStart, hs : hours[0], edge : true },
                ...hours.map((value, i) => ({ t : dayStart + i + 0.5, hs : value, first : !i, last : !hours[i + 1] })),
                { t : dayEnd, hs : hours.at(-1), edge : true }
            ],
            after                = points.findIndex(point => point.t >= split),
            [before, next]       = [points[after - 1], points[after]];

        if (split > dayStart && split < dayEnd && next.t !== split) {
            points.splice(after, 0, {
                t    : split,
                hs   : before.hs + (next.hs - before.hs) * (split - before.t) / (next.t - before.t),
                edge : true
            });
        }

        return points.map(point => ({
            ...point,
            calm  : point.t <= split ? point.hs : null,
            rough : point.t >= split ? point.hs : null,
            cross : point.t === split && split > dayStart && split < dayEnd
        }));
    }

    options() {
        const
            me     = this,
            color  = name => cssColor(me.element, name),
            colors = {
                muted    : color('--b-neutral-40'),
                rough    : color('--ow-c-risk-line'),
                roughInk : color('--ow-c-risk-ink'),
                surface  : color('--ow-surface'),
                grid     : color('--ow-tick')
            };

        return {
            container  : me.element,
            data       : me.data(),
            theme      : { baseTheme : 'ag-default', params : { fontFamily } },
            background : { visible : false },
            padding    : none,
            seriesArea : { padding : none },
            animation  : off,
            legend     : off,
            series     : [
                me.series('calm', color('--ow-c-work'), color('--ow-c-chart-fill'), colors.surface, colors.muted),
                me.series('rough', colors.rough, color('--ow-c-chart-risk'), colors.surface, colors.roughInk)
            ],
            axes : { x : me.timeAxis(colors), y : me.heightAxis(colors) }
        };
    }

    // The day in hours, with the window's close and, after a new forecast, the close before, dashed. Their labels
    // face away from each other, the close's at the top, the one before's at the foot
    timeAxis({ muted, rough, roughInk, grid }) {
        const
            { dayStart, dayEnd } = this.day,
            { closes, was }      = this.forecast,
            later                = was == null || closes > was;

        return {
            ...bare,
            position   : 'bottom',
            min        : dayStart,
            max        : dayEnd,
            interval   : { step : 1 },
            gridLine   : { enabled : true, style : [{ stroke : grid, lineDash : [] }] },
            crossLines : [
                was != null && {
                    id       : 'was',
                    type     : 'line',
                    value    : was / 60,
                    stroke   : muted,
                    lineDash : [2, 3],
                    label    : label(`was ${hhmm(was)}`, later ? 'left-bottom' : 'right-bottom', muted)
                },
                closes > dayStart * 60 && closes < dayEnd * 60 && {
                    id          : 'closes',
                    type        : 'line',
                    value       : closes / 60,
                    stroke      : rough,
                    strokeWidth : 1.5,
                    label       : label(`${this.limits.ctv.toFixed(1)} m at ${hhmm(closes)}`,
                        later ? 'right-top' : 'left-top', roughInk, { fontWeight : 600 })
                }
            ].filter(Boolean)
        };
    }

    // The forecast and both limits, with room over and under them for the labels. A limit is named at its left end,
    // over its line, or under it when the wave starts the day above it
    heightAxis({ muted }) {
        const
            { ctv, swath } = this.limits,
            { hs }         = this.forecast,
            low            = Math.min(ctv, ...hs),
            high           = Math.max(swath, ...hs),
            room           = (high - low) / 2,
            limit          = (name, value) => ({
                id            : name,
                type          : 'line',
                value,
                stroke        : muted,
                strokeOpacity : 0.45,
                lineDash      : [3, 3],
                label         : label(`${name} limit ${value.toFixed(1)}`, hs[0] > value ? 'bottom-left' : 'top-left',
                    muted, { fontSize : 9 })
            });

        return {
            ...bare,
            position   : 'left',
            min        : low - room,
            max        : high + room,
            gridLine   : off,
            crossLines : [limit('CTV', ctv), limit('SWATH', swath)]
        };
    }

    // One half of the wave line, `calm` or `rough`. Markers only on the crossing (a ring) and the first and last hour,
    // which are also labelled with their value: under the calm line, over the rough one
    series(key, stroke, fill, surface, ink) {
        const
            me             = this,
            { ctv, swath } = me.limits,
            ends           = datum => datum.first || datum.last;

        return {
            type          : 'area',
            xKey          : 't',
            yKey          : key,
            yName         : 'Wave height',
            // The legend is off, but AG Charts warns of the two fills otherwise
            showInLegend  : false,
            interpolation : { type : 'linear' },
            highlight,
            fill,
            fillOpacity   : 1,
            stroke,
            strokeWidth   : 2,
            marker        : {
                enabled     : true,
                size        : 6,
                strokeWidth : 2,
                itemStyler  : ({ datum }) => (datum.cross ? { size : 8, fill : surface, stroke } :
                    ends(datum) ? { fill : stroke, stroke } : { size : 0 })
            },
            label : {
                enabled    : true,
                placement  : key === 'calm' ? 'bottom' : 'top',
                spacing    : 2,
                fontSize   : 10,
                fontWeight : 500,
                color      : ink,
                formatter  : ({ datum }) => (ends(datum) ? datum.hs.toFixed(1) : '')
            },
            tooltip : {
                // Hs is the mean of the highest third of the waves; the largest in a sea state reach about 1.9 × Hs.
                // A point added at an edge or at the close reports its hour's value, not its own
                renderer : ({ datum }) => {
                    const
                        hour = Math.floor(datum.t),
                        hs   = datum.edge ? me.forecast.hs[hour - me.day.dayStart] ?? datum.hs : datum.hs;

                    return {
                        heading : `${hhmm(hour * 60)} – ${hhmm((hour + 1) * 60)}`,
                        title   : hs > swath ? 'No crew transfer' : hs > ctv ? 'SWATH only' : 'CTV and SWATH can transfer',
                        data    : [
                            {
                                label : 'Hs',
                                value : `${hs.toFixed(1)} m${hs > swath ? `, over the SWATH limit (${swath.toFixed(1)} m)` :
                                    hs > ctv ? `, over the CTV limit (${ctv.toFixed(1)} m)` : ''}`
                            },
                            { label : 'Largest waves', value : `about ${(hs * 1.9).toFixed(1)} m` }
                        ]
                    };
                }
            }
        };
    }
}
