import {
  Crown,
  Plane,
  Share2,
  Ticket
} from "lucide-react";
import { buildMapsUrl } from "@wanderlust/domain";
import { AuthPanel } from "./AuthPanel";
import { RoutebookEditor } from "./RoutebookEditor";

const navUrl = buildMapsUrl({ latitude: 34.9671, longitude: 135.7727, label: "Fushimi Inari" }, "google");

export default function HomePage() {
  return (
    <main>
      <section className="hero-shell">
        <div className="hero-image" />
        <nav className="topbar" aria-label="Primary">
          <div className="brand"><Plane size={18} /> Wanderlust</div>
          <div className="nav-actions">
            <a href="#editor">Editor</a>
            <a href="#mobile">Mobile</a>
            <a href="#billing">Pro</a>
          </div>
          <AuthPanel />
        </nav>
        <div className="hero-copy">
          <p className="eyebrow">Web planner + offline travel app</p>
          <h1>Kyoto Autumn Routebook</h1>
          <p>
            Turn research into a structured routebook before departure, then use the exact plan offline from iOS and Android.
          </p>
          <div className="hero-buttons">
            <a className="primary" href="#editor">Open web editor</a>
            <a className="secondary" href={navUrl}>Preview navigation</a>
          </div>
        </div>
      </section>

      <RoutebookEditor />

      <section id="mobile" className="mobile-band">
        <div>
          <p className="eyebrow">Travel mode</p>
          <h2>Today-first mobile experience</h2>
          <p>
            The app opens to the current day, surfaces the next stop, and keeps tickets, hotel details, and notes available in airplane mode.
          </p>
        </div>
        <div className="phone-frame">
          <div className="phone-header">Today · Kyoto</div>
          <div className="next-stop">
            <span>08:00</span>
            <strong>Fushimi Inari</strong>
            <button type="button">Navigate</button>
          </div>
          <div className="ticket-row"><Ticket size={16} /> JR pass PDF cached</div>
          <div className="bottom-tabs">Today · Places · Map · Journal</div>
        </div>
      </section>

      <section id="billing" className="billing-band">
        <div>
          <Crown size={22} />
          <h2>Subscription-ready from day one</h2>
          <p>RevenueCat entitlements gate AI quota, collaborators, attachment storage, and offline trip count across App Store and Google Play.</p>
        </div>
        <button type="button"><Share2 size={17} /> Share routebook</button>
      </section>
    </main>
  );
}
