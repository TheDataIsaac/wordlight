// Verse listening, measured on a recording (see README, Verse listening). Streams a 16 kHz mono WAV through the
// speech model the way live audio arrives (0.1 s at a time) and writes the finished phrases with their times, how much
// faster than real time it ran, and how many processor cores it kept busy.
//   node tools/listen-eval/transcribe.mjs <engineDir> <modelDir> <wav> <threads> <out.json> [seconds]
// engineDir and modelDir are the engine and model folders of an installed copy (<data>\listen\engine and \model).
// Make the WAV with: ffmpeg -i recording.mkv -map 0:a:0 -af "pan=mono|c0=FL+FR" -ar 16000 -c:a pcm_s16le sermon.wav
import {createRequire} from 'node:module';
import {readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const [engineDir,modelDir,wavPath,threads='1',outPath,limitSeconds]=process.argv.slice(2);
const sherpa=createRequire(path.join(engineDir,'package.json'))('sherpa-onnx-node');
const files=readdirSync(modelDir);
const pick=prefix=>{const f=files.filter(n=>n.startsWith(prefix)&&n.endsWith('.onnx'));return path.join(modelDir,(f.find(n=>n.includes('int8'))||f[0]));};
const config={
 featConfig:{sampleRate:16000,featureDim:80},
 modelConfig:{transducer:{encoder:pick('encoder'),decoder:pick('decoder'),joiner:pick('joiner')},tokens:path.join(modelDir,'tokens.txt'),numThreads:Number(threads),provider:'cpu',debug:0},
 decodingMethod:'greedy_search',
 enableEndpoint:true,rule1MinTrailingSilence:2.4,rule2MinTrailingSilence:1.0,rule3MinUtteranceLength:15,
};
const recognizer=new sherpa.OnlineRecognizer(config);
const wave=sherpa.readWave(wavPath);
const total=limitSeconds?Math.min(wave.samples.length,Number(limitSeconds)*wave.sampleRate):wave.samples.length;
const stream=recognizer.createStream();
const step=wave.sampleRate/10,phrases=[];
let start=0,fed=0;
const cpu0=process.cpuUsage(),t0=Date.now();
for(let i=0;i<total;i+=step){
 const chunk=wave.samples.subarray(i,Math.min(total,i+step));
 stream.acceptWaveform({samples:chunk,sampleRate:wave.sampleRate});fed+=chunk.length;
 while(recognizer.isReady(stream))recognizer.decode(stream);
 if(recognizer.isEndpoint(stream)){
  const text=recognizer.getResult(stream).text.trim();
  if(text)phrases.push({start:+start.toFixed(2),end:+(fed/wave.sampleRate).toFixed(2),text});
  recognizer.reset(stream);start=fed/wave.sampleRate;
 }
}
stream.inputFinished();while(recognizer.isReady(stream))recognizer.decode(stream);
const last=recognizer.getResult(stream).text.trim();if(last)phrases.push({start,end:fed/wave.sampleRate,text:last});
const seconds=(Date.now()-t0)/1000,audio=total/wave.sampleRate,cpu=process.cpuUsage(cpu0);
const report={model:path.basename(modelDir),threads:Number(threads),audioSeconds:audio,wallSeconds:seconds,rtf:+(seconds/audio).toFixed(3),cpuCoresBusy:+(((cpu.user+cpu.system)/1e6)/seconds).toFixed(2),phrases};
writeFileSync(outPath,JSON.stringify(report,null,1));
console.log(report.model,'threads',threads,'audio',audio.toFixed(0)+'s','RTF',report.rtf,'cores busy',report.cpuCoresBusy,'phrases',phrases.length);
