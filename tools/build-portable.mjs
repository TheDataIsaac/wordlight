// Builds the files of a release, in build/:
//   Wordlight-portable-<version>-win-x64.zip  the full package for a first install: the app, the Start and Stop scripts,
//     the official Node.js runtime (node.exe and its LICENSE from the nodejs.org Windows zip, checked against
//     nodejs.org's SHA256SUMS) and the official open Bible archives as seed packs installed on first start;
//   Wordlight-app-<version>.zip  only the app folder, which is what the studio downloads to update an installed package;
//   wordlight-obs-companion.zip  the companion download the web studio offers (tools/build-companion-zip.mjs);
//   SHA256SUMS.txt  checksums of all three, which the updater checks before it unpacks anything;
//   SHA256SUMS.txt.sig  the release key's signature of SHA256SUMS.txt, without which installed copies refuse the update.
// Only the listed app files are packed; no data folder, shows, keys or tests.
//   node tools/build-portable.mjs
import {readFile,writeFile,mkdir,readdir,rm} from 'node:fs/promises';
import {createHash,createPrivateKey,sign} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {zipEntries,readZipEntry,writeZip} from '../ziputil.mjs';
import {CATALOG} from '../bibles.mjs';
import {signedByRelease} from '../updates.mjs';
import {missingImports} from './missing-imports.mjs';
import {execFileSync} from 'node:child_process';

