"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchDestinations } from "@/lib/web-api";

type DestinationSearchPanelProps = {
  className?: string;
  placeholder?: string;
  suggestions?: string[];
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
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const normalizedQuery = query.trim();
  const canSearch = debouncedQuery.length >= 2;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(normalizedQuery);
    }, 220);

    return () => {
      window.clearTimeout(timer);
    };
  }, [normalizedQuery]);

  const destinationQuery = useQuery({
    queryKey: ["destination-search", debouncedQuery],
    queryFn: ({ signal }) => searchDestinations(debouncedQuery, signal),
    enabled: canSearch
  });

  const candidates = canSearch ? destinationQuery.data?.candidates ?? [] : [];
  const isSearching = canSearch && destinationQuery.isFetching;
  const message = !canSearch
    ? null
    : destinationQuery.error instanceof Error
      ? destinationQuery.error.message
      : destinationQuery.data?.providerError
        ? "地图服务尚未配置，正在使用本地目的地建议。"
        : null;

  const quickSuggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return suggestions;
    return suggestions.filter((item) => item.toLowerCase().includes(normalized)).slice(0, 4);
  }, [query, suggestions]);

  return (
    <div className={`destination-panel ${className}`.trim()}>
      <div className="destination-panel-search">
        <Search size={20} />
        <Input value={query} placeholder={placeholder} onChange={(event) => setQuery(event.target.value)} />
        <Button asChild size="icon" variant={query.trim() ? "default" : "secondary"} className="destination-panel-action">
          <a href={editorHref(query)} aria-label="开始规划">
            <ArrowRight size={17} />
          </a>
        </Button>
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
            <span className="destination-result-action" aria-hidden="true">
              <ArrowRight size={16} />
            </span>
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
