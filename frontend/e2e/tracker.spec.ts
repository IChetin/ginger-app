import { test, expect } from "@playwright/test";

import { loginWithPassword } from "./fixtures/auth";
import { cleanupTestData, createPublishedSeries, createStaffUser } from "./fixtures/db";
import { TEST_PASSWORD, testEmail, testSeriesName } from "./fixtures/testData";

test.describe("tracker", () => {
  const email = testEmail("trk");
  let seriesName: string;
  let eventId: string;

  test.beforeAll(async () => {
    seriesName = testSeriesName("trk");
    const created = await createPublishedSeries({ name: seriesName });
    eventId = created.event_id;
    await createStaffUser({
      email,
      password: TEST_PASSWORD,
      role: "user",
      nickname: `t_${email
        .split("@")[0]!
        .replace(/[^a-z0-9_]/gi, "")
        .slice(0, 20)}`,
    });
  });

  test.afterAll(async () => {
    await cleanupTestData({ email, seriesPrefix: seriesName });
  });

  test("add result from event card → stats match expected profit", async ({ page }) => {
    await loginWithPassword(page, email, TEST_PASSWORD);

    // buyin 10000 × 1 entry − payout 0 = −10000 (series event buyin is 10000 RUB)
    const created = await page.request.post("/api/v1/results", {
      data: {
        event_id: eventId,
        played_on: "2024-06-10",
        entries_count: 1,
        payout: "0",
      },
    });
    expect(created.ok()).toBeTruthy();

    await page.goto("/tracker");
    await expect(page.getByTestId("tracker-page")).toBeVisible();

    const stats = await page.request.get("/api/v1/stats");
    expect(stats.ok()).toBeTruthy();
    const body = await stats.json();
    expect(body.tournaments).toBe(1);
    expect(body.profit).toBe("-10000.00");
    expect(body.invested).toBe("10000.00");

    await expect(page.getByTestId("tracker-page")).toBeVisible();
  });
});
