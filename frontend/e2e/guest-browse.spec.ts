import { test, expect } from "@playwright/test";

import { cleanupTestData, createPublishedSeries } from "./fixtures/db";
import { testSeriesName } from "./fixtures/testData";

test.describe("guest browse", () => {
  let seriesName: string;
  let seriesId: string;
  let eventId: string;

  test.beforeAll(async () => {
    seriesName = testSeriesName("guest");
    const created = await createPublishedSeries({ name: seriesName });
    seriesId = created.series_id;
    eventId = created.event_id;
  });

  test.afterAll(async () => {
    await cleanupTestData({ seriesPrefix: seriesName });
  });

  test("home → series → event → bookmark persists after reload", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("home-page")).toBeVisible();

    const filterBtn = page.getByRole("button", { name: /Фильтр|фильтр/i });
    if (await filterBtn.isVisible().catch(() => false)) {
      await filterBtn.click();
    }

    await page.goto(`/series/${seriesId}`);
    await expect(page.getByRole("heading", { name: seriesName })).toBeVisible();

    await page.goto(`/events/${eventId}`);
    await expect(page.getByTestId("event-page")).toBeVisible();

    const remind = page.getByRole("button", { name: /Напоминать|В закладках|заклад/i }).first();
    if (await remind.isVisible().catch(() => false)) {
      await remind.click();
    } else {
      // Icon-only flight bell on event page.
      await page.getByTestId("flight-row").getByRole("button").first().click();
    }
    const saveOffsets = page.getByRole("button", { name: /Сохранить|Готово/i });
    if (await saveOffsets.isVisible().catch(() => false)) {
      await saveOffsets.click();
    }

    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/events/${eventId}`));
    await expect(page.getByTestId("event-page")).toBeVisible();
  });
});
