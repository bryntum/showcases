import { DomHelper } from '@bryntum/core-enterprise';
import codeIcon from './code.svg?raw';
import githubMark from './github-mark.svg?raw';
import externalLink from './external-link.svg?raw';

/**
 * The header's calls to action, after the light / dark toggle: "Get the code", a button opening a small popover with
 * the command that runs the showcase locally and the link to its source, then "Free trial", a link to Bryntum's trial
 * download. Phone widths show "Get the code" as an icon and move the trial link into the popover (get-the-code.css)
 */

const
    repoUrl  = 'https://github.com/bryntum/showcases',
    trialUrl = 'https://bryntum.com/download/',
    // The popover's ids, unique per page as the shell renders once
    popoverId = 'sc-code-popover',
    titleId   = 'sc-code-title';

/**
 * The command that copies the repository, installs it and opens the showcase. A showcase alone does not run: it
 * imports the `@showcases/shared` workspace, so the whole repository is copied, and Vite opens the showcase's page
 * @param {String} source The showcase folder in the repository
 * @returns {String}
 */
export function runCommand(source) {
    return `npx degit bryntum/showcases showcases && cd showcases && npm install && npm run dev -- --open /${source}/`;
}

/**
 * The link to Bryntum's trial download, in the header and, at phone widths, in the popover
 * @param {String} className
 * @returns {Object} DomConfig
 */
function trialLink(className) {
    return { tag : 'a', className, href : trialUrl, target : '_blank', rel : 'noopener', text : 'Free trial' };
}

/**
 * The popover: the run command with its Copy button, then the source and trial links
 * @param {String} source The showcase folder in the repository
 * @param {String} command The run command
 * @returns {Object} DomConfig
 */
function popoverConfig(source, command) {
    return {
        id                : popoverId,
        className         : 'sc-code-popover',
        role              : 'dialog',
        'aria-labelledby' : titleId,
        hidden            : true,
        children          : [
            {
                className : 'sc-code-head',
                children  : [
                    { tag : 'h2', id : titleId, className : 'sc-code-title', text : 'Run it locally' },
                    { tag : 'button', type : 'button', className : 'sc-button sc-code-copy', text : 'Copy' }
                ]
            },
            // One step per line to read, the Copy button copies the one-line command
            {
                tag       : 'pre',
                className : 'sc-code-command',
                children  : [{ tag : 'code', text : command.replaceAll(' && ', ' &&\n') }]
            },
            {
                tag       : 'p',
                className : 'sc-code-note',
                text      : 'Needs Node.js 22.22.2+, 24.15+ or 26+. Opens the showcase in your browser.'
            },
            {
                className : 'sc-code-links',
                children  : [
                    {
                        tag    : 'a',
                        href   : `${repoUrl}/tree/main/${source}`,
                        target : '_blank',
                        rel    : 'noopener',
                        // The trusted icons of this package around the label
                        html   : `${githubMark.trim()}View source on GitHub ${externalLink.trim()}`
                    },
                    trialLink('sc-code-trial')
                ]
            }
        ]
    };
}

/**
 * Builds the "Get the code" button with its popover, and the "Free trial" link
 * @param {Object} options
 * @param {String} options.source The showcase folder in the repository
 * @returns {HTMLElement[]} The elements to append to the header, in order
 */
export function createGetTheCode({ source }) {
    const
        command = runCommand(source),
        wrapper = DomHelper.createElement({
            className : 'sc-code',
            children  : [
                {
                    tag             : 'button',
                    type            : 'button',
                    className       : 'sc-button sc-button-primary sc-code-button',
                    'aria-expanded' : 'false',
                    'aria-controls' : popoverId,
                    // The label stays the button's name when phone widths hide it, the icon is trusted package SVG
                    html            : `${codeIcon.trim()}<span class="sc-code-label">Get the code</span>`
                },
                popoverConfig(source, command)
            ]
        }),
        [button, popover] = wrapper.children,
        copy    = popover.querySelector('.sc-code-copy'),
        code    = popover.querySelector('code'),
        isOpen  = () => !popover.hidden,
        open    = () => {
            popover.hidden = false;
            button.setAttribute('aria-expanded', 'true');
            copy.focus();
        },
        close   = ({ focusButton = false } = {}) => {
            if (isOpen()) {
                popover.hidden = true;
                button.setAttribute('aria-expanded', 'false');
                focusButton && button.focus();
            }
        };

    let copiedTimer;

    button.addEventListener('click', () => isOpen() ? close() : open());

    copy.addEventListener('click', async() => {
        try {
            await navigator.clipboard.writeText(command);
            copy.textContent = 'Copied';
            clearTimeout(copiedTimer);
            copiedTimer = setTimeout(() => copy.textContent = 'Copy', 2000);
        }
        catch {
            // No clipboard access, select the command for the visitor to copy
            getSelection().selectAllChildren(code);
        }
    });

    wrapper.addEventListener('keydown', event => {
        if (event.key === 'Escape' && isOpen()) {
            event.stopPropagation();
            close({ focusButton : true });
        }
    });

    // Focus leaving for another element closes it. Leaving the window does not (no related target)
    wrapper.addEventListener('focusout', ({ relatedTarget }) => {
        if (relatedTarget && !wrapper.contains(relatedTarget)) {
            close();
        }
    });

    document.addEventListener('pointerdown', ({ target }) => !wrapper.contains(target) && close());

    return [wrapper, DomHelper.createElement(trialLink('sc-button sc-button-secondary sc-trial'))];
}
