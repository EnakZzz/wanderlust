"use client";

import { CalendarDays, MapPin, Plus, Route, Ticket } from "lucide-react";
import { buildTripEditorPath } from "@wanderlust/domain";
import { Button } from "@/components/ui/button";
import { MotionSection } from "@/components/MotionShell";
import { useDashboardData } from "@/lib/web-api";
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
            把草稿、预订、地点、打包清单和离线准备状态放在同一个工作区里。
          </p>
        </div>
        <Button asChild>
          <a href="/#editor"><Plus size={18} /><span>新建路书</span></a>
        </Button>
      </div>

      {state.errorMessage ? <div className="sync-error">{state.errorMessage}</div> : null}

      <div className="journeys-grid">
        {state.trips.map((trip) => (
          <a key={trip.id} className="journey-card" href={tripEditorHref(trip.id)}>
            <span>{trip.status}</span>
            <strong>{trip.title}</strong>
            <em>{trip.destination}</em>
            <div>
              <small><CalendarDays size={14} />{formatTripDates(trip)}</small>
              <small><Route size={14} />{trip.dayCount} 天</small>
              <small><MapPin size={14} />{trip.placeCount} 个地点</small>
              <small><Ticket size={14} />{trip.bookingCount} 个预订</small>
            </div>
          </a>
        ))}

        {state.loaded && state.trips.length === 0 ? (
          <div className="journey-empty">
            <Route size={24} />
            <strong>还没有路书。</strong>
            <span>先创建框架、粘贴旅行笔记，或让 AI 生成第一版行程。</span>
            <Button asChild variant="secondary" size="sm">
              <a href="/#editor"><Plus size={17} /><span>开始规划</span></a>
            </Button>
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
