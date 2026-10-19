import { clientAddress, allow } from "@/lib/rate-limit";
import { rejectXHttp } from "@/lib/x/api-key";
import { XError } from "@/lib/x/config";
import { STAGE_CHUNK_BYTES } from "@/lib/x/constants";
import { stageBytes, startStage } from "@/lib/x/stage";
import { xStore } from "@/lib/x/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : "Upload failed.";
  const status = error instanceof XError ? 400 : 500;
  return Response.json({ error: status === 400 ? message : "Upload failed." }, { status });
}

/**
 * A whole file, or the start of a chunked upload.
 * Files over about 4MB should be chunked: the host request body is smaller
 * than a 20MB MP4. PUT each segment to /api/x/media/:stageId, then POST finish.
 */
export async function POST(request: Request) {
  const denied = rejectXHttp(request.headers.get("authorization"));
  if (denied) return denied;
  try {
    if (!(await allow(`x-media:${clientAddress(request)}`, 30, 600))) {
      return Response.json({ error: "Too many uploads. Wait a few minutes." }, { status: 429 });
    }
    const type = request.headers.get("content-type") ?? "";
    if (type.includes("application/json")) {
      const body = (await request.json()) as {
        filename?: string;
        contentType?: string;
        totalBytes?: number;
      };
      const stage = await startStage(xStore, {
        filename: body.filename ?? "upload",
        contentType: body.contentType ?? "application/octet-stream",
        totalBytes: Number(body.totalBytes),
      });
      return Response.json({
        stageId: stage.id,
        maxChunkBytes: STAGE_CHUNK_BYTES,
        received: stage.received,
        totalBytes: stage.totalBytes,
      });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Send the file as multipart field 'file'." }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const upload = await stageBytes(xStore, bytes, file.name, file.type);
    return Response.json({
      uploadId: upload.id,
      kind: upload.kind,
      mime: upload.mime,
      bytes: upload.bytes,
    });
  } catch (error) {
    return fail(error);
  }
}
