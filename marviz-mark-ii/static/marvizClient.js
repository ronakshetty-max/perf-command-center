class MarvizWebVoiceClient {
  constructor(socketUrl, onStateUpdateCallback) {
    this.socketUrl = socketUrl;
    this.onStateUpdate = onStateUpdateCallback;
    this.ws = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.onMessage = null;

    // Called with each incremental text delta as Marviz's answer streams in,
    // BEFORE the full final response (onMessage) arrives. Lets the UI show/
    // speak partial text sooner instead of waiting for the whole turn.
    this.onTextChunk = null;

    // Live waveform visualization while recording. onAudioLevel(dataArray) is
    // called on every animation frame with time-domain samples (Uint8Array,
    // values 0-255, 128 = silence) from a Web Audio AnalyserNode tapped off
    // the same mic stream MediaRecorder is using — this is real captured
    // audio, not a decorative animation.
    this.onAudioLevel = null;
    this._audioContext = null;
    this._analyser = null;
    this._rafId = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.socketUrl);

      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);

      this.ws.onmessage = (event) => {
        const response = JSON.parse(event.data);

        if (response.type === "text_chunk") {
          if (this.onTextChunk) this.onTextChunk(response.text);
          return;
        }

        if (this.onMessage) this.onMessage(response);

        if (response.dashboard_payload && this.onStateUpdate) {
          this.onStateUpdate(response.dashboard_payload);
        }

        if (response.audio_base64) {
          const audio = new Audio(`data:audio/mp3;base64,${response.audio_base64}`);
          audio.play();
        }
      };
    });
  }

  sendText(text) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "text", text }));
    }
  }

  async startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    this.audioChunks = [];

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.audioChunks.push(event.data);
    };

    this.mediaRecorder.onstop = () => {
      const audioBlob = new Blob(this.audioChunks, { type: "audio/webm" });
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(audioBlob);
      }
      stream.getTracks().forEach((t) => t.stop());
      this._stopWaveform();
    };

    this.mediaRecorder.start();
    this._startWaveform(stream);
  }

  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
  }

  _startWaveform(stream) {
    if (!this.onAudioLevel) return;

    this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = this._audioContext.createMediaStreamSource(stream);
    this._analyser = this._audioContext.createAnalyser();
    this._analyser.fftSize = 256;
    source.connect(this._analyser);

    const dataArray = new Uint8Array(this._analyser.frequencyBinCount);
    const tick = () => {
      this._analyser.getByteTimeDomainData(dataArray);
      this.onAudioLevel(dataArray);
      this._rafId = requestAnimationFrame(tick);
    };
    tick();
  }

  _stopWaveform() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._audioContext) {
      this._audioContext.close();
      this._audioContext = null;
    }
    this._analyser = null;
    if (this.onAudioLevel) this.onAudioLevel(null);
  }
}
