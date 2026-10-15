// Optional, explicit download. No credentials or network TTS API.
let tts, latest = 0, queue = Promise.resolve();
self.onmessage = ({ data }) => {
  if (data.type === 'cancel') { latest = data.id; return; }
  latest = data.id;
  queue = queue.catch(() => {}).then(async () => {
    if (data.id !== latest) return;
    try {
      if (!tts) {
        const { KokoroTTS } = await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm');
        tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',{ dtype:'q8',device:'wasm' });
      }
      if (data.id !== latest) return;
      if (data.type === 'load') { self.postMessage({ type:'ready',id:data.id }); return; }
      const audio = await tts.generate(data.text,{ voice:data.voice || 'af_heart',speed:data.rate || 1 });
      if (data.id === latest) self.postMessage({ type:'audio',id:data.id,samples:audio.audio,sampleRate:audio.sampling_rate },[audio.audio.buffer]);
    } catch { self.postMessage({ type:'error',id:data.id }); }
  });
};
