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
| `gallery.spec.js` | The gallery loads without errors, shows the EV Operations and Logistics Control Tower cards, their Live demo links open the showcases |
| `logistics-control-tower.spec.js` | The page loads without errors (AG Grid's licence notice aside, the tests run without its key), the grid and the dock schedule render, the clock ticks until paused, row and slot selection follow each other, the context menu unbooks, the utilization strip renders, Resolve conflicts and Simulate delay work, a row dragged onto a door books a slot while the clock holds, the grid follows light / dark, the views stack at 390px |
| `ev-operations.spec.js` | The page loads without errors, the Production line Scheduler renders bars, the view switch shows Service and Program (Gantt), Simulate moves the now pill, the light / dark choice survives a reload, no horizontal scroll at 390px |

Every page must at least load, render its main widget and log no console or page errors (`errors.js` collects them).
The only tolerated console errors are the lines of AG Grid's licence notice (`agGridLicenseNotice` in `errors.js`),
as the tests run AG Grid without a key, see `playwright.config.js`.
Use public, stable selectors (Bryntum `b-*` widget roots, AG Grid `ag-*` roots, `ev-*` / `lct-*` app classes, roles and aria-labels), web-first
assertions and `expect.poll`, no fixed waits and no pixel snapshots.

Run one spec with `npx playwright test tests/gallery.spec.js`, debug with `npx playwright test --ui`. CI runs the tests
on every pull request and uploads the report as the `playwright-report` artifact when they fail.
