import { portMinutes } from '../plan/Farm.js';
import { iconConfig } from '../util/Icons.js';
import { duration, hhmm } from '../util/Time.js';

/**
 * The Scheduler's cells and bars, plain functions returning DomConfigs, styled in resources/schedule/.
 *
 * A trip is a parent event over its time on station: its label above a thin line, its legs on the line, child events
 * the NestedEvents feature draws inside it, the turbine stops as solid work blocks. The sail out and back are its
 * buffer, drawn by the EventBuffer feature as the line with a dot and the clock time at each end. Blue carries the
 * plan, orange only the stop and the sail back past the weather window.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/mixin/SchedulerEventRendering#config-eventRenderer
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/NestedEvents
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/EventBuffer#config-renderer
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/Dependencies#config-renderer
 * https://bryntum.com/products/scheduler/docs/api/Grid/column/Column#config-renderer
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/ResourceTimeRanges
 * https://bryntum.com/products/scheduler/docs/api/Core/helper/DomHelper#typedef-DomConfig
 */

/*
 * The renderers decide what fits from these px sizes, so they follow the CSS: keep them in step with it
 */
const
    // A departure this close to the start of the timeline has no room for its clock time ("07:45" at 11px,
    // transit.css) and the dot before it: the time goes after the dot
    edgeRoom  = 44,
    // A work block's text (legs.css): about the average width of a 12px character, the block's
    // `--b-sch-event-padding-inline` each side and the content's gap between the turbine, the type and the hours
    blockFont = { char : 7, padding : 6, gap : 6 };

/**
 * About how wide a work block's text is, px
 * @param {String} text
 * @returns {Number}
 */
function textWidth(text) {
    return text.length * blockFont.char;
}

/**
 * What a work block of a width has room for, in the order it gives things up: the turbine, the job type after it, the
 * hours at the right. Its text never wraps nor is cut off
 * @param {Object} stop `{ turbine, minutes }`
 * @param {Number} width px
 * @param {String} [type] The short job type, "Service"
 * @returns {Object} `{ turbine, type, hours }` booleans
 */
