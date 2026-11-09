import { DragHelper, EventHelper } from '@bryntum/core-enterprise';
import { aspect, boundedView, clamp, farmView, fitView, isFarm, viewKey, zoomInWidth } from './MapView.js';

const
    // A press that moves this many px pans the map, less is a click
    panThreshold = 4,
    // How long the view takes to fit a selection, and to follow a wheel or pinch step
    fitMs        = 450,
    zoomMs       = 180;

/**
 * The part of the farm the map shows, and how the user moves it: the wheel and a trackpad or finger pinch zoom around
 * the pointer, from the whole farm to a few turbines, a drag (Bryntum's DragHelper) or a two finger scroll pans.
 * `fitTo()` fits the view to a trip, and the Show all button of the map goes back to the whole farm.
 *
 * It moves the SVG's viewBox, the view arithmetic is in MapView. Not a widget: it works on the SVG, the Show all button
 * and the tooltip of the map that owns it (TurbineMap).
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/helper/DragHelper
 */
export default class MapViewport {
    /**
     * @param {Object} options
     * @param {TurbineMap} options.map The map: its `element`, `svgElement`, `markerTip` and `wholeFarmButton`
     */
    constructor({ map }) {
        const me = this;

        me.map  = map;
        me.view = { ...farmView };

        const { svgElement } = map;

        // A drag on the map pans it: Bryntum's DragHelper runs the gesture (the threshold, mouse, pen and touch, the
        // release anywhere on the page, Escape). Locked on both axes, the SVG itself stays put, the drag moves the view
        me.panHelper = new DragHelper({
            callOnFunctions : true,
            outerElement    : map.element,
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

        // Not a Bryntum class, so its own `destroy()` removes them
        me.detachListeners = EventHelper.on({
            element            : svgElement,
            thisObj            : me,
            autoDetach         : false,
            pointerdown        : 'onPointerDown',
            pointermove        : 'onPinchPointer',
            pointerup          : 'onPinchPointer',
            pointercancel      : 'onPinchPointer',
            lostpointercapture : 'onPinchPointer',
            // The wheel and the trackpad zoom or pan the map, not the page
            wheel              : { handler : 'onWheel', passive : false }
        });
    }

    destroy() {
        cancelAnimationFrame(this.frame);
        this.detachListeners?.();
        this.panHelper?.destroy();
    }

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
            box   = this.map.svgElement.getBoundingClientRect(),
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
     * The wheel zooms around the pointer, as on Google Maps: a two finger scroll or a pinch on a trackpad (the browser
     * sends a pinch with `ctrlKey`, in bigger steps) and a mouse wheel. Dragging pans
     * @param {WheelEvent} event
     */
    onWheel(event) {
        const
            me    = this,
            lines = event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL,
            dy    = lines ? event.deltaY * 33 : event.deltaY;

        event.preventDefault();
        me.map.markerTip.hide();
        me.zoomAt(Math.exp(-dy * (event.ctrlKey ? 0.01 : 0.004)), event.clientX, event.clientY, lines);
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
        me.map.element.classList.add('ow-map-panning');
        me.map.markerTip.hide();
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
    // (TurbineMap#onMapClickCapture, which reads `panned`, until the next press)
    onPanEnd() {
        const me = this;

        if (me.panning) {
            me.panning = null;
            me.panned  = true;
        }

        me.map.element.classList.remove('ow-map-panning');
    }

    // A new press, a new gesture: the click that ended the last pan has gone by (see onPanEnd)
    onPointerDown(event) {
        this.panned = false;
        this.onPinchPointer(event);
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
            me                                  = this,
            { element, svgElement, wholeFarmButton } = me.map,
            zoomed                              = !isFarm(view);

        me.view = view;
        svgElement.setAttribute('viewBox', viewKey(view));
        // Text keeps its size as the map zooms in
        svgElement.style.setProperty('--ow-map-zoom', String(farmView.width / view.width));
        // Show all, whenever the view is not the whole farm
        wholeFarmButton.hidden = !zoomed;
        element.classList.toggle('ow-map-zoomed', zoomed);
    }
}
