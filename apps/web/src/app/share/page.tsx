"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CheckSquare, Clock, ExternalLink, MapPin, Plane, Share2, Ticket } from "lucide-react";
import { buildGoogleMapsPlaceUrl, productBrand, sortItineraryItems, type ItineraryItem, type Place, type Trip } from "@wanderlust/domain";
import { MotionDiv, MotionSection } from "@/components/MotionShell";
import { TravelImage } from "@/components/TravelImage";
import { getItineraryTypeVisual, heroVisuals } from "@/lib/travel-visuals";
import { readPublicShare } from "@/lib/web-api";

const typeLabels: Record<ItineraryItem["type"], string> = {
  place: "地点",
  food: "餐饮",
  hotel: "住宿",
  transport: "交通",
  activity: "活动",
  note: "备注",
  booking: "预订"
};

function getTypeLabel(type: ItineraryItem["type"] | string): string {
  return typeLabels[type as ItineraryItem["type"]] ?? "活动";
}

function formatDateRange(trip: Trip): string {
  return `${trip.startDate} - ${trip.endDate}`;
}

function formatItemTime(item: ItineraryItem): string {
  if (item.startTime && item.endTime) return `${item.startTime}-${item.endTime}`;
  return item.startTime ?? item.endTime ?? "时间待定";
}

function formatTimezoneLabel(timezone: string): string {
  const knownCities: Record<string, string> = {
    "Africa/Cairo": "开罗",
    "America/Los_Angeles": "洛杉矶",
    "America/New_York": "纽约",
    "Asia/Bangkok": "曼谷",
    "Asia/Seoul": "首尔",
    "Asia/Shanghai": "上海",
    "Asia/Singapore": "新加坡",
    "Asia/Tokyo": "东京",
    "Australia/Sydney": "悉尼",
    "Europe/Lisbon": "里斯本",
    "Europe/London": "伦敦",
    "Europe/Paris": "巴黎"
  };
  const trimmed = timezone.trim();
  if (!trimmed || trimmed === "Etc/UTC" || trimmed === "UTC") return "当地时间";
  return `当地时间：${knownCities[trimmed] ?? trimmed.split("/").pop()?.replace(/_/g, " ") ?? "当地"}`;
}

function getPlaceForItem(item: ItineraryItem, places: Place[]): Place | undefined {
  return item.placeId ? places.find((place) => place.id === item.placeId) : undefined;
}

function getLocationLabel(item: ItineraryItem, place?: Place): string {
  return place?.name ?? item.locationName ?? "地点待补";
}

function getDescription(item: ItineraryItem, place?: Place): string {
  return item.reason?.trim() || item.notes?.trim() || place?.notes?.trim() || "这一步还没有补充说明。";
}

function getGooglePlaceHref(item: ItineraryItem, place?: Place): string | undefined {
  const latitude = place?.latitude ?? item.latitude;
  const longitude = place?.longitude ?? item.longitude;
  if (typeof latitude !== "number" || typeof longitude !== "number") return undefined;
  return buildGoogleMapsPlaceUrl({ latitude, longitude, label: getLocationLabel(item, place), googlePlaceId: place?.googlePlaceId ?? item.googlePlaceId });
}

function getDaySummary(items: ItineraryItem[]): string {
  const sorted = sortItineraryItems(items);
  const times = sorted.flatMap((item) => [item.startTime, item.endTime]).filter((time): time is string => Boolean(time));
  const timeRange = times.length ? `${times[0]} - ${times[times.length - 1]}` : "时间待定";
  return `${sorted.length} 项安排 · ${timeRange}`;
}

