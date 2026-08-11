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

async function mockSignedInTripListRuntime(page: Page) {
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
  await page.route("**/api/trips", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        trips: [
          {
            id: "trip_tokyo",
            title: "东京亲子路书",
            destination: "Tokyo, Japan",
            status: "draft",
            startDate: "2026-09-01",
            endDate: "2026-09-05",
            dayCount: 5,
            placeCount: 12,
            bookingCount: 3,
            updatedAt: "2026-08-12T00:00:00.000Z"
          },
          {
            id: "trip_legacy_published",
            title: "埃及红海路书",
            destination: "Egypt Cairo Red Sea",
            status: "published",
            startDate: "2026-10-01",
            endDate: "2026-10-09",
            dayCount: 9,
            placeCount: 18,
            bookingCount: 6,
            updatedAt: "2026-08-11T00:00:00.000Z"
          }
        ]
      })
    })
  );
}

async function mockPublicShareRuntime(page: Page) {
  const tripId = "trip_public_readable";
  await page.route("**/api/share/public_tokyo_test", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        share: {
          id: "share_public_test",
          tripId,
          token: "public_tokyo_test",
          visibility: "public",
          allowCopy: true,
          revokedAt: null,
          expiresAt: null
        },
        trip: {
          id: tripId,
          ownerId: "google:test-user",
          title: "东京公开路书",
          destination: "Tokyo, Japan",
          startDate: "2026-09-01",
          endDate: "2026-09-03",
          timezone: "Asia/Tokyo",
          status: "published",
          places: [
            {
              id: "place_sensoji",
              tripId,
              name: "浅草寺",
              category: "culture",
              latitude: 35.7148,
              longitude: 139.7967,
              address: "2 Chome-3-1 Asakusa, Taito City, Tokyo",
              tags: ["temple"],
              isFavorite: true
            }
          ],
          bookings: [
            {
              id: "booking_hotel",
              tripId,
              type: "hotel",
              title: "Hotel Niwa Tokyo",
              status: "confirmed",
              confirmationCode: "ABC123",
              attachmentIds: [],
              segments: []
            }
          ],
          attachments: [],
          packingItems: [{ id: "packing_suica", tripId, title: "Suica 卡", category: "documents", quantity: 1, packed: false }],
          weather: [],
          budgetMembers: [],
          budgetItems: [],
          days: [
            {
              id: "day_tokyo_1",
              tripId,
              date: "2026-09-01",
              title: "抵达东京",
              sortOrder: 0,
              items: [
                {
                  id: "item_legacy_type",
                  dayId: "day_tokyo_1",
                  tripId,
                  type: "sightseeing",
                  title: "浅草寺散步",
                  startTime: "09:30",
                  endTime: "11:00",
                  placeId: "place_sensoji",
                  notes: "早上人少，适合拍照。",
                  attachmentIds: [],
                  sortOrder: 0
                }
              ]
            }
          ]
        }
      })
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

async function expectVisibleTapTargetsAtLeast44(page: Page, selector: string) {
  const targets = await page.locator(selector).evaluateAll((elements) =>
    elements
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && rect.top < window.innerHeight;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          text: element.textContent?.trim().replace(/\s+/g, " ") ?? element.getAttribute("aria-label") ?? "",
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
      })
  );

  expect(targets.length).toBeGreaterThan(0);
  for (const target of targets) {
    expect(target.width, `${target.text} width`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${target.text} height`).toBeGreaterThanOrEqual(44);
  }
}

function relativeLuminance([red, green, blue]: [number, number, number]) {
  const [r, g, b] = [red, green, blue].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: [number, number, number], background: [number, number, number]) {
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgb(value: string): [number, number, number] {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) throw new Error(`Unsupported color value: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
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

for (const path of ["/", "/dashboard"] as const) {
  test(`top navigation keeps usable tap targets at ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator(path === "/" ? ".hero-shell .product-nav" : ".product-nav").first()).toBeVisible();
    await expect(page.locator(".product-nav-actions a").first()).toBeVisible();

    const actions = await page.locator(".product-nav-brand, .product-nav-links a, .product-nav-actions a").evaluateAll((links) =>
      links
        .filter((link) => {
          const style = getComputedStyle(link);
          const rect = link.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
        })
        .map((link) => {
          const rect = link.getBoundingClientRect();
          return {
            text: link.textContent?.trim() ?? "",
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          };
        })
    );

    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(action.width, `${path} ${action.text} width`).toBeGreaterThanOrEqual(44);
      expect(action.height, `${path} ${action.text} height`).toBeGreaterThanOrEqual(44);
    }
    await expectNoHorizontalOverflow(page);
  });
}

test("signed-in top navigation keeps account actions tappable", async ({ page }) => {
  await mockSignedInTripListRuntime(page);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  await expect(page.locator(".product-nav-user")).toBeVisible();
  await expectVisibleTapTargetsAtLeast44(page, ".product-nav-brand, .product-nav-links a, .product-nav-user, .product-nav-actions button");
  await expectNoHorizontalOverflow(page);
});

for (const path of ["/dashboard", "/journeys", "/search", "/passport"] as const) {
  test(`product shell actions keep usable tap targets at ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });

    await expectVisibleTapTargetsAtLeast44(page, "main a, main button");
    await expectNoHorizontalOverflow(page);
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

test("expanded itinerary card actions keep usable tap targets", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "添加行程项" }).click();
  await page.getByRole("button", { name: "编辑 新的行程项" }).click();

  await expectVisibleTapTargetsAtLeast44(page, ".route-step-card button, .route-step-card a");
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

const lightPagePrimaryCtas = [
  { path: "/dashboard", selector: ".dashboard-hero-actions a", label: "新建路书" },
  { path: "/journeys", selector: ".journeys-heading a", label: "新建路书" },
  { path: "/search", selector: ".search-heading a", label: "打开编辑器" },
  { path: "/passport", selector: ".passport-hero-actions a", label: "打开路书" }
] as const;

for (const ctaSpec of lightPagePrimaryCtas) {
  test(`primary CTA label remains readable at ${ctaSpec.path}`, async ({ page }) => {
    await page.goto(ctaSpec.path, { waitUntil: "domcontentloaded" });

    const cta = page.locator(ctaSpec.selector).first();
    await expect(cta).toContainText(ctaSpec.label);

    const colors = await cta.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        color: style.color,
        backgroundColor: style.backgroundColor
      };
    });

    expect(contrastRatio(parseRgb(colors.color), parseRgb(colors.backgroundColor))).toBeGreaterThanOrEqual(4.5);
    await expectNoHorizontalOverflow(page);
  });
}

