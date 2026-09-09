import { test, expect } from "@playwright/test";

import { cleanupTestData, createPublishedSeries } from "./fixtures/db";
import { testSeriesName } from "./fixtures/testData";

test.describe("filters URL persistence", () => {
  let seriesName: string;

  test.beforeAll(async () => {
    seriesName = testSeriesName("filters");
    await createPublishedSeries({ name: seriesName });
  });

  test.afterAll(async () => {
    await cleanupTestData({ seriesPrefix: seriesName });
  });

  test("home filters survive reload", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("home-page")).toBeVisible();

    await page.getByRole("button", { name: /Фильтры/ }).click();
    const russia = page.getByRole("button", { name: /Россия/ });
    await expect(russia).toBeVisible();
    await russia.click();
    await page.getByRole("button", { name: /Показать/ }).click();

    await expect(page).toHaveURL(/countries=RU/);
    await expect(page.getByRole("button", { name: /Убрать.*Россия/ })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/countries=RU/);
    await expect(page.getByRole("button", { name: /Убрать.*Россия/ })).toBeVisible();
    await expect(page.getByTestId("home-page")).toBeVisible();
  });

  test("home browser back restores previous filters", async ({ page }) => {
    await page.goto("/?countries=RU");
    await expect(page.getByRole("button", { name: /Убрать.*Россия/ })).toBeVisible();

    await page.getByRole("button", { name: "Сбросить" }).click();
    await expect(page).not.toHaveURL(/countries=/);

    await page.goBack();
    await expect(page).toHaveURL(/countries=RU/);
    await expect(page.getByRole("button", { name: /Убрать.*Россия/ })).toBeVisible();
  });
});
