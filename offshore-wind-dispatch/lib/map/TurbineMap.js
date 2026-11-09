import { Collection, DomHelper, Model, Store, StringHelper, Tooltip, Widget } from '@bryntum/core-enterprise';
import { mapPort, mapXY, rowName, substation, turbineIds } from '../plan/Farm.js';
import { icon } from '../util/Icons.js';
import { turbineMarker } from './Turbine.js';

/**
 * A turbine of the map: where it is drawn and its status class (see MapModel and map.css)
 */
export class TurbineModel extends Model {
    static $name = 'TurbineModel';

    static fields = [
        { name : 'x', type : 'number' },
        { name : 'y', type : 'number' },
        'row',
        { name : 'status', defaultValue : '' }
    ];

    /**
     * The status in words, for the turbine's accessible name
     * @property {String}
     */
    get statusText() {
        const words = {
            'ow-m-target'  : 'drop target',
            'ow-m-reach'   : 'within reach',
            'ow-m-work'    : 'in work',
            'ow-m-planned' : 'planned',
            'ow-m-waiting' : 'team waiting',
            'ow-m-risk'    : 'at risk',
            'ow-m-moved'   : 'moved to tomorrow',
            'ow-m-fault'   : 'stopped'
        };

        return this.status.split(' ').map(cls => words[cls]).filter(Boolean).join(', ');
    }
}

// The arrow keys, as a direction on the map
const directions = {
    ArrowRight : { x : 1, y : 0 },
    ArrowLeft  : { x : -1, y : 0 },
    ArrowDown  : { x : 0, y : 1 },
    ArrowUp    : { x : 0, y : -1 }
};

