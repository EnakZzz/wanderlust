import { Plane } from "lucide-react";
import { productBrand } from "@wanderlust/domain";
import { ProductNav } from "./ProductNav";
import { RoutebookEditor } from "./RoutebookEditor";

export default function HomePage() {
  return (
    <main>
      <section className="hero-shell">
        <div className="hero-image" />
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
      </section>

      <RoutebookEditor />
    </main>
  );
}
