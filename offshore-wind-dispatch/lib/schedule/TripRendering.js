import { windowShare } from '../plan/Planner.js';
import { portMinutes } from '../plan/Farm.js';
import { iconConfig } from '../util/Icons.js';
import { duration, hhmm, nextDay, toMinutes } from '../util/Time.js';

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

const
    // Where tomorrow's work starts, the first sailing
    firstSailing = 6 * 60 + 30,
    // A departure this close to the start of the timeline, px, has no room for its time (11px) before its dot
    edgeRoom     = 44,
    // A work block's text: 12px, its padding each side and the gap between turbine and hours
    blockFont    = { char : 7, padding : 6, gap : 6 };

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
export function blockText({ turbine, minutes }, width, type = '') {
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
export function hoursText(minutes) {
    return `${Number((minutes / 60).toFixed(2))} h`;
}

/**
 * What changed, after the trip's label: set by a forecast. Past its window needs no word here, the sail back says it
 * @param {TripModel} trip
 * @returns {String|null}
 */
function changeText(trip) {
    return {
        trimmed : () => `${trip.removed.join(', ')} → ${nextDay}`,
        moved   : () => `moved to ${nextDay} ${hhmm(firstSailing)}`,
        pulled  : () => `${duration(trip.was - trip.startMinute)} earlier`
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
        back      = !isTransit && leg.endDate ? toMinutes(leg.endDate) + portMinutes(leg.turbine, leg.mode) : 0;

    cls['ow-seg']         = 1;
    cls['ow-seg-hop']     = isTransit;
    cls['ow-seg-stop']    = !isTransit;
    cls['ow-seg-risk']    = !isTransit && !leg.preview && leg.trip.status === 'at-risk' && back > close;
    cls['ow-seg-preview'] = leg.preview;

    if (isTransit) {
        return '';
    }

    // Bryntum's tonal event style, tuned by its variables (resources/schedule/legs.css)
    cls['b-style-tonal'] = 1;

    const
        type = typeOf(leg.turbine),
        fits = blockText(leg, renderData.width, type);

    return [
        // Too short for its name: it is set just under the block, quiet (resources/schedule/legs.css)
        { tag : 'b', class : fits.turbine ? null : 'ow-seg-name', text : leg.turbine },
        fits.type ? { tag : 'span', class : 'ow-seg-type', text : type } : null,
        fits.hours ? { tag : 'span', class : 'ow-seg-hours', text : hoursText(leg.minutes) } : null
    ];
}

/**
 * A trip, or one of its legs. The trip is the time on station, from its first stop to its last: its label above the
 * line, the NestedEvents feature adds the legs on the line. The sail out and back are its buffer (renderBuffers). The
 * label starts over the departure: its margin is the sail out, as a share of the trip's own width
 * @param {Object} renderData The event renderer's arguments
 * @param {Number} close When the trip's window closes
 * @param {Function} typeOf The short job type of a turbine, "Service"
 * @returns {Object[]|String} DomConfigs
 */
export function renderTrip({ eventRecord, renderData }, close, typeOf) {
    if (eventRecord.isLeg) {
        return renderLeg(eventRecord, renderData, close, typeOf);
    }

    const
        trip          = eventRecord,
        { out, back } = trip.transits,
        onStation     = Math.max(1, toMinutes(trip.endDate) - toMinutes(trip.startDate)),
        late          = trip.endMinute - close,
        change        = changeText(trip);

    renderData.cls['ow-trip']                = 1;
    renderData.cls[`ow-trip-${trip.status}`] = 1;
    renderData.cls['ow-trip-heli']           = trip.mode === 'heli';
    renderData.cls['ow-trip-drop']           = trip.hasPreview;
    renderData.cls['ow-trip-fits']           = trip.dropFit;

    // NestedEvents places the legs from the start of the trip's wrapper, which with a buffer is the departure, not
    // the trip's start: the legs' container is shifted back by the sail out (resources/schedule/trips.css)
    renderData.wrapperStyle += `--ow-pre:${renderData.bufferBeforeWidth ?? 0}px;`;

    // Where the window closes in the sail back, for its late part (resources/schedule/transit.css)
    if (late > 0 && back) {
        renderData.wrapperStyle += `--ow-late-from:${Math.max(0, Math.min(100, (back - late) / back * 100))}%;`;
    }

    return {
        class    : 'ow-trip-head',
        style    : `margin-inline-start:${-out / onStation * 100}%`,
        children : [
            {
                tag  : 'span',
                text : [trip.id, trip.teamText, `${trip.pax} pax`, trip.note?.toLowerCase()]
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
 * legs in order are the engine's business and not drawn. It turns orange where the engine cannot resolve it in the
 * weather: the stop still starts before the trip is done (and its lag over), or the wait brings the stop's trip back
 * after its window. Hidden while the stop's trip is moved to tomorrow
 * @param {Object} args The Dependencies feature's renderer arguments
 * @param {Function} isChain Tells the links between legs from the dependencies of the plan
 */
export function renderDependency({ domConfig, dependencyRecord }, isChain) {
    const { fromEvent, toEvent } = dependencyRecord;

    if (isChain(dependencyRecord)) {
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
 * The limit a vessel works to, short: "Hs ≤ 1.5", "wind ≤ 20"
 * @param {Object} limit `{ hs }` or `{ wind }`
 * @returns {String}
 */
function limitText(limit) {
    return limit.hs == null ? `wind ≤ ${limit.wind}` : `Hs ≤ ${limit.hs.toFixed(1)}`;
}

/**
 * The vessel column: its name, and one muted line with its type, its limit, and the most people on board of its trips
 * against its seats, "CTV · Hs ≤ 1.5 · 3/12". How much of what is left of its window its trips book is in the title
 * @param {VesselModel} vessel
 * @param {Object} options `{ now, close, limit }`
 * @returns {Object} DomConfig
 */
export function renderVessel(vessel, { now, close, limit }) {
    const
        // Its trips, not their legs, which are assigned to it too
        trips = vessel.events.filter(trip => !trip.isLeg && trip.status !== 'moved'),
        spans = trips.map(trip => ({ start : trip.startMinute, end : trip.endMinute })),
        share = Math.round(windowShare(spans, now, close) * 100),
        pax   = trips.reduce((most, trip) => Math.max(most, trip.pax), 0);

    return {
        class    : `ow-resource ow-resource-${vessel.mode}`,
        children : [
            iconConfig(vessel.glyph, 'ow-resource-icon'),
            {
                class    : 'ow-resource-text',
                children : [
                    { tag : 'b', text : vessel.name },
                    {
                        tag   : 'small',
                        // The full type, "AW169 · hoist", the line has its first word
                        title : `${vessel.kind}: ${pax} of ${vessel.seats} seats taken, ${share}% of the weather ` +
                            'window left today is booked',
                        text : `${vessel.kind.split(' · ')[0]} · ${limitText(limit)} · ${pax}/${vessel.seats}`
                    }
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

    const count = groupRecords.filter(record => !record.isSpecialRow && !record.isGroupHeader).length;

    return { class : 'ow-group', text : `${groupRowFor === 'heli' ? 'Helicopters' : 'Vessels'} · ${count}` };
}

/**
 * The resource time ranges: the weather no-go of a vessel, hatched from the time its own limit is crossed, the wave
 * height chart and the wind above say why, and the old place of a trip the forecast brought forward (`ow-ghost`).
 * Neither has a label
 * @param {Object} args The ResourceTimeRanges feature's renderer arguments
 * @returns {String}
 */
export function renderRange({ resourceTimeRangeRecord : range, renderData }) {
    const isGhost = String(range.id).startsWith('ghost-');

    renderData.cls['ow-nogo']      = !isGhost;
    renderData.cls['ow-nogo-heli'] = !isGhost && range.resource?.mode === 'heli';
    renderData.cls['ow-ghost']     = isGhost;

    return '';
}
