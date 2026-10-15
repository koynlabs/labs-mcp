import { bundleView, refreshForSigning } from "@/lib/launch/bundle";

export const maxDuration = 60;

/**
 * Fresh blockhash and a simulation of the transactions the wallet is about to
 * sign. Called when the signer clicks, not when the page loads, so the hash
 * is still valid when Phantom simulates and when Jito receives the bundle.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ bundleId: string }> },
) {
  const { bundleId } = await params;
  try {
    const { bundle, reset } = await refreshForSigning(bundleId);
    return Response.json({
      ...bundleView(bundle),
      reset,
      simulated: bundle.venue === "pump",
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
