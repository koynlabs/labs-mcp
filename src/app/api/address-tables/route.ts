import { AddressLookupTableProgram, PublicKey } from "@solana/web3.js";
import { connection, isPublicKey } from "@/lib/solana";

export const maxDuration = 30;

const MAX_TABLES = 16;

/**
 * Account data for the address lookup tables a v0 transaction names. The sign
 * page needs this before Phantom will simulate the transaction, and the RPC
 * stays on the server.
 */
export async function POST(request: Request) {
  let body: { keys?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const keys = body.keys;
  if (
    !Array.isArray(keys) ||
    keys.length === 0 ||
    keys.length > MAX_TABLES ||
    keys.some((key) => typeof key !== "string" || !isPublicKey(key))
  ) {
    return Response.json(
      { error: `keys must be 1 to ${MAX_TABLES} lookup table addresses` },
      { status: 400 },
    );
  }

  const unique = [...new Set(keys)];
  const infos = await connection().getMultipleAccountsInfo(
    unique.map((key) => new PublicKey(key)),
  );

  const missing = unique.filter((key, index) => {
    const info = infos[index];
    return !info?.owner.equals(AddressLookupTableProgram.programId);
  });
  if (missing.length > 0) {
    return Response.json(
      { error: `address lookup table not found: ${missing.join(", ")}` },
      { status: 404 },
    );
  }

  return Response.json({
    tables: unique.map((key, index) => ({
      key,
      data: Buffer.from(infos[index]!.data).toString("base64"),
    })),
  });
}
