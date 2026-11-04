/**
 * Text measuring in the app's font, so the renderers can decide what fits a bar before it renders (progressive
 * disclosure). Each distinct string is measured once.
 */

const
    textWidthCache = new Map(),
    measureCanvas  = document.createElement('canvas').getContext('2d'),
    // Weight and size of the bar content and the now pill, the family is the app's (see loadFonts)
    fontSpecs      = {
        title : '600 14px',
        chip  : '500 11px',
        value : '600 13px',
        meta  : '400 11px',
        step  : '600 10px',
        delay : '600 11px',
        gap   : '500 11px',
        pill  : '600 12px'
    };

export const
    /**
     * Fonts used by the bar content and the now pill, used to measure text once per string. Kept up to date by
     * loadFonts
     */
    fonts = {},

    /**
     * Measures the width of a string in the given font. Results are cached, so each distinct string is only measured
     * once.
     * @param {String} text
     * @param {String} font
     * @returns {Number}
     */
    textWidth = (text, font) => {
        if (!text) {
            return 0;
        }

        const key = font + '|' + text;

        let width = textWidthCache.get(key);

        if (width === undefined) {
            measureCanvas.font = font;
            width              = Math.ceil(measureCanvas.measureText(text).width);
            textWidthCache.set(key, width);
        }

        return width;
    },

    /**
     * Points `fonts` at the font family the app renders in, then resolves once those faces have loaded, after clearing
     * the measure cache to not keep fallback font widths. The faces are loaded explicitly, `document.fonts.ready` does
     * not wait for faces not used yet. Called on start
     * @returns {Promise}
     */
    loadFonts = () => {
        // The app inherits the page font, see shared/tokens.css
        const { fontFamily } = getComputedStyle(document.body);

        Object.entries(fontSpecs).forEach(([key, spec]) => fonts[key] = `${spec} ${fontFamily}`);

        return Promise.all(Object.values(fonts).map(font => document.fonts?.load(font)))
            .catch(() => null)
            .then(() => textWidthCache.clear());
    };
