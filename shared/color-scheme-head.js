/**
 * The stored light / dark choice, shared by the inline head script (injected into every page by vite.config.js) and
 * color-scheme.js. No module level DOM access, so the Vite config can import it too.
 */

export const
    // The localStorage key of the choice
    storageKey  = 'bryntum-showcases-color-scheme',

    // The browser UI colour (`<meta name="theme-color">`) per mode, the page backgrounds
    themeColors = { light : '#f6f7f9', dark : '#121417' };

/**
 * Applies the stored choice before the first paint, so a page does not flash the other mode: `data-theme` and an
 * inline `color-scheme` on the root. The theme colour follows the stored choice, else the system setting. Serialized
 * into the head script, so it only uses its arguments and browser globals
 * @param {String} key The storage key
 * @param {Object<String,String>} colors The theme colour per mode
 */
export function applyStoredColorScheme(key, colors) {
    const root = document.documentElement;

    let scheme = null;

    try {
        scheme = localStorage.getItem(key);
    }
    catch {
        // No storage, the system setting applies
    }

    if (scheme === 'light' || scheme === 'dark') {
        root.dataset.theme      = scheme;
        root.style.colorScheme = scheme;
    }
    else {
        scheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors[scheme]);
}
