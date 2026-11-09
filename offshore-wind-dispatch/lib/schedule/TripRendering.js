import { windowShare } from '../plan/Planner.js';
import { icon } from '../util/Icons.js';
import { duration, hhmm, nextDay } from '../util/Time.js';

/**
 * The Scheduler's cells and bars, plain functions returning DomConfigs, styled in resources/schedule.css.
 *
 * A trip is a parent event: its name, team and seats on top, then its legs, child events the NestedEvents feature
 * draws inside it, the transit legs hatched with the vessel's icon, the turbine stops solid with the turbine and hours.
 * Its colour says where it stands against the weather window: on plan, past the window, or changed by the forecast.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/view/mixin/SchedulerEventRendering#config-eventRenderer
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/NestedEvents
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/Dependencies#config-renderer
 * https://bryntum.com/products/scheduler/docs/api/Grid/column/Column#config-renderer
 * https://bryntum.com/products/scheduler/docs/api/Scheduler/feature/ResourceTimeRanges
 * https://bryntum.com/products/scheduler/docs/api/Core/helper/DomHelper#typedef-DomConfig
 */

const
    // Transit legs show the vessel's icon from this long, shorter ones (the hops between turbines) are a sliver
    iconMinutes = 25,
    // Stops show their hours from this long
    hoursMinutes = 50,
    // Where tomorrow's work starts, the first sailing
    firstSailing = 6 * 60 + 30;

/**
 * "1.5 h", "1.25 h", "3 h"
 * @param {Number} minutes
 * @returns {String}
 */
export function hoursText(minutes) {
    return `${Number((minutes / 60).toFixed(2))} h`;
}

/**
 * The badge after the trip's name: what is wrong or what changed
 * @param {TripModel} trip
 * @param {Number} close When the trip's window closes
 * @returns {Object|null} DomConfig
 */
function badge(trip, close) {
    const text = {
        'at-risk' : () => `${duration(trip.endMinute - close)} past window`,
        trimmed   : () => `${trip.removed.join(', ')} → ${nextDay}`,
        moved     : () => `Moved to ${nextDay} ${hhmm(firstSailing)}`,
        pulled    : () => `${duration(trip.was - trip.startMinute)} earlier`
    }[trip.status];

    return text ? { tag : 'span', class : `ow-badge ow-badge-${trip.status}`, text : text() } : null;
}

/**
 * A leg of a trip, a nested event placed by the NestedEvents feature at its own time: a transit hatched with the
 * vessel's icon, a stop solid with the turbine and the hours
 * @param {TripModel} leg
 * @param {Object} renderData
 * @returns {Object[]|String} DomConfigs
 */
function renderLeg(leg, renderData) {
    const
        { cls }   = renderData,
        isTransit = leg.kind === 'transit';

    cls['ow-seg']         = 1;
    cls['ow-seg-transit'] = isTransit;
    cls['ow-seg-hop']     = isTransit && leg.hop;
    cls['ow-seg-stop']    = !isTransit;
    cls['ow-seg-preview'] = leg.preview;

    if (isTransit) {
        return leg.minutes >= iconMinutes ? [{ class : 'ow-seg-icon', html : icon(leg.trip.resource?.glyph ?? 'ctv') }] : '';
    }

    return [
        { tag : 'b', text : leg.turbine },
        leg.minutes >= hoursMinutes ? { tag : 'small', text : hoursText(leg.minutes) } : null
    ];
}

/**
 * A trip bar, or one of its legs. The trip renders its head line, the NestedEvents feature adds the legs below it
 * @param {Object} renderData The event renderer's arguments
 * @param {Number} close When the trip's window closes
 * @returns {Object[]|String} DomConfigs
 */
