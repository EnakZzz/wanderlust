import {
  Crown,
  Plane,
  Share2,
  Ticket
} from "lucide-react";
import { AuthPanel } from "./AuthPanel";
import { RoutebookEditor } from "./RoutebookEditor";

export default function HomePage() {
  return (
    <main>
      <section className="hero-shell">
        <div className="hero-image" />
        <nav className="topbar" aria-label="Primary">
          <div className="brand"><Plane size={18} /> Wanderlust</div>
          <div className="nav-actions">
            <a href="#editor">Plans</a>
            <a href="#mobile">Mobile</a>
            <a href="#billing">Pro</a>
          </div>
          <AuthPanel />
        </nav>
        <div className="hero-copy">
          <p className="eyebrow">Web planner + offline travel app</p>
          <h1>Your travel plans, ready on the road</h1>
          <p>
            Build each trip as a routebook before departure, then carry the same plan, tickets, places, and checklists on mobile while traveling.
          </p>
          <div className="hero-buttons">
            <a className="primary" href="#editor">View plans</a>
            <a className="secondary" href="#mobile">See mobile mode</a>
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
