/**
 * The wave height row of the time axis, drawn by AG Charts Community: the hourly significant wave height as an area
 * against the CTV (1.5 m) and SWATH (2.0 m) limits, with the time the CTV window closes. The chart's x axis is the
 * schedule's own day, 06:00 to 18:00, with no padding, so each hour of the chart sits over the same hour of the trips.
 *
 * Colours are read from the look's CSS custom properties, so the chart takes the Svalbard palette and follows the
 * light / dark switch with the rest of the page.
 */
import { AgCharts, AllCommunityModule, ModuleRegistry } from 'ag-charts-community';
import { dayEnd, dayStart, hhmm } from './data.js';

ModuleRegistry.registerModules([AllCommunityModule]);

const
    ctvLimit   = 1.5,
    swathLimit = 2.0,
    yMax       = 2.7;

/**
 * The resolved colour of a CSS custom property on an element, after `light-dark()` and `color-mix()`
 * @param {HTMLElement} el
 * @param {String} name
 * @returns {String}
 */
function cssColor(el, name) {
    const probe = document.createElement('span');

    probe.style.color = `var(${name})`;
    el.append(probe);

    const color = getComputedStyle(probe).color;

    probe.remove();

    return color;
}

/**
 * The chart options for a forecast
 * @param {HTMLElement} el The chart's container
 * @param {Object} options
 * @param {Number[]} options.hs Hourly wave height from `dayStart`
 * @param {Number} options.closes When Hs reaches the CTV limit
 * @param {Number} [options.was] When it reached it in the previous forecast
 * @returns {Object}
 */
function chartOptions(el, { hs, closes, was }) {
    const
        c    = name => cssColor(el, name),
        ok   = c('--ow-sea-ok'),
        amb  = c('--ow-sea-amb'),
        red  = c('--ow-sea-red'),
        ink  = c('--ow-ink-sub'),
        grid = c('--ow-grid'),
        tone = h => h >= swathLimit ? red : h >= ctvLimit ? amb : ok,
        // One point mid hour, and the first and last value held to the edges so the area spans the whole day
        data = [
            { t : dayStart, hs : hs[0], edge : true },
            ...hs.map((h, i) => ({ t : dayStart + i + 0.5, hs : h })),
            { t : dayEnd, hs : hs.at(-1), edge : true }
        ],
        font = { fontFamily : 'Montserrat Variable, Helvetica Neue, Arial, sans-serif' };

    return {
        container  : el,
        data,
        theme      : { baseTheme : 'ag-default' },
        background : { visible : false },
        padding    : { top : 0, right : 0, bottom : 0, left : 0 },
        seriesArea : { padding : { top : 0, right : 0, bottom : 0, left : 0 } },
        animation  : { enabled : false },
        legend     : { enabled : false },
        series     : [{
            type          : 'area',
            xKey          : 't',
            yKey          : 'hs',
            yName         : 'Wave height',
            interpolation : { type : 'smooth' },
            fill          : ok,
            fillOpacity   : 0.2,
            stroke        : ok,
            strokeWidth   : 2,
            marker        : {
                enabled    : true,
                size       : 6,
                strokeWidth: 1.5,
                itemStyler : ({ datum }) => datum.edge ? { size : 0 } : { fill : tone(datum.hs), stroke : tone(datum.hs) }
            },
            label : {
                enabled    : true,
                ...font,
                fontSize   : 10,
                fontWeight : 600,
                formatter  : ({ datum }) => datum.edge ? '' : datum.hs.toFixed(1),
                itemStyler : ({ datum }) => ({ color : tone(datum.hs) })
            },
            tooltip : {
                renderer : ({ datum }) => ({
                    heading : `${hhmm(Math.floor(datum.t))} – ${hhmm(Math.floor(datum.t) + 1)}`,
                    title   : 'Significant wave height',
                    data    : [
                        { label : 'Hs', value : `${datum.hs.toFixed(1)} m` },
                        {
                            label : 'Crew transfer',
                            value : datum.hs >= swathLimit ? 'No vessel' : datum.hs >= ctvLimit ? 'SWATH only' : 'CTV and SWATH'
                        }
                    ]
                })
            }
        }],
        axes : {
            x : {
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
                gridLine  : { enabled : true, style : [{ stroke : grid, lineDash : [] }] },
                crossLines: [
                    ...(was ? [{
                        type      : 'line',
                        value     : was,
                        stroke    : ink,
                        lineDash  : [2, 3],
                        strokeWidth : 1,
                        label     : { text : `was ${hhmm(was)}`, placement : 'inside-top-left', color : ink, fontSize : 9.5, ...font }
                    }] : []),
                    {
                        type        : 'line',
                        value       : closes,
                        stroke      : was ? red : amb,
                        strokeWidth : 1.5,
                        label       : {
                            text       : `CTV window closes ${hhmm(closes)}`,
                            placement  : 'inside-top-right',
                            color      : was ? red : amb,
                            fontSize   : 9.5,
                            fontWeight : 700,
                            ...font
                        }
                    }
                ]
            },
            y : {
                type       : 'number',
                position   : 'left',
                min        : 0,
                max        : yMax,
                nice       : false,
                thickness  : 0,
                label      : { enabled : false },
                line       : { enabled : false },
                tick       : { enabled : false },
                gridLine   : { enabled : false },
                crossLines : [
                    { type : 'range', range : [ctvLimit, swathLimit], fill : amb, fillOpacity : 0.07, strokeWidth : 0 },
                    { type : 'range', range : [swathLimit, yMax], fill : red, fillOpacity : 0.07, strokeWidth : 0 },
                    {
                        type     : 'line', value : ctvLimit, stroke : amb, lineDash : [4, 3], strokeWidth : 1,
                        label    : { text : 'CTV 1.5', placement : 'inside-left', color : amb, fontSize : 9, fontWeight : 700, ...font }
                    },
                    {
                        type     : 'line', value : swathLimit, stroke : red, lineDash : [4, 3], strokeWidth : 1,
                        label    : { text : 'SWATH 2.0', placement : 'inside-left', color : red, fontSize : 9, fontWeight : 700, ...font }
                    }
                ]
            }
        }
    };
}

/**
 * Draws the wave height chart into an element and keeps it in the page's light / dark mode
 * @param {HTMLElement} el
 * @param {Object} forecast See chartOptions
 * @returns {Promise} Resolves once the chart has rendered
 */
export function waveChart(el, forecast) {
    const
        chart  = AgCharts.create(chartOptions(el, forecast)),
        update = () => chart.update(chartOptions(el, forecast));

    // The shell's sun / moon toggle sets `data-theme` and `color-scheme` on the root, the system setting can change too
    new MutationObserver(update).observe(document.documentElement, { attributes : true, attributeFilter : ['data-theme', 'style'] });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', update);

    return chart.waitForUpdate();
}
