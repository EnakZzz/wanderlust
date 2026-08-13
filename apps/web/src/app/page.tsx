import { Plane } from "lucide-react";
import { productBrand } from "@wanderlust/domain";
import { TravelImage } from "@/components/TravelImage";
import { Button } from "@/components/ui/button";
import { heroVisuals } from "@/lib/travel-visuals";
import { HomeEditorShell } from "./HomeEditorShell";
import { HomeNav } from "./HomeNav";

export default function HomePage() {
  return (
    <main>
      <section className="hero-shell">
        <TravelImage src={heroVisuals.home} alt="" className="hero-image" overlayClassName="hero-image-overlay" sizes="100vw" />
        <HomeNav />
        <div className="hero-copy">
          <p className="eyebrow">离线优先的旅行路书</p>
          <h1>{productBrand.name}</h1>
          <p>
            {productBrand.description}
          </p>
          <div className="hero-buttons">
            <Button asChild size="lg" className="hero-action-primary">
              <a href="/dashboard">打开控制台</a>
            </Button>
            <Button asChild size="lg" variant="secondary" className="hero-action-secondary">
              <a href="#editor"><Plane size={17} /> 直接编辑路书</a>
            </Button>
          </div>
        </div>
      </section>

      <HomeEditorShell />
    </main>
  );
}
