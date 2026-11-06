// The showcase gallery: renders the cards from the list below and, from two showcases on, filters them by product.
// Adding a showcase is one entry in `showcases`
import { createColorSchemeToggle, storedColorScheme } from '@showcases/shared/color-scheme.js';
import lightThumb800 from './gallery/ev-operations-light-800.webp';
import lightThumb1600 from './gallery/ev-operations-light-1600.webp';
import lightThumbPng from './gallery/ev-operations-light-1200.png';
import darkThumb800 from './gallery/ev-operations-dark-800.webp';
import darkThumb1600 from './gallery/ev-operations-dark-1600.webp';
import darkThumbPng from './gallery/ev-operations-dark-1200.png';
import lctLightThumb800 from './gallery/logistics-control-tower-light-800.webp';
import lctLightThumb1600 from './gallery/logistics-control-tower-light-1600.webp';
import lctLightThumbPng from './gallery/logistics-control-tower-light-1200.png';
import lctDarkThumb800 from './gallery/logistics-control-tower-dark-800.webp';
import lctDarkThumb1600 from './gallery/logistics-control-tower-dark-1600.webp';
import lctDarkThumbPng from './gallery/logistics-control-tower-dark-1200.png';

const
    // Every product a showcase can be built on, in filter order, with the page its tag links to
    productUrls = {
        Gantt        : 'https://bryntum.com/products/gantt/',
        Scheduler    : 'https://bryntum.com/products/scheduler/',
        Calendar     : 'https://bryntum.com/products/calendar/',
        'Task Board' : 'https://bryntum.com/products/taskboard/',
        'AG Grid'    : 'https://www.ag-grid.com/',
        'AG Charts'  : 'https://www.ag-grid.com/charts/',
        'AG Studio'  : null
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
        },
        {
            title       : 'Logistics Control Tower',
            description : '2,000 inbound shipments streaming live into AG Grid, next to the dock doors of a ' +
                'distribution centre, scheduled by the Bryntum engine.',
            products : ['Scheduler', 'AG Grid'],
            url      : './logistics-control-tower/',
            source   : 'https://github.com/bryntum/showcases/tree/main/logistics-control-tower',
            thumb    : {
                light  : { webp : `${lctLightThumb800} 800w, ${lctLightThumb1600} 1600w`, png : lctLightThumbPng },
                dark   : { webp : `${lctDarkThumb800} 800w, ${lctDarkThumb1600} 1600w`, png : lctDarkThumbPng },
                width  : 1200,
                height : 741
            }
        }
    ],
    // One filter per product, also for those no showcase uses yet
    products    = Object.keys(productUrls),
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
                <a href="${url}" tabindex="-1" aria-hidden="true">
                <picture>
                    <source type="image/webp" media="(prefers-color-scheme: light)" data-scheme="light"
                        srcset="${thumb.light.webp}" sizes="(max-width: 40rem) 100vw, (max-width: 64rem) 50vw, 23rem">
                    <source type="image/webp" srcset="${thumb.dark.webp}"
                        sizes="(max-width: 40rem) 100vw, (max-width: 64rem) 50vw, 23rem">
                    <source media="(prefers-color-scheme: light)" data-scheme="light" srcset="${thumb.light.png}">
                    <img src="${thumb.dark.png}" width="${thumb.width}" height="${thumb.height}" loading="lazy"
                        alt="${encodeHtml(title)} screenshot">
                </picture>
                </a>
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

        // Listed, so the range shows, but not selectable until a showcase uses it
        if (label !== 'All' && !showcases.some(showcase => showcase.products.includes(label))) {
            button.disabled = true;
            button.title    = 'No showcase yet';
        }

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

/**
 * Leans the hero's component stack towards the pointer, as `--px` / `--py` from -1 to 1 (gallery.css). Not for touch,
 * nor with reduced motion. One write per frame
 * @param {HTMLElement} stack The `.hero-stack`
 */
function leanTowardsPointer(stack) {
    const
        hero   = stack.closest('.hero'),
        motion = matchMedia('(prefers-reduced-motion: no-preference) and (hover: hover)');

    let frame = 0;

    hero.addEventListener('pointermove', ({ clientX, clientY }) => {
        if (!motion.matches || frame) {
            return;
        }

        frame = requestAnimationFrame(() => {
            const
                { left, top, width, height } = hero.getBoundingClientRect(),
                clamp                        = value => Math.max(-1, Math.min(1, value));

            stack.style.setProperty('--px', clamp((clientX - left) / width * 2 - 1).toFixed(3));
            stack.style.setProperty('--py', clamp((clientY - top) / height * 2 - 1).toFixed(3));
            frame = 0;
        });
    });

    hero.addEventListener('pointerleave', () => {
        cancelAnimationFrame(frame);
        frame = 0;
        stack.style.removeProperty('--px');
        stack.style.removeProperty('--py');
    });
}

leanTowardsPointer(document.querySelector('.hero-stack'));
