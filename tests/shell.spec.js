import { expect, test } from '@playwright/test';
import { collectErrors } from './errors.js';

// The shared shell's calls to action, "Get the code" and "Free trial", on every showcase
const
    showcases = ['ev-operations', 'logistics-control-tower'],
    trialUrl  = 'https://bryntum.com/download/',
    command   = source => `npx degit bryntum/showcases showcases && cd showcases && npm install && npm run dev -- --open /${source}/`,
    // AG Grid's licence notice is checked by the Logistics spec, these tests only care about the shell
    agGrid    = [/AG Grid|^\*/];

for (const source of showcases) {
    test.describe(`Shell header on ${source}`, () => {
        let errors;

        // Granted before the page loads, for the Copy button
        test.use({ permissions : ['clipboard-read', 'clipboard-write'] });

        test.beforeEach(async({ page }) => {
            errors = collectErrors(page, { ignore : agGrid });
            await page.goto(`./${source}/`);
        });

        test('Get the code opens a popover with the run command and the source link', async({ page }) => {
            const
                button  = page.getByRole('button', { name : 'Get the code' }),
                popover = page.getByRole('dialog', { name : 'Run it locally' });

            await expect(button).toHaveAttribute('aria-expanded', 'false');
            await expect(popover).toBeHidden();

            await button.click();

            await expect(button).toHaveAttribute('aria-expanded', 'true');
            await expect(popover).toBeVisible();
            await expect(button).toHaveAttribute('aria-controls', await popover.getAttribute('id'));
            // Shown one step per line, the same command
            expect((await popover.locator('code').textContent()).replaceAll('\n', ' ')).toBe(command(source));
            await expect(popover.getByRole('link', { name : 'View source on GitHub' }))
                .toHaveAttribute('href', `https://github.com/bryntum/showcases/tree/main/${source}`);

            // A click outside closes it
            await page.locator('.sc-brand-title').click();
            await expect(popover).toBeHidden();
            await expect(button).toHaveAttribute('aria-expanded', 'false');
            expect(errors).toEqual([]);
        });

        test('Copy puts the one-line command on the clipboard', async({ page }) => {
            await page.getByRole('button', { name : 'Get the code' }).click();

            // By class, its name changes to "Copied"
            const copy = page.getByRole('dialog').locator('.sc-code-copy');

            await expect(copy).toHaveText('Copy');

            await copy.click();

            await expect(copy).toHaveText('Copied');
            expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(command(source));
        });

        test('works with the keyboard, focus moves in and back', async({ page }) => {
            const
                button  = page.getByRole('button', { name : 'Get the code' }),
                popover = page.getByRole('dialog', { name : 'Run it locally' });

            await button.focus();
            await page.keyboard.press('Enter');

            await expect(popover).toBeVisible();
            await expect(popover.getByRole('button', { name : 'Copy' })).toBeFocused();

            await page.keyboard.press('Tab');
            await expect(popover.getByRole('link', { name : 'View source on GitHub' })).toBeFocused();

            await page.keyboard.press('Escape');

            await expect(popover).toBeHidden();
            await expect(button).toBeFocused();
        });

        test('Free trial links to the trial download in a new tab', async({ page }) => {
            const trial = page.locator('.sc-header').getByRole('link', { name : 'Free trial' });

            await expect(trial).toBeVisible();
            await expect(trial).toHaveAttribute('href', trialUrl);
            await expect(trial).toHaveAttribute('target', '_blank');
        });
    });
}

test.describe('Shell header at phone width', () => {
    test.use({ viewport : { width : 390, height : 844 } });

    // On a phone the showcase is all there is: the header collapses, the app runs edge to edge
    test('the header is out of the way, the app fills the width', async({ page }) => {
        await page.goto('./logistics-control-tower/');

        await expect(page.getByRole('button', { name : 'Get the code' })).toBeHidden();

        const { scrollWidth, clientWidth } = await page.evaluate(() => {
            const { scrollWidth, clientWidth } = document.documentElement;

            return { scrollWidth, clientWidth };
        });

        expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
});
