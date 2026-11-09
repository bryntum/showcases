/**
 * The showcase's icons, one set drawn in one weight: Phosphor Light (MIT, `@phosphor-icons/core`, the set Logistics
 * Control Tower uses) for the generic ones, Tabler Icons (MIT, below) for the vessels and the helicopter, and two drawn
 * here in Phosphor's 256 grid and 12 unit line for what neither has: the offshore substation and the turbine.
 *
 * Every icon is inline SVG in `currentColor`, so it takes the colour of its text in light and dark. `?raw` imports
 * the few SVGs used as strings, the bundle holds these and no others.
 */
import anchor from '@phosphor-icons/core/assets/light/anchor-simple-light.svg?raw';
import arrowUndo from '@phosphor-icons/core/assets/light/arrow-u-up-left-light.svg?raw';
import broadcast from '@phosphor-icons/core/assets/light/broadcast-light.svg?raw';
import caretDown from '@phosphor-icons/core/assets/light/caret-down-light.svg?raw';
import checkCircle from '@phosphor-icons/core/assets/light/check-circle-light.svg?raw';
import handGrabbing from '@phosphor-icons/core/assets/light/hand-grabbing-light.svg?raw';
import hardHat from '@phosphor-icons/core/assets/light/hard-hat-light.svg?raw';
import warning from '@phosphor-icons/core/assets/light/warning-light.svg?raw';
import waves from '@phosphor-icons/core/assets/light/waves-light.svg?raw';
import wind from '@phosphor-icons/core/assets/light/wind-light.svg?raw';
import wrench from '@phosphor-icons/core/assets/light/wrench-light.svg?raw';

/*
 * The transport icons, from Tabler Icons 3.51.0 (outline: speedboat, ship, helicopter), drawn in a lighter line to sit
 * with Phosphor Light. MIT License, Copyright (c) 2020-2026 Paweł Kuna, https://github.com/tabler/tabler-icons
 */
const tabler = {
    // Crew transfer vessel
    ctv : `
        <path d="M2 17h14.4a3 3 0 0 0 2.5 -1.34l3.1 -4.66h-6.23a4 4 0 0 0 -1.49 .29l-3.56 1.42a4 4 0 0 1 -1.49 .29h-5.73l-1.5 4"/>
        <path d="M6 13l1.5 -5"/>
        <path d="M6 8h8l2 3"/>`,
    // SWATH vessel
    swath : `
        <path d="M2 20a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1"/>
        <path d="M4 18l-1 -5h18l-2 4"/>
        <path d="M5 13v-6h8l4 6"/>
        <path d="M7 7v-4h-1"/>`,
    heli : `
        <path d="M3 10l1 2h6"/>
        <path d="M12 9a2 2 0 0 0 -2 2v3c0 1.1 .9 2 2 2h7a2 2 0 0 0 2 -2c0 -3.31 -3.13 -5 -7 -5h-2"/>
        <path d="M13 9l0 -3"/>
        <path d="M5 6l15 0"/>
        <path d="M15 9.1v3.9h5.5"/>
        <path d="M15 19l0 -3"/>
        <path d="M19 19l-8 0"/>`
};

// The drawn icons: stroked paths in Phosphor Light's grid (256) and line (12), round caps and joins
const drawn = {
    // A square platform with a lightning bolt
    substation : `
        <rect x="28" y="28" width="200" height="200" rx="16"/>
        <path d="M142 56 L88 140 H128 L114 200 L168 116 H128 Z"/>`,
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
    'hard-hat'      : hardHat,
    warning,
    waves,
    wind,
    wrench
};

/**
 * The path data of a one path Phosphor icon, in its 256 grid, to draw it inside another SVG (the map's markers, the
 * turbine illustration)
 * @param {String} name A Phosphor name above
 * @returns {String}
 */
export function iconPath(name) {
    return phosphor[name].match(/\sd="([^"]+)"/)[1];
}

/**
 * An icon as inline SVG
 * @param {String} name A Phosphor name above, or `ctv`, `swath`, `heli`, `substation`, `turbine`
 * @param {String} [cls] Extra classes
 * @returns {String}
 */
export function icon(name, cls = '') {
    const classes = `ow-icon ow-icon-${name} ${cls}`.trim();

    if (tabler[name]) {
        return `<svg class="${classes}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${tabler[name]}</svg>`;
    }

    if (drawn[name]) {
        return `<svg class="${classes}" viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="12"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawn[name]}</svg>`;
    }

    return phosphor[name].replace('<svg ', `<svg class="${classes}" aria-hidden="true" `);
}
