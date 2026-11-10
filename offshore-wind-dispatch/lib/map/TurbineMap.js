import { Collection, DomSync, EventHelper, Store, Widget } from '@bryntum/core-enterprise';
import { mapXY, rowName, turbineIds } from '../plan/Farm.js';
import { labelSvg, mapSvg, routeSvg } from './MapDrawing.js';
import TurbineModel from './TurbineModel.js';
import MapViewport from './MapViewport.js';
// Also registers the widget types used below
import './TurbineTooltip.js';

const directions = {
    ArrowRight : { x : 1, y : 0 },
    ArrowLeft  : { x : -1, y : 0 },
    ArrowDown  : { x : 0, y : 1 },
    ArrowUp    : { x : 0, y : -1 }
};

/**
 * The SVG map of the farm, drawn from a MapModel by `draw()`. Its turbines are records of a Store (`turbines`), each
 * drawn once as a marker of an SVG listbox and then updated in place as its record changes, so the focus, the hover
 * and the tooltip stay on a marker while the plan changes under it. The selection is a Collection (`selected`).
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/widget/Widget
 * https://bryntum.com/products/scheduler/docs/api/Core/data/Store
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
         * Returns the DomConfig of a turbine's tooltip, called with the turbine's ID
         * @config {Function}
         */
        tipContent : null,

        cls : 'ow-map'
    };

    /**
     * Fired when the selected turbines change, by a click, the keyboard or `draw()`
     * @event selectionChange
     * @param {TurbineModel[]} selection
     * @param {TurbineModel[]} selected
     * @param {TurbineModel[]} deselected
     * @param {Boolean} user `false` when the app selected it (`draw()`)
     */

    /**
     * Fired when the pointer enters a turbine, or leaves the turbines (`null`)
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
            contentOf  : turbine => me.tipContent?.(turbine) ?? ''
        });

        me.svgElement = me.element.querySelector('.ow-map-svg');
        // Shown only while the map is fitted to a trip
        me.wholeFarmButton = Widget.create({
            type      : 'button',
            cls       : 'ow-map-whole',
            rendition : 'elevated',
            text      : 'Show all',
            hidden    : true,
            // In one row with the callout, so the two never overlap
            appendTo  : me.element.querySelector('.ow-map-top'),
            onClick   : () => {
                me.fitTo(null);
                me.trigger('wholeFarm');
            }
        });

        me.viewport = new MapViewport({ map : me });

        // Removed when the map is destroyed (thisObj). With `delegate`, the event's currentTarget is the marker
        EventHelper.on({
            element      : me.element,
            thisObj      : me,
            click        : { handler : 'onMapClickCapture', capture : true },
            // The pointer over a marker or between them, both are a change of the turbine hovered
            pointerover  : 'onMapPointerOver',
            pointerleave : () => me.hover(null)
        });
        EventHelper.on({
            element  : me.element,
            delegate : '.ow-marker',
            thisObj  : me,
            click    : 'onMarkerClick',
            keydown  : 'onMarkerKeyDown',
            focusin  : 'onMarkerFocus',
            focusout : 'onMarkerBlur'
        });
    }

    doDestroy() {
        this.viewport?.destroy();
        this.wholeFarmButton?.destroy();
        this.markerTip?.destroy();
        this.turbines?.destroy();
        super.doDestroy();
    }

    /**
     * Animates the viewBox to fit the turbines and the port, or the whole farm for `null`. Only the app calls it, when
     * the selection changes (MapPanel#fit), so a view the user panned or zoomed to stays until then
     * @param {String[]|null} ids
     */
    fitTo(ids) {
        this.viewport.fitTo(ids);
    }

    //region Drawing

    /**
     * @param {Object} model See MapModel#mapModel
     */
    draw({ markers, labels, routes, callout, selected }) {
        const
            me        = this,
            { parts } = me;

        me.turbines.forEach(record => {
            const { status = '', dimmed = false } = markers.get(record.id) ?? {};

            record.set({ status, dimmed });
        });

        parts.routes.innerHTML = routes.map(route => routeSvg(route)).join('');
        parts.labels.innerHTML = labels.map(label => labelSvg(label)).join('');
        DomSync.sync({
            targetElement : parts.callout,
            domConfig     : { className : 'ow-map-callout', hidden : callout ? null : true, children : callout ?? [] }
        });

        // The app's selection, not the user's
        me.drawing = true;
        me.select(selected);
        me.drawing = false;

        me.markerTip.refresh();
    }

    syncMarker(record) {
        const
            me       = this,
            el       = me.markers?.get(record.id),
            selected = me.selected?.includes(record);

        if (!el) {
            return;
        }

        el.setAttribute('class', ['ow-marker',
            record.status && `ow-m-${record.status}`,
            record.dimmed && 'ow-m-dim',
            selected && 'ow-m-selected',
            me.ringed.has(record.id) && 'ow-m-ring',
            me.hovered === record.id && 'ow-m-hover'].filter(Boolean).join(' '));
        el.setAttribute('aria-selected', String(Boolean(selected)));
        el.setAttribute('aria-label', [record.id, record.statusText].filter(Boolean).join(', '));
    }

    //endregion

    //region Selection

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

    // The click that ends a pan selects nothing, even where the pan started on a turbine: it stops on its way down
    onMapClickCapture(event) {
        if (this.viewport.panned) {
            event.stopPropagation();
        }
    }

    onMarkerClick(event) {
        this.select(event.currentTarget.dataset.turbine);
    }

    //endregion

    //region Hover and rings

    onMapPointerOver(event) {
        this.hover(event.target.closest('.ow-marker')?.dataset.turbine ?? null);
    }

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

    // Rings the stops of the trip selected or hovered in the schedule
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
    onMarkerKeyDown(event) {
        const
            me   = this,
            from = event.currentTarget.dataset.turbine;

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

    // The nearest turbine in a direction: within 45° of it, closest along it, then least off it
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
        const marker = event.currentTarget;

        this.setFocusable(marker.dataset.turbine);

        if (marker.matches(':focus-visible')) {
            this.markerTip.showForMarker(marker);
        }
    }

    // Leaving the map hides the tooltip of the turbine it had the focus on
    onMarkerBlur(event) {
        const { markerTip } = this;

        if (!this.element.contains(event.relatedTarget) && markerTip.marker === event.currentTarget) {
            markerTip.hide();
        }
    }

    //endregion
}

TurbineMap.initClass();
