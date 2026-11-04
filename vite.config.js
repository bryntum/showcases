import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { applyStoredColorScheme, storageKey, themeColors } from './shared/color-scheme-head.js';

const
    root           = dirname(fileURLToPath(import.meta.url)),
    // Every workspace except the shared shell is a showcase, built to dist/<name>/
    { workspaces } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')),
    showcases      = workspaces.filter(name => name !== 'shared'),
    // Every page gets the theme colour and the head script applying the stored light / dark choice before the first
    // paint, see shared/color-scheme-head.js
    colorSchemeHead = {
        name : 'color-scheme-head',
        transformIndexHtml() {
            return [
                { tag : 'meta', attrs : { name : 'theme-color', content : themeColors.light }, injectTo : 'head' },
                {
                    tag      : 'script',
                    children : `(${applyStoredColorScheme})(${JSON.stringify(storageKey)}, ${JSON.stringify(themeColors)});`,
                    injectTo : 'head'
                }
            ];
        }
    };

export default defineConfig({
    // Relative asset URLs, so one build runs under https://bryntum.github.io/showcases/ and at any local path
    base : './',

    plugins : [colorSchemeHead],

    build : {
        outDir                : 'dist',
        emptyOutDir           : true,
        // ES2022 for the top level await in the showcases
        target                : 'es2022',
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
