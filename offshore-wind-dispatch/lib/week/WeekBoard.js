import { Scheduler } from '@bryntum/scheduler-enterprise';
import VesselModel from '../model/VesselModel.js';
import VesselRangeModel from '../model/VesselRangeModel.js';
import WeekCellModel from './WeekCellModel.js';
import { dateOn, dayOf, lateText, weekCells, weekDays } from './WeekCells.js';

const
    // A day as one cell: the planning answer, not the times of the legs. The days share the width down to the tick
    // width, then the week scrolls: Scheduler stretches the ticks to fill a wider view
    dayPreset = {
        base           : 'dayAndWeek',
        tickWidth      : 112,
        shiftUnit      : 'week',
        shiftIncrement : 1,
        timeResolution : { unit : 'day', increment : 1 }
    };

/**
 * The Week view, the week as a day board: one cell per vessel per day, Mon 9 to Sun 15, a stock Scheduler tuned by
 * its configs:
 *
 * - A view preset of one tick a day, `fillTicks` so each vessel-day is one full cell, the seven days sharing the width
 *   down to a readable cell, then the week scrolls
 * - The vessels are the Day view's (VesselModel)
 * - One derived event per vessel and day with trips (WeekCellModel, WeekCells), so cells never stack: its times top
 *   left, its seats top right, its turbines, and the seats used as the PercentBar feature's thin bar. A day back after
 *   its window is orange with how late
 * - Whole-day resource time ranges for the days without trips (VesselRangeModel): `No-go`, hatched, or `Free` until
 *   the window closes,
 *   dashed, where a crew dragged from the tray plans a new trip (TeamDrag, DropPreview). The cell the crew is held
 *   over is tinted blue like the Day view's target trip (`dropCell`)
 * - A header row renderer per day: the date, the crew transfer vessels' sea state, the wave height and the wind
 * - The Summary feature: the jobs planned against the jobs due, per day
 *
 * A click on a day's header or on a cell opens the Day view on that date (`dayClick`).
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/Scheduler#config-fillTicks
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/preset/ViewPreset#config-headers
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/ResourceTimeRanges
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/Summary
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/PercentBar
 */
export default class WeekBoard extends Scheduler {
    static $name = 'WeekBoard';

    static type = 'weekboard';

    static configurable = {
        /**
         * The dispatcher's state, the week's forecasts and windows
         * @config {DispatchState}
         */
        dispatch : null,

        /**
         * `true` at phone widths: a narrow vessel column
         * @prp {Boolean}
         */
        phone : false,

        /**
         * The cell a crew from the tray is held over (see cellAt), tinted as the drop target, or `null`
         * @prp {Object}
         */
        dropCell : null,

        cls                       : 'ow-week-board',
        rowHeight                 : 64,
        barMargin                 : 0,
        resourceMargin            : 5,
        fillTicks                 : true,
        eventStyle                : null,
        eventColor                : null,
        zoomOnMouseWheel          : false,
        zoomOnTimeAxisDoubleClick : false,
        autoCreate                : false,
        useInitialAnimation       : false,
        // The engine's calculations here take moments: no progress bar under the header
        projectProgressReporting  : null,
        multiEventSelect          : false,

        features : {
            cellEdit           : false,
            cellMenu           : false,
            headerMenu         : false,
            timeAxisHeaderMenu : false,
            sort               : false,
            eventEdit          : false,
            eventMenu          : false,
            scheduleMenu       : false,
            eventDrag          : false,
            eventResize        : false,
            eventDragCreate    : false,
            // The board draws no dependencies: no feature, so no terminals to draw new ones
            dependencies       : false,
            eventTooltip       : false,
            scheduleTooltip    : false,
            stickyEvents       : false,
            resourceTimeRanges : true,
            // The seats used, a thin bar along the cell's foot
            percentBar         : { allowResize : false, showPercentage : false },
            summary            : {}
        }
    };

    construct(config) {
        const me = this;

        super.construct({
            ...config,
            startDate  : dateOn(0, 0),
            endDate    : dateOn(7, 0),
            viewPreset : {
                ...dayPreset,
                headers : [{
                    unit     : 'day',
                    align    : 'start',
                    renderer : (startDate, endDate, cell) => me.renderDay(startDate, cell)
                }]
            },
            columns : [{
                field          : 'name',
                text           : 'Sea state',
                width          : 168,
                cls            : 'ow-week-axis',
                cellCls        : 'ow-week-vessel',
                sortable       : false,
                groupable      : false,
                headerRenderer : () => '<b>Sea state</b><small>CTV window, Hs, wind</small>',
                renderer       : ({ record }) => [
                    { tag : 'b', text : record.name },
                    { tag : 'small', text : `${record.vesselType} · ${record.seats} pax` }
                ],
                // The summary row's label: the time axis has the values
                summaries : [{ sum : () => 0, renderer : () => 'Jobs · planned / due' }]
            }],
            project : {
                resourceModelClass          : VesselModel,
                eventModelClass             : WeekCellModel,
                resourceTimeRangeModelClass : VesselRangeModel,
                resources                   : config.dispatch.vessels,
                // Drawn again on each change of the plan (draw), records that stay are updated, not replaced
                eventStore                  : { syncDataOnLoad : true },
                resourceTimeRangeStore      : { syncDataOnLoad : true }
            },
            eventRenderer             : args => me.renderCell(args),
            resourceTimeRangeRenderer : args => me.renderFree(args),
            features                  : {
                ...config.features,
                summary : {
                    summaries : [{ label : 'Jobs per day', renderer : ({ startDate }) => me.jobsText(startDate) }]
                }
            }
        });

        me.days = [];
        me.on({
            eventClick          : ({ eventRecord }) => me.openDay(eventRecord.day),
            scheduleClick       : ({ date }) => me.openDay(dayOf(date)),
            timeAxisHeaderClick : ({ startDate }) => me.openDay(dayOf(startDate)),
            thisObj             : me
        });
    }

