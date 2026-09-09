import { expect, type Page } from "@playwright/test";

import { TEST_PASSWORD } from "./testData";

const DEV_OTP = process.env.E2E_OTP_CODE ?? "123456";

export async function loginWithOtp(page: Page, email: string, code: string = DEV_OTP): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.getByTestId("code-step")).toBeVisible();
  await page.getByLabel("Цифра 1").click();
  await page.keyboard.type(code);
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

export async function loginWithPassword(
  page: Page,
  email: string,
  password: string = TEST_PASSWORD,
): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.getByTestId("password-step")).toBeVisible();
  await page.locator("#password-login-password").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** New account via OTP (no password on registration). */
export async function registerWithOtp(
  page: Page,
  email: string,
  code: string = DEV_OTP,
): Promise<void> {
  await loginWithOtp(page, email, code);
}
