export class KokoroVoice {
  constructor(status) { this.status = status; this.id = 0; this.ready = false; }
  async load() {
    if (this.ready) return;
    if (this.loading) return this.loading;
    this.status('Downloading Kokoro for local speech. This may take a few minutes.');
    this.worker ??= new Worker(new URL('./kokoro-worker.js',import.meta.url),{ type:'module' });
    this.worker.onmessage = ({ data }) => {
      if (data.id !== this.id) return;
      if (data.type === 'ready') { this.ready = true; this.resolveLoad?.(); this.status('Kokoro ready • local WASM voice'); }
      if (data.type === 'error') { this.rejectLoad?.(new Error('Kokoro unavailable')); this.onFailure?.(); this.status('Kokoro failed; browser voices selected.'); }
      if (data.type === 'audio') {
        try {
          this.context ??= new AudioContext(); void this.context.resume();
          const buffer = this.context.createBuffer(1,data.samples.length,data.sampleRate); buffer.copyToChannel(data.samples,0);
          this.source = this.context.createBufferSource(); this.source.buffer = buffer; this.source.connect(this.context.destination);
          this.source.onended = () => { if (data.id === this.id) this.onEnd?.(); }; this.source.start();
        } catch { this.onFailure?.(); }
      }
    };
    this.worker.onerror = () => { this.rejectLoad?.(new Error('Kokoro worker unavailable')); this.onFailure?.(); this.status('Kokoro failed; browser voices selected.'); };
    this.loading = new Promise((resolve,reject) => {
      this.resolveLoad = resolve; this.rejectLoad = reject;
      this.loadTimer = setTimeout(() => { this.worker.terminate(); this.worker = null; reject(new Error('Kokoro download timed out')); },180000);
      this.worker.postMessage({ type:'load',id:++this.id });
    }).finally(() => { clearTimeout(this.loadTimer); this.loading = null; this.resolveLoad = null; this.rejectLoad = null; });
    return this.loading;
  }
  stop() {
    this.onEnd = null; this.onFailure = null;
    if (this.loading) return;
    this.id++;
    if (this.source) { this.source.onended = null; try { this.source.stop(); } catch { /* already ended */ } this.source = null; }
    if (!this.loading) this.worker?.postMessage({ type:'cancel',id:this.id });
  }
  speak(text,voice,rate,onEnd,onFailure) {
    this.stop(); this.onEnd = onEnd; this.onFailure = onFailure;
    this.worker.postMessage({ type:'speak',id:this.id,text,voice,rate });
  }
}