export default function SharePage() {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token")?.trim() || null);
  }, []);

  const shareQuery = useQuery({
    queryKey: ["share", token],
    queryFn: () => readPublicShare(token!),
    enabled: typeof token === "string" && token.length > 0,
    retry: false
  });

  const payload = shareQuery.data ?? null;
  const status = token === null || shareQuery.isError ? "error" : token === undefined || shareQuery.isLoading || !payload ? "loading" : "ready";
  const message = token === null
    ? "分享链接缺少 token。"
    : shareQuery.error instanceof Error
      ? shareQuery.error.message
      : "正在读取分享路书...";

  const stats = useMemo(() => {
    if (!payload) return [];
    const trip = payload.trip;
    const days = trip.days ?? [];
    const places = trip.places ?? [];
    const bookings = trip.bookings ?? [];
    const itemCount = days.reduce((total, day) => total + (day.items?.length ?? 0), 0);
    return [
      { label: "天数", value: days.length },
      { label: "安排", value: itemCount },
      { label: "地点", value: places.length },
      { label: "预订", value: bookings.length }
    ];
  }, [payload]);

  if (status !== "ready" || !payload) {
    return (
      <main className="share-page">
        <MotionSection className="share-state">
          <Share2 size={30} />
          <h1>{status === "loading" ? "打开路书" : "分享不可用"}</h1>
          <p>{message}</p>
          <a href="/">{productBrand.name}</a>
        </MotionSection>
      </main>
    );
  }

  const trip = payload.trip;
  const days = trip.days ?? [];
  const places = trip.places ?? [];
  const bookings = trip.bookings ?? [];
  const packingItems = trip.packingItems ?? [];

  return (
    <main className="share-page">
      <MotionSection className="share-hero" transition={{ duration: 0.58, ease: [0.22, 1, 0.36, 1] }}>
        <TravelImage src={heroVisuals.share} alt="" className="share-hero-image" overlayClassName="share-hero-image-overlay" sizes="100vw" priority />
        <div className="share-hero-copy">
          <p className="eyebrow">只读分享路书</p>
          <h1>{trip.title}</h1>
          <p>{trip.destination} · {formatDateRange(trip)}</p>
          <div className="share-hero-actions">
            <a href="/" className="share-home-link"><Plane size={17} /> {productBrand.name}</a>
            <span><CalendarDays size={16} /> {formatTimezoneLabel(trip.timezone)}</span>
          </div>
        </div>
      </MotionSection>

      <MotionSection className="share-body" transition={{ delay: 0.08, duration: 0.44, ease: [0.22, 1, 0.36, 1] }}>
        <MotionDiv className="share-stat-grid" transition={{ delay: 0.12, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}>
          {stats.map((stat) => (
            <div key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </MotionDiv>

        <div className="share-layout">
          <MotionSection className="share-route" transition={{ delay: 0.16, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}>
            {days.map((day, dayIndex) => {
              const dayItems = sortItineraryItems(day.items ?? []);
              return (
              <article key={day.id} className="share-day">
                <div className="share-day-marker"><span>{String(dayIndex + 1).padStart(2, "0")}</span></div>
                <div className="share-day-content">
                  <div className="share-day-heading">
                    <div>
                      <p className="eyebrow">DAY {String(dayIndex + 1).padStart(2, "0")}</p>
                      <h2>{day.title}</h2>
                    </div>
                    <span>{day.date}</span>
                    <em>{getDaySummary(dayItems)}</em>
                  </div>
                  <div className="share-step-list">
                    {dayItems.map((item, itemIndex) => {
                      const place = getPlaceForItem(item, places);
                      const href = getGooglePlaceHref(item, place);
                      const locationLabel = getLocationLabel(item, place);
                      return (
                        <article key={item.id} className="share-step">
                          <div className="share-step-number" aria-hidden="true">{String(itemIndex + 1).padStart(2, "0")}</div>
                          <TravelImage
                            className="share-step-image"
                            src={place?.imageUrl ?? getItineraryTypeVisual(item.type).image}
                            alt=""
                            sizes="(max-width: 720px) 100vw, 360px"
                          />
                          <div className="share-step-copy">
                            <div className="share-step-meta">
                              <span>{getTypeLabel(item.type)}</span>
                              <em><Clock size={14} /> {formatItemTime(item)}</em>
                            </div>
                            <h3>{item.title}</h3>
                            <p>{getDescription(item, place)}</p>
                            <div className="share-step-place">
                              <MapPin size={15} />
                              <span>{locationLabel}</span>
                            </div>
                            {href ? (
                              <a className="share-nav-link" aria-label={`打开 Google 地点 ${locationLabel}`} href={href} target="_blank" rel="noreferrer">
                                <ExternalLink size={15} />
                                打开 Google 地点
                              </a>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                    {(day.items?.length ?? 0) === 0 ? <div className="share-empty-step">这一天还没有安排。</div> : null}
                  </div>
                </div>
              </article>
              );
            })}
          </MotionSection>

          <MotionDiv className="share-sidebar" transition={{ delay: 0.2, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}>
            <section className="share-side-card">
              <p className="eyebrow">地点清单</p>
              <h2>{places.length} 个地点</h2>
              <div className="share-place-list">
                {places.slice(0, 8).map((place) => (
                  <a
                    key={place.id}
                    aria-label={`打开 Google 地点 ${place.name}`}
                    href={buildGoogleMapsPlaceUrl({ latitude: place.latitude, longitude: place.longitude, label: place.name, googlePlaceId: place.googlePlaceId })}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MapPin size={15} />
                    <span>{place.name}</span>
                  </a>
                ))}
                {places.length === 0 ? <span>暂未整理地点。</span> : null}
              </div>
            </section>

            <section className="share-side-card">
              <p className="eyebrow">预订</p>
              <h2>{bookings.length} 项确认</h2>
              <div className="share-booking-list">
                {bookings.slice(0, 6).map((booking) => (
                  <div key={booking.id}>
                    <Ticket size={15} />
                    <span>{booking.title}</span>
                    <small>{booking.startsAt ?? booking.status}</small>
                  </div>
                ))}
                {bookings.length === 0 ? <span>暂未整理预订。</span> : null}
              </div>
            </section>

            <section className="share-side-card">
              <p className="eyebrow">出发清单</p>
              <h2>{packingItems.filter((item) => item.packed).length}/{packingItems.length}</h2>
              <div className="share-packing-list">
                {packingItems.slice(0, 8).map((item) => (
                  <div key={item.id}>
                    <CheckSquare size={15} />
                    <span>{item.title}</span>
                  </div>
                ))}
                {packingItems.length === 0 ? <span>暂未整理打包清单。</span> : null}
              </div>
            </section>
          </MotionDiv>
        </div>
      </MotionSection>
    </main>
  );
}