/**
 * The map of Skarv Bank: the 60 turbines in their staggered rows, the substation and its export cable, the port, the
 * routes of the vessel trips, and the status of every turbine (MapModel). While a team is dragged over a trip it rings
 * the turbines the trip can still reach before its window closes and dims the rest.
 *
 * The turbines are records of a Store (`turbines`), each drawn once as a marker of an SVG listbox, then updated in
 * place as its record changes, so the focus, the hover and the tooltip stay on it while the plan changes under it.
 *
 * - `selected` is a Collection of the selected turbine records, a click or Enter or Space selects one, and its change
 *   fires `selectionChange`. Each marker carries `aria-selected`
 * - Hovering a turbine fires `turbineHover`, `ring()` rings the turbines of a trip
 * - The map is one tab stop: the arrow keys move the focus to the nearest turbine in that direction
 * - The tooltip is a Bryntum Tooltip on the markers (`forSelector`), its content from the `tipHtml` function, shown on
 *   hover and on keyboard focus
 *
 * Drawn in `currentColor` and CSS custom properties, so it follows light and dark.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Widget
 * https://bryntum.com/products/scheduler/docs/api/Core/data/Store
 * https://bryntum.com/products/scheduler/docs/api/Core/util/Collection
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Tooltip#config-forSelector
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

        /**
         * Returns the HTML of a turbine's tooltip
         * @config {Function}
         * @param {String} turbine The turbine's ID
         * @returns {String}
         */
        tipHtml : null,

        cls : 'ow-map'
    };

    /**
     * Fired when the selected turbines change, by a click, the keyboard or `draw()`
     * @event selectionChange
     * @param {TurbineModel[]} selection The selected turbines
     * @param {TurbineModel[]} selected The turbines selected by the change
     * @param {TurbineModel[]} deselected The turbines no longer selected
     * @param {Boolean} user `true` when the user selected it, `false` when the app did (`draw()`)
     */

    /**
     * Fired when the pointer enters a turbine, or leaves the turbines
     * @event turbineHover
     * @param {String|null} turbine
     */

    construct(config) {
        const me = this;

        super.construct(config);

        me.turbines = new Store({
            modelClass : TurbineModel,
            data       : turbineIds.map(id => ({ id, ...mapXY(id), row : rowName(id) }))
        });
        me.turbines.on({ update : ({ record }) => me.syncMarker(record), thisObj : me });

        me.selected = new Collection();
        me.selected.on({ change : 'onSelectedChange', thisObj : me });

        me.ringed  = new Set();
        me.hovered = null;

        me.html = me.svg();
        me.markers = new Map([...me.element.querySelectorAll('.ow-marker')].map(el => [el.dataset.turbine, el]));
        me.parts   = {
            routes  : me.element.querySelector('.ow-routes'),
            labels  : me.element.querySelector('.ow-labels'),
            callout : me.element.querySelector('.ow-map-callout')
        };
        // One tab stop, the first turbine until another one is focused or selected
        me.focusable = me.markers.get(turbineIds[0]);
        me.focusable.tabIndex = 0;
        me.turbines.forEach(record => me.syncMarker(record));

        me.tooltip = new Tooltip({
            forElement  : me.element,
            forSelector : '.ow-marker',
            cls         : 'ow-map-tip',
            hoverDelay  : 250,
            hideDelay   : 100,
            getHtml     : ({ activeTarget }) => me.tipHtml?.(activeTarget.dataset.turbine) ?? ''
        });

        me.element.addEventListener('click', event => me.onMapClick(event));
        me.element.addEventListener('keydown', event => me.onMapKeyDown(event));
        me.element.addEventListener('focusin', event => me.onMarkerFocus(event));
        me.element.addEventListener('focusout', event => me.onMarkerBlur(event));
        me.element.addEventListener('pointerover', event => me.hover(event.target.closest?.('.ow-marker')?.dataset.turbine ?? null));
        me.element.addEventListener('pointerleave', () => me.hover(null));
    }

    doDestroy() {
        this.tooltip?.destroy();
        this.turbines?.destroy();
        super.doDestroy();
    }

    //region Drawing

    // The parts that do not change: the sea, the cable, the port, the substation and the markers. The routes, the
    // labels and the callout are drawn by draw()
    svg() {
        const
            { site } = this,
            oss      = mapXY(substation),
            text     = StringHelper.encodeHtml,
            placed   = (name, size) => icon(name).replace('<svg ', `<svg x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" `);

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
        <circle r="11"/>${placed('substation', 16)}
    </g>
    <g class="ow-markers" role="listbox" aria-label="The ${turbineIds.length} turbines, arrow keys move, Enter selects">
        ${turbineIds.map(id => {
            const { x, y } = mapXY(id);

            return turbineMarker(x.toFixed(1), y.toFixed(1), '', id);
        }).join('')}
    </g>
    <g class="ow-labels" aria-hidden="true"></g>
</svg>
<div class="ow-map-callout" hidden></div>
<div class="ow-map-legend">
    <span class="ow-m-work"><i></i>In work</span><span class="ow-m-planned"><i></i>Planned</span>
    <span class="ow-m-waiting"><i></i>Waiting</span><span class="ow-m-risk"><i></i>At risk</span>
    <span class="ow-m-moved"><i></i>Moved</span><span class="ow-m-fault"><i></i>Stopped</span>
</div>`;
    }

    /**
     * Shows the plan: each turbine's status, the routes, the labels, the callout and the selected turbine
     * @param {Object} model See MapModel#mapModel
     */
    draw({ markers, labels, routes, callout, selected }) {
        const
            me        = this,
            { parts } = me;

        me.turbines.forEach(record => {
            record.status = markers.get(record.id) ?? '';
        });

        parts.routes.innerHTML = routes.map(route => me.routeSvg(route)).join('');
        parts.labels.innerHTML = labels.map(label => me.labelSvg(label)).join('');
        parts.callout.hidden   = !callout;
        parts.callout.innerHTML = callout ?? '';

        // The app's selection, not the user's
        me.drawing = true;
        me.select(selected);
        me.drawing = false;

        me.refreshTip();
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

    /**
     * Brings a marker in line with its record and the view: status, selected, ringed, hovered, its accessible name
     * @param {TurbineModel} record
     */
    syncMarker(record) {
        const
            me       = this,
            el       = me.markers?.get(record.id),
            selected = me.selected?.includes(record);

        if (!el) {
            return;
        }

        el.setAttribute('class', ['ow-marker', record.status,
            selected ? 'ow-m-selected' : '',
            me.ringed.has(record.id) ? 'ow-m-ring' : '',
            me.hovered === record.id ? 'ow-m-hover' : ''].filter(Boolean).join(' '));
        el.setAttribute('aria-selected', String(Boolean(selected)));
        el.setAttribute('aria-label', [record.id, record.statusText].filter(Boolean).join(', '));
    }

    //endregion

    //region Selection

    /**
     * Selects a turbine, or none
     * @param {String|null} id
     */
    select(id) {
        const
            { selected } = this,
            record       = id ? this.turbines.getById(id) : null;

        if (selected.count !== (record ? 1 : 0) || (record && !selected.includes(record))) {
            selected.splice(0, selected.count, ...(record ? [record] : []));
        }
    }

    onSelectedChange({ added = [], removed = [] }) {
        const me = this;

        [...removed, ...added].forEach(record => me.syncMarker(record));

        // The tab stop follows the selection
        if (added[0]) {
            me.setFocusable(added[0].id);
        }

        me.trigger('selectionChange', {
            selection  : me.selected.values.slice(),
            selected   : added,
            deselected : removed,
            user       : !me.drawing
        });
    }

    onMapClick(event) {
        const id = event.target.closest?.('.ow-marker')?.dataset.turbine;

        if (id) {
            this.select(id);
        }
    }

    //endregion

    //region Hover and rings

    hover(id) {
        const
            me       = this,
            previous = me.hovered;

        if (id !== previous) {
            me.hovered = id;
            [previous, id].forEach(each => each && me.syncMarker(me.turbines.getById(each)));
            me.trigger('turbineHover', { turbine : id });
        }
    }

    /**
     * Rings turbines, the stops of the trip selected or hovered in the schedule
     * @param {String[]} ids
     */
    ring(ids = []) {
        const
            me     = this,
            before = me.ringed;

        me.ringed = new Set(ids);
        new Set([...before, ...ids]).forEach(id => {
            const record = me.turbines.getById(id);

            if (record && before.has(id) !== me.ringed.has(id)) {
                me.syncMarker(record);
            }
        });
    }

    //endregion

    //region Keyboard and tooltip

    setFocusable(id) {
        const
            me = this,
            el = me.markers.get(id);

        if (el && el !== me.focusable) {
            me.focusable.tabIndex = -1;
            el.tabIndex           = 0;
            me.focusable          = el;
        }
    }

    // The arrows move to the nearest turbine in their direction, Enter or Space selects, Escape hides the tooltip
    onMapKeyDown(event) {
        const
            me   = this,
            from = event.target.closest?.('.ow-marker')?.dataset.turbine;

        if (!from) {
            return;
        }

        if (directions[event.key]) {
            const next = me.nearest(from, directions[event.key]);

            if (next) {
                me.setFocusable(next);
                me.markers.get(next).focus();
            }
        }
        else if (event.key === 'Enter' || event.key === ' ') {
            me.select(from);
        }
        else if (event.key === 'Escape' && me.tooltip.isVisible) {
            me.tooltip.hide();
        }
        else {
            return;
        }

        event.preventDefault();
    }

    /**
     * The nearest turbine from another in a direction: within 45° of it, closest along it, then least off it
     * @param {String} id
     * @param {{x: Number, y: Number}} direction
     * @returns {String|null}
     */
    nearest(id, direction) {
        const from = this.turbines.getById(id);

        let best = null, score = Infinity;

        this.turbines.forEach(record => {
            const
                dx     = record.x - from.x,
                dy     = record.y - from.y,
                along  = dx * direction.x + dy * direction.y,
                across = Math.abs(dx * direction.y - dy * direction.x),
                value  = along + 2 * across;

            if (along > 1 && across <= along && value < score) {
                best  = record.id;
                score = value;
            }
        });

        return best;
    }

    // A turbine focused from the keyboard shows its tooltip, as hovering it would
    onMarkerFocus(event) {
        const
            me     = this,
            marker = event.target.closest?.('.ow-marker');

        if (marker) {
            me.setFocusable(marker.dataset.turbine);

            if (DomHelper.usingKeyboard) {
                me.showTip(marker);
            }
        }
    }

    onMarkerBlur(event) {
        if (!this.element.contains(event.relatedTarget) && this.tooltip.activeTarget === event.target) {
            this.tooltip.hide();
        }
    }

    /**
     * Shows the tooltip of a marker
     * @param {Element} marker
     */
    showTip(marker) {
        const { tooltip } = this;

        tooltip.activeTarget = marker;
        tooltip.updateContent();
        tooltip.showByTarget(marker);
    }

    /**
     * Updates the tooltip shown, its turbine's plan may have changed
     */
    refreshTip() {
        const { tooltip } = this;

        if (tooltip?.isVisible && tooltip.activeTarget?.isConnected) {
            tooltip.updateContent();
            tooltip.realign();
        }
    }

    //endregion
}

TurbineMap.initClass();
