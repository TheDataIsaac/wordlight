// Everything a release must pass, in order, stopping at the first failure: every test with the studio's browser tests
// required (not skipped), the release build, then the smoke check of the built package.
//   npm run release-check
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repo=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const tests=JSON.parse(readFileSync(path.join(repo,'package.json'),'utf8')).scripts.test.replace(/^node --test /,'').split(/\s+/);
const steps=[['Tests',['--test',...tests]],['Build',['tools/build-portable.mjs']],['Package smoke check',['tools/smoke-package.mjs']]];
for(const [name,args] of steps){
 console.log('\n== '+name);
 const run=spawnSync(process.execPath,args,{cwd:repo,stdio:'inherit',env:{...process.env,WORDLIGHT_RELEASE_CHECK:'1'}});
 if(run.status!==0){console.error('\nRelease check stopped: '+name+' failed.');process.exit(1);}
}
console.log('\nRelease check passed.');
