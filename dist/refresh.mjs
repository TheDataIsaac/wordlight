// Revalidate app files without changing saved studies, slides or timer state.
export async function freshPresentationFiles(base, request = fetch) {
  const root = new URL('./', base), seen = new Set();
  async function visit(value, parent, kind) {
    const url = new URL(value, parent);
    if (url.origin !== root.origin || seen.has(url.href)) return;
    if (seen.size >= 80) throw new Error('Too many presentation files.');
    seen.add(url.href);
    const response = await request(url.href, {cache:'reload', credentials:'same-origin', redirect:'error', signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error('Could not fetch the latest presentation files.');
    const text = await response.text();
    if (kind !== 'html' && /^\s*(?:<!doctype html|<html)/i.test(text)) throw new Error('Sign in again before refreshing the presentation.');
    if (kind === 'html') {
      const scripts = [...text.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)];
      if (!scripts.length || !text.includes('id="app"')) throw new Error('The presentation page is unavailable.');
      for (const match of scripts) await visit(match[1], url, 'js');
      for (const match of text.matchAll(/<link\b[^>]*>/gi)) {
        if (/rel=["']stylesheet["']/i.test(match[0])) {
          const href = match[0].match(/href=["']([^"']+)["']/i)?.[1];
          if (href) await visit(href, url, 'css');
        }
      }
    } else if (kind === 'js') {
      for (const match of text.matchAll(/\b(?:import|export)\s+(?:[^;\n]*?\s+from\s*)?["'](\.{1,2}\/[^"']+)["']/g)) await visit(match[1], url, 'js');
    }
  }
  await visit(root.href, root, 'html');
  return [...seen];
}
export function refreshedOutputURL(base, nonce) {
  const url = new URL('./', base);
  url.searchParams.set('view', 'output');
  url.searchParams.set('refresh', nonce);
  return url.href;
}
