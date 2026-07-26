// Pure scheduler behind capture.mjs's multi-tour path (repeated --tour, or
// --all): given the tours to capture, computes an ordered list of "batches"
// to run — no browser, no fs beyond what the caller already loaded — so pool
// ordering and the seed-serialization rule are unit-testable without
// launching Playwright.
//
// A tour with preconditions.seed runs alone, in its own single-tour batch:
// a seed's command mutates shared app state (see lib/seed.mjs's comment on
// why seeds are the one place capture.mjs shells out to config-authored
// content), so two seeded tours — or a seeded tour and anything else —
// running concurrently could race on that shared state. It acts as a
// barrier: whatever non-seeded tours were queued before it are flushed into
// their own batch(es) first, then the seeded tour runs alone, then queueing
// resumes. Every other (non-seeded) tour is grouped into batches of at most
// `concurrency`, in the order given — capture.mjs runs each batch's tours
// concurrently (one shared browser, one context per tour) and each batch in
// sequence.
export function planCaptureBatches(tours, { concurrency = 3 } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`concurrency must be a positive integer, got ${JSON.stringify(concurrency)}`);
  }

  const batches = [];
  let pending = [];

  const flushPending = () => {
    for (let i = 0; i < pending.length; i += concurrency) {
      batches.push(pending.slice(i, i + concurrency));
    }
    pending = [];
  };

  for (const tour of tours) {
    if (tour.preconditions?.seed) {
      flushPending();
      batches.push([tour]);
    } else {
      pending.push(tour);
    }
  }
  flushPending();

  return batches;
}
