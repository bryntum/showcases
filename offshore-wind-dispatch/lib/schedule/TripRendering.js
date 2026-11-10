import { portMinutes } from '../plan/Farm.js';
import { iconConfig } from '../util/Icons.js';
import { clock, duration } from '../util/Time.js';

/**
 * The Day view's renderers: plain functions that fill in the renderer arguments and return DomConfigs, styled in
 * resources/schedule/. They are called by the DispatchScheduler with what they need from it (the window's close, px
 * sizes), so they hold no state.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/mixin/SchedulerEventRendering#config-eventRenderer
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/EventBuffer#config-renderer
 */

// The renderers decide what fits from these px sizes: keep them in step with trips.css
const
    // A departure this close to the start of the timeline has no room for its clock time ("07:45" at 11px) and the
    // dot before it: the time goes after the dot
    edgeRoom  = 44,
    // A work block's text: the average width of a 12px character, `--b-sch-event-padding-inline` each side and the
    // gap between the turbine, the type and the hours
    blockFont = { char : 7, padding : 6, gap : 6 };

// About how wide a work block's text is, px
function textWidth(text) {
    return text.length * blockFont.char;
}

/**
 * What a work block of a width has room for: short of room, the hours are dropped first, then the job type. The text
 * never wraps nor is cut
 * @param {TripModel} stop The stop's record, `turbine` and `duration` in minutes
 * @param {Number} width px
 * @param {String} [type] The short job type, "Service"
 * @returns {Object} `{ turbine, type, hours }` booleans
 */
function blockText({ turbine, duration : minutes }, width, type = '') {
    const
        room     = width - 2 * blockFont.padding,
        name     = textWidth(turbine),
        withType = type ? name + blockFont.gap + textWidth(type) : name,
        hours    = textWidth(hoursText(minutes));

    return {
        turbine : name <= room,
        type    : Boolean(type) && withType <= room,
        hours   : withType + blockFont.gap + hours <= room
    };
}

// "1.5 h", "1.25 h", "3 h"
function hoursText(minutes) {
    return `${Number((minutes / 60).toFixed(2))} h`;
}

/**
 * The teams on board: "Team B", "Teams D, E"
 * @param {TripModel} trip
 * @returns {String}
 */
export function teamText({ teamIds, project }) {
    return teamIds.length === 1 ? project?.teams?.get(teamIds[0])?.name ?? teamIds[0] : `Teams ${teamIds.join(', ')}`;
}

// People on board, "5 pax"
export function paxText(trip) {
    return `${trip.pax} pax`;
}

// What a forecast changed, after the trip's label. At risk needs no word, the sail back's tag says it
function changeText(trip) {
    return {
        trimmed : () => 'trimmed',
        carried : () => 'carried over',
        pulled  : () => `${duration((trip.previousDeparture - trip.outerStartDate) / 60_000)} earlier`
    }[trip.status]?.() ?? null;
}

/**
 * A leg, a nested event: a stop is a work block, a hop is empty so the trip's line shows through. A stop is at risk
 * when the vessel cannot get back to port from it before its window closes
 * @param {TripModel} leg
 * @param {Object} renderData
 * @param {Number} close When the trip's window closes, minutes since midnight
 * @param {Function} typeOf The short job type of a turbine, "Service"
 * @returns {Object[]|String} DomConfigs
 */
function renderLeg(leg, renderData, close, typeOf) {
    const
        { cls }   = renderData,
        isTransit = leg.kind === 'transit',
        back      = !isTransit && leg.endDate ? leg.minutesOf(leg.endDate) + portMinutes(leg.turbine, leg.mode) : 0,
        risk      = !isTransit && leg.trip.status === 'at-risk' && back > close;

    cls['ow-seg']      = 1;
    cls['ow-seg-hop']  = isTransit;
    cls['ow-seg-stop'] = !isTransit;
    cls['ow-seg-risk'] = risk;

    if (isTransit) {
        return '';
    }

    const
        type = typeOf(leg.turbine),
        fits = blockText(leg, renderData.width, type);

    // Bryntum's tonal style derives the tint and the text from this colour (tuned in trips.css)
    renderData.eventStyle = 'tonal';
    renderData.eventColor = risk ? 'var(--ow-c-risk-line)' : 'var(--ow-c-work)';
    // Too short for its name: the block grows to hold it (trips.css)
    cls['ow-seg-narrow']  = !fits.turbine;

    return [
        { tag : 'b', text : leg.turbine },
        fits.type ? { tag : 'span', class : 'ow-seg-type', text : type } : null,
        fits.hours ? { tag : 'span', class : 'ow-seg-hours', text : hoursText(leg.duration) } : null
    ];
}

/**
 * The event renderer, for a trip or one of its legs. A trip renders only its label, NestedEvents adds the legs
 * @param {Object} renderData The event renderer's arguments
 * @param {Object} options
 * @param {Number} options.close When the trip's window closes, minutes since midnight
 * @param {Number} options.sailOut How wide the trip's sail out is drawn, px
 * @param {Boolean} options.dropFit A team is dragged and would fit on the trip
 * @param {Boolean} options.held A team is held over the trip
 * @param {Function} options.typeOf The short job type of a turbine, "Service"
 * @returns {Object[]|String} DomConfigs
 */
