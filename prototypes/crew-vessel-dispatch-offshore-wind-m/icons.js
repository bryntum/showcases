/**
 * The look's icons, one set drawn in one weight: Phosphor Light (MIT, `@phosphor-icons/core`, the set Logistics Control
 * Tower uses) for the generic ones, and five drawn here in the same 256 grid and 12 unit line for what Phosphor lacks:
 * the crew transfer vessel, the SWATH vessel, the helicopter, the offshore substation and the turbine.
 *
 * Every icon is inline SVG in `currentColor`, so it takes the colour of its text in light and dark.
 */
import anchor from '@phosphor-icons/core/assets/light/anchor-simple-light.svg?raw';
import arrowUndo from '@phosphor-icons/core/assets/light/arrow-u-up-left-light.svg?raw';
import broadcast from '@phosphor-icons/core/assets/light/broadcast-light.svg?raw';
import caretDown from '@phosphor-icons/core/assets/light/caret-down-light.svg?raw';
import checkCircle from '@phosphor-icons/core/assets/light/check-circle-light.svg?raw';
import handGrabbing from '@phosphor-icons/core/assets/light/hand-grabbing-light.svg?raw';
import warning from '@phosphor-icons/core/assets/light/warning-light.svg?raw';
import waves from '@phosphor-icons/core/assets/light/waves-light.svg?raw';
import wind from '@phosphor-icons/core/assets/light/wind-light.svg?raw';

// The drawn icons: stroked paths in Phosphor Light's grid (256) and line (12), round caps and joins
const drawn = {
    // Crew transfer vessel, side view, bow to the right: the hull with its bow fender, the wheelhouse forward, the mast
    ctv : `
        <path d="M28 150 H206 C222 150 232 156 236 166 L228 180 H44 Z"/>
        <path d="M110 150 V112 H178 L200 150"/>
        <path d="M124 128 H186"/>
        <path d="M146 112 V84 M136 92 H156"/>
        <path d="M20 212 C36 202 52 202 68 212 S100 222 116 212 148 202 164 212 196 222 212 212 236 206 236 206"/>`,
    // SWATH vessel: the deck box high on two struts, the pontoon under the water line
    swath : `
        <path d="M36 112 H212 L224 140 H48 Z"/>
        <path d="M92 112 V84 H164 L180 112"/>
        <path d="M84 140 V176 M184 140 V176"/>
        <path d="M20 168 C36 160 52 160 68 168 S100 176 116 168 148 160 164 168 196 176 212 168 236 164 236 164"/>
        <rect x="56" y="186" width="156" height="22" rx="11"/>`,
    // Helicopter, side view, nose to the right: cabin with its window, the tail boom and rotor, skids, the main rotor
    heli : `
        <path d="M84 116 H164 C196 116 220 136 220 160 C220 170 212 176 200 176 H100 C88 176 80 168 80 156 V120"/>
        <path d="M170 124 C192 128 206 140 210 156 H170 Z"/>
        <path d="M84 136 H28 L20 108"/>
        <circle cx="22" cy="108" r="12"/>
        <path d="M132 116 V92 M44 92 H228"/>
        <path d="M108 176 V200 M188 176 V200 M84 200 H220"/>`,
    // Offshore substation: the topsides with the lightning bolt, the jacket legs and their bracing
    substation : `
        <rect x="64" y="40" width="128" height="88" rx="8"/>
        <path d="M136 56 L112 88 H144 L120 116"/>
        <path d="M88 128 L72 224 M168 128 L184 224 M82 164 L176 200 M174 164 L80 200"/>`,
    // Wind turbine: tower, three blades from the hub
    turbine : `
        <path d="M120 112 L114 228 H142 L136 112"/>
        <circle cx="128" cy="96" r="12"/>
        <path d="M128 84 L128 20 M138 102 L194 134 M118 102 L62 134"/>`
};

const phosphor = {
    anchor,
    'arrow-undo'    : arrowUndo,
    broadcast,
    'caret-down'    : caretDown,
    'check-circle'  : checkCircle,
    'hand-grabbing' : handGrabbing,
    warning,
    waves,
    wind
};

/**
 * An icon as inline SVG
 * @param {String} name A Phosphor name above, or `ctv`, `swath`, `heli`, `substation`, `turbine`
 * @param {String} [cls] Extra classes
 * @returns {String}
 */
export function icon(name, cls = '') {
    const classes = `ow-icon ow-icon-${name} ${cls}`.trim();

    if (drawn[name]) {
        return `<svg class="${classes}" viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="12"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawn[name]}</svg>`;
    }

    return phosphor[name].replace('<svg ', `<svg class="${classes}" aria-hidden="true" `);
}
