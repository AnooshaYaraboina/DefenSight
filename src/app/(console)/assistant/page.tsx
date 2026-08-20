import { ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { trailingWindow } from "@/lib/queries/window";
import { PageHeader } from "@/components/layout/page-header";
import { isConfigured } from "@/lib/ai/provider";
import { AssistantChat } from "@/components/security/assistant-chat";
import { Card } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI Security Assistant" };

export default async function AssistantPage() {
  const [events, incidents, quarantined, approvals] = await Promise.all([
    prisma.securityEvent.count({ where: { createdAt: { gte: trailingWindow(1) } } }),
    prisma.incident.count({ where: { status: { in: ["OPEN", "INVESTIGATING"] } } }),
    prisma.document.count({ where: { quarantined: true } }),
    prisma.toolApproval.count({ where: { status: "PENDING" } }),
  ]);

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col">
      <PageHeader
        title="AI Security Assistant"
        description="Ask about your security data in plain language."
        actions={
          <Tooltip content="The assistant receives a pre-computed, read-only snapshot rather than database access. An assistant that can query freely is an injection target, and this one is deliberately not one.">
            <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-3">
              <ShieldCheck className="size-3.5 text-brand" />
              Read-only · cannot take actions
            </span>
          </Tooltip>
        }
      />

      <Card className="flex min-h-0 flex-1 flex-col p-5">
        <AssistantChat
          configured={isConfigured()}
          context={{ events, incidents, quarantined, approvals }}
        />
      </Card>
    </div>
  );
}
