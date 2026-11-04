import { expect, test } from '@playwright/test';
import { collectErrors } from './errors.js';

test.describe('Gallery', () => {
    let errors;

    test.beforeEach(async({ page }) => {
        errors = collectErrors(page);
        await page.goto('./');
    });

    test('loads without console or page errors', async({ page }) => {
        await expect(page.getByRole('heading', { level : 1 })).toBeVisible();
        await page.waitForLoadState('load');

        expect(errors).toEqual([]);
    });

    test('shows the EV Operations card', async({ page }) => {
        const card = page.locator('[data-cards] .card').filter({ hasText : 'EV Operations' });

        await expect(card).toBeVisible();
        await expect(card.getByRole('heading', { name : 'EV Operations' })).toBeVisible();
    });

    test('the card\'s Live demo link opens the showcase', async({ page }) => {
        const card = page.locator('[data-cards] .card').filter({ hasText : 'EV Operations' });

        await card.getByRole('link', { name : 'Live demo' }).click();

        await expect(page).toHaveURL(/\/showcases\/ev-operations\/$/);
        await expect(page.locator('.b-scheduler').first()).toBeVisible();
    });
});
