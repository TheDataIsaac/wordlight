// Used by the package builders: every module a packaged .mjs file imports by relative path ('./x.mjs',
// '../dist/y.mjs', import('./z.mjs'), or new URL('./w.mjs',import.meta.url) for a worker) must be in the package too,
// or the packaged app fails to start. Returns the missing ones as "importer -> missing" lines; an empty list means the
// package is complete.
import path from 'node:path';

const RELATIVE_IMPORT=/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\bnew URL\(\s*)(['"])(\.{1,2}\/[^'"]+)\1/g;

// files: {"server.mjs": Buffer, "dist/app.js": Buffer, ...} with paths relative to the app folder.
export function missingImports(files){
 const missing=[];
 for(const [name,data] of Object.entries(files)){
  if(!/\.(mjs|js)$/.test(name))continue;
  for(const [,,target] of String(data).matchAll(RELATIVE_IMPORT)){
   // The phone page (dist/remote.mjs) is served at /remote, so its './remote/x.mjs' is the web address that
   // remote-server.mjs maps to dist/x.mjs.
   const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(name),target)).replace(/(^|\/)dist\/remote\//,'$1dist/');
   if(!(resolved in files))missing.push(name+' -> '+resolved);
  }
 }
 return [...new Set(missing)];
}
