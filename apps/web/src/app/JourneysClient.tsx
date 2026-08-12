"use client";

import type { CSSProperties } from "react";
import { CalendarDays, Compass, MapPin, Plus, Route, Sparkles, Ticket } from "lucide-react";
import { buildTripEditorPath } from "@wanderlust/domain";
import { Button } from "@/components/ui/button";
import { MotionSection } from "@/components/MotionShell";
import { TravelImage } from "@/components/TravelImage";
import { getDestinationTheme } from "@/lib/travel-visuals";
import { useDashboardData } from "@/lib/web-api";
import { formatTripStatus } from "./routebook/labels";
import type { TripSummary } from "./routebook/types";

function formatTripDates(trip: TripSummary): string {
  if (!trip.startDate || !trip.endDate) return "日期未设置";
  return trip.startDate === trip.endDate ? trip.startDate : `${trip.startDate} - ${trip.endDate}`;
}

function tripEditorHref(tripId: string): string {
  return buildTripEditorPath(tripId);
}

export function JourneysClient() {
  const state = useDashboardData();

  return (
    <MotionSection className="journeys-shell">
      <div className="journeys-heading">
        <div>
          <p className="eyebrow">我的路书</p>
          <h1>把草稿整理成真正能出发的旅行。</h1>
          <p>
            草稿、预订、地点和离线清单，统一收进一个工作区。
          </p>
        </div>
        <Button asChild>
          <a href="/#editor"><Plus size={18} /><span>新建路书</span></a>
        </Button>
      </div>

      {state.errorMessage ? <div className="sync-error">{state.errorMessage}</div> : null}

      <div className="journeys-grid">
        {state.trips.map((trip) => {
          const theme = getDestinationTheme(trip.destination);
          return (
            <a
              key={trip.id}
              className="journey-card journey-photo-card"
              href={tripEditorHref(trip.id)}
              style={{
                "--journey-card-accent": theme.accent,
                "--journey-card-ink": theme.ink,
                "--journey-card-wash": theme.wash,
                "--journey-card-glow": theme.glow
              } as CSSProperties}
            >
              <TravelImage
                src={theme.image}
                alt=""
                className="journey-card-image"
                overlayClassName="journey-card-image-overlay"
                sizes="(max-width: 760px) 100vw, 33vw"
              />
              <div className="journey-card-topline">
                <span>{formatTripStatus(trip.status)}</span>
                <small><CalendarDays size={14} />{formatTripDates(trip)}</small>
              </div>
              <div className="journey-card-copy">
                <strong>{trip.title}</strong>
                <em>{trip.destination}</em>
              </div>
              <div className="journey-card-stats" aria-label="路书概览">
                <small title="天数"><Route size={14} />{trip.dayCount}</small>
                <small title="地点"><MapPin size={14} />{trip.placeCount}</small>
                <small title="预订"><Ticket size={14} />{trip.bookingCount}</small>
              </div>
            </a>
          );
        })}

        {state.loaded && state.trips.length === 0 ? (
          <div className="journey-empty">
            <div className="journey-empty-mark" aria-hidden="true">
              <Compass size={28} />
            </div>
            <div className="journey-empty-copy">
              <strong>还没有路书。</strong>
              <span>先创建一个可编辑框架，再把航班、酒店和地点逐步收进来。</span>
            </div>
            <div className="journey-empty-actions">
              <Button asChild size="sm">
                <a href="/#editor"><Plus size={17} /><span>开始规划</span></a>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <a href="/search"><Sparkles size={17} /><span>找灵感</span></a>
              </Button>
            </div>
          </div>
        ) : null}

        {!state.loaded ? (
          <>
            <div className="journey-card journey-card-loading" />
            <div className="journey-card journey-card-loading" />
          </>
        ) : null}
      </div>
    </MotionSection>
  );
}
