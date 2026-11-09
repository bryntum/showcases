import { StringHelper } from '@bryntum/core-enterprise';
import { icon } from './util/Icons.js';

/**
 * The title bars above the schedule and the map and the legend, as HTML. Their buttons carry a `data-action` that
 * DispatchApp#onAction handles. The phone tabs are a Bryntum TabPanel (DispatchApp#updatePhone).
 */

const pressed = on => on ? ' class="ow-pressed" aria-pressed="true"' : ' aria-pressed="false"';

/**
 * The schedule's title, the next forecast's button and the zoom
 * @param {Object} options
 * @param {Object[]} options.vessels The vessels of the data, `{ mode }`
 * @param {Object} [options.next] The next forecast, `{ issued }`
 * @param {Number} options.zoomStep
 * @param {Number} options.lastZoomStep
 * @returns {String}
 */
export function scheduleBarHtml({ vessels, next, zoomStep, lastZoomStep }) {
    const
        boats = vessels.filter(vessel => vessel.mode === 'vessel').length,
        helis = vessels.length - boats,
        knob  = (action, label, text, enabled) =>
            `<button type="button" data-action="${action}" aria-label="${label}"${enabled ? '' : ' disabled'}>${text}</button>`;

    return `
        <span class="ow-panel-title">Vessels &amp; helicopters <small>${boats} CTV · ${helis} heli</small></span>
        ${next ? `<button type="button" class="ow-forecast-button" data-action="forecast">
            ${icon('broadcast')} Forecast ${StringHelper.encodeHtml(next.issued)} is in</button>` : ''}
        <span class="ow-seg-buttons" role="group" aria-label="Zoom">
            ${knob('zoom-out', 'Zoom out', '−', zoomStep > 0)}
            <button type="button" data-action="zoom-day"${pressed(!zoomStep)}>Day</button>
            ${knob('zoom-in', 'Zoom in', '+', zoomStep < lastZoomStep)}
        </span>`;
}

/**
 * The map's title and the Status / Access switch
 * @param {Object} options `{ site, turbines, due, mapView }`
 * @returns {String}
 */
export function sideBarHtml({ site, turbines, due, mapView }) {
    return `
        <span class="ow-panel-title">${StringHelper.encodeHtml(site)} <small title="${turbines} turbines">${icon('turbine')} ${turbines}</small></span>
        <span class="ow-seg-buttons" role="group" aria-label="Map view">
            <button type="button" data-action="view" data-view="status"${pressed(mapView === 'status')}>Status</button>
            <button type="button" data-action="view" data-view="access"${pressed(mapView === 'access')}>Access</button>
        </span>`;
}

/**
 * The legend under the schedule
 */
export const legendHtml = `
    <span class="ow-l-plan">On plan</span><span class="ow-l-risk">Past window</span><span class="ow-l-trim">Trimmed</span>
    <span class="ow-l-cancel">Moved</span><span class="ow-l-nogo">Weather no-go</span>
    <span class="ow-l-dep">Must finish first</span>
    <span class="ow-legend-credit">Schedule: Bryntum Scheduler · Wave height: AG Charts</span>`;
