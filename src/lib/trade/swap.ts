import { JUPITER_SWAP } from "../config";
import { JupiterError, asRecord, errorMessage, jupiter, jupiterHeaders, str, upstreamStatus } from "./http";

export async function buildSwap(input: {
  inputMint: string;
  outputMint: string;
  amount: string;
  taker: string;
}): Promise<{ requestId: string; transaction: string; outAmount: string }> {
  const url = new URL(`${JUPITER_SWAP}/order`);
  url.searchParams.set("inputMint", input.inputMint);
  url.searchParams.set("outputMint", input.outputMint);
  url.searchParams.set("amount", input.amount);
  url.searchParams.set("taker", input.taker);
  const body = asRecord(await jupiter(url.toString()));
  const transaction = str(body?.transaction);
  const outAmount = str(body?.outAmount);
  if (!transaction || !outAmount) {
    throw new JupiterError(errorMessage(body, "Jupiter could not build this swap"), 400);
  }
  return { requestId: str(body?.requestId) ?? "", transaction, outAmount };
}

export async function submitSwap(input: {
  signedTransaction: string;
  requestId: string;
}): Promise<{ signature: string | null; outputAmount: string | null }> {
  const res = await fetch(`${JUPITER_SWAP}/execute`, {
    method: "POST",
    headers: jupiterHeaders(true),
    cache: "no-store",
    body: JSON.stringify(input),
  });
  const body = asRecord(await res.json().catch(() => null));
  if (!res.ok || body?.status === "Failed") {
    throw new JupiterError(
      errorMessage(body, `Jupiter execute failed (${res.status})`),
      upstreamStatus(res.status),
    );
  }
  if (body?.status !== "Success") {
    throw new JupiterError(errorMessage(body, "Jupiter did not confirm the swap"), 502);
  }
  return {
    signature: str(body.signature),
    outputAmount: str(body.outputAmountResult),
  };
}
