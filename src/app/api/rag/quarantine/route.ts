import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api/respond";
import { requireApiUser } from "@/lib/rbac/session";
import { assertCan } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";

/** Quarantine or release a document (§11). Both directions are audited. */
export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    assertCan(user.role, "documents:quarantine");

    const { documentId, quarantined } = (await request.json()) as {
      documentId: string;
      quarantined: boolean;
    };

    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const store = quarantined ? null : await prisma.vectorStore.findFirst();

    await prisma.document.update({
      where: { id: documentId },
      data: {
        quarantined,
        quarantinedAt: quarantined ? new Date() : null,
        quarantineReason: quarantined
          ? `Quarantined manually by ${user.name}.`
          : null,
        // Releasing re-indexes; quarantining removes the document from its store
        // so retrieval cannot reach it even if the gateway check were bypassed.
        vectorStoreId: quarantined ? null : document.vectorStoreId ?? store?.id ?? null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: quarantined ? "document.quarantine" : "document.release",
        category: "DOCUMENT",
        targetType: "Document",
        targetId: documentId,
        targetLabel: document.title,
        description: quarantined
          ? `Quarantined "${document.title}". Withheld from all retrieval.`
          : `Released "${document.title}" from quarantine. Available to retrieval again.`,
        outcome: "SUCCESS",
      },
    });

    return NextResponse.json({ quarantined });
  } catch (error) {
    return apiError(error, "Update failed");
  }
}
