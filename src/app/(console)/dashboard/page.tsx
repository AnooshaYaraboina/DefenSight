import { getWarRoom } from "@/lib/queries/warroom";
import { Wall } from "@/components/warroom/wall";

export const dynamic = "force-dynamic";
export const metadata = { title: "War Room" };

/**
 * No search params, no range switcher. A wall has one window: now.
 * Range selection lives on /analytics, which is built for it.
 */
export default async function DashboardPage() {
  const data = await getWarRoom();
  return <Wall data={data} />;
}
