/**
 * Inline SVG glyphs, as DomConfig: line-art work center icons, top-down car silhouettes and progress rings. Colors
 * come from CSS (currentColor, the status colour and the tokens in the resources CSS), the SVG markup only holds the
 * shapes.
 *
 * Learn more:
 * https://bryntum.com/products/scheduler/docs/api/Core/helper/DomHelper#typedef-DomConfig
 */

/**
 * SVG namespace of the DomConfigs in this demo (glyphs, gap indicators, charging curves and slip charts)
 */
export const svgNs = 'http://www.w3.org/2000/svg';

const
    svg    = (cls, viewBox, children) => ({ tag : 'svg', ns : svgNs, class : cls, viewBox, 'aria-hidden' : 'true', children }),
    path   = (d, cls) => ({ tag : 'path', ns : svgNs, d, class : cls }),
    rect   = (x, y, width, height, rx, cls) => ({ tag : 'rect', ns : svgNs, x, y, width, height, rx, class : cls }),
    circle = (cx, cy, r, cls) => ({ tag : 'circle', ns : svgNs, cx, cy, r, class : cls }),

    // 24 x 24 line art, stroked in currentColor (see .ev-station-glyph in production.css)
    stationShapes = {
        // Casting press: frame, crown, ram and die
        press : [
            path('M3 21h18M6 21V6M18 21V6'),
            rect(4.5, 3, 15, 3, 0.8),
            rect(8.5, 6, 7, 4.5, 0.6),
            path('M12 10.5v2.5'),
            rect(8, 15, 8, 3, 0.6)
        ],
        // Weld robot: base, two arm links and the torch with sparks
        weld : [
            path('M4 21h9'),
            rect(5.5, 18, 6, 3, 0.8),
            path('M8.5 16.5 12.5 8.5 18.5 11.5l1 3'),
            circle(8.5, 16.5, 1.6),
            circle(12.5, 8.5, 1.6),
            path('M20.6 16.8l.9 1.3M18.6 17.4l-.6 1.4M21.4 15.2l1.4.2')
        ],
        // Paint booth: enclosure, spray gun and mist
        paint : [
            path('M3 20.5V9l9-5 9 5v11.5M2 20.5h20'),
            path('M6 15h3.5l1.2-1.2M7.5 15v2.5'),
            circle(13.6, 12.6, 0.7),
            circle(15.6, 14.6, 0.7),
            circle(13.6, 16.4, 0.7),
            circle(17.4, 12.4, 0.7),
            circle(17.6, 16.6, 0.7)
        ],
        // Assembly line: conveyor with rollers and a generic body on top
        assembly : [
            rect(2.5, 16.5, 19, 4, 2),
            circle(6.5, 18.5, 0.8),
            circle(12, 18.5, 0.8),
            circle(17.5, 18.5, 0.8),
            path('M5 16.5V14l2.6-3.5h6.2L17 14h2v2.5'),
            path('M9 10.5V14h7')
        ],
        // End of line test: a passed check
        test : [
            rect(4, 4, 16, 16, 3),
            path('M8.2 12.3l2.6 2.6 5-5.4')
        ]
    },

    // 24 x 24 line icons of the progress rings, stroked in the status colour (see .ev-ring-icon in ring.css)
    ringShapes = {
        // Wrench, a lift bay
        wrench  : ['M14.5 4.2a4.6 4.6 0 0 0-4.3 6.2l-6 6a1.7 1.7 0 0 0 2.4 2.4l6-6a4.6 4.6 0 0 0 6.2-4.3l-2.7 2.7-2.4-.6-.6-2.4Z'],
        // Van, mobile service
        van     : ['M3 16.5V8.2c0-.9.7-1.7 1.7-1.7H14l4.2 4.2h1.1c.9 0 1.7.8 1.7 1.7v4.1h-2', 'M9.3 16.5h5.4', 'M14 6.5v4.2h4.2', 'M7 18.6a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM17 18.6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z'],
        // Bolt, a DC charger
        charger : ['M13.2 3 5.5 13.4h6L10.8 21l7.7-10.4h-6Z']
    },

    // Path coordinates, rounded to 2 decimals
    serviceCarNum = value => Number(value.toFixed(2)),

    /**
     * Rounded top-down outline, symmetric around y = 14: a rounded nose of length `front` (squarer with a larger
     * `frontK`), sides narrowing by `taper` towards the front, and rounded rear corners
     */
    serviceCarOutline = ({ x0, x1, hw, taper = 0, front, frontK = 0.552, rearX, rearY = rearX, rearK = 0.552 }) => {
        const
            n  = serviceCarNum,
            t  = 14 - hw,
            b  = 14 + hw,
            fh = hw - taper,
            fc = x1 - front * (1 - frontK),
            rc = x0 + rearX * (1 - rearK);

        return `M${n(x0 + rearX)} ${n(t)}L${n(x1 - front)} ${n(t + taper)}C${n(fc)} ${n(t + taper)} ${n(x1)} ${n(14 - fh * (1 - frontK))} ${n(x1)} 14` +
            `C${n(x1)} ${n(14 + fh * (1 - frontK))} ${n(fc)} ${n(b - taper)} ${n(x1 - front)} ${n(b - taper)}` +
            `L${n(x0 + rearX)} ${n(b)}C${n(rc)} ${n(b)} ${n(x0)} ${n(b - rearY * (1 - rearK))} ${n(x0)} ${n(b - rearY)}` +
            `L${n(x0)} ${n(t + rearY)}C${n(x0)} ${n(t + rearY * (1 - rearK))} ${n(rc)} ${n(t)} ${n(x0 + rearX)} ${n(t)}Z`;
    },

    // Tyres peeking out under the body sides, at the front and rear axles
    serviceCarWheels = (axles, hw, length = 7, rx = 0.8) => axles.flatMap(x => [
        rect(serviceCarNum(x - length / 2), serviceCarNum(13.1 - hw), length, 1.8, rx, 'ev-car-wheel'),
        rect(serviceCarNum(x - length / 2), serviceCarNum(13.1 + hw), length, 1.8, rx, 'ev-car-wheel')
    ]),

    // Door mirrors at the windshield base, drawn under the shell so only the outer half shows
    serviceCarMirrors = (x, hw) => [-1, 1].map(side => {
        const
            n    = serviceCarNum,
            edge = 14 - side * (hw - 0.6),
            out  = 14 - side * (hw + 1.3);

        return path(`M${n(x)} ${n(edge)}Q${n(x)} ${n(out)} ${n(x + 1.2)} ${n(out)}L${n(x + 2.8)} ${n(edge)}Z`, 'ev-car-shell');
    }),

    // Generic 64 x 28 top-down bodies pointing right (front at the right), each with its own proportions and glass
    // layout so the five read apart at 76px
    carShapes = {
        // Compact sedan: short trunk, one glass panel from the windshield to the rear window
        sedan : {
            hw    : 10.5,
            shell : serviceCarOutline({
                x0     : 2.25,
                x1     : 61.75,
                hw     : 10.5,
                taper  : 0.9,
                front  : 10,
                frontK : 0.6,
                rearX  : 5.5,
                rearY  : 6,
                rearK  : 0.5
            }),
            glass : [serviceCarOutline({
                x0    : 16.5,
                x1    : 44.5,
                hw    : 7.2,
                taper : 0.5,
                front : 5,
                rearX : 3.5,
                rearY : 4.5
            })],
            axles   : [51.1, 14.9],
            mirrors : 40,
            port    : [7.2, 6.1]
        },
        // Longer and a little wider, a long hood and the liftback glass reaching further back
        liftback : {
            hw    : 10.9,
            shell : serviceCarOutline({
                x0     : 1.5,
                x1     : 62.5,
                hw     : 10.9,
                taper  : 1.4,
                front  : 12,
                frontK : 0.58,
                rearX  : 5,
                rearY  : 5.5
            }),
            glass : [serviceCarOutline({
                x0    : 8.5,
                x1    : 42.5,
                hw    : 7.6,
                taper : -0.4,
                front : 5.5,
                rearX : 7,
                rearY : 5.5,
                rearK : 0.5
            })],
            axles   : [50.8, 14.4],
            mirrors : 39.5,
            port    : [6.4, 5.7]
        },
        // Wider and rounder, a short hood and a long roof glass down to the hatch
        crossover : {
            hw    : 11.8,
            shell : serviceCarOutline({
                x0     : 2,
                x1     : 62,
                hw     : 11.8,
                taper  : 1.4,
                front  : 9,
                frontK : 0.62,
                rearX  : 4.5,
                rearY  : 5,
                rearK  : 0.7
            }),
            glass : [serviceCarOutline({
                x0     : 7.5,
                x1     : 45.5,
                hw     : 8.9,
                taper  : 0.5,
                front  : 6,
                frontK : 0.62,
                rearX  : 3,
                rearY  : 3.5,
                rearK  : 0.7
            })],
            axles   : [51.5, 15],
            mirrors : 41,
            port    : [7.6, 5.4]
        },
        // Boxy: squared corners, a windshield, a painted roof with roof rails and a rear window
        suv : {
            hw    : 11.8,
            shell : serviceCarOutline({
                x0     : 1.5,
                x1     : 62.5,
                hw     : 11.8,
                taper  : 0.8,
                front  : 8,
                frontK : 0.72,
                rearX  : 3.5,
                rearY  : 4,
                rearK  : 0.65
            }),
            glass : [
                serviceCarOutline({ x0 : 37.5, x1 : 47, hw : 9.2, taper : 0.8, front : 3, rearX : 1.2, rearY : 1.5 }),
                serviceCarOutline({ x0 : 5.5, x1 : 10.5, hw : 8.6, front : 1.2, rearX : 2, rearY : 2.5 })
            ],
            seams   : ['M12 5.4H36', 'M12 22.6H36'],
            axles   : [51.5, 14],
            mirrors : 42,
            port    : [5.6, 5]
        },
        // Pickup: rounded hood, a cab with windshield and rear window, and an open bed behind it
        pickup : {
            hw    : 11.4,
            shell : serviceCarOutline({
                x0     : 1.5,
                x1     : 62.5,
                hw     : 11.4,
                taper  : 0.8,
                front  : 8,
                frontK : 0.68,
                rearX  : 2.5,
                rearY  : 2.5,
                rearK  : 0.6
            }),
            glass : [
                serviceCarOutline({ x0 : 38.5, x1 : 46.5, hw : 8.8, taper : 0.7, front : 2.6, rearX : 1, rearY : 1.5 }),
                'M28.6 6.8H30.6V21.2H28.6Z'
            ],
            bed     : 'M5.2 4.4H25.6V23.6H5.2Q4.2 23.6 4.2 22.6V5.4Q4.2 4.4 5.2 4.4Z',
            axles   : [52.5, 13],
            mirrors : 43.5,
            port    : [36, 5]
        }
    };

