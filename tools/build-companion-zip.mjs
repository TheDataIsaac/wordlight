// Builds dist/wordlight-obs-companion.zip, the source download offered by the web studio ("Download companion").
// Files are read from a git commit (HEAD unless one is given), so the ZIP matches the tested commit byte for byte
// whatever the working copy holds. The ZIP has no timestamps, so the same commit always gives the same ZIP.
//   node tools/build-companion-zip.mjs [commit] [output.zip]
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeZip} from '../ziputil.mjs';

const repo=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const commit=process.argv[2]||'HEAD',out=process.argv[3]||path.join(repo,'dist','wordlight-obs-companion.zip');
const git=args=>execFileSync('git',args,{cwd:repo,maxBuffer:64e6});
const tracked=String(git(['ls-tree','-r','--name-only',commit])).split('\n').filter(Boolean);
// The companion itself, its start script, licence and notices; the studio pages; no tests, data, tools or this ZIP.
const top=['package.json','README.md','LICENSE','THIRD_PARTY_NOTICES.md','server.mjs','apibible.mjs','bibles.mjs','ziputil.mjs','remote-server.mjs','Start Wordlight.cmd'];
const names=[...top,...tracked.filter(n=>/^dist\/[^/]+\.(html|css|js|mjs)$/.test(n)).sort()];
const files={};
for(const name of names){
 if(!tracked.includes(name))throw new Error(name+' is not in '+commit+'; nothing was built.');
 files[name]=git(['show',commit+':'+name]);
}
const zip=writeZip(files);
await writeFile(out,zip);
console.log(out);console.log(names.length+' files from '+String(git(['rev-parse','--short',commit])).trim()+', sha256 '+createHash('sha256').update(zip).digest('hex'));