    updatePhone(phone) {
        if (this.columns?.count) {
            this.columns.first.width = phone ? 118 : 168;
        }
    }

    // The cell held over and the one left are drawn again, with or without the drop target's tint (renderFree)
    updateDropCell(cell, was) {
        const me = this;

        if (me.isVisible) {
            new Set([was?.vesselId, cell?.vesselId]).forEach(id => {
                const vessel = id != null && me.resourceStore.getById(id);

                vessel && me.repaintEventsForResource(vessel);
            });
        }
    }

    /**
     * Fired when a day's header or cell is clicked, to open the Day view on that date
     * @event dayClick
     * @param {Number} index 0 is today
     */
    openDay(index) {
        if (index >= 0 && index < 7) {
            this.trigger('dayClick', { index });
        }
    }

    /**
     * Draws the week from the trips of the whole week and the state's forecasts
     * @param {TripModel[]} trips
     */
    draw(trips) {
        const
            me                 = this,
            { dispatch }       = me,
            { events, ranges } = weekCells(dispatch, dispatch.vessels, trips);

        me.days = weekDays(dispatch, trips);
        me.eventStore.data = events;
        me.resourceTimeRangeStore.data = ranges;
        // The header and the summary show the days' forecasts and counts, which change with the plan
        me.timeAxisColumn.refreshHeader();
        me.features.summary.refresh();
    }

    /**
     * The cell a crew is dragged over: a vessel's day without a trip, by a point in the viewport. The same object for
     * the same cell, so the drag sees it is still over it
     * @param {{x: Number, y: Number}} point
     * @returns {Object|null} `{ isWeekCell, id, vesselId, day, kind }`, `id` the day's resource time range
     */
    cellAt({ x, y }) {
        const
            me      = this,
            element = document.elementFromPoint(x, y),
            // The vessel of the row under the point, in the days (not the vessel column)
            inDays  = element && me.timeAxisSubGridElement.contains(element),
            vessel  = inDays ? me.resolveResourceRecord(element, [x, y]) : null,
            date    = vessel && me.getDateFromCoordinate(x, null, false),
            day     = date ? dayOf(date) : -1,
            range   = vessel?.timeRanges.find(each => each.day === day);

        if (!range) {
            return null;
        }

        me.cells ??= new Map();

        const key = `${range.id}:${range.kind}`;

        if (!me.cells.has(key)) {
            me.cells.set(key, { isWeekCell : true, id : range.id, vesselId : vessel.id, day, kind : range.kind });
        }

        return me.cells.get(key);
    }

    //region Rendering

    // The day's header cell: the date, the sea state pill, the wave height and the wind
    renderDay(startDate, cell) {
        const
            day   = this.days?.[dayOf(startDate)],
            today = day?.index === 0;

        cell.headerCellCls = `ow-week-day${today ? ' ow-week-today' : ''}`;

        if (!day) {
            return '';
        }

        const
            date = startDate.toLocaleDateString('en-GB', { weekday : 'short', day : 'numeric' }).replace(',', ''),
            [lo, hi] = day.hs;

        return `<span class="ow-week-date">${date}${today ? ' · today' : ''}</span>` +
            `<span class="ow-sea ow-sea-${day.sea.tone}">${day.sea.text}</span>` +
            // Where the column is too narrow for one line, it wraps before the wind
            `<small><span>Hs ${lo.toFixed(1)}–${hi.toFixed(1)} m</span> · <span>wind ${day.wind}</span></small>`;
    }

    // A vessel's day with trips: its times top left, its seats top right, its turbines, and the seats bar
    renderCell({ eventRecord : cell, renderData }) {
        renderData.cls['ow-cell']      = 1;
        // Its wrapper inset into the day, as a free day's placeholder (week/board.css)
        renderData.wrapperCls['ow-cell-wrap'] = 1;
        renderData.cls['ow-cell-late'] = cell.late > 0;
        renderData.cls['ow-cell-heli'] = cell.resource?.mode === 'heli';

        return [
            {
                class    : 'ow-cell-head',
                children : [{ tag : 'b', text : cell.name }, { tag : 'span', text : `${cell.pax}/${cell.seats}` }]
            },
            {
                class : 'ow-cell-jobs',
                text  : cell.late > 0 ? `${lateText(cell.late)} · ${cell.turbines}` : cell.turbines
            }
        ];
    }

    // A vessel's day without trips: free until its window closes, or no-go. Tinted while a crew is held over it. The
    // classes go on the range's own element, its `wrapperCls`
    renderFree({ resourceTimeRangeRecord : range, renderData }) {
        renderData.wrapperCls[`ow-week-${range.kind}`] = 1;
        renderData.wrapperCls['ow-week-drop']          = this.dropCell?.id === range.id;

        return range.name;
    }

    // The summary of a day: the jobs planned against the jobs due
    jobsText(startDate) {
        const day = this.days?.[dayOf(startDate)];

        return day ? `${day.planned} / ${day.due}` : '';
    }

    //endregion
}

WeekBoard.initClass();
