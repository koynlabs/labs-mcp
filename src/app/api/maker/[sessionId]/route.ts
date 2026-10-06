import { activateSession, approvalMessage, publicView, saveSession } from "@/lib/maker/session";
import { startMakerRun } from "@/lib/mcp/tools";
import { getSession } from "@/lib/store";
import { Keypair } from "@solana/web3.js";

export const maxDuration = 60;

/**
 * The approval page reads the session and the exact text the maker will sign.
 * A freshly generated session public key is passed in so the message shown is
 * the message that gets signed.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const session = await getSession(sessionId);
  if (!session) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const proposed =
    new URL(request.url).searchParams.get("sessionPublicKey") ??
    Keypair.generate().publicKey.toBase58();

  return Response.json({
    ...publicView(session),
    feeSol: session.feeSol,
    approvalMessage: approvalMessage(session, proposed),
  });
}

/**
 * Activates the session: verifies the maker's approval over the exact caps,
 * stores the quoting key encrypted, then starts the durable quote loop.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  let body: {
    sessionPublicKey?: string;
    sessionSecretKey?: string;
    approvalSignature?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const { sessionPublicKey, sessionSecretKey, approvalSignature } = body;
  if (!sessionPublicKey || !sessionSecretKey || !approvalSignature) {
    return Response.json(
      {
        error:
          "sessionPublicKey, sessionSecretKey and approvalSignature are all required",
      },
      { status: 400 },
    );
  }

  try {
    const session = await activateSession({
      id: sessionId,
      sessionPublicKey,
      sessionSecretKey,
      approvalSignature,
    });

    try {
      session.runId = await startMakerRun(sessionId);
    } catch (error) {
      session.error = `session approved but the quoter did not start: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
    await saveSession(session);

    return Response.json(publicView(session));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
