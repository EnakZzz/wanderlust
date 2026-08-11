"use client";

import { useMemo } from "react";
import { FileUp, MapPinned, PlaneTakeoff, Plus, Route, Sparkles } from "lucide-react";
import { buildTripEditorPath } from "@wanderlust/domain";
import { Button } from "@/components/ui/button";
import { MotionDiv, MotionSection } from "@/components/MotionShell";
import { TravelImage } from "@/components/TravelImage";
import { discoveryCards } from "@/lib/travel-visuals";
import { useDashboardData } from "@/lib/web-api";
import { DestinationSearchPanel, editorHref } from "./DestinationSearchPanel";
import type { TripSummary } from "./routebook/types";

function formatTripDates(trip: TripSummary): string {
  if (!trip.startDate || !trip.endDate) return "日期未设置";
  if (trip.startDate === trip.endDate) return trip.startDate;
  return `${trip.startDate} - ${trip.endDate}`;
}

function tripEditorHref(tripId: string): string {
  return buildTripEditorPath(tripId);
}

export function DashboardClient() {
  const state = useDashboardData();

  const stats = useMemo(() => {
    const upcoming = state.trips.filter((trip) => trip.startDate && trip.startDate >= new Date().toISOString().slice(0, 10)).length;
    const places = state.trips.reduce((total, trip) => total + trip.placeCount, 0);
    const bookings = state.trips.reduce((total, trip) => total + trip.bookingCount, 0);
    return [
      { label: "路书", value: state.trips.length },
      { label: "即将出发", value: upcoming },
      { label: "已保存地点", value: places },
      { label: "预订", value: bookings }
    ];
  }, [state.trips]);

  const recentTrips = state.trips.slice(0, 3);
  const userName = state.user?.name?.split(" ")[0] || state.user?.email?.split("@")[0] || "旅行者";

  return (
    <MotionSection className="dashboard-shell">
      <div className="dashboard-hero">
        <div>
          <p className="eyebrow">旅行控制台</p>
          <h1>{state.user ? `${userName}，继续整理你的下一段旅程。` : "从一个地方开始规划下一次旅行。"}</h1>
          <p>
            在进入复杂编辑器之前，先搜索目的地、生成草稿、保存路书并检查离线准备状态。
            灵感可以很快变成真正能带上路的计划。
          </p>
        </div>
        <div className="dashboard-hero-actions">
          <Button asChild>
            <a href="/#editor"><Plus size={18} /><span>新建路书</span></a>
          </Button>
          <Button asChild variant="secondary">
            <a href="/#editor"><Sparkles size={18} /><span>AI 草稿</span></a>
          </Button>
        </div>
      </div>

      {state.errorMessage ? <div className="sync-error">{state.errorMessage}</div> : null}

      <DestinationSearchPanel className="dashboard-destination-panel" />

      <MotionDiv className="dashboard-stat-grid">
        {stats.map((stat) => (
          <div key={stat.label}>
            <strong>{state.loaded ? stat.value : "--"}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </MotionDiv>

      <div className="dashboard-main-grid">
        <section className="dashboard-section">
          <div className="dashboard-section-heading">
            <div>
              <p className="eyebrow">继续规划</p>
              <h2>{recentTrips.length ? "正在进行的路书" : "第一本路书从这里开始"}</h2>
            </div>
            <Button asChild variant="secondary" size="sm">
              <a href="/journeys"><Route size={17} /><span>全部路书</span></a>
            </Button>
          </div>

          <div className="dashboard-trip-list">
            {recentTrips.map((trip) => (
              <a key={trip.id} className="dashboard-trip-card" href={tripEditorHref(trip.id)}>
                <span>{trip.status}</span>
                <strong>{trip.title}</strong>
                <em>{trip.destination}</em>
                <small>{formatTripDates(trip)} · {trip.dayCount} 天 · {trip.placeCount} 个地点</small>
              </a>
            ))}
            {state.loaded && recentTrips.length === 0 ? (
              <div className="dashboard-empty-card">
                <PlaneTakeoff size={22} />
                <strong>还没有路书。</strong>
                <span>可以从目的地开始，粘贴预订记录，或让 AI 生成一份可审核草稿。</span>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="dashboard-section dashboard-next-panel">
          <p className="eyebrow">下一步</p>
          <a href="/#editor"><Plus size={17} /><span>创建路书框架</span></a>
          <a href="/#editor"><FileUp size={17} /><span>导入预订或笔记</span></a>
          <a href="/#editor"><Sparkles size={17} /><span>生成 AI 路线草稿</span></a>
          <a href="/passport"><MapPinned size={17} /><span>查看旅行足迹</span></a>
        </aside>
      </div>

      <section className="dashboard-section">
        <div className="dashboard-section-heading">
          <div>
            <p className="eyebrow">目的地灵感</p>
            <h2>把一个城市信号变成可执行计划。</h2>
          </div>
        </div>
        <div className="dashboard-discovery-grid">
          {discoveryCards.map((card) => (
            <a key={card.title} href={editorHref(card.title)}>
              <TravelImage src={card.image} alt="" className="dashboard-discovery-image" overlayClassName="dashboard-discovery-image-overlay" sizes="(max-width: 720px) 100vw, 33vw" />
              <span>{card.eyebrow}</span>
              <strong>{card.title}</strong>
              <small>{card.copy}</small>
            </a>
          ))}
        </div>
      </section>
    </MotionSection>
  );
}
