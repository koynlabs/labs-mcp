import {
  AddressLookupTableAccount,
  PACKET_DATA_SIZE,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type MessageV0,
} from "@solana/web3.js";
import { connection } from "./solana";

const EVENT_AUTHORITY_SEED = Buffer.from("__event_authority");

/**
 * Anchor marks a program's instructions with an `__event_authority` account.
 * PumpPortal leaves that account in an address lookup table, so a wallet that
 * has not loaded the table cannot tell which program it is about to sign and
 * flags the request. Lift every invoked program's event authority into the
 * static keys. The instructions stay the same; only where the authority sits
 * changes, and that happens before anyone signs.
 */
export async function includeEventAuthorities(
  tx: VersionedTransaction,
): Promise<VersionedTransaction> {
  if (tx.message.version !== 0 || tx.message.addressTableLookups.length === 0) {
    return tx;
  }
  if (tx.signatures.some((signature) => signature.some((byte) => byte !== 0))) {
    return tx;
  }

  const message = tx.message as MessageV0;
  const tables: AddressLookupTableAccount[] = [];
  for (const lookup of message.addressTableLookups) {
    const loaded = await connection().getAddressLookupTable(lookup.accountKey);
    if (!loaded.value) {
      throw new Error(
        `address lookup table not found: ${lookup.accountKey.toBase58()}`,
      );
    }
    tables.push(loaded.value);
  }

  const keys = message.getAccountKeys({ addressLookupTableAccounts: tables });
  const authorities = new Set<string>();
  for (const instruction of message.compiledInstructions) {
    const program = keys.get(instruction.programIdIndex);
    if (!program) continue;
    const [authority] = PublicKey.findProgramAddressSync(
      [EVENT_AUTHORITY_SEED],
      program,
    );
    authorities.add(authority.toBase58());
  }

  const resolved = keys.keySegments().flat();
  const hidden = resolved.filter(
    (key, index) =>
      index >= message.staticAccountKeys.length &&
      authorities.has(key.toBase58()),
  );
  if (hidden.length === 0) return tx;

  const hiddenKeys = new Set(hidden.map((key) => key.toBase58()));
  const visibleTables = tables
    .map(
      (table) =>
        new AddressLookupTableAccount({
          key: table.key,
          state: {
            ...table.state,
            addresses: table.state.addresses.filter(
              (address) => !hiddenKeys.has(address.toBase58()),
            ),
          },
        }),
    )
    .filter((table) => table.state.addresses.length > 0);

  const rebuilt = TransactionMessage.decompile(message, {
    addressLookupTableAccounts: tables,
  }).compileToV0Message(visibleTables);

  if (rebuilt.header.numRequiredSignatures !== message.header.numRequiredSignatures) {
    throw new Error(
      "moving the event authority changed who has to sign the launch",
    );
  }

  const next = new VersionedTransaction(rebuilt);
  if (next.serialize().length > PACKET_DATA_SIZE) {
    throw new Error(
      "the launch does not fit once its program authority is included",
    );
  }
  return next;
}
