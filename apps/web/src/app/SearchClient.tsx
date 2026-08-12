"use client";

import { ArrowRight, MapPin, Route, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MotionSection } from "@/components/MotionShell";
import { DestinationSearchPanel } from "./DestinationSearchPanel";
import { editorHref } from "./DestinationSearchPanel";

const searchFlowSteps = [
  { icon: Search, title: "搜索城市", copy: "输入城市、区域或路线主题。" },
  { icon: MapPin, title: "确认地点", copy: "从可信候选里锁定目的地。" },
  { icon: Route, title: "生成路书", copy: "带着目的地进入编辑器继续规划。" }
];

const destinationBriefs = [
  { city: "京都", meta: "古寺 / 街区 / 慢节奏", tone: "枫叶与町屋路线" },
  { city: "里斯本", meta: "海岸 / 电车 / 日落", tone: "坡道城市周末" },
  { city: "首尔", meta: "美食 / 购物 / 夜景", tone: "高密度都市计划" }
];

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

      <section className="search-flow-strip" aria-label="目的地搜索流程">
        {searchFlowSteps.map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={step.title} className="search-flow-step">
              <span className="search-flow-index">{index + 1}</span>
              <Icon size={18} />
              <strong>{step.title}</strong>
              <small>{step.copy}</small>
            </div>
          );
        })}
      </section>

      <DestinationSearchPanel
        className="search-page-panel"
        placeholder="试试京都、里斯本、首尔或墨西哥城..."
        suggestions={["京都", "里斯本", "首尔", "墨西哥城", "曼谷", "巴黎"]}
      />

      <div className="search-inspiration-grid" aria-label="目的地灵感">
        {destinationBriefs.map((destination) => (
          <a key={destination.city} className="search-inspiration-card" href={editorHref(destination.city)}>
            <span><Sparkles size={16} /> {destination.meta}</span>
            <strong>{destination.city}</strong>
            <small>{destination.tone}</small>
            <em aria-hidden="true"><ArrowRight size={17} /></em>
          </a>
        ))}
      </div>
    </MotionSection>
  );
}
