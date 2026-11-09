import { Button, Collection, DomHelper, DragHelper, Model, Store, StringHelper, Tooltip, Widget } from '@bryntum/core-enterprise';
import { mapPort, mapXY, rowName, substation, turbineIds } from '../plan/Farm.js';
import { icon } from '../util/Icons.js';
import { markerParts, setRotorSpeed, turbineMarker } from './Turbine.js';

const
    // The whole farm, the SVG's own viewBox, also the furthest the map zooms out
    farmView     = Object.freeze({ x : 0, y : 0, width : 440, height : 330 }),
    aspect       = farmView.width / farmView.height,
    // The port's marker and its label, kept in view when fitted to a trip
    portBox      = { x1 : 4, y1 : 288, x2 : 140, y2 : 310 },
    // Room around the fitted turbines for their labels, the closest a fit zooms in, the closest the user zooms in
    fitPad       = 26,
    minWidth     = 220,
    zoomInWidth  = 70,
    // A press that moves this many px pans the map, less is a click
    panThreshold = 4,
    // How long the view takes to fit a selection, and to follow a wheel or pinch step
    fitMs        = 450,
    zoomMs       = 180,
    viewKey      = ({ x, y, width, height }) => [x, y, width, height].map(n => Number(n.toFixed(1))).join(' '),
    isFarm       = view => view.width >= farmView.width - 0.5,
    clamp        = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * A view of the farm's aspect ratio, `width` wide, kept inside the farm
 * @param {Number} x
 * @param {Number} y
 * @param {Number} width
 * @returns {Object} `{ x, y, width, height }`
 */
function boundedView(x, y, width) {
    const
        w = clamp(width, zoomInWidth, farmView.width),
        h = w / aspect;

    return { x : clamp(x, 0, farmView.width - w), y : clamp(y, 0, farmView.height - h), width : w, height : h };
}

/**
 * The viewBox that fits turbines and the port, at the farm's aspect ratio, inside the farm
 * @param {String[]} ids
 * @returns {Object} `{ x, y, width, height }`
 */
