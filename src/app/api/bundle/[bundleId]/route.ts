import { attachSignature, outstanding, submitLaunch } from "@/lib/launch/bundle";
import { getBundle } from "@/lib/store";

export const maxDuration = 60;

/** What the sign page needs: the exact transactions, and who still has to sign. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bundleId: string }> },
) {
  const { bundleId } = await params;
  const bundle = await getBundle(bundleId);
  if (!bundle) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  return Response.json({
    bundleId: bundle.id,
    status: bundle.status,
    venue: bundle.venue,
    mint: bundle.mint,
    name: bundle.name,
    symbol: bundle.symbol,
    feeSol: bundle.feeSol,
    feeWaiver: bundle.feeWaiver,
    treasury: bundle.treasury,
    jitoBundleId: bundle.jitoBundleId,
    error: bundle.error,
    txs: bundle.txs.map((tx) => ({
      index: tx.index,
      role: tx.role,
      signer: tx.signer,
      sol: tx.sol,
      tx: tx.tx,
      signed: Boolean(bundle.signed[String(tx.index)]),
    })),
  });
}

/**
 * Takes one signed transaction. Once nothing is outstanding the bundle is
 * submitted here, so the browser cannot choose to skip the fee by submitting
 * a subset itself.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ bundleId: string }> },
) {
  const { bundleId } = await params;

  let body: { index?: number; signedTx?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.index !== "number" || typeof body.signedTx !== "string") {
    return Response.json(
      { error: "index and signedTx are required" },
      { status: 400 },
    );
  }

  try {
    let bundle = await attachSignature(bundleId, body.index, body.signedTx);
    const remaining = outstanding(bundle);

    if (remaining.length === 0) {
      bundle = await submitLaunch(bundleId);
    }

    return Response.json({
      status: bundle.status,
      awaitingSignatureFrom: remaining.map((tx) => tx.signer),
      jitoBundleId: bundle.jitoBundleId,
      signatures: bundle.signatures,
      error: bundle.error,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
