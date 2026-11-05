import { DomHelper } from '@bryntum/core-enterprise';
import { createColorSchemeToggle, storedColorScheme } from './color-scheme.js';
// Icons of the Bryntum widgets, from the Core package's own Font Awesome build
import '@bryntum/core-enterprise/fontawesome/css/fontawesome.css';
import '@bryntum/core-enterprise/fontawesome/css/solid.css';
// The showcases' font, design tokens and brand lockup (shell.css imports tokens.css and brand.css)
import './fonts.css';
import './shell.css';
import githubMark from './github-mark.svg?raw';
import externalLink from './external-link.svg?raw';

/**
 * The showcase shell, shared by all showcases: a header with the brand lockup (the Bryntum logo, linking to
 * bryntum.com, then a breadcrumb from the gallery to the showcase title), a light / dark switch and a link to the
 * source on GitHub, above the container the app renders into.
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
 * https://bryntum.com/products/grid/docs/api/Core/helper/DomHelper#property-colorScheme-static
 */

const repoUrl = 'https://github.com/bryntum/showcases';

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
 * Builds the page shell: the header, and the container the app renders into. Call it once, before creating the app
 * @param {Object} options
 * @param {String} options.title The showcase title, shown in the header
 * @param {String} options.source The showcase folder in the repository, the target of the GitHub source link
 * @param {String} [options.gallery] The gallery URL, the breadcrumb's first link. Relative, as every showcase lives one
 * folder below the gallery, so it works under any base path
 * @returns {HTMLElement} The container to render the app into (`appendTo`)
 */
export function createShell({ title, source, gallery = '../' }) {
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

    // The light / dark toggle and the GitHub link, the same icon buttons as on the gallery
    header.append(
        createColorSchemeToggle({ apply : scheme => DomHelper.colorScheme = scheme }),
        DomHelper.createElement({
            tag          : 'a',
            className    : 'sc-icon-button',
            href         : `${repoUrl}/tree/main/${source}`,
            target       : '_blank',
            title        : 'View source on GitHub',
            'aria-label' : 'View source on GitHub',
            // The trusted GitHub mark of this package
            html         : githubMark.trim()
        }),
        DomHelper.createElement({
            tag       : 'a',
            className : 'sc-icon-button sc-external',
            href      : 'https://bryntum.com',
            target    : '_blank',
            // The label, then this package's trusted external arrow
            html      : `bryntum.com ${externalLink.trim()}`
        })
    );

    return container;
}
