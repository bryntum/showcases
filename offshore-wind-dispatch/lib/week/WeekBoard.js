import { Scheduler } from '@bryntum/scheduler-enterprise';
import VesselModel from '../model/VesselModel.js';
import VesselRangeModel from '../model/VesselRangeModel.js';
import WeekCellModel from './WeekCellModel.js';
import { dayOf, lateText, weekCells, weekDays } from './WeekCells.js';

const
    // One tick a day. The tick width is the least: Scheduler stretches the ticks to fill a wider view, below it the
    // week scrolls
    dayPreset = {
        base           : 'dayAndWeek',
        tickWidth      : 112,
        shiftUnit      : 'week',
        shiftIncrement : 1,
        timeResolution : { unit : 'day', increment : 1 }
    };

/**
 * The Week view, a read-only Scheduler with one cell per vessel per day. It has its own project of derived records
 * (WeekCells), redrawn from the Day view's project (`plan`) on its `dataReady` and on a new forecast, only while it
 * shows: a hidden board is drawn when shown again. A click on a day or a cell opens that day (`dayClick`).
 *
 * Learn more:
 * https://bryntum.com/docs/api/Scheduler/view/Scheduler#config-fillTicks
 * https://bryntum.com/docs/api/Scheduler/feature/PercentBar
 */
export default class WeekBoard extends Scheduler {
    static $name = 'WeekBoard';

    static type = 'weekboard';

    static configurable = {
        /**
         * @config {DispatchState}
         */
        dispatch : null,

        /**
         * The Day view's project, whose event store holds the trips of the whole week
         * @config {Scheduler.model.ProjectModelEnterprise}
         */
        plan : null,

        /**
         * @prp {Boolean}
         */
        phone : false,

        /**
         * The cell a team is held over (cellAt), tinted as the drop target
         * @prp {Object}
         */
        dropCell : null,

        cls                       : 'ow-week-board',
        rowHeight                 : 64,
        barMargin                 : 0,
        resourceMargin            : 5,
        fillTicks                 : true,
        // A cell is a card styled by its own CSS (week.css), no event style
        eventStyle                : null,
        eventColor                : null,
        zoomOnMouseWheel          : false,
        zoomOnTimeAxisDoubleClick : false,
        autoCreate                : false,
        useInitialAnimation       : false,
        // The engine's calculations here take moments: no progress bar under the header
        projectProgressReporting  : null,
        multiEventSelect          : false,

        // The cells and the free days are derived anew on each change of the plan (draw): `syncDataOnLoad` updates
        // the records that stay instead of replacing them
        project : {
            resourceModelClass          : VesselModel,
            eventModelClass             : WeekCellModel,
            resourceTimeRangeModelClass : VesselRangeModel,
            eventStore                  : { syncDataOnLoad : true },
            resourceTimeRangeStore      : { syncDataOnLoad : true }
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
            // The summary row's label, the time axis has the values
            summaries : [{ sum : () => 0, renderer : () => 'Jobs · planned / due' }]
        }],

        // Called with the board as `this`
        eventRenderer(args) {
            return this.renderCell(args);
        },

        resourceTimeRangeRenderer(args) {
            return this.renderFree(args);
        },

