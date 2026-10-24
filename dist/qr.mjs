// QR code encoder for short text such as the phone remote address. Byte mode, error correction level M,
// versions 1 to 10 (up to 213 bytes). Follows ISO/IEC 18004 in the same steps as Project Nayuki's
// QR Code generator (MIT licence): data bits, Reed-Solomon blocks, function patterns, codeword placement, mask.
const ECC_PER_BLOCK=[0,10,16,26,18,24,16,18,22,22,26];
const BLOCKS=[0,1,1,1,2,2,4,4,4,5,5];
const FORMAT_M=0;

function rawModules(ver){
 let n=(16*ver+128)*ver+64;
 if(ver>=2){const align=Math.floor(ver/7)+2;n-=(25*align-10)*align-55;if(ver>=7)n-=36;}
 return n;
}
const dataCodewords=ver=>Math.floor(rawModules(ver)/8)-ECC_PER_BLOCK[ver]*BLOCKS[ver];

// Galois field GF(2^8) with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1.
function gfMultiply(x,y){let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11d);z^=((y>>>i)&1)*x;}return z&0xff;}
function rsDivisor(degree){
 const result=new Array(degree).fill(0);result[degree-1]=1;let root=1;
 for(let i=0;i<degree;i++){
  for(let j=0;j<result.length;j++){result[j]=gfMultiply(result[j],root);if(j+1<result.length)result[j]^=result[j+1];}
  root=gfMultiply(root,2);
 }
 return result;
}
export function rsRemainder(data,divisor){
 const result=new Array(divisor.length).fill(0);
 for(const b of data){const factor=b^result.shift();result.push(0);divisor.forEach((coef,i)=>{result[i]^=gfMultiply(coef,factor);});}
 return result;
}
export const rsEcc=(data,degree)=>rsRemainder(data,rsDivisor(degree));

