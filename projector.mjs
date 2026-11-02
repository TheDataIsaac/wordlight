// One click puts the audience output on the projector, full screen, with nothing else on it. It runs in its own browser
// window in kiosk mode: no tabs and no taskbar, it stays full screen through a reload, and a hidden studio tab cannot
// slow it down. The browser has its own profile folder in the data folder, so the operator's browser is left alone.
import {spawn,execFile} from 'node:child_process';
import {access} from 'node:fs/promises';
import path from 'node:path';

const PROFILE='projector-browser',COMMAND_MS=8000;
const fail=(status,message)=>Object.assign(new Error(message),{status});
const powershell=(script,run)=>new Promise((resolve,reject)=>run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{timeout:COMMAND_MS,windowsHide:true},(err,stdout)=>err?reject(err):resolve(String(stdout))));
const LIST_SCREENS="Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.Screen]::AllScreens|ForEach-Object{$b=$_.Bounds;'{0},{1},{2},{3},{4}' -f $_.Primary,$b.X,$b.Y,$b.Width,$b.Height}";
// Only the window using this exact folder: another copy of Wordlight on this laptop keeps its projector.
const closeScript=folder=>"Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' or Name='msedge.exe'\"|Where-Object{$_.CommandLine -match ('--user-data-dir='+[regex]::Escape('"+folder.replace(/'/g,"''")+"')+'(\"|\\s|$)')}|ForEach-Object{Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue}";

// One line per screen: primary,x,y,width,height.
export function parseScreens(text){
 return String(text).split(/\r?\n/).map(line=>line.trim().split(',')).filter(cells=>cells.length===5&&cells.slice(1).every(n=>Number.isFinite(Number(n))))
  .map(([primary,x,y,width,height])=>({primary:primary==='True',x:Number(x),y:Number(y),width:Number(width),height:Number(height)}));
}
// With a duplicated display Windows reports one screen, so the operator is told to choose Extend.
export const chooseProjector=screens=>screens.find(s=>!s.primary)||null;
export function browserPaths(env=process.env){
 const roots=[env.ProgramFiles,env['ProgramFiles(x86)'],env.LOCALAPPDATA].filter(Boolean);
 return [...roots.map(root=>path.win32.join(root,'Google','Chrome','Application','chrome.exe')),...roots.map(root=>path.win32.join(root,'Microsoft','Edge','Application','msedge.exe'))];
}
// The position only has to land on the projector: kiosk mode then fills that screen. The three background settings keep
// it running at full speed when another window has focus.
export function browserArgs(url,screen,profile){
 return ['--user-data-dir='+profile,'--kiosk','--window-position='+(screen.x+50)+','+(screen.y+50),'--no-first-run','--no-default-browser-check','--disable-session-crashed-bubble','--hide-crash-restore-bubble','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',url];
}
export function createProjector({url,dataDir,platform=process.platform,env=process.env,exists=access,run=execFile,start=spawn}){
 const profile=path.join(dataDir,PROFILE);
 async function findBrowser(){
  for(const file of browserPaths(env)){try{await exists(file);return file;}catch{}}
  throw fail(404,'Chrome or Edge was not found on this computer.');
 }
 return {
  async open(){
   if(platform!=='win32')throw fail(400,'The projector button works on Windows only.');
   const browser=await findBrowser();
   let screens;try{screens=parseScreens(await powershell(LIST_SCREENS,run));}catch{throw fail(500,'Windows did not say which screens are connected.');}
   const screen=chooseProjector(screens);
   if(!screen)throw fail(409,'No projector found. Press Windows+P and choose Extend.');
   const child=start(browser,browserArgs(url,screen,profile),{detached:true,stdio:'ignore',windowsHide:false});
   child.on('error',()=>{});child.unref();
   return {ok:true,screen:{width:screen.width,height:screen.height}};
  },
  // Only windows using this profile folder are closed, never the operator's own browser.
  async close(){
   if(platform!=='win32')return {ok:true};
   try{await powershell(closeScript(profile),run);}catch{throw fail(500,'The projector window could not be closed. Click it and press Alt+F4.');}
   return {ok:true};
  }
 };
}
