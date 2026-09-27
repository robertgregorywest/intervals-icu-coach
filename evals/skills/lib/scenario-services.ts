import { devNull } from "node:os";
import { join } from "node:path";
import { readCassette, replayFetch } from "../../../src/cassette.js";
import { createServices, type IServices } from "../../../src/index.js";
import type { EvalCase } from "./types.js";

const servicesByCase = new Map<string, IServices>();

/**
 * The services a run's `bin/icu` saw: the case's cassette replayed on its
 * scenario date. Graders ask it for the athlete's anchors and zones the same
 * way the skills do, rather than reading cassette files themselves. A request
 * the cassette lacks throws, naming the missing key.
 */
export function scenarioServices(evalCase: EvalCase): IServices {
  const cached = servicesByCase.get(evalCase.dir);
  if (cached) return cached;
  const dir = join(evalCase.dir, "cassette");
  // Keys carry the athlete id the cassette was recorded under.
  const athleteId = readCassette(dir)
    .map((e) => e.key.match(/\/athlete\/([^/?]+)/)?.[1])
    .find(Boolean);
  if (!athleteId) {
    throw new Error(`${evalCase.id}: no athlete requests in its cassette`);
  }
  const services = createServices({
    apiKey: "replay",
    athleteId,
    fetchFn: replayFetch({ dir, captureFile: devNull, missesFile: devNull }),
    today: () => evalCase.scenarioDate,
  });
  servicesByCase.set(evalCase.dir, services);
  return services;
}
