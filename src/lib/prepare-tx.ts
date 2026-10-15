import {
  AddressLookupTableAccount,
  PublicKey,
  VersionedTransaction,
  type MessageV0,
} from "@solana/web3.js";

/**
 * Phantom signs first. A mint signature that is already filled makes Phantom
 * keep the embedded blockhash, and an expired hash is reported as a failed
 * simulation. https://docs.phantom.com/developer-powertools/domain-and-transaction-warnings
 */
export function assertUnsignedForWallet(tx: VersionedTransaction): void {
  if (tx.signatures.some((signature) => signature.some((byte) => byte !== 0))) {
    throw new Error(
      "This transaction already has a signature. Phantom has to sign it first, or it cannot simulate the result.",
    );
  }
  if (!tx.message.staticAccountKeys[0]) {
    throw new Error("This transaction has no fee payer.");
  }
}

type LookupResponse = {
  tables?: { key: string; data: string }[];
  error?: string;
};

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Lets Phantom call `getAccountKeys()` with no arguments. On a v0 message that
 * throws until the lookup tables are loaded, and Phantom then blocks the
 * request because it cannot see the accounts. The compiled bytes are left
 * alone. Phantom may still rewrite the blockhash and append Lighthouse
 * assertions inside `signTransaction`; the server accepts only that difference.
 */
export function attachLookupTables(
  tx: VersionedTransaction,
  accounts: AddressLookupTableAccount[],
): void {
  if (tx.message.version !== 0 || tx.message.addressTableLookups.length === 0) {
    return;
  }
  const message = tx.message as MessageV0;
  const original = message.getAccountKeys.bind(message);
  message.getAccountKeys = (args) => {
    if (
      args &&
      ("accountKeysFromLookups" in args || "addressLookupTableAccounts" in args)
    ) {
      return original(args);
    }
    return original({ addressLookupTableAccounts: accounts });
  };
  message.getAccountKeys();
}

/**
 * Phantom calls `getAccountKeys()` with no arguments. On a v0 message that
 * throws unless the lookup tables are already in hand, and Phantom then blocks
 * the request because it cannot see the accounts.
 */
export async function prepareForSigning(
  tx: VersionedTransaction,
): Promise<VersionedTransaction> {
  if (tx.message.version !== 0 || tx.message.addressTableLookups.length === 0) {
    return tx;
  }

  const message = tx.message as MessageV0;
  const keys = [
    ...new Set(
      message.addressTableLookups.map((lookup) => lookup.accountKey.toBase58()),
    ),
  ];

  const response = await fetch("/api/address-tables", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keys }),
  });
  const body = (await response.json()) as LookupResponse;
  if (!response.ok) {
    throw new Error(body.error ?? "could not load address lookup tables");
  }

  const byKey = new Map(
    (body.tables ?? []).map((table) => [table.key, table.data]),
  );
  const accounts = keys.map((key) => {
    const data = byKey.get(key);
    if (!data) throw new Error(`address lookup table ${key} was not found`);
    return new AddressLookupTableAccount({
      key: new PublicKey(key),
      state: AddressLookupTableAccount.deserialize(fromBase64(data)),
    });
  });

  attachLookupTables(tx, accounts);
  return tx;
}
