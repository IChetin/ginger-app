import { test, expect } from "@playwright/test";

import { loginWithPassword, registerWithOtp } from "./fixtures/auth";
import { cleanupTestData, setUserPassword } from "./fixtures/db";
import { TEST_PASSWORD, testEmail } from "./fixtures/testData";

test.describe("registration", () => {
  const email = testEmail("reg");

  test.afterAll(async () => {
    await cleanupTestData({ email });
  });

  test("otp register without password; password login after set", async ({ page, context }) => {
    await page.goto("/login");
    await expect(page.getByTestId("email-step")).toBeVisible();
    await expect(page.getByText(/парол/i)).toHaveCount(0);

    await registerWithOtp(page, email);

    await setUserPassword(email, TEST_PASSWORD);
    await context.clearCookies();

    await loginWithPassword(page, email, TEST_PASSWORD);
    await expect(page).not.toHaveURL(/\/login/);
  });
});
