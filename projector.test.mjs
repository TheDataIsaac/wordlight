// The projector button, with fakes in place of Windows and the browser: nothing is opened.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {parseScreens,chooseProjector,browserPaths,browserArgs,createProjector} from './projector.mjs';

const env={ProgramFiles:'C:\\Program Files',LOCALAPPDATA:'C:\\Users\\x\\AppData\\Local'};
function fakes(output){
 const started=[],scripts=[];
 const run=(file,args,options,done)=>{scripts.push(args.at(-1));done(null,args.at(-1).includes('Get-CimInstance')?'':output);};
 const start=(file,args)=>{started.push({file,args});return {on(){},unref(){}};};
 return {started,scripts,options:{url:'http://127.0.0.1:1/?view=output&projector=1',dataDir:'C:\\data',platform:'win32',env,exists:async()=>{},run,start}};
}
test('Screens are read from the Windows list, and the projector is the one that is not primary',()=>{
 const screens=parseScreens('True,0,0,1536,864\r\nFalse,1920,-353,3440,1440\r\n');
 assert.deepEqual(chooseProjector(screens),{primary:false,x:1920,y:-353,width:3440,height:1440});
 assert.equal(chooseProjector(parseScreens('True,0,0,1920,1080\n')),null);
 assert.deepEqual(parseScreens('garbage\n\n'),[]);
});
test('The window lands on the projector in kiosk mode with its own profile, and background slowing is off',()=>{
 const args=browserArgs('http://x/',{x:1920,y:-353},'C:\\data\\projector-browser');
 assert.ok(args.includes('--kiosk'));assert.ok(args.includes('--window-position=1970,-303'));assert.ok(args.includes('--user-data-dir=C:\\data\\projector-browser'));
 assert.ok(args.includes('--disable-backgrounding-occluded-windows'));assert.equal(args.at(-1),'http://x/');
 assert.match(browserPaths(env)[0],/Chrome.*chrome\.exe$/);assert.match(browserPaths(env).at(-1),/Edge.*msedge\.exe$/);
});
test('Opening starts one browser on the projector; no second screen is a clear message and starts nothing',async()=>{
 const two=fakes('True,0,0,1536,864\nFalse,1536,0,1920,1080\n');
 assert.deepEqual(await createProjector(two.options).open(),{ok:true,screen:{width:1920,height:1080}});
 assert.equal(two.started.length,1);assert.match(two.started[0].file,/chrome\.exe$/);assert.equal(two.started[0].args.at(-1),two.options.url);
 const one=fakes('True,0,0,1920,1080\n');
 await assert.rejects(createProjector(one.options).open(),/No projector found.*Extend/);assert.equal(one.started.length,0);
});
test('A browser that is missing, or Windows not answering, is reported; closing touches only this profile',async()=>{
 const none=fakes('');
 await assert.rejects(createProjector({...none.options,exists:async()=>{throw new Error('missing');}}).open(),/Chrome or Edge was not found/);
 await assert.rejects(createProjector({...none.options,run:(f,a,o,done)=>done(new Error('no'))}).open(),/did not say which screens/);
 await assert.rejects(createProjector({...none.options,platform:'linux'}).open(),/Windows only/);
 const closing=fakes('');await createProjector(closing.options).close();
 assert.ok(closing.scripts[0].includes("[regex]::Escape('C:\\data\\projector-browser')"),closing.scripts[0]);
});
// A slip in the escaping once stopped the real close from matching anything, and fakes can't show that. So the pattern
// goes through real PowerShell here, against sample text. No process is looked at or stopped.
test('The close pattern finds only this folder, in real PowerShell',{skip:process.platform!=='win32'},async()=>{
 const closing=fakes('');
 await createProjector({...closing.options,dataDir:'C:\\Temp\\wl data'}).close();
 const pattern=closing.scripts[0].match(/-match \((.*?)\)\}\|/)[1],folder='C:\\Temp\\wl data\\projector-browser';
 const samples=[['"--user-data-dir='+folder+'" --kiosk',true],['x --user-data-dir='+folder+' --type=gpu',true],['x --user-data-dir='+folder,true],['"--user-data-dir='+folder+'\\second\\projector-browser" --kiosk',false],['x --user-data-dir=C:\\other\\projector-browser',false]];
 const script='$p=('+pattern+');'+samples.map(([line])=>"("+"'"+line+"' -match $p)").join(';');
 const output=await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:15000},(err,stdout)=>err?reject(err):resolve(stdout)));
 assert.deepEqual(output.trim().split(/\r?\n/).map(line=>line.trim()==='True'),samples.map(([,wanted])=>wanted));
});
