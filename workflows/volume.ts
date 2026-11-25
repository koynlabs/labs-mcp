import { sleep } from "workflow";

type Tick = { stop: boolean; waitSeconds: number; note: string };

async function volumeStep(sessionId: string): Promise<Tick> {
  "use step";
  const { tickVolume } = await import("../src/lib/volume/tick");
  return tickVolume(sessionId);
}

/** Funds, buys, and deposits from sealed child keys. The user does not sign. */
export async function volumeSession(sessionId: string) {
  "use workflow";

  for (;;) {
    const outcome = await volumeStep(sessionId);
    if (outcome.stop) return { status: "completed", sessionId, note: outcome.note };
    await sleep(`${outcome.waitSeconds} seconds`);
  }
}
