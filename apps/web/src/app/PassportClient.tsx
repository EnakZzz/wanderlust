"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";
import { Compass, Flag, MapPinned, Plus, Route } from "lucide-react";
import { buildTripEditorPath } from "@wanderlust/domain";
import { Button } from "@/components/ui/button";
import { MotionSection } from "@/components/MotionShell";
import { TravelImage } from "@/components/TravelImage";
import { getDestinationTheme } from "@/lib/travel-visuals";
import { useDashboardData } from "@/lib/web-api";
import type { TripSummary } from "./routebook/types";

type Footprint = {
  city: string;
  country: string;
  trip: TripSummary;
};

const worldCountryCount = 195;
const cityFirstSeparators = ["，", ","];
const countryFirstSeparators = ["：", ":", " - ", " – ", " — ", " / ", "/", "｜", "|"];

function parseDestination(destination: string): { city: string; country: string } {
  const normalized = destination.trim();
  if (!normalized) {
    return {
      city: "Destination not set",
      country: "未分类"
    };
  }

  for (const separator of cityFirstSeparators) {
    if (!normalized.includes(separator)) continue;
    const parts = normalized.split(separator).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return {
        city: parts[0]!,
        country: parts[parts.length - 1]!
      };
    }
  }

  for (const separator of countryFirstSeparators) {
    if (!normalized.includes(separator)) continue;
    const parts = normalized.split(separator).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return {
        country: parts[0]!,
        city: parts.slice(1).join(" / ")
      };
    }
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return {
      country: words[0]!,
      city: words.slice(1).join(" ")
    };
  }

  return {
    city: normalized,
    country: "未分类"
  };
}

function tripEditorHref(tripId: string): string {
  return buildTripEditorPath(tripId);
}

export function PassportClient() {
  const state = useDashboardData();

  const footprint = useMemo<Footprint[]>(() => {
    return state.trips.map((trip) => {
      const parsed = parseDestination(trip.destination);
      return { ...parsed, trip };
    });
  }, [state.trips]);

  const countries = useMemo(() => Array.from(new Set(footprint.map((item) => item.country))).filter((country) => country !== "未分类"), [footprint]);
  const cities = useMemo(() => Array.from(new Set(footprint.map((item) => item.city))).filter((city) => city !== "Destination not set"), [footprint]);
  const exploredPercent = Math.round((countries.length / worldCountryCount) * 1000) / 10;
  const nextMilestone = exploredPercent < 5 ? 5 : Math.ceil((exploredPercent + 0.1) / 5) * 5;
  const milestoneRemaining = Math.max(0, Math.ceil((nextMilestone / 100) * worldCountryCount) - countries.length);
  const recentFootprint = footprint.slice(0, 6);
  const emptyFootprint =
    state.loaded && recentFootprint.length === 0 ? (
      <div className="passport-empty">
        <MapPinned size={22} />
        <strong>还没有记录国家/地区。</strong>
        <span>创建一本目的地类似“京都，日本”的路书后，旅行足迹会自动开始归类。</span>
        <Button asChild variant="secondary" size="sm">
          <a href="/search"><Plus size={17} /><span>添加目的地</span></a>
        </Button>
      </div>
    ) : null;

  return (
    <MotionSection className="passport-shell">
      <div className="passport-hero">
        <div>
          <p className="eyebrow">旅行足迹</p>
          <h1>{state.user ? "你的路书正在变成旅行足迹。" : "记录那些从路书变成记忆的地方。"}</h1>
          <p>
            旅行足迹会把保存过的路书整理成国家覆盖、城市记录和下一阶段目标。
            这样每一次旅行都不会只是孤立的一份计划。
          </p>
        </div>
        <div className="passport-hero-actions">
          <Button asChild>
            <a href="/journeys"><Route size={18} /><span>打开路书</span></a>
          </Button>
          <Button asChild variant="secondary">
            <a href="/search"><Plus size={18} /><span>添加目的地</span></a>
          </Button>
        </div>
      </div>

      {state.errorMessage ? <div className="sync-error">{state.errorMessage}</div> : null}

      <div className="passport-grid">
        <section className="passport-score-card">
          <span>已探索世界</span>
          <strong>{state.loaded ? `${exploredPercent.toFixed(1)}%` : "--"}</strong>
          <small>{state.trips.length} 本路书记录了 {countries.length} 个国家/地区</small>
        </section>

        {emptyFootprint ? <section className="passport-empty-inline">{emptyFootprint}</section> : null}

        <section className="passport-stat-card">
          <Flag size={20} />
          <strong>{state.loaded ? countries.length : "--"}</strong>
          <span>国家/地区</span>
        </section>

        <section className="passport-stat-card">
          <MapPinned size={20} />
          <strong>{state.loaded ? cities.length : "--"}</strong>
          <span>城市</span>
        </section>

        <section className="passport-stat-card">
          <Compass size={20} />
          <strong>{state.loaded ? milestoneRemaining : "--"}</strong>
          <span>距离 {nextMilestone}% 还差的国家/地区</span>
        </section>
      </div>

      <div className="passport-main-grid">
        <section className="passport-section">
          <div className="passport-section-heading">
            <div>
              <p className="eyebrow">足迹</p>
              <h2>{recentFootprint.length ? "最近规划过的地方" : "旅行足迹正在等待第一本路书。"}</h2>
            </div>
          </div>
          <div className="passport-footprint-list">
            {recentFootprint.map((item) => (
              <a
                key={item.trip.id}
                href={tripEditorHref(item.trip.id)}
                className="passport-footprint-card"
                style={{
                  "--passport-card-accent": getDestinationTheme(item.trip.destination).accent
                } as CSSProperties}
              >
                <TravelImage
                  src={getDestinationTheme(item.trip.destination).image}
                  alt=""
                  className="passport-footprint-image"
                  overlayClassName="passport-footprint-image-overlay"
                  sizes="(max-width: 720px) 100vw, 320px"
                />
                <div className="passport-footprint-copy">
                  <span>{item.country}</span>
                  <strong>{item.city}</strong>
                  <small>{item.trip.title} · {item.trip.dayCount} 天 · {item.trip.placeCount} 个地点</small>
                </div>
              </a>
            ))}
          </div>
        </section>

        <aside className="passport-section passport-next-panel">
          <p className="eyebrow">下一阶段</p>
          <strong>探索 {nextMilestone}%</strong>
          <span>
            {countries.length
              ? `再记录 ${milestoneRemaining} 个国家/地区即可达到下一个足迹阶段。`
              : "先创建一个真实目的地路书来激活足迹阶段。"}
          </span>
          <Button asChild variant="secondary" size="sm">
            <a href="/search"><Plus size={17} /><span>下个目的地</span></a>
          </Button>
        </aside>
      </div>
    </MotionSection>
  );
}
