import { stationGlyph } from '../Glyphs.js';
import { minuteMs, spanAt } from '../util/Time.js';
import { formatTime } from '../util/Format.js';
import { hiddenWhenSmall, responsiveWidth } from '../util/Responsive.js';

/**
 * Locked columns of the Production line view:
 * - Work center, a neutral line-art station glyph tile, the name and a description
 * - Shift, the live state (label and dot in the status colour), the OEE since the shift start, and a shift strip
 *   filled from the shift start up to the simulated "now" with a segment per state period, the empty track after it
 *
 * Both are derived from the simulated "now" (`grid.simNow`) and refreshed cell by cell on every simulation tick, see
 * SimulatedView#refreshLiveCells.
 *
 * Learn more:
 * https://bryntum.com/docs/api/Grid/column/Column#config-renderer
 */

const
    // OEE at or above this is world class, shown muted, orange below
    oeeTarget    = 85,
    // OEE is not meaningful for the first few minutes of the shift
    oeeMinRun    = 15 * minuteMs,
    // Labels by state, a running station by the status of its batch, so the label always matches the colour
    stateLabel   = { changeover : 'Die change', down : 'Down', idle : 'Idle' },
    runningLabel = { ok : 'Running', focus : 'Expedite', late : 'Behind' },
    overlap      = (start, end, from, to) => Math.max(0, Math.min(end, to) - Math.max(start, from)),

    stationState = (resource, now) => {
        const block = spanAt(resource.timeRanges, now);

        if (block) {
            return {
                state     : block.state,
                // A die change is planned, shown neutral like idle time
                status    : block.state === 'down' ? 'down' : 'sched',
                remaining : Math.ceil((block.endDate - now) / minuteMs)
            };
        }

        const event = spanAt(resource.events, now);

        return event ?
            { state : 'running', status : event.liveStatus } :
            { state : 'idle', status : 'sched' };
    },

    /**
     * OEE since the shift start: availability (share of time running batches) × performance (speed vs the ideal
     * cycle time) × quality (first pass yield weighted by run time)
     * @returns {Number|null} OEE in percent, `null` early in the shift
     */
    stationOee = (resource, now, shiftStart) => {
        const elapsed = now - shiftStart;

        if (elapsed < oeeMinRun) {
            return null;
        }

        let
            run         = 0,
            performance = 0,
            quality     = 0;

        resource.events.forEach(event => {
            const ran = overlap(event.startDate, event.endDate, shiftStart, now);

            if (ran) {
                run         += ran;
                performance += ran * resource.performance * (event.liveStatus === 'late' ? 0.94 : 1);
                quality     += ran * event.fpy / 100;
            }
        });

        return run ? Math.round(run / elapsed * (performance / run) * (quality / run) * 100) : 0;
    },

    /**
     * Work center cell: neutral station glyph tile, name and description
     */
    renderStation = ({ record }) => ({
        class    : 'ev-resource ev-station',
        children : [
            { class : 'ev-glyph-tile', children : [stationGlyph(record.type)] },
            {
                class    : 'ev-resource-text',
                children : [
                    { class : 'ev-resource-name', text : record.name },
                    { class : 'ev-resource-desc', text : record.description }
                ]
            }
        ]
    }),

    /**
     * State periods from the shift start up to `now`, merged when consecutive periods share a status. Blocked time
     * wins over batches, time without a batch is idle
     * @returns {{ status : String, start : Number, end : Number }[]}
     */
    shiftSegments = (resource, from, now) => {
        const
            spans = [
                ...resource.timeRanges.map(range => ({ start : range.startDate.getTime(), end : range.endDate.getTime(), status : range.state === 'down' ? 'down' : 'sched', block : true })),
                ...resource.events.map(event => ({
                    start  : event.startDate.getTime(),
                    end    : event.endDate.getTime(),
                    status : event.liveStatus
                }))
            ],
            points   = [...new Set([from, now, ...spans.flatMap(({ start, end }) => [start, end])])]
                .filter(time => time >= from && time <= now).sort((a, b) => a - b),
            segments = [];

        for (let i = 1; i < points.length; i++) {
            const
                start  = points[i - 1],
                end    = points[i],
                active = spans.filter(span => span.start <= start && span.end >= end),
                status = (active.find(span => span.block) || active[0])?.status || 'sched',
                last   = segments.at(-1);

            if (last?.status === status) {
                last.end = end;
            }
            else {
                segments.push({ status, start, end });
            }
        }

        return segments;
    },

    /**
     * Shift cell: state and OEE on the first line, the shift strip below
     */
    renderShift = ({ record, grid }) => {
        const
            now               = grid.simNow,
            { shift }         = grid.scenario,
            from              = new Date(shift.start).getTime(),
            to                = new Date(shift.end).getTime(),
            length            = to - from,
            { state, status } = stationState(record, now),
            oee               = stationOee(record, now, from),
            low               = oee !== null && oee < oeeTarget,
            filled            = Math.min(now, to),
            segments          = shiftSegments(record, from, filled),
            // Shift time still to come, the empty track after now
            rest              = filled < to ? [{ status : 'rest', start : filled, end : to }] : [];

        return {
            class    : { 'ev-shift' : 1, 'ev-flip' : grid.isFlipping(`r:${record.id}`) },
            children : [
                {
                    class    : 'ev-shift-line',
                    children : [
                        {
                            class    : `ev-shift-state ev-status-${status}`,
                            children : [
                                { tag : 'span', class : 'ev-shift-dot' },
                                { tag : 'span', text : state === 'running' ? runningLabel[status] : stateLabel[state] }
                            ]
                        },
                        {
                            class    : { 'ev-shift-oee' : 1, 'ev-oee-low' : low },
                            children : [
                                { tag : 'span', text : 'OEE' },
                                { tag : 'span', class : 'ev-shift-oee-value', text : oee === null ? '–' : `${oee}%` }
                            ]
                        }
                    ]
                },
                {
                    class    : 'ev-shift-strip',
                    // A 1px gap separates the segments, also the last state period from the empty track after now
                    children : [...segments, ...rest].map(({ status, start, end }, index, all) => ({
                        class : {
                            'ev-shift-segment'      : 1,
                            [`ev-status-${status}`] : status !== 'rest',
                            'ev-shift-rest'         : status === 'rest',
                            'ev-shift-segment-last' : index === all.length - 1
                        },
                        style : {
                            '--ev-from' : (start - from) / length,
                            '--ev-size' : (end - start) / length
                        }
                    }))
                }
            ]
        };
    };

/**
 * Column configs. The Shift header names the shift and its start, from the scenario
 */
export const stationColumns = (columnTitle, shift) => [
    {
        id       : 'primary',
        text     : columnTitle,
        field    : 'name',
        ...responsiveWidth(248, 150),
        cls      : 'ev-header ev-header-first',
        cellCls  : 'ev-resource-cell',
        renderer : renderStation
    },
    {
        id       : 'shift',
        text     : `${shift.name} · since ${formatTime(new Date(shift.start))}`,
        width    : 168,
        cls      : 'ev-header',
        cellCls  : 'ev-live-cell',
        renderer : renderShift,
        ...hiddenWhenSmall
    }
];
