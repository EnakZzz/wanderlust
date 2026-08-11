import { expect, test, type Page } from "@playwright/test";

const localDraftStorageKey = "wanderlust.editorDraft.v2";

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

async function mockSignedInRuntime(page: Page) {
  const tripId = "trip_11111111-1111-4111-8111-111111111111";
  const trip = {
    id: tripId,
    ownerId: "google:test-user",
    title: "东京商业路书",
    destination: "Tokyo, Japan",
    startDate: "2026-09-01",
    endDate: "2026-09-02",
    timezone: "Asia/Tokyo",
    status: "draft",
    days: [
      {
        id: `${tripId}-2026-09-01`,
        tripId,
        date: "2026-09-01",
        title: "抵达东京",
        sortOrder: 0,
        items: []
      },
      {
        id: `${tripId}-2026-09-02`,
        tripId,
        date: "2026-09-02",
        title: "城市探索",
        sortOrder: 1,
        items: []
      }
    ],
    places: [],
    bookings: [],
    attachments: [],
    packingItems: [],
    weather: [],
    budgetMembers: [],
    budgetItems: []
  };
  const summary = {
    id: tripId,
    title: trip.title,
    destination: trip.destination,
    status: trip.status,
    startDate: trip.startDate,
    endDate: trip.endDate,
    dayCount: 2,
    placeCount: 0,
    bookingCount: 0,
    updatedAt: "2026-08-12T00:00:00.000Z"
  };
  const calls = { saves: 0, shares: 0 };

  await page.route("**/auth/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { id: "google:test-user", provider: "google", email: "test@example.com", name: "Test Traveler" } })
    })
  );
  await page.route("**/auth/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ providers: { google: { configured: true }, apple: { configured: false } } })
    })
  );
  await page.route("**/api/trips", async (route) => {
    if (route.request().method() === "POST") {
      calls.saves += 1;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ trip }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ trips: [summary] }) });
  });
  await page.route(`**/api/trips/${encodeURIComponent(tripId)}`, async (route) => {
    if (route.request().method() === "PUT") {
      calls.saves += 1;
      const nextTrip = await route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ trip: nextTrip }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ trip }) });
  });
  await page.route(`**/api/trips/${encodeURIComponent(tripId)}/share`, (route) => {
    calls.shares += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        share: {
          id: "share_test",
          tripId,
          token: "public_tokyo_test",
          visibility: "public",
          allowCopy: true,
          revokedAt: null,
          expiresAt: null
        }
      })
    });
  });
  await page.exposeFunction("getCommercialApiCalls", () => calls);
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

test("home page brings the routebook editor into the first viewport", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const currentRoutebook = page.locator(".routebook-current");
  await expect(currentRoutebook).toBeVisible();

  const editorPosition = await currentRoutebook.boundingBox();
  const viewport = page.viewportSize();
  expect(editorPosition?.y ?? Number.POSITIVE_INFINITY).toBeLessThan((viewport?.height ?? 0) - 96);
  await expect(page.locator(".global-ai-launcher")).toHaveCount(1);
  await expect(page.locator(".ai-assistant-launcher")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
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

test("expanded itinerary cards stay readable on mobile", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "添加行程项" }).click();
  await page.getByRole("button", { name: "编辑 新的行程项" }).click();

  if ((page.viewportSize()?.width ?? 0) <= 500) {
    const layout = await page.locator(".route-step-card").first().evaluate((card) => {
      const body = card.querySelector<HTMLElement>(".route-step-body");
      return {
        columns: getComputedStyle(card).gridTemplateColumns.split(" ").length,
        bodyWidth: Math.round(body?.getBoundingClientRect().width ?? 0)
      };
    });
    expect(layout.columns).toBe(1);
    expect(layout.bodyWidth).toBeGreaterThan(260);
  }

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

test("global AI launcher does not cover mobile editor forms", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("radio", { name: "地点" }).click();
  await page.getByRole("button", { name: "添加地点" }).click();

  if ((page.viewportSize()?.width ?? 0) <= 500) {
    const layout = await page.evaluate(() => {
      const launcher = document.querySelector<HTMLElement>(".global-ai-launcher")?.getBoundingClientRect();
      const input = Array.from(document.querySelectorAll<HTMLInputElement>("input")).find((item) => item.value === "新的收藏地点")?.getBoundingClientRect();
      if (!launcher || !input) return null;
      const overlaps = !(launcher.right < input.left || launcher.left > input.right || launcher.bottom < input.top || launcher.top > input.bottom);
      return {
        launcherLeft: Math.round(launcher.left),
        viewport: document.documentElement.clientWidth,
        overlaps
      };
    });

    expect(layout).not.toBeNull();
    expect(layout!.launcherLeft).toBeGreaterThan(layout!.viewport / 2);
    expect(layout!.overlaps).toBe(false);
  }

  await expectNoHorizontalOverflow(page);
});

test("anonymous users can create a named local routebook and keep it after refresh", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "编辑路书信息" }).click();
  await expect(page.getByRole("dialog", { name: "更新路书信息" })).toBeVisible();
  await page.getByLabel("路书标题").fill("东京亲子路书");
  await page.getByLabel("目的地").fill("Tokyo, Japan");
  await page.getByLabel("时区").fill("Asia/Tokyo");
  await page.locator(".routebook-meta-form input[type='date']").first().fill("2026-09-01");
  await page.locator(".routebook-meta-form input[type='date']").nth(1).fill("2026-09-03");
  await page.getByRole("button", { name: "保存修改" }).click();

  await expect(page.getByRole("button", { name: /东京亲子路书/ })).toBeVisible();
  await page.getByRole("button", { name: "添加行程项" }).click();
  await page.getByRole("button", { name: "保存" }).click();

  const storedTitle = await page.evaluate((storageKey) => {
    const stored = window.localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored).title : null;
  }, localDraftStorageKey);
  expect(storedTitle).toBe("东京亲子路书");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: /东京亲子路书/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "新的行程项" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("signed-in users can save and create a share link for a routebook", async ({ page }) => {
  await mockSignedInRuntime(page);
  await page.goto("/journeys/trip_11111111-1111-4111-8111-111111111111", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("button", { name: /^当前路书 东京商业路书/ })).toBeVisible();
  await page.getByRole("button", { name: "添加行程项" }).click();
  await page.getByRole("button", { name: "保存" }).click();
  await page.getByRole("button", { name: "分享" }).click();

  await expect(page.getByText(/分享链接已(复制|生成)/)).toBeVisible();
  await expect(page.getByRole("link", { name: "打开只读页" })).toHaveAttribute("href", /token=public_tokyo_test/);
  await expect
    .poll(async () => page.evaluate(async () => (window as unknown as { getCommercialApiCalls: () => Promise<{ saves: number; shares: number }> }).getCommercialApiCalls()))
    .toMatchObject({ saves: 1, shares: 1 });
});

test("id based journey URL has a browser fallback in static-compatible routing", async ({ page }) => {
  const tripId = "trip_00000000-0000-4000-8000-000000000000";
  await page.goto(`/journeys/${tripId}`, { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(new RegExp(`/journeys/(edit|${tripId})`));
  await expect(page.locator("main")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
