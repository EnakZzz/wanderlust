"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MotionSection } from "@/components/MotionShell";
import { DestinationSearchPanel } from "./DestinationSearchPanel";

export function SearchClient() {
  return (
    <MotionSection className="search-shell">
      <div className="search-heading">
        <div>
          <p className="eyebrow">目的地搜索</p>
          <h1>先确定一个城市，再把它变成可执行路书。</h1>
          <p>
            搜索可信的目的地候选，选择最匹配的位置，然后带着目的地信息进入路书编辑器。
          </p>
        </div>
        <Button asChild>
          <a href="/#editor"><Search size={18} /><span>打开编辑器</span></a>
        </Button>
      </div>

      <DestinationSearchPanel
        className="search-page-panel"
        placeholder="试试京都、里斯本、首尔或墨西哥城..."
        suggestions={["京都", "里斯本", "首尔", "墨西哥城", "曼谷", "巴黎"]}
      />
    </MotionSection>
  );
}
