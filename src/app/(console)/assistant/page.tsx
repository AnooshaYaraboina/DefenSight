import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { isConfigured } from "@/lib/ai/provider";
import { AssistantChat } from "@/components/security/assistant-chat";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI Security Assistant" };

export default function AssistantPage() {
  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col">
      <PageHeader
        title="AI Security Assistant"
        description="Ask questions about your security data in plain language."
      />

      <Card className="mb-4 shrink-0 border-brand/20 bg-brand-dim/10">
        <CardContent className="flex gap-3 py-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" />
          <p className="text-[11px] leading-relaxed text-ink-2">
            The assistant is given a pre-computed, read-only snapshot rather than database access.
            An assistant that can query freely is an injection target, and this one is deliberately
            not one — it reports over recorded data and cannot take actions, change configuration,
            or make security decisions.
          </p>
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col p-4">
        <AssistantChat configured={isConfigured()} />
      </Card>
    </div>
  );
}