function blockText({ turbine, minutes }, width, type = '') {
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

/**
 * "1.5 h", "1.25 h", "3 h"
 * @param {Number} minutes
 * @returns {String}
 */
function hoursText(minutes) {
    return `${Number((minutes / 60).toFixed(2))} h`;
}

/**
 * The teams on board as the trip is shown: "Team B", "Teams D, E", with the team of a stop previewed on it while a
 * team is dragged over it, "New trip" for a draft without teams
 * @param {TripModel} trip
 * @returns {String}
 */
export function teamText(trip) {
    const ids = [...new Set(trip.allStops.map(stop => stop.team))];

    if (ids.length === 1) {
        return trip.project?.teams?.get(ids[0])?.name ?? ids[0];
    }

    return ids.length ? `Teams ${ids.join(', ')}` : 'New trip';
}

/**
 * People on board as the trip is shown, with a previewed team: "5 pax"
 * @param {TripModel} trip
 * @returns {String}
 */
export function paxText(trip) {
    const ids = [...new Set(trip.allStops.map(stop => stop.team))];

    return `${ids.reduce((sum, id) => sum + (trip.project?.teams?.get(id)?.techs ?? 0), 0)} pax`;
}

/**
 * What changed, after the trip's label: set by a forecast. Past its window needs no word here, the sail back says it
 * @param {TripModel} trip
 * @param {Number} firstSailing When the next day's first trips sail, minutes since midnight
 * @param {String} nextDay The day after the one shown, "Tue"
 * @returns {String|null}
 */
function changeText(trip, firstSailing, nextDay) {
    return {
        trimmed : () => `${trip.removed.join(', ')} → ${nextDay}`,
        moved   : () => `moved to ${nextDay} ${hhmm(firstSailing)}`,
        pulled  : () => `${duration(trip.minutesOf(trip.previousDeparture) - trip.departs)} earlier`
    }[trip.status]?.() ?? null;
}

/**
 * A leg of a trip at sea, a nested event placed by the NestedEvents feature at its own time: a stop is a solid work
 * block with the turbine and the hours, a hop between two turbines is empty, the trip's line shows through it. A stop
 * the vessel cannot get back to port from before its window closes is at risk
 * @param {TripModel} leg
 * @param {Object} renderData
 * @param {Number} close When the trip's window closes
 * @param {Function} typeOf The short job type of a turbine, "Service"
 * @returns {Object[]|String} DomConfigs
 */
function renderLeg(leg, renderData, close, typeOf) {
    const
        { cls }   = renderData,
        isTransit = leg.kind === 'transit',
        back      = !isTransit && leg.endDate ? leg.minutesOf(leg.endDate) + portMinutes(leg.turbine, leg.mode) : 0,
        risk      = !isTransit && !leg.preview && leg.trip.status === 'at-risk' && back > close;

    cls['ow-seg']         = 1;
    cls['ow-seg-hop']     = isTransit;
    cls['ow-seg-stop']    = !isTransit;
    cls['ow-seg-risk']    = risk;
    cls['ow-seg-preview'] = leg.preview;

    if (isTransit) {
        return '';
    }

    const
        type = typeOf(leg.turbine),
        fits = blockText(leg, renderData.width, type);

    // Bryntum's tonal event style in the work blue, or the at-risk orange: its tint and its text from that colour,
    // tuned further by its variables (resources/schedule/legs.css)
    renderData.eventStyle = 'tonal';
    renderData.eventColor = risk ? 'var(--ow-c-risk-line)' : 'var(--ow-c-work)';
    // Too short for its name: the block grows to hold it (resources/schedule/legs.css)
    cls['ow-seg-narrow']  = !fits.turbine;

    return [
        { tag : 'b', text : leg.turbine },
        fits.type ? { tag : 'span', class : 'ow-seg-type', text : type } : null,
        fits.hours ? { tag : 'span', class : 'ow-seg-hours', text : hoursText(leg.minutes) } : null
    ];
}

/**
 * A trip, or one of its legs. The trip is the time on station, from its first stop to its last: its label above the
 * line, the NestedEvents feature adds the legs on the line. The sail out and back are its buffer (renderBuffers)
 * @param {Object} renderData The event renderer's arguments
 * @param {Object} options
 * @param {Number} options.close When the trip's window closes
 * @param {Number} options.sailOut How wide the trip's sail out is drawn, px
 * @param {Number} options.firstSailing When the next day's first trips sail, minutes since midnight
 * @param {String} options.nextDay The day after the one shown, "Tue"
 * @param {Boolean} options.dropFit A team is dragged and would fit on the trip
 * @param {Function} options.typeOf The short job type of a turbine, "Service"
 * @returns {Object[]|String} DomConfigs
 */
export function renderTrip({ eventRecord, renderData }, { close, sailOut, firstSailing, nextDay, dropFit, typeOf }) {
    if (eventRecord.isLeg) {
        return renderLeg(eventRecord, renderData, close, typeOf);
    }

    const
        trip   = eventRecord,
        change = changeText(trip, firstSailing, nextDay);

    renderData.cls['ow-trip']                = 1;
    // On the wrapper, which also holds the sail out and back (EventBuffer): the hover's outline goes round all of it
    renderData.wrapperCls['ow-trip-wrap']    = 1;
    renderData.wrapperCls['ow-trip-held']    = trip.hasPreview;
    renderData.cls[`ow-trip-${trip.status}`] = 1;
    renderData.cls['ow-trip-heli']           = trip.mode === 'heli';
    renderData.cls['ow-trip-drop']           = trip.hasPreview;
    renderData.cls['ow-trip-fits']           = dropFit;

    // NestedEvents places the legs from the start of the trip's wrapper, which with a buffer is the departure, not
    // the trip's start: the legs' container is shifted back by the sail out, and the label starts over the departure
    // (resources/schedule/trips.css)
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
 * The sail out and back, the EventBuffer feature's preamble and postamble: a thin line with a dot at each end and the
 * clock time beyond it. A trip back after its window ends its line in a tag with the time and how late it is
 * @param {Object} args The EventBuffer feature's renderer arguments
 * @param {Number} close When the trip's window closes
 * @param {Object} timeline `{ dayStart, perMinute }`: when the timeline starts, minutes, and its px a minute. A
 * departure too close to the start has its time after its dot
 */
export function renderBuffers({ eventRecord : trip, preambleConfig, postambleConfig }, close, { dayStart, perMinute }) {
    const
        back = trip.endMinute,
        late = back - close,
        edge = (trip.departs - dayStart) * perMinute < edgeRoom;

    preambleConfig.cls  = `ow-transit ow-transit-out${edge ? ' ow-transit-edge' : ''}`;
    preambleConfig.text = hhmm(trip.departs);

    postambleConfig.cls  = `ow-transit ow-transit-back${late > 0 && trip.status !== 'moved' ? ' ow-transit-late' : ''}`;
    postambleConfig.text = late > 0 && trip.status !== 'moved' ? `${hhmm(back)} · +${duration(late)}` : hhmm(back);
}

/**
 * The dependency of the plan, drawn by the Dependencies feature from a trip into a stop of another trip: a thin line
 * with an arrowhead, which may cross rows, its tooltip names what the stop waits for. The links that keep a trip's
 * legs in order (PlanDependencyModel#isChain) are the engine's business and not drawn. It turns orange where the
 * engine cannot resolve it in the weather: the stop still starts before the trip is done (and its lag over), or the
 * wait brings the stop's trip back after its window. Hidden while the stop's trip is moved to tomorrow
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
    domConfig.class['ow-dep-moved']  = toEvent?.trip.status === 'moved';
}

/**
 * The vessel column: its icon in a ring of the seats taken (the limit and the seats on its tooltip), its name, and its
 * type under it, "CTV"
 * @param {VesselModel} vessel
 * @param {Object} options `{ day, now, close, limit }`, `day` the day shown
 * @returns {Object} DomConfig
 */
export function renderVessel(vessel, { day, close, limit }) {
    const
        // Its trips of the day shown, not their legs, which are assigned to it too
        trips = vessel.events.filter(trip => !trip.isLeg && trip.day === day && trip.status !== 'moved'),
        pax   = trips.reduce((most, trip) => Math.max(most, trip.pax), 0),
        // The seats taken, as a ring round the icon: orange when one of its trips is back after its window
        used  = vessel.seats ? Math.round(pax / vessel.seats * 100) : 0,
        risk  = trips.some(trip => trip.status === 'at-risk');

    return {
        class    : `ow-resource ow-resource-${vessel.mode}`,
        children : [
            {
                class       : `ow-resource-ring${risk ? ' ow-resource-ring-risk' : ''}`,
                style       : `--ow-use:${used}%`,
                // The limit and the seats on hover (Bryntum's own tooltip), the ring shows how full it is
                'data-btip' : `${vessel.kind} · ${limit.hs == null ? `wind up to ${limit.wind} m/s` :
                    `waves up to Hs ${limit.hs.toFixed(1)} m`} · ${pax} of ${vessel.seats} seats taken`,
                children : [iconConfig(vessel.glyph, 'ow-resource-icon')]
            },
            {
                class    : 'ow-resource-text',
                children : [
                    { tag : 'b', text : vessel.name },
                    // Just the type, "CTV", "SWATH", "AW169": the limit and the seats are on the ring's tooltip
                    { tag : 'small', text : vessel.vesselType }
                ]
            }
        ]
    };
}

/**
 * The group headers, "Vessels · 4" and "Helicopters · 2"
 * @param {Object} args The Group feature's renderer arguments
 * @returns {Object|String} DomConfig
 */
export function renderGroup({ groupRowFor, groupRecords, isFirstColumn }) {
    if (!isFirstColumn) {
        return '';
    }

    const count = groupRecords.filter(record => !record.isGroupHeader).length;

    return { class : 'ow-group', text : `${groupRowFor === 'heli' ? 'Helicopters' : 'Vessels'} · ${count}` };
}

/**
 * The resource time ranges (VesselRangeModel): the weather no-go of a vessel, hatched from the time its own limit is
 * crossed, the wave height chart and the wind above say why, and the old place of a trip the forecast brought forward
 * (`ghost`). Neither has a label. The classes go on the range's own element, its `wrapperCls`
 * @param {Object} args The ResourceTimeRanges feature's renderer arguments
 * @returns {String}
 */
export function renderRange({ resourceTimeRangeRecord : range, renderData }) {
    const
        { wrapperCls } = renderData,
        isGhost        = range.kind === 'ghost';

    wrapperCls['ow-nogo']      = !isGhost;
    wrapperCls['ow-nogo-heli'] = !isGhost && range.resource?.mode === 'heli';
    wrapperCls['ow-ghost']     = isGhost;

    return '';
}
