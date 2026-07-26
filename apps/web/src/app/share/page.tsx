"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckSquare, Clock, MapPin, Navigation, Plane, Share2, Ticket } from "lucide-react";
import { buildMapsUrl, productBrand, sortItineraryItems, type ItineraryItem, type Place, type Trip } from "@wanderlust/domain";

type PublicShare = {
  id: string;
  tripId: string;
  token: string;
  visibility: "public" | "private";
  allowCopy: boolean;
  revokedAt: string | null;
  expiresAt: string | null;
};

type PublicShareResponse = {
  share: PublicShare;
  trip: Trip;
};

const typeLabels: Record<ItineraryItem["type"], string> = {
  place: "地点",
  food: "餐饮",
  hotel: "住宿",
  transport: "交通",
  activity: "活动",
  note: "备注",
  booking: "预订"
};

const typeImages: Record<ItineraryItem["type"], string> = {
  place: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
  food: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80",
  hotel: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=80",
  transport: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=80",
  activity: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=80",
  note: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
  booking: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=80"
};

function formatDateRange(trip: Trip): string {
  return `${trip.startDate} - ${trip.endDate}`;
}

function formatItemTime(item: ItineraryItem): string {
  if (item.startTime && item.endTime) return `${item.startTime}-${item.endTime}`;
  return item.startTime ?? item.endTime ?? "时间待定";
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

function getNavigationHref(item: ItineraryItem, place?: Place): string | undefined {
  const latitude = place?.latitude ?? item.latitude;
  const longitude = place?.longitude ?? item.longitude;
  if (typeof latitude !== "number" || typeof longitude !== "number") return undefined;
  return buildMapsUrl({ latitude, longitude, label: getLocationLabel(item, place), googlePlaceId: place?.googlePlaceId ?? item.googlePlaceId }, "google");
}

export default function SharePage() {
  const [payload, setPayload] = useState<PublicShareResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("正在读取分享路书...");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token")?.trim();
    if (!token) {
      setStatus("error");
      setMessage("分享链接缺少 token。");
      return;
    }

    fetch(`/api/share/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json() as PublicShareResponse & { error?: string };
        if (!response.ok) throw new Error(data.error || "无法打开分享路书");
        setPayload(data);
        setStatus("ready");
      })
      .catch((error) => {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "无法打开分享路书");
      });
  }, []);

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
        <section className="share-state">
          <Share2 size={30} />
          <h1>{status === "loading" ? "打开路书" : "分享不可用"}</h1>
          <p>{message}</p>
          <a href="/">{productBrand.name}</a>
        </section>
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
      <section className="share-hero">
        <div className="share-hero-image" />
        <div className="share-hero-copy">
          <p className="eyebrow">只读分享路书</p>
          <h1>{trip.title}</h1>
          <p>{trip.destination} · {formatDateRange(trip)}</p>
          <div className="share-hero-actions">
            <a href="/" className="share-home-link"><Plane size={17} /> {productBrand.name}</a>
            <span><CalendarDays size={16} /> {trip.timezone}</span>
          </div>
        </div>
      </section>

      <section className="share-body">
        <div className="share-stat-grid">
          {stats.map((stat) => (
            <div key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>

        <div className="share-layout">
          <section className="share-route">
            {days.map((day, dayIndex) => (
              <article key={day.id} className="share-day">
                <div className="share-day-marker"><span>{String(dayIndex + 1).padStart(2, "0")}</span></div>
                <div className="share-day-content">
                  <div className="share-day-heading">
                    <p className="eyebrow">DAY {String(dayIndex + 1).padStart(2, "0")}</p>
                    <h2>{day.title}</h2>
                    <span>{day.date}</span>
                  </div>
                  <div className="share-step-list">
                    {sortItineraryItems(day.items ?? []).map((item) => {
                      const place = getPlaceForItem(item, places);
                      const href = getNavigationHref(item, place);
                      return (
                        <article key={item.id} className="share-step">
                          <div className="share-step-image" style={{ backgroundImage: `url(${place?.imageUrl ?? typeImages[item.type]})` }} aria-hidden="true" />
                          <div className="share-step-copy">
                            <div className="share-step-meta">
                              <span>{typeLabels[item.type]}</span>
                              <em><Clock size={14} /> {formatItemTime(item)}</em>
                            </div>
                            <h3>{item.title}</h3>
                            <p>{getDescription(item, place)}</p>
                            <div className="share-step-place">
                              <MapPin size={15} />
                              <span>{getLocationLabel(item, place)}</span>
                            </div>
                            {href ? (
                              <a className="share-nav-link" href={href} target="_blank" rel="noreferrer">
                                <Navigation size={15} />
                                打开导航
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
            ))}
          </section>

          <aside className="share-sidebar">
            <section className="share-side-card">
              <p className="eyebrow">地点清单</p>
              <h2>{places.length} 个地点</h2>
              <div className="share-place-list">
                {places.slice(0, 8).map((place) => (
                  <a key={place.id} href={buildMapsUrl({ latitude: place.latitude, longitude: place.longitude, label: place.name, googlePlaceId: place.googlePlaceId }, "google")} target="_blank" rel="noreferrer">
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
          </aside>
        </div>
      </section>
    </main>
  );
}
