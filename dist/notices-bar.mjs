// The notices bar at the top of the local studio: an update installed or refused at start, or shows opened from a
// backup. Each stays until the operator dismisses it (see notices.mjs on the companion).
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let notices=[];

export function paintNotices(){
 const bar=document.getElementById('noticeBar');if(!bar)return;
 bar.hidden=!notices.length;
 bar.innerHTML=notices.map(n=>'<div class="notice notice-'+(n.level==='warning'?'warning':'info')+'" role="status"><span>'+e(n.text)+'</span><button class="button" data-notice="'+e(n.id)+'">OK</button></div>').join('');
}
export async function loadNotices(){
 try{const r=await fetch('/api/notices',{cache:'no-store'});if(r.ok)notices=(await r.json()).notices||[];}catch{}
 paintNotices();
}
document.addEventListener('click',async ev=>{
 const id=ev.target.closest?.('[data-notice]')?.dataset.notice;if(!id)return;
 notices=notices.filter(n=>n.id!==id);paintNotices();
 try{await fetch('/api/notices/dismiss',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});}catch{}
});
