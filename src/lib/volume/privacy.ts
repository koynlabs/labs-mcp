import type { Keypair } from "@solana/web3.js";
import { fundThroughRings } from "../privacy/rings";

/** Move SOL through Privacy Rings. Never sends a public transfer. */
export async function transferPrivate(input: {
  from: Keypair;
  to: Keypair;
  lamports: bigint;
}): Promise<string> {
  return fundThroughRings(input);
}
