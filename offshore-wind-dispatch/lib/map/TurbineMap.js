import { StringHelper, Widget } from '@bryntum/core-enterprise';
import { mapPort, mapXY, substation, turbineIds } from '../plan/Farm.js';
import { icon } from '../util/Icons.js';
import { turbineMarker } from './Turbine.js';

/**
 * The map of Skarv Bank: the 60 turbines in their staggered rows, the substation and its export cable, the port, the
 * routes of the vessel trips, and the status of every turbine (MapModel). While a team is dragged over a trip it rings
 * the turbines the trip can still reach before its window closes and dims the rest. A click on a turbine selects it.
 *
 * Drawn as one SVG in the widget's HTML, in `currentColor` and CSS custom properties, so it follows light and dark.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Widget#config-html
 */
export default class TurbineMap extends Widget {
    static $name = 'TurbineMap';

    static type = 'turbinemap';

    static configurable = {
        /**
         * The site, for the port's label: `{ port, portKm, name }`
         * @config {Object}
         */
        site : null,

        cls : 'ow-map'
    };

    construct(config) {
        super.construct(config);

        this.element.addEventListener('click', event => {
            const marker = event.target.closest?.('[data-turbine]');

            if (marker) {
                this.trigger('turbineClick', { turbine : marker.dataset.turbine });
            }
        });
    }

    /**
     * Draws the map
     * @param {Object} model See MapModel#mapModel
     */
    draw(model) {
        const me = this;

        me.html = `
            ${me.svg(model)}
            ${model.callout ? `<div class="ow-map-callout">${model.callout}</div>` : ''}
            <div class="ow-map-legend">
                <span class="ow-m-work"><i></i>In work</span><span class="ow-m-planned"><i></i>Planned</span>
                <span class="ow-m-waiting"><i></i>Waiting</span><span class="ow-m-risk"><i></i>At risk</span>
                <span class="ow-m-moved"><i></i>Moved</span><span class="ow-m-fault"><i></i>Stopped</span>
            </div>`;
    }

    svg({ markers, labels, routes, selected }) {
        const
            { site } = this,
            oss      = mapXY(substation),
            placed   = (name, size) => icon(name).replace('<svg ', `<svg x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" `);

        return `
<svg class="ow-map-svg" viewBox="0 0 440 330" role="img" aria-label="Map of the ${turbineIds.length} turbines of ${StringHelper.encodeHtml(site.name)}">
    <g class="ow-contours">
        <path d="M-20 40 C 90 10, 210 70, 460 20"/>
        <path d="M-20 120 C 120 80, 260 150, 460 100"/>
        <path d="M-20 210 C 100 180, 300 250, 460 190"/>
        <path d="M-20 300 C 140 260, 280 330, 460 280"/>
    </g>
    <text class="ow-depth" x="420" y="34" text-anchor="end">24 m</text>
    <text class="ow-depth" x="420" y="114" text-anchor="end">28 m</text>
    <text class="ow-depth" x="420" y="204" text-anchor="end">31 m</text>
    <path class="ow-cable" d="M${oss.x.toFixed(1)} ${oss.y.toFixed(1)} C 120 230, 40 270, -10 300"/>
    ${routes.map(route => this.routeSvg(route)).join('')}
    <g class="ow-port" transform="translate(14 300)">
        <circle r="9"/>${placed('anchor', 12)}<text x="14" y="4">${StringHelper.encodeHtml(`${site.port} · ${site.portKm} km`)}</text>
    </g>
    <g class="ow-oss" transform="translate(${oss.x.toFixed(1)} ${oss.y.toFixed(1)})">
        <title>Offshore substation</title>
        <circle r="11"/>${placed('substation', 16)}
    </g>
    ${turbineIds.map(id => this.markerSvg(id, markers.get(id), id === selected)).join('')}
    ${labels.map(label => this.labelSvg(label)).join('')}
</svg>`;
    }

    markerSvg(id, status, selected) {
        const { x, y } = mapXY(id);

        return turbineMarker(x.toFixed(1), y.toFixed(1), `${status}${selected ? ' ow-m-selected' : ''}`, id);
    }

    // A route from the port to each stop
    routeSvg({ stops, cls }) {
        if (!stops.length) {
            return '';
        }

        const points = [mapPort, ...stops.map(mapXY)];

        return `<path class="ow-route ${cls}" d="M${points.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')}"/>`;
    }

    labelSvg({ id, text, cls = '' }) {
        const { x, y } = mapXY(id);

        return `<g class="ow-map-label ${cls}" transform="translate(${x.toFixed(1)} ${(y - 13).toFixed(1)})">
            <text text-anchor="middle">${StringHelper.encodeHtml(text)}</text></g>`;
    }
}

TurbineMap.initClass();
