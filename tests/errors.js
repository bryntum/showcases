/**
 * AG Grid Enterprise's notice when it runs without a licence key, as the tests do (see playwright.config.js): the
 * lines of its console banner, each matched in full. Nothing else from AG Grid is tolerated
 */
export const agGridLicenseNotice = [
    /^\*+$/,
    /^\*+ AG Grid Enterprise License \*+$/,
    /^\*+ License Key Not Found \*+$/,
    /^\* All AG Grid Enterprise features are unlocked for trial\. +\*$/,
    /^\* If you want to hide the watermark please email info@ag-grid\.com for a trial license key\. +\*$/
];

/**
 * Collects the console errors and the uncaught page errors of a page, attach it before the page loads
 * @param {import('@playwright/test').Page} page
 * @param {Object} [options]
 * @param {RegExp[]} [options.ignore] Console errors to tolerate, matched against the whole message
 * @returns {String[]} The error messages, filled as they occur
 */
export function collectErrors(page, { ignore = [] } = {}) {
    const errors = [];

    page.on('console', message => {
        const text = message.text();

        if (message.type() === 'error' && !ignore.some(pattern => pattern.test(text))) {
            errors.push(`console: ${text}`);
        }
    });
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));

    return errors;
}
