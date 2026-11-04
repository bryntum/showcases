import { StringHelper } from '@bryntum/core-enterprise';
import { progressRing, svgNs } from '../Glyphs.js';
import { avatar, avatarMore } from '../bar/BarParts.js';
import { formatDay, formatPercent } from '../util/Format.js';
import { hiddenWhenSmall, responsiveWidth } from '../util/Responsive.js';

/**
 * Locked columns of the Vehicle program view:
 * - Phase, the tree: groups with their rolled up progress (a value and a small ring), phases with their stage gate,
 *   end date and owners, the milestone with its date
 * - Slip · 6 wk, the schedule slip of the last six weeks up to the simulated now as a line chart, rolling on a week
 *   at a time during playback, red once past the phase's float (the scheduling engine's total slack). A finished
 *   phase keeps the six weeks up to its end, muted and on its own scale, with a dot at its final slip. Hovering the
 *   cell explains the slip against the float. Computed by the view, see ProgramGantt#getSlipInfo and
 *   ProgramGantt#getSlipWeeks
 *
 * Learn more:
 * https://bryntum.com/products/gantt/docs/api/Grid/column/TreeColumn
 * https://bryntum.com/products/gantt/docs/api/Gantt/model/TaskModel#field-totalSlack
 */

const
    // Owner avatars shown, more are summed up in a +N chip, which lists them on hover
    maxAvatars  = 2,
    // Slip chart viewBox: 100 units wide, stretched to the cell width (preserveAspectRatio none), 14 high (px). The
    // line runs from the zero line (y 12.75) up to the top line (y 1), its area fills down to the bottom
    chartHeight = 14,
    chartTop    = 1,
    chartBase   = 12.75,
    // A finished phase's chart spans at least this many days, so a small wiggle is not blown up to full height
    minOwnSpan  = 4,
    // Chart paths per slip window. The view returns the same weeks array while a phase's window is unchanged, the
    // paths are then reused and the cell renders the same output, which DomSync leaves alone
    chartPaths  = new WeakMap(),

    // 4 d, 2 wk. Days under a week, weeks from 7 days
    formatDuration = days => {
        const abs = Math.abs(days);

        return abs >= 7 ? `${Math.round(abs / 7)} wk` : `${abs} d`;
    },

    formatSlipDays = days => days ? `${days > 0 ? '+' : '-'}${formatDuration(days)}` : 'On plan',

    // Context of a phase's slip, its tooltip: finished, past its float, recovered, or the float left
    slipTip = ({ slip, slack, worst, finished, pastFloat, recovered }) => {
        const slipped = Math.max(0, slip);

        if (finished) {
            return 'Finished, slip history frozen at its end';
        }

        if (pastFloat) {
            return `${formatDuration(slip - slack)} past float`;
        }

        if (recovered) {
            return `Recovered ${formatDuration(worst)}`;
        }

        return slack > slipped ? `${formatDuration(slack - slipped)} float left` : 'No float left';
    },

    /**
     * Tree cell. Groups show their rolled up progress (or "Not started"), phases their gate, date and owners, the
     * milestone its date. Group rows get a faint tint
     */
    renderPhaseCell = ({ record, grid, row }) => {
        const { isParent, milestone } = record;

        row.assignCls({ 'ev-parent-row' : isParent });

        if (isParent) {
            const fraction = grid.getRollupFraction(record);

            return {
                class    : { 'ev-phase-cell' : 1, 'ev-phase-group' : 1 },
                children : [
                    { tag : 'span', class : 'ev-phase-name', text : record.phase },
                    record.startDate > grid.simNow ?
                        { tag : 'span', class : 'ev-rollup-pending', text : 'Not started' } :
                        {
                            class    : 'ev-phase-rollup',
                            children : [
                                { tag : 'span', class : 'ev-rollup-value', text : formatPercent(fraction) },
                                progressRing({ fraction, status : 'neutral', size : 'mini' })
                            ]
                        }
                ]
            };
        }

        if (milestone) {
            return {
                class    : 'ev-phase-cell',
                children : [
                    { tag : 'span', class : 'ev-phase-name', text : record.phase },
                    { tag : 'span', class : 'ev-phase-date', text : formatDay(record.startDate) }
                ]
            };
        }

        const
            finished = record.endDate <= grid.simNow,
            // The end date is exclusive, show the last day of the phase
            endDay   = formatDay(new Date(record.endDate - 1)),
            subtitle = [record.gate, finished ? `finished ${endDay}` : endDay, record.critical && !finished && 'critical'].filter(Boolean).join(' · '),
            people   = record.owners.map(name => grid.getPerson(name));

        return {
            class    : { 'ev-phase-cell' : 1, 'ev-flip' : grid.isFlipping(record.id) },
            children : [
                {
                    class    : 'ev-phase-text',
                    children : [
                        { class : 'ev-phase-name', text : record.phase },
                        { class : 'ev-phase-sub', text : subtitle }
                    ]
                },
                people.length > 0 && {
                    class    : 'ev-avatars',
                    children : [
                        ...people.slice(0, maxAvatars).map(avatar),
                        people.length > maxAvatars && avatarMore(people.slice(maxAvatars))
                    ]
                }
            ]
        };
    },

    /**
     * Chart heights (viewBox units) of the weekly slips. Live phases share one scale from zero to `scale` days, so
     * their charts compare and only a slip above plan rises. A finished phase is frozen and muted, on its own scale:
     * its lowest to highest week (at least `minOwnSpan` days, centered), recoveries below plan included
     * @param {Number[]} weeks
     * @param {Number|null} scale Days at the top line, `null` for the phase's own scale
     * @returns {Number[]}
     */
    chartHeights = (weeks, scale) => {
        const range = chartBase - chartTop;

        if (scale) {
            return weeks.map(days => chartBase - Math.max(0, days) / scale * range);
        }

        const
            min  = Math.min(...weeks),
            max  = Math.max(...weeks),
            span = Math.max(minOwnSpan, max - min),
            low  = min - (span - (max - min)) / 2;

        return weeks.map(days => chartBase - (days - low) / span * range);
    },

    /**
     * The six weekly slips as a line over a faint area, red only when past float now. Always six points, so its `d`
     * eases between the weeks during playback (see program.css). A finished phase ends in a dot. The SVG stretches to
     * the cell (preserveAspectRatio none), so the dot is an HTML element placed in % on top of it, it stays round
     */
    slipChart = ({ weeks, finished }, sharedScale) => {
        const
            flat  = !weeks.some(days => days > 0),
            scale = finished ? null : sharedScale;

        let paths = chartPaths.get(weeks);

        if (paths?.scale !== scale) {
            const
                heights = chartHeights(weeks, scale),
                line    = `M${heights.map((y, index) => `${(index / (weeks.length - 1) * 100).toFixed(2)} ${y.toFixed(2)}`).join('L')}`;

            paths = { scale, line, area : `${line}V${chartHeight}H0Z`, endY : heights.at(-1) / chartHeight * 100 };
            chartPaths.set(weeks, paths);
        }

        return {
            class    : 'ev-slip-plot',
            children : [
                {
                    tag                 : 'svg',
                    ns                  : svgNs,
                    class               : { 'ev-slip-chart' : 1, 'ev-slip-flat' : flat },
                    viewBox             : `0 0 100 ${chartHeight}`,
                    preserveAspectRatio : 'none',
                    'aria-hidden'       : 'true',
                    children            : [
                        !flat && { tag : 'path', ns : svgNs, class : 'ev-slip-area', d : paths.area },
                        { tag : 'path', ns : svgNs, class : 'ev-slip-line', d : paths.line }
                    ]
                },
                finished && { tag : 'span', class : 'ev-slip-dot', style : { top : `${paths.endY.toFixed(2)}%` } }
            ]
        };
    },

    renderSlip = ({ record, grid }) => {
        const info = grid.getSlipInfo(record);

        if (!info) {
            return null;
        }

        const
            { slip, finished, pastFloat, recovered } = info,
            late = pastFloat && !finished;

        // Groups, a single value: the worst slip of their phases and milestone. The milestone, a single value too
        if (record.isParent || record.milestone) {
            return {
                tag   : 'span',
                class : { 'ev-slip-value' : 1, 'ev-slip-finished' : finished, 'ev-slip-late' : late },
                text  : formatSlipDays(slip)
            };
        }

        return {
            class : {
                'ev-slip-cell'      : 1,
                'ev-slip-finished'  : finished,
                'ev-slip-late'      : late,
                'ev-slip-recovered' : recovered && !finished,
                'ev-flip'           : grid.isFlipping(record.id)
            },
            // The shared tooltip shows `data-btip` as HTML
            dataset  : { btip : StringHelper.encodeHtml(slipTip(info)) },
            children : [
                { tag : 'span', class : 'ev-slip-value', text : formatSlipDays(slip) },
                slipChart(info, grid.getSlipScale())
            ]
        };
    };

/**
 * Column configs. Gantt always includes a name column, it is the tree column
 */
export const programColumns = columnTitle => [
    {
        id          : 'primary',
        type        : 'name',
        text        : columnTitle,
        field       : 'phase',
        ...responsiveWidth(314, 170),
        cls         : 'ev-header ev-header-first',
        cellCls     : 'ev-tree-cell',
        leafIconCls : null,
        renderer    : renderPhaseCell
    },
    {
        id       : 'slip',
        text     : 'Slip · 6 wk',
        width    : 144,
        // Header and cells share the slip column's inline padding, see program.css
        cls      : 'ev-header ev-slip-column',
        cellCls  : 'ev-live-cell ev-slip-column',
        renderer : renderSlip,
        ...hiddenWhenSmall
    }
];
