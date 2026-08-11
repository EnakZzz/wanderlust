import { Plane } from "lucide-react";
import { productBrand } from "@wanderlust/domain";
import { MotionSection } from "@/components/MotionShell";
import { TravelImage } from "@/components/TravelImage";
import { heroVisuals } from "@/lib/travel-visuals";
import { ProductNav } from "./ProductNav";
import { RoutebookEditor } from "./RoutebookEditor";

export default function HomePage() {
  return (
    <main>
      <MotionSection className="hero-shell" transition={{ duration: 0.58, ease: [0.22, 1, 0.36, 1] }}>
        <TravelImage src={heroVisuals.home} alt="" className="hero-image" overlayClassName="hero-image-overlay" sizes="100vw" priority />
        <ProductNav tone="dark" active="home" />
        <div className="hero-copy">
          <p className="eyebrow">离线优先的旅行路书</p>
          <h1>{productBrand.name}</h1>
          <p>
            {productBrand.description}
          </p>
          <div className="hero-buttons">
            <a className="primary" href="/dashboard">打开控制台</a>
            <a className="secondary" href="#editor"><Plane size={17} /> 直接编辑路书</a>
          </div>
        </div>
      </MotionSection>

      <RoutebookEditor />
    </main>
  );
}
