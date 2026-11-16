// Verse listening: hands the sound desk's samples to the studio page, which sends them to the companion.
// The page opens its AudioContext at 16 kHz, so the browser has already resampled what arrives here.
class ListenCapture extends AudioWorkletProcessor{
 process(inputs){
  const channel=inputs[0]?.[0];
  if(channel)this.port.postMessage(channel.slice(0));
  return true;
 }
}
registerProcessor('listen-capture',ListenCapture);
