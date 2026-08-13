import { Github, LayoutDashboard, MapPinned, Plane, Route, Search, Sparkles } from "lucide-react";
import { productBrand } from "@wanderlust/domain";

type HomeNavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

const navItems: HomeNavItem[] = [
  { href: "/dashboard", label: "控制台", icon: LayoutDashboard },
  { href: "/journeys", label: "路书", icon: Route },
  { href: "/passport", label: "足迹", icon: MapPinned },
  { href: "/search", label: "搜索", icon: Search },
  { href: "/?ai=1#editor", label: "AI", icon: Sparkles }
];

export function HomeNav() {
  return (
    <nav className="product-nav product-nav-dark" aria-label="主导航">
      <a className="product-nav-brand" href="/" aria-label="返回首页">
        <Plane size={18} />
        <span>{productBrand.shortName}</span>
      </a>

      <div className="product-nav-links product-nav-icon-links">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <a key={item.label} href={item.href} aria-label={item.label}>
              <Icon size={16} />
              <span>{item.label}</span>
            </a>
          );
        })}
      </div>

      <div className="product-nav-actions">
        <a
          className="product-nav-icon-button"
          href="https://github.com/EnakZzz/wanderlust"
          target="_blank"
          rel="noreferrer"
          aria-label="打开 Wanderlust GitHub 仓库"
        >
          <Github size={16} />
        </a>
      </div>
    </nav>
  );
}
