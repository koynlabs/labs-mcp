import {
  AddressLookupTableAccount,
  TransactionMessage,
  VersionedTransaction,
  type MessageV0,
} from "@solana/web3.js";
import { connection } from "../solana";

/**
 * Loads the lookup tables a stored transaction names. Rebuilding the message
 * without them pulls every account back into the static keys and the
 * transaction no longer fits.
 */
export async function loadLookups(
  tx: VersionedTransaction,
): Promise<AddressLookupTableAccount[]> {
  if (tx.message.version !== 0 || tx.message.addressTableLookups.length === 0) {
    return [];
  }
  const tables: AddressLookupTableAccount[] = [];
  for (const lookup of tx.message.addressTableLookups) {
    const loaded = await connection().getAddressLookupTable(lookup.accountKey);
    if (!loaded.value) {
      throw new Error(
        `address lookup table ${lookup.accountKey.toBase58()} was not found`,
      );
    }
    tables.push(loaded.value);
  }
  return tables;
}

/**
 * New blockhash, same instructions, no signatures. The wallet has to sign
 * this message; anything already signed would be invalid, and Phantom will
 * not simulate a transaction that arrives pre-signed.
 */
export function rewriteBlockhash(
  tx: VersionedTransaction,
  blockhash: string,
  tables: AddressLookupTableAccount[],
): VersionedTransaction {
  if (tx.message.version !== 0) {
    throw new Error("launch transactions are versioned");
  }
  const decompiled = TransactionMessage.decompile(tx.message as MessageV0, {
    addressLookupTableAccounts: tables,
  });
  return new VersionedTransaction(
    new TransactionMessage({
      payerKey: decompiled.payerKey,
      recentBlockhash: blockhash,
      instructions: decompiled.instructions,
    }).compileToV0Message(tables),
  );
}