export function renderTrip({ eventRecord, renderData }, { close, sailOut, dropFit, held, typeOf }) {
    if (eventRecord.isLeg) {
        return renderLeg(eventRecord, renderData, close, typeOf);
    }

    const
        trip   = eventRecord,
        change = changeText(trip);

    renderData.cls['ow-trip']                = 1;
    // On the wrapper, which also holds the buffer: the hover's outline goes round the sail out and back too
    renderData.wrapperCls['ow-trip-wrap']    = 1;
    renderData.wrapperCls['ow-trip-held']    = held;
    renderData.cls[`ow-trip-${trip.status}`] = 1;
    renderData.cls['ow-trip-heli']           = trip.mode === 'heli';
    renderData.cls['ow-trip-drop']           = held;
    renderData.cls['ow-trip-fits']           = dropFit;

    // NestedEvents places the legs from the start of the trip's wrapper, which with a buffer is the departure, not
    // the trip's start: trips.css shifts the legs' container back by the sail out's width, and starts the label over
    // the departure
    renderData.wrapperStyle += `--ow-pre:${sailOut}px;`;

    return {
        class    : 'ow-trip-head',
        children : [
            {
                tag  : 'span',
                text : [trip.id, teamText(trip), paxText(trip), trip.note?.toLowerCase()]
                    .filter(Boolean).join(' · ')
            },
            change ? { tag : 'span', class : 'ow-trip-change', text : change } : null
        ]
    };
}

/**
 * The EventBuffer feature's renderer: the clock time at each end of the sail out and back, and how late a trip back
 * after its window is
 * @param {Object} args The EventBuffer feature's renderer arguments
 * @param {Number} close When the trip's window closes, minutes since midnight
 * @param {Object} timeline `{ dayStart, perMinute }`: the timeline's start in minutes, and px per minute
 */
export function renderBuffers({ eventRecord : trip, preambleConfig, postambleConfig }, close, { dayStart, perMinute }) {
    const
        late = trip.endMinute - close,
        edge = (trip.departs - dayStart) * perMinute < edgeRoom;

    preambleConfig.cls  = `ow-transit ow-transit-out${edge ? ' ow-transit-edge' : ''}`;
    preambleConfig.text = clock(trip.outerStartDate);

    postambleConfig.cls  = `ow-transit ow-transit-back${late > 0 ? ' ow-transit-late' : ''}`;
    postambleConfig.text = late > 0 ? `${clock(trip.outerEndDate)} · +${duration(late)}` : clock(trip.outerEndDate);
}

/**
 * The Dependencies feature's renderer. The links that chain a trip's legs (PlanDependencyModel#isChain) are for the
 * engine and hidden. A plan dependency is broken (orange) when its stop starts before the trip it waits for is done
 * and its lag over, or when the wait brings the stop's trip back after its window
 * @param {Object} args The Dependencies feature's renderer arguments
 */
export function renderDependency({ domConfig, dependencyRecord }) {
    const { fromEvent, toEvent } = dependencyRecord;

    if (dependencyRecord.isChain) {
        domConfig.class['ow-dep-chain'] = 1;

        return;
    }

    const
        before = toEvent?.previousSibling,
        waits  = Boolean(before && toEvent.startDate > before.endDate),
        broken = Boolean(fromEvent?.endDate && toEvent?.startDate &&
            fromEvent.endDate.getTime() + (dependencyRecord.lag ?? 0) * 60_000 > toEvent.startDate.getTime()) ||
            (waits && toEvent.trip.status === 'at-risk');

    domConfig.class['ow-dep']        = 1;
    domConfig.class['ow-dep-broken'] = broken;
}

/**
 * The vessel column cell: its icon in a ring of the seats taken, its name and its type
 * @param {VesselModel} vessel
 * @param {Object} options `{ day, now, close, limit }`, `day` the day shown
 * @returns {Object} DomConfig
 */
export function renderVessel(vessel, { day, close, limit }) {
    const
        // Not the legs, which are assigned to the vessel too
        trips = vessel.events.filter(trip => !trip.isLeg && trip.day === day),
        pax   = trips.reduce((most, trip) => Math.max(most, trip.pax), 0),
        used  = vessel.seats ? Math.round(pax / vessel.seats * 100) : 0,
        risk  = trips.some(trip => trip.status === 'at-risk');

    return {
        class    : `ow-resource ow-resource-${vessel.mode}`,
        children : [
            {
                class       : `ow-resource-ring${risk ? ' ow-resource-ring-risk' : ''}`,
                style       : `--ow-use:${used}%`,
                'data-btip' : `${vessel.kind} · ${limit.hs == null ? `wind up to ${limit.wind} m/s` :
                    `waves up to Hs ${limit.hs.toFixed(1)} m`} · ${pax} of ${vessel.seats} seats taken`,
                children : [iconConfig(vessel.glyph, 'ow-resource-icon')]
            },
            {
                class    : 'ow-resource-text',
                children : [
                    { tag : 'b', text : vessel.name },
                    { tag : 'small', text : vessel.vesselType }
                ]
            }
        ]
    };
}

// The group headers, "Vessels · 4" and "Helicopters · 2"
export function renderGroup({ groupRowFor, groupRecords, isFirstColumn }) {
    if (!isFirstColumn) {
        return '';
    }

    const count = groupRecords.filter(record => !record.isGroupHeader).length;

    return { class : 'ow-group', text : `${groupRowFor === 'heli' ? 'Helicopters' : 'Vessels'} · ${count}` };
}

/**
 * The resource time ranges (VesselRangeModel): a vessel's weather no-go, the ghost of a trip brought forward, or the
 * outline of a held team's stop. None has a label. The classes go on the range's own element, its `wrapperCls`
 * @param {Object} args The ResourceTimeRanges feature's renderer arguments
 * @returns {String}
 */
export function renderRange({ resourceTimeRangeRecord : { kind, resource }, renderData : { wrapperCls } }) {
    wrapperCls['ow-nogo']         = kind === 'nogo';
    wrapperCls['ow-nogo-heli']    = kind === 'nogo' && resource?.mode === 'heli';
    wrapperCls['ow-ghost']        = kind === 'ghost';
    wrapperCls['ow-drop-outline'] = kind === 'drop';

    return '';
}
