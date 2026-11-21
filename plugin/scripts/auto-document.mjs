// Stop hook entry point (see hooks/hooks.json). Opt-in via
// `autoDocument: true` in docsolace.config.yaml. Prints nothing and exits 0 in
// every "not now" case; the only output is a `{decision: "block", reason}`
// that makes Claude run one more step (resyncing stale tours). Any error is
// swallowed — a documentation helper must never break the developer's turn.
//
// Must run from ${CLAUDE_PLUGIN_DATA}/scripts: it imports js-yaml/glob via the
// shared libs (unlike session-guidance.mjs, which is dependency-free).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './lib/config.mjs';
import { computeCodePathsHash } from './lib/drift.mjs';
import { readJsonFile, writeFileAtomic } from './lib/fs-atomic.mjs';
import { loadState } from './lib/state.mjs';
import { loadTour } from './lib/tours.mjs';
import { buildTriageReport } from './lib/triage.mjs';
import { buildAutoDocumentReason, decideAutoDocument, findStaleTours } from './lib/auto-document.mjs';

async function readStdin() {
  if (process.stdin.isTTY) return {};
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function isReachable(baseUrl) {
  try {
    await fetch(baseUrl, { signal: AbortSignal.timeout(2000), redirect: 'manual' });
    return true; // any HTTP response means something is serving
  } catch {
    return false;
  }
}

function currentBranch(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

async function main() {
  const input = await readStdin();
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  process.chdir(cwd);
  if (!fs.existsSync('docsolace.config.yaml')) return;

  const config = loadConfig('docsolace.config.yaml');
  if (!config.autoDocument) return;

  const report = buildTriageReport({ cwd });
  if (report.resync.length === 0) return;

  const tours = report.resync.map(({ tourId }) => loadTour('tours', tourId));
  const state = loadState(path.join(config.outputDir, 'state.json'));
  const stale = findStaleTours({
    resync: report.resync,
    tours,
    state,
    hashFor: (tour) => computeCodePathsHash(tour.code_paths, cwd),
  });

  const memoryPath = path.join(config.outputDir, 'auto-document.json');
  const memory = readJsonFile(memoryPath, null);
  const decision = decideAutoDocument({
    enabled: true,
    stopHookActive: input.stop_hook_active === true,
    stale,
    memory,
    now: Date.now(),
    cooldownMinutes: config.autoDocumentMinMinutes,
    // Only probe the app once everything else says go.
    appReachable: stale.length > 0 ? await isReachable(config.baseUrl) : false,
  });
  if (decision.action !== 'run') return;

  // Remembered before asking, so a declined or failed run isn't re-asked on
  // the next Stop for the same code.
  writeFileAtomic(memoryPath, JSON.stringify({ fingerprint: decision.fingerprint, at: Date.now() }));
  console.log(
    JSON.stringify({
      decision: 'block',
      reason: buildAutoDocumentReason({ tourIds: decision.tourIds, baseUrl: config.baseUrl, branch: currentBranch(cwd) }),
    }),
  );
}

main().catch(() => {});
