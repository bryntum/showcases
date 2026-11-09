import { AgCharts, AllCommunityModule, ModuleRegistry } from 'ag-charts-community';
import { hhmm } from '../util/Time.js';

ModuleRegistry.registerModules([AllCommunityModule]);

// The showcase's font, for every label of the chart (its theme's `fontFamily`)
const
    fontFamily = 'Montserrat Variable, Helvetica Neue, Arial, sans-serif',
    // A limit's name, on its line at the left end: small, with air before it and before the dashes
    limitFont  = { fontSize : 9, fontWeight : 500, padding : 6 },
    limitText  = (name, value) => `${name} limit ${value.toFixed(1)}`;

// Room the wave height axis keeps, px: above the roughest hour for its point and value label, under the calmest one for
// its point, under the start value for its label, about a limit for its name. No label is cut at the chart's edges
const room = { label : 20, point : 5, limit : 13, guide : 8, under : 24 };

// Hovering a point only shows its tooltip: no dimming of the series, no bigger marker, just a slightly heavier ring
const highlight = {
    highlightedSeries   : { opacity : 1 },
    unhighlightedSeries : { opacity : 1 },
    highlightedItem     : { strokeWidth : 2.5 },
    unhighlightedItem   : { opacity : 1 },
    bringToFront        : false
};

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

// How strongly the dashed limit lines are drawn, their names keep full ink
const limitFade = 0.45;

