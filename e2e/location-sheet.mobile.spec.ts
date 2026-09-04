import { expect, test } from '@playwright/test'

// Runs only in the mobile-chromium project (375×667 — the short viewport
// where the old location sheet's coverage bugs were reported). jsdom can't
// catch overlap/covered-control failures, so every click here is a real one:
// Playwright fails a click if another element would intercept it, which is
// exactly the regression class this spec guards against.
test('travel opens the location sheet, actions keep it open, and End Week is always tappable', async ({
  page,
}) => {
  await page.goto('/')

  await page.getByText('Start new game').click()
  const gotIt = page.getByRole('button', { name: /Got it/ })
  if (await gotIt.isVisible().catch(() => false)) await gotIt.click()
  await expect(page.getByText(/Week 1/)).toBeVisible()

  // Arriving somewhere new auto-opens the actions sheet as a real dialog.
  await page.getByRole('button', { name: /Job Center/ }).click()
  const sheet = page.getByRole('dialog', { name: /Job Center/ })
  await expect(sheet).toBeVisible()

  // An action inside the sheet must not close it (the old auto-collapse bug).
  await page
    .getByRole('button', { name: /Apply \(2h\)/ })
    .first()
    .click()
  await expect(sheet).toBeVisible()

  // Backdrop tap dismisses, freeing the board again.
  await page.locator('.modal-backdrop').click({ position: { x: 5, y: 5 } })
  await expect(sheet).not.toBeVisible()

  // Board tiles are tappable behind the dock; work a shift at the new job.
  await page.getByRole('button', { name: /Burger Barn/ }).click()
  await expect(page.getByRole('dialog', { name: /Burger Barn/ })).toBeVisible()
  await page.getByRole('button', { name: /^Work \d+h/ }).click()
  await page.locator('.modal-backdrop').click({ position: { x: 5, y: 5 } })

  // The dock's End Week must be genuinely clickable — nothing covering it.
  await page.getByRole('button', { name: /End week/ }).click()
  const skip = page.getByRole('button', { name: /Skip/ })
  if (await skip.isVisible().catch(() => false)) await skip.click()
  await expect(page.getByRole('dialog', { name: /Week 1 report/i })).toBeVisible()
  await page.getByRole('button', { name: /Start week 2/ }).click()
  await expect(page.getByText(/Week 2/)).toBeVisible()
})
