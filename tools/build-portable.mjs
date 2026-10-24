// Builds build/Wordlight-portable-<version>-win-x64.zip: the app, the launcher scripts and the official Node.js runtime
// (node.exe and its LICENSE from the nodejs.org Windows zip, checked against nodejs.org's SHA256SUMS), plus the official
// open Bible archives as seed packs that are installed on first start. Only the listed app files are packed; no data
// folder, shows, keys or tests.
//   node tools/build-portable.mjs
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {zipEntries,readZipEntry,writeZip} from '../ziputil.mjs';
import {CATALOG} from '../bibles.mjs';
import {execFileSync} from 'node:child_process';

const NODE_VERSION='v24.18.0';
const repo=path.join(path.dirname(fileURLToPath(import.meta.url)),'..'),cacheDir=path.join(repo,'build','cache');
const sha=buf=>createHash('sha256').update(buf).digest('hex');
async function cached(name,url){
 const file=path.join(cacheDir,name);
 try{return await readFile(file);}catch{}
 const response=await fetch(url,{signal:AbortSignal.timeout(300000)});
 if(!response.ok)throw new Error('Download failed ('+response.status+'): '+url);
 const buf=Buffer.from(await response.arrayBuffer());await mkdir(cacheDir,{recursive:true});await writeFile(file,buf);return buf;
}
// The official runtime, verified before anything is taken from it.
const zipName='node-'+NODE_VERSION+'-win-x64.zip';
const sums=(await cached('SHASUMS256-'+NODE_VERSION+'.txt','https://nodejs.org/dist/'+NODE_VERSION+'/SHASUMS256.txt')).toString();
const expected=sums.split('\n').map(l=>l.trim().split(/\s+/)).find(([,name])=>name===zipName)?.[0];
const nodeZip=await cached(zipName,'https://nodejs.org/dist/'+NODE_VERSION+'/'+zipName);
if(!expected||sha(nodeZip)!==expected)throw new Error('The Node.js download does not match SHASUMS256.txt; nothing was built.');
const entries=zipEntries(nodeZip),pick=name=>{const e=entries.find(x=>x.name==='node-'+NODE_VERSION+'-win-x64/'+name);if(!e)throw new Error(name+' missing from the Node.js zip.');return readZipEntry(nodeZip,e,200e6);};

const version=JSON.parse(await readFile(path.join(repo,'package.json'),'utf8')).version,top='Wordlight/';
// Build id: version and commit, marked when the working tree has uncommitted changes.
const git=args=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
const build=version+'+'+git(['rev-parse','--short','HEAD'])+(git(['status','--porcelain'])?'-dirty':'');
const files={};
files[top+'app/build.json']=Buffer.from(JSON.stringify({version,build,builtAt:new Date().toISOString()}));
// Seed packs: the official single-file archives, unchanged (each keeps its own notice inside).
const seedLines=[];
for(const [id,info] of Object.entries(CATALOG)){
 if(info.importOnly)continue; // NKJV: only from the user's own file, never shipped
 const pack=await cached(info.file,'https://ebible.org/Scriptures/'+info.file);
 const entries=zipEntries(pack);if(!entries.some(e=>/_vpl\.txt$/.test(e.name)))throw new Error(info.file+' has no verse text.');
 files[top+'bibles/'+info.file]=pack;
 seedLines.push(info.abbreviation+'  '+info.name+'\r\n    '+info.credit+'\r\n    Source and licence: '+info.details+'\r\n    '+info.file+'  sha256 '+sha(pack));
}
files[top+'bibles/BIBLES.txt']=Buffer.from('Bible text packs installed on first start (only for versions not installed yet).\r\nEach archive is the unchanged official download from eBible.org and contains its own copyright notice.\r\n\r\n'+seedLines.join('\r\n\r\n')+'\r\n');
const add=async(source,target)=>{files[top+target]=await readFile(path.join(repo,source));};
for(const name of ['package.json','README.md','LICENSE','THIRD_PARTY_NOTICES.md','server.mjs','apibible.mjs','bibles.mjs','ziputil.mjs','remote-server.mjs'])await add(name,'app/'+name);
for(const name of (await readdir(path.join(repo,'dist'))).filter(n=>/\.(html|css|js|mjs)$/.test(n)).sort())await add('dist/'+name,'app/dist/'+name);
await add('tools/portable/launcher.mjs','launcher/launcher.mjs');
for(const name of ['Start Wordlight.vbs','Stop Wordlight.vbs','Start with Windows.vbs'])await add('tools/portable/'+name,name);
files[top+'runtime/node.exe']=pick('node.exe');
files[top+'runtime/LICENSE.txt']=pick('LICENSE');
files[top+'README.txt']=Buffer.from(`Wordlight · Church Media ${version} (build ${build}, portable, Windows)

Start:  double-click "Start Wordlight". It starts Wordlight in the background and opens it in a window.
        Double-click it again at any time: it opens the running Wordlight instead of starting a second one.
Stop:   double-click "Stop Wordlight". Closing the Wordlight window does not stop it, so OBS outputs keep working.
Start with Windows (optional): double-click "Start with Windows" to turn it on or off.

OBS addresses:  full screen  http://127.0.0.1:18765/?view=output&obs=1
                lower third  http://127.0.0.1:18765/?view=lower&obs=1
                graphics     http://127.0.0.1:18765/?view=graphics&obs=1

Your shows, settings and installed Bibles are kept in %LOCALAPPDATA%\\Wordlight\\data, not in this folder,
so a newer Wordlight folder can replace this one without touching them.
Bibles: KJV, ASV, WEB and the Open Yoruba Contemporary Bible are installed from the packs in the bibles folder on
first start, so lookups work without internet. Licences are in bibles/BIBLES.txt. NKJV is looked up online from
bolls.life one chapter at a time, or from your own API.Bible key or licensed NKJV file (Bible panel, Use your own NKJV).
No NKJV text is included. Licence and third-party notices: app/LICENSE and app/THIRD_PARTY_NOTICES.md.

Includes Node.js ${NODE_VERSION} (runtime/node.exe), licensed as described in runtime/LICENSE.txt.
`.replace(/\n/g,'\r\n'));

const out=path.join(repo,'build','Wordlight-portable-'+version+'-win-x64.zip'),zip=writeZip(files);
await writeFile(out,zip);
console.log(out);console.log('build '+build);console.log(Object.keys(files).length+' files, '+(zip.length/1e6).toFixed(1)+' MB, sha256 '+sha(zip));
