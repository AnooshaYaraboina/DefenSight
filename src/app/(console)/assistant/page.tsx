import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { isConfigured } from "@/lib/ai/provider";
import { AssistantConsole } from "@/components/assistant/assistant-console";
import { Card } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sentry" };

export default async function AssistantPage() {
  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col">
      <PageHeader
        title="Sentry"
        description="Ask about your security data, or hand over the job. Sentry reads freely and stops before anything that changes state."
        actions={
          <Tooltip content="Sentry receives a pre-computed, read-only snapshot rather than database access, and carries out approved actions through the same endpoints and permission checks a human uses. It has no private door into the platform.">
            <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-3">
              <ShieldCheck className="size-3.5 text-brand" />
              Reads freely · every write is gated
            </span>
          </Tooltip>
        }
      />

      <Card className="min-h-0 flex-1 overflow-hidden">
        <AssistantConsole configured={isConfigured()} variant="page" className="h-full" />
      </Card>
    </div>
  );
}
