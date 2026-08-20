import { PageHeader } from "@/components/layout/page-header";
import { SCENARIOS } from "@/lib/simulator/scenarios";
import { SimulatorConsole } from "@/components/security/simulator-console";
import { Card, CardContent } from "@/components/ui/card";
import { FlaskConical } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Attack Simulator" };

export default function SimulatorPage() {
  return (
    <>
      <PageHeader
        title="AI Security Attack Simulator"
        description="Validate the defensive controls against real attacks. Each scenario runs through the production pipeline — the same analyze() call that serves live traffic."
      />

      <Card className="mb-4 border-brand/25 bg-brand-dim/10">
        <CardContent className="flex gap-3">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-brand" />
          <div>
            <p className="text-xs font-semibold text-brand">These are real runs, not replays</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-2">
              Nothing on this page is scripted. Detections, risk scores and decisions are whatever
              the engine actually concludes, and each run is recorded as a genuine security event —
              investigable in the monitor and counted in analytics. When a scenario&apos;s outcome
              falls short of what it asserts the platform should do, it is reported as a control
              gap rather than quietly passed.
            </p>
          </div>
        </CardContent>
      </Card>

      <SimulatorConsole scenarios={SCENARIOS} />
    </>
  );
}
