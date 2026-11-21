import { describe, expect, it } from 'vitest';
import { fetchBrandAsset, isSafeSvg, sniffImage } from '../brand-assets.mjs';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const base = 'http://localhost:3000';
const reply = (body, { status = 200, headers = {} } = {}) => async () =>
  new Response(body, { status, headers });

describe('sniffImage', () => {
  it('identifies by magic bytes, not by name', () => {
    expect(sniffImage(PNG)).toBe('png');
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(sniffImage(Buffer.from([0, 0, 1, 0, 1, 0]))).toBe('ico');
    expect(sniffImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
    expect(sniffImage(Buffer.from('<?xml version="1.0"?><svg xmlns="x"></svg>'))).toBe('svg');
    expect(sniffImage(Buffer.from('<html><body>not an image</body></html>'))).toBeNull();
  });
});

describe('isSafeSvg', () => {
  it('accepts a plain SVG with same-document references', () => {
    expect(isSafeSvg('<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"/></defs><rect fill="url(#g)"/><use href="#a"/></svg>')).toBe(true);
  });
  it.each([
    ['script', '<svg><script>alert(1)</script></svg>'],
    ['event handler', '<svg onload="x()"></svg>'],
    ['foreignObject', '<svg><foreignObject><div/></foreignObject></svg>'],
    ['javascript: link', '<svg><a href="javascript:x()"/></svg>'],
    ['external href', '<svg><image href="https://evil.example/x.png"/></svg>'],
    ['external xlink', '<svg><use xlink:href="//evil.example/a.svg#b"/></svg>'],
    ['external url()', '<svg><rect fill="url(https://evil.example/x)"/></svg>'],
    ['namespaced script', '<svg xmlns="http://www.w3.org/2000/svg" xmlns:s="http://www.w3.org/2000/svg"><s:script>alert(1)</s:script></svg>'],
    ['prefixed foreignObject', '<svg><x:foreignObject/></svg>'],
    ['entity', '<!DOCTYPE svg [<!ENTITY x "y">]><svg/>'],
    ['css import', '<svg><style>@import "x.css";</style></svg>'],
  ])('rejects %s', (_n, svg) => {
    expect(isSafeSvg(svg)).toBe(false);
  });
});

describe('fetchBrandAsset', () => {
  it('returns a same-origin image', async () => {
    const r = await fetchBrandAsset(`${base}/logo.png`, base, { fetchImpl: reply(PNG) });
    expect(r.ext).toBe('png');
    expect(Buffer.isBuffer(r.data)).toBe(true);
  });
  it('refuses another origin, non-http schemes and garbage URLs', async () => {
    const never = async () => { throw new Error('must not fetch'); };
    expect((await fetchBrandAsset('https://evil.example/x.png', base, { fetchImpl: never })).skipped).toMatch(/own origin/);
    expect((await fetchBrandAsset('file:///etc/passwd', base, { fetchImpl: never })).skipped).toMatch(/http/);
    expect((await fetchBrandAsset('data:image/png;base64,AAAA', base, { fetchImpl: never })).skipped).toMatch(/http/);
    expect((await fetchBrandAsset('nope', base, { fetchImpl: never })).skipped).toMatch(/valid/);
  });
  it('refuses redirects, errors, oversize and non-images', async () => {
    expect((await fetchBrandAsset(`${base}/a`, base, { fetchImpl: reply('', { status: 302, headers: { location: 'http://169.254.169.254/' } }) })).skipped).toMatch(/redirect/);
    expect((await fetchBrandAsset(`${base}/a`, base, { fetchImpl: reply('', { status: 404 }) })).skipped).toMatch(/404/);
    expect((await fetchBrandAsset(`${base}/a`, base, { fetchImpl: reply(Buffer.alloc(600 * 1024, 1)) })).skipped).toMatch(/large/);
    expect((await fetchBrandAsset(`${base}/a.png`, base, { fetchImpl: reply('<html>hi</html>', { headers: { 'content-type': 'image/png' } }) })).skipped).toMatch(/recognized/);
  });
  it('accepts a clean SVG, rejects a hostile one', async () => {
    expect((await fetchBrandAsset(`${base}/l.svg`, base, { fetchImpl: reply('<svg xmlns="x"><circle r="1"/></svg>') })).ext).toBe('svg');
    expect((await fetchBrandAsset(`${base}/l.svg`, base, { fetchImpl: reply('<svg onload="x()"></svg>') })).skipped).toMatch(/SVG/);
  });
  it('survives a network failure', async () => {
    const r = await fetchBrandAsset(`${base}/a`, base, { fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
    expect(r.skipped).toMatch(/ECONNREFUSED/);
  });
});
