import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type AddressLookupTableAccount,
  type MessageV0,
} from "@solana/web3.js";

/**
 * Phantom (and Solflare) append assertions from this program when a transaction
 * is signed on a public https origin. The signature then covers a longer
 * message than the one `/prepare` stored.
 * https://docs.phantom.com/developer-powertools/lighthouse
 */
export const LIGHTHOUSE_PROGRAM_ID = new PublicKey(
  "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95",
);

/** Phantom adds one assertion; Solflare adds two. Six is room, not an invitation. */
const MAX_WALLET_ASSERTIONS = 6;

export type WalletMessageDecision =
  | { ok: true; blockhash: string; blockhashChanged: boolean }
  | { ok: false; reason: string; unresolvedLookups: boolean };

/**
 * Phantom signs an unsigned transaction by refreshing its blockhash and, on a
 * public site, appending Lighthouse assertions. Both change the message bytes,
 * so a byte compare against `/prepare` rejects a signature the wallet just
 * produced. The instructions, accounts, amounts, and required signers still
 * have to be the ones that were handed out.
 */
export function reconcileWalletMessage(
  original: VersionedTransaction,
  signed: VersionedTransaction,
  tables: AddressLookupTableAccount[] = [],
): WalletMessageDecision {
  if (original.message.version !== 0 || signed.message.version !== 0) {
    return rejected("the transaction was modified after signing");
  }

  const blockhash = signed.message.recentBlockhash;
  const blockhashChanged = blockhash !== original.message.recentBlockhash;
  if (sameCompiledMessage(original, signed)) {
    return { ok: true, blockhash, blockhashChanged: false };
  }
  if (sameCompiledExceptBlockhash(original, signed)) {
    return { ok: true, blockhash, blockhashChanged: true };
  }

  const semantic = sameLaunchInstructions(original, signed, tables);
  if (!semantic.ok) return semantic;
  return { ok: true, blockhash, blockhashChanged };
}

/**
 * Drops trailing Lighthouse assertions before a blockhash refresh. Those
 * assertions describe the balances Phantom simulated for the previous
 * message; copying them onto a new hash makes the next attempt fail closed.
 */
export function stripWalletAssertions(
  tx: VersionedTransaction,
  tables: AddressLookupTableAccount[],
): VersionedTransaction {
  if (tx.message.version !== 0) return tx;
  let message: TransactionMessage;
  try {
    message = TransactionMessage.decompile(tx.message, {
      addressLookupTableAccounts: tables,
    });
  } catch {
    return tx;
  }
  const instructions = withoutTrailingAssertions(message.instructions);
  if (instructions.length === message.instructions.length) return tx;
  return new VersionedTransaction(
    new TransactionMessage({
      payerKey: message.payerKey,
      recentBlockhash: message.recentBlockhash,
      instructions,
    }).compileToV0Message(tables),
  );
}

/** Same message the wallet signed, with empty signature slots for storage. */
export function clearSignatures(tx: VersionedTransaction): VersionedTransaction {
  const copy = VersionedTransaction.deserialize(tx.serialize());
  for (const signature of copy.signatures) signature.fill(0);
  return copy;
}

function rejected(reason: string, unresolvedLookups = false): WalletMessageDecision {
  return { ok: false, reason, unresolvedLookups };
}

function messageOf(tx: VersionedTransaction): MessageV0 {
  return tx.message as MessageV0;
}

function sameCompiledMessage(
  original: VersionedTransaction,
  signed: VersionedTransaction,
): boolean {
  return (
    Buffer.compare(original.message.serialize(), signed.message.serialize()) === 0
  );
}

