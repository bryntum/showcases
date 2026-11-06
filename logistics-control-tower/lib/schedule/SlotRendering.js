import { StringHelper } from '@bryntum/core-enterprise';
import { formatTime } from '../util/Time.js';
import { loadIcons, statusText } from '../util/Status.js';

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
            { tag : 'i', class : `lct-dock-icon ${loadIcons[record.capability]}`, 'aria-hidden' : 'true' },
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
 * A slot bar: the load type (or the expedite bolt), the shipment reference, the carrier and the pallets. Coloured by
 * status, outlined when it breaches its due time (a conflict)
 * @param {Object} renderData
 * @returns {Object[]} DomConfig
 */
export function renderSlot({ eventRecord, renderData }) {
    const
        { status, loadType, expedited, carrierCode, pallets, name, slaBreach } = eventRecord,
        // SHP-10044 -> SHP- and 10044, narrow bars show the number only (see schedule.css)
        [, prefix = '', number = name] = /^(\D+-)?(.*)$/.exec(name);

    Object.assign(renderData.cls, {
        'lct-slot'               : 1,
        [`lct-status-${status}`] : 1,
        'lct-slot-breach'        : slaBreach,
        'lct-slot-expedited'     : expedited
    });

    return [
        {
            tag           : 'i',
            class         : `lct-slot-icon ${expedited ? 'fa fa-bolt' : loadIcons[loadType]}`,
            'aria-hidden' : 'true'
        },
        {
            class    : 'lct-slot-text',
            children : [
                {
                    class    : 'lct-slot-ref',
                    children : [{ tag : 'span', class : 'lct-slot-prefix', text : prefix }, number]
                },
                { class : 'lct-slot-meta', text : `${carrierCode} · ${pallets} plt` }
            ]
        }
    ];
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
