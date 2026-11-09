// The Group feature is a Grid feature, importing the package registers it
import '@bryntum/grid-enterprise';
import { Scheduler } from '@bryntum/scheduler-enterprise';
import { StringHelper } from '@bryntum/core-enterprise';
import TripModel from '../model/TripModel.js';
import VesselModel from '../model/VesselModel.js';
import ForecastHeader from './ForecastHeader.js';
import { hoursText, renderDependency, renderGroup, renderRange, renderTrip, renderVessel } from './TripRendering.js';
import { duration, hhmm, toDate } from '../util/Time.js';

const
    // The trips' place in their 64px row: 7px above, 14px below, room for the dependency line to pass under a trip
    margins     = { start : 7, end : 14 },
    // The trip's head line above its legs, the NestedEvents feature's header
    headHeight  = 19,
    // The hours of the day share the width, down to this many px per hour, then the timeline scrolls
    minTick     = { wide : 50, phone : 44 },
    // The zoom steps, times the width that fits the day
    zoomSteps   = [1, 1.5, 2.25];

/**
 * The vessels and helicopters on the day's timeline, a Scheduler on the Enterprise tier:
 *
 * - Trips are parent events, their legs (transits and turbine stops) are child events drawn inside them by the
 *   NestedEvents feature (TripModel, TripRendering)
 * - A dependency runs from the HV isolation flown to the substation into the one stop that needs it, drawn by the
 *   Dependencies feature from a trip to a nested event
 * - The weather no-go of each vessel is a resource time range, from the hour the forecast crosses its limit
 * - The time axis carries the forecast: the wave height chart and the wind (ForecastHeader)
 * - The vessel column shows how much of the window left is booked, and the seats taken
 * - The shaded past and the now line are time ranges
 * - Trips are dragged along their own row only, not into the past and not once gone, their legs move with them
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/Scheduler
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/NestedEvents
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/Dependencies
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/ResourceTimeRanges
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/TimeRanges
 * https://bryntum.com/products/scheduler/docs/api/Grid/feature/Group
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/EventDrag#config-validatorFn
 */
export default class DispatchScheduler extends Scheduler {
    static $name = 'DispatchScheduler';

    static type = 'dispatchscheduler';

    static configurable = {
        // Nested events and their dependencies are Enterprise features
        tier : 'enterprise',

        /**
         * The dispatcher's state, the weather windows and the clock
         * @config {DispatchState}
         */
        dispatch : null,

        /**
         * `true` at phone widths: a narrow vessel column, the hours scroll
         * @prp {Boolean}
         */
        phone : false,

        /**
         * Index into the zoom steps, 0 fits the day to the width
         * @prp {Number}
         */
        zoomStep : 0,

        cls                       : 'ow-scheduler',
        rowHeight                 : 64,
        barMargin                 : 0,
        resourceMargin            : margins,
        // Fully custom bars
        eventStyle                : null,
        eventColor                : null,
        allowOverlap              : true,
        multiEventSelect          : false,
        zoomOnMouseWheel          : false,
        zoomOnTimeAxisDoubleClick : false,
        autoCreate                : false,
        useInitialAnimation       : false,

        features : {
            cellEdit           : false,
            cellMenu           : false,
            headerMenu         : false,
            timeAxisHeaderMenu : false,
            sort               : false,
            eventEdit          : false,
            eventMenu          : false,
            scheduleMenu       : false,
            eventResize        : false,
            eventDragCreate    : false,
            scheduleTooltip    : false,
            dependencyEdit     : false,
            dependencyMenu     : false,
            stickyEvents       : false,
            // The legs inside their trip, each at its own time, filling the trip under its head line
            nestedEvents       : {
                eventLayout             : 'none',
                headerHeight            : headHeight,
                resourceMargin          : 0,
                barMargin               : 0,
                constrainDragToParent   : true,
                allowNestingOnDrop      : false,
                allowDeNestingOnDrop    : false,
                showCreateGroupMenuItem : false
            },
            group              : { field : 'group', renderer : renderGroup },
            resourceTimeRanges : true,
            timeRanges         : {
                showHeaderElements  : true,
                showCurrentTimeLine : false,
                enableResizing      : false
            }
        }
    };