/**
 * The wave height row of the time axis (ForecastHeader), an AG Charts Community area chart: the hourly significant
 * wave height against the CTV and SWATH limits, and the time the CTV window closes. Its x axis is the schedule's own
 * day with no padding, so each hour of the chart sits over the same hour of the trips. The line turns orange where it
 * crosses the CTV limit, hovering a point tells which vessels can still transfer.
 *
 * Not a widget: it draws into the element it is given. Colours are read from the showcase's CSS custom properties, so
 * the chart takes the Svalbard palette, and it is drawn again when the page switches between light and dark.
 *
 * Learn more:
 * https://www.ag-grid.com/charts/javascript/area-series/
 * https://www.ag-grid.com/charts/javascript/axes-cross-lines/
 * https://www.ag-grid.com/charts/javascript/themes-api/
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

        // The shell's light / dark switch sets `data-theme` on the root (after its `color-scheme`), the system
        // setting can change too
        me.observer = new MutationObserver(() => me.redraw());
        me.observer.observe(document.documentElement, { attributes : true, attributeFilter : ['data-theme'] });
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

    // The data: one point mid hour, the first and the last value held to the edges so the area spans the whole day.
    // Where the line crosses a limit between two hours an extra point is put on the limit. Those points carry `edge`
    // too. The line is `calm` up to where it first crosses the CTV limit (`cross`) and `rough` from there, both have
    // that point. Labelled are the first hour, the crossing and the last hour only
    data() {
        const
            points = this.points(),
            cross  = points.find(point => point.edge && point.hs === this.limits.ctv && point.t > this.day.dayStart),
            hours  = points.filter(point => !point.edge),
            first  = hours[0],
            last   = hours.at(-1);

        return points.map(point => ({
            ...point,
            calm  : !cross || point.t <= cross.t ? point.hs : null,
            rough : cross && point.t >= cross.t ? point.hs : null,
            cross : point === cross,
            first : point === first,
            last  : point === last
        }));
    }

    points() {
        const
            { hs }                 = this.forecast,
            { dayStart, dayEnd }   = this.day,
            { ctv, swath }         = this.limits,
            hours                  = hs.slice(0, dayEnd - dayStart),
            points                 = [
                { t : dayStart, hs : hours[0], edge : true },
                ...hours.map((value, i) => ({ t : dayStart + i + 0.5, hs : value })),
                { t : dayEnd, hs : hours.at(-1), edge : true }
            ],
            all                    = [];

        points.forEach((point, i) => {
            const previous = points[i - 1];

            if (previous) {
                [ctv, swath].filter(limit => (previous.hs - limit) * (point.hs - limit) < 0).
                    sort((a, b) => (point.hs > previous.hs ? a - b : b - a)).
                    forEach(limit => all.push({
                        t    : previous.t + (point.t - previous.t) * (limit - previous.hs) / (point.hs - previous.hs),
                        hs   : limit,
                        edge : true
                    }));
            }
            all.push(point);
        });

        return all;
    }

    /**
     * The wave height axis, metres, computed from the forecast shown: from the calmest hour less room for its point to
     * the roughest one plus room for its value label, both limits and their names inside. The room is in px, so
     * metres to the chart's height: the range is solved with the room it has to leave
     * @returns {{ bottom : Number, top : Number }}
     */
    range() {
        const
            { hs }         = this.forecast,
            { ctv, swath } = this.limits,
            // Drawn only once the container has a size (redraw)
            height         = this.element.clientHeight,
            above          = [[Math.max(...hs), room.label], [swath, room.limit], [ctv, room.limit]],
            // The start value is named under its point (valueLabels)
            below          = [[Math.min(...hs), room.point], [hs[0], room.under], [ctv, 0]];

        let span = 3;

        // Each pass uses the previous range's metres a px, it settles within a few
        for (let i = 0; i < 30; i++) {
            const
                perPx  = span / height,
                top    = Math.max(...above.map(([value, px]) => value + px * perPx)),
                // Not under 0: the fill under the line runs down to 0, it would stop short of the chart's bottom
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

        me.heightRange = me.range();

        return {
            container  : me.element,
            data       : me.data(),
            theme      : { baseTheme : 'ag-default', params : { fontFamily } },
            background : { visible : false },
            padding    : { top : 0, right : 0, bottom : 0, left : 0 },
            seriesArea : { padding : { top : 0, right : 0, bottom : 0, left : 0 } },
            animation  : { enabled : false },
            legend     : { enabled : false },
            // The lines come first: AG Charts draws cross lines above the series, markers included, so the window's
            // lines and the CTV limit are series listed before the wave line, and the ring of the crossing covers them
            series     : [
                ...me.windowLines(colors),
                me.limitLine(me.limits.ctv, colors.muted, 'CTV'),
                me.limitLine(me.limits.swath, colors.muted, 'SWATH'),
                me.series('calm', colors.calm, colors.calmFill, colors.surface),
                me.series('rough', colors.rough, colors.roughFill, colors.surface),
                // The start value under its point: the limits' names are at the left end, on their lines
                me.valueLabels(colors, 'first', 'bottom'),
                me.valueLabels(colors, 'last', 'top')
            ],
            axes : {
                x : me.timeAxis(color('--ow-tick')),
                y : me.heightAxis(colors.muted)
            }
        };
    }

    // The wave line up to where it crosses the CTV limit (`calm`) or from there (`rough`), a light fill under it. The
    // crossing has a ring, the first and last hour a dot: the three points labelled
    series(key, stroke, fill, surface) {
        const { ctv, swath } = this.limits;

        return {
            type          : 'area',
            xKey          : 't',
            yKey          : key,
            yName         : 'Wave height',
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
            // The values are labelled by valueLabels(), under their points
            label   : { enabled : false },
            tooltip : {
                // What the hour means for the crews first, then the numbers behind it. Hs (significant wave height) is
                // the mean of the highest third of the waves; the largest in a sea state reach about 1.9 × Hs
                // The points added where the line crosses a limit sit on the limit: they report their hour's value
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

    // The value of the first hour or the last one, above its point: under the last one it would sit on the SWATH line,
    // under the first one it would be cut at the chart's foot. One series each, so each can be placed on its own; an
    // area series cannot place its labels, a line series can. The crossing is named on the window's line (timeAxis)
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
                // The last hour past the crossing in the orange of the line there
                itemStyler : ({ datum }) => ({
                    color : datum.last && datum.rough != null ? colors.roughInk : colors.muted
                })
            }
        };
    }

    // A vertical line series over the whole height at one time, with a label beside its lower end: the window's close
    // where the waves cross the CTV limit, named "1.5 m at 14:00", and after a new forecast the old close, dashed
    guide({ time, stroke, dash, width, text, color, weight = 500, placement }) {
        const
            { bottom, top } = this.heightRange,
            labelAt         = bottom + room.guide * (top - bottom) / this.element.clientHeight;

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

    // The close of the window and, after a new forecast, the one before. Series listed before the wave line, so the
    // ring of the crossing is drawn over them (cross lines are always above the series). The earlier of the two has its
    // label on its left, the later one on its right, so they part
    windowLines(colors) {
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
            }),
            this.guide({
                time      : closes / 60,
                stroke    : colors.rough,
                dash      : [],
                width     : 1.5,
                text      : `${ctv.toFixed(1)} m at ${hhmm(closes)}`,
                color     : colors.roughInk,
                weight    : 600,
                placement : was == null || closes > was ? 'right' : 'left'
            })
        ].filter(Boolean);
    }

    // The CTV limit, a thin dashed line over the whole day. A series for the same reason as the window's lines: it runs
    // under the ring where the waves cross it. Its name is the label of an invisible cross line (heightAxis), on the
    // line at its left end: the dashes start after the name
    limitLine(value, ink, name) {
        const { dayStart, dayEnd } = this.day;

        return {
            type : 'line',
            xKey : 't',
            yKey : 'v',
            data : [
                { t : dayStart + this.limitNameWidth(name), v : value },
                { t : dayEnd, v : value }
            ],
            stroke        : ink,
            // Faded: the limits guide the eye, the wave line carries the story (the names keep full ink)
            strokeOpacity : limitFade,
            strokeWidth   : 1,
            lineDash      : [3, 3],
            marker        : { enabled : false },
            highlight,
            showInLegend  : false,
            tooltip       : { enabled : false }
        };
    }

    // The day of the schedule and the hour lines
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

    // Where a limit's dashes start, in hours (the x axis' unit): after its name at the left end, with air on both
    // sides
    limitNameWidth(name) {
        const
            me      = this,
            context = (me.measure ??= document.createElement('canvas').getContext('2d')),
            perHour = (me.element.clientWidth || 1) / (me.day.dayEnd - me.day.dayStart);

        context.font = `${limitFont.fontWeight} ${limitFont.fontSize}px ${fontFamily}`;

        const text = context.measureText(limitText(name, me.limits[name.toLowerCase()])).width;

        return (limitFont.padding * 2 + text) / perHour;
    }

    // A limit's name at the left end, on its line: the label of a cross line with no stroke of its own, the dashed line
    // is a series that starts after the name (limitLine)
    limitName(value, name, ink) {
        return {
            type   : 'line',
            value,
            stroke : 'transparent',
            label  : { text : limitText(name, value), color : ink, placement : 'inside-left', ...limitFont }
        };
    }

    // Metres. Both limits are named at the left end, each on its own line (limitName, limitLine)
    heightAxis(ink) {
        const
            me              = this,
            { ctv, swath }  = me.limits,
            { bottom, top } = me.heightRange;

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
                me.limitName(swath, 'SWATH', ink),
                me.limitName(ctv, 'CTV', ink)
            ]
        };
    }
}
