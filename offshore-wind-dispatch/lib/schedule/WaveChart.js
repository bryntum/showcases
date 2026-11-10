import { AgCharts, AllCommunityModule, ModuleRegistry } from 'ag-charts-community';
import { hhmm } from '../util/Time.js';

ModuleRegistry.registerModules([AllCommunityModule]);

// The showcase's font, for the chart's labels; textHours() measures with it too
const
    fontFamily = 'Montserrat Variable, Helvetica Neue, Arial, sans-serif',
    // A limit's name, at the left end of its line
    limitFont  = { fontSize : 9, fontWeight : 500, padding : 6 };

// Room the wave height axis keeps for labels and points, px (range()), so no label is cut at the chart's edges
const room = { label : 20, point : 5, limit : 13, guide : 8, under : 24 };

// Hovering a point only shows its tooltip: no dimming of the other series, no bigger marker
const highlight = {
    highlightedSeries   : { opacity : 1 },
    unhighlightedSeries : { opacity : 1 },
    highlightedItem     : { strokeWidth : 2.5 },
    unhighlightedItem   : { opacity : 1 },
    bringToFront        : false
};

// The resolved colour of a CSS custom property on an element, after `light-dark()` and `color-mix()`
function cssColor(element, name) {
    const probe = document.createElement('span');

    probe.style.color = `var(${name})`;
    element.append(probe);

    const { color } = getComputedStyle(probe);

    probe.remove();

    return toRgba(color);
}

let pixel;

