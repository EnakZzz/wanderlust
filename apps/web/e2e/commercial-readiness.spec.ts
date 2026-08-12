import { expect, test, type Page } from "@playwright/test";

const localDraftStorageKey = "wanderlust.editorDraft.v2";

const shellPages = [
  { path: "/", heading: "随身路书" },
  { path: "/dashboard", headingPattern: /旅行|规划|旅程/ },
  { path: "/journeys", heading: "把草稿整理成真正能出发的旅行。" },
  { path: "/passport", headingPattern: /足迹|记忆/ },
  { path: "/search", heading: "先确定一个城市，再把它变成可执行路书。" }
] as const;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function mockSignedInRuntime(page: Page, options: { saveDelayMs?: number } = {}) {
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
  const calls = { saves: 0, shares: 0, deletes: 0 };

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
      if (options.saveDelayMs) await delay(options.saveDelayMs);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ trip }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ trips: [summary] }) });
  });
  await page.route(`**/api/trips/${encodeURIComponent(tripId)}`, async (route) => {
    if (route.request().method() === "DELETE") {
      calls.deletes += 1;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
    if (route.request().method() === "PUT") {
      calls.saves += 1;
      const nextTrip = await route.request().postDataJSON();
      if (options.saveDelayMs) await delay(options.saveDelayMs);
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

async function mockGoogleStaticMapPreview(page: Page) {
  await page.route("**/api/maps/client-config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ configured: false })
    })
  );

  await page.route("**/api/maps/static-preview**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560">
        <rect width="900" height="560" fill="#d8e7dc"/>
        <path d="M0 420 C180 360 300 470 470 390 S700 250 900 300" fill="none" stroke="#8a9f8a" stroke-width="28"/>
        <path d="M70 130 H830 M150 0 V560 M420 0 V560 M0 260 H900" stroke="#f8f0df" stroke-width="18" opacity="0.82"/>
        <circle cx="350" cy="260" r="28" fill="#8a3f36"/>
      </svg>`
    })
  );
}

async function mockSignedInTripListRuntime(page: Page) {
  const tokyoTrip = {
    id: "trip_tokyo",
    ownerId: "google:test-user",
    title: "东京亲子路书",
    destination: "Tokyo, Japan",
    startDate: "2026-09-01",
    endDate: "2026-09-05",
    timezone: "Asia/Tokyo",
    status: "draft",
    days: [
      {
        id: "trip_tokyo-2026-09-01",
        tripId: "trip_tokyo",
        date: "2026-09-01",
        title: "抵达东京",
        sortOrder: 0,
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
  const egyptTrip = {
    id: "trip_legacy_published",
    ownerId: "google:test-user",
    title: "埃及红海路书",
    destination: "埃及：开罗 / 红海",
    startDate: "2026-10-01",
    endDate: "2026-10-09",
    timezone: "Africa/Cairo",
    status: "published",
    days: [
      {
        id: "trip_legacy_published-2026-10-01",
        tripId: "trip_legacy_published",
        date: "2026-10-01",
        title: "开罗集合",
        sortOrder: 0,
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
  await page.route("**/api/trips/trip_tokyo", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ trip: tokyoTrip }) })
  );
  await page.route("**/api/trips/trip_legacy_published", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ trip: egyptTrip }) })
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
            destination: "埃及：开罗 / 红海",
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
              googlePlaceId: "ChIJ8T1GpMGOGGARw6cSJo9lN4g",
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

async function mockPublicShareWithEmptyDepartureRuntime(page: Page) {
  const tripId = "trip_public_empty_departure";
  await page.route("**/api/share/public_empty_departure", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        share: {
          id: "share_empty_departure",
          tripId,
          token: "public_empty_departure",
          visibility: "public",
          allowCopy: true,
          revokedAt: null,
          expiresAt: null
        },
        trip: {
          id: tripId,
          ownerId: "google:test-user",
          title: "里斯本公开路书",
          destination: "Lisbon, Portugal",
          startDate: "2026-10-01",
          endDate: "2026-10-03",
          timezone: "Europe/Lisbon",
          status: "published",
          places: [],
          bookings: [{
            id: "booking_blank",
            tripId,
            type: "ticket",
            title: "新的预订",
            status: "todo",
            attachmentIds: [],
            segments: []
          }],
          attachments: [],
          packingItems: [{ id: "packing_blank", tripId, title: "   ", category: "documents", quantity: 1, packed: true }],
          weather: [],
          budgetMembers: [],
          budgetItems: [],
          days: [
            {
              id: "day_lisbon_1",
              tripId,
              date: "2026-10-01",
              title: "抵达里斯本",
              sortOrder: 0,
              items: []
            }
          ]
        }
      })
    })
  );
}

async function mockPublicShareWithPendingBookingRuntime(page: Page) {
  const tripId = "trip_public_pending_booking";
  await page.route("**/api/share/public_pending_booking", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        share: {
          id: "share_pending_booking",
          tripId,
          token: "public_pending_booking",
          visibility: "public",
          allowCopy: true,
          revokedAt: null,
          expiresAt: null
        },
        trip: {
          id: tripId,
          ownerId: "google:test-user",
          title: "曼谷公开路书",
          destination: "Bangkok, Thailand",
          startDate: "2026-11-05",
          endDate: "2026-11-07",
          timezone: "Asia/Bangkok",
          status: "published",
          places: [],
          bookings: [{
            id: "booking_pending_dinner",
            tripId,
            type: "ticket",
            title: "晚餐候补确认",
            status: "todo",
            startsAt: "2026-11-05 19:00",
            attachmentIds: [],
            segments: []
          }],
          attachments: [],
          packingItems: [],
          weather: [],
          budgetMembers: [],
          budgetItems: [],
          days: []
        }
      })
    })
  );
}

async function mockPublicShareWithDraftCoordinatesRuntime(page: Page) {
  const tripId = "trip_public_draft_coordinates";
  await page.route("**/api/share/public_draft_coordinates", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        share: {
          id: "share_draft_coordinates",
          tripId,
          token: "public_draft_coordinates",
          visibility: "public",
          allowCopy: true,
          revokedAt: null,
          expiresAt: null
        },
        trip: {
          id: tripId,
          ownerId: "google:test-user",
          title: "冰岛公开路书",
          destination: "Iceland",
          startDate: "2026-11-01",
          endDate: "2026-11-02",
          timezone: "Atlantic/Reykjavik",
          status: "published",
          places: [
            {
              id: "place_draft_lagoon",
              tripId,
              name: "蓝湖温泉",
              category: "nature",
              latitude: 0,
              longitude: 0,
              tags: [],
              isFavorite: false
            }
          ],
          bookings: [],
          attachments: [],
          packingItems: [],
          weather: [],
          budgetMembers: [],
          budgetItems: [],
          days: [
            {
              id: "day_iceland_1",
              tripId,
              date: "2026-11-01",
              title: "抵达冰岛",
              sortOrder: 0,
              items: [
                {
                  id: "item_draft_lagoon",
                  dayId: "day_iceland_1",
                  tripId,
                  type: "place",
                  title: "蓝湖温泉",
                  startTime: "15:00",
                  placeId: "place_draft_lagoon",
                  notes: "地点还在确认中。",
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

    if ((page.viewportSize()?.width ?? 0) > 500) {
      await expect(page.getByRole("button", { name: "打开 AI 修改窗口" })).toBeVisible();
    }
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
    await expect(page.getByRole("link", { name: "返回首页" })).toBeVisible();
    await expect(page.getByRole("link", { name: "打开路书列表" })).toBeVisible();
    await expect(page.getByRole("link", { name: "打开 AI 修改入口" })).toBeVisible();

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

test("primary navigation label stays localized", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("destination search exposes a stable input label", async ({ page }) => {
  await page.goto("/search", { waitUntil: "domcontentloaded" });

  await expect(page.getByLabel("搜索目的地")).toBeVisible();
});

test("mobile destination search keeps input and action in one control", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/dashboard", "/search"] as const) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const layout = await page.locator(".destination-panel-search").first().evaluate((panel) => {
      const panelBox = panel.getBoundingClientRect();
      const inputBox = panel.querySelector("input")!.getBoundingClientRect();
      const actionBox = panel.querySelector(".destination-panel-action")!.getBoundingClientRect();
      return {
        panelHeight: Math.round(panelBox.height),
        inputTop: Math.round(inputBox.top),
        actionTop: Math.round(actionBox.top),
        actionLeft: Math.round(actionBox.left),
        inputRight: Math.round(inputBox.right),
        actionHeight: Math.round(actionBox.height),
        actionWidth: Math.round(actionBox.width)
      };
    });
    expect(layout.panelHeight, `${path} search control should stay compact`).toBeLessThanOrEqual(82);
    expect(Math.abs(layout.inputTop - layout.actionTop), `${path} input and action should align`).toBeLessThanOrEqual(10);
    expect(layout.actionLeft, `${path} action should sit after the input`).toBeGreaterThanOrEqual(layout.inputRight - 4);
    expect(layout.actionHeight, `${path} action tap target`).toBeGreaterThanOrEqual(44);
    expect(layout.actionWidth, `${path} action tap target`).toBeGreaterThanOrEqual(44);
  }
  await expectNoHorizontalOverflow(page);
});

test("destination search guides selection into routebook planning", async ({ page }) => {
  await page.goto("/search", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("region", { name: "目的地搜索流程" })).toBeVisible();
  await expect(page.locator(".search-flow-step")).toHaveCount(3);
  await expect(page.locator(".search-flow-step").nth(0)).toContainText("搜索城市");
  await expect(page.locator(".search-flow-step").nth(1)).toContainText("确认地点");
  await expect(page.locator(".search-flow-step").nth(2)).toContainText("生成路书");

  const kyotoInspiration = page.locator(".search-inspiration-card").filter({ hasText: "京都" });
  await expect(kyotoInspiration).toHaveAttribute("href", /destination=%E4%BA%AC%E9%83%BD/);
  await expect(kyotoInspiration).toHaveAttribute("href", /#editor$/);
  await expect(page.locator(".search-inspiration-card")).toHaveCount(3);
  await expectVisibleTapTargetsAtLeast44(page, ".search-heading a, .destination-quick-grid a, .search-inspiration-card");
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("搜索目的地")).toBeInViewport();
  const mobileSearchPosition = await page.locator(".destination-panel-search").first().boundingBox();
  expect(mobileSearchPosition?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(760);
  await expect(page.locator(".search-flow-step").first()).toBeVisible();
  await expect(page.locator(".search-inspiration-card").first()).toBeVisible();
  await expectVisibleTapTargetsAtLeast44(page, ".search-heading a, .destination-quick-grid a, .search-inspiration-card");
  await expectNoHorizontalOverflow(page);
});

test("editor falls back to a local routebook when session check stalls", async ({ page }) => {
  await page.route("**/auth/session", () => {
    // Simulates an unavailable auth edge so the editor must not remain a skeleton forever.
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("radio", { name: "地点" })).toBeVisible({ timeout: 8_000 });
  await expect(page.locator(".workspace-loading")).toHaveCount(0);
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
  await page.getByLabel("全局 AI 修改需求").fill("把第二天节奏放松一点");
  await page.getByRole("button", { name: "进入预览" }).click();

  await expect(page.locator(".ai-assistant-panel")).toBeVisible();
  await expect(page.getByLabel("AI 修改需求")).toHaveValue("把第二天节奏放松一点");
  await expect(page.getByRole("button", { name: /生成修改预览/ })).toBeDisabled();
  await expect(page.getByText("登录后可使用 AI 修改行程。")).toBeVisible();
});

test("anonymous contextual AI entry opens the preview assistant with login guidance", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const moduleAiButton = page.getByRole("button", { name: "AI 优化行程模块" });
  await expect(moduleAiButton).toBeEnabled();
  await moduleAiButton.click();

  await expect(page.locator(".ai-assistant-panel")).toBeVisible();
  await expect(page.getByLabel("AI 修改需求")).toHaveValue(/帮我优化/);
  await expect(page.getByText("登录后可使用 AI 修改行程。")).toBeVisible();
  await expect(page.getByRole("button", { name: /生成修改预览/ })).toBeDisabled();
  await expectNoHorizontalOverflow(page);
});

test("global command has a visible launcher and can hand prompts to AI", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole("button", { name: "打开全局命令窗口" })).toBeVisible();
  await expectVisibleTapTargetsAtLeast44(page, ".global-command-launcher");
  await page.getByRole("button", { name: "打开全局命令窗口" }).click();
  await expect(page.getByRole("dialog", { name: "快速操作" })).toBeVisible();
  await expect(page.locator(".global-ai-launcher")).toHaveCSS("visibility", "hidden");
  await expect(page.locator(".global-command-launcher")).toHaveCSS("visibility", "hidden");
  const commandDialog = page.getByRole("dialog", { name: "快速操作" });
  await expect(commandDialog.getByText("工作台", { exact: true })).toBeVisible();
  await expect(commandDialog.getByText("路书库", { exact: true })).toBeVisible();
  await expect(commandDialog.getByText("足迹", { exact: true })).toBeVisible();
  await expect(commandDialog.getByText("目的地", { exact: true })).toBeVisible();
  await expect(commandDialog.getByText("AI 指令", { exact: true })).toBeVisible();
  await expect(commandDialog.getByText(/Dashboard|Journeys|Passport|Search|Prompt/)).toHaveCount(0);

  await page.getByRole("combobox", { name: "全局命令输入" }).fill("把第一天节奏放慢");
  await page.getByText("AI 修改当前路书").click();

  await expect(page.getByRole("dialog", { name: "AI 修改路书" })).toBeVisible();
  await expect(page.getByLabel("全局 AI 修改需求")).toHaveValue("把第一天节奏放慢");
  await expectNoHorizontalOverflow(page);
});

test("AI itinerary changes render a confirmable preview before applying", async ({ page }) => {
  await mockSignedInRuntime(page);
  await page.route("**/api/ai/patch", async (route) => {
    const body = await route.request().postDataJSON();
    const day = body.trip.days[0];
    const item = day.items[0];

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "workers-ai",
        model: "@cf/test-model",
        proposal: {
          id: "proposal_relaxed_morning",
          summary: "上午节奏调整预览",
          operations: [
            {
              id: "op_relax_first_item",
              type: "update_item",
              summary: "把上午行程改成浅草寺慢游",
              dayId: day.id,
              itemId: item.id,
              before: { title: item.title },
              after: { title: "浅草寺慢游" }
            }
          ]
        }
      })
    });
  });

  await page.goto("/journeys/trip_11111111-1111-4111-8111-111111111111", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "添加行程项" }).click();
  await expect(page.getByRole("heading", { name: "新的行程项" })).toBeVisible();

  await page.getByRole("button", { name: "打开 AI 修改窗口" }).click();
  await page.getByPlaceholder("例如：把第三天节奏放松一点，晚餐换成更有当地特色的选择。").fill("把第一天上午节奏放松一点");
  await page.getByRole("button", { name: "进入预览" }).click();
  await page.getByRole("button", { name: "生成修改预览" }).click();

  await expect(page.getByText("上午节奏调整预览")).toBeVisible();
  await expect(page.locator(".ai-patch-preview")).toContainText("2026年9月1日");
  await expect(page.locator(".ai-patch-preview").getByText(/2026-09-01/)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "浅草寺慢游" })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "应用 AI 修改 把上午行程改成浅草寺慢游" })).toHaveAttribute("aria-checked", "true");
  await expectVisibleTapTargetsAtLeast44(page, ".ai-operation-checkbox, .ai-patch-preview-heading button");

  await page.getByRole("button", { name: "应用勾选修改" }).click();
  await expect(page.getByRole("heading", { name: "浅草寺慢游" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
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

test("mobile hero and current routebook titles avoid vertical clipping", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  if ((page.viewportSize()?.width ?? 0) <= 500) {
    const overflow = await page.evaluate(() => {
      const selectors = ["h1", ".routebook-current strong"];
      return selectors.map((selector) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) return { selector, overflowY: 0 };
        return {
          selector,
          overflowY: element.scrollHeight - element.clientHeight
        };
      });
    });

    for (const item of overflow) {
      expect(item.overflowY, `${item.selector} should not clip vertically`).toBeLessThanOrEqual(2);
    }
  }

  await expectNoHorizontalOverflow(page);
});

test("mobile product page headings avoid vertical clipping", async ({ page }) => {
  if ((page.viewportSize()?.width ?? 0) > 500) return;

  for (const path of ["/dashboard", "/journeys", "/search"] as const) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1").first()).toBeVisible();

    if (path === "/journeys") {
      await expect(page.locator(".journey-empty strong")).toBeVisible();
    }

    const overflow = await page.locator("h1, .journey-empty strong, .dashboard-empty-card strong").evaluateAll((elements) =>
      elements
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && style.display !== "none" && style.visibility !== "hidden";
        })
        .map((element) => ({
          text: element.textContent?.trim(),
          overflowY: element.scrollHeight - element.clientHeight
        }))
    );

    expect(overflow.length, path).toBeGreaterThan(0);
    for (const item of overflow) {
      expect(item.overflowY, `${path} ${item.text} should not clip vertically`).toBeLessThanOrEqual(2);
    }

    await expectNoHorizontalOverflow(page);
  }
});

test("editor module rail and module AI actions keep usable tap targets", async ({ page }) => {
  await mockAnonymousRuntime(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator(".editor-module-rail").scrollIntoViewIfNeeded();
  await expectVisibleTapTargetsAtLeast44(page, ".editor-module-rail .rail-item, .module-ai-button");
  await expectNoHorizontalOverflow(page);
});

test("mobile editor module rail shows all modules without horizontal overflow", async ({ page }) => {
  await mockAnonymousRuntime(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  if ((page.viewportSize()?.width ?? 0) <= 500) {
    const layout = await page.locator(".editor-module-rail").evaluate((rail) => {
      const launcher = document.querySelector<HTMLElement>(".global-ai-launcher")?.getBoundingClientRect();
      const railBox = rail.getBoundingClientRect();
      const toggle = rail.querySelector<HTMLElement>(".editor-module-toggle");
      const items = Array.from(rail.querySelectorAll<HTMLElement>(".rail-item")).map((item) => item.getBoundingClientRect());
      const rows = new Set(items.map((item) => Math.round(item.top)));
      const overlappedItems = launcher
        ? items.filter((item) => !(launcher.right < item.left || launcher.left > item.right || launcher.bottom < item.top || launcher.top > item.bottom)).length
        : 0;

      return {
        railWidth: Math.round(railBox.width),
        toggleColumns: toggle ? getComputedStyle(toggle).gridTemplateColumns.split(" ").length : 0,
        rows: rows.size,
        overlappedItems,
        scrollsHorizontally: rail.scrollWidth > rail.clientWidth + 2,
        escapedItems: items.filter((item) => item.left < railBox.left - 1 || item.right > railBox.right + 1).length,
        itemCount: items.length
      };
    });

    expect(layout.itemCount).toBeGreaterThan(5);
    expect(layout.railWidth, JSON.stringify(layout)).toBeGreaterThan(320);
    expect(layout.toggleColumns).toBe(4);
    expect(layout.rows).toBe(2);
    expect(layout.scrollsHorizontally).toBe(false);
    expect(layout.escapedItems).toBe(0);
    expect(layout.overlappedItems).toBe(0);
  }

  await expectNoHorizontalOverflow(page);
});

test("mobile routebook library keeps trip cards readable", async ({ page }) => {
  await mockSignedInTripListRuntime(page);
  await page.goto("/journeys/edit", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "你的路书" })).toBeVisible();

  if ((page.viewportSize()?.width ?? 0) <= 500) {
    const layout = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>(".itinerary-panel")?.getBoundingClientRect();
      const list = document.querySelector<HTMLElement>(".plan-home-list")?.getBoundingClientRect();
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".plan-home-list .trip-card")).map((card) => {
        const cardBox = card.getBoundingClientRect();
        const title = card.querySelector<HTMLElement>(".trip-card-copy strong");
        const titleBox = title?.getBoundingClientRect();
        const summary = card.querySelector<HTMLElement>(".trip-card-copy small");
        return {
          cardWidth: cardBox.width,
          titleWidth: titleBox?.width ?? 0,
          titleOverflowY: title ? title.scrollHeight - title.clientHeight : 0,
          summaryHeight: summary?.getBoundingClientRect().height ?? 0,
          summaryOverflowY: summary ? summary.scrollHeight - summary.clientHeight : 0
        };
      });

      return {
        panelWidth: panel?.width ?? 0,
        listWidth: list?.width ?? 0,
        cards
      };
    });

    expect(layout.panelWidth, JSON.stringify(layout)).toBeGreaterThan(300);
    expect(layout.listWidth, JSON.stringify(layout)).toBeGreaterThan(280);
    for (const card of layout.cards) {
      expect(card.cardWidth, JSON.stringify(layout)).toBeGreaterThan(280);
      expect(card.titleWidth, JSON.stringify(layout)).toBeGreaterThan(150);
      expect(card.titleOverflowY, JSON.stringify(layout)).toBeLessThanOrEqual(2);
      expect(card.summaryHeight, JSON.stringify(layout)).toBeGreaterThanOrEqual(44);
      expect(card.summaryOverflowY, JSON.stringify(layout)).toBeLessThanOrEqual(2);
    }
  }

  await expectNoHorizontalOverflow(page);
});

test("routebook drawer keeps the new trip action below the trip list", async ({ page }) => {
  await mockSignedInTripListRuntime(page);
  await page.goto("/journeys/trip_tokyo", { waitUntil: "domcontentloaded" });

  await expect(page.locator(".trip-library-actions").getByRole("button", { name: "新建行程" })).toHaveCount(0);
  await page.locator(".routebook-current").click();

  await expect(page.getByRole("dialog", { name: "你的行程" })).toBeVisible();
  await expect(page.locator(".routebook-drawer-footer").getByRole("button", { name: "新建行程" })).toBeVisible();
  const layout = await page.evaluate(() => {
    const list = document.querySelector<HTMLElement>(".routebook-drawer-list")?.getBoundingClientRect();
    const footer = document.querySelector<HTMLElement>(".routebook-drawer-footer")?.getBoundingClientRect();
    return {
      listBottom: Math.round(list?.bottom ?? 0),
      footerTop: Math.round(footer?.top ?? 0),
      footerWidth: Math.round(footer?.width ?? 0)
    };
  });
  expect(layout.footerTop, JSON.stringify(layout)).toBeGreaterThanOrEqual(layout.listBottom - 2);
  expect(layout.footerWidth, JSON.stringify(layout)).toBeGreaterThan(280);
  await expectNoHorizontalOverflow(page);
});

test("mobile global actions stay in navigation without floating over content", async ({ page }) => {
  await mockSignedInTripListRuntime(page);
  await page.setViewportSize({ width: 390, height: 844 });

  for (const path of ["/", "/journeys", "/journeys/edit", "/dashboard", "/passport"] as const) {
    await page.goto(path, { waitUntil: "domcontentloaded" });

    if ((page.viewportSize()?.width ?? 0) <= 500) {
      await expect(page.locator(".global-ai-launcher:visible, .global-command-launcher:visible")).toHaveCount(0);
      const overlaps = await page.evaluate(() => {
        const fixedControls = Array.from(document.querySelectorAll<HTMLElement>("button, a"))
          .filter((element) => getComputedStyle(element).position === "fixed")
          .map((element) => element.getBoundingClientRect());
        const targets = Array.from(document.querySelectorAll<HTMLElement>("main a, main button, main input"))
          .map((element) => ({ box: element.getBoundingClientRect(), text: element.textContent?.trim() || element.getAttribute("aria-label") || element.getAttribute("placeholder") || "" }))
          .filter(({ box }) => box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight);
        return fixedControls.flatMap((control) =>
          targets.flatMap(({ box, text }) => (
            !(control.right < box.left || control.left > box.right || control.bottom < box.top || control.top > box.bottom)
              ? [{ text, top: Math.round(box.top), bottom: Math.round(box.bottom) }]
              : []
          ))
        );
      });
      expect(overlaps, `${path} fixed controls should not cover primary mobile content`).toEqual([]);
    }
  }

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "打开 AI 修改入口" }).click();
  await expect(page.getByRole("dialog", { name: "AI 修改路书" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("local routebook editing supports a first itinerary item without login", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByText(/3 天 · 登录后同步/)).toBeVisible();
  await expect(page.getByText(/1 day · 登录后同步/)).toHaveCount(0);
  await expect(page.locator(".day-strip")).toContainText("2026年10月12日");
  await expect(page.locator(".day-strip").getByText("2026-10-12", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "添加行程项" }).click();
  await expect(page.getByRole("heading", { name: "新的行程项" })).toBeVisible();
  await expect(page.locator(".route-step-date-panel")).toContainText("第 1 天");
  await expect(page.locator(".route-step-date-panel").getByText("Day 1", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "编辑 新的行程项" }).click();
  await expect(page.getByLabel("行程项地点")).toBeVisible();
  await expect(page.getByLabel("行程项推荐理由")).toBeVisible();
  await expect(page.getByLabel("行程项备注")).toBeVisible();
  await page.getByLabel("行程项标题").fill("浅草寺参观");

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
      const content = card.closest<HTMLElement>(".journey-day-content");
      const cardBox = card.getBoundingClientRect();
      const contentBox = content?.getBoundingClientRect();
      return {
        columns: getComputedStyle(card).gridTemplateColumns.split(" ").length,
        cardWidth: Math.round(cardBox.width),
        contentWidth: Math.round(contentBox?.width ?? 0),
        bodyWidth: Math.round(body?.getBoundingClientRect().width ?? 0)
      };
    });
    expect(layout.columns).toBe(1);
    expect(layout.cardWidth, JSON.stringify(layout)).toBeGreaterThan(320);
    expect(layout.cardWidth, JSON.stringify(layout)).toBeGreaterThanOrEqual(layout.contentWidth - 2);
    expect(layout.bodyWidth).toBeGreaterThan(260);
  }

  await expectNoHorizontalOverflow(page);
});

test("mobile itinerary image placeholder does not dominate expanded cards", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "添加行程项" }).click();
  await page.getByRole("button", { name: "编辑 新的行程项" }).click();

  if ((page.viewportSize()?.width ?? 0) <= 500) {
    const image = await page.locator(".route-step-card.expanded .route-step-image").first().evaluate((element) => {
      const box = element.getBoundingClientRect();
      const before = getComputedStyle(element, "::before");
      return {
        height: Math.round(box.height),
        viewportHeight: window.innerHeight,
        hasFallbackTexture: before.content !== "none" && before.backgroundImage !== "none"
      };
    });

    expect(image.height).toBeLessThanOrEqual(160);
    expect(image.height).toBeLessThan(image.viewportHeight * 0.22);
    expect(image.hasFallbackTexture).toBe(true);
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

test("expanded itinerary editor inputs keep usable tap targets", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "添加行程项" }).click();
  await page.getByRole("button", { name: "编辑 新的行程项" }).click();
  await page.locator(".route-step-editor").scrollIntoViewIfNeeded();

  await expect(page.getByLabel("行程项标题")).toBeVisible();
  await expect(page.getByLabel("行程项地点")).toBeVisible();
  await expectVisibleTapTargetsAtLeast44(page, ".route-step-editor input");
  await expectNoHorizontalOverflow(page);
});

test("journey date control keeps usable tap target", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator(".journey-date-control").scrollIntoViewIfNeeded();
  await expect(page.getByLabel("编辑当前日期")).toBeVisible();
  await expectVisibleTapTargetsAtLeast44(page, ".journey-date-control input");
  await expectNoHorizontalOverflow(page);
});

test("routebook readiness strip shows missing departure work and routes to modules", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const readiness = page.getByRole("region", { name: "出发准备" });
  await expect(readiness).toBeVisible();
  await expect(readiness).toContainText("0/5");
  await expect(page.getByRole("button", { name: "行程待补充" })).toBeVisible();
  await expect(page.getByRole("button", { name: "地点待补充" })).toBeVisible();
  await expect(page.getByRole("button", { name: "预订待补充" })).toBeVisible();
  await expect(page.getByRole("button", { name: "天气待补充" })).toHaveCount(0);
  await expectVisibleTapTargetsAtLeast44(page, ".routebook-readiness-chip");

  await page.getByRole("button", { name: "地点待补充" }).click();
  await expect(page.getByRole("radio", { name: "地点" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("先补一个带坐标的地点，天气会基于目的地和路线生成。")).toBeVisible();

  await page.getByRole("button", { name: "行程待补充" }).click();
  await expect(page.getByRole("radio", { name: "行程" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "添加行程项" }).click();
  await expect(readiness).toContainText("1/5");
  await expect(page.getByRole("button", { name: "行程已就绪" })).toBeVisible();

  await page.getByRole("button", { name: "地点待补充" }).click();
  await expect(page.getByRole("radio", { name: "地点" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "添加地点" }).click();
  await expect(readiness).toContainText("1/5");
  await expect(page.getByRole("button", { name: "地点待补充" })).toBeVisible();
  await page.getByLabel("地点纬度").fill("35.6812");
  await page.getByLabel("地点经度").fill("139.7671");
  await expect(readiness).toContainText("2/5");
  await expect(page.getByRole("button", { name: "地点已就绪" })).toBeVisible();

  await page.getByRole("button", { name: "预订待补充" }).click();
  await expect(page.getByRole("radio", { name: "预订" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "添加预订" }).click();
  await expect(readiness).toContainText("2/5");
  await expect(page.getByRole("button", { name: "预订待补充" })).toBeVisible();
  await page.getByLabel("预订确认号").fill("ABC123");
  await expect(readiness).toContainText("3/5");
  await expect(page.getByRole("button", { name: "预订已就绪" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("core routebook modules allow adding places and bookings", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("radio", { name: "地点" }).click();
  await expect(page.getByLabel("搜索或粘贴地点名称")).toBeVisible();
  await expect(page.getByPlaceholder("搜索或粘贴地点名称")).toBeVisible();
  await page.getByRole("button", { name: "添加地点" }).click();
  await expectAnyInputValue(page, "新的收藏地点");
  await expect(page.getByRole("textbox", { name: "地点名称", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "地点分类" })).toBeVisible();
  await expect(page.getByLabel("地点纬度")).toBeVisible();
  await expect(page.getByLabel("地点经度")).toBeVisible();
  await expect(page.getByLabel("地点地址")).toBeVisible();
  await expect(page.getByLabel("地点标签")).toBeVisible();
  await expect(page.getByLabel("地点备注")).toBeVisible();
  await expect(page.locator(".place-card-meta")).toContainText("坐标待补");
  await expect(page.locator(".place-card-meta").getByText("0.0000")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "打开 Google 地点 新的收藏地点" })).toHaveCount(0);
  await page.getByLabel("地点纬度").fill("35.6812");
  await page.getByLabel("地点经度").fill("139.7671");
  const placeDisplayLink = page.getByRole("link", { name: "打开 Google 地点 新的收藏地点" });
  await expect(placeDisplayLink).toHaveAttribute("href", /https:\/\/www\.google\.com\/maps\/search\/\?api=1/);
  await expect(placeDisplayLink).not.toHaveAttribute("href", /0%2C0/);
  await expect(placeDisplayLink).not.toHaveAttribute("href", /\/maps\/dir\//);
  await page.locator("textarea[aria-label='Google Maps 链接']").fill("https://www.google.com/maps/@35.6812,139.7671,17z");
  const importLinksButton = page.getByRole("button", { name: "导入链接" });
  await expect(importLinksButton).toBeEnabled();
  await importLinksButton.click();
  await expect(page.locator(".place-row")).toHaveCount(1);
  await page.locator("textarea[aria-label='Google Maps 链接']").fill("https://www.google.com/maps/@35.7148,139.7967,17z");
  await importLinksButton.click();
  await expectAnyInputValue(page, "地图地点 1");
  await expect
    .poll(async () => page.locator("input").evaluateAll((inputs) => inputs.some((input) => (input as HTMLInputElement).value === "Google Maps place 1")))
    .toBe(false);

  await page.getByRole("radio", { name: "预订" }).click();
  await page.getByRole("button", { name: "添加预订" }).click();
  await expectAnyInputValue(page, "新的预订");
  await expect(page.getByRole("combobox", { name: "预订类型" })).toBeVisible();
  await expect(page.getByLabel("预订标题")).toBeVisible();
  await expect(page.getByLabel("预订确认号")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "预订状态" })).toBeVisible();
  await expect(page.getByLabel("预订备注")).toBeVisible();
  await expect(page.getByLabel("上传文件到预订 新的预订")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("place editor renders compact location cards", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("radio", { name: "地点" }).click();
  await page.getByRole("button", { name: "添加地点" }).click();
  const row = page.locator(".place-row").last();
  await row.getByLabel("地点名称").fill("浅草寺");
  await row.getByLabel("地点纬度").fill("35.7148");
  await row.getByLabel("地点经度").fill("139.7967");
  await row.getByLabel("地点地址").fill("东京台东区浅草");
  await row.getByLabel("地点标签").fill("寺庙, 散步");
  await row.getByLabel("地点备注").fill("安排在上午，人流更少。");

  await expect(row.locator(".place-card-preview")).toBeVisible();
  await expect(row.locator(".place-card-pin")).toContainText("1");
  await expect(row.locator(".place-card-summary strong")).toHaveText("浅草寺");
  const googlePlaceLink = row.getByRole("link", { name: "打开 Google 地点 浅草寺" });
  await expect(googlePlaceLink).toHaveAttribute("href", /maps\/search\/\?api=1/);
  await expect(googlePlaceLink).not.toHaveAttribute("href", /\/maps\/dir\//);
  await expectVisibleTapTargetsAtLeast44(page, ".place-row button, .place-row a");
  await expectNoHorizontalOverflow(page);

  const desktopHeight = await row.evaluate((element) => element.getBoundingClientRect().height);
  expect(desktopHeight).toBeLessThan(360);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(row.locator(".place-card-preview")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const mobileHeight = await row.evaluate((element) => element.getBoundingClientRect().height);
  expect(mobileHeight).toBeLessThan(720);
});

test("file upload entry points expose stable labels", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("radio", { name: "文件" }).click();

  await expect(page.getByLabel("上传旅行文件")).toBeVisible();
});

test("booking editor renders compact ticket cards", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("radio", { name: "预订" }).click();
  await page.getByRole("button", { name: "添加预订" }).click();

  await expect(page.locator(".booking-ticket-rail")).toBeVisible();
  await expect(page.locator(".booking-ticket-rail").getByText("门票")).toBeVisible();
  await expect(page.getByLabel("预订标题")).toBeVisible();
  await expect(page.getByLabel("上传文件到预订 新的预订")).toBeVisible();

  const card = await page.locator(".booking-row-editor").first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const rail = element.querySelector<HTMLElement>(".booking-ticket-rail")?.getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      railWidth: Math.round(rail?.width ?? 0),
      viewport: document.documentElement.clientWidth
    };
  });

  expect(card.railWidth, JSON.stringify(card)).toBeGreaterThanOrEqual(120);
  if (card.viewport >= 900) {
    expect(card.height, JSON.stringify(card)).toBeLessThanOrEqual(260);
  }
  await expectNoHorizontalOverflow(page);
});

test("file attachment fields expose stable labels", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("radio", { name: "文件" }).click();
  await page.getByLabel("上传旅行文件").locator("input[type='file']").setInputFiles({
    name: "boarding-pass.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n")
  });

  await expect(page.getByLabel("文件标题")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "文件分类" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "文件关联对象" })).toBeVisible();
});

test("file attachment editor renders compact document cards", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("radio", { name: "文件" }).click();
  await page.getByLabel("上传旅行文件").locator("input[type='file']").setInputFiles({
    name: "egypt-visa.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n")
  });

  await expect(page.locator(".file-card-preview")).toBeVisible();
  await expect(page.locator(".file-card-preview em")).toHaveText("PDF");
  await expect(page.locator(".file-card-actions")).toContainText("egypt-visa.pdf");
  await expect(page.locator(".file-card-actions")).not.toContainText(/\d+-egypt-visa\.pdf/);
  await expect(page.getByLabel("文件标题")).toBeVisible();
  await expect(page.getByRole("button", { name: "AI 优化文件 egypt-visa.pdf" })).toBeVisible();

  const card = await page.locator(".file-row-editor").first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const preview = element.querySelector<HTMLElement>(".file-card-preview")?.getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      previewWidth: Math.round(preview?.width ?? 0),
      viewport: document.documentElement.clientWidth
    };
  });

  expect(card.previewWidth, JSON.stringify(card)).toBeGreaterThanOrEqual(180);
  if (card.viewport >= 900) {
    expect(card.height, JSON.stringify(card)).toBeLessThanOrEqual(190);
  }
  await expectNoHorizontalOverflow(page);
});

test("AI planning and import prompts expose stable labels", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("radio", { name: "AI" }).click();

  await expect(page.getByLabel("AI 规划需求")).toBeVisible();
  await expect(page.getByLabel("AI 导入材料")).toBeVisible();
});

test("AI workbench presents a clear preview-first workflow", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("radio", { name: "AI" }).click();

  await expect(page.locator(".ai-command-strip")).toBeVisible();
  await expect(page.locator(".ai-command-strip")).toContainText("先看预览，再写入路书");
  await expect(page.getByLabel("AI 修改流程")).toContainText("输入");
  await expect(page.getByLabel("AI 修改流程")).toContainText("预览");
  await expect(page.getByLabel("AI 修改流程")).toContainText("确认");
  await expect(page.locator(".ai-card-step").nth(0)).toHaveText("01");
  await expect(page.locator(".ai-card-step").nth(1)).toHaveText("02");
  await expect(page.locator(".ai-status-card")).toContainText("登录后启用 AI 生成");
  await expectNoHorizontalOverflow(page);

  const desktop = await page.locator(".ai-workbench").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const strip = element.querySelector<HTMLElement>(".ai-command-strip")?.getBoundingClientRect();
    const steps = Array.from(element.querySelectorAll<HTMLElement>(".ai-command-steps span")).map((step) => {
      const stepRect = step.getBoundingClientRect();
      return { width: Math.round(stepRect.width), height: Math.round(stepRect.height), text: step.textContent?.trim() ?? "" };
    });
    const actions = Array.from(element.querySelectorAll<HTMLElement>("button, .file-upload-button")).map((action) => {
      const actionRect = action.getBoundingClientRect();
      return { width: Math.round(actionRect.width), height: Math.round(actionRect.height), text: action.textContent?.trim() ?? "" };
    });
    return {
      height: Math.round(rect.height),
      stripHeight: Math.round(strip?.height ?? 0),
      steps,
      actions,
      viewport: document.documentElement.clientWidth
    };
  });
  expect(desktop.stripHeight, JSON.stringify(desktop)).toBeLessThan(150);
  expect(desktop.steps.length).toBe(3);
  desktop.steps.forEach((step) => {
    expect(step.width, JSON.stringify(desktop)).toBeGreaterThanOrEqual(44);
    expect(step.height, JSON.stringify(desktop)).toBeGreaterThanOrEqual(44);
  });
  expect(desktop.actions.length, JSON.stringify(desktop)).toBeGreaterThanOrEqual(2);
  desktop.actions.forEach((action) => {
    expect(action.width, `${action.text} width`).toBeGreaterThanOrEqual(44);
    expect(action.height, `${action.text} height`).toBeGreaterThanOrEqual(44);
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".ai-command-strip")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const mobileStripHeight = await page.locator(".ai-command-strip").evaluate((element) => Math.round(element.getBoundingClientRect().height));
  expect(mobileStripHeight).toBeLessThan(240);
});

test("dialogs and select menus keep usable tap targets", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "编辑路书信息" }).click();
  await expectVisibleTapTargetsAtLeast44(page, "[role='dialog'] button[aria-label='Close'], [role='dialog'] button:has-text('关闭')");
  await page.keyboard.press("Escape");

  await page.getByRole("radio", { name: "地点" }).click();
  await page.getByRole("button", { name: "添加地点" }).click();
  await page.locator(".place-row [role='combobox']").first().click();
  await expectVisibleTapTargetsAtLeast44(page, "[role='option']");
  await page.keyboard.press("Escape");
  await expectNoHorizontalOverflow(page);
});

test("map pins keep mobile tap targets and open google places", async ({ page }) => {
  await mockGoogleStaticMapPreview(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("radio", { name: "地点" }).click();
  await page.getByRole("button", { name: "添加地点" }).click();
  await page.getByLabel("地点纬度").fill("35.6812");
  await page.getByLabel("地点经度").fill("139.7671");
  await page.getByRole("radio", { name: "地图" }).click();

  const preview = page.locator(".map-preview-image");
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("src", /\/api\/maps\/static-preview\?/);
  await expect(preview).toHaveJSProperty("complete", true);
  await expectVisibleTapTargetsAtLeast44(page, ".map-pin");
  const mapPinLink = page.locator(".interactive-map").getByRole("link", { name: /打开 Google 地点 1：新的收藏地点/ });
  await expect(mapPinLink).toHaveAttribute("href", /https:\/\/www\.google\.com\/maps\/search\/\?api=1/);
  await expect(mapPinLink).not.toHaveAttribute("href", /\/maps\/dir\//);
  await expect(page.locator(".map-place-list").getByRole("button", { name: /在地图中显示 1：新的收藏地点/ })).toHaveCount(0);
  const mapPlaceFocus = page.locator(".map-place-list .map-place-focus").first();
  await expect(mapPlaceFocus).toHaveAttribute("href", /https:\/\/www\.google\.com\/maps\/search\/\?api=1/);
  await expect(mapPlaceFocus).not.toHaveAttribute("href", /\/maps\/dir\//);
  await expect(mapPlaceFocus).toHaveAttribute("aria-label", /打开 Google 地点 1：新的收藏地点/);
  const googlePlacePagePromise = page.waitForEvent("popup");
  await mapPlaceFocus.click();
  const googlePlacePage = await googlePlacePagePromise;
  await expect(googlePlacePage).toHaveURL(/https:\/\/www\.google\.com\/maps\/search\/\?api=1/);
  await googlePlacePage.close();
  await expect(page.locator(".map-place-item").first()).not.toHaveClass(/active/);
  await expect(page.getByRole("radio", { name: "地图" })).toBeChecked();
  const mapPlaceLink = page.locator(".map-place-list").getByRole("link", { name: /打开 Google 地点 1：新的收藏地点/ });
  await expect(mapPlaceLink).toHaveAttribute("href", /https:\/\/www\.google\.com\/maps\/search\/\?api=1/);
  await expect(mapPlaceLink).not.toHaveAttribute("href", /\/maps\/dir\//);
  await expect(page.getByRole("radio", { name: "地图" })).toBeChecked();
  await expectNoHorizontalOverflow(page);
});

test("nearby map pins stay visually distinct", async ({ page }) => {
  await mockGoogleStaticMapPreview(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("radio", { name: "地点" }).click();
  for (const place of [
    { name: "Cairo hotel", latitude: "30.05", longitude: "31.23" },
    { name: "Cairo museum", latitude: "30.0502", longitude: "31.2302" },
    { name: "Sharm El Sheikh", latitude: "27.91", longitude: "34.33" }
  ]) {
    await page.getByRole("button", { name: "添加地点" }).click();
    const row = page.locator(".place-row").last();
    await row.getByLabel("地点名称").fill(place.name);
    await row.getByLabel("地点纬度").fill(place.latitude);
    await row.getByLabel("地点经度").fill(place.longitude);
  }
  await page.getByRole("radio", { name: "地图" }).click();

  await expect(page.locator(".interactive-map").getByRole("link", { name: "打开 Google 地点 1：Cairo hotel" })).toBeVisible();
  await expect(page.locator(".interactive-map").getByRole("link", { name: "打开 Google 地点 2：Cairo museum" })).toBeVisible();
  const pinBoxes = await page.locator(".map-pin").evaluateAll((pins) =>
    pins.map((pin) => {
      const rect = pin.getBoundingClientRect();
      return { left: rect.left, top: rect.top };
    })
  );
  expect(Math.hypot(pinBoxes[0]!.left - pinBoxes[1]!.left, pinBoxes[0]!.top - pinBoxes[1]!.top)).toBeGreaterThan(24);
  await expectNoHorizontalOverflow(page);
});

test("map place list follows itinerary visit order", async ({ page }) => {
  await mockGoogleStaticMapPreview(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("radio", { name: "地点" }).click();
  for (const place of [
    { name: "Second stop", latitude: "30.05", longitude: "31.23" },
    { name: "First stop", latitude: "30.06", longitude: "31.24" }
  ]) {
    await page.getByRole("button", { name: "添加地点" }).click();
    const row = page.locator(".place-row").last();
    await row.getByLabel("地点名称").fill(place.name);
    await row.getByLabel("地点纬度").fill(place.latitude);
    await row.getByLabel("地点经度").fill(place.longitude);
  }

  await page.locator(".place-row").nth(1).getByRole("button", { name: /加入当天/ }).click();
  await page.locator(".place-row").nth(0).getByRole("button", { name: /加入当天/ }).click();
  await page.getByRole("radio", { name: "地图" }).click();

  await expect(page.locator(".map-place-item strong").nth(0)).toHaveText("First stop");
  await expect(page.locator(".map-place-item strong").nth(1)).toHaveText("Second stop");
  await expect(page.locator(".map-place-list").getByRole("button", { name: "在地图中显示 1：First stop" })).toHaveCount(0);
  const googlePlaceLink = page.locator(".map-place-list .map-place-focus").first();
  await expect(googlePlaceLink).toHaveAttribute("aria-label", "打开 Google 地点 1：First stop");
  await expect(googlePlaceLink).toHaveAttribute("href", /https:\/\/www\.google\.com\/maps\/search\/\?api=1/);
  await expect(googlePlaceLink).not.toHaveAttribute("href", /\/maps\/dir\//);
});

test("budget member toggles keep mobile tap targets", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("radio", { name: "预算" }).click();
  await page.getByRole("button", { name: "添加同行人" }).click();
  await expect(page.getByLabel("预算成员姓名").nth(1)).toHaveValue("同行人");
  await expect(page.getByLabel("预算成员姓名").nth(1)).not.toHaveValue("New traveler");

  await page.getByRole("button", { name: "添加账单" }).click();

  await expect(page.getByLabel("预算成员姓名")).toHaveCount(2);
  await expect(page.getByLabel("预算成员姓名").first()).toBeVisible();
  await expect(page.getByLabel("账单标题")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "账单分类" })).toBeVisible();
  await expect(page.getByLabel("账单金额")).toBeVisible();
  await expect(page.getByLabel("账单币种")).toBeVisible();
  await expect(page.getByLabel("账单备注")).toBeVisible();

  await expect(page.getByRole("button", { name: "付款人 我" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "分摊人 我" })).toHaveAttribute("aria-pressed", "true");

  const memberPill = page.locator(".member-toggle-group").first().locator(".member-pill").first();
  await memberPill.scrollIntoViewIfNeeded();
  await expect(memberPill).toHaveClass(/active/);
  await expectVisibleTapTargetsAtLeast44(page, ".member-toggle-group .member-pill");

  await memberPill.click();
  await expect(memberPill).not.toHaveClass(/active/);
  await expectNoHorizontalOverflow(page);
});

test("budget editor renders compact receipt cards", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("radio", { name: "预算" }).click();
  await page.getByRole("button", { name: "添加同行人" }).click();
  await page.getByLabel("预算成员姓名").nth(1).fill("Alex");
  await page.getByRole("button", { name: "添加账单" }).click();
  await page.getByLabel("账单标题").fill("金字塔门票");
  await page.getByLabel("账单金额").fill("120");
  await page.getByLabel("预算成员姓名").nth(1).fill("");

  await expect(page.locator(".budget-receipt-summary")).toBeVisible();
  await expect(page.locator(".budget-receipt-summary strong")).toHaveText("$120");
  await expect(page.getByRole("button", { name: "付款人 我" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "分摊人 同行人 2" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /^分摊人\s*$/ })).toHaveCount(0);
  await expect(page.getByLabel("账单备注")).toBeVisible();

  const card = await page.locator(".budget-row-editor").first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const summary = element.querySelector<HTMLElement>(".budget-receipt-summary")?.getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      summaryWidth: Math.round(summary?.width ?? 0),
      viewport: document.documentElement.clientWidth
    };
  });

  expect(card.summaryWidth, JSON.stringify(card)).toBeGreaterThanOrEqual(180);
  if (card.viewport >= 900) {
    expect(card.height, JSON.stringify(card)).toBeLessThanOrEqual(270);
  }
  await expectNoHorizontalOverflow(page);
});

test("packing checklist controls keep usable tap targets", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const readiness = page.getByRole("region", { name: "出发准备" });
  await page.getByRole("radio", { name: "打包" }).click();
  await page.locator(".packing-template-bar button").first().click();

  const checkbox = page.getByRole("checkbox", { name: "打包完成" });
  await expect(checkbox).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("combobox", { name: "打包分类" })).toBeVisible();
  await expect(page.getByLabel("打包物品名称")).toBeVisible();
  await expect(page.getByLabel("打包数量")).toBeVisible();
  await expectVisibleTapTargetsAtLeast44(page, ".packing-row [role='checkbox'], .packing-row .row-ai-button");

  await page.getByLabel("打包物品名称").fill("");
  await checkbox.click();
  await expect(checkbox).toHaveAttribute("aria-checked", "true");
  await expect(readiness).toContainText("0/5");
  await expect(page.getByRole("button", { name: "打包待补充" })).toBeVisible();
  await page.getByLabel("打包物品名称").fill("护照原件");
  await expect(readiness).toContainText("1/5");
  await expect(page.getByRole("button", { name: "打包已就绪" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("packing checklist renders compact departure cards", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("radio", { name: "打包" }).click();
  await page.locator(".packing-template-bar button").nth(0).click();
  await page.locator(".packing-template-bar button").nth(2).click();
  await page.getByLabel("打包物品名称").nth(0).fill("护照原件");
  await page.getByLabel("打包物品名称").nth(1).fill("相机充电器");

  await expect(page.locator(".packing-progress-card")).toBeVisible();
  await expect(page.locator(".packing-progress-card strong")).toHaveText("0/2 已打包");
  await page.getByRole("checkbox", { name: "打包完成" }).first().click();
  await expect(page.locator(".packing-progress-card strong")).toHaveText("1/2 已打包");
  await expect(page.locator(".packing-row").first()).toHaveClass(/packed/);

  const layout = await page.evaluate(() => {
    const firstRow = document.querySelector<HTMLElement>(".packing-row")?.getBoundingClientRect();
    const templateBar = document.querySelector<HTMLElement>(".packing-template-bar")?.getBoundingClientRect();
    return {
      viewport: document.documentElement.clientWidth,
      firstRowHeight: Math.round(firstRow?.height ?? 0),
      templateBarHeight: Math.round(templateBar?.height ?? 0)
    };
  });

  if (layout.viewport <= 500) {
    expect(layout.firstRowHeight, JSON.stringify(layout)).toBeLessThanOrEqual(170);
    expect(layout.templateBarHeight, JSON.stringify(layout)).toBeLessThanOrEqual(58);
  } else {
    expect(layout.firstRowHeight, JSON.stringify(layout)).toBeLessThanOrEqual(110);
  }
  await expectNoHorizontalOverflow(page);
});

test("global AI launcher does not cover mobile editor forms", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("radio", { name: "地点" }).click();
  await page.getByRole("button", { name: "添加地点" }).click();

  if ((page.viewportSize()?.width ?? 0) <= 500) {
    const layout = await page.evaluate(() => {
      const launchers = Array.from(document.querySelectorAll<HTMLElement>(".global-ai-launcher, .global-command-launcher"))
        .filter((item) => getComputedStyle(item).display !== "none" && getComputedStyle(item).visibility !== "hidden")
        .map((item) => item.getBoundingClientRect());
      const input = Array.from(document.querySelectorAll<HTMLInputElement>("input")).find((item) => item.value === "新的收藏地点")?.getBoundingClientRect();
      if (!input) return null;
      const overlaps = launchers.some((launcher) => !(launcher.right < input.left || launcher.left > input.right || launcher.bottom < input.top || launcher.top > input.bottom));
      return {
        launcherCount: launchers.length,
        overlaps
      };
    });

    expect(layout).not.toBeNull();
    expect(layout!.launcherCount).toBe(0);
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
  await expect(page.getByText("2026年9月1日 - 9月5日")).toBeVisible();
  await expect(page.getByText("2026年10月1日 - 10月9日")).toBeVisible();
  await expect(page.getByText("2026-09-01 - 2026-09-05")).toHaveCount(0);
  await expect(page.getByText("2026-10-01 - 2026-10-09")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("2026年9月1日 - 9月5日")).toBeVisible();
  await expect(page.getByText("2026年10月1日 - 10月9日")).toBeVisible();
  await expect(page.getByText("2026-09-01 - 2026-09-05")).toHaveCount(0);
  await expect(page.getByText("2026-10-01 - 2026-10-09")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await page.goto("/journeys/trip_tokyo", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: /打开 东京亲子路书/ })).toContainText("2026年9月1日 - 9月5日");
  await expect(page.getByText("2026-09-01 - 2026-09-05")).toHaveCount(0);
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
        cardLeft: Math.round(card.left),
        cardWidth: Math.round(card.width),
        cardHeight: Math.round(card.height),
        imageLeft: Math.round(image?.left ?? 0),
        imageWidth: Math.round(image?.width ?? 0),
        imageHeight: Math.round(image?.height ?? 0)
      };
    })
  );

  for (const card of cards) {
    expect(Math.abs(card.imageLeft - card.cardLeft), JSON.stringify(card)).toBeLessThanOrEqual(6);
    expect(card.imageWidth, JSON.stringify(card)).toBeGreaterThanOrEqual(card.cardWidth - 2);
    expect(card.imageWidth, JSON.stringify(card)).toBeLessThanOrEqual(Math.ceil(card.cardWidth * 1.04));
    expect(card.imageHeight, JSON.stringify(card)).toBeGreaterThanOrEqual(card.cardHeight - 2);
  }
  await expectNoHorizontalOverflow(page);
});

test("single journey card stays card-sized on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockSignedInRuntime(page);

  await page.goto("/journeys", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".journey-photo-card")).toHaveCount(1);

  const card = await page.locator(".journey-photo-card").first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      viewport: document.documentElement.clientWidth
    };
  });

  expect(card.width, JSON.stringify(card)).toBeLessThanOrEqual(460);
  expect(card.width, JSON.stringify(card)).toBeLessThan(card.viewport * 0.5);
  expect(card.height, JSON.stringify(card)).toBeGreaterThanOrEqual(320);
  await expectNoHorizontalOverflow(page);
});

test("passport parses mixed destination formats into commercial footprint cards", async ({ page }) => {
  await mockSignedInTripListRuntime(page);

  await page.goto("/passport", { waitUntil: "domcontentloaded" });

  await expect(page.locator(".passport-stat-card").first()).toContainText("2");
  await expect(page.locator(".passport-stat-card").nth(1)).toContainText("2");
  await expect(page.locator(".passport-footprint-card")).toHaveCount(2);
  await expect(page.locator(".passport-footprint-card").filter({ hasText: "Japan" })).toContainText("Tokyo");
  await expect(page.locator(".passport-footprint-card").filter({ hasText: "埃及" })).toContainText("开罗 / 红海");

  const cards = await page.locator(".passport-footprint-card").evaluateAll((elements) =>
    elements.map((element) => {
      const card = element.getBoundingClientRect();
      const image = element.querySelector<HTMLElement>(".passport-footprint-image")?.getBoundingClientRect();
      return {
        width: Math.round(card.width),
        height: Math.round(card.height),
        imageWidth: Math.round(image?.width ?? 0),
        imageHeight: Math.round(image?.height ?? 0)
      };
    })
  );

  for (const card of cards) {
    expect(card.width, JSON.stringify(card)).toBeGreaterThanOrEqual(240);
    expect(card.height, JSON.stringify(card)).toBeGreaterThanOrEqual(170);
    expect(card.imageWidth, JSON.stringify(card)).toBeGreaterThanOrEqual(card.width - 2);
    expect(card.imageHeight, JSON.stringify(card)).toBeGreaterThanOrEqual(card.height - 2);
  }
  await page.locator(".passport-footprint-card").first().scrollIntoViewIfNeeded();
  await expectVisibleTapTargetsAtLeast44(page, ".passport-footprint-card");
  await expectNoHorizontalOverflow(page);
});

test("empty journey library presents compact commercial actions", async ({ page }) => {
  await page.goto("/journeys", { waitUntil: "domcontentloaded" });

  await expect(page.locator(".journey-empty")).toBeVisible();
  await expect(page.locator(".journey-empty-mark")).toBeVisible();
  await expect(page.locator(".journey-empty-actions").getByRole("link", { name: "开始规划" })).toBeVisible();
  await expect(page.locator(".journey-empty-actions").getByRole("link", { name: "找灵感" })).toBeVisible();

  const layout = await page.locator(".journey-empty").evaluate((element) => {
    const card = element.getBoundingClientRect();
    const actions = Array.from(element.querySelectorAll<HTMLElement>(".journey-empty-actions a")).map((action) => {
      const rect = action.getBoundingClientRect();
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    });
    return {
      cardWidth: Math.round(card.width),
      actions
    };
  });

  expect(layout.actions.length).toBe(2);
  for (const action of layout.actions) {
    expect(action.width, JSON.stringify(layout)).toBeGreaterThanOrEqual(44);
    expect(action.height, JSON.stringify(layout)).toBeGreaterThanOrEqual(44);
    expect(action.width, JSON.stringify(layout)).toBeLessThanOrEqual(Math.max(180, layout.cardWidth * 0.48));
  }
  await expectNoHorizontalOverflow(page);
});

test("empty passport explains the first footprint above the mobile fold", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/passport", { waitUntil: "domcontentloaded" });

  await expect(page.locator(".passport-empty")).toBeInViewport();
  await expect(page.locator(".passport-empty")).toContainText("还没有记录国家/地区。");
  await expect(page.locator(".passport-empty").getByRole("link", { name: "添加目的地" })).toBeVisible();
  await expectVisibleTapTargetsAtLeast44(page, ".passport-empty a");
  await expectNoHorizontalOverflow(page);
});

test("switching routebooks with unsaved edits uses an in-app confirmation", async ({ page }) => {
  await mockSignedInTripListRuntime(page);
  const nativeDialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    nativeDialogs.push(dialog.message());
    await dialog.dismiss();
  });

  await page.goto("/journeys/edit", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "打开 东京亲子路书" }).click();
  await expect(page.locator(".routebook-current")).toContainText("东京亲子路书");

  await page.getByRole("button", { name: "添加行程项" }).click();
  await page.locator(".routebook-current").click();
  await page.getByRole("button", { name: "打开 埃及红海路书" }).click();

  await expect(page.getByRole("dialog", { name: "切换路书" })).toBeVisible();
  await expect(page.getByText("当前路书还有未保存修改。")).toBeVisible();
  await page.locator(".switch-dialog-actions").getByRole("button", { name: "继续编辑" }).click();
  await expect(page.getByRole("dialog", { name: "切换路书" })).toHaveCount(0);
  await expect(page.locator(".routebook-current")).toContainText("东京亲子路书");

  await page.getByRole("button", { name: "添加行程项" }).click();
  await page.locator(".routebook-current").click();
  await page.getByRole("button", { name: "打开 埃及红海路书" }).click();
  await expect(page.getByRole("dialog", { name: "切换路书" })).toBeVisible();
  await page.locator(".switch-dialog-actions").getByRole("button", { name: "放弃修改并切换" }).click();

  await expect(page.locator(".routebook-current")).toContainText("埃及红海路书");
  expect(nativeDialogs).toEqual([]);
  await expectNoHorizontalOverflow(page);
});

test("public and journey list display typography avoids vertical clipping", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const homeOverflow = await page.locator(".hero-copy h1").evaluateAll((elements) =>
    elements.map((element) => ({
      text: element.textContent?.trim(),
      overflow: element.scrollHeight - element.clientHeight
    }))
  );
  for (const item of homeOverflow) {
    expect(item.overflow, `${item.text} should not clip vertically`).toBeLessThanOrEqual(2);
  }

  await mockSignedInTripListRuntime(page);
  await page.goto("/journeys", { waitUntil: "domcontentloaded" });

  const journeyOverflow = await page.locator(".journeys-heading h1, .journey-photo-card strong").evaluateAll((elements) =>
    elements.map((element) => ({
      text: element.textContent?.trim(),
      overflow: element.scrollHeight - element.clientHeight
    }))
  );
  for (const item of journeyOverflow) {
    expect(item.overflow, `${item.text} should not clip vertically`).toBeLessThanOrEqual(2);
  }

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  const dashboardOverflow = await page.locator(".dashboard-hero h1, .dashboard-stat-grid strong, .dashboard-section-heading h2, .dashboard-trip-card strong").evaluateAll((elements) =>
    elements.map((element) => ({
      text: element.textContent?.trim(),
      overflow: element.scrollHeight - element.clientHeight
    }))
  );
  for (const item of dashboardOverflow) {
    expect(item.overflow, `${item.text} should not clip vertically`).toBeLessThanOrEqual(2);
  }

  await page.goto("/passport", { waitUntil: "domcontentloaded" });
  const passportOverflow = await page.locator(".passport-hero h1, .passport-section-heading h2, .passport-empty strong").evaluateAll((elements) =>
    elements.map((element) => ({
      text: element.textContent?.trim(),
      overflow: element.scrollHeight - element.clientHeight
    }))
  );
  for (const item of passportOverflow) {
    expect(item.overflow, `${item.text} should not clip vertically`).toBeLessThanOrEqual(2);
  }

  await mockPublicShareRuntime(page);
  await page.goto("/share?token=public_tokyo_test", { waitUntil: "domcontentloaded" });
  const shareOverflow = await page.locator(".share-hero-copy h1, .share-stat-grid strong, .share-day-heading h2").evaluateAll((elements) =>
    elements.map((element) => ({
      text: element.textContent?.trim(),
      overflow: element.scrollHeight - element.clientHeight
    }))
  );
  for (const item of shareOverflow) {
    expect(item.overflow, `${item.text} should not clip vertically`).toBeLessThanOrEqual(2);
  }

  await expectNoHorizontalOverflow(page);
});

test("anonymous users can create a named local routebook and keep it after refresh", async ({ page }) => {
  await mockAnonymousRuntime(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "编辑路书信息" }).click();
  await expect(page.getByRole("dialog", { name: "更新路书信息" })).toBeVisible();
  await page.getByLabel("路书标题").fill("东京亲子路书");
  await page.getByLabel("目的地").fill("Tokyo, Japan");
  await page.getByLabel("时区").fill("Asia/Tokyo");
  await page.getByLabel("出发日期").fill("2026-09-01");
  await page.getByLabel("结束日期").fill("2026-09-03");
  await page.getByRole("button", { name: "保存修改" }).click();

  await expect(page.getByRole("button", { name: /东京亲子路书/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "保存" })).toHaveCount(0);
  await page.getByRole("button", { name: "添加行程项" }).click();

  await expect
    .poll(async () =>
      page.evaluate((storageKey) => {
        const stored = window.localStorage.getItem(storageKey);
        if (!stored) return null;
        const parsed = JSON.parse(stored);
        return parsed.days?.some((day: { items?: Array<{ title?: string }> }) => day.items?.some((item) => item.title === "新的行程项")) ? parsed.title : null;
      }, localDraftStorageKey)
    )
    .toBe("东京亲子路书");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: /东京亲子路书/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "新的行程项" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("anonymous share action explains that login is required", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const shareButton = page.getByRole("button", { name: "分享" });
  await expect(shareButton).toBeEnabled();
  await expect(shareButton).toHaveAttribute("title", "登录后可分享只读路书");
  await shareButton.click();

  await expect(page.getByRole("dialog", { name: "分享路书" })).toBeVisible();
  await expect(page.getByText("登录后可生成一条只读链接，用来发给同行人查看路书。")).toBeVisible();
  const loginToShare = page.getByRole("link", { name: "登录后分享" });
  await expect(loginToShare).toBeVisible();
  await expect(loginToShare).toHaveAttribute("href", /\/auth\/google\/login\?returnTo=/);
  await expect(page.locator(".share-dialog-actions").getByRole("button", { name: "关闭" })).toHaveCount(0);
  await expect(page.locator(".sync-error")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("signed-in users can save and create a share link for a routebook", async ({ page }) => {
  await mockSignedInRuntime(page);
  await page.goto("/journeys/trip_11111111-1111-4111-8111-111111111111", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("button", { name: "打开 东京商业路书" })).toBeVisible();
  await expect(page.getByRole("button", { name: "保存" })).toHaveCount(0);
  await page.getByRole("button", { name: "添加行程项" }).click();
  await expect
    .poll(async () => page.evaluate(async () => (window as unknown as { getCommercialApiCalls: () => Promise<{ saves: number; shares: number }> }).getCommercialApiCalls()))
    .toMatchObject({ saves: 1, shares: 0 });
  await page.getByRole("button", { name: "分享" }).click();

  await expect(page.getByRole("dialog", { name: "分享路书" })).toBeVisible();
  await expect(page.getByText("把这条只读链接发给同行人，对方无需编辑权限也能查看路书。")).toBeVisible();
  await expect(page.getByLabel("只读分享链接")).toHaveValue(/token=public_tokyo_test/);
  await expect(page.getByRole("button", { name: "复制链接" })).toBeVisible();
  const openShareLink = page.getByRole("link", { name: "打开只读页" });
  await expect(openShareLink).toHaveAttribute("href", /token=public_tokyo_test/);
  const openShareLinkColors = await openShareLink.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      color: style.color,
      backgroundColor: style.backgroundColor
    };
  });
  expect(contrastRatio(parseRgb(openShareLinkColors.color), parseRgb(openShareLinkColors.backgroundColor))).toBeGreaterThanOrEqual(4.5);
  await expect(page.locator(".share-dialog-actions").getByRole("button", { name: "关闭" })).toHaveCount(0);
  await expect(page.getByText("链接已准备好，可复制给同行人。")).toBeVisible();
  await expect(page.getByText(/链接已复制|请手动复制/)).toHaveCount(0);
  await expect(page.getByText(/分享链接已(复制|生成)/)).toHaveCount(0);
  await expect
    .poll(async () => page.evaluate(async () => (window as unknown as { getCommercialApiCalls: () => Promise<{ saves: number; shares: number }> }).getCommercialApiCalls()))
    .toMatchObject({ saves: 1, shares: 1 });
});

test("signed-in routebook autosave stays single-flight on slow networks", async ({ page }) => {
  await mockSignedInRuntime(page, { saveDelayMs: 350 });
  await page.goto("/journeys/trip_11111111-1111-4111-8111-111111111111", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("button", { name: "保存" })).toHaveCount(0);
  await page.getByRole("button", { name: "添加行程项" }).click();

  await expect(page.getByRole("button", { name: "分享" })).toBeDisabled();
  await expect
    .poll(async () => page.evaluate(async () => (window as unknown as { getCommercialApiCalls: () => Promise<{ saves: number; shares: number }> }).getCommercialApiCalls()))
    .toMatchObject({ saves: 1, shares: 0 });
  await expect(page.getByRole("button", { name: "分享" })).toBeEnabled();
  await expectNoHorizontalOverflow(page);
});

test("deleting the current routebook uses a clear confirmation and leaves the deleted URL", async ({ page }) => {
  await mockSignedInRuntime(page);
  await page.goto("/journeys/trip_11111111-1111-4111-8111-111111111111", { waitUntil: "domcontentloaded" });

  const nativeDialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    nativeDialogs.push(dialog.message());
    await dialog.dismiss();
  });

  await page.getByRole("button", { name: "打开 东京商业路书" }).click();
  await expectVisibleTapTargetsAtLeast44(page, ".trip-delete-button");
  await page.getByRole("button", { name: "删除 东京商业路书" }).click();

  await expect(page.getByRole("dialog", { name: "删除路书" })).toBeVisible();
  await expect(page.getByText("删除“东京商业路书”？")).toBeVisible();
  await expect(page.getByText("这会从账号中移除这本路书和它关联的附件。")).toBeVisible();
  await expect(page.locator(".danger-dialog-actions").getByRole("button", { name: "取消" })).toBeVisible();
  await page.locator(".danger-dialog-actions").getByRole("button", { name: "确认删除" }).click();

  await expect(page).toHaveURL(/\/journeys\/edit#editor$/);
  await expect(page.getByRole("heading", { name: "创建你的第一本路书" })).toBeVisible();
  expect(nativeDialogs).toEqual([]);
  await expect
    .poll(async () => page.evaluate(async () => (window as unknown as { getCommercialApiCalls: () => Promise<{ saves: number; shares: number; deletes: number }> }).getCommercialApiCalls()))
    .toMatchObject({ deletes: 1 });
  await expectNoHorizontalOverflow(page);
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
  await expect(page.getByText("Tokyo, Japan · 2026年9月1日 - 9月3日")).toBeVisible();
  await expect(page.getByText("Tokyo, Japan · 2026-09-01 - 2026-09-03")).toHaveCount(0);
  await expect(page.locator(".share-day-heading").first()).toContainText("2026年9月1日");
  await expect(page.getByText("2026-09-01", { exact: true })).toHaveCount(0);
  await expect(page.getByText("当地时间：东京")).toBeVisible();
  await expect(page.getByText("Asia/Tokyo")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "浅草寺散步" })).toBeVisible();
  await expect(page.getByText("活动").first()).toBeVisible();
  await expect(page.locator(".share-day-heading").first()).toContainText("1 项安排");
  await expect(page.locator(".share-step-number").first()).toHaveText("01");
  await expect(page.getByRole("button", { name: "打开 AI 修改窗口" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "打开全局命令窗口" })).toHaveCount(0);
  const stepPlaceLink = page.locator(".share-step").getByRole("link", { name: "打开 Google 地点 浅草寺" });
  await expect(stepPlaceLink).toHaveAttribute("href", /https:\/\/www\.google\.com\/maps\/search\/\?api=1/);
  await expect(stepPlaceLink).toHaveAttribute("href", /query_place_id=ChIJ8T1GpMGOGGARw6cSJo9lN4g/);
  await expect(stepPlaceLink).not.toHaveAttribute("href", /\/maps\/dir\//);
  await expect(page.getByRole("link", { name: "显示地点" })).toHaveCount(0);
  const placeDisplayLink = page.locator(".share-place-list a").filter({ hasText: "浅草寺" });
  await expect(placeDisplayLink).toHaveAttribute("href", /https:\/\/www\.google\.com\/maps\/search\/\?api=1/);
  await expect(placeDisplayLink).toHaveAttribute("href", /query_place_id=ChIJ8T1GpMGOGGARw6cSJo9lN4g/);
  await expect(placeDisplayLink).not.toHaveAttribute("href", /\/maps\/dir\//);
  const bookingSideCard = page.locator(".share-side-card").filter({ hasText: "Hotel Niwa Tokyo" });
  await expect(bookingSideCard).toContainText("已确认");
  await expect(page.getByText("confirmed", { exact: true })).toHaveCount(0);
  await expect(page.locator(".share-side-card").filter({ hasText: "出发清单" }).getByRole("heading", { name: "0/1 已打包" })).toBeVisible();
  await expect(page.getByRole("link", { name: "打开 Google 地点 浅草寺" })).toHaveCount(2);
  await expectVisibleTapTargetsAtLeast44(page, ".share-hero-actions a, .share-hero-actions span");
  const routePosition = await page.locator(".share-route").boundingBox();
  const viewport = page.viewportSize();
  expect(routePosition?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(viewport?.height ?? 0);
  await page.locator(".share-nav-link").scrollIntoViewIfNeeded();
  await expectVisibleTapTargetsAtLeast44(page, ".share-nav-link");
  await page.locator(".share-sidebar").scrollIntoViewIfNeeded();
  await expectVisibleTapTargetsAtLeast44(page, ".share-place-list a, .share-booking-list div, .share-packing-list div");
  expect(browserErrors).toEqual([]);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".share-day-heading").first()).toBeVisible();
  await page.locator(".share-nav-link").scrollIntoViewIfNeeded();
  await expectVisibleTapTargetsAtLeast44(page, ".share-nav-link");
  await page.locator(".share-sidebar").scrollIntoViewIfNeeded();
  await expectVisibleTapTargetsAtLeast44(page, ".share-place-list a, .share-booking-list div, .share-packing-list div");
  await expectNoHorizontalOverflow(page);
});

test("public share routebook uses customer-facing empty checklist copy", async ({ page }) => {
  await mockPublicShareWithEmptyDepartureRuntime(page);
  await page.goto("/share?token=public_empty_departure", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "里斯本公开路书" })).toBeVisible();
  await expect(page.locator(".share-side-card").filter({ hasText: "地点清单" }).getByRole("heading", { name: "待整理" })).toBeVisible();
  await expect(page.getByText("0 个地点")).toHaveCount(0);
  await expect(page.getByText("暂未整理地点。")).toBeVisible();
  await expect(page.locator(".share-side-card").filter({ hasText: "预订" }).getByRole("heading", { name: "待整理" })).toBeVisible();
  await expect(page.locator(".share-stat-grid div").filter({ hasText: "预订" }).locator("strong")).toHaveText("0");
  await expect(page.getByText("0 项确认")).toHaveCount(0);
  await expect(page.getByText("1 项确认")).toHaveCount(0);
  await expect(page.getByText("新的预订")).toHaveCount(0);
  await expect(page.getByText("暂未整理预订。")).toBeVisible();
  await expect(page.getByText("出发清单")).toBeVisible();
  await expect(page.locator(".share-side-card").filter({ hasText: "出发清单" }).getByRole("heading", { name: "待整理" })).toBeVisible();
  await expect(page.getByText("0/0")).toHaveCount(0);
  await expect(page.getByText("1/1")).toHaveCount(0);
  await expect(page.getByText("暂未整理打包清单。")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("public share routebook does not label pending bookings as confirmed", async ({ page }) => {
  await mockPublicShareWithPendingBookingRuntime(page);
  await page.goto("/share?token=public_pending_booking", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "曼谷公开路书" })).toBeVisible();
  const bookingSideCard = page.locator(".share-side-card").filter({ hasText: "预订" });
  await expect(bookingSideCard.getByRole("heading", { name: "1 项预订" })).toBeVisible();
  await expect(page.getByText("1 项确认")).toHaveCount(0);
  await expect(bookingSideCard).toContainText("晚餐候补确认");
  await expect(bookingSideCard).toContainText("2026-11-05 19:00");
  await expect(bookingSideCard).not.toContainText("已确认");
  await expect(page.locator(".share-stat-grid div").filter({ hasText: "预订" }).locator("strong")).toHaveText("1");
  await expect(page.getByText("暂未整理每日行程。")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("public share routebook does not link draft coordinates to google maps", async ({ page }) => {
  await mockPublicShareWithDraftCoordinatesRuntime(page);
  await page.goto("/share?token=public_draft_coordinates", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "冰岛公开路书" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "蓝湖温泉" })).toBeVisible();
  await expect(page.locator(".share-stat-grid div").filter({ hasText: "地点" }).locator("strong")).toHaveText("0");
  await expect(page.locator(".share-step-place")).toContainText("蓝湖温泉");
  await expect(page.locator(".share-side-card").filter({ hasText: "地点清单" })).toContainText("蓝湖温泉");
  await expect(page.getByRole("link", { name: "打开 Google 地点 蓝湖温泉" })).toHaveCount(0);
  await expect(page.locator(".share-nav-link")).toHaveCount(0);
  await expect(page.locator(".share-place-list a")).toHaveCount(0);
  await expect(page.getByText(/0,0/)).toHaveCount(0);
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

  await expect(page.getByText("分享不可用")).toBeVisible();
  await expect(page.getByRole("heading", { name: "无法打开分享路书" })).toBeVisible();
  await expect(page.getByText("链接可能已过期、被取消分享，或复制时缺少了一部分。")).toBeVisible();
  await expect(page.getByRole("link", { name: "回到路书首页" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "新建路书" })).toHaveAttribute("href", "/journeys/edit");
  await expect(page.getByRole("link", { name: "搜索目的地" })).toHaveAttribute("href", "/search");
  await expect(page.getByText(/Unexpected token|DOCTYPE|JSON/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "打开 AI 修改窗口" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "打开全局命令窗口" })).toHaveCount(0);
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

test("id based journey URL fallback preserves requested editor module", async ({ page }) => {
  await mockSignedInRuntime(page);

  await page.goto("/journeys/trip_11111111-1111-4111-8111-111111111111?module=places", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("radio", { name: "地点" })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".module-heading p")).toHaveText("地点");
  await expect(page.getByRole("button", { name: "添加地点" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => new URL(window.location.href).searchParams.get("module"))).toBe("places");
  await expect(page).toHaveURL(/\/journeys\/trip_11111111-1111-4111-8111-111111111111\?module=places#editor$/);
  if ((page.viewportSize()?.width ?? 0) <= 500) {
    const clearance = await page.evaluate(() => {
      const floaters = Array.from(document.querySelectorAll<HTMLElement>(".global-ai-launcher, .global-command-launcher"))
        .filter((element) => getComputedStyle(element).display !== "none" && getComputedStyle(element).visibility !== "hidden")
        .map((element) => element.getBoundingClientRect());
      const routebook = document.querySelector<HTMLElement>(".routebook-current")?.getBoundingClientRect();
      return {
        floaterCount: floaters.length,
        floaterBottom: floaters.length ? Math.max(...floaters.map((rect) => rect.bottom)) : 0,
        routebookTop: routebook?.top ?? 0
      };
    });
    expect(clearance.floaterCount, JSON.stringify(clearance)).toBe(0);
  }
  await expectNoHorizontalOverflow(page);
});

test("legacy edit URL preserves the requested module when canonicalized", async ({ page }) => {
  await mockSignedInRuntime(page);

  await page.goto("/journeys/edit?tripId=trip_11111111-1111-4111-8111-111111111111&module=map", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("radio", { name: "地图" })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".module-heading p")).toHaveText("地图");
  await expect.poll(() => page.evaluate(() => new URL(window.location.href).searchParams.get("module"))).toBe("map");
  await expect(page).toHaveURL(/\/journeys\/trip_11111111-1111-4111-8111-111111111111\?module=map#editor$/);
  await expectNoHorizontalOverflow(page);
});

test("editor module navigation keeps shareable module URLs", async ({ page }) => {
  await mockSignedInRuntime(page);

  await page.goto("/journeys/trip_11111111-1111-4111-8111-111111111111", { waitUntil: "domcontentloaded" });
  await page.getByRole("radio", { name: "地图" }).click();

  await expect(page.getByRole("radio", { name: "地图" })).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => page.evaluate(() => new URL(window.location.href).searchParams.get("module"))).toBe("map");
  await expect(page).toHaveURL(/\/journeys\/trip_11111111-1111-4111-8111-111111111111\?module=map#editor$/);

  await page.getByRole("radio", { name: "行程" }).click();
  await expect(page.getByRole("radio", { name: "行程" })).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => page.evaluate(() => new URL(window.location.href).searchParams.get("module"))).toBeNull();
  await expect(page).toHaveURL(/\/journeys\/trip_11111111-1111-4111-8111-111111111111#editor$/);
  await expectNoHorizontalOverflow(page);
});
