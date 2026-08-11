import type { ItineraryItem } from "@wanderlust/domain";

export type TravelVisual = {
  image: string;
  color: string;
};

export type DestinationTheme = {
  keywords: string[];
  accent: string;
  ink: string;
  wash: string;
  line: string;
  glow: string;
  image: string;
};

export const itineraryTypeVisuals: Record<ItineraryItem["type"], TravelVisual> = {
  place: { image: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80", color: "#6f7b66" },
  food: { image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80", color: "#8b735b" },
  hotel: { image: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=900&q=80", color: "#617986" },
  transport: { image: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=900&q=80", color: "#4f6f7f" },
  activity: { image: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=900&q=80", color: "#7b6f58" },
  note: { image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80", color: "#726b63" },
  booking: { image: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=900&q=80", color: "#8a6f59" }
};

export const destinationThemes = [
  {
    keywords: ["kyoto", "京都", "japan", "日本", "tokyo", "东京", "大阪", "osaka"],
    accent: "#cf7483",
    ink: "#8f4f5e",
    wash: "#fff5f7",
    line: "#f3d4da",
    glow: "rgba(207, 116, 131, 0.2)",
    image: "https://images.unsplash.com/photo-1522383225653-ed111181a951?auto=format&fit=crop&w=1600&q=80"
  },
  {
    keywords: ["sea", "island", "beach", "bali", "maldives", "海", "岛", "巴厘", "马尔代夫", "红海"],
    accent: "#3f95a3",
    ink: "#2e6f7b",
    wash: "#eefbfb",
    line: "#c6e7e8",
    glow: "rgba(63, 149, 163, 0.2)",
    image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80"
  },
  {
    keywords: ["egypt", "cairo", "desert", "埃及", "开罗", "沙漠", "摩洛哥", "morocco"],
    accent: "#bd7a45",
    ink: "#8a5636",
    wash: "#fff6ec",
    line: "#ecd2b8",
    glow: "rgba(189, 122, 69, 0.2)",
    image: "https://images.unsplash.com/photo-1503177119275-0aa32b3a9368?auto=format&fit=crop&w=1600&q=80"
  },
  {
    keywords: ["forest", "mountain", "swiss", "alps", "森林", "山", "瑞士", "阿尔卑斯"],
    accent: "#66845c",
    ink: "#4d6846",
    wash: "#f3f9ef",
    line: "#d5e5cf",
    glow: "rgba(102, 132, 92, 0.2)",
    image: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1600&q=80"
  }
] satisfies DestinationTheme[];

export const defaultDestinationTheme = {
  accent: "#8b735b",
  ink: "#6f5d49",
  wash: "#fbf7ef",
  line: "#e7dccd",
  glow: "rgba(139, 115, 91, 0.18)",
  image: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1600&q=80"
} satisfies Omit<DestinationTheme, "keywords">;

export const discoveryCards = [
  { eyebrow: "茶、寺与庭园", title: "京都", copy: "围绕茶、庭园和建筑，做一条慢节奏路线。", image: destinationThemes[0].image },
  { eyebrow: "第一次去也稳", title: "里斯本", copy: "电车、观景台、海鲜和一日游都很紧凑。", image: "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=1200&q=80" },
  { eyebrow: "城市充电", title: "首尔", copy: "街区跳转、深夜小吃、快速交通和山边散步。", image: "https://images.unsplash.com/photo-1538485399081-7c8ed83d3d5c?auto=format&fit=crop&w=1200&q=80" }
];

export const heroVisuals = {
  home: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=2200&q=80",
  share: defaultDestinationTheme.image
};

export function getDestinationTheme(destination: string): DestinationTheme | Omit<DestinationTheme, "keywords"> {
  const normalized = destination.toLowerCase();
  return destinationThemes.find((theme) => theme.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) ?? defaultDestinationTheme;
}

export function getItineraryTypeVisual(type: ItineraryItem["type"] | string): TravelVisual {
  return itineraryTypeVisuals[type as ItineraryItem["type"]] ?? itineraryTypeVisuals.activity;
}
