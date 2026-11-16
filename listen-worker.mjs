// Verse listening: the speech recognition process. listen.mjs starts it with fork() and lowered priority, sends it
// audio (16 kHz mono, 16-bit) and receives the words heard. It runs apart from the companion so that a slow computer
// only delays the words, never the screen, and so a crash here never stops Wordlight.
// Messages in:  {type:'audio', samples:Int16 buffer}  {type:'reset'}
// Messages out: {type:'ready'}  {type:'partial', text}  {type:'phrase', text, seconds}  {type:'error', message}
//               {type:'ack'} after each piece of audio, so listen.mjs knows how far behind recognition is
import {createRequire} from 'node:module';
import path from 'node:path';

const [engineDir,modelDir,threads='1']=process.argv.slice(2);
let recognizer,stream,heardSeconds=0;
try{
 const sherpa=createRequire(path.join(engineDir,'package.json'))('sherpa-onnx-node');
 recognizer=new sherpa.OnlineRecognizer({
  featConfig:{sampleRate:16000,featureDim:80},
  modelConfig:{transducer:{encoder:path.join(modelDir,'encoder.int8.onnx'),decoder:path.join(modelDir,'decoder.int8.onnx'),joiner:path.join(modelDir,'joiner.int8.onnx')},
   tokens:path.join(modelDir,'tokens.txt'),numThreads:Number(threads),provider:'cpu',debug:0},
  decodingMethod:'greedy_search',
  // A phrase ends after a short pause (1 s once words were heard) or after 15 s of speech, whichever comes first.
  enableEndpoint:true,rule1MinTrailingSilence:2.4,rule2MinTrailingSilence:1.0,rule3MinUtteranceLength:15,
 });
 stream=recognizer.createStream();
 process.send({type:'ready'});
}catch(err){process.send({type:'error',message:'The speech engine could not start: '+(err?.message||err)});process.exit(1);}

let lastPartial='';
process.on('message',message=>{
 if(message?.type==='reset'){stream=recognizer.createStream();lastPartial='';return;}
 if(message?.type!=='audio')return;
 const bytes=Buffer.from(message.samples),pcm=new Int16Array(bytes.buffer,bytes.byteOffset,bytes.length>>1);
 const samples=new Float32Array(pcm.length);for(let i=0;i<pcm.length;i++)samples[i]=pcm[i]/32768;
 heardSeconds+=samples.length/16000;
 stream.acceptWaveform({samples,sampleRate:16000});
 while(recognizer.isReady(stream))recognizer.decode(stream);
 const text=recognizer.getResult(stream).text.trim();
 if(recognizer.isEndpoint(stream)){
  if(text)process.send({type:'phrase',text,seconds:heardSeconds});
  recognizer.reset(stream);lastPartial='';
 }else if(text!==lastPartial){lastPartial=text;process.send({type:'partial',text});}
 process.send({type:'ack'});
});
process.on('disconnect',()=>process.exit(0));
