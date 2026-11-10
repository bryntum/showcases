import { defineConfig, devices } from '@playwright/test';

// Smoke tests against the production build, served by `vite preview` under /showcases/ as on GitHub Pages
const
    port    = 4173,
    baseURL = `http://localhost:${port}/showcases/`,
    { CI }  = process.env;

export default defineConfig({
    testDir    : 'tests',
    forbidOnly : Boolean(CI),
    retries    : CI ? 1 : 0,
    reporter   : CI ? [['list'], ['html', { open : 'never' }]] : 'list',
    use        : {
        baseURL,
        trace : 'on-first-retry'
    },
    projects : [
        { name : 'chromium', use : { ...devices['Desktop Chrome'] } }
    ],
    webServer : {
        command             : `npm run build && npm run preview -- --port ${port} --strictPort`,
        url                 : baseURL,
        reuseExistingServer : !CI,
        timeout             : 180_000,
        // The tests never load Google Analytics, even with SHOWCASES_GA4_ID set in the shell (see vite.config.js). They
        // run AG Grid and AG Charts without a licence key, as CI does, even with one in .env.local (the variable wins
        // over a file)
        env                 : { SHOWCASES_GA4_ID : '', VITE_AG_LICENSE_KEY : '' }
    }
});
