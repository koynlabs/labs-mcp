import { rejectXHttp } from "@/lib/x/api-key";
import { XError } from "@/lib/x/config";
import { finishStage } from "@/lib/x/stage";
import { xStore } from "@/lib/x/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = rejectXHttp(request.headers.get("authorization"));
  if (denied) return denied;
  try {
    const { id } = await params;
    const upload = await finishStage(xStore, id);
    return Response.json({
      uploadId: upload.id,
      kind: upload.kind,
      mime: upload.mime,
      bytes: upload.bytes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    const status = error instanceof XError ? 400 : 500;
    return Response.json({ error: status === 400 ? message : "Upload failed." }, { status });
  }
}
