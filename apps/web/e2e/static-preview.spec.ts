import { expect, test } from "@playwright/test";

test("static preview does not surface auth probe 404 errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  const failedResponses: Array<{ status: number; url: string }> = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push({ status: response.status(), url: response.url() });
    }
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(750);

  expect(failedResponses.filter((response) => /\/auth\/(session|config)$/.test(response.url))).toEqual([]);
  expect(consoleErrors.filter((message) => /404|Failed to load resource/i.test(message))).toEqual([]);
});