function sameCompiledExceptBlockhash(
  original: VersionedTransaction,
  signed: VersionedTransaction,
): boolean {
  const left = messageOf(original);
  const right = messageOf(signed);
  if (
    left.header.numRequiredSignatures !== right.header.numRequiredSignatures ||
    left.header.numReadonlySignedAccounts !== right.header.numReadonlySignedAccounts ||
    left.header.numReadonlyUnsignedAccounts !== right.header.numReadonlyUnsignedAccounts
  ) {
    return false;
  }
  if (!sameKeys(left.staticAccountKeys, right.staticAccountKeys)) return false;
  if (left.compiledInstructions.length !== right.compiledInstructions.length) return false;
  for (let i = 0; i < left.compiledInstructions.length; i += 1) {
    const a = left.compiledInstructions[i];
    const b = right.compiledInstructions[i];
    if (!a || !b) return false;
    if (a.programIdIndex !== b.programIdIndex) return false;
    if (!sameNumbers(a.accountKeyIndexes, b.accountKeyIndexes)) return false;
    if (Buffer.compare(a.data, b.data) !== 0) return false;
  }
  if (left.addressTableLookups.length !== right.addressTableLookups.length) return false;
  for (let i = 0; i < left.addressTableLookups.length; i += 1) {
    const a = left.addressTableLookups[i];
    const b = right.addressTableLookups[i];
    if (!a || !b || !a.accountKey.equals(b.accountKey)) return false;
    if (!sameNumbers(a.writableIndexes, b.writableIndexes)) return false;
    if (!sameNumbers(a.readonlyIndexes, b.readonlyIndexes)) return false;
  }
  return true;
}

function sameLaunchInstructions(
  original: VersionedTransaction,
  signed: VersionedTransaction,
  tables: AddressLookupTableAccount[],
): WalletMessageDecision {
  if (!sameSignerSet(original, signed)) {
    return rejected("the signed transaction changed who has to sign");
  }
  const originalPayer = original.message.staticAccountKeys[0];
  const signedPayer = signed.message.staticAccountKeys[0];
  if (!originalPayer || !signedPayer || !originalPayer.equals(signedPayer)) {
    return rejected("the signed transaction changed the fee payer");
  }

  let originalMessage: TransactionMessage;
  let signedMessage: TransactionMessage;
  try {
    originalMessage = TransactionMessage.decompile(original.message, {
      addressLookupTableAccounts: tables,
    });
    signedMessage = TransactionMessage.decompile(signed.message, {
      addressLookupTableAccounts: tables,
    });
  } catch {
    return rejected("could not read the signed transaction", true);
  }

  if (signedMessage.instructions.length < originalMessage.instructions.length) {
    return rejected("the signed transaction dropped an instruction");
  }
  const extra = signedMessage.instructions.length - originalMessage.instructions.length;
  if (extra > MAX_WALLET_ASSERTIONS) {
    return rejected("the signed transaction added too many instructions");
  }
  for (let i = 0; i < originalMessage.instructions.length; i += 1) {
    const left = originalMessage.instructions[i];
    const right = signedMessage.instructions[i];
    if (!left || !right || !sameInstruction(left, right)) {
      return rejected("the signed transaction changed an instruction");
    }
  }
  for (const instruction of signedMessage.instructions.slice(originalMessage.instructions.length)) {
    if (!instruction.programId.equals(LIGHTHOUSE_PROGRAM_ID)) {
      return rejected("the signed transaction added an instruction");
    }
  }
  return { ok: true, blockhash: signed.message.recentBlockhash, blockhashChanged: false };
}

function withoutTrailingAssertions(
  instructions: TransactionInstruction[],
): TransactionInstruction[] {
  let end = instructions.length;
  while (
    end > 0 &&
    instructions[end - 1]?.programId.equals(LIGHTHOUSE_PROGRAM_ID)
  ) {
    end -= 1;
  }
  return instructions.slice(0, end);
}

function sameSignerSet(original: VersionedTransaction, signed: VersionedTransaction): boolean {
  const left = signers(original).sort();
  const right = signers(signed).sort();
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

function signers(tx: VersionedTransaction): string[] {
  return tx.message.staticAccountKeys
    .slice(0, tx.message.header.numRequiredSignatures)
    .map((key) => key.toBase58());
}

function sameInstruction(left: TransactionInstruction, right: TransactionInstruction): boolean {
  if (!left.programId.equals(right.programId)) return false;
  if (Buffer.compare(left.data, right.data) !== 0) return false;
  if (left.keys.length !== right.keys.length) return false;
  return left.keys.every((key, index) => {
    const other = right.keys[index];
    return (
      other !== undefined &&
      key.pubkey.equals(other.pubkey) &&
      key.isSigner === other.isSigner &&
      key.isWritable === other.isWritable
    );
  });
}

function sameKeys(left: PublicKey[], right: PublicKey[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((key, index) => key.equals(right[index]!));
}

function sameNumbers(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}
