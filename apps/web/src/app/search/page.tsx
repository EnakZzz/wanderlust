import { ProductNav } from "../ProductNav";
import { SearchClient } from "../SearchClient";

export const metadata = {
  title: "目的地搜索 - 随身路书"
};

export default function SearchPage() {
  return (
    <main className="app-shell">
      <ProductNav active="search" />
      <SearchClient />
    </main>
  );
}