const NODE_VERSION='v24.22.3';
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
// node: the runtime this app was built for. An update for another runtime asks for the full package instead.
files[top+'app/build.json']=Buffer.from(JSON.stringify({version,build,builtAt:new Date().toISOString(),node:NODE_VERSION}));
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
for(const name of ['package.json','README.md','LICENSE','THIRD_PARTY_NOTICES.md','server.mjs','apibible.mjs','bibles.mjs','ziputil.mjs','remote-server.mjs','remote-content.mjs','projector.mjs','song-search.mjs','bible-search.mjs','listen.mjs','listen-worker.mjs','easyworship.mjs','notices.mjs','updates.mjs'])await add(name,'app/'+name);
// The launcher with crash recovery, the same one Start Wordlight.cmd uses, and the step that installs a downloaded update.
for(const name of ['start.mjs','supervisor.mjs','shared.mjs','update.mjs'])await add('tools/launcher/'+name,'app/tools/launcher/'+name);
// The installer: Install Wordlight.cmd runs it from the unzipped package, and the release offers it on its own for
// the one-line install (irm .../install.ps1 | iex). It copies the package to %LOCALAPPDATA%\Programs and adds shortcuts.
await add('tools/install.ps1','app/tools/install.ps1');
await add('tools/portable/Install Wordlight.cmd','Install Wordlight.cmd');
await add('tools/portable/Wordlight.ico','Wordlight.ico');
for(const name of (await readdir(path.join(repo,'dist'))).filter(n=>/\.(html|css|js|mjs)$/.test(n)).sort())await add('dist/'+name,'app/dist/'+name);
// The .cmd files do the same as the .vbs ones, for computers where VBScript is off or blocked (they show a window).
for(const name of ['Start Wordlight.vbs','Stop Wordlight.vbs','Start with Windows.vbs'])await add('tools/portable/'+name,name);
for(const name of ['Start Wordlight.cmd','Stop Wordlight.cmd'])await add('tools/portable/'+name,'Other ways to start/'+name);
files[top+'runtime/node.exe']=pick('node.exe');
files[top+'runtime/LICENSE.txt']=pick('LICENSE');
files[top+'README.txt']=Buffer.from(`Wordlight · Church Media ${version} (build ${build}, portable, Windows)

Install (recommended):
  1. If you are reading this inside the ZIP file, close it first: right-click the ZIP, choose Extract All, then Extract,
     and open the Wordlight folder that appears.
  2. Double-click "Install Wordlight". If Windows asks whether to run it, choose Run (or More info, then Run anyway).
  3. It copies Wordlight to your user folder, adds "Wordlight" and "Stop Wordlight" to the Desktop and the Start menu,
     and starts it. No administrator rights are needed. Afterwards this folder and the ZIP can be deleted.
  Without installing, the files below also work from this folder.

Start:  double-click "Start Wordlight". It starts Wordlight in the background and opens it in a window.
        Double-click it again at any time: it opens the running Wordlight instead of starting a second one.
        If Wordlight stops unexpectedly, it is started again by itself within a few seconds.
Stop:   double-click "Stop Wordlight". Closing the Wordlight window does not stop it, so OBS outputs keep working.
Start with Windows (optional): double-click "Start with Windows" to turn it on or off.
If Start does nothing (some computers turn VBScript off or an antivirus blocks it), use the files in
"Other ways to start": they do the same, in a small window you can close once Wordlight is running.

First time:
  1. Bible: the Bible tab looks up references (John 3:16, john 3 16) or the words of a verse.
  2. Projector: connect it, set Windows to Extend (Windows+P), then click Present in Wordlight.
  3. Phone remote (optional): Phone remote, set a password, Turn on, and scan the code with a phone on the same Wi-Fi.
  4. Stage display (optional): Stage shows the address for a screen facing the singers or the preacher.
  5. Songs: the Songs tab, Import songs (EasyWorship, ProPresenter, SongSelect, OpenLyrics, ChordPro, text or a
     Wordlight song library file).
  6. OBS (only if you stream): OBS & screens shows the steps and has a Copy button for each address.
  The Getting started bar at the top of Wordlight shows the next step and a button that does it.

Updates: Settings, Updates says when a newer version is out. Download update, then Restart now and install
between services. The previous version is kept, so Go back undoes it. Your shows are never moved.
Logs, if something goes wrong: %LOCALAPPDATA%\\Wordlight\\data\\logs

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

const fullName='Wordlight-portable-'+version+'-win-x64.zip',appName='Wordlight-app-'+version+'.zip';
const zip=writeZip(files);
// The update ZIP holds the same app files, with names starting "app/".
const appFiles=Object.fromEntries(Object.entries(files).filter(([name])=>name.startsWith(top+'app/')).map(([name,data])=>[name.slice(top.length),data]));
const missing=missingImports(appFiles);
if(missing.length)throw new Error('The package would be missing modules it imports; nothing was built:\n'+missing.join('\n'));
const appZip=writeZip(appFiles);
await writeFile(path.join(repo,'build',fullName),zip);await writeFile(path.join(repo,'build',appName),appZip);
// The companion ZIP the web studio offers for download, built from the same commit.
const companionName='wordlight-obs-companion.zip';
execFileSync(process.execPath,[path.join(repo,'tools','build-companion-zip.mjs'),'HEAD',path.join(repo,'build',companionName)],{stdio:'ignore'});
const companionZip=await readFile(path.join(repo,'build',companionName));
// The installer is a release file too, listed and signed with the others.
const installer=await readFile(path.join(repo,'tools','install.ps1'));await writeFile(path.join(repo,'build','install.ps1'),installer);
const releaseSums=Buffer.from(sha(zip)+'  '+fullName+'\n'+sha(appZip)+'  '+appName+'\n'+sha(companionZip)+'  '+companionName+'\n'+sha(installer)+'  install.ps1\n');
await writeFile(path.join(repo,'build','SHA256SUMS.txt'),releaseSums);
// Installed copies only accept an update whose checksums are signed with the release key (see RELEASE_KEY in
// updates.mjs). The private key never goes in the repository: by default it is in the maintainer's user folder.
const keyFile=process.env.WORDLIGHT_SIGNING_KEY||path.join(os.homedir(),'.wordlight-release','update-signing-key.pem');
let signed=false;
try{
 // Only a release check signs (npm run release-check): a release cannot skip the tests, the studio's browser tests
 // included. A build run on its own is for trying out and is not signed.
 if(!process.env.WORDLIGHT_RELEASE_CHECK)throw new Error('built outside npm run release-check');
 const signature=sign(null,releaseSums,createPrivateKey(await readFile(keyFile)));
 if(!signedByRelease(releaseSums,signature.toString('base64')))throw new Error('this key does not match RELEASE_KEY in updates.mjs');
 await writeFile(path.join(repo,'build','SHA256SUMS.txt.sig'),signature.toString('base64')+'\n');signed=true;
}catch(err){
 await rm(path.join(repo,'build','SHA256SUMS.txt.sig'),{force:true});
 console.error('NOT SIGNED ('+(err.code==='ENOENT'?'no key at '+keyFile:err.message)+'). Installed copies will refuse this release as an update.');
}
console.log('build '+build+(signed?', signed':''));
console.log(fullName+': '+Object.keys(files).length+' files, '+(zip.length/1e6).toFixed(1)+' MB, sha256 '+sha(zip));
console.log(appName+': '+Object.keys(appFiles).length+' files, '+(appZip.length/1e6).toFixed(2)+' MB, sha256 '+sha(appZip));
