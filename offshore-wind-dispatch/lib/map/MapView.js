import { mapXY } from '../plan/Farm.js';

/**
 * The viewBox arithmetic of the map: which part of the farm is shown. Plain functions on plain
 * `{ x, y, width, height }` views, all at the farm's aspect ratio and inside the farm (MapViewport moves the SVG's
 * view between them)
 */

// The whole farm, the SVG's own viewBox, also the furthest the map zooms out
export const farmView = Object.freeze({ x : 0, y : 0, width : 440, height : 330 });

// The port's marker and its label, kept in view when fitted to a trip
const portBox = { x1 : 4, y1 : 288, x2 : 140, y2 : 310 };

export const
    aspect      = farmView.width / farmView.height,
    // Room around the fitted turbines for their labels, the closest a fit zooms in, the closest the user zooms in
    fitPad      = 26,
    minWidth    = 220,
    zoomInWidth = 70,
    viewKey     = ({ x, y, width, height }) => [x, y, width, height].map(n => Number(n.toFixed(1))).join(' '),
    isFarm      = view => view.width >= farmView.width - 0.5,
    clamp       = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * A view of the farm's aspect ratio, `width` wide, kept inside the farm
 * @param {Number} x
 * @param {Number} y
 * @param {Number} width
 * @returns {Object} `{ x, y, width, height }`
 */
export function boundedView(x, y, width) {
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
export function fitView(ids) {
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
