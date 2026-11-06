import { DomHelper } from '@bryntum/core-enterprise';
import { formatMinutes, formatTime, minuteMs } from '../util/Time.js';
import { gpsText, loadIcons, loadText, statusText } from '../util/Status.js';
import { icon } from '../util/Icons.js';

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
 * Status pill, a dot in the status colour and its text
 * @param {Object} params AG Grid cell renderer params
 * @returns {HTMLElement}
 */
export function renderStatus({ value }) {
    return value ? element({ tag : 'span', class : `lct-pill lct-status-${value}`, text : statusText[value] }) : '';
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
 * Carrier chip: a swatch in the carrier's colour and its code, the name in the tooltip
 * @param {Object} params AG Grid cell renderer params
 * @returns {HTMLElement}
 */
export function renderCarrier({ data, value }) {
    return data ? element(carrierChip(data, value)) : '';
}

/**
 * The group row of a carrier: its chip, the shipments and pallets, and a pill with the late ones (aggregated)
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
            {
                tag   : 'span',
                class : 'lct-group-count',
                text  : `${node.allChildrenCount.toLocaleString('en-US')} shipments · ${pallets.toLocaleString('en-US')} pallets`
            },
            late ? { tag : 'span', class : 'lct-pill lct-status-late', text : `${late} late` } : null
        ]
    });
}

/**
 * The ETA, and after it how long until the truck arrives relative to the simulated now (`context.now`), or how long
 * it has been on site
 * @param {Object} params AG Grid cell renderer params
 * @returns {HTMLElement}
 */
export function renderEta({ data, context }) {
    if (!data) {
        return '';
    }

    const
        minutes = (data.eta - context.now) / minuteMs,
        arrived = minutes <= 0;

    return element({
        tag      : 'span',
        class    : 'lct-eta',
        children : [
            { tag : 'span', class : 'lct-eta-time', text : formatTime(data.eta) },
            data.status === 'done' ? null : {
                tag   : 'span',
                class : { 'lct-eta-relative' : 1, 'lct-eta-soon' : !arrived && minutes <= 60 },
                text  : arrived ? `on site ${formatMinutes(-minutes)}` : `in ${formatMinutes(minutes)}`
            }
        ]
    });
}

/**
 * Dock slot badge: the door and the slot start, red with a warning when it breaches the due time, or the booking state
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

    return element({
        tag      : 'span',
        class    : { 'lct-badge' : 1, 'lct-badge-booked' : 1, 'lct-badge-breach' : data.slaBreach },
        title    : data.slaBreach ? `Unloading ends after the due time, ${formatTime(data.dueBy)}` : null,
        children : [
            `${data.dockId} · ${formatTime(data.slotStart)}`,
            data.slaBreach ? { tag : 'i', class : icon('warning'), 'aria-hidden' : 'true' } : null
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
 * Reefer temperature after a snowflake, an amber warning chip when it is more than 2 °C off its set point, nothing for
 * the loads which are not chilled
 * @param {Object} params AG Grid cell renderer params
 * @returns {HTMLElement}
 */
export function renderTemperature({ data, value }) {
    if (!data || value == null) {
        return '';
    }

    const off = Math.abs(value - data.setpoint) > 2;

    return element({
        tag      : 'span',
        class    : { 'lct-temp' : 1, 'lct-temp-off' : off },
        title    : `Set point ${data.setpoint} °C`,
        children : [
            { tag : 'i', class : icon(off ? 'warning' : 'snowflake'), 'aria-hidden' : 'true' },
            `${value.toFixed(1).replace('-', '−')} °C`
        ]
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
