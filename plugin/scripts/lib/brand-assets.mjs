// Fetches the app's favicon and logo for the docs site. They come from a page
// we don't control and get served from the docs origin, so the rules are tight:
// same origin as the app's baseUrl only, no redirects, a size cap, a real image
// by magic bytes (never trusting Content-Type or the extension), and SVG only
// when it passes a strict denylist (an SVG opened directly can run script).
const MAX_BYTES = 512 * 1024;
const MAX_SVG_BYTES = 100 * 1024;

export function sniffImage(buf) {
  const b = Buffer.from(buf);
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (b.length >= 4 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'ico';
  const head = b.subarray(0, 512).toString('utf8').trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return 'svg';
  return null;
}

const SVG_DENY = [
  /<\s*script/i,
  /\son[a-z]+\s*=/i,
  /<\s*foreignObject/i,
  /<\s*(iframe|object|embed|audio|video|animate|set)\b/i,
  /javascript:/i,
  /<!\s*(ENTITY|DOCTYPE)/i,
  /(?:xlink:)?href\s*=\s*["']\s*(?!#)[^"']/i, // only same-document #refs
  /@import/i,
  /url\(\s*["']?\s*(?!#)(?:[a-z]+:|\/\/)/i,
];

export function isSafeSvg(text) {
  return !SVG_DENY.some((re) => re.test(text));
}

// Returns { ext, data } or { skipped: reason }. `fetchImpl` is injectable for tests.
export async function fetchBrandAsset(url, baseUrl, { fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  let target;
  let base;
  try {
    target = new URL(url);
    base = new URL(baseUrl);
  } catch {
    return { skipped: 'not a valid URL' };
  }
  if (!/^https?:$/.test(target.protocol)) return { skipped: 'not an http(s) URL' };
  if (target.origin !== base.origin) return { skipped: `not served from the app's own origin (${target.origin})` };
  let res;
  try {
    res = await fetchImpl(target.href, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    return { skipped: `couldn't fetch it (${err.message})` };
  }
  if (res.status >= 300 && res.status < 400) return { skipped: 'it redirects' };
  if (!res.ok) return { skipped: `HTTP ${res.status}` };
  const length = Number(res.headers.get('content-length') ?? 0);
  if (length > MAX_BYTES) return { skipped: 'too large' };
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > MAX_BYTES) return { skipped: 'too large' };
  const ext = sniffImage(data);
  if (!ext) return { skipped: "isn't a recognized image" };
  if (ext === 'svg') {
    if (data.length > MAX_SVG_BYTES) return { skipped: 'SVG too large' };
    if (!isSafeSvg(data.toString('utf8'))) return { skipped: 'SVG contains active or external content' };
  }
  return { ext, data };
}
