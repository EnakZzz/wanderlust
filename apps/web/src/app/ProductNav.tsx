"use client";

import { useEffect, useState } from "react";
import { Compass, LayoutDashboard, LogOut, MapPinned, Plane, Route, Search, Sparkles } from "lucide-react";
import { productBrand } from "@wanderlust/domain";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { SessionUser } from "./routebook/types";

type ProductNavProps = {
  tone?: "light" | "dark";
  active?: "home" | "dashboard" | "journeys" | "passport" | "search" | "assistant";
};

const navItems = [
  { id: "dashboard", label: "控制台", href: "/dashboard", icon: LayoutDashboard },
  { id: "journeys", label: "路书", href: "/journeys", icon: Route },
  { id: "passport", label: "足迹", href: "/passport", icon: MapPinned },
  { id: "search", label: "搜索", href: "/search", icon: Search },
  { id: "assistant", label: "AI", href: "/#editor", icon: Sparkles }
] as const;

export function ProductNav({ tone = "light", active = "home" }: ProductNavProps) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/auth/session", { credentials: "include" }).then(async (response) => {
        if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return { user: null };
        return (await response.json()) as { user?: SessionUser | null };
      }),
      fetch("/auth/config").then(async (response) => {
        if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return { providers: { google: { configured: false } } };
        return (await response.json()) as { providers?: { google?: { configured?: boolean } } };
      })
    ])
      .then(([session, config]) => {
        if (!cancelled) {
          setUser(session.user ?? null);
          setGoogleConfigured(Boolean(config.providers?.google?.configured));
        }
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const returnTo = active === "home" ? "/dashboard" : `/${active}`;
  const authHref = googleConfigured ? `/auth/google/login?returnTo=${encodeURIComponent(returnTo)}` : "/#editor";

  const className = tone === "dark" ? "product-nav product-nav-dark" : "product-nav";

  return (
    <nav className={className} aria-label="Primary">
      <a className="product-nav-brand" href="/">
        <Plane size={18} />
        <span>{productBrand.shortName}</span>
      </a>

      <TooltipProvider delayDuration={120}>
        <div className="product-nav-links product-nav-icon-links">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <a className={active === item.id ? "active" : undefined} href={item.href} aria-label={item.label}>
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </a>
                </TooltipTrigger>
                <TooltipContent>{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>

      <div className="product-nav-actions">
        {!loaded ? (
          <span className="product-nav-status">检查登录状态</span>
        ) : user ? (
          <>
            <a className="product-nav-user" href="/dashboard" title={user.email ?? user.name ?? "账号"}>
              <Compass size={15} />
              <span>{user.name || user.email || "旅行者"}</span>
            </a>
            <form action="/auth/session" method="post">
              <Button variant="icon" size="icon" type="submit" title="退出登录" aria-label="退出登录">
                <LogOut size={16} />
              </Button>
            </form>
          </>
        ) : (
          <>
            <Button asChild variant="ghost" size="sm">
              <a href={authHref}>登录</a>
            </Button>
            <Button asChild size="sm">
              <a href={authHref}>开始规划</a>
            </Button>
          </>
        )}
      </div>
    </nav>
  );
}
