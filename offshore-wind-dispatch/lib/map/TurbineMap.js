import { Collection, DomHelper, Store, Widget } from '@bryntum/core-enterprise';
import { mapXY, rowName, turbineIds } from '../plan/Farm.js';
import { setRotorSpeed } from './Turbine.js';
import { labelSvg, mapSvg, routeSvg } from './MapDrawing.js';
import TurbineModel from './TurbineModel.js';
import MapViewport from './MapViewport.js';
// Also registers the widget types used below
import './MapLegend.js';
import './ShowAllButton.js';
import './TurbineTooltip.js';

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
 * - The tooltip is a TurbineTooltip on the markers, its content from the `tipContent` function, shown on hover and on
 *   keyboard focus
 * - It zooms like a map (MapViewport): the wheel and a trackpad or finger pinch zoom around the pointer, a drag or a
 *   two finger scroll pans. `fitTo()` fits it to a trip, the Show all button (ShowAllButton) goes back to the whole
 *   farm. The view the user chose stays until the app fits it again (DispatchApp#fitMap)
 * - The legend of the statuses is a MapLegend
 *
 * Drawn in `currentColor` and CSS custom properties, so it follows light and dark.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Widget
 * https://bryntum.com/products/scheduler/docs/api/Core/data/Store
 * https://bryntum.com/products/scheduler/docs/api/Core/util/Collection
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
         * Returns the content of a turbine's tooltip
         * @config {Function}
         * @param {String} turbine The turbine's ID
         * @returns {Object} DomConfig
         */
        tipContent : null,

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

    /**
     * Fired when the Show all button took the map back to the whole farm
     * @event wholeFarm
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

        me.html = mapSvg(me.site);
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

        me.markerTip = Widget.create({
            type       : 'turbinetooltip',
            forElement : me.element,
            getHtml    : ({ activeTarget }) => me.tipContent?.(activeTarget.dataset.turbine) ?? ''
        });

        me.svgElement = me.element.querySelector('.ow-map-svg');
        // Back to the whole farm, shown only while the map is fitted to a trip
        me.wholeFarmButton = Widget.create({
            type     : 'showallbutton',
            // In one row with the callout, so the two never overlap
            appendTo : me.element.querySelector('.ow-map-top'),
            onClick  : () => {
                me.fitTo(null);
                me.trigger('wholeFarm');
            }
        });
        me.legend = Widget.create({ type : 'maplegend', appendTo : me.element });

        me.viewport = new MapViewport({ map : me });

        me.element.addEventListener('click', event => me.onMapClick(event), true);
        me.element.addEventListener('keydown', event => me.onMapKeyDown(event));
        me.element.addEventListener('focusin', event => me.onMarkerFocus(event));
        me.element.addEventListener('focusout', event => me.onMarkerBlur(event));
        me.element.addEventListener('pointerover', event => me.hover(event.target.closest?.('.ow-marker')?.dataset.turbine ?? null));
        me.element.addEventListener('pointerleave', () => me.hover(null));
    }

    doDestroy() {
        this.viewport?.destroy();
        this.legend?.destroy();
        this.wholeFarmButton?.destroy();
        this.markerTip?.destroy();
        this.turbines?.destroy();
        super.doDestroy();
    }

    /**
     * Animates the map's viewBox to fit the given turbines and the port, or back to the whole farm. The app calls it
     * when the selection changes (DispatchApp#fitMap), so a view the user panned or zoomed to stays until then
     * @param {String[]|null} ids The turbines to fit, `null` or none for the whole farm
     */
    fitTo(ids) {
        this.viewport.fitTo(ids);
    }

    //region Drawing

    /**
     * Shows the plan: each turbine's status, the routes, the labels, the callout and the selected turbine
     * @param {Object} model See MapModel#mapModel
     */
    draw({ markers, labels, routes, callout, selected, wind }) {
        const
            me        = this,
            { parts } = me;

        // Every turning rotor on the page, at the speed of the wind now
        setRotorSpeed(wind);

        me.turbines.forEach(record => {
            record.status = markers.get(record.id) ?? '';
        });

        parts.routes.innerHTML = routes.map(route => routeSvg(route)).join('');
        parts.labels.innerHTML = labels.map(label => labelSvg(label)).join('');
        parts.callout.hidden   = !callout;
        parts.callout.innerHTML = callout ?? '';

        // The app's selection, not the user's
        me.drawing = true;
        me.select(selected);
        me.drawing = false;

        me.markerTip.refresh();
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

    // A press and release without a move selects the turbine. The click that ends a pan selects nothing, even where the
    // pan started on a turbine
    onMapClick(event) {
        const id = event.target.closest?.('.ow-marker')?.dataset.turbine;

        if (this.viewport.panned) {
            event.stopPropagation();
        }
        else if (id) {
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

    //region Keyboard

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
        else if (event.key === 'Escape' && me.markerTip.isVisible) {
            me.markerTip.hide();
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
                me.markerTip.showForMarker(marker);
            }
        }
    }

    onMarkerBlur(event) {
        if (!this.element.contains(event.relatedTarget) && this.markerTip.activeTarget === event.target) {
            this.markerTip.hide();
        }
    }

    //endregion
}

TurbineMap.initClass();