// A colour as `rgba()`. The browser computes `color-mix()` to `color(srgb …)`, which AG Charts does not read, so the
// colour is painted on a one pixel canvas and read back
function toRgba(color) {
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
 * padding, so each hour of the chart sits over the same hour of the trips. Colours are read from CSS custom
 * properties, so the chart is drawn again when the page switches between light and dark.
 *
 * Learn more:
 * https://www.ag-grid.com/charts/javascript/area-series/
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
        me.sized = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;

            if (width && height) {
                me.redraw();
            }
        });
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

        const options = me.options();

        // Another number of series (window lines) needs a new chart: AG Charts' update matches series by index
        if (me.chart?.getOptions().series.length === options.series.length) {
            me.chart.update(options);
        }
        else {
            me.chart?.destroy();
            me.chart = AgCharts.create(options);
        }

        return me.chart.waitForUpdate();
    }

    destroy() {
        this.observer.disconnect();
        this.sized.disconnect();
        this.media.removeEventListener('change', this.onMedia);
        this.chart?.destroy();
    }

    // The line is `calm` while the CTV window is open and `rough` from when it closes. The close is the dispatch
    // state's (the start of the first hour over the limit), not where the line crosses 1.5 m, so the chart and the
    // no-go ranges agree. The point at the close (`cross`) is in both halves so the line has no gap
    data() {
        const
            points = this.points(),
            split  = this.closesHour,
            cross  = points.find(point => point.split),
            hours  = points.filter(point => !point.edge),
            first  = hours[0],
            last   = hours.at(-1);

        return points.map(point => ({
            ...point,
            calm  : point.t <= split ? point.hs : null,
            rough : point.t >= split ? point.hs : null,
            cross : point === cross,
            first : point === first,
            last  : point === last
        }));
    }

    /**
     * When the CTV window closes, in hours: `-Infinity` when it never opens, `Infinity` when it stays open
     * @property {Number}
     */
    get closesHour() {
        const
            { dayStart, dayEnd } = this.day,
            hour                 = this.forecast.closes / 60;

        return hour <= dayStart ? -Infinity : hour >= dayEnd ? Infinity : hour;
    }

    get closesInDay() {
        return Number.isFinite(this.closesHour);
    }

    // One point mid hour, the first and the last value held to the edges so the area spans the whole day
    points() {
        const
            { hs }               = this.forecast,
            { dayStart, dayEnd } = this.day,
            hours                = hs.slice(0, dayEnd - dayStart),
            split                = this.closesHour,
            points               = [
                { t : dayStart, hs : hours[0], edge : true },
                ...hours.map((value, i) => ({ t : dayStart + i + 0.5, hs : value })),
                { t : dayEnd, hs : hours.at(-1), edge : true }
            ];

        if (!this.closesInDay) {
            return points;
        }

        // A point where the window closes, on the line between its neighbours
        const
            after  = points.findIndex(point => point.t >= split),
            next   = points[after],
            before = points[after - 1];

        if (next.t === split) {
            next.split = true;

            return points;
        }

        points.splice(after, 0, {
            t     : split,
            hs    : before.hs + (next.hs - before.hs) * (split - before.t) / (next.t - before.t),
            edge  : true,
            split : true
        });

        return points;
    }

    /**
     * The wave height axis, metres: the forecast and both limits with room around them for their labels. The room is
     * in px and the metres per px depend on the range itself, so the range is solved by iteration
     * @returns {{ bottom : Number, top : Number }}
     */
    range() {
        const
            { hs }         = this.forecast,
            { ctv, swath } = this.limits,
            // Not 0: drawn only once the container has a size (redraw)
            height         = this.element.clientHeight,
            above          = [[Math.max(...hs), room.label], [swath, room.limit], [ctv, room.limit]],
            // The start value is named under its point (valueLabels)
            below          = [[Math.min(...hs), room.point], [hs[0], room.under], [ctv, 0]];

        let span = 3;

        // Each pass uses the previous range's metres per px; it settles within a few
        for (let i = 0; i < 30; i++) {
            const
                perPx  = span / height,
                top    = Math.max(...above.map(([value, px]) => value + px * perPx)),
                // Not under 0: the fill runs down to 0, it would stop short of the chart's bottom
                bottom = Math.max(0, Math.min(...below.map(([value, px]) => value - px * perPx)));

            span = top - bottom;
        }

        const
            perPx = span / height,
            top   = Math.max(...above.map(([value, px]) => value + px * perPx));

        return { top, bottom : top - span };
    }

    options() {
        const
            me     = this,
            color = name => cssColor(me.element, name),
            colors = {
                calm      : color('--ow-c-work'),
                calmFill  : color('--ow-c-chart-fill'),
                rough     : color('--ow-c-risk-line'),
                roughFill : color('--ow-c-chart-risk'),
                roughInk  : color('--ow-c-risk-ink'),
                muted     : color('--ow-c-muted'),
                surface   : color('--ow-surface')
            };

        const range = me.range();

        return {
            container  : me.element,
            data       : me.data(),
            theme      : { baseTheme : 'ag-default', params : { fontFamily } },
            background : { visible : false },
            padding    : { top : 0, right : 0, bottom : 0, left : 0 },
            seriesArea : { padding : { top : 0, right : 0, bottom : 0, left : 0 } },
            animation  : { enabled : false },
            legend     : { enabled : false },
            // The window's lines and the limits are line series, not cross lines: AG Charts draws cross lines above
            // the series, these are listed before the wave line so its ring at the crossing covers them
            series     : [
                ...me.windowLines(colors, range),
                me.limitLine('CTV', colors.muted),
                me.limitLine('SWATH', colors.muted),
                me.series('calm', colors.calm, colors.calmFill, colors.surface),
                me.series('rough', colors.rough, colors.roughFill, colors.surface),
                me.valueLabels(colors, 'first', 'bottom'),
                me.valueLabels(colors, 'last', 'top')
            ],
            axes : {
                x : me.timeAxis(color('--ow-tick')),
                y : me.heightAxis(range)
            }
        };
    }

    // One half of the wave line, `calm` or `rough`. Markers only on the crossing (a ring) and the first and last hour
    series(key, stroke, fill, surface) {
        const { ctv, swath } = this.limits;

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
                itemStyler  : ({ datum }) => datum.cross ?
                    { size : 8, fill : surface, stroke } :
                    (key === 'calm' ? datum.first : datum.last) ? { fill : stroke, stroke } : { size : 0 }
            },
            // Labelled by valueLabels()
            label   : { enabled : false },
            tooltip : {
                // Hs is the mean of the highest third of the waves; the largest in a sea state reach about 1.9 × Hs.
                // A point added at an edge or at the close reports its hour's value, not its own
                renderer : ({ datum }) => {
                    const
                        hour = Math.floor(datum.t),
                        hs   = datum.edge ? this.forecast.hs[hour - this.day.dayStart] ?? datum.hs : datum.hs;

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

    // The value of the first or the last hour, as a line series of its own: an area series cannot place its labels.
    // The first goes under its point, the last above, clear of the SWATH line
    valueLabels(colors, which, placement) {
        return {
            type         : 'line',
            xKey         : 't',
            yKey         : 'hs',
            yName        : 'Wave height',
            strokeWidth  : 0,
            marker       : { enabled : false },
            highlight,
            showInLegend : false,
            tooltip      : { enabled : false },
            label        : {
                enabled    : true,
                placement,
                fontSize   : 10,
                fontWeight : 500,
                formatter  : ({ datum }) => (datum[which] ? datum.hs.toFixed(1) : ''),
                itemStyler : ({ datum }) => ({
                    color : datum.last && datum.rough != null ? colors.roughInk : colors.muted
                })
            }
        };
    }

    // A vertical line at one time over the whole height, its label beside its foot
    guide({ time, stroke, dash, width, text, color, weight = 500, placement }, { bottom, top }) {
        const labelAt = bottom + room.guide * (top - bottom) / this.element.clientHeight;

        return {
            type : 'line',
            xKey : 't',
            yKey : 'v',
            data : [
                { t : time, v : bottom },
                { t : time, v : labelAt, text },
                { t : time, v : top }
            ],
            stroke,
            strokeWidth  : width,
            lineDash     : dash,
            marker       : { enabled : false },
            highlight,
            showInLegend : false,
            tooltip      : { enabled : false },
            label        : {
                enabled    : true,
                placement,
                padding    : 4,
                fontSize   : 10,
                fontWeight : weight,
                color,
                formatter  : ({ datum }) => datum.text ?? ''
            }
        };
    }

    // The CTV close, "1.5 m at 14:00", and after a new forecast the one before, dashed. Labels face away from each
    // other
    windowLines(colors, range) {
        const
            { closes, was } = this.forecast,
            { ctv }         = this.limits;

        return [
            was == null ? null : this.guide({
                time      : was / 60,
                stroke    : colors.muted,
                dash      : [2, 3],
                width     : 1,
                text      : `was ${hhmm(was)}`,
                color     : colors.muted,
                placement : was > closes ? 'left' : 'right'
            }, range),
            !this.closesInDay ? null : this.guide({
                time      : closes / 60,
                stroke    : colors.rough,
                dash      : [],
                width     : 1.5,
                text      : `${ctv.toFixed(1)} m at ${hhmm(closes)}`,
                color     : colors.roughInk,
                weight    : 600,
                placement : was == null || closes > was ? 'right' : 'left'
            }, range)
        ].filter(Boolean);
    }

    // A limit, a faded dashed line named at its left end: the line starts after the name, which is the label of its
    // first point
    limitLine(name, ink) {
        const
            { dayStart, dayEnd } = this.day,
            value                = this.limits[name.toLowerCase()],
            text                 = `${name} limit ${value.toFixed(1)}`;

        return {
            type : 'line',
            xKey : 't',
            yKey : 'v',
            data : [
                { t : dayStart + this.textHours(text), v : value, text },
                { t : dayEnd, v : value }
            ],
            stroke        : ink,
            strokeOpacity : 0.45,
            strokeWidth   : 1,
            lineDash      : [3, 3],
            marker        : { enabled : false },
            highlight,
            showInLegend  : false,
            tooltip       : { enabled : false },
            label         : {
                enabled   : true,
                placement : 'left',
                color     : ink,
                ...limitFont,
                formatter : ({ datum }) => datum.text ?? ''
            }
        };
    }

    // Hours, no labels: the schedule's own header has them
    timeAxis(grid) {
        const { dayStart, dayEnd } = this.day;

        return {
            type      : 'number',
            position  : 'bottom',
            min       : dayStart,
            max       : dayEnd,
            nice      : false,
            thickness : 0,
            interval  : { step : 1 },
            label     : { enabled : false },
            line      : { enabled : false },
            tick      : { enabled : false },
            gridLine  : { enabled : true, style : [{ stroke : grid, lineDash : [] }] }
        };
    }

    // How wide a limit's name and its padding are, in hours (the x axis' unit)
    textHours(text) {
        const
            me      = this,
            context = (me.measure ??= document.createElement('canvas').getContext('2d')),
            perHour = (me.element.clientWidth || 1) / (me.day.dayEnd - me.day.dayStart);

        context.font = `${limitFont.fontWeight} ${limitFont.fontSize}px ${fontFamily}`;

        return (limitFont.padding * 2 + context.measureText(text).width) / perHour;
    }

    heightAxis({ bottom, top }) {
        return {
            type      : 'number',
            position  : 'left',
            min       : bottom,
            max       : top,
            nice      : false,
            thickness : 0,
            label     : { enabled : false },
            line      : { enabled : false },
            tick      : { enabled : false },
            gridLine  : { enabled : false }
        };
    }
}
