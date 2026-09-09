import { test, expect } from "@playwright/test";

import { loginWithPassword } from "./fixtures/auth";
import { cleanupTestData, createStaffUser } from "./fixtures/db";
import { TEST_PASSWORD, testEmail, testSeriesName } from "./fixtures/testData";

test.describe("admin content", () => {
  const email = testEmail("aded");
  let seriesName: string;
  let seriesId: string;
  let eventId: string;

  test.beforeAll(async () => {
    seriesName = testSeriesName("aded");
    await createStaffUser({
      email,
      password: TEST_PASSWORD,
      role: "editor",
      nickname: `ed_${email
        .split("@")[0]!
        .replace(/[^a-z0-9_]/gi, "")
        .slice(0, 18)}`,
    });
  });

  test.afterAll(async () => {
    await cleanupTestData({ email, seriesPrefix: seriesName });
  });

  test("editor creates series+event via API after UI login → public page shows it", async ({
    page,
  }) => {
    await page.goto("/admin/login");
    await expect(page).toHaveURL(/\/login/);
    await loginWithPassword(page, email, TEST_PASSWORD);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);

    const venues = await page.request.get("/api/v1/admin/venues?limit=1");
    expect(venues.ok()).toBeTruthy();
    const venueId = (await venues.json()).items[0].id as string;
    const organizers = await page.request.get("/api/v1/admin/organizers?limit=1");
    expect(organizers.ok()).toBeTruthy();
    const organizerId = (await organizers.json()).items[0].id as string;

    const seriesResp = await page.request.post("/api/v1/admin/series", {
      data: {
        organizer_id: organizerId,
        venue_id: venueId,
        name: seriesName,
        starts_on: "2026-12-01",
        ends_on: "2026-12-05",
      },
    });
    expect(seriesResp.ok()).toBeTruthy();
    seriesId = (await seriesResp.json()).id as string;

    const eventResp = await page.request.post(`/api/v1/admin/series/${seriesId}/events`, {
      data: {
        number: 1,
        name: `${seriesName} Main`,
        buyin: "5500.00",
        currency_code: "RUB",
      },
    });
    expect(eventResp.ok()).toBeTruthy();
    eventId = (await eventResp.json()).id as string;

    const flights = await page.request.put(`/api/v1/admin/events/${eventId}/flights`, {
      data: [{ start_at: "2026-12-02T15:00:00" }],
    });
    expect(flights.ok()).toBeTruthy();

    const preview = await page.request.post(`/api/v1/admin/series/${seriesId}/preview`, {
      data: { status: "schedule_published" },
    });
    expect(preview.ok()).toBeTruthy();
    const token = (await preview.json()).preview_token as string;
    const publish = await page.request.patch(`/api/v1/admin/series/${seriesId}`, {
      data: { status: "schedule_published" },
      headers: { "X-Preview-Token": token },
    });
    expect(publish.ok()).toBeTruthy();

    await page.goto(`/series/${seriesId}`);
    await expect(page.getByRole("heading", { name: seriesName })).toBeVisible();
    await expect(page.getByText(/Main/i).first()).toBeVisible();
  });
});
