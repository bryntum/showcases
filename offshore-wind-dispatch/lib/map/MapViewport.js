import { DragHelper, EventHelper } from '@bryntum/core-enterprise';
import { aspect, boundedView, clamp, farmView, fitView, isFarm, viewKey, zoomInWidth } from './MapView.js';

const
    // A press that moves this many px pans the map, less is a click
    panThreshold = 4,
    // Milliseconds to fit a selection, and to follow a wheel notch
    fitMs        = 450,
    zoomMs       = 180;

/**
 * Zoom and pan of the TurbineMap by moving its SVG's viewBox: the wheel, a two finger scroll and a pinch zoom around
 * the pointer, a drag (Bryntum's DragHelper) pans. The view arithmetic is in MapView. Not a widget: it works on the
 * SVG, the Show all button and the tooltip of the map that owns it.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/helper/DragHelper
 */
export default class MapViewport {
    /**
     * @param {Object} options
     * @param {TurbineMap} options.map Uses its `element`, `svgElement`, `markerTip` and `wholeFarmButton`
     */
    constructor({ map }) {
        const me = this;

        me.map  = map;
        me.view = { ...farmView };

        const { svgElement } = map;

        // DragHelper runs the gesture (threshold, mouse, pen and touch, release anywhere, Escape). Locked on both axes,
        // so the SVG itself stays put and the drag moves the view
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
            // The wheel and the trackpad zoom the map, not the page
            wheel              : { handler : 'onWheel', passive : false }
        });
    }

    destroy() {
        cancelAnimationFrame(this.frame);
        this.detachListeners?.();
        this.panHelper?.destroy();
    }

    fitTo(ids) {
        this.animateTo(ids?.length ? fitView(ids) : farmView, fitMs);
    }

    /**
     * @param {Object} target `{ x, y, width, height }`
     * @param {Number} duration Milliseconds, ignored with reduced motion (the view jumps)
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

    stopAnimation() {
        cancelAnimationFrame(this.frame);
        this.frame = this.target = null;
    }

    /**
     * Where the SVG shows a viewBox on the screen, scaled to fit and centred (`xMidYMid meet`)
     * @param {Object} [view] `{ width, height }`
     * @returns {Object} `{ scale, left, top }`: px per map unit, and the view's top left in client px
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
     * Zooms around a point of the screen, which stays over the same point of the farm
     * @param {Number} factor Above 1 zooms in
     * @param {Number} clientX
     * @param {Number} clientY
     * @param {Boolean} [animate] Eased for a wheel notch; a trackpad or finger pinch comes in small steps of its own
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

    // Moves the view by a distance in screen px, kept within the farm
    panBy(dx, dy, from = this.view) {
        const { scale } = this.screenOf(from);

        this.setView(boundedView(from.x - dx / scale, from.y - dy / scale, from.width));
    }

    // A trackpad pinch arrives as a wheel event with `ctrlKey`, in bigger steps than a two finger scroll. Line or page
    // deltas (a mouse wheel) are notches, eased
    onWheel(event) {
        const
            me    = this,
            lines = event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL,
            dy    = lines ? event.deltaY * 33 : event.deltaY;

        event.preventDefault();
        me.map.markerTip.hide();
        me.zoomAt(Math.exp(-dy * (event.ctrlKey ? 0.01 : 0.004)), event.clientX, event.clientY, lines);
    }

    // DragHelper's `dragStart`. The pan moves from the view at its start
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

    // DragHelper's `drag`
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

    // Two fingers on a touch screen zoom around their midpoint and move with it. The second finger takes over from a
    // pan of the first
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
        wholeFarmButton.hidden = !zoomed;
        element.classList.toggle('ow-map-zoomed', zoomed);
    }
}
