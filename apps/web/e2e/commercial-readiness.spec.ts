import { expect, test, type Page } from "@playwright/test";

const shellPages = [
  { path: "/", heading: "随身路书" },
  { path: "/dashboard", headingPattern: /旅行|规划|旅程/ },
  { path: "/journeys", heading: "把草稿整理成真正能出发的旅行。" },
  { path: "/passport", headingPattern: /足迹|记忆/ },
  { path: "/search", heading: "先确定一个城市，再把它变成可执行路书。" }
] as const;

async function mockAnonymousRuntime(page: Page) {
  await page.route("**/auth/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: null })
    })
  );
  await page.route("**/auth/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ providers: { google: { configured: false }, apple: { configured: false } } })
    })
  );
  await page.route("**/api/trips**", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "unauthorized" })
    })
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      viewport: root.clientWidth,
      scrollWidth: root.scrollWidth,
      offenders: Array.from(document.body.querySelectorAll<HTMLElement>("*"))
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && (rect.left < -2 || rect.right > root.clientWidth + 2);
        })
        .slice(0, 5)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          className: element.className.toString(),
          left: Math.round(element.getBoundingClientRect().left),
          right: Math.round(element.getBoundingClientRect().right)
        }))
    };
  });

  expect(overflow.scrollWidth, JSON.stringify(overflow.offenders, null, 2)).toBeLessThanOrEqual(overflow.viewport + 2);
}

async function expectAnyInputValue(page: Page, value: string) {
  await expect
    .poll(async () =>
      page.locator("input").evaluateAll((inputs, expected) => inputs.some((input) => (input as HTMLInputElement).value === expected), value)
    )
    .toBe(true);
}

test.beforeEach(async ({ page }) => {
  await mockAnonymousRuntime(page);
});

for (const pageSpec of shellPages) {
  test(`commercial shell is stable at ${pageSpec.path}`, async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });

    await page.goto(pageSpec.path, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible();

    if ("heading" in pageSpec) {
      await expect(page.getByRole("heading", { name: pageSpec.heading }).first()).toBeVisible();
    } else {
      await expect(page.getByRole("heading", { name: pageSpec.headingPattern }).first()).toBeVisible();
    }

    await expect(page.getByRole("button", { name: "打开 AI 修改窗口" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(browserErrors).toEqual([]);
  });
}

test("global AI prompt routes into the routebook preview assistant", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "打开 AI 修改窗口" }).click();
  await expect(page.getByRole("dialog", { name: "AI 修改路书" })).toBeVisible();
  await page.getByPlaceholder("例如：把第三天节奏放松一点，晚餐换成更有当地特色的选择。").fill("把第二天节奏放松一点");
  await page.getByRole("button", { name: "进入预览" }).click();

  await expect(page.locator(".ai-assistant-panel")).toBeVisible();
  await expect(page.locator(".ai-assistant-panel textarea")).toHaveValue("把第二天节奏放松一点");
  await expect(page.getByRole("button", { name: /生成修改预览/ })).toBeDisabled();
  await expect(page.getByText("登录后可使用 AI 修改行程。")).toBeVisible();
});

test("local routebook editing supports a first itinerary item without login", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "添加行程项" }).click();
  await expect(page.getByRole("heading", { name: "新的行程项" })).toBeVisible();

  await page.getByRole("button", { name: "编辑 新的行程项" }).click();
  await page.locator(".route-step-editor input").nth(2).fill("浅草寺参观");

  await expect(page.getByRole("heading", { name: "浅草寺参观" })).toBeVisible();
  await expect(page.getByText("待补地点")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("core routebook modules allow adding places and bookings", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("radio", { name: "地点" }).click();
  await expect(page.getByPlaceholder("搜索或粘贴地点名称")).toBeVisible();
  await page.getByRole("button", { name: "添加地点" }).click();
  await expectAnyInputValue(page, "新的收藏地点");

  await page.getByRole("radio", { name: "预订" }).click();
  await page.getByRole("button", { name: "添加预订" }).click();
  await expectAnyInputValue(page, "新的预订");
  await expectNoHorizontalOverflow(page);
});

test("id based journey URL has a browser fallback in static-compatible routing", async ({ page }) => {
  const tripId = "trip_00000000-0000-4000-8000-000000000000";
  await page.goto(`/journeys/${tripId}`, { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(new RegExp(`/journeys/(edit|${tripId})`));
  await expect(page.locator("main")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
