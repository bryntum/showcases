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
        timeout             : 180_000
    }
});
