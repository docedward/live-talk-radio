/**
 * Mic color presets for panel / host publish path.
 * WebAudio only — no server DSP. Goal: radio character, not studio HQ.
 */

export type MicFilterId = "off" | "radio" | "phone";

export const MIC_FILTER_OPTIONS: {
  id: MicFilterId;
  label: string;
  hint: string;
}[] = [
  { id: "off", label: "Clean", hint: "No filter" },
  { id: "radio", label: "Radio", hint: "AM booth color" },
  { id: "phone", label: "Phone", hint: "Narrow call-in" },
];

const STORAGE_KEY = "ltr-mic-filter";

export function loadMicFilter(): MicFilterId {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "radio" || v === "phone" || v === "off") return v;
  } catch {
    /* ignore */
  }
  return "off";
}

export function saveMicFilter(id: MicFilterId) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export type MicFilterSession = {
  /** Track to publish to LiveKit (filtered or raw). */
  outputTrack: MediaStreamTrack;
  /** Soft duck while clips play (0–1). No-op for raw "off" uses track.enabled. */
  setDuck: (duck: boolean) => void;
  stop: () => void;
};

function getAC(): typeof AudioContext {
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) throw new Error("Web Audio not supported");
  return AC;
}

/**
 * Capture mic and optionally run through a lo-fi filter graph.
 * Caller publishes `outputTrack` as microphone source.
 */
export async function startMicFilterSession(
  preset: MicFilterId
): Promise<MicFilterSession> {
  const raw = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
  const rawTrack = raw.getAudioTracks()[0];
  if (!rawTrack) {
    raw.getTracks().forEach((t) => t.stop());
    throw new Error("No microphone track");
  }

  if (preset === "off") {
    return {
      outputTrack: rawTrack,
      setDuck: (duck) => {
        rawTrack.enabled = !duck;
      },
      stop: () => {
        raw.getTracks().forEach((t) => t.stop());
      },
    };
  }

  const AC = getAC();
  const ac = new AC();
  await ac.resume().catch(() => undefined);

  const source = ac.createMediaStreamSource(raw);
  const dest = ac.createMediaStreamDestination();
  const duckGain = ac.createGain();
  duckGain.gain.value = 1;

  // Shared: cut rumble
  const highpass = ac.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = preset === "phone" ? 300 : 120;
  highpass.Q.value = 0.7;

  const lowpass = ac.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = preset === "phone" ? 3400 : 5200;
  lowpass.Q.value = 0.7;

  // Mild presence / AM color
  const mid = ac.createBiquadFilter();
  mid.type = "peaking";
  mid.frequency.value = preset === "radio" ? 1800 : 1200;
  mid.Q.value = 1.1;
  mid.gain.value = preset === "radio" ? 3.5 : 2;

  const makeup = ac.createGain();
  makeup.gain.value = preset === "phone" ? 1.15 : 1.05;

  // Very light noise bed for radio (not phone)
  if (preset === "radio") {
    const noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ac.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    const noiseGain = ac.createGain();
    noiseGain.gain.value = 0.012;
    const noiseFilter = ac.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 2000;
    noiseFilter.Q.value = 0.5;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(duckGain);
    noise.start();
  }

  source.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(mid);
  mid.connect(makeup);
  makeup.connect(duckGain);
  duckGain.connect(dest);

  const out = dest.stream.getAudioTracks()[0];
  if (!out) {
    raw.getTracks().forEach((t) => t.stop());
    void ac.close().catch(() => undefined);
    throw new Error("Filter graph produced no track");
  }

  return {
    outputTrack: out,
    setDuck: (duck) => {
      const g = duckGain.gain;
      const now = ac.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(duck ? 0.12 : 1, now + 0.08);
    },
    stop: () => {
      try {
        raw.getTracks().forEach((t) => t.stop());
        out.stop();
      } catch {
        /* ignore */
      }
      void ac.close().catch(() => undefined);
    },
  };
}
