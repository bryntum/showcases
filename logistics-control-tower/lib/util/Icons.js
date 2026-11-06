// Phosphor Icons, Light weight (MIT), the SVGs this showcase uses and no others. `?url` makes each an asset of the
// build (small ones are inlined as data URLs), so the bundle holds these few icons, not the whole set
import calendarPlus from '@phosphor-icons/core/assets/light/calendar-plus-light.svg?url';
import calendarX from '@phosphor-icons/core/assets/light/calendar-x-light.svg?url';
import check from '@phosphor-icons/core/assets/light/check-light.svg?url';
import clock from '@phosphor-icons/core/assets/light/clock-light.svg?url';
import cube from '@phosphor-icons/core/assets/light/cube-light.svg?url';
import lightning from '@phosphor-icons/core/assets/light/lightning-light.svg?url';
import magnifyingGlass from '@phosphor-icons/core/assets/light/magnifying-glass-light.svg?url';
import mapPin from '@phosphor-icons/core/assets/light/map-pin-light.svg?url';
import minus from '@phosphor-icons/core/assets/light/minus-light.svg?url';
import packageIcon from '@phosphor-icons/core/assets/light/package-light.svg?url';
import pause from '@phosphor-icons/core/assets/light/pause-light.svg?url';
import play from '@phosphor-icons/core/assets/light/play-light.svg?url';
import plus from '@phosphor-icons/core/assets/light/plus-light.svg?url';
import snowflake from '@phosphor-icons/core/assets/light/snowflake-light.svg?url';
import trayArrowDown from '@phosphor-icons/core/assets/light/tray-arrow-down-light.svg?url';
import truck from '@phosphor-icons/core/assets/light/truck-light.svg?url';
import warning from '@phosphor-icons/core/assets/light/warning-light.svg?url';

/**
 * The showcase's icons as CSS classes, `lct-icon lct-icon-{name}`. The icon is the element's mask over its text colour
 * (resources/icons.css), so one class works wherever a class can go: a Bryntum `icon` or `iconCls`, a DomConfig, and
 * the HTML of AG Grid's menus. This module registers one rule per icon, giving `--lct-icon` its SVG.
 */

const urls = {
    'calendar-plus'    : calendarPlus,
    'calendar-x'       : calendarX,
    check,
    clock,
    cube,
    lightning,
    'magnifying-glass' : magnifyingGlass,
    'map-pin'          : mapPin,
    minus,
    package            : packageIcon,
    pause,
    play,
    plus,
    snowflake,
    'tray-arrow-down'  : trayArrowDown,
    truck,
    warning
};

const sheet = new CSSStyleSheet();

sheet.replaceSync(Object.entries(urls).map(([name, url]) => `.lct-icon-${name} { --lct-icon : url("${url}"); }`).join('\n'));
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

/**
 * The classes of an icon
 * @param {String} name An icon name, `snowflake`, `warning`...
 * @returns {String}
 */
export const icon = name => `lct-icon lct-icon-${name}`;
