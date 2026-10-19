import { rejectXHttp } from "@/lib/x/api-key";
import { XError } from "@/lib/x/config";
import { appendStage } from "@/lib/x/stage";
import { xStore } from "@/lib/x/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = rejectXHttp(request.headers.get("authorization"));
  if (denied) return denied;
  try {
    const { id } = await params;
    const index = Number(request.headers.get("x-segment-index"));
    const bytes = Buffer.from(await request.arrayBuffer());
    const stage = await appendStage(xStore, id, index, bytes);
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
