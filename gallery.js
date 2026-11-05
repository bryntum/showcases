// The showcase gallery: renders the cards from the list below and, from two showcases on, filters them by product.
// Adding a showcase is one entry in `showcases`
import { createColorSchemeToggle, storedColorScheme } from '@showcases/shared/color-scheme.js';
import lightThumb800 from './gallery/ev-operations-light-800.webp';
import lightThumb1600 from './gallery/ev-operations-light-1600.webp';
import lightThumbPng from './gallery/ev-operations-light-1200.png';
import darkThumb800 from './gallery/ev-operations-dark-800.webp';
import darkThumb1600 from './gallery/ev-operations-dark-1600.webp';
import darkThumbPng from './gallery/ev-operations-dark-1200.png';

const
    // Product pages the tags link to
    productUrls = {
        Scheduler    : 'https://bryntum.com/products/scheduler/',
        Gantt        : 'https://bryntum.com/products/gantt/',
        Calendar     : 'https://bryntum.com/products/calendar/',
        'Task Board' : 'https://bryntum.com/products/taskboard/'
    },
    showcases   = [
        {
            title       : 'EV Operations',
            description : 'A production line, a service center with DC fast chargers and a vehicle program, ' +
                'with a live simulation.',
            products : ['Scheduler', 'Gantt'],
            url      : './ev-operations/',
            source   : 'https://github.com/bryntum/showcases/tree/main/ev-operations',
            thumb    : {
                light  : { webp : `${lightThumb800} 800w, ${lightThumb1600} 1600w`, png : lightThumbPng },
                dark   : { webp : `${darkThumb800} 800w, ${darkThumb1600} 1600w`, png : darkThumbPng },
                width  : 1200,
                height : 741
            }
        }
    ],
    // The products the showcases are built on, in order of appearance, one filter each
    products    = [...new Set(showcases.flatMap(showcase => showcase.products))],
    encodeHtml  = text => String(text).replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`),
    // A product tag, a link to its product page when it has one
    tagHtml     = name => productUrls[name] ? `<a href="${productUrls[name]}">${encodeHtml(name)}</a>` : encodeHtml(name),
    // The media of the light screenshot sources: the viewer's choice, else the system setting
    lightMedia  = {
        light : 'all',
        dark  : 'not all'
    };

/**
 * Shows the light or the dark screenshots. The light sources of each `<picture>` (`data-scheme="light"`) come first
 * and match by their media, so only the shown screenshot loads
 * @param {'light'|'dark'|null} scheme The chosen mode, `null` to follow the system setting
 */
function syncScreenshots(scheme) {
    document.querySelectorAll('source[data-scheme="light"]').forEach(source =>
        source.media = lightMedia[scheme] ?? '(prefers-color-scheme: light)'
    );
}

function cardHtml({ title, description, url, source, products : names, thumb }) {
    return `
        <article class="card">
            <div class="thumb">
                <picture>
                    <source type="image/webp" media="(prefers-color-scheme: light)" data-scheme="light"
                        srcset="${thumb.light.webp}" sizes="(max-width: 40rem) 100vw, (max-width: 64rem) 50vw, 23rem">
                    <source type="image/webp" srcset="${thumb.dark.webp}"
                        sizes="(max-width: 40rem) 100vw, (max-width: 64rem) 50vw, 23rem">
                    <source media="(prefers-color-scheme: light)" data-scheme="light" srcset="${thumb.light.png}">
                    <img src="${thumb.dark.png}" width="${thumb.width}" height="${thumb.height}" loading="lazy"
                        alt="${encodeHtml(title)} screenshot">
                </picture>
            </div>
            <div class="body">
                <ul class="tags" aria-label="Built with">
                    ${names.map(name => `<li>${tagHtml(name)}</li>`).join('')}
                </ul>
                <h3><a href="${url}">${encodeHtml(title)}</a></h3>
                <p>${encodeHtml(description)}</p>
                <div class="links">
                    <a href="${url}">Live demo →</a>
                    <a href="${source}">Source</a>
                </div>
            </div>
        </article>`;
}

function renderCards(list) {
    list.innerHTML = showcases.map(showcase => `<li>${cardHtml(showcase)}</li>`).join('');

    return [...list.children];
}

function renderFilters(group, items, status) {
    const buttons = ['All', ...products].map(label => {
        const button = document.createElement('button');

        button.type        = 'button';
        button.textContent = label;
        button.setAttribute('aria-pressed', String(label === 'All'));
        return button;
    });

    group.append(...buttons);
    group.hidden  = false;
    status.hidden = false;

    group.addEventListener('click', ({ target }) => {
        const
            pressed = target.closest('button'),
            product = pressed?.textContent === 'All' ? null : pressed?.textContent;

        if (!pressed) {
            return;
        }

        buttons.forEach(button => button.setAttribute('aria-pressed', String(button === pressed)));
        items.forEach((item, index) => item.hidden = Boolean(product) && !showcases[index].products.includes(product));

        const shown = items.filter(item => !item.hidden).length;

        status.textContent = `${shown} ${shown === 1 ? 'showcase' : 'showcases'} shown`;
    });
}

const items = renderCards(document.querySelector('[data-cards]'));

// One showcase needs no filter
if (showcases.length > 1) {
    renderFilters(document.querySelector('.filters'), items, document.querySelector('[data-filter-status]'));
}

// The screenshots in the chosen mode, before the lazy card thumbnail loads
syncScreenshots(storedColorScheme());

// The light / dark toggle shared with the showcases, before the GitHub button. It keeps the default `color-scheme` on
// the root and swaps the screenshots
document.querySelector('.site-actions').prepend(createColorSchemeToggle({
    apply : scheme => {
        document.documentElement.style.colorScheme = scheme;
        syncScreenshots(scheme);
    }
}));
