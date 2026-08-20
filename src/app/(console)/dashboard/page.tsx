import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Security Overview"
        description="Posture across the AI estate. Populated in Phase 4."
      />
      <Card>
        <CardContent className="text-xs text-ink-3">
          Shell online. Detection engine lands in Phase 2.
        </CardContent>
      </Card>
    </>
  );
}
