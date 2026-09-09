import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { test, expect } from "@playwright/test";

import { loginWithPassword } from "./fixtures/auth";
import { cleanupTestData, createStaffUser } from "./fixtures/db";
import { TEST_PASSWORD, testEmail, testSeriesName } from "./fixtures/testData";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureCsv = path.join(repoRoot, "backend/tests/fixtures/invalid_schedule.csv");

test.describe("admin import", () => {
  const email = testEmail("adim");
  let seriesName: string;
  let seriesId: string;

  test.beforeAll(async () => {
    seriesName = testSeriesName("adim");
    await createStaffUser({
      email,
      password: TEST_PASSWORD,
      role: "editor",
      nickname: `im_${email
        .split("@")[0]!
        .replace(/[^a-z0-9_]/gi, "")
        .slice(0, 18)}`,
    });
  });

  test.afterAll(async () => {
    await cleanupTestData({ email, seriesPrefix: seriesName });
  });

  test("upload fixture → review → publish → events appear in series", async ({ page }) => {
    await page.goto("/admin/login");
    await loginWithPassword(page, email, TEST_PASSWORD);

    const venues = await page.request.get("/api/v1/admin/venues?limit=1");
    const venueId = (await venues.json()).items[0].id as string;
    const organizers = await page.request.get("/api/v1/admin/organizers?limit=1");
    const organizerId = (await organizers.json()).items[0].id as string;

    const seriesResp = await page.request.post("/api/v1/admin/series", {
      data: {
        organizer_id: organizerId,
        venue_id: venueId,
        name: seriesName,
        starts_on: "2026-08-01",
        ends_on: "2026-08-07",
      },
    });
    expect(seriesResp.ok()).toBeTruthy();
    seriesId = (await seriesResp.json()).id as string;

    await page.goto("/admin/import");
    await expect(page.getByText(/Импорт|Загруз/i).first()).toBeVisible();

    const multipart = await page.request.post("/api/v1/admin/import", {
      multipart: {
        series_id: seriesId,
        file: {
          name: "schedule.csv",
          mimeType: "text/csv",
          buffer: fs.readFileSync(fixtureCsv),
        },
      },
    });
    expect(multipart.ok()).toBeTruthy();
    const body = await multipart.json();
    const jobId = body.id as string;

    // CSV has no template parser → AI mock unavailable → failed; put a valid draft.
    const draftPut = await page.request.put(`/api/v1/admin/import/${jobId}/draft`, {
      data: {
        draft: {
          kind: "schedule",
          events: [
            {
              number: 1,
              name: `${seriesName} Imported`,
              buyin: "5500.00",
              currency_code: "RUB",
              flights: [{ play_date: "2026-08-02", play_time: "14:00:00" }],
            },
          ],
          unparsed_rows: [],
          confidence: "0.95",
          issues: [],
        },
      },
    });
    expect(draftPut.ok()).toBeTruthy();

    await page.goto(`/admin/import/${jobId}`);
    await expect(page.getByText(/Imported|сверк|черновик|Импорт/i).first()).toBeVisible();

    const preview = await page.request.post(`/api/v1/admin/import/${jobId}/publish/preview`);
    expect(preview.ok()).toBeTruthy();
    const token = (await preview.json()).preview_token as string;
    const published = await page.request.post(`/api/v1/admin/import/${jobId}/publish`, {
      headers: { "X-Preview-Token": token },
    });
    expect(published.ok()).toBeTruthy();

    const publicSeries = await page.request.get(`/api/v1/series/${seriesId}`);
    expect(publicSeries.ok()).toBeTruthy();
    const seriesBody = await publicSeries.json();
    const eventNames = (
      seriesBody.events_by_day as Array<{ events: Array<{ name: string }> }>
    ).flatMap((day) => day.events.map((event) => event.name));
    expect(eventNames.some((name) => name.includes("Imported"))).toBeTruthy();

    await page.goto(`/series/${seriesId}`);
    await expect(page.getByRole("heading", { name: seriesName })).toBeVisible();
    // Events are under day chips — open first day that has content.
    const dayButtons = page.locator("button").filter({ hasText: /^\d+$|^день/i });
    if ((await dayButtons.count()) > 0) {
      await dayButtons.first().click();
    }
    await expect(page.getByText(/Imported|#1|5.?500/i).first()).toBeVisible({ timeout: 20_000 });
  });
});
