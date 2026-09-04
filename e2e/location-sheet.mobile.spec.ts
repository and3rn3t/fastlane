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

  // The header Close button must be a real, clickable dismiss path — not
  // just the backdrop (a Copilot review finding: a location with zero
  // enabled action buttons would otherwise leave no in-dialog way out).
  await sheet.getByRole('button', { name: /^Close$/ }).click()
  await expect(sheet).not.toBeVisible()

  // Board tiles are tappable behind the dock; work a shift at the new job.
  await page.getByRole('button', { name: /Burger Barn/ }).click()
  const burgerBarnSheet = page.getByRole('dialog', { name: /Burger Barn/ })
  await expect(burgerBarnSheet).toBeVisible()
  await page.getByRole('button', { name: /^Work \d+h/ }).click()

  // End Week must be reachable *from inside the open dialog* — a second
  // Copilot review finding: the dialog fully covers the dock, and travel
  // auto-opens it, so without an in-dialog End Week action the "always
  // tappable, never covered" guarantee broke the moment a player arrived
  // somewhere new and wanted to skip straight to ending the week.
  await burgerBarnSheet.getByRole('button', { name: /^End week/ }).click()
  const skip = page.getByRole('button', { name: /Skip/ })
  if (await skip.isVisible().catch(() => false)) await skip.click()
  await expect(page.getByRole('dialog', { name: /Week 1 report/i })).toBeVisible()
  await page.getByRole('button', { name: /Start week 2/ }).click()
  await expect(page.getByText(/Week 2/)).toBeVisible()
})