export function renderTrip({ eventRecord, renderData }, close, now) {
    if (eventRecord.isLeg) {
        return renderLeg(eventRecord, renderData);
    }

    const trip = eventRecord;

    renderData.cls['ow-trip']                 = 1;
    renderData.cls[`ow-trip-${trip.status}`]  = 1;
    renderData.cls['ow-trip-heli']            = trip.mode === 'heli';
    renderData.cls['ow-trip-drop']            = trip.hasPreview;

    const
        underway = trip.startMinute <= now && trip.status !== 'moved',
        done     = Math.min(100, (now - trip.startMinute) / Math.max(1, trip.endMinute - trip.startMinute) * 100);

    renderData.cls['ow-trip-underway'] = underway;

    return [
        // The part behind the Now line
        underway ? { class : 'ow-underway', style : `width:${done}%` } : null,
        {
            class    : 'ow-trip-head',
            children : [
                { tag : 'b', text : trip.id },
                { tag : 'span', text : `${trip.teamText} · ${trip.pax} PAX` },
                badge(trip, close)
            ]
        }
    ];
}

/**
 * The dependency lines, drawn by the Dependencies feature. The links that keep a trip's legs in order are the engine's
 * business and not drawn. The one from a trip into a stop of another trip is grey while the engine resolves it, the
 * stop simply waits on station until the trip is back. It turns red where the engine cannot resolve it: the stop
 * still starts before the trip is back, or the wait brings the stop's trip back after its weather window. Hidden while
 * the stop's trip is moved to tomorrow
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
        broken = Boolean(fromEvent && toEvent && fromEvent.endDate > toEvent.startDate) ||
            (waits && toEvent.trip.status === 'at-risk');

    domConfig.class['ow-dep']        = 1;
    domConfig.class['ow-dep-broken'] = broken;
    domConfig.class['ow-dep-moved']  = toEvent?.trip.status === 'moved';
}

/**
 * The vessel column: its icon, name, type and limit, and how much of what is left of its weather window its trips use,
 * with the most people on board of its trips against its seats
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
            { class : 'ow-resource-icon', html : icon(vessel.glyph) },
            {
                class    : 'ow-resource-text',
                children : [
                    { tag : 'b', text : vessel.name },
                    { tag : 'small', text : `${vessel.kind} · ${limit.label}` },
                    {
                        class    : 'ow-util',
                        title    : `${share}% of the weather window left today is booked`,
                        children : [
                            { class : 'ow-util-bar', children : [{ tag : 'span', style : `width:${share}%` }] },
                            { class : 'ow-util-text', text : `${pax}/${vessel.seats} PAX` }
                        ]
                    }
                ]
            }
        ]
    };
}

/**
 * The group headers, Crew transfer vessels and Helicopters, with their count
 * @param {Object} args The Group feature's renderer arguments
 * @returns {Object|String} DomConfig
 */
export function renderGroup({ groupRowFor, groupRecords, isFirstColumn }) {
    if (!isFirstColumn) {
        return '';
    }

    const count = groupRecords.filter(record => !record.isSpecialRow && !record.isGroupHeader).length;

    return {
        class    : 'ow-group',
        children : [
            { tag : 'span', text : groupRowFor === 'heli' ? 'Helicopters' : 'Crew transfer vessels' },
            { tag : 'small', text : String(count) }
        ]
    };
}

/**
 * The resource time ranges: the weather no-go of a vessel, from the hour its limit is crossed, and the old place of a
 * trip the forecast brought forward (`ow-ghost`, no label)
 * @param {Object} args The ResourceTimeRanges feature's renderer arguments
 * @param {Function} wasOf Returns when the previous forecast closed a range's window, or nothing
 * @returns {Object|String} DomConfig
 */
export function renderRange({ resourceTimeRangeRecord : range, renderData }, wasOf) {
    const
        isGhost = String(range.id).startsWith('ghost-'),
        heli    = range.resource?.mode === 'heli',
        was     = wasOf(range);

    renderData.cls['ow-nogo']  = !isGhost;
    renderData.cls['ow-ghost'] = isGhost;

    if (isGhost) {
        return '';
    }

    return {
        class    : 'ow-nogo-label',
        children : [
            { tag : 'span', class : 'ow-nogo-icon', html : icon(heli ? 'wind' : 'waves') },
            { tag : 'span', text : range.name },
            was == null ? null : { tag : 'small', text : `was ${hhmm(was)}` }
        ]
    };
}
