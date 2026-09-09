import { test, expect } from "@playwright/test";

import { loginWithPassword } from "./fixtures/auth";
import {
  cleanupTestData,
  createPublishedSeries,
  createStaffUser,
  queueForFlight,
} from "./fixtures/db";
import { TEST_PASSWORD, testEmail, testSeriesName } from "./fixtures/testData";

test.describe("reminder", () => {
  const email = testEmail("rem");
  let seriesName: string;
  let flightId: string;
  let eventId: string;
  let seriesId: string;

  test.beforeAll(async () => {
    seriesName = testSeriesName("rem");
    const startAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const created = await createPublishedSeries({ name: seriesName, startAt });
    seriesId = created.series_id;
    eventId = created.event_id;
    flightId = created.flight_id;
    await createStaffUser({
      email,
      password: TEST_PASSWORD,
      role: "user",
      nickname: `u_${email
        .split("@")[0]!
        .replace(/[^a-z0-9_]/gi, "")
        .slice(0, 20)}`,
    });
  });

  test.afterAll(async () => {
    await cleanupTestData({ email, seriesPrefix: seriesName });
  });

  test("bookmark with offset → flight move via API enqueues reminder", async ({ page }) => {
    await loginWithPassword(page, email, TEST_PASSWORD);

    const create = await page.request.post("/api/v1/bookmarks", {
      data: {
        target_type: "flight",
        target_id: flightId,
        reminder_offsets: [1440],
      },
    });
    expect(create.ok()).toBeTruthy();

    // Editor staff for schedule mutation.
    const editorEmail = testEmail("edrem");
    await createStaffUser({
      email: editorEmail,
      password: TEST_PASSWORD,
      role: "editor",
      nickname: `e_${editorEmail
        .split("@")[0]!
        .replace(/[^a-z0-9_]/gi, "")
        .slice(0, 20)}`,
    });

    const editorCtx = await page.context().browser()!.newContext();
    const editorPage = await editorCtx.newPage();
    await loginWithPassword(editorPage, editorEmail, TEST_PASSWORD);

    const newStart = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
    const localIso = newStart.toISOString().slice(0, 19);

    const preview = await editorPage.request.post(
      `/api/v1/admin/events/${eventId}/flights/preview`,
      {
        data: [{ id: flightId, start_at: localIso }],
      },
    );
    expect(preview.ok()).toBeTruthy();
    const token = (await preview.json()).preview_token as string;

    const confirm = await editorPage.request.put(`/api/v1/admin/events/${eventId}/flights`, {
      data: [{ id: flightId, start_at: localIso }],
      headers: { "X-Preview-Token": token },
    });
    expect(confirm.ok()).toBeTruthy();

    await expect
      .poll(async () => {
        const queue = await queueForFlight(flightId);
        return queue.items.filter((item) => item.type === "reminder" && item.status === "pending")
          .length;
      })
      .toBeGreaterThan(0);

    const queue = await queueForFlight(flightId);
    const reminder = queue.items.find((item) => item.type === "reminder");
    expect(reminder).toBeTruthy();
    const flightGet = await editorPage.request.get(`/api/v1/events/${eventId}`);
    expect(flightGet.ok()).toBeTruthy();
    const eventBody = await flightGet.json();
    const flightUtc = eventBody.flights?.[0]?.start_at?.utc as string;
    expect(flightUtc).toBeTruthy();
    const scheduled = new Date(reminder!.scheduled_at).getTime();
    const expected = new Date(flightUtc).getTime() - 1440 * 60 * 1000;
    expect(Math.abs(scheduled - expected)).toBeLessThan(60_000);

    await cleanupTestData({ email: editorEmail });
    await editorCtx.close();
    void seriesId;
  });
});
