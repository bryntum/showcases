import { formatMinutes, formatTime } from '../util/Time.js';
import { gpsText, loadIcons, loadText } from '../util/Status.js';

/**
 * The function renderers and value formatters of the shipment grid, for the cells which seldom change: the carrier,
 * the carrier group rows, the load type and the GPS state. They build plain DOM, setting text content only, so data
 * can not inject markup. The frequently updated cells have component renderers that refresh in place (StatusCell-,
 * EtaCell-, DockSlotCell- and TemperatureCellRenderer). Classes are styled in resources/grid.css.
 *
 * Learn more:
 * https://www.ag-grid.com/javascript-data-grid/component-cell-renderer/
 * https://www.ag-grid.com/javascript-data-grid/value-formatters/
 */

// A span with its classes, if any, and its children, nodes or text
function span(className, ...children) {
    const element = document.createElement('span');

    if (className) {
        element.className = className;
    }

    element.append(...children);

    return element;
}

// An icon by its classes, see Icons.js
function iconElement(className) {
    const element = document.createElement('i');

    element.className = className;
    element.setAttribute('aria-hidden', 'true');

    return element;
}

// The carrier logos (fictional), keyed by their file name, the lower case carrier code
const carrierLogos = Object.fromEntries(Object.entries(
    import.meta.glob('../../resources/carriers/*.svg', { eager : true, query : '?url', import : 'default' })
).map(([path, url]) => [path.match(/(\w+)\.svg$/)[1], url]));

// The carrier logo, decorative since the name follows it
function logoElement(code) {
    const element = document.createElement('img');

    element.className = 'lct-carrier-logo';
    element.src       = carrierLogos[code.toLowerCase()];
    element.alt       = '';

    return element;
}

// The carrier chip, its logo and name
function carrierChip(data, name) {
    const chip = span('lct-carrier', logoElement(data.carrierCode), span('lct-carrier-name', name));

    chip.title = data.carrier;

    return chip;
}

/**
 * Carrier chip: a swatch in the carrier's colour and its code, the name in the tooltip
 * @param {Object} params AG Grid cell renderer params
 * @returns {HTMLElement}
 */
export const renderCarrier = ({ data, value }) => carrierChip(data, value);

/**
 * The group row of a carrier: its chip, the shipments and pallets, and a pill with the late ones (aggregated)
 * @param {Object} params AG Grid group row inner renderer params
 * @returns {HTMLElement}
 */
export function renderCarrierGroup({ node, value }) {
    const
        { late = 0, pallets = 0 } = node.aggData ?? {},
        first                     = node.allLeafChildren[0].data,
        group                     = span('lct-carrier-group', carrierChip(first, value), span('lct-group-count',
            `${node.allChildrenCount.toLocaleString('en-US')} shipments · ${pallets.toLocaleString('en-US')} pallets`));

    if (late) {
        group.append(span('lct-pill lct-status-late', `${late} late`));
    }

    return group;
}

/**
 * Load type with its icon
 * @param {Object} params AG Grid cell renderer params
 * @returns {HTMLElement}
 */
export const renderLoad = ({ value }) =>
    span(`lct-load lct-load-${value}`, iconElement(loadIcons[value]), span('', loadText[value]));

/**
 * GPS state, a dot and its label
 * @param {Object} params AG Grid cell renderer params
 * @returns {HTMLElement}
 */
export function renderGps({ value }) {
    const dot = span('lct-gps-dot');

    dot.setAttribute('aria-hidden', 'true');

    return span(`lct-gps lct-gps-${value}`, dot, span('', gpsText[value]));
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
