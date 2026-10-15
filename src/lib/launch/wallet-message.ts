import {
  ComputeBudgetProgram,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type AddressLookupTableAccount,
  type MessageV0,
} from "@solana/web3.js";

/**
 * Phantom (and Solflare) add assertions from this program when a transaction
 * is signed on a public https origin. They are not always a suffix: a priority
 * fee inserted beside them shifts every later instruction.
 * https://docs.phantom.com/developer-powertools/lighthouse
 */
export const LIGHTHOUSE_PROGRAM_ID = new PublicKey(
  "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95",
);

/** SetComputeUnitLimit. The last one in the message is the one that executes. */
const COMPUTE_UNIT_LIMIT = 2;

/** Phantom adds one assertion; Solflare adds two. Six is room, not an invitation. */
const MAX_WALLET_ASSERTIONS = 6;

export type WalletMessageDecision =
  | { ok: true; blockhash: string; blockhashChanged: boolean }
  | { ok: false; reason: string; unresolvedLookups: boolean };

/**
 * Phantom signs an unsigned transaction by refreshing its blockhash, inserting
 * compute-budget instructions, and adding Lighthouse assertions. None of those
 * have to sit at the end: a priority fee in front, or an assertion between the
 * create and the buy, shifts every later index. A prefix compare then reports
 * that an instruction changed even though the launch data did not. The launch
 * instructions — program, data, and account order — still have to be the ones
 * that were handed out.
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
 * Drops wallet-only instructions before a blockhash refresh. Lighthouse
 * assertions describe the balances Phantom simulated for the previous message;
 * copying them onto a new hash makes the next attempt fail closed. A priority
 * fee, heap frame, or loaded-account cap Phantom inserted is dropped too, so
 * the next signature gets a fresh one. The compute-unit limit stays: it is
 * what makes the create and the buy fit.
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
  const instructions = message.instructions.filter(
    (instruction) => !isStrippable(instruction),
  );
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

  const originalLaunch = originalMessage.instructions.filter((ix) => !isWalletMeta(ix));
  const signedLaunch = signedMessage.instructions.filter((ix) => !isWalletMeta(ix));
  if (signedLaunch.length < originalLaunch.length) {
    return rejected("the signed transaction dropped an instruction");
  }
  if (signedLaunch.length > originalLaunch.length) {
    return rejected("the signed transaction added an instruction");
  }
  for (let i = 0; i < originalLaunch.length; i += 1) {
    const left = originalLaunch[i];
    const right = signedLaunch[i];
    if (!left || !right || !sameLaunchInstruction(left, right)) {
      return rejected("the signed transaction changed an instruction");
    }
  }

  const assertions = signedMessage.instructions.filter(isLighthouse).length;
  if (assertions > MAX_WALLET_ASSERTIONS) {
    return rejected("the signed transaction added too many instructions");
  }
  const originalLimit = lastComputeUnitLimit(originalMessage.instructions);
  const signedLimit = lastComputeUnitLimit(signedMessage.instructions);
  if (originalLimit !== null && (signedLimit === null || signedLimit < originalLimit)) {
    return rejected("the signed transaction lowered the compute budget");
  }
  if (!writableAccountsKept(originalMessage, signedMessage)) {
    return rejected("the signed transaction made an account read-only");
  }
  return { ok: true, blockhash: signed.message.recentBlockhash, blockhashChanged: false };
}

function isLighthouse(instruction: TransactionInstruction): boolean {
  return instruction.programId.equals(LIGHTHOUSE_PROGRAM_ID);
}

function isComputeBudget(instruction: TransactionInstruction): boolean {
  return instruction.programId.equals(ComputeBudgetProgram.programId);
}

/**
 * Lighthouse and every compute-budget instruction are the wallet's. The
 * compute-unit limit is still checked so a signature cannot shrink the
 * budget the create was built with. Everything else is the launch.
 */
function isWalletMeta(instruction: TransactionInstruction): boolean {
  return isLighthouse(instruction) || isComputeBudget(instruction);
}

/** Keep the compute-unit limit. Drop fees, heap frames, data-size caps, and assertions. */
function isStrippable(instruction: TransactionInstruction): boolean {
  if (isLighthouse(instruction)) return true;
  return isComputeBudget(instruction) && instruction.data[0] !== COMPUTE_UNIT_LIMIT;
}

function lastComputeUnitLimit(instructions: TransactionInstruction[]): number | null {
  let limit: number | null = null;
  for (const instruction of instructions) {
    if (!instruction.programId.equals(ComputeBudgetProgram.programId)) continue;
    if (instruction.data[0] !== COMPUTE_UNIT_LIMIT || instruction.data.length < 5) continue;
    limit = instruction.data.readUInt32LE(1);
  }
  return limit;
}

function writableAccountsKept(
  original: TransactionMessage,
  signed: TransactionMessage,
): boolean {
  const kept = writableAccounts(signed);
  for (const pubkey of writableAccounts(original)) {
    if (!kept.has(pubkey)) return false;
  }
  return true;
}

function writableAccounts(message: TransactionMessage): Set<string> {
  const accounts = new Set<string>([message.payerKey.toBase58()]);
  for (const instruction of message.instructions) {
    for (const key of instruction.keys) {
      if (key.isWritable) accounts.add(key.pubkey.toBase58());
    }
  }
  return accounts;
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

function sameLaunchInstruction(
  left: TransactionInstruction,
  right: TransactionInstruction,
): boolean {
  if (!left.programId.equals(right.programId)) return false;
  if (Buffer.compare(left.data, right.data) !== 0) return false;
  if (left.keys.length !== right.keys.length) return false;
  // Signer and writable are message-wide, not per instruction. Phantom's
  // priority fee and assertions change those flags without editing the launch.
  return left.keys.every((key, index) => {
    const other = right.keys[index];
    return other !== undefined && key.pubkey.equals(other.pubkey);
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
