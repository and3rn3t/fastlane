import { expect, test } from '@playwright/test'

test('start a new game, work a shift, end the week, and reload keeps the save', async ({
  page,
}) => {
  await page.goto('/')

  await page.getByText('Start new game').click()
  // Help auto-opens on first visit (localStorage-tracked) — dismiss it before
  // it shadows anything below, same as a real first-time player would.
  const gotIt = page.getByRole('button', { name: /Got it/ })
  if (await gotIt.isVisible().catch(() => false)) await gotIt.click()
  await expect(page.getByText(/Week 1/)).toBeVisible()

  await page.getByRole('button', { name: /Job Center/ }).click()
  await page
    .getByRole('button', { name: /Apply \(2h\)/ })
    .first()
    .click()
  await page.getByRole('button', { name: /Burger Barn/ }).click()
  await page.getByRole('button', { name: /^Work \d+h/ }).click()
  // The work result lands in the "This life so far" log, a native <details>
  // collapsed by default — open it, same as a player would, before checking.
  // Scoped to .log since the same text is also mirrored into a visually-hidden
  // aria-live announcer for screen readers (not visible, so not this check's target).
  await page.getByText('This life so far').click()
  await expect(page.locator('.log').getByText(/Worked \d+h as Fry Cook/)).toBeVisible()

  await page.getByRole('button', { name: /End week/ }).click()
  const skip = page.getByRole('button', { name: /Skip/ })
  if (await skip.isVisible().catch(() => false)) await skip.click()
  await expect(page.getByRole('dialog', { name: /Week 1 report/i })).toBeVisible()
  await page.getByRole('button', { name: /Start week 2/ }).click()
  await expect(page.getByText(/Week 2/)).toBeVisible()

  // The core save/reload guarantee this smoke test exists to catch a
  // regression in: a mid-game reload must resume, not drop back to the
  // start screen.
  await page.reload()
  await expect(page.getByText(/Week 2/)).toBeVisible()
  await expect(page.getByText('Start new game')).not.toBeVisible()
})
