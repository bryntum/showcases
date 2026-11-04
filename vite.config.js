import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { applyStoredColorScheme, storageKey, themeColors } from './shared/color-scheme-head.js';
import { googleAnalyticsTags } from './shared/google-analytics.js';

const
    root           = dirname(fileURLToPath(import.meta.url)),
    // Every workspace except the shared shell is a showcase, built to dist/<name>/
    { workspaces } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')),
    showcases      = workspaces.filter(name => name !== 'shared'),
    // The GA4 measurement ID, set only by the deploy build on main (.github/workflows/pages.yml). Unset in dev, local
    // builds and the tests, so they load no tracking
    ga4Id          = process.env.SHOWCASES_GA4_ID,
    // Every page gets the theme colour and the head script applying the stored light / dark choice before the first
    // paint, see shared/color-scheme-head.js. Then, with a GA4 measurement ID, the GA4 gtag.js snippet with all consent
    // denied, see shared/google-analytics.js
    pageHead       = {
        name : 'page-head',
        transformIndexHtml() {
            return [
                { tag : 'meta', attrs : { name : 'theme-color', content : themeColors.light }, injectTo : 'head' },
                {
                    tag      : 'script',
                    children : `(${applyStoredColorScheme})(${JSON.stringify(storageKey)}, ${JSON.stringify(themeColors)});`,
                    injectTo : 'head'
                },
                ...(ga4Id ? googleAnalyticsTags(ga4Id) : [])
            ];
        }
    };

export default defineConfig({
    // Relative asset URLs, so one build runs under https://bryntum.github.io/showcases/ and at any local path
    base : './',

    plugins : [pageHead],

    build : {
        outDir                : 'dist',
        emptyOutDir           : true,
        // ES2022 for the top level await in the showcases
        target                : 'es2022',
        // Browsers with native light-dark(). Lower targets make Lightning CSS rewrite it into variables that need a
        // static color-scheme, while the Bryntum themes and the shell set color-scheme at runtime
        cssTarget             : ['chrome123', 'edge123', 'firefox120', 'safari17.5', 'ios17.5'],
        // The Bryntum bundles are big by design, one per product
        chunkSizeWarningLimit : 4096,
        rollupOptions         : {
            input : {
                index : resolve(root, 'index.html'),
                ...Object.fromEntries(showcases.map(name => [name, resolve(root, name, 'index.html')]))
            }
        }
    },

    server : {
        open : '/'
    }
});