test("signed-in routebook lists show customer-facing status labels", async ({ page }) => {
  await mockSignedInTripListRuntime(page);

  await page.goto("/journeys", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("草稿").first()).toBeVisible();
  await expect(page.getByText("已发布").first()).toBeVisible();
  await expect(page.getByText("draft", { exact: true })).toHaveCount(0);
  await expect(page.getByText("published", { exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("signed-in journey cards keep destination imagery full bleed", async ({ page }) => {
  await mockSignedInTripListRuntime(page);

  await page.goto("/journeys", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".journey-photo-card")).toHaveCount(2);

  const cards = await page.locator(".journey-photo-card").evaluateAll((elements) =>
    elements.map((element) => {
      const card = element.getBoundingClientRect();
      const image = element.querySelector<HTMLElement>(".journey-card-image")?.getBoundingClientRect();
      return {
        cardWidth: Math.round(card.width),
        cardHeight: Math.round(card.height),
        imageWidth: Math.round(image?.width ?? 0),
        imageHeight: Math.round(image?.height ?? 0)
      };
    })
  );

  for (const card of cards) {
    expect(card.imageWidth, JSON.stringify(card)).toBeGreaterThanOrEqual(card.cardWidth - 2);
    expect(card.imageHeight, JSON.stringify(card)).toBeGreaterThanOrEqual(card.cardHeight - 2);
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

test("public share routebook renders safely with legacy itinerary types", async ({ page }) => {
  await mockPublicShareRuntime(page);
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.goto("/share?token=public_tokyo_test", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "东京公开路书" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "浅草寺散步" })).toBeVisible();
  await expect(page.getByText("活动").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "打开 AI 修改窗口" })).toHaveCount(0);
  const routePosition = await page.locator(".share-route").boundingBox();
  const viewport = page.viewportSize();
  expect(routePosition?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(viewport?.height ?? 0);
  expect(browserErrors).toEqual([]);
  await expectNoHorizontalOverflow(page);
});

test("invalid public share links show a customer-facing error", async ({ page }) => {
  await page.route("**/api/share/missing_share", (route) =>
    route.fulfill({
      status: 404,
      contentType: "text/html",
      body: "<!DOCTYPE html><title>Not found</title>"
    })
  );

  await page.goto("/share?token=missing_share", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "分享不可用" })).toBeVisible();
  await expect(page.getByText("无法打开分享路书")).toBeVisible();
  await expect(page.getByText(/Unexpected token|DOCTYPE|JSON/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "打开 AI 修改窗口" })).toHaveCount(0);
  await expectVisibleTapTargetsAtLeast44(page, ".share-state a");
  await expectNoHorizontalOverflow(page);
});

test("id based journey URL has a browser fallback in static-compatible routing", async ({ page }) => {
  const tripId = "trip_00000000-0000-4000-8000-000000000000";
  await page.goto(`/journeys/${tripId}`, { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(new RegExp(`/journeys/(edit|${tripId})`));
  await expect(page.locator("main")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
