import { DomHelper, Toolbar } from '@bryntum/core-enterprise';
import { createColorSchemeToggle, storedColorScheme } from './color-scheme.js';
// Icons of the Bryntum widgets, from the Core package's own Font Awesome build
import '@bryntum/core-enterprise/fontawesome/css/fontawesome.css';
import '@bryntum/core-enterprise/fontawesome/css/solid.css';
// The showcases' font and design tokens (shell.css imports tokens.css)
import './fonts.css';
import './shell.css';
import logoUrl from './logo-round.svg';
import githubMark from './github-mark.svg?raw';

/**
 * The showcase shell, shared by all showcases: a header with the round Bryntum logo, the showcase title, a light / dark
 * switch and links to the source on GitHub and to bryntum.com, above the container the app renders into.
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
 * Builds the page shell: the header, and the container the app renders into. Call it once, before creating the app
 * @param {Object} options
 * @param {String} options.title The showcase title, shown in the header
 * @param {String} options.source The showcase folder in the repository, the target of the GitHub source link
 * @returns {HTMLElement} The container to render the app into (`appendTo`)
 */
export function createShell({ title, source }) {
    const
        { body } = document,
        scheme   = storedColorScheme(),
        header   = DomHelper.createElement({
            tag       : 'header',
            className : 'sc-header',
            parent    : body,
            children  : [
                {
                    tag          : 'a',
                    className    : 'sc-logo',
                    href         : 'https://bryntum.com',
                    'aria-label' : 'Bryntum home page',
                    children     : [{ tag : 'img', src : logoUrl, alt : '', width : 32, height : 32 }]
                },
                { tag : 'h1', className : 'sc-title', text : title }
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
        })
    );

    // The bryntum.com link. Rendered into the header, which owns it, no reference is kept
    // eslint-disable-next-line no-new
    new Toolbar({
        appendTo  : header,
        cls       : 'sc-tools',
        ariaLabel : 'Showcase tools',
        items     : {
            bryntum : {
                type   : 'button',
                text   : 'bryntum.com',
                href   : 'https://bryntum.com',
                target : '_blank'
            }
        }
    });

    return container;
}
