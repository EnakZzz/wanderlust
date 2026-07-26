"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, MapPin, Search } from "lucide-react";
import type { DestinationMeta } from "./routebook/types";

type DestinationSearchPanelProps = {
  className?: string;
  placeholder?: string;
  suggestions?: string[];
};

type DestinationSearchResponse = {
  candidates: DestinationMeta[];
  providerError?: string;
};

const defaultSuggestions = ["京都", "里斯本", "首尔", "墨西哥城"];

function editorHref(destination: string): string {
  const query = destination.trim();
  return query ? `/?destination=${encodeURIComponent(query)}#editor` : "/#editor";
}

export function DestinationSearchPanel({
  className = "",
  placeholder = "搜索城市、路线或一个小长假目的地...",
  suggestions = defaultSuggestions
}: DestinationSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<DestinationMeta[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setCandidates([]);
      setIsSearching(false);
      setMessage(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setIsSearching(true);
      setMessage(null);

      fetch(`/api/geo/search?q=${encodeURIComponent(normalized)}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.headers.get("content-type")?.includes("application/json")) {
            throw new Error("API Worker 运行后才能使用目的地搜索。");
          }
          const payload = (await response.json()) as DestinationSearchResponse & { error?: string };
          if (!response.ok) throw new Error(payload.error || "无法搜索目的地");
          setCandidates(payload.candidates ?? []);
          setMessage(payload.providerError ? "地图服务尚未配置，正在使用本地目的地建议。" : null);
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          setCandidates([]);
          setMessage(error instanceof Error ? error.message : "目的地搜索暂时不可用。");
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearching(false);
        });
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const quickSuggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return suggestions;
    return suggestions.filter((item) => item.toLowerCase().includes(normalized)).slice(0, 4);
  }, [query, suggestions]);

  return (
    <div className={`destination-panel ${className}`.trim()}>
      <div className="destination-panel-search">
        <Search size={20} />
        <input value={query} placeholder={placeholder} onChange={(event) => setQuery(event.target.value)} />
        <a className={query.trim() ? "destination-panel-action active" : "destination-panel-action"} href={editorHref(query)}>
          开始
        </a>
      </div>

      <div className="destination-panel-results">
        {isSearching ? <span className="destination-panel-note">正在查找可信匹配...</span> : null}
        {message ? <span className="destination-panel-note">{message}</span> : null}

        {candidates.map((candidate) => (
          <a key={`${candidate.fullName}-${candidate.latitude}-${candidate.longitude}`} className="destination-result-card" href={editorHref(candidate.fullName)}>
            <MapPin size={17} />
            <span>
              <strong>{candidate.name}</strong>
              <small>{candidate.fullName}{candidate.timezone ? ` · ${candidate.timezone}` : ""}</small>
            </span>
            <ArrowRight size={16} />
          </a>
        ))}

        {candidates.length === 0 && !isSearching ? (
          <div className="destination-quick-grid">
            {quickSuggestions.map((city) => (
              <a key={city} href={editorHref(city)}>{city}</a>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export { editorHref };
