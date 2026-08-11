"use client";

import type { MouseEvent } from "react";
import { Compass, LayoutDashboard, LogOut, MapPinned, Plane, Route, Search, Sparkles } from "lucide-react";
import { productBrand } from "@wanderlust/domain";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { IconButton } from "@/components/IconButton";
import { useAuthConfigQuery, useSessionQuery } from "@/lib/web-api";

type ProductNavProps = {
  tone?: "light" | "dark";
  active?: "home" | "dashboard" | "journeys" | "passport" | "search" | "assistant";
};

const navItems = [
  { id: "dashboard", label: "控制台", href: "/dashboard", icon: LayoutDashboard },
  { id: "journeys", label: "路书", href: "/journeys", icon: Route },
  { id: "passport", label: "足迹", href: "/passport", icon: MapPinned },
  { id: "search", label: "搜索", href: "/search", icon: Search },
  { id: "assistant", label: "AI", href: "/?ai=1#editor", icon: Sparkles }
] as const;

export function ProductNav({ tone = "light", active = "home" }: ProductNavProps) {
  const session = useSessionQuery();
  const authConfig = useAuthConfigQuery();
  const user = session.data ?? null;
  const googleConfigured = Boolean(authConfig.data?.google.configured);
  const loaded = !session.isLoading && !authConfig.isLoading;

  const returnTo = active === "home" ? "/dashboard" : `/${active}`;
  const authHref = googleConfigured ? `/auth/google/login?returnTo=${encodeURIComponent(returnTo)}` : "/#editor";

  const className = tone === "dark" ? "product-nav product-nav-dark" : "product-nav";

  function openAssistantInCurrentEditor(event: MouseEvent<HTMLAnchorElement>) {
    if (!document.getElementById("editor")) return;
    event.preventDefault();
    window.location.hash = "editor";
    window.dispatchEvent(new CustomEvent("wanderlust:open-ai-assistant"));
  }

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
                  <a
                    className={active === item.id ? "active" : undefined}
                    href={item.href}
                    aria-label={item.label}
                    onClick={item.id === "assistant" ? openAssistantInCurrentEditor : undefined}
                  >
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
              <IconButton type="submit" label="退出登录">
                <LogOut size={16} />
              </IconButton>
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
