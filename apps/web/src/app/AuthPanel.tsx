"use client";

import { useMemo } from "react";
import { Apple, CircleUserRound, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/IconButton";
import { fallbackProviders, useAuthConfigQuery, useSessionQuery } from "@/lib/web-api";

export function AuthPanel() {
  const session = useSessionQuery();
  const authConfig = useAuthConfigQuery();
  const user = session.data ?? null;
  const providers = authConfig.data ?? fallbackProviders;
  const loaded = !session.isLoading && !authConfig.isLoading;

  const returnTo = useMemo(() => {
    if (typeof window === "undefined") {
      return "/#editor";
    }
    return `${window.location.pathname}${window.location.search}${window.location.hash || "#editor"}`;
  }, []);

  if (!loaded) {
    return <div className="auth-panel auth-panel-loading">正在检查登录状态</div>;
  }

  if (user) {
    return (
      <div className="auth-panel signed-in">
        <CircleUserRound size={18} />
        <span>{user.name || user.email || user.provider}</span>
        <form action="/auth/session" method="post">
          <IconButton type="submit" label="退出登录">
            <LogOut size={16} />
          </IconButton>
        </form>
      </div>
    );
  }

  return (
    <div className="auth-panel">
      <Button asChild variant="secondary" size="sm" className={providers.google.configured ? "provider-button" : "provider-button disabled"}>
        <a
          href={providers.google.configured ? `/auth/google/login?returnTo=${encodeURIComponent(returnTo)}` : undefined}
          aria-disabled={!providers.google.configured}
          title={providers.google.configured ? "使用 Google 登录" : "Google OAuth 尚未配置"}
        >
          <span className="provider-mark">G</span>
          <span>Google</span>
        </a>
      </Button>
      <Button asChild variant="secondary" size="sm" className={providers.apple.configured ? "provider-button" : "provider-button disabled"}>
        <a
          href={providers.apple.configured ? `/auth/apple/start?returnTo=${encodeURIComponent(returnTo)}` : undefined}
          aria-disabled={!providers.apple.configured}
          title={providers.apple.configured ? "使用 Apple 登录" : "Apple OAuth 尚未配置"}
        >
          <Apple size={17} />
          <span>Apple</span>
        </a>
      </Button>
      <ShieldCheck className="auth-shield" size={16} />
    </div>
  );
}
