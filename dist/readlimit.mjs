// Reads a fetch response up to a byte limit, so an unexpected or oversized response cannot use unbounded memory.
// A declared Content-Length over the limit is refused before reading; otherwise the body is read as it streams in
// and the download is cancelled as soon as it passes the limit. Used by the companion and the studio page.
export async function readLimited(response,limit,what='The response'){
 const tooLarge=()=>Object.assign(new Error(what+' is larger than expected.'),{status:413});
 if(Number(response.headers?.get('content-length'))>limit){await response.body?.cancel().catch(()=>{});throw tooLarge();}
 if(!response.body){const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>limit)throw tooLarge();return bytes;}
 const reader=response.body.getReader(),chunks=[];let total=0;
 for(;;){
  const {done,value}=await reader.read();if(done)break;
  total+=value.length;if(total>limit){await reader.cancel().catch(()=>{});throw tooLarge();}
  chunks.push(value);
 }
 const bytes=new Uint8Array(total);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
 return bytes;
}
export async function readLimitedJSON(response,limit,what){return JSON.parse(new TextDecoder().decode(await readLimited(response,limit,what)));}
