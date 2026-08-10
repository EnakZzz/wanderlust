import { ProductNav } from "../../ProductNav";
import { RoutebookEditor } from "../../RoutebookEditor";

export const metadata = {
  title: "编辑路书 - 随身路书"
};

export default function JourneyEditPage() {
  return (
    <main className="app-shell">
      <ProductNav active="journeys" />
      <RoutebookEditor />
    </main>
  );
}