/**
 * Line-art glyph for a work center type
 * @param {String} type 'press', 'weld', 'paint', 'assembly' or 'test'
 * @returns {DomConfig}
 */
export const stationGlyph = type => svg('ev-station-glyph', '0 0 24 24', stationShapes[type] || stationShapes.assembly);

/**
 * Top-down car silhouette
 * @param {Object} options
 * @param {String} options.body 'sedan', 'liftback', 'crossover', 'suv' or 'pickup'
 * @param {String} [options.paint] Paint token, see .ev-paint-* in service.css
 * @param {Boolean} [options.charging] Shows the glowing charge port
 * @returns {DomConfig}
 */
export const carSilhouette = ({ body, paint, charging }) => {
    // An unknown body type gets the first silhouette
    const shape = carShapes[body] || Object.values(carShapes)[0];

    return svg({ 'ev-car' : 1, [`ev-car-${body}`] : Boolean(body), [`ev-paint-${paint}`] : Boolean(paint) }, '0 0 64 28', [
        ...serviceCarWheels(shape.axles, shape.hw),
        ...serviceCarMirrors(shape.mirrors, shape.hw),
        path(shape.shell, 'ev-car-shell'),
        shape.bed && path(shape.bed, 'ev-car-bed'),
        ...shape.glass.map(d => path(d, 'ev-car-glass')),
        ...(shape.seams || []).map(d => path(d, 'ev-car-seam')),
        charging && circle(...shape.port, 1, 'ev-car-port')
    ]);
};

