import { test, expect } from "@playwright/test";

import { loginWithPassword, registerWithOtp } from "./fixtures/auth";
import { cleanupTestData, createPublishedSeries, setUserPassword } from "./fixtures/db";
import { TEST_PASSWORD, testEmail, testSeriesName } from "./fixtures/testData";

test.describe("registration", () => {
  const email = testEmail("reg");
  let seriesName: string;
  let seriesId: string;

  test.beforeAll(async () => {
    seriesName = testSeriesName("reg");
    const created = await createPublishedSeries({ name: seriesName });
    seriesId = created.series_id;
  });

  test.afterAll(async () => {
    await cleanupTestData({ email, seriesPrefix: seriesName });
  });

  test("otp register without password → migrates guest bookmark; password login after set", async ({
    page,
    context,
  }) => {
    await page.goto(`/series/${seriesId}`);
    await expect(page.getByRole("heading", { name: seriesName })).toBeVisible();
    const cta = page.getByRole("button", { name: /В закладки|Серия в закладках/i });
    await cta.click();
    await expect(page.getByRole("button", { name: /Серия в закладках/i })).toBeVisible();

    await page.goto("/login");
    await expect(page.getByTestId("email-step")).toBeVisible();
    await expect(page.getByText(/парол/i)).toHaveCount(0);

    await registerWithOtp(page, email);

    await page.goto("/bookmarks");
    await expect(page.getByText(seriesName, { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    });

    await setUserPassword(email, TEST_PASSWORD);
    await context.clearCookies();

    await loginWithPassword(page, email, TEST_PASSWORD);
    await expect(page).not.toHaveURL(/\/login/);
  });
});
