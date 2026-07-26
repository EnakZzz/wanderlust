import { ProductNav } from "../ProductNav";
import { JourneysClient } from "../JourneysClient";

export const metadata = {
  title: "我的路书 - 随身路书"
};

export default function JourneysPage() {
  return (
    <main className="app-shell">
      <ProductNav active="journeys" />
      <JourneysClient />
    </main>
  );
}
