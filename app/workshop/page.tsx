import { getWorkshopData } from "../../lib/workshop-aggregations.ts";
import { WorkshopDashboard } from "../../components/WorkshopDashboard.tsx";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workshop" };

export default function Workshop() {
  const data = getWorkshopData();
  return (
    <div className="px-6 py-6">
      <div className="mb-4">
        <h1 className="font-serif text-2xl text-coffee-900">Workshop</h1>
        <p className="text-sm text-slate-500">
          Cross-team analytics. Toggle teams, switch metrics, hover any chart for exact values. Bars and rows click through to team pages.
        </p>
      </div>
      <WorkshopDashboard data={data} />
    </div>
  );
}