    construct(config) {
        const
            me     = this,
            header = new ForecastHeader(config.dispatch);

        me.forecastHeader = header;

        super.construct({
            ...config,
            viewPreset : {
                base              : 'hourAndDay',
                tickWidth         : 70,
                displayDateFormat : 'HH:mm',
                shiftUnit         : 'hour',
                shiftIncrement    : 1,
                timeResolution    : { unit : 'minute', increment : 5 },
                headers           : header.headers
            },
            columns : [{
                field          : 'name',
                text           : 'Vessel',
                width          : 214,
                cls            : 'ow-axis-header',
                cellCls        : 'ow-resource-cell',
                sortable       : false,
                groupable      : false,
                headerRenderer : () => header.labelHtml,
                renderer       : ({ record }) => me.renderVesselCell(record)
            }],
            project : {
                ...config.project,
                eventModelClass    : TripModel,
                resourceModelClass : VesselModel
            },
            eventRenderer             : args => renderTrip(args, me.dispatch.closeOf(args.eventRecord.trip.resource)),
            resourceTimeRangeRenderer : args => renderRange(args, range => me.dispatch.previousCloseOf(range.resource)),
            features                  : {
                ...config.features,
                // Along its own row, not into the past, not once gone or moved to tomorrow
                eventDrag : {
                    constrainDragToResource : true,
                    validatorFn             : context => me.validateTripDrag(context)
                },
                eventTooltip : {
                    template : ({ eventRecord }) => me.tripTip(eventRecord.trip)
                },
                // Drawn from the data, not created or removed by hand. Red when the plan breaks it
                dependencies : {
                    allowCreate     : false,
                    enableDelete    : false,
                    radius          : 4,
                    showTooltip     : true,
                    tooltipTemplate : dependency => StringHelper.encodeHtml(me.dependencyText(dependency)),
                    renderer        : args => renderDependency(args)
                }
            }
        });

        me.on({
            paint                  : 'onSchedulerPaint',
            timelineViewportResize : 'fitTicks',
            thisObj                : me
        });
    }

    doDestroy() {
        this.forecastHeader.destroy();
        this.tickObserver?.disconnect();
        super.doDestroy();
    }

    /**
     * The trips, the root events of the tree event store, without their legs
     * @property {TripModel[]}
     */
    get trips() {
        return this.eventStore.rootNode?.children ?? [];
    }

    // The text of a dependency in the data, by its ID
    dependencyText(dependency) {
        return this.dispatch.dependencies.find(({ id }) => id === dependency.id)?.text ?? '';
    }

    onSchedulerPaint() {
        const me = this;

        me.forecastHeader.attach(me);
        me.forecastHeader.refresh();

        // The hours share the width, also when the window or a panel changes size
        me.tickObserver ??= new ResizeObserver(() => me.fitTicks());
        me.tickObserver.observe(me.timeAxisSubGridElement);
        me.fitTicks();
    }

    // The Group feature runs the column renderer for its header rows too, they have no vessel to draw (renderGroup)
    renderVesselCell(vessel) {
        const state = this.dispatch;

        if (vessel.isSpecialRow || vessel.isGroupHeader || !state.limits[vessel.window]) {
            return '';
        }

        return renderVessel(vessel, {
            now   : state.now,
            close : state.closeOf(vessel),
            limit : state.limits[vessel.window]
        });
    }

    //region Width and zoom

    /**
     * The tick width: the day fits the width at zoom level 0, wider levels scroll, phones scroll at 44px an hour
     */
    fitTicks() {
        const
            me      = this,
            width   = me.timeAxisSubGridElement?.clientWidth,
            hours   = me.dispatch.day.dayEnd - me.dispatch.day.dayStart,
            minimum = me.phone ? minTick.phone : minTick.wide;

        if (!width || me.isDestroyed) {
            return;
        }

        const tick = Math.max(minimum, Math.floor(width / hours * zoomSteps[me.zoomStep]));

        if (tick !== me.tickSize) {
            me.tickSize = tick;
        }
    }

    updateZoomStep() {
        if (this.isPainted) {
            this.fitTicks();
        }
    }

    get lastZoomStep() {
        return zoomSteps.length - 1;
    }

