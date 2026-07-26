import { ProductNav } from "../ProductNav";
import { DashboardClient } from "../DashboardClient";

export const metadata = {
  title: "控制台 - 随身路书"
};

export default function DashboardPage() {
  return (
    <main className="app-shell">
      <ProductNav active="dashboard" />
      <DashboardClient />
    </main>
  );
}
