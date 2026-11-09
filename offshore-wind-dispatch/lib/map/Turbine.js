/**
 * The offshore wind turbine illustration, front view: monopile, the yellow transition piece with its boat landing and
 * ladder, the tapered tower, nacelle with its aviation light, and three blades that turn. The sea at its foot shows the
 * wave height against the vessel limit, the reason a technician can or cannot step across.
 *
 * Colours come from CSS custom properties (see resources/tokens.css), so one drawing works in light and dark.
 */

// One blade pointing up from the hub: a slim root, the widest chord a third out, a fine tip. Leading edge on the left
const blade = 'M -2.6 -4 C -4.6 -14 -4.2 -30 -1.4 -58 L 0.2 -59.5 C 1.6 -36 2.6 -16 2.6 -4 Z';

// The gradients, and the clip below the still water line (y 196, see turbineSvg). Their IDs start with `id`, so two
// drawings on one page (the card and the map's tooltip) each use their own
const defs = id => `
    <defs>
        <linearGradient id="${id}-tower" x1="0" x2="1">
            <stop offset="0" stop-color="var(--ow-steel-shade)"/>
            <stop offset="0.45" stop-color="var(--ow-steel)"/>
            <stop offset="1" stop-color="var(--ow-steel-shade)"/>
        </linearGradient>
        <linearGradient id="${id}-blade" x1="0" x2="1">
            <stop offset="0" stop-color="var(--ow-steel)"/>
            <stop offset="1" stop-color="var(--ow-steel-shade)"/>
        </linearGradient>
        <linearGradient id="${id}-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--ow-sea-top)"/>
            <stop offset="1" stop-color="var(--ow-sea-deep)"/>
        </linearGradient>
        <clipPath id="${id}-below"><rect x="0" y="196" width="160" height="40"/></clipPath>
    </defs>`;

/**
 * @param {Object} [options]
 * @param {Number} [options.hs] The wave height to draw, in metres (0.5 to 2.5)
 * @param {Number} [options.limit] The vessel limit, drawn as a dashed line on the transition piece
 * @param {Boolean} [options.spin] Turn the blades
 * @param {String} [options.id] Prefix of the IDs of its gradients, unique per drawing on the page
 * @returns {String} SVG markup
 */
export function turbineSvg({ hs = 1.1, limit = 1.5, spin = true, id = 'ow' } = {}) {
    const
        // The still water line, and 7 px per metre of wave height (exaggerated, it is a picture)
        sea    = 196,
        scale  = 7,
        crest  = sea - hs * scale / 2,
        trough = sea + hs * scale / 2,
        mark   = sea - limit * scale / 2,
        // One wavelength every 20 px, crest then trough
        waves  = Array.from({ length : 9 }, (_, i) => {
            const x = i * 20 - 10;

            return `Q ${x + 5} ${crest} ${x + 10} ${sea} Q ${x + 15} ${trough} ${x + 20} ${sea}`;
        }).join(' ');

    return `
<svg class="ow-turbine" viewBox="0 0 160 230" role="img" aria-label="Offshore wind turbine, wave height ${hs} metres">
    ${defs(id)}

    <!-- Monopile under water, seen through the sea -->
    <rect x="73" y="186" width="14" height="44" fill="var(--ow-steel-shade)" opacity="0.6"/>

    <!-- Transition piece: yellow, the work platform on top, the boat landing and ladder on the side -->
    <rect x="71" y="164" width="18" height="32" rx="1" fill="var(--ow-yellow)"/>
    <rect x="64" y="162" width="32" height="3" rx="1" fill="var(--ow-yellow-shade)"/>
    <path d="M64 162 v-5 M96 162 v-5 M64 157.5 h32" stroke="var(--ow-yellow-shade)" stroke-width="1.2" fill="none"/>
    <g stroke="var(--ow-ink)" stroke-width="1" opacity="0.75">
        <path d="M90 166 V205 M94 166 V205"/>
        <path d="M90 170 h4 M90 175 h4 M90 180 h4 M90 185 h4 M90 190 h4 M90 195 h4 M90 200 h4"/>
    </g>

    <!-- The vessel limit on the boat landing: above this wave height a crew transfer vessel cannot push on -->
    <path d="M58 ${mark} H102" stroke="var(--ow-limit)" stroke-width="1.2" stroke-dasharray="3 2"/>
    <text x="104" y="${mark + 3}" class="ow-turbine-label">${limit.toFixed(1)} m</text>

    <!-- Tower: tapered, lit from the left -->
    <path d="M73.5 164 L76.6 54 H83.4 L86.5 164 Z" fill="url(#${id}-tower)"/>

    <!-- Nacelle behind the hub, and its aviation light -->
    <rect x="72" y="44" width="16" height="11" rx="3" fill="var(--ow-steel-shade)"/>
    <circle cx="80" cy="42.5" r="1.6" fill="var(--ow-beacon)" class="ow-turbine-beacon"/>

    <!-- Rotor -->
    <g transform="translate(80 50)">
        <g class="${spin ? 'ow-turbine-rotor' : ''}">
            <path d="${blade}" fill="url(#${id}-blade)"/>
            <path d="${blade}" fill="url(#${id}-blade)" transform="rotate(120)"/>
            <path d="${blade}" fill="url(#${id}-blade)" transform="rotate(240)"/>
            <circle r="4.6" fill="var(--ow-steel)" stroke="var(--ow-steel-shade)" stroke-width="0.8"/>
        </g>
    </g>

    <!-- Sea: the waves at today's height, the water under them, the pile showing through -->
    <path d="M -10 ${sea} ${waves} V 230 H -10 Z" fill="url(#${id}-water)" opacity="0.92"/>
    <path d="M -10 ${sea} ${waves}" fill="none" stroke="var(--ow-sea-foam)" stroke-width="1"/>
    <rect x="73" y="${sea}" width="14" height="34" fill="var(--ow-steel-shade)" opacity="0.35" clip-path="url(#${id}-below)"/>
    <text x="6" y="${crest - 4}" class="ow-turbine-label">Hs ${hs.toFixed(1)} m</text>
</svg>`;
}

/**
 * The small map marker: a disc in the status colour with a three blade glyph. An option of the map's listbox, which
 * moves the focus between them (TurbineMap); the map's tooltip describes it
 * @param {Number} x
 * @param {Number} y
 * @param {String} cls Status class
 * @param {String} id Turbine ID
 * @returns {String}
 */
export function turbineMarker(x, y, cls, id) {
    return `
<g class="ow-marker ${cls}" transform="translate(${x} ${y})" data-turbine="${id}" role="option" tabindex="-1"
    aria-selected="false" aria-label="${id}">
    <circle class="ow-marker-halo" r="11"/>
    <circle class="ow-marker-disc" r="6.5"/>
    <path class="ow-marker-glyph" d="M0 0 L0 -5 M0 0 L4.3 2.5 M0 0 L-4.3 2.5"/>
</g>`;
}
