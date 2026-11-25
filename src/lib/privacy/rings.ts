import {
  createKeyPairSignerFromPrivateKeyBytes,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  signTransactionWithSigners,
  type KeyPairSigner,
  type Signature,
  type Transaction,
} from "@solana/kit";
import type { Keypair } from "@solana/web3.js";
import type { Bytes32 } from "@heliuslabs/spr";
import type { SprClient } from "@heliuslabs/spr/client";

const RINGS_HOSTS = {
  "mainnet.helius-rpc.com": "mainnet",
  "devnet.helius-rpc.com": "devnet",
} as const;

type RingsNetwork = (typeof RINGS_HOSTS)[keyof typeof RINGS_HOSTS];

let poseidon: Promise<void> | undefined;

/** Helius RPC root for Rings. A `/v1/spr/...` method URL is accepted and stripped. */
export function ringsSolanaRpcUrl(configured: string): {
  url: string;
  network: RingsNetwork;
} {
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("HELIUS_PRIVACY_URL is not a valid URL.");
  }
  if (!(url.hostname in RINGS_HOSTS)) {
    throw new Error(
      "HELIUS_PRIVACY_URL must be the Helius mainnet or devnet RPC URL. Volume does not fall back to a public transfer.",
    );
  }
  url.pathname = "/";
  url.hash = "";
  return {
    url: url.toString(),
    network: RINGS_HOSTS[url.hostname as keyof typeof RINGS_HOSTS],
  };
}

function ringsUrl(): { url: string; network: RingsNetwork } {
  const configured =
    process.env.HELIUS_PRIVACY_URL?.trim() || process.env.SOLANA_RPC?.trim();
  if (!configured) {
    throw new Error(
      "Privacy Rings need a Helius RPC URL. Set HELIUS_PRIVACY_URL.",
    );
  }
  return ringsSolanaRpcUrl(configured);
}

async function openClient(): Promise<SprClient> {
  const { url, network } = ringsUrl();
  const spr = await import("@heliuslabs/spr");
  const { SignedTeePolicy } = await import("@heliuslabs/spr/client");
  poseidon ??= spr.initializePoseidon();
  await poseidon;
  return spr.createSprClient({
    solanaRpcUrl: url,
    proverTee: SignedTeePolicy.forNetwork(network),
  });
}

async function ownerOf(keypair: Keypair) {
  const spr = await import("@heliuslabs/spr");
  const seed = Uint8Array.from(keypair.secretKey.subarray(0, 32));
  try {
    const signer = await createKeyPairSignerFromPrivateKeyBytes(seed);
    const shielded = spr.ShieldedKeypair.fromKeypair(
      spr.SigningKey.fromEd25519Bytes(seed as Bytes32),
    );
    return { signer, shielded };
  } finally {
    seed.fill(0);
  }
}

async function submit(
  client: SprClient,
  transaction: Transaction,
  signers: readonly KeyPairSigner[],
): Promise<Signature> {
  const signed = await signTransactionWithSigners([...signers], transaction);
  const wire = getBase64EncodedWireTransaction(signed);
  await client.solanaRpc
    .sendTransaction(wire, { encoding: "base64", preflightCommitment: "confirmed" })
    .send();
  const signature = getSignatureFromTransaction(signed);
  await client.confirmTransaction(signature);
  return signature;
}

/**
 * Move `lamports` from `from`'s public balance into `to`'s public balance.
 * The deposit and the withdrawal show the amount. The transfer between the
 * two shielded balances does not. There is no public-transfer fallback.
 */
export async function fundThroughRings(input: {
  from: Keypair;
  to: Keypair;
  lamports: bigint;
}): Promise<string> {
  if (input.lamports <= BigInt(0)) {
    throw new Error("A Rings transfer needs a positive lamport amount.");
  }
  ringsUrl();
  const spr = await import("@heliuslabs/spr");
  const client = await openClient();
  const sender = await ownerOf(input.from);
  const recipient = await ownerOf(input.to);
  const senderWallet = new spr.Wallet({ identity: sender.shielded.shieldedAddress() });
  const senderKeys = spr.LocalKeys.fromKeypair(sender.shielded, client.proofService);
  const recipientWallet = new spr.Wallet({
    identity: recipient.shielded.shieldedAddress(),
  });
  const recipientKeys = spr.LocalKeys.fromKeypair(
    recipient.shielded,
    client.proofService,
  );

  const senderRecord = await spr.buildRegistrationTransaction({
    client,
    owner: sender.signer.address,
    address: sender.shielded.shieldedAddress(),
  });
  if (senderRecord) await submit(client, senderRecord, [sender.signer]);

  const recipientRecord = await spr.buildRegistrationTransaction({
    client,
    owner: recipient.signer.address,
    address: recipient.shielded.shieldedAddress(),
    payer: sender.signer.address,
  });
  if (recipientRecord) {
    await submit(client, recipientRecord, [sender.signer, recipient.signer]);
  }

  await spr.syncWallet({ client, wallet: senderWallet, keys: senderKeys });
  const deposit = await spr.buildDepositTransaction({
    client,
    feePayer: sender.signer.address,
    recipient: sender.shielded.shieldedAddress(),
    amount: input.lamports,
  });
  const deposited = await submit(client, deposit, [sender.signer]);
  const depositSlot = await client.confirmTransaction(deposited);
  await spr.syncWallet({
    client,
    wallet: senderWallet,
    keys: senderKeys,
    config: { requireSlot: depositSlot },
  });

  const transfer = await spr.buildTransferTransaction({
    client,
    wallet: senderWallet,
    keys: senderKeys,
    feePayer: sender.signer.address,
    recipient: recipient.signer.address,
    amount: input.lamports,
  });
  const transferred = await submit(client, transfer, [sender.signer]);
  const transferSlot = await client.confirmTransaction(transferred);
  await spr.syncWallet({
    client,
    wallet: recipientWallet,
    keys: recipientKeys,
    config: { requireSlot: transferSlot },
  });

  const withdrawal = await spr.buildWithdrawalTransaction({
    client,
    wallet: recipientWallet,
    keys: recipientKeys,
    feePayer: sender.signer.address,
    recipient: recipient.signer.address,
    amount: input.lamports,
  });
  const withdrawn = await submit(client, withdrawal, [
    sender.signer,
    recipient.signer,
  ]);
  return withdrawn;
}