function encodeData(bytes,ver){
 const bits=[];const put=(value,length)=>{for(let i=length-1;i>=0;i--)bits.push((value>>>i)&1);};
 put(4,4);put(bytes.length,ver<10?8:16);for(const b of bytes)put(b,8);
 const capacity=dataCodewords(ver)*8;
 put(0,Math.min(4,capacity-bits.length));put(0,(8-bits.length%8)%8);
 const codewords=[];for(let i=0;i<bits.length;i+=8)codewords.push(parseInt(bits.slice(i,i+8).join(''),2));
 for(let pad=0xec;codewords.length<capacity/8;pad^=0xec^0x11)codewords.push(pad);
 return codewords;
}
// Splits the data into blocks, adds error correction to each, and interleaves them.
function withEcc(data,ver){
 const count=BLOCKS[ver],eccLen=ECC_PER_BLOCK[ver],raw=Math.floor(rawModules(ver)/8);
 const shortCount=count-raw%count,shortLen=Math.floor(raw/count),divisor=rsDivisor(eccLen),blocks=[];
 for(let i=0,k=0;i<count;i++){
  const block=data.slice(k,k+shortLen-eccLen+(i<shortCount?0:1));k+=block.length;
  const ecc=rsRemainder(block,divisor);if(i<shortCount)block.push(0);blocks.push(block.concat(ecc));
 }
 const result=[];
 for(let i=0;i<blocks[0].length;i++)blocks.forEach((block,j)=>{if(i!==shortLen-eccLen||j>=shortCount)result.push(block[i]);});
 return result;
}
function alignmentPositions(ver,size){
 if(ver===1)return [];
 const count=Math.floor(ver/7)+2,step=Math.ceil((ver*4+4)/(count*2-2))*2,result=[6];
 for(let pos=size-7;result.length<count;pos-=step)result.splice(1,0,pos);
 return result;
}
export function formatBits(mask){
 const data=(FORMAT_M<<3)|mask;let rem=data;for(let i=0;i<10;i++)rem=(rem<<1)^((rem>>>9)*0x537);
 return ((data<<10)|rem)^0x5412;
}
const MASKS=[(x,y)=>(x+y)%2===0,(x,y)=>y%2===0,(x,y)=>x%3===0,(x,y)=>(x+y)%3===0,(x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0,(x,y)=>x*y%2+x*y%3===0,(x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0];

function buildMatrix(ver,codewords,mask){
 const size=ver*4+17,dark=[...Array(size)].map(()=>new Array(size).fill(false)),fixed=[...Array(size)].map(()=>new Array(size).fill(false));
 const set=(x,y,on)=>{dark[y][x]=on;fixed[y][x]=true;};
 for(let i=0;i<size;i++){set(6,i,i%2===0);set(i,6,i%2===0);}
 for(const [cx,cy] of [[3,3],[size-4,3],[3,size-4]])
  for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const x=cx+dx,y=cy+dy,d=Math.max(Math.abs(dx),Math.abs(dy));if(x>=0&&x<size&&y>=0&&y<size)set(x,y,d!==2&&d!==4);}
 const align=alignmentPositions(ver,size),last=align.length-1;
 align.forEach((ax,i)=>align.forEach((ay,j)=>{
  if((i===0&&j===0)||(i===0&&j===last)||(i===last&&j===0))return;
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(ax+dx,ay+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);
 }));
 const format=formatBits(mask),bit=(v,i)=>((v>>>i)&1)===1;
 for(let i=0;i<=5;i++)set(8,i,bit(format,i));
 set(8,7,bit(format,6));set(8,8,bit(format,7));set(7,8,bit(format,8));
 for(let i=9;i<15;i++)set(14-i,8,bit(format,i));
 for(let i=0;i<8;i++)set(size-1-i,8,bit(format,i));
 for(let i=8;i<15;i++)set(8,size-15+i,bit(format,i));
 set(8,size-8,true);
 if(ver>=7){
  let rem=ver;for(let i=0;i<12;i++)rem=(rem<<1)^((rem>>>11)*0x1f25);
  const bits=(ver<<12)|rem;
  for(let i=0;i<18;i++){const a=size-11+i%3,b=Math.floor(i/3);set(a,b,bit(bits,i));set(b,a,bit(bits,i));}
 }
 // Codewords go in two-module columns, zigzagging up and down from the bottom right, skipping the timing column.
 let i=0;
 for(let right=size-1;right>=1;right-=2){
  if(right===6)right=5;
  for(let vert=0;vert<size;vert++)for(let j=0;j<2;j++){
   const x=right-j,upward=((right+1)&2)===0,y=upward?size-1-vert:vert;
   if(!fixed[y][x]&&i<codewords.length*8){dark[y][x]=bit(codewords[i>>>3],7-(i&7));i++;}
  }
 }
 for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(!fixed[y][x]&&MASKS[mask](x,y))dark[y][x]=!dark[y][x];
 return dark;
}
// Lower is better: long runs, 2x2 blocks, finder-like patterns and an uneven dark/light balance all add points.
function penalty(dark){
 const size=dark.length;let score=0,count=0;
 const lines=[];for(let i=0;i<size;i++){lines.push(dark[i]);lines.push(dark.map(row=>row[i]));}
 for(const line of lines){
  let run=1;for(let i=1;i<=size;i++){if(i<size&&line[i]===line[i-1])run++;else{if(run>=5)score+=run-2;run=1;}}
  const text=line.map(v=>v?1:0).join('');
  for(const pattern of ['10111010000','00001011101'])for(let at=text.indexOf(pattern);at>=0;at=text.indexOf(pattern,at+1))score+=40;
 }
 for(let y=0;y<size-1;y++)for(let x=0;x<size-1;x++){const c=dark[y][x];if(c===dark[y][x+1]&&c===dark[y+1][x]&&c===dark[y+1][x+1])score+=3;}
 for(const row of dark)for(const v of row)if(v)count++;
 return score+Math.floor(Math.abs(count*20-size*size*10)/(size*size))*10;
}
// Returns the modules as rows of booleans (true = dark), without the quiet zone.
export function qrMatrix(text){
 const bytes=[...new TextEncoder().encode(String(text))];
 let ver=1;while(ver<=10&&dataCodewords(ver)<bytes.length+(ver<10?2:3))ver++;
 if(ver>10)throw new Error('The text is too long for this QR code.');
 const codewords=withEcc(encodeData(bytes,ver),ver);
 let best=null,bestScore=Infinity;
 for(let mask=0;mask<8;mask++){const m=buildMatrix(ver,codewords,mask),s=penalty(m);if(s<bestScore){best=m;bestScore=s;}}
 return best;
}
// An SVG with a four-module quiet zone; one path for all dark modules.
export function qrSvg(text,pixels=200){
 const dark=qrMatrix(text),size=dark.length+8;let d='';
 dark.forEach((row,y)=>row.forEach((on,x)=>{if(on)d+='M'+(x+4)+' '+(y+4)+'h1v1h-1z';}));
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+size+' '+size+'" width="'+pixels+'" height="'+pixels+'" shape-rendering="crispEdges" role="img"><rect width="'+size+'" height="'+size+'" fill="#fff"/><path d="'+d+'" fill="#000"/></svg>';
}
