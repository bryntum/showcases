# Tests

Playwright smoke tests, one spec per page. They run against the production build, served under `/showcases/` as on
GitHub Pages: the test run builds (`npm run build`) and serves it (`npm run preview`) on port 4173, see
[`playwright.config.js`](../playwright.config.js). A server already running on that port is reused locally, never on CI.

```shell
npx playwright install chromium   # once
npm test
```

| Spec | Checks |
|------|--------|
| `gallery.spec.js` | The gallery loads without errors, shows the EV Operations card, its Live demo link opens the showcase |
| `ev-operations.spec.js` | The page loads without errors, the Production line Scheduler renders bars, the view switch shows Service and Program (Gantt), Simulate moves the now pill, the light / dark choice survives a reload, no horizontal scroll at 390px |

Every page must at least load, render its main widget and log no console or page errors (`errors.js` collects them).
Use public, stable selectors (Bryntum `b-*` widget roots, `ev-*` app classes, roles and aria-labels), web-first
assertions and `expect.poll`, no fixed waits and no pixel snapshots.

Run one spec with `npx playwright test tests/gallery.spec.js`, debug with `npx playwright test --ui`. CI runs the tests
on every pull request and uploads the report as the `playwright-report` artifact when they fail.
