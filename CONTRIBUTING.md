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
* **AG Grid Enterprise** (Logistics Control Tower) and **AG Charts Enterprise** (Offshore Wind Dispatch): without a
  key they show their watermark and log a licence notice in the console. If you have a key, put it in a `.env.local`
  file at the repository root, which git ignores:

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
├── offshore-wind-dispatch/
├── shared/                   The page around every showcase: header, light / dark switch, fonts and logos
├── index.html, gallery.*     The gallery page
└── tests/                    The smoke tests, one per page
```

Inside a showcase, `app.js` is the entry point, `lib/` holds the classes (one per file), `resources/` the CSS and
`data/` the JSON it loads.

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
