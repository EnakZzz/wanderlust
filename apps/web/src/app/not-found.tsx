"use client";

import { useEffect } from "react";
import { Compass } from "lucide-react";
import { parseTripIdFromEditorPath } from "@wanderlust/domain";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  useEffect(() => {
    const tripId = parseTripIdFromEditorPath(window.location.pathname);
    if (tripId) {
      window.location.replace(`/journeys/edit?tripId=${encodeURIComponent(tripId)}#editor`);
    }
  }, []);

  return (
    <main className="not-found-shell">
      <Compass size={28} />
      <h1>这条路线暂时没有找到。</h1>
      <p>如果你打开的是路书编辑地址，页面会自动尝试切回编辑器。</p>
      <Button asChild>
        <a href="/journeys">返回路书</a>
      </Button>
    </main>
  );
}

