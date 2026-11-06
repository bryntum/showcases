import { StringHelper } from '@bryntum/core-enterprise';
import DockPlanner from '../simulation/DockPlanner.js';
import { formatMinutes, formatTime, minuteMs } from '../util/Time.js';
import { loadIcons, statusText } from '../util/Status.js';
import { icon } from '../util/Icons.js';

// Above this share of door time booked an hour reads as overloaded
const busyShare = 0.9;

/**
 * The dock schedule's cells, bars and tooltip, plain functions.
 */

/**
 * The dock door column: an icon for its capability, the door name and its zone
 * @param {Object} renderData
 * @returns {Object} DomConfig
 */
export function renderDock({ record }) {
    return {
        class    : `lct-dock lct-load-${record.capability}`,
        children : [
            {
                class    : 'lct-dock-icon',
                children : [{ tag : 'i', class : loadIcons[record.capability], 'aria-hidden' : 'true' }]
            },
            {
                class    : 'lct-dock-text',
                children : [
                    { class : 'lct-dock-name', text : record.name },
                    { class : 'lct-dock-zone', text : record.zone }
                ]
            }
        ]
    };
}

/**
 * A slot bar: the load type (or the expedite bolt), the shipment number and below it the pallets, or the delay of a
 * truck at risk or late, or that it is waiting at the yard. Tinted by status, outlined dashed when it ends after its
 * due time (a conflict)
 * @param {Object} renderData
 * @returns {Object[]} DomConfig
 */
export function renderSlot({ eventRecord, renderData }) {
    const
        { status, loadType, expedited, pallets, name, delayMinutes, slaBreach } = eventRecord,
        // SHP-10044 reads 10044, the full reference is in the tooltip
        number = name.replace(/^\D+-/, '');

    Object.assign(renderData.cls, {
        'lct-slot'               : 1,
        [`lct-status-${status}`] : 1,
        'lct-slot-breach'        : slaBreach,
        'lct-slot-expedited'     : expedited
    });

    return [
        { tag : 'i', class : `lct-slot-icon ${expedited ? icon('lightning') : loadIcons[loadType]}`, 'aria-hidden' : 'true' },
        {
            class    : 'lct-slot-text',
            children : [
                { class : 'lct-slot-ref', text : number },
                { class : 'lct-slot-meta', text : slotMeta(status, pallets, delayMinutes) }
            ]
        }
    ];
}

// The second line of a slot bar
function slotMeta(status, pallets, delay) {
    if (status === 'late' || status === 'at-risk') {
        return formatMinutes(delay, true);
    }

    return status === 'yard' ? 'At yard' : `${pallets} plt`;
}

/**
 * The utilization strip, the Summary feature's renderer for one tick of the time axis: the share of the doors' time
 * booked in it, a slot and the turnaround after it, as a bar. Orange above 90%
 * @param {Object} context
 * @param {Date} context.startDate
 * @param {Date} context.endDate
 * @param {SlotModel[]} context.events The slots in the tick
 * @param {Scheduler.data.ResourceStore} context.resourceStore The doors
 * @returns {String} HTML
 */
export function renderUtilization({ startDate, endDate, events, resourceStore }) {
    const
        start    = startDate.getTime(),
        end      = endDate.getTime(),
        gap      = DockPlanner.TURNAROUND * minuteMs,
        booked   = events.reduce((sum, slot) =>
            sum + Math.max(0, Math.min(end, slot.plannedEnd + gap) - Math.max(start, slot.startDate.getTime())), 0),
        share    = Math.min(1, booked / ((end - start) * (resourceStore.count || 1))),
        percent  = Math.round(share * 100);

    return `<div class="lct-util-bar${share > busyShare ? ' lct-util-high' : ''}" style="block-size: ${percent}%" ` +
        `data-btip="${percent}% of door time booked, ${formatTime(startDate)} – ${formatTime(endDate)}"></div>`;
}

/**
 * The slot tooltip, the shipment behind it
 * @param {ShipmentModel} shipment
 * @param {SlotModel} slot
 * @returns {String} HTML, encoded
 */
export function slotTip(shipment, slot) {
    return StringHelper.xss`
        <div class="lct-tip">
            <header>
                <strong>${shipment.ref}</strong>
                <span class="lct-pill lct-status-${shipment.status}">${statusText[shipment.status]}</span>
            </header>
            <dl>
                <dt>Carrier</dt><dd>${shipment.carrier}</dd>
                <dt>From</dt><dd>${shipment.origin}</dd>
                <dt>Load</dt><dd>${shipment.pallets} pallets, ${shipment.loadType}</dd>
                <dt>ETA</dt><dd>${formatTime(shipment.eta)} (planned ${formatTime(shipment.plannedEta)})</dd>
                <dt>Slot</dt><dd>${formatTime(slot.startDate)} – ${formatTime(slot.plannedEnd)}</dd>
                <dt>Due by</dt><dd class="${slot.slaBreach ? 'lct-tip-breach' : ''}">${formatTime(slot.dueBy)}</dd>
            </dl>
        </div>`;
}
