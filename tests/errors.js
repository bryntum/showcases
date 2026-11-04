/**
 * Collects the console errors and the uncaught page errors of a page, attach it before the page loads
 * @param {import('@playwright/test').Page} page
 * @returns {String[]} The error messages, filled as they occur
 */
export function collectErrors(page) {
    const errors = [];

    page.on('console', message => message.type() === 'error' && errors.push(`console: ${message.text()}`));
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));

    return errors;
}