/**
 * Progress ring with a line icon: a track ring with a progress arc in the status colour (clockwise from 12 o'clock)
 * around a tinted disc holding the icon. Used by the Service view's bays and chargers, and as a mini ring by the
 * Program view's groups. Colours come from the `ev-status-*` class, see .ev-ring in ring.css
 * @param {Object} options
 * @param {String} [options.icon] 'wrench', 'van' or 'charger'
 * @param {Number|null} options.fraction Progress 0-1, `null` for no arc
 * @param {String} options.status Status key, sets the colour through its `ev-status-*` class
 * @param {'mini'} [options.size] The 18px variant, a ring only (no disc, no icon)
 * @returns {DomConfig}
 */
export const progressRing = ({ icon, fraction, status, size }) => {
    const
        mini   = size === 'mini',
        center = mini ? 9 : 20,
        r      = mini ? 7.75 : 18.5;

    return {
        tag      : 'span',
        class    : { 'ev-ring' : 1, 'ev-ring-mini' : mini, [`ev-status-${status}`] : 1 },
        children : [
            svg('ev-ring-svg', `0 0 ${center * 2} ${center * 2}`, [
                !mini && circle(center, center, 14, 'ev-ring-disc'),
                circle(center, center, r, 'ev-ring-track'),
                fraction > 0 && {
                    ...circle(center, center, r, 'ev-ring-arc'),
                    pathLength         : 100,
                    'stroke-dasharray' : `${Math.min(100, fraction * 100).toFixed(1)} 100`,
                    transform          : `rotate(-90 ${center} ${center})`
                }
            ]),
            !mini && svg('ev-ring-icon', '0 0 24 24', (ringShapes[icon] || ringShapes.wrench).map(d => path(d)))
        ]
    };
};
