import { storageKey, themeColors } from './color-scheme-head.js';

/**
 * The light / dark choice shared by the gallery and every showcase: one stored preference and a sun / moon toggle.
 * Without a stored choice the page follows the system. No Bryntum dependency, the gallery uses it too.
 */

const
    systemDark = window.matchMedia('(prefers-color-scheme: dark)'),
    svgNs      = 'http://www.w3.org/2000/svg',
    // 24 x 24 stroked line icons, by the mode the button switches to
    icons      = {
        light : 'M12 3v2M12 19v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M3 12h2M19 12h2M4.22 19.78l1.42-1.42' +
            'M18.36 5.64l1.42-1.42M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
        dark : 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'
    },
    svgAttributes = {
        viewBox           : '0 0 24 24',
        fill              : 'none',
        stroke            : 'currentColor',
        'stroke-width'    : 2,
        'stroke-linecap'  : 'round',
        'stroke-linejoin' : 'round',
        'aria-hidden'     : 'true'
    };

// The default `apply`, an inline `color-scheme` on the root, as the head script sets it
const applyToRoot = scheme => document.documentElement.style.colorScheme = scheme;

// The choice made on this page, which still holds when storage is unavailable
let pageChoice = null;

/**
 * The stored light / dark choice, `null` when there is none or storage is unavailable
 * @returns {'light'|'dark'|null}
 */
export function storedColorScheme() {
    try {
        const scheme = localStorage.getItem(storageKey);

        return scheme === 'light' || scheme === 'dark' ? scheme : null;
    }
    catch {
        return null;
    }
}

/**
 * A sun / moon button switching light and dark, styled by icon-button.css. A click stores the choice, a choice made
 * on another page (another tab, or before the Back button) is followed too
 * @param {Object} [options]
 * @param {Function} [options.apply] Puts `'light'` or `'dark'` on the page, by default as the root's `color-scheme`
 * @returns {HTMLButtonElement}
 */
export function createColorSchemeToggle({ apply = applyToRoot } = {}) {
    const
        button = document.createElement('button'),
        svg    = document.createElementNS(svgNs, 'svg'),
        path   = document.createElementNS(svgNs, 'path'),
        active = () => storedColorScheme() ?? pageChoice ?? (systemDark.matches ? 'dark' : 'light'),
        // The icon, the label and the browser UI colour follow the mode
        sync   = () => {
            const target = active() === 'dark' ? 'light' : 'dark';

            path.setAttribute('d', icons[target]);
            button.title = `Switch to ${target} mode`;
            button.setAttribute('aria-label', button.title);
            document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors[active()]);
        },
        // The page first, then `data-theme`, which the page styles may key on
        applyScheme = scheme => {
            if (scheme) {
                apply(scheme);
                document.documentElement.dataset.theme = scheme;
            }
            sync();
        };

    button.type      = 'button';
    button.className = 'sc-icon-button sc-scheme-toggle';
    Object.entries(svgAttributes).forEach(([name, value]) => svg.setAttribute(name, value));
    svg.append(path);
    button.append(svg);

    button.addEventListener('click', () => {
        pageChoice = active() === 'dark' ? 'light' : 'dark';

        try {
            localStorage.setItem(storageKey, pageChoice);
        }
        catch {
            // Storage unavailable, the choice holds for this page only
        }

        applyScheme(pageChoice);
    });

    window.addEventListener('storage', ({ key }) => key === storageKey && applyScheme(storedColorScheme()));
    window.addEventListener('pageshow', ({ persisted }) => persisted && applyScheme(storedColorScheme() ?? pageChoice));
    systemDark.addEventListener('change', sync);
    sync();

    return button;
}
