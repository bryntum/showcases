# Getting started

How to run the showcases on your machine, change them and build your own. For what the showcases are, see the
[README](README.md).

## Run the showcases

You need Node.js 22.22.2+, 24.15+ or 26+. The repository pins 26 in `.nvmrc`, so with nvm run `nvm use` first.

```shell
git clone https://github.com/bryntum/showcases.git
cd showcases
npm install
npm run dev
```

Open the URL Vite prints to get the gallery, then pick a showcase, or go straight to one by adding its folder to the
URL, for example `/ev-operations/`. Edit any file and the page reloads.

### Licence keys

You don't need any to explore:

* **Bryntum**: without a licence key the components run in trial mode and show a watermark
* **AG Grid Enterprise** (Logistics Control Tower): without a key it shows its watermark and logs a licence notice in
  the console. If you have a key, put it in a `.env.local` file at the repository root, which git ignores:

  ```shell
  VITE_AG_LICENSE_KEY=your-key
  ```

### Installing from a Bryntum private registry

The `@bryntum` packages come from the public npm registry. If your npm config sends the `@bryntum` scope to
npm.bryntum.com, which serves Bryntum 7 and older, the repository's `.npmrc` points it back to the public registry.

## Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Starts the dev server for the gallery and all showcases |
| `npm run build` | Builds the gallery and all showcases into `dist/` |
| `npm run preview` | Serves the built `dist/`, at the URL it prints |
| `npm run lint` | Checks the JavaScript (ESLint) and the CSS (Stylelint) |
| `npm test` | Builds, then opens every page in Chromium and checks it loads without errors |
| `npm run screenshots` | Captures every showcase, light and dark, for the gallery and the social previews |

Before your first `npm test`, install Chromium for Playwright once:

```shell
npx playwright install chromium
```

## Where things are

```
├── ev-operations/            One folder per showcase, each with its own README that walks through how it works
├── logistics-control-tower/
├── shared/                   The page around every showcase: header, light / dark switch, fonts and logos
├── index.html, gallery.*     The gallery page
└── tests/                    The smoke tests, one per page
```

Inside a showcase, `app.js` is the entry point, `lib/` holds the classes (one per file), `resources/` the CSS and
`data/` the JSON it loads.

## What a showcase is built from

A showcase exists to show off our own products, so build it from them as much as possible:

| Need                                       | Use                                   |
|--------------------------------------------|---------------------------------------|
| Tables and data grids                      | AG Grid                               |
| Charts                                     | AG Charts                             |
| Dashboards                                 | AG Studio                             |
| Resource scheduling and timelines          | Bryntum Scheduler or Scheduler Pro    |
| Project plans with tasks and dependencies  | Bryntum Gantt                         |
| Calendars                                  | Bryntum Calendar                      |
| Kanban boards                              | Bryntum TaskBoard                     |

* Use the products' built-in features (dependencies, nested events, drag and drop, editors, histograms, tooltips…)
  and style them to match the design. Never re-implement a feature or switch one off to imitate a mockup; if the
  design can't be reached with the feature, change the design or ask
* Write UI by hand only for what none of the products covers

### Third-party libraries

Apart from our own products, a showcase may only use libraries under MIT or a similarly permissive licence: MIT,
BSD, ISC or Apache-2.0 (SIL OFL for fonts). No GPL, LGPL, AGPL, MPL, Creative Commons non-commercial, or "free for
non-commercial use" licences. Check the `license` field in the package's `package.json` before you add it.

## Build your own showcase

1. Copy a showcase folder, for example `ev-operations/`, rename it, and set the `name` in its `package.json`. Replace
   `app.js`, `lib/`, `resources/`, `data/` and the README with your own
2. Add the folder to `workspaces` in the root `package.json`
3. If it uses a Bryntum product the others don't, add its package to the root `dependencies` and to the showcase's
   `peerDependencies`, at the same version as the others, and run `npm install`
4. In its `index.html`, set the title and the description
5. In `app.js`, import the CSS and the theme, then render your app into the page from `createShell()`:

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

6. Import data files with `?url`, so their URLs still work after `npm run build`:

   ```javascript
   import dataUrl from './data/data.json?url';
   ```

7. To list it in the gallery, add an entry to `showcases` in `gallery.js` and to `showcases` in
   `scripts/screenshots.js`, then run `npm run screenshots`

Run `npm run lint` and `npm test` before you open a pull request.
