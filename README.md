# Bryntum showcases

Realistic, fully front-end use cases of the [Bryntum](https://bryntum.com) components, built on the public npm
packages. No backend: each showcase loads its data from static JSON files and runs in the browser.

**Live gallery: https://showcase.bryntum.com/**

## Showcases

| Showcase | Products | Live | Source |
|----------|----------|------|--------|
| **EV Operations**: a production line, a service center with DC fast chargers and a vehicle program, with a live simulation | Scheduler (Enterprise tier), Gantt | [Live demo](https://showcase.bryntum.com/ev-operations/) | [ev-operations/](ev-operations/) |
| **Logistics Control Tower**: 2,000 inbound shipments streaming live into AG Grid, next to the dock doors of a distribution centre scheduled by the engine | Scheduler (Enterprise tier), with AG Grid Enterprise | [Live demo](https://showcase.bryntum.com/logistics-control-tower/) | [logistics-control-tower/](logistics-control-tower/) |

## Running locally

Requires Node.js 22.22.2+, 24.15+ or 26+. `.nvmrc` pins 26, the current LTS, which CI uses too, so run `nvm use` first.

```shell
npm install
npm run dev
```

Open the URL Vite prints for the gallery, and add a showcase folder to it for a showcase, e.g. `/ev-operations/`.

To run the smoke tests, install Chromium for Playwright once, then run `npm test`:

```shell
npx playwright install chromium
npm test
```

| Script | What it does |
|--------|--------------|
| `npm run dev` | Vite dev server for the gallery and all showcases |
| `npm run build` | Builds the gallery and all showcases into `dist/`: `dist/index.html` and `dist/<showcase>/` |
| `npm run preview` | Serves `dist/` under `/showcases/`, as on GitHub Pages, at the URL it prints |
| `npm run lint` | ESLint, then Stylelint (logical properties, no `!important`) |
| `npm test` | Playwright smoke tests in [`tests/`](tests/): builds, serves under `/showcases/` and checks every page |

The `@bryntum` packages come from the public npm registry. The repository's `.npmrc` points the `@bryntum` scope
there, in case your npm config sends it to npm.bryntum.com, which serves Bryntum 7 and older.

Without a licence key the Bryntum components run in trial mode and show a watermark.

The Logistics Control Tower uses AG Grid Enterprise, a separately licensed third-party library. Its key is read at
build time from `VITE_AG_LICENSE_KEY`, for example in a `.env.local` file at the repository root, which git ignores.
Without it AG Grid runs unlicensed: it shows its watermark and logs a licence notice in the console. The tests always
run without it.

## Repository layout

```
├── index.html, gallery.*     The gallery: page, styles, card list (gallery.js), images (gallery/, public/gallery/)
├── shared/                   @showcases/shared: the shell (header, light / dark switch, source link), design
│                             tokens, the font and the logos, used by every showcase and the gallery
├── ev-operations/,           One folder per showcase, an npm workspace with its own README
│   logistics-control-tower/
├── tests/                    Playwright smoke tests, one spec per page
├── vite.config.js            One multi-page build, every workspace but shared/ is a showcase
└── eslint.config.js,         The code style of the Bryntum sources
    stylelint.config.js
```

The Bryntum package versions are pinned once, in the root `package.json`, and shared by all showcases. Each workspace
lists the Bryntum packages it imports as `peerDependencies` at the same pin. Dependabot proposes updates for the
`@bryntum` packages as one group.

### The shared package

`shared/` is the npm workspace `@showcases/shared`, generic and config driven, with nothing specific to one showcase:

| Import | What it is |
|--------|------------|
| `@showcases/shared` | `createShell({ title, source, gallery })`: the page header and the container the app renders into. The header's breadcrumb links to the gallery, `gallery` defaults to `'../'`, as every showcase lives one folder below it. Its calls to action (`get-the-code.js`, `get-the-code.css`): "Get the code", a popover with the command that copies the repository and opens the showcase (derived from `source`) and the source link, and "Free trial", to bryntum.com/download/ |
| `@showcases/shared/tokens.css` | Design tokens (`--sc-*`): brand, accent and text colours, font stacks, radius, borders, tint and glows, floating surfaces and their shadow, page gutter, the app panel's border, padding, radius and shadow |
| `@showcases/shared/fonts.css` | The Montserrat font, bundled from `@fontsource` |
| `@showcases/shared/color-scheme.js` | `createColorSchemeToggle({ apply })`: the sun / moon button and the one stored light / dark choice, shared by the gallery and the showcases. No Bryntum dependency |
| `@showcases/shared/icon-button.css` | `.sc-icon-button`, the borderless header icon buttons (the light / dark toggle, the gallery's GitHub link) |
| `@showcases/shared/brand.css` | `.sc-brand`, the header lockup: the official Bryntum logo, a divider and the page name, or on a showcase the breadcrumb `.sc-crumbs` (Showcases / title) |
| `@showcases/shared/logo-round.svg` | The round Bryntum logo, the favicon |
| `@showcases/shared/logo.svg` | The official Bryntum logo, mark and wordmark, the mask brand.css colours brand blue on light and white on dark |
| `@showcases/shared/github-mark.svg` | The GitHub mark, filled with `currentColor` |
| `@showcases/shared/code.svg` | The code icon of "Get the code", drawn with `currentColor` |

The shell imports the tokens, the icon buttons, the brand lockup and the font itself. The showcase imports its Bryntum
structural CSS and the Svalbard theme, which renders light and dark from one file.

The light / dark choice is stored under one key, defined once in `shared/color-scheme-head.js`. A small Vite plugin in
`vite.config.js` injects a head script into every page, which applies the stored choice before the first paint
(`data-theme` and an inline `color-scheme` on the root), so a page does not flash the other mode. It also sets the
`theme-color` meta to the stored or the system mode. The toggle follows a choice made on another page, in another tab
or before the Back button.

The shell frames the app panel: `.sc-container > .b-outer` in `shell.css` gives the outermost Bryntum widget its
border, radius and shadow. `.b-outer` is the class Bryntum puts on its outermost widget, the shell has no other handle
on the app a showcase renders into it.

### Adding a showcase

1. Copy a showcase folder, for example `ev-operations/`, rename it, and set the `name` in its `package.json`. Replace
   `app.js`, `lib/`, `resources/`, `data/` and the README with your own
2. Add the folder to `workspaces` in the root `package.json`, the build picks it up from there
3. Add each Bryntum product package the showcase imports to the root `dependencies`, at the same pin as the others,
   and list it in the showcase's `peerDependencies`. Then run `npm install`
4. In `index.html`, set the title, the description, the canonical URL and the `og:*` tags. The head script for the
   light / dark choice is injected by the build
5. In `app.js`, import the structural CSS and the theme, then render the app into the container from `createShell()`.
   Give the app's top toolbar `--b-toolbar-padding : var(--sc-panel-padding)`, so its content lines up with the header:

   ```javascript
   import { Scheduler } from '@bryntum/scheduler-enterprise';
   import { createShell } from '@showcases/shared';
   import '@bryntum/scheduler-enterprise/scheduler.css';
   import '@bryntum/scheduler-enterprise/svalbard.css';

   const scheduler = new Scheduler({
       appendTo : createShell({ title : 'My showcase', source : 'my-showcase' }),
       // ...
   });
   ```

6. Import data files with `?url`, so their URLs survive the build
7. Add an entry to `showcases` in `gallery.js`, with its images in `gallery/`, and a row to the table above. From two
   showcases on, the gallery shows its product filter
8. To feature it on the gallery, update the Featured block in `index.html`, its `<noscript>` fallback in the card list,
   and the `og:image` in `public/gallery/`

### Deployment

`.github/workflows/pages.yml` lints and builds every pull request. On a push to `main` it also deploys `dist/` to
GitHub Pages. The build uses relative asset URLs (`base : './'`), so it runs under `/showcases/` as well as at any
other path.

### Analytics

The deployed pages report to Bryntum's Google Analytics 4 property (`G-1VY6776VJP`) with the plain gtag.js snippet.
No other tags are loaded, and no ad tags.

- **Consent denied by default.** The snippet sets Google Consent Mode v2 with `ad_storage`, `ad_user_data`,
  `ad_personalization` and `analytics_storage` all `denied`, before the config. GA4 then sends cookieless pings only:
  no cookies are set and nothing is used for ads. Google signals and ad personalization are also turned off in the
  config.
- **Production deploys only.** The Vite plugin in `vite.config.js` injects the snippet into every page's `<head>`
  only when the `SHOWCASES_GA4_ID` environment variable is set, see `shared/google-analytics.js`, which stops the build
  on an ID not shaped like `G-XXXXXXXXXX`. The workflow sets it for the build it deploys from `main`.
  `npm run dev`, local builds, `npm run preview` and the tests load no tracking.

To change the property, edit `SHOWCASES_GA4_ID` in `.github/workflows/pages.yml`. To disable tracking, remove it
there. To try it locally, run `SHOWCASES_GA4_ID=G-1VY6776VJP npm run build`, then `npm run preview`.

Granting `analytics_storage` (cookies) or adding any ad tag needs a cookie consent banner first, which the showcases
do not have. Such a banner would call `gtag('consent', 'update', { … })` once the visitor accepts.

## License

The showcase code in this repository is MIT licensed, see [LICENSE](LICENSE).

AG Grid Enterprise (`ag-grid-enterprise`), used by the Logistics Control Tower, is a separately licensed third-party
product, not part of Bryntum, see the [AG Grid licence](https://www.ag-grid.com/license-pricing/).

The Bryntum packages it depends on (`@bryntum/*-enterprise`) hold the Enterprise tier, which is commercially licensed,
see `license.pdf` in each package. The Community tier of each product is MIT licensed, see `LICENSE-MIT` in each
package. The packages run in trial mode, with a watermark, until a licence key is registered. Using Bryntum in
production requires a licence, see the [Bryntum license](https://bryntum.com/products/license/).
