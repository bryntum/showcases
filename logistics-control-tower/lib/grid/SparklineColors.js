/**
 * The colours of the ETA drift sparklines, the status colours of the theme (resources/tokens.css). AG Charts draws on
 * a canvas, which does not resolve CSS variables, so they are resolved here, to plain `rgb()`, and again when the page
 * switches between light and dark mode.
 *
 * Learn more:
 * https://www.ag-grid.com/javascript-data-grid/sparklines-overview/
 */

const
    // The token per status, the other statuses draw in the faint ink
    tokens = { 'on-time' : '--lct-on-time', 'at-risk' : '--lct-at-risk', late : '--lct-late' },
    other  = '--lct-ink-faint';

/**
 * Resolves the status colours inside an element of the app, where the tokens are defined
 * @param {HTMLElement} element
 * @param {String[]} statuses
 * @returns {Object<String,String>} `rgb()` colours by status
 */
export function resolveSparklineColors(element, statuses) {
    const
        probe   = document.createElement('span'),
        canvas  = new OffscreenCanvas(1, 1),
        context = canvas.getContext('2d', { willReadFrequently : true }),
        // The computed colour can be a light-dark() pick of a color-mix(), drawn to a pixel it is plain rgb
        resolve = token => {
            probe.style.color = `var(${token})`;
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = getComputedStyle(probe).color;
            context.fillRect(0, 0, 1, 1);

            const [r, g, b] = context.getImageData(0, 0, 1, 1).data;

            return `rgb(${r} ${g} ${b})`;
        };

    element.append(probe);

    const colors = Object.fromEntries(statuses.map(status => [status, resolve(tokens[status] ?? other)]));

    probe.remove();

    return colors;
}

/**
 * Calls `fn` when the page switches between light and dark mode: the system setting, or the shell's switch, which sets
 * the root's `color-scheme` and `data-theme`
 * @param {Function} fn
 * @returns {Function} Stops watching
 */
export function onColorSchemeChange(fn) {
    const
        media    = matchMedia('(prefers-color-scheme: dark)'),
        observer = new MutationObserver(fn);

    observer.observe(document.documentElement, { attributes : true, attributeFilter : ['style', 'data-theme'] });
    media.addEventListener('change', fn);

    return () => {
        observer.disconnect();
        media.removeEventListener('change', fn);
    };
}
