"use client";

import { useEffect, useMemo, useState } from "react";
import { Apple, CircleUserRound, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type ProviderStatus = {
  google: { configured: boolean };
  apple: { configured: boolean };
};

type SessionUser = {
  id: string;
  provider: "google" | "apple";
  email?: string;
  name?: string;
  avatarUrl?: string;
};

const fallbackProviders: ProviderStatus = {
  google: { configured: false },
  apple: { configured: false }
};

export function AuthPanel() {
  const [providers, setProviders] = useState<ProviderStatus>(fallbackProviders);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAuthState() {
      const [configResponse, sessionResponse] = await Promise.all([
        fetch("/auth/config"),
        fetch("/auth/session", { credentials: "include" })
      ]);

      const config = (await configResponse.json()) as { providers?: ProviderStatus };
      const session = (await sessionResponse.json()) as { user?: SessionUser | null };

      if (!cancelled) {
        setProviders(config.providers ?? fallbackProviders);
        setUser(session.user ?? null);
        setLoaded(true);
      }
    }

    loadAuthState().catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const returnTo = useMemo(() => {
    if (typeof window === "undefined") {
      return "/#editor";
    }
    return `${window.location.pathname}${window.location.search}${window.location.hash || "#editor"}`;
  }, []);

  if (!loaded) {
    return <div className="auth-panel auth-panel-loading">Checking sign-in</div>;
  }

  if (user) {
    return (
      <div className="auth-panel signed-in">
        <CircleUserRound size={18} />
        <span>{user.name || user.email || user.provider}</span>
        <form action="/auth/session" method="post">
          <Button size="icon" variant="icon" type="submit" title="Sign out" aria-label="Sign out">
            <LogOut size={16} />
          </Button>
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
          title={providers.google.configured ? "Sign in with Google" : "Google OAuth is not configured"}
        >
          <span className="provider-mark">G</span>
          <span>Google</span>
        </a>
      </Button>
      <Button asChild variant="secondary" size="sm" className={providers.apple.configured ? "provider-button" : "provider-button disabled"}>
        <a
          href={providers.apple.configured ? `/auth/apple/start?returnTo=${encodeURIComponent(returnTo)}` : undefined}
          aria-disabled={!providers.apple.configured}
          title={providers.apple.configured ? "Sign in with Apple" : "Apple OAuth is not configured"}
        >
          <Apple size={17} />
          <span>Apple</span>
        </a>
      </Button>
      <ShieldCheck className="auth-shield" size={16} />
    </div>
  );
}