    updatePhone(phone) {
        const me = this;

        me.rowHeight = phone ? 60 : 64;

        if (me.columns?.count) {
            me.columns.first.width = phone ? 118 : 214;
        }

        if (me.isPainted) {
            me.fitTicks();
        }
    }

    //endregion

    //region Data

    /**
     * The weather no-go of each vessel and the old place of trips brought forward, as resource time ranges
     */
    syncRanges() {
        const
            me            = this,
            state         = me.dispatch,
            end           = toDate(state.day.dayEnd * 60),
            nogo          = me.resourceStore.allRecords.filter(vessel => !vessel.isSpecialRow).map(vessel => ({
                id         : `nogo-${vessel.id}`,
                resourceId : vessel.id,
                startDate  : toDate(state.closeOf(vessel)),
                endDate    : end,
                name       : state.limits[vessel.window].noGo
            })),
            ghosts        = me.trips.filter(trip => trip.status === 'pulled').map(trip => ({
                id         : `ghost-${trip.id}`,
                resourceId : trip.resource?.id,
                startDate  : toDate(trip.was),
                endDate    : toDate(trip.was + trip.endMinute - trip.departs)
            }));

        me.resourceTimeRangeStore.removeAll();
        me.resourceTimeRangeStore.add([...nogo, ...ghosts.filter(ghost => ghost.startDate < end)]);
    }

    /**
     * The dependencies of the data whose ends are in the plan. A stop the forecast moves to tomorrow takes its
     * dependency with it, Undo brings the stop back and this the dependency
     */
    syncDependencies() {
        const
            { dependencyStore, eventStore } = this,
            missing                         = this.dispatch.dependencies
                .map(dependency => TripModel.dependencyData(dependency))
                .filter(({ id, fromEvent, toEvent }) => !dependencyStore.getById(id) &&
                    eventStore.getById(fromEvent) && eventStore.getById(toEvent));

        if (missing.length) {
            dependencyStore.add(missing);
        }
    }

    /**
     * The shaded past and the now line
     */
    syncNow() {
        const
            me             = this,
            state          = me.dispatch,
            now            = toDate(state.now),
            timeRangeStore = me.project.timeRangeStore;

        timeRangeStore.removeAll();
        timeRangeStore.add([
            { id : 'past', startDate : me.startDate, endDate : now, cls : 'ow-past' },
            { id : 'now', startDate : now, name : `Now ${hhmm(state.now)}`, cls : 'ow-now' }
        ]);
    }

    /**
     * Draws the state anew after the forecast or the plan changed: the vessel cells, the bars, the ranges, the header
     */
    refreshDispatch() {
        const me = this;

        me.syncRanges();
        me.syncNow();
        me.syncDependencies();
        me.refreshRows();
        me.forecastHeader.refresh();
    }

    //endregion

    //region Drag and tooltip

    validateTripDrag({ eventRecords, startDate }) {
        const
            trip  = eventRecords[0],
            now   = toDate(this.dispatch.now);

        if (trip.status === 'moved') {
            return { valid : false, message : `${trip.id} is moved to tomorrow` };
        }

        if (trip.departs <= this.dispatch.now) {
            return { valid : false, message : `${trip.id} has left port` };
        }

        if (startDate < now) {
            return { valid : false, message : 'Cannot leave port in the past' };
        }

        return true;
    }

    tripTip(trip) {
        const
            close = this.dispatch.closeOf(trip.resource),
            stops = trip.legs.filter(leg => leg.type === 'stop' && !leg.preview).map(leg =>
                StringHelper.xss`<dt>${leg.turbine}</dt><dd>${hhmm(leg.from)} – ${hhmm(leg.to)} · ${hoursText(leg.minutes)}</dd>`),
            back  = trip.endMinute;

        return `<div class="ow-tip">
            <header><b>${StringHelper.encodeHtml(trip.id)}</b> ${StringHelper.encodeHtml(trip.resource?.name ?? '')}</header>
            <dl>
                <dt>Leaves</dt><dd>${hhmm(trip.startMinute)}</dd>
                ${stops.join('')}
                <dt>Back</dt><dd>${hhmm(back)}, ${back > close ? `${duration(back - close)} after` : `${duration(close - back)} before`} the window closes at ${hhmm(close)}</dd>
            </dl>
        </div>`;
    }

    //endregion
}

DispatchScheduler.initClass();
