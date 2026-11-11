import { DomHelper } from '@bryntum/core-enterprise';
import { createColorSchemeToggle, storedColorScheme } from './color-scheme.js';
// Icons of the Bryntum widgets, from the Core package's own Font Awesome build
import '@bryntum/core-enterprise/fontawesome/css/fontawesome.css';
import '@bryntum/core-enterprise/fontawesome/css/solid.css';
// The showcases' font, design tokens and brand lockup (shell.css imports tokens.css and brand.css)
import './fonts.css';
import './shell.css';
import { createGetTheCode } from './get-the-code.js';

/**
 * The showcase shell, shared by all showcases: a header with the brand lockup (the Bryntum logo, linking to
 * bryntum.com, then a breadcrumb from the gallery to the showcase title), a light / dark switch, "Get the code" (how
 * to run it locally, and its source on GitHub) and "Free trial", above the container the app renders into.
 *
 * ```javascript
 * import { createShell } from '@showcases/shared';
 *
 * const container = createShell({ title : 'My showcase', source : 'my-showcase' });
 *
 * new Scheduler({ appendTo : container });
 * ```
 *
 * The showcase imports one family theme (`svalbard.css`, not `svalbard-light.css`), which renders light and dark from
 * one stylesheet. The light / dark choice is shared with the gallery (see color-scheme.js) and pins
 * `DomHelper.colorScheme`, until a choice is made the page follows the system setting.
 *
 * Learn more:
 * https://bryntum.com/docs/api/Core/helper/DomHelper#property-colorScheme-static
 */

/**
 * The breadcrumb of the lockup: the gallery link, then the page heading as the current page. The heading is the trail's
 * last item, so the page keeps its h1 and the trail its end
 * @param {String} title The showcase title
 * @param {String} gallery The gallery URL
 * @returns {Object} The breadcrumb's DomConfig
 */
function breadcrumb(title, gallery) {
    return {
        tag          : 'nav',
        className    : 'sc-crumbs',
        'aria-label' : 'Breadcrumb',
        children     : [{
            tag      : 'ol',
            children : [
                {
                    tag      : 'li',
                    children : [{
                        tag       : 'a',
                        className : 'sc-crumb-link',
                        href      : gallery,
                        title     : 'All showcases',
                        children  : [
                            { tag : 'span', className : 'sc-crumb-back', 'aria-hidden' : 'true' },
                            { tag : 'span', className : 'sc-crumb-text', text : 'Showcases' }
                        ]
                    }]
                },
                {
                    tag      : 'li',
                    children : [
                        { tag : 'span', className : 'sc-crumb-separator', 'aria-hidden' : 'true', text : '/' },
                        { tag : 'h1', className : 'sc-brand-title', 'aria-current' : 'page', text : title }
                    ]
                }
            ]
        }]
    };
}

/**
 * The partner product next to the Bryntum logo: a times sign and its logo, linking to the partner's site
 * @param {Object} partner `{ name, href, logo }`, see createShell
 * @returns {Object} DomConfig
 */
function partnerLink({ name, href, logo }) {
    return {
        tag       : 'a',
        className : 'sc-brand-partner',
        href,
        target    : '_blank',
        children  : [
            { tag : 'span', className : 'sc-brand-plus', 'aria-hidden' : 'true', text : '×' },
            {
                tag          : 'span',
                className    : 'sc-brand-partner-logo',
                role         : 'img',
                'aria-label' : name,
                // Double quoted and escaped, an inlined SVG data URL holds single quotes
                style        : `--sc-partner-logo-light: url(${JSON.stringify(logo.light)}); ` +
                    `--sc-partner-logo-dark: url(${JSON.stringify(logo.dark)})`
            }
        ]
    };
}

/**
 * Builds the page shell: the header, and the container the app renders into. Call it once, before creating the app
 * @param {Object} options
 * @param {String} options.title The showcase title, shown in the header
 * @param {String} options.source The showcase folder in the repository, for the run command and the source link
 * @param {String} [options.gallery] The gallery URL, the breadcrumb's first link. Relative, as every showcase lives one
 * folder below the gallery, so it works under any base path
 * @param {Object} [options.partner] A partner product shown next to the Bryntum logo, `{ name, href, logo }`. `logo`
 * holds the URLs of its logo for each mode, `{ light, dark }`, see brand.css
 * @returns {HTMLElement} The container to render the app into (`appendTo`)
 */
export function createShell({ title, source, gallery = '../', partner }) {
    const
        { body } = document,
        scheme   = storedColorScheme(),
        header   = DomHelper.createElement({
            tag       : 'header',
            className : 'sc-header',
            parent    : body,
            children  : [
                {
                    // The lockup of brand.css. The logo links to bryntum.com, the breadcrumb to the gallery
                    className : 'sc-brand',
                    children  : [
                        {
                            tag       : 'a',
                            className : 'sc-brand-home',
                            href      : 'https://bryntum.com',
                            children  : [
                                { tag : 'span', className : 'sc-brand-logo', role : 'img', 'aria-label' : 'Bryntum' }
                            ]
                        },
                        partner && partnerLink(partner),
                        { tag : 'span', className : 'sc-brand-divider', 'aria-hidden' : 'true' },
                        breadcrumb(title, gallery)
                    ]
                }
            ]
        }),
        container = DomHelper.createElement({ tag : 'main', id : 'container', className : 'sc-container', parent : body });

    // The pinned light / dark choice, applied before the widgets render to not flash the other mode
    if (scheme) {
        DomHelper.colorScheme = scheme;
    }

    // The light / dark toggle, the same icon button as on the gallery, then the calls to action
    header.append(
        createColorSchemeToggle({ apply : scheme => DomHelper.colorScheme = scheme }),
        ...createGetTheCode({ source })
    );

    return container;
}