function fitView(ids) {
    const
        points = ids.map(mapXY),
        x1     = Math.min(portBox.x1, ...points.map(p => p.x)) - fitPad,
        y1     = Math.min(portBox.y1, ...points.map(p => p.y)) - fitPad,
        x2     = Math.max(portBox.x2, ...points.map(p => p.x)) + fitPad,
        y2     = Math.max(portBox.y2, ...points.map(p => p.y)) + fitPad,
        width  = Math.min(farmView.width, Math.max(minWidth, x2 - x1, (y2 - y1) * aspect));

    if (width >= farmView.width) {
        return farmView;
    }

    return boundedView((x1 + x2 - width) / 2, (y1 + y2 - width / aspect) / 2, width);
}

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
 * - It zooms like a map: the wheel and a trackpad or finger pinch zoom around the pointer, from the whole farm to a
 *   few turbines, a drag (Bryntum's DragHelper) or a two finger scroll pans. `fitTo()` fits it to a trip, Show all
 *   goes back to the whole farm. The view the user chose stays until the app fits it again (DispatchApp#fitMap)
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
            // The card's width (map.css) and the tooltip's padding, so its padding is the same on both sides
            maxWidth    : 'min(25rem, calc(100vw - 16px))',
            hoverDelay  : 250,
            hideDelay   : 100,
            getHtml     : ({ activeTarget }) => me.tipHtml?.(activeTarget.dataset.turbine) ?? ''
        });

        me.svgElement = me.element.querySelector('.ow-map-svg');
        me.view       = { ...farmView };
        // Back to the whole farm, shown only while the map is fitted to a trip
        me.wholeFarmButton = new Button({
            // In one row with the callout, so the two never overlap
            appendTo : me.element.querySelector('.ow-map-top'),
            cls      : 'ow-map-whole',
            text     : 'Show all',
            hidden   : true,
            onClick  : () => {
                me.fitTo(null);
                me.trigger('wholeFarm');
            }
        });

        me.initGestures();

        me.element.addEventListener('click', event => me.onMapClick(event), true);
        me.element.addEventListener('keydown', event => me.onMapKeyDown(event));
        me.element.addEventListener('focusin', event => me.onMarkerFocus(event));
        me.element.addEventListener('focusout', event => me.onMarkerBlur(event));
        me.element.addEventListener('pointerover', event => me.hover(event.target.closest?.('.ow-marker')?.dataset.turbine ?? null));
        me.element.addEventListener('pointerleave', () => me.hover(null));
    }

    // The drag that pans the map, the wheel and the trackpad, the pinch of two fingers
    initGestures() {
        const me = this;

        // A drag on the map pans it: Bryntum's DragHelper runs the gesture (the threshold, mouse, pen and touch, the
        // release anywhere on the page, Escape). Locked on both axes, the SVG itself stays put, the drag moves the view
        me.panHelper = new DragHelper({
            callOnFunctions : true,
            outerElement    : me.element,
            targetSelector  : '.ow-map-svg',
            mode            : 'translateXY',
            lockX           : true,
            lockY           : true,
            constrain       : false,
            dragThreshold   : panThreshold,
            onDragStart     : ({ event }) => me.onPanStart(event),
            onDrag          : ({ context, event }) => me.onPan(context, event),
            onDrop          : () => me.onPanEnd(),
            onAbort         : () => me.onPanEnd()
        });

        // Two fingers on a touch screen pinch the map, see onPinchPointer
        me.touches = new Map();
        me.svgElement.addEventListener('pointerdown', event => me.onPinchPointer(event));
        me.svgElement.addEventListener('pointermove', event => me.onPinchPointer(event));
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type =>
            me.svgElement.addEventListener(type, event => me.onPinchPointer(event)));
        // The wheel and the trackpad zoom or pan the map, not the page
        me.svgElement.addEventListener('wheel', event => me.onWheel(event), { passive : false });
    }

    doDestroy() {
        cancelAnimationFrame(this.frame);
        this.panHelper?.destroy();
        this.wholeFarmButton?.destroy();
        this.tooltip?.destroy();
        this.turbines?.destroy();
        super.doDestroy();
    }

    //region Zoom and pan

    /**
     * Animates the map's viewBox to fit the given turbines and the port, or back to the whole farm. The app calls it
     * when the selection changes (DispatchApp#fitMap), so a view the user panned or zoomed to stays until then
     * @param {String[]|null} ids The turbines to fit, `null` or none for the whole farm
     */
    fitTo(ids) {
        this.animateTo(ids?.length ? fitView(ids) : farmView, fitMs);
    }

    /**
     * Eases the view to another, the way a wheel notch, a fit or Show all moves it
     * @param {Object} target `{ x, y, width, height }`
     * @param {Number} duration Milliseconds, none with reduced motion
     */
    animateTo(target, duration) {
        const
            me      = this,
            from    = { ...me.view },
            started = performance.now(),
            length  = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : duration,
            step    = time => {
                const
                    t    = length ? Math.min(1, (time - started) / length) : 1,
                    ease = 1 - (1 - t) ** 3;

                me.setView(Object.fromEntries(Object.keys(from).map(k => [k, from[k] + (target[k] - from[k]) * ease])));

                if (t < 1) {
                    me.frame = requestAnimationFrame(step);
                }
                else {
                    me.frame = me.target = null;
                }
            };

        me.target = target;
        cancelAnimationFrame(me.frame);
        me.frame = requestAnimationFrame(step);
    }

    /**
     * Stops an animation of the view where it is, the user takes over
     */
    stopAnimation() {
        cancelAnimationFrame(this.frame);
        this.frame = this.target = null;
    }

    /**
     * How the SVG shows a viewBox in its box: scaled to fit and centred (`xMidYMid meet`)
     * @param {Object} [view] `{ width, height }`
     * @returns {Object} `{ scale, left, top }`, px per map unit, and where the view's top left is on the screen
     */
    screenOf(view = this.view) {
        const
            box   = this.svgElement.getBoundingClientRect(),
            scale = Math.min(box.width / view.width, box.height / view.height);

        return {
            scale,
            left : box.left + (box.width - view.width * scale) / 2,
            top  : box.top + (box.height - view.height * scale) / 2
        };
    }

    /**
     * Zooms around a point of the screen, which stays over the same point of the farm, as a map does
     * @param {Number} factor Above 1 zooms in
     * @param {Number} clientX
     * @param {Number} clientY
     * @param {Boolean} [animate] Eased (a wheel notch), or at once (a trackpad or finger pinch, in small steps of its
     * own)
     */
    zoomAt(factor, clientX, clientY, animate = false) {
        const
            me     = this,
            // From the view it is heading to, so wheel notches in a row add up
            from   = me.target ?? me.view,
            screen = me.screenOf(from),
            x      = from.x + (clientX - screen.left) / screen.scale,
            y      = from.y + (clientY - screen.top) / screen.scale,
            width  = clamp(from.width / factor, zoomInWidth, farmView.width),
            next   = me.screenOf({ width, height : width / aspect }),
            target = boundedView(x - (clientX - next.left) / next.scale, y - (clientY - next.top) / next.scale, width);

        if (animate) {
            me.animateTo(target, zoomMs);
        }
        else {
            me.stopAnimation();
            me.setView(target);
        }
    }

    /**
     * Moves the view by a distance on the screen, within the farm
     * @param {Number} dx px
     * @param {Number} dy px
     * @param {Object} [from] The view to move, the current one by default
     */
    panBy(dx, dy, from = this.view) {
        const { scale } = this.screenOf(from);

        this.setView(boundedView(from.x - dx / scale, from.y - dy / scale, from.width));
    }

    /**
     * The wheel: a trackpad pinch (the browser sends it with `ctrlKey`) and a mouse wheel zoom around the pointer, a
     * two finger scroll on a trackpad pans
     * @param {WheelEvent} event
     */
    onWheel(event) {
        const
            me    = this,
            lines = event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL,
            // A mouse wheel moves in whole notches along one axis, a trackpad in small steps along both
            mouse = lines || (!event.deltaX && Number.isInteger(event.deltaY) && Math.abs(event.deltaY) >= 50),
            dy    = lines ? event.deltaY * 33 : event.deltaY;

        event.preventDefault();
        me.tooltip.hide();

        if (event.ctrlKey) {
            me.zoomAt(Math.exp(-dy * 0.01), event.clientX, event.clientY);
        }
        else if (mouse) {
            me.zoomAt(Math.exp(-dy * 0.0025), event.clientX, event.clientY, true);
        }
        else {
            me.stopAnimation();
            me.panBy(-event.deltaX, -event.deltaY);
        }
    }

    /**
     * A drag past the threshold starts a pan (DragHelper's `dragStart`). The view moves from the one at the start
     * @param {MouseEvent|TouchEvent} event
     */
    onPanStart(event) {
        const
            me    = this,
            point = event.touches?.[0] ?? event;

        if (me.pinch) {
            return;
        }

        me.stopAnimation();
        me.panning = { x : point.clientX, y : point.clientY, view : { ...me.view } };
        me.element.classList.add('ow-map-panning');
        me.tooltip.hide();
    }

    // DragHelper's `drag`: the view follows the pointer
    onPan(context, event) {
        const
            { panning } = this,
            point       = event.touches?.[0] ?? event;

        // Nothing is dropped, a pan is never refused
        context.valid = true;

        if (panning && !this.pinch) {
            this.panBy(point.clientX - panning.x, point.clientY - panning.y, panning.view);
        }
    }

    // DragHelper's `drop` and `abort`: the pan ends where it is, the click that may follow it selects nothing
    // (onMapClick)
    onPanEnd() {
        const me = this;

        if (me.panning) {
            me.panning = null;
            me.panned  = true;
            setTimeout(() => {
                me.panned = false;
            }, 0);
        }

        me.element.classList.remove('ow-map-panning');
    }

    /**
     * Two fingers on a touch screen pinch the map: it zooms around their midpoint and moves with it. The second finger
     * takes over from a pan of the first
     * @param {PointerEvent} event
     */
    onPinchPointer(event) {
        const
            me          = this,
            { touches } = me;

        if (event.pointerType !== 'touch') {
            return;
        }

        if (event.type === 'pointerdown' || (event.type === 'pointermove' && touches.has(event.pointerId))) {
            touches.set(event.pointerId, { x : event.clientX, y : event.clientY });
        }
        else {
            touches.delete(event.pointerId);
        }

        const [a, b] = [...touches.values()];

        if (!b) {
            me.pinch = null;

            return;
        }

        const
            mid      = { x : (a.x + b.x) / 2, y : (a.y + b.y) / 2 },
            distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));

        if (me.pinch) {
            me.zoomAt(distance / me.pinch.distance, mid.x, mid.y);
            me.panBy(mid.x - me.pinch.mid.x, mid.y - me.pinch.mid.y);
        }
        else {
            // The first finger's pan stops here, the pinch goes on from this view
            me.panHelper.abort(true);
            me.onPanEnd();
            me.stopAnimation();
        }

        me.pinch = { mid, distance };
    }

    setView(view) {
        const
            me     = this,
            zoomed = !isFarm(view);

        me.view = view;
        me.svgElement.setAttribute('viewBox', viewKey(view));
        // Text keeps its size as the map zooms in
        me.svgElement.style.setProperty('--ow-map-zoom', String(farmView.width / view.width));
        // Show all, whenever the view is not the whole farm
        me.wholeFarmButton.hidden = !zoomed;
        me.element.classList.toggle('ow-map-zoomed', zoomed);
    }

    //endregion

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
<div class="ow-map-top"><div class="ow-map-callout" hidden></div></div>
<div class="ow-map-legend">${[['ow-m-work', 'In work'], ['ow-m-planned', 'Planned'], ['ow-m-waiting', 'Waiting'],
            ['ow-m-risk', 'At risk'], ['ow-m-fault', 'Stopped']].map(([cls, label]) =>
        `<span><svg class="ow-legend-mark ${cls}" viewBox="-8 -8 19 19" aria-hidden="true">${markerParts()}</svg>${label}</span>`).join('')}
</div>`;
    }

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

    // A press and release without a move selects the turbine. The click that ends a pan selects nothing, even where the
    // pan started on a turbine
    onMapClick(event) {
        const id = event.target.closest?.('.ow-marker')?.dataset.turbine;

        if (this.panned) {
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
