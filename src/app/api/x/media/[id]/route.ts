import { XError } from "@/lib/x/config";
import { authorizeXRequest } from "@/lib/x/oauth";
import { appendStage } from "@/lib/x/stage";
import { xStore } from "@/lib/x/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeXRequest(xStore, request.headers.get("authorization"));
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const index = Number(request.headers.get("x-segment-index"));
    const bytes = Buffer.from(await request.arrayBuffer());
    const stage = await appendStage(xStore, auth.account.userId, id, index, bytes);
    return Response.json({
      stageId: stage.id,
      received: stage.received,
      nextIndex: stage.nextIndex,
      totalBytes: stage.totalBytes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    const status = error instanceof XError ? 400 : 500;
    return Response.json({ error: status === 400 ? message : "Upload failed." }, { status });
  }
}
