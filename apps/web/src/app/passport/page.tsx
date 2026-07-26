import { ProductNav } from "../ProductNav";
import { PassportClient } from "../PassportClient";

export const metadata = {
  title: "旅行足迹 - 随身路书"
};

export default function PassportPage() {
  return (
    <main className="app-shell">
      <ProductNav active="passport" />
      <PassportClient />
    </main>
  );
}