        // A read-only board: a click opens the day, the plan is changed in the Day view
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
            // No feature, so no terminals to draw new ones
            dependencies       : false,
            eventTooltip       : false,
            scheduleTooltip    : false,
            stickyEvents       : false,
            resourceTimeRanges : true,
            // The seats used
            percentBar         : { allowResize : false, showPercentage : false }
        }
    };

    construct(config) {
        const
            me           = this,
            { dispatch } = config;

        me.days = [];

        // The day header and summary renderers call this board's methods, so they are set here, where `me` exists
        super.construct({
            ...config,
            startDate  : dispatch.dateOf(0),
            endDate    : dispatch.dateOf(7),
            viewPreset : {
                ...dayPreset,
                headers : [{ unit : 'day', align : 'start', renderer : (start, end, cell) => me.renderDay(start, cell) }]
            },
            resources : dispatch.vessels,
            features  : {
                ...config.features,
                summary : { summaries : [{ label : 'Jobs per day', renderer : ({ startDate }) => me.jobsText(startDate) }] }
            }
        });

        dispatch.on({ change : 'onPlanChange', buffer : 1, thisObj : me });
        me.on({
            // Drawn when shown, if the plan changed while it was hidden
            show                : 'onPlanChange',
            eventClick          : ({ eventRecord }) => me.openDay(eventRecord.day),
            scheduleClick       : ({ date }) => me.openDay(dayOf(me.dispatch, date)),
            timeAxisHeaderClick : ({ startDate }) => me.openDay(dayOf(me.dispatch, startDate)),
            thisObj             : me
        });
    }

    updatePlan(plan) {
        this.detachListeners('plan');
        plan?.on({ name : 'plan', dataReady : 'onPlanChange', buffer : 1, thisObj : this });
    }

    onPlanChange() {
        const me = this;

        if (!me.isDestroyed && me.isVisible && me.plan) {
            me.draw(me.plan.eventStore.rootNode.children ?? []);
        }
    }

    updatePhone(phone) {
        if (this.columns?.count) {
            this.columns.first.width = phone ? 118 : 168;
        }
    }

    // Repaints the rows of the cell held over and the one left, for the drop target's tint (renderFree)
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
     * @param {TripModel[]} trips The trips of the whole week
     */
    draw(trips) {
        const
            me                 = this,
            { dispatch }       = me,
            { events, ranges } = weekCells(dispatch, dispatch.vessels, trips);

        me.days = weekDays(dispatch, trips);
        me.eventStore.data = events;
        me.resourceTimeRangeStore.data = ranges;
        // The header and the summary show the days' forecasts and counts, which data changes do not redraw
        me.timeAxisColumn.refreshHeader();
        me.features.summary.refresh();
    }

    /**
     * The free cell (a vessel's day without a trip) under a point in the viewport. The same object for the same cell,
     * so the drag sees it is still over it
     * @param {{x: Number, y: Number}} point
     * @returns {Object|null} `{ isWeekCell, id, vesselId, day, kind }`, `id` the day's resource time range
     */
    cellAt({ x, y }) {
        const
            me      = this,
            element = document.elementFromPoint(x, y),
            // Not the vessel column
            inDays  = element && me.timeAxisSubGridElement.contains(element),
            vessel  = inDays ? me.resolveResourceRecord(element, [x, y]) : null,
            date    = vessel && me.getDateFromCoordinate(x, null, false),
            day     = date ? dayOf(me.dispatch, date) : -1,
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

    renderDay(startDate, cell) {
        const
            day   = this.days?.[dayOf(this.dispatch, startDate)],
            today = day?.index === 0;

        cell.headerCellCls = `ow-week-day${today ? ' ow-week-today' : ''}`;

        if (!day) {
            return '';
        }

        const
            date = startDate.toLocaleDateString('en-GB', { weekday : 'short', day : 'numeric' }).replace(',', ''),
            [lo, hi] = day.hs;

        return `<span class="ow-week-date">${date}</span>` +
            `<span class="ow-pill ow-sea${day.sea.tone === 'none' ? ' ow-pill-neutral' : ''}">${day.sea.text}</span>` +
            // Two spans, so a narrow column wraps before the wind
            `<small><span>Hs ${lo.toFixed(1)}–${hi.toFixed(1)} m</span> · <span>wind ${day.wind}</span></small>`;
    }

    renderCell({ eventRecord : cell, renderData }) {
        const late = cell.late > 0 ? lateText(cell.late) : null;

        renderData.cls['ow-cell']         = 1;
        renderData.cls['ow-cell-late']    = cell.late > 0;
        renderData.cls['ow-cell-heli']    = cell.resource?.mode === 'heli';
        renderData.cls['ow-cell-carried'] = cell.carried;
        // Inset into the day like a free day's placeholder (week.css)
        renderData.wrapperCls['ow-cell-wrap'] = 1;

        return [
            {
                class    : 'ow-cell-head',
                children : [{ tag : 'b', text : cell.name }, { tag : 'span', text : `${cell.pax}/${cell.seats}` }]
            },
            {
                class : 'ow-cell-jobs',
                text  : [late, cell.turbines].filter(Boolean).join(' · ')
            }
        ];
    }

    // A free or no-go day. The classes go on the range's own element, its `wrapperCls`
    renderFree({ resourceTimeRangeRecord : range, renderData }) {
        renderData.wrapperCls[`ow-week-${range.kind}`] = 1;
        renderData.wrapperCls['ow-week-drop']          = this.dropCell?.id === range.id;

        return range.name;
    }

    jobsText(startDate) {
        const day = this.days?.[dayOf(this.dispatch, startDate)];

        return day ? `${day.planned} / ${day.due}` : '';
    }

    //endregion
}

WeekBoard.initClass();
