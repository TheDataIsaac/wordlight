// Phone remote settings in the local studio: password, on/off, the addresses phones can open (with QR codes) and
// how many phones are connected. Talks only to the loopback companion's /api/remote/* routes.
import {qrSvg} from './qr.mjs';
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let dialog,status=null,note='',refreshTimer;

async function call(path,body){
 const r=await fetch(path,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(data.error||'The companion did not accept that.');
 return data;
}
async function refresh(){
 try{status=await call('/api/remote/status');}catch(err){status=null;note=err.message;}
 render();
}
function stateText(){
 if(!status)return 'The phone remote needs the local companion.';
 if(status.error)return status.error;
 if(!status.hasPassword)return 'Off. Set a password to turn it on.';
 if(!status.enabled)return 'Off.';
 if(!status.running)return 'Starting…';
 return 'On. '+(status.phones===1?'1 phone connected.':status.phones+' phones connected.');
}
function render(){
 if(!dialog?.open)return;
 // Keep anything typed in the password fields across the periodic refresh.
 const typed=[dialog.querySelector('#remotePassword')?.value||'',dialog.querySelector('#remotePassword2')?.value||''];
 const on=status?.enabled&&status?.running;
 const urls=on?status.urls:[];
 dialog.innerHTML='<div class="dialog-top"><span class="eyebrow">PHONE REMOTE</span><button class="icon-button" data-remote="close" aria-label="Close phone remote">×</button></div>'+
 '<h2 id="remoteTitle">Phone remote</h2>'+
 '<p class="remote-state" role="status">'+e(stateText())+'</p>'+
 '<p class="small-note">A phone on the same Wi-Fi can move slides, hide the screen, run the countdown and send a chosen slide. No account or internet is needed. Anyone with the address and the password can control the screen.</p>'+
 (status?'<div class="remote-section"><label class="label" for="remotePassword">'+(status.hasPassword?'New password':'Password')+'</label><div class="field-row"><input class="input" id="remotePassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="At least 8 characters"><input class="input" id="remotePassword2" type="password" autocomplete="new-password" maxlength="128" placeholder="Type it again" aria-label="Type the password again"></div>'+
 '<div class="remote-actions"><button class="button" data-remote="password">'+(status.hasPassword?'Change password':'Set password')+'</button>'+
 (status.hasPassword?'<button class="button '+(status.enabled?'':'primary')+'" data-remote="'+(status.enabled?'off':'on')+'">'+(status.enabled?'Turn off':'Turn on')+'</button>':'')+
 (status.enabled?'<button class="button" data-remote="signout">Sign out all phones</button>':'')+
 '</div><p class="small-note">Changing the password or turning the remote off signs out every phone.</p></div>':'')+
 (on?'<div class="remote-section"><h3 class="section-title">Open on the phone</h3>'+
  (urls.length?'<div class="remote-urls">'+urls.map(u=>'<figure class="remote-url">'+qrSvg(u.url,170)+'<figcaption><strong>'+e(u.url)+'</strong><span>'+e(u.name)+'</span></figcaption></figure>').join('')+'</div><p class="small-note">Scan the code or type the address, then enter the password. The code holds only the address.</p>'
  :'<p class="small-note">This computer has no Wi-Fi or Ethernet network address right now. Connect it to the same network as the phone.</p>')+
  '<details class="remote-help"><summary>The phone cannot open the page</summary><p class="small-note">Check that the phone is on the same Wi-Fi (not mobile data or a guest network, which often keeps devices apart). If Windows asks whether Node.js may communicate on networks, allow <strong>Private networks</strong> only. In Windows Settings, the Wi-Fi network should be set to Private. Wordlight does not change firewall settings itself.</p></details></div>':'')+
 (note?'<p class="dialog-feedback" role="alert">'+e(note)+'</p>':'');
 const fields=[dialog.querySelector('#remotePassword'),dialog.querySelector('#remotePassword2')];
 if(fields[0]){fields[0].value=typed[0];fields[1].value=typed[1];}
}
async function act(what){
 note='';
 try{
  if(what==='close'){dialog.close();return;}
  if(what==='password'){
   const a=dialog.querySelector('#remotePassword').value,b=dialog.querySelector('#remotePassword2').value;
   if(a.length<8){note='Use at least 8 characters.';render();return;}
   if(a!==b){note='The two passwords are different.';render();return;}
   status=await call('/api/remote/password',{password:a});
   dialog.querySelector('#remotePassword').value='';dialog.querySelector('#remotePassword2').value='';
   note=status.enabled?'Password changed. Phones need to sign in again.':'Password set. Turn the remote on when you need it.';
  }
  if(what==='on'||what==='off')status=await call('/api/remote/enabled',{enabled:what==='on'});
  if(what==='signout'){status=await call('/api/remote/signout',{});note='Every phone was signed out.';}
 }catch(err){note=err.message;}
 render();
}
export function openPhoneRemote(){
 if(!dialog){
  dialog=document.createElement('dialog');dialog.id='remoteDialog';dialog.setAttribute('aria-labelledby','remoteTitle');document.body.append(dialog);
  dialog.addEventListener('click',ev=>{const b=ev.target.closest('[data-remote]');if(b)act(b.dataset.remote);});
  dialog.addEventListener('close',()=>{clearInterval(refreshTimer);note='';});
 }
 note='';dialog.innerHTML='<p class="small-note">Loading…</p>';
 if(!dialog.open)dialog.showModal();
 refresh();
 // While the dialog is open, the connected-phone count and addresses are refreshed every 5 s from this computer.
 clearInterval(refreshTimer);refreshTimer=setInterval(()=>{if(!dialog.querySelector('input:focus'))refresh();},5000);
}
