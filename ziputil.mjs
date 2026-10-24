// Minimal ZIP reader for one entry at a time (stored or deflated), enough for official Bible text archives.
// It reads the central directory, checks sizes against a limit and verifies each entry's CRC-32.
import {inflateRawSync,deflateRawSync,crc32} from 'node:zlib';

// Writes a ZIP from {name: Buffer}. Names use forward slashes; files only, no folder entries.
export function writeZip(files){
 const parts=[],central=[];let offset=0;
 for(const [name,data] of Object.entries(files)){
  const packed=deflateRawSync(data,{level:9}),nameBuf=Buffer.from(name,'utf8'),crc=crc32(data);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x0800,6);local.writeUInt16LE(8,8);
  local.writeUInt32LE(crc,14);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(nameBuf.length,26);
  const dir=Buffer.alloc(46);dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);dir.writeUInt16LE(0x0800,8);dir.writeUInt16LE(8,10);
  dir.writeUInt32LE(crc,16);dir.writeUInt32LE(packed.length,20);dir.writeUInt32LE(data.length,24);dir.writeUInt16LE(nameBuf.length,28);dir.writeUInt32LE(offset,42);
  parts.push(local,nameBuf,packed);central.push(dir,nameBuf);offset+=30+nameBuf.length+packed.length;
 }
 const dir=Buffer.concat(central),end=Buffer.alloc(22),count=central.length/2;
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(count,8);end.writeUInt16LE(count,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...parts,dir,end]);
}

export function zipEntries(buf){
 const min=Math.max(0,buf.length-65557);let end=-1;
 for(let i=buf.length-22;i>=min;i--)if(buf.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw new Error('This is not a ZIP file.');
 const count=buf.readUInt16LE(end+10),entries=[];let at=buf.readUInt32LE(end+16);
 for(let n=0;n<count;n++){
  if(at+46>buf.length||buf.readUInt32LE(at)!==0x02014b50)throw new Error('The ZIP directory is damaged.');
  const method=buf.readUInt16LE(at+10),crc=buf.readUInt32LE(at+16),packed=buf.readUInt32LE(at+20),size=buf.readUInt32LE(at+24);
  const nameLength=buf.readUInt16LE(at+28),extra=buf.readUInt16LE(at+30),comment=buf.readUInt16LE(at+32),offset=buf.readUInt32LE(at+42);
  entries.push({name:buf.toString('utf8',at+46,at+46+nameLength),method,crc,packed,size,offset});
  at+=46+nameLength+extra+comment;
 }
 return entries;
}

export function readZipEntry(buf,entry,limit){
 if(entry.size>limit)throw new Error(entry.name+' is larger than expected.');
 const at=entry.offset;
 if(at+30>buf.length||buf.readUInt32LE(at)!==0x04034b50)throw new Error('The ZIP entry '+entry.name+' is damaged.');
 const start=at+30+buf.readUInt16LE(at+26)+buf.readUInt16LE(at+28),raw=buf.subarray(start,start+entry.packed);
 const data=entry.method===0?Buffer.from(raw):entry.method===8?inflateRawSync(raw,{maxOutputLength:limit}):null;
 if(!data)throw new Error(entry.name+' uses an unsupported compression method.');
 if(data.length!==entry.size||crc32(data)!==entry.crc)throw new Error(entry.name+' failed its checksum.');
 return data;
}
