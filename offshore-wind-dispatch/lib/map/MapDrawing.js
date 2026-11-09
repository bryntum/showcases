import { StringHelper } from '@bryntum/core-enterprise';
import { mapPort, mapXY, substation, turbineIds } from '../plan/Farm.js';
import { icon } from '../util/Icons.js';
import { turbineMarker } from './Turbine.js';

/**
 * The SVG of the map as strings: the parts that do not change (the sea, the cable, the port, the substation and the
 * markers), and the routes and labels the map draws again whenever the plan changes (TurbineMap#draw)
 */

/**
 * The SVG of the farm and the strip above it that holds the callout and the Show all button. The routes, the labels
 * and the callout are empty, TurbineMap#draw fills them
 * @param {Object} site `{ port, portKm, name }`
 * @returns {String} HTML
 */
export function mapSvg(site) {
    const
        oss    = mapXY(substation),
        text   = StringHelper.encodeHtml,
        placed = (name, size) => icon(name).replace('<svg ', `<svg x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" `);

    return `
<svg class="ow-map-svg" viewBox="0 0 440 330" role="group" aria-label="Map of ${text(site.name)}">
    <g class="ow-contours">
        <path d="M-20 40 C 90 10, 210 70, 460 20"/>
        <path d="M-20 120 C 120 80, 260 150, 460 100"/>
        <path d="M-20 210 C 100 180, 300 250, 460 190"/>
        <path d="M-20 300 C 140 260, 280 330, 460 280"/>
    </g>
    <text class="ow-depth" x="420" y="34" text-anchor="end" aria-hidden="true">24 m</text>
    <text class="ow-depth" x="420" y="114" text-anchor="end" aria-hidden="true">28 m</text>
    <text class="ow-depth" x="420" y="204" text-anchor="end" aria-hidden="true">31 m</text>
    <path class="ow-cable" d="M${oss.x.toFixed(1)} ${oss.y.toFixed(1)} C 120 230, 40 270, -10 300"/>
    <g class="ow-routes" aria-hidden="true"></g>
    <g class="ow-port" transform="translate(14 300)">
        <circle r="9"/>${placed('anchor', 12)}<text x="14" y="4">${text(`${site.port} · ${site.portKm} km`)}</text>
    </g>
    <g class="ow-oss" transform="translate(${oss.x.toFixed(1)} ${oss.y.toFixed(1)})">
        <title>Offshore substation</title>
        <rect x="-9" y="-9" width="18" height="18" rx="2.5"/>${placed('lightning', 15)}
    </g>
    <g class="ow-markers" role="listbox" aria-label="The ${turbineIds.length} turbines, arrow keys move, Enter selects">
        ${turbineIds.map(id => {
        const { x, y } = mapXY(id);

        return turbineMarker(x.toFixed(1), y.toFixed(1), '', id);
    }).join('')}
    </g>
    <g class="ow-labels" aria-hidden="true"></g>
</svg>
<div class="ow-map-top"><div class="ow-map-callout" hidden></div></div>`;
}

/**
 * A route from the port to each stop
 * @param {Object} route `{ stops, kind }`, kind `selected`, `preview` or none
 * @returns {String} SVG
 */
export function routeSvg({ stops, kind }) {
    if (!stops.length) {
        return '';
    }

    const points = [mapPort, ...stops.map(mapXY)];

    return `<path class="ow-route${kind ? ` ow-route-${kind}` : ''}" d="M${points.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')}"/>`;
}

/**
 * The label above a turbine, below it where above would sit on the substation
 * @param {Object} label `{ id, text, tone }`, tone `fault`, `risk`, `moved`, `target` or none
 * @returns {String} SVG
 */
export function labelSvg({ id, text, tone }) {
    // The substation is not a turbine, it carries no label
    if (id === substation) {
        return '';
    }

    const
        { x, y } = mapXY(id),
        oss      = mapXY(substation),
        // The label's box above the turbine, about 3.4 units a letter at the label's size
        covers   = Math.abs(oss.x - x) < text.length * 1.7 + 10 && Math.abs(oss.y - (y - 13)) < 14,
        labelY   = covers ? y + 20 : y - 13;

    return `<g class="ow-map-label${tone ? ` ow-map-label-${tone}` : ''}" transform="translate(${x.toFixed(1)} ${labelY.toFixed(1)})">
            <text text-anchor="middle">${StringHelper.encodeHtml(text)}</text></g>`;
}
