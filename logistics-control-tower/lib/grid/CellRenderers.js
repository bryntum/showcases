import { DomHelper } from '@bryntum/core-enterprise';
import { formatMinutes, formatTime, minuteMs } from '../util/Time.js';
import { gpsText, loadIcons, loadText, statusText } from '../util/Status.js';

/**
 * AG Grid cell renderers of the shipment grid, plain functions returning elements built with Bryntum's DomHelper (text
 * content, never HTML strings, so data can not inject markup). Classes are styled in resources/grid.css.
 *
 * Learn more:
 * https://www.ag-grid.com/javascript-data-grid/component-cell-renderer/
 * https://bryntum.com/products/scheduler/docs/api/Core/helper/DomHelper#function-createElement-static
 */

const element = config => DomHelper.createElement(config);

/**
 * Status pill
 * @param {Object} params AG Grid cell renderer params
 * @returns {HTMLElement}
 */
export function renderStatus({ value }) {
    return value ? element({ tag : 'span', class : `lct-pill lct-status-${value}`, text : statusText[value] }) : '';
}

/**
 * Carrier chip: a swatch in the carrier's colour and its code, the name in the tooltip
 * @param {Object} params AG Grid cell renderer params
 * @returns {HTMLElement}
 */
export function renderCarrier({ data, value }) {
    return data ? element(carrierChip(data, value)) : '';
}

// The carrier chip's DomConfig, its colour from the theme palette
const carrierChip = (data, name) => ({
    tag      : 'span',
    class    : 'lct-carrier',
    style    : `--lct-carrier: var(--b-color-${data.carrierColor})`,
    title    : data.carrier,
    children : [
        { tag : 'span', class : 'lct-carrier-code', text : data.carrierCode },
        { tag : 'span', class : 'lct-carrier-name', text : name }
    ]
});

/**
 * The group row of a carrier: its chip, the shipments, the pallets and the late ones (aggregated)
 * @param {Object} params AG Grid group cell inner renderer params
 * @returns {HTMLElement}
 */
export function renderCarrierGroup({ node, value }) {
    const
        first   = node.allLeafChildren?.[0]?.data,
        late    = node.aggData?.late ?? 0,
        pallets = node.aggData?.pallets ?? 0;

    return element({
        tag      : 'span',
        class    : 'lct-carrier-group',
        children : [
            first ? carrierChip(first, value) : { tag : 'span', text : value },
            { tag : 'span', class : 'lct-group-count', text : `${node.allChildrenCount} shipments` },
            { tag : 'span', class : 'lct-group-count', text : `${pallets.toLocaleString('en-US')} pallets` },
            late ? { tag : 'span', class : 'lct-group-late', text : `${late} late` } : null
        ]
    });
}

/**
 * Time to arrival relative to the simulated now (`context.now`), or the time since the truck arrived
 * @param {Object} params AG Grid cell renderer params
 * @returns {HTMLElement}
 */
export function renderCountdown({ data, context }) {
    if (!data) {
        return '';
    }

    const
        minutes = (data.eta - context.now) / minuteMs,
        arrived = minutes <= 0;

    if (data.status === 'done') {
        return element({ tag : 'span', class : 'lct-countdown lct-countdown-done', text : '—' });
    }

    return element({
        tag   : 'span',
        class : {
            'lct-countdown'        : 1,
            'lct-countdown-soon'   : !arrived && minutes <= 60,
            'lct-countdown-onsite' : arrived
        },
        text : arrived ? `on site ${formatMinutes(-minutes)}` : `in ${formatMinutes(minutes)}`
    });
}

/**
 * Dock slot badge: the door and the slot start, a warning when it breaches the due time, or the booking state
 * @param {Object} params AG Grid cell renderer params
 * @returns {HTMLElement}
 */
export function renderDockSlot({ data }) {
    if (!data) {
        return '';
    }

    if (!data.dockId) {
        return element({
            tag   : 'span',
            class : `lct-badge lct-badge-${data.onHold ? 'hold' : 'none'}`,
            text  : data.onHold ? 'On hold' : 'Unbooked'
        });
    }

    // The badge, then the conflict warning outside it, in a slot of its own so every badge has the same width
    return element({
        tag      : 'span',
        class    : 'lct-dock-slot',
        title    : data.slaBreach ? `Unloading ends after the due time, ${formatTime(data.dueBy)}` : null,
        children : [
            {
                tag      : 'span',
                class    : { 'lct-badge' : 1, 'lct-badge-booked' : 1, 'lct-badge-breach' : data.slaBreach },
                children : [
                    { tag : 'span', class : 'lct-badge-door', text : data.dockId },
                    { tag : 'span', text : formatTime(data.slotStart) }
                ]
            },
            {
                tag           : 'i',
                class         : { 'lct-dock-slot-warning' : 1, 'fa fa-triangle-exclamation' : data.slaBreach },
                'aria-hidden' : 'true'
            }
        ]
    });
}

/**
 * Load type with its icon
 * @param {Object} params AG Grid cell renderer params
 * @returns {HTMLElement}
 */
export function renderLoad({ value }) {
    return value ? element({
        tag      : 'span',
        class    : `lct-load lct-load-${value}`,
        children : [
            { tag : 'i', class : loadIcons[value], 'aria-hidden' : 'true' },
            { tag : 'span', text : loadText[value] }
        ]
    }) : '';
}

/**
 * Reefer temperature, flagged when more than 2 °C off its set point
 * @param {Object} params AG Grid cell renderer params
 * @returns {HTMLElement}
 */
export function renderTemperature({ data, value }) {
    if (value == null || !data) {
        return '';
    }

    return element({
        tag   : 'span',
        class : { 'lct-temp' : 1, 'lct-temp-off' : Math.abs(value - data.setpoint) > 2 },
        title : `Set point ${data.setpoint} °C`,
        text  : `${value.toFixed(1).replace('-', '−')} °C`
    });
}

/**
 * GPS state, a dot and its label
 * @param {Object} params AG Grid cell renderer params
 * @returns {HTMLElement}
 */
export function renderGps({ value }) {
    return value ? element({
        tag      : 'span',
        class    : `lct-gps lct-gps-${value}`,
        children : [
            { tag : 'span', class : 'lct-gps-dot', 'aria-hidden' : 'true' },
            { tag : 'span', text : gpsText[value] }
        ]
    }) : '';
}

/**
 * ETA delay, signed minutes
 * @param {Object} params AG Grid value formatter params
 * @returns {String}
 */
export const formatDelay = ({ value }) => value == null ? '' : formatMinutes(value, true);

/**
 * A timestamp as `HH:mm`
 * @param {Object} params AG Grid value formatter params
 * @returns {String}
 */
export const formatTimeValue = ({ value }) => formatTime(value);
