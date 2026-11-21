// Opt-in local automation: a Stop hook that, when the developer has changed
// code a tour covers and the app is running, asks Claude to resync just those
// tours before the turn ends. Everything here is a pure decision over data the
// script gathers, so it is unit-tested without a browser, git or a hook runner.
//
// Deliberately narrow, matching the brief's stance against a hook that guesses
// "a feature just landed": it only ever *resyncs tours that already exist and
// whose code_paths changed*. It never drafts a new tour (uncovered UI keeps
// the existing one-line nudge) and never asks the developer anything.
import { createHash } from 'node:crypto';

export const DEFAULT_COOLDOWN_MINUTES = 10;

// Which covered tours are actually out of date: their code_paths hash differs
// from what was recorded when their docs were last generated (or they were
// never generated). Cheap — no capture, no browser — and it makes the hook
// quiet again as soon as the docs are regenerated.
export function findStaleTours({ resync, tours, state, hashFor }) {
  const byId = new Map(tours.map((t) => [t.id, t]));
  const stale = [];
  for (const { tourId } of resync) {
    const tour = byId.get(tourId);
    if (!tour) continue;
    if ((tour.status ?? 'confirmed') !== 'confirmed' || tour.maturity === 'draft') continue;
    const current = hashFor(tour);
    if (state[tourId]?.codePathsHash !== current) stale.push({ id: tourId, codePathsHash: current });
  }
  return stale;
}

export function fingerprintStale(stale) {
  const hash = createHash('sha256');
  for (const { id, codePathsHash } of [...stale].sort((a, b) => a.id.localeCompare(b.id))) {
    hash.update(`${id}:${codePathsHash}\n`);
  }
  return hash.digest('hex');
}

// Returns { action: 'skip', why } or { action: 'run', fingerprint, tourIds }.
export function decideAutoDocument({ enabled, stopHookActive, stale, memory, now, cooldownMinutes, appReachable }) {
  if (!enabled) return { action: 'skip', why: 'disabled' };
  // Claude is already continuing because of a Stop hook: never chain.
  if (stopHookActive) return { action: 'skip', why: 'already-continuing' };
  if (stale.length === 0) return { action: 'skip', why: 'docs-current' };
  const fingerprint = fingerprintStale(stale);
  // The same set of out-of-date tours was already handled (or declined or
  // failed) — don't ask again until the code changes further.
  if (memory?.fingerprint === fingerprint) return { action: 'skip', why: 'already-asked' };
  const waitMs = (cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES) * 60_000;
  if (memory?.at && now - memory.at < waitMs) return { action: 'skip', why: 'cooldown' };
  if (!appReachable) return { action: 'skip', why: 'app-not-running' };
  return { action: 'run', fingerprint, tourIds: stale.map((s) => s.id).sort() };
}

// The instruction Claude receives as the Stop hook's `reason`. On a feature or
// fix branch it ships a docs PR like a manual run; anywhere else it stops after
// regenerating, so an automatic run never creates or switches a branch under
// the developer's feet.
export function buildAutoDocumentReason({ tourIds, baseUrl, branch: rawBranch }) {
  // The branch name goes into text Claude treats as an instruction, and a git
  // ref can contain nearly anything — keep only ordinary ref characters.
  const branch = String(rawBranch ?? '').replace(/[^A-Za-z0-9._/-]/g, '?').slice(0, 80);
  const onFeatureBranch = /^(feat|fix)\//.test(branch ?? '');
  const lines = [
    `DocSolace auto-document: code covered by ${tourIds.length === 1 ? 'this tour' : 'these tours'} ` +
      `(${tourIds.join(', ')}) changed since its docs were last generated, and the app is running at ${baseUrl}.`,
    `Run the docsolace:document skill now, once per tour, with the tour id as its argument` +
      `${onFeatureBranch ? '' : ' plus --review'}, to re-capture and update it.`,
  ];
  lines.push(
    onFeatureBranch
      ? `You are on ${branch}, so let it commit and push the docs PR as usual. Never merge it.`
      : `The current branch (${branch || 'unknown'}) is not feat/* or fix/*, so --review keeps this to ` +
          `regeneration only: do not commit, push, or switch branches.`,
  );
  lines.push('Do not ask the user questions. Finish with one line saying which tutorials were updated.');
  return lines.join(' ');
}
