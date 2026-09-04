/**
 * Procedural weather audio (WebAudio, no asset files):
 * rain bed, wind, thunder rumble, and short water/land impact "plinks".
 */

import reelWindingAsset from "@/assets/reel-winding.wav.asset.json";
import bobberSplashAsset from "@/assets/bobber-splash.wav.asset.json";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

// ---- uploaded sample buffers (reel winding + bobber splash) ----
let reelBuffer: AudioBuffer | null = null;
let splashBuffer: AudioBuffer | null = null;
let reelSample: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let reelLoad: Promise<AudioBuffer | null> | null = null;
let splashLoad: Promise<AudioBuffer | null> | null = null;
let reelRequested = false;

// RMS of each decoded sample, used to normalize playback loudness so no
// effect is noticeably louder than the others.
let reelRms = 0;
let splashRms = 0;
const TARGET_RMS = 0.09; // shared loudness target for both samples
const MAX_SAMPLE_GAIN = 1.2;

function bufferRms(buf: AudioBuffer): number {
  let sum = 0;
  let count = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i += 8) {
      sum += d[i]! * d[i]!;
      count++;
    }
  }
  return count > 0 ? Math.sqrt(sum / count) : 0;
}

async function loadSample(urls: string[]): Promise<AudioBuffer | null> {
  if (!ctx) return null;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.arrayBuffer();
      return await ctx.decodeAudioData(data);
    } catch {
      // try next source
    }
  }
  return null;
}

// Local copies live in the repo (public/audio) so cloned/remixed projects keep
// their sound; the CDN asset URL is only a fallback.
const REEL_SOURCES = ["/audio/reel-winding.wav", reelWindingAsset.url];
const SPLASH_SOURCES = ["/audio/bobber-splash.wav", bobberSplashAsset.url];

function ensureSamples() {
  if (!ctx) return;
  if (!reelBuffer && !reelLoad)
    reelLoad = loadSample(REEL_SOURCES).then((b) => {
      if (b) {
        reelBuffer = b;
        reelRms = bufferRms(b);
      } else {
        reelLoad = null;
      }
      return b;
    });
  if (!splashBuffer && !splashLoad)
    splashLoad = loadSample(SPLASH_SOURCES).then((b) => {

      if (b) {
        splashBuffer = b;
        splashRms = bufferRms(b);
      } else {
        splashLoad = null;
      }
      return b;
    });
}

/** playback gain so a decoded sample sits at TARGET_RMS loudness */
function normalizedSampleGain(rms: number): number {
  if (rms <= 0.0001) return 0.3;
  return Math.min(MAX_SAMPLE_GAIN, TARGET_RMS / rms);
}

let rainGain: GainNode | null = null;
let windGain: GainNode | null = null;
let wavesGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let musicTimer: number | null = null;
let musicVolume = 0.12;
let noiseBuffer: AudioBuffer | null = null;
let started = false;
let muted = false;
let birdsLevel = 0; // 0..1 — probability driver for chirps
let wavesLevel = 0; // desired wave level — set even before ctx exists
let birdTimer: number | null = null;

let reelInterval: number | null = null;
let reelScrape: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;

function makeNoise(c: AudioContext) {
  const len = Math.floor(c.sampleRate * 2);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = w * 0.6 + last * 3.2;
  }
  return buf;
}

function loopNoise(c: AudioContext, dest: AudioNode, nodes: BiquadFilterNode[]) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  let node: AudioNode = src;
  for (const f of nodes) {
    node.connect(f);
    node = f;
  }
  node.connect(dest);
  src.start();
  return src;
}

export function initWeatherAudio() {
  if (started) return;
  const AC =
    (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  started = true;
  ctx = new AC();
  noiseBuffer = makeNoise(ctx);

  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  master.connect(ctx.destination);
  ensureSamples();

  // ---- rain bed: gentle hiss + soft patter ----
  rainGain = ctx.createGain();
  rainGain.gain.value = 0;
  rainGain.connect(master);

  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 600;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 4200;
  loopNoise(ctx, rainGain, [hp, lp]);

  const patter = ctx.createBiquadFilter();
  patter.type = "bandpass";
  patter.frequency.value = 260;
  patter.Q.value = 0.8;
  const patterGain = ctx.createGain();
  patterGain.gain.value = 0.2;
  patterGain.connect(rainGain);
  loopNoise(ctx, patterGain, [patter]);

  // ---- wind ----
  windGain = ctx.createGain();
  windGain.gain.value = 0;
  windGain.connect(master);
  const wlp = ctx.createBiquadFilter();
  wlp.type = "lowpass";
  wlp.frequency.value = 480;
  const wbp = ctx.createBiquadFilter();
  wbp.type = "bandpass";
  wbp.frequency.value = 220;
  wbp.Q.value = 0.6;
  loopNoise(ctx, windGain, [wlp, wbp]);

  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.12;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 180;
  lfo.connect(lfoGain);
  lfoGain.connect(wbp.frequency);
  lfo.start();

  // ---- ocean waves: slow swells of lowpassed noise (kept gentle) ----
  // wavesGain is the level gate (0 = silent). The swell LFOs modulate a
  // separate multiplier around 1.0 so they can never push sound through
  // when the level is 0.
  wavesGain = ctx.createGain();
  wavesGain.gain.value = wavesLevel;
  wavesGain.connect(master);

  const swellAmp = ctx.createGain();
  swellAmp.gain.value = 1;
  swellAmp.connect(wavesGain);

  const wvlp = ctx.createBiquadFilter();
  wvlp.type = "lowpass";
  wvlp.frequency.value = 520;
  wvlp.Q.value = 0.3;
  const wvhp = ctx.createBiquadFilter();
  wvhp.type = "highpass";
  wvhp.frequency.value = 90;
  loopNoise(ctx, swellAmp, [wvhp, wvlp]);

  // swell LFO: amplitude + brightness rise and fall like breakers
  const swell = ctx.createOscillator();
  swell.frequency.value = 0.09;
  const swellG = ctx.createGain();
  swellG.gain.value = 0.4;
  swell.connect(swellG);
  swellG.connect(swellAmp.gain);
  const swellF = ctx.createGain();
  swellF.gain.value = 140;
  swell.connect(swellF);
  swellF.connect(wvlp.frequency);
  swell.start();

  // second, slower swell offset for variety
  const swell2 = ctx.createOscillator();
  swell2.frequency.value = 0.045;
  const swell2G = ctx.createGain();
  swell2G.gain.value = 0.25;
  swell2.connect(swell2G);
  swell2G.connect(swellAmp.gain);
  swell2.start();

  // ---- bird chirp scheduler (clear / partly-cloudy ambience) ----
  const scheduleBird = () => {
    if (!ctx) return;
    if (!muted && birdsLevel > 0 && Math.random() < birdsLevel) playChirp();
    birdTimer = window.setTimeout(scheduleBird, 600 + Math.random() * 3800);
  };
  scheduleBird();

  // ---- ambient background music (C major pentatonic) ----
  musicGain = ctx.createGain();
  musicGain.gain.value = musicVolume;
  const mlp = ctx.createBiquadFilter();
  mlp.type = "lowpass";
  mlp.frequency.value = 2600;
  mlp.connect(musicGain);
  musicGain.connect(master);
  musicBus = mlp;

  const scheduleMusic = () => {
    if (!ctx) return;
    if (!muted) playMusicPhrase();
    musicTimer = window.setTimeout(scheduleMusic, 1000 + Math.random() * 2000);
  };
  scheduleMusic();
}

let musicBus: AudioNode | null = null;
const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
let padCounter = 0;

function pluck(freq: number, t: number, vol: number) {
  if (!ctx || !musicBus) return;
  const o = ctx.createOscillator();
  o.type = Math.random() < 0.5 ? "sine" : "triangle";
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
  o.connect(g);
  g.connect(musicBus);
  o.start(t);
  o.stop(t + 2.0);
}

function playMusicPhrase() {
  if (!ctx || !musicBus) return;
  const t0 = ctx.currentTime + 0.05;
  const notes = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < notes; i++) {
    const f = PENTA[Math.floor(Math.random() * PENTA.length)]!;
    pluck(f, t0 + i * (0.35 + Math.random() * 0.4), 0.16);
  }

  // slow pad chord every few phrases
  padCounter++;
  if (padCounter % 3 === 0) {
    const root = PENTA[Math.floor(Math.random() * 3)]! / 2;
    for (const mul of [1, 1.5, 2]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = root * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.06, t0 + 2.2);
      g.gain.linearRampToValueAtTime(0.0001, t0 + 5.5);
      o.connect(g);
      g.connect(musicBus);
      o.start(t0);
      o.stop(t0 + 5.6);
    }
  }
}

/** background music volume 0..1 */
export function setMusicVolume(v: number) {
  musicVolume = Math.max(0, Math.min(v, 1));
  if (ctx && musicGain) musicGain.gain.setTargetAtTime(musicVolume, ctx.currentTime, 0.3);
}

/** short bird chirp: 1-3 quick descending sine blips */
function playChirp() {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + 0.02;
  const notes = 1 + Math.floor(Math.random() * 3);
  const base = 2300 + Math.random() * 1800;
  for (let i = 0; i < notes; i++) {
    const t = t0 + i * (0.09 + Math.random() * 0.06);
    const o = ctx.createOscillator();
    o.type = "sine";
    const f0 = base * (1 + Math.random() * 0.25);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + 0.1);
  }
}

export function resumeWeatherAudio() {
  initWeatherAudio();
  ensureSamples();
  if (!ctx) return;
  void ctx.resume().then(() => {
    ensureSamples();
    if (reelRequested) playUploadedReel();
  }).catch(() => undefined);
}

export function setWeatherMuted(m: boolean) {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.1);
}

export function isWeatherMuted() {
  return muted;
}

/** rain 0..1, wind 0..1 — smooth continuous levels */
export function setWeatherLevels(rain: number, wind: number) {
  if (!ctx || !rainGain || !windGain) return;
  const t = ctx.currentTime;
  rainGain.gain.setTargetAtTime(Math.min(rain, 1) * 0.08, t, 0.35);
  windGain.gain.setTargetAtTime(Math.min(wind, 1) * 0.065, t, 0.6);
}

/**
 * Per-weather ambience:
 * cerah / berawan / berkabut — no wave sound, only birds where appropriate
 * hujan / badai — very soft waves beneath the rain bed
 */
export function setWeatherAmbience(kind: string) {
  // Always record the desired levels — ctx may not exist yet on first call.
  wavesLevel =
    kind === "cerah" ? 0 :
    kind === "berawan" ? 0 :
    kind === "berkabut" ? 0 : 0.012;
  birdsLevel =
    kind === "cerah" ? 0.85 :
    kind === "berawan" ? 0.3 : 0;
  if (!ctx || !wavesGain) return;
  wavesGain.gain.setTargetAtTime(wavesLevel, ctx.currentTime, 0.8);
}

/** short splash tick — onWater gives a wetter, lower "plink" */
export function playImpact(onWater: boolean, strength = 1) {
  if (!ctx || !noiseBuffer || muted) return;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  const peak = (onWater ? 0.04 : 0.03) * strength;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (onWater ? 0.16 : 0.09));
  g.connect(master!);

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.playbackRate.value = 0.8 + Math.random() * 0.6;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = onWater ? 700 + Math.random() * 900 : 1800 + Math.random() * 1600;
  f.Q.value = onWater ? 1.6 : 1.1;
  src.connect(f);
  f.connect(g);
  src.start(t, Math.random() * 1.5, 0.2);

  if (onWater) {
    // droplet pitch-drop tone
    const o = ctx.createOscillator();
    o.type = "sine";
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.04 * strength, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.frequency.setValueAtTime(900 + Math.random() * 500, t);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.12);
    o.connect(og);
    og.connect(master!);
    o.start(t);
    o.stop(t + 0.15);
  }
}

/**
 * Footstep: short filtered noise thud. `kind` picks the surface character —
 * "sand" (soft, muffled), "wood" (dock/boat, hollow knock), "water" (wet splash).
 */
export function playFootstep(
  kind: "sand" | "wood" | "water" = "sand",
  strength = 1,
) {
  if (!ctx || !noiseBuffer || muted) return;
  const t = ctx.currentTime;
  const peak =
    (kind === "wood" ? 0.05 : kind === "water" ? 0.045 : 0.038) * strength;
  const dur = kind === "water" ? 0.18 : kind === "wood" ? 0.11 : 0.14;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(master!);

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.playbackRate.value = 0.6 + Math.random() * 0.5;
  const f = ctx.createBiquadFilter();
  f.type = kind === "sand" ? "lowpass" : "bandpass";
  f.frequency.value =
    kind === "sand"
      ? 900 + Math.random() * 400
      : kind === "wood"
        ? 320 + Math.random() * 160
        : 1100 + Math.random() * 700;
  f.Q.value = kind === "sand" ? 0.7 : 1.4;
  src.connect(f);
  f.connect(g);
  src.start(t, Math.random() * 1.5, 0.25);

  // low body thump so the step has weight
  const o = ctx.createOscillator();
  o.type = "sine";
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.03 * strength, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + (kind === "wood" ? 0.14 : 0.1));
  o.frequency.setValueAtTime(kind === "wood" ? 150 : 110, t);
  o.frequency.exponentialRampToValueAtTime(kind === "wood" ? 80 : 55, t + 0.1);
  o.connect(og);
  og.connect(master!);
  o.start(t);
  o.stop(t + 0.16);
}

/** distant thunder rumble + crack */
export function playThunder() {
  if (!ctx || !noiseBuffer || muted) return;
  const t = ctx.currentTime + 0.15 + Math.random() * 0.4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
  g.connect(master!);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(140, t + 2.2);

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  src.playbackRate.value = 0.5;
  src.connect(lp);
  lp.connect(g);
  src.start(t);
  src.stop(t + 2.8);

  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(58, t);
  sub.frequency.exponentialRampToValueAtTime(28, t + 2);
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.08, t);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
  sub.connect(sg);
  sg.connect(master!);
  sub.start(t);
  sub.stop(t + 2.4);
}

/** One mechanical reel click: very short noise burst + tiny tick. */
function playReelClick() {
  if (!ctx || !noiseBuffer || muted) return;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.045, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
  g.connect(master!);

  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 1800 + Math.random() * 900;
  f.Q.value = 1.4;

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.playbackRate.value = 1.2 + Math.random() * 0.5;
  src.connect(f);
  f.connect(g);
  src.start(t, Math.random() * 1.2, 0.05);

  const tick = ctx.createOscillator();
  tick.type = "square";
  tick.frequency.value = 260 + Math.random() * 120;
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.0001, t);
  tg.gain.exponentialRampToValueAtTime(0.012, t + 0.003);
  tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
  tick.connect(tg);
  tg.connect(master!);
  tick.start(t);
  tick.stop(t + 0.03);
}

function playUploadedReel() {
  if (!ctx || !master || muted || !reelRequested || !reelBuffer || reelSample) return;
    const src = ctx.createBufferSource();
    src.buffer = reelBuffer;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = normalizedSampleGain(reelRms);
    src.connect(g);
    g.connect(master);
    src.start();
    reelSample = { src, gain: g };
}

/** Start the uploaded reel sample and wait for decoding on its first use. */
export function startReelSound() {
  reelRequested = true;
  resumeWeatherAudio();
  if (!ctx || muted) return;
  ensureSamples();
  if (reelBuffer) playUploadedReel();
  else void reelLoad?.then(() => playUploadedReel());
}

/** Stop the reel winding sound. */
export function stopReelSound() {
  reelRequested = false;
  if (reelSample && ctx) {
    const t = ctx.currentTime;
    reelSample.gain.gain.setTargetAtTime(0.0001, t, 0.05);
    reelSample.src.stop(t + 0.2);
    reelSample = null;
  }
  if (reelInterval) {
    window.clearInterval(reelInterval);
    reelInterval = null;
  }
  if (reelScrape && ctx) {
    const t = ctx.currentTime;
    reelScrape.gain.gain.setTargetAtTime(0.0001, t, 0.04);
    reelScrape.src.stop(t + 0.15);
    reelScrape = null;
  }
}

/**
 * Casting: the line zips off the spool. Airy noise "whoosh" sweeping down in
 * pitch plus fast spool clicks that slow as the lure loses speed.
 */
export function playCastWhizz(duration = 0.9) {
  if (!ctx || !noiseBuffer || muted) return;
  const t = ctx.currentTime;
  const d = Math.max(0.35, duration);

  // airy line whoosh
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(1400, t);
  bp.frequency.exponentialRampToValueAtTime(3200, t + d * 0.25);
  bp.frequency.exponentialRampToValueAtTime(700, t + d);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.06, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.012, t + d * 0.8);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  src.playbackRate.value = 1.1;
  src.connect(bp);
  bp.connect(g);
  g.connect(master!);
  src.start(t);
  src.stop(t + d + 0.05);

  // spool clicks: fast at first, slowing down
  let time = 0;
  let gap = 0.028;
  while (time < d * 0.92) {
    const ct = t + time;
    const cg = ctx.createGain();
    const amp = 0.03 * (1 - time / d);
    cg.gain.setValueAtTime(0.0001, ct);
    cg.gain.exponentialRampToValueAtTime(Math.max(0.002, amp), ct + 0.003);
    cg.gain.exponentialRampToValueAtTime(0.0001, ct + 0.02);
    cg.connect(master!);
    const cf = ctx.createBiquadFilter();
    cf.type = "bandpass";
    cf.frequency.value = 2400 + Math.random() * 1200;
    cf.Q.value = 2;
    const cs = ctx.createBufferSource();
    cs.buffer = noiseBuffer;
    cs.playbackRate.value = 1.5;
    cs.connect(cf);
    cf.connect(cg);
    cs.start(ct, Math.random() * 1.2, 0.03);
    time += gap;
    gap *= 1.09;
  }
}

/**
 * Bobber entering the water: soft "bloop". Water drops rise in pitch, so the
 * resonant tone sweeps upward, followed by a fizzy spray tail — no hard thud.
 */
export function playBobberSplash(strength = 1) {
  resumeWeatherAudio();
  if (!ctx || muted) return;
  ensureSamples();
  const playUploadedSplash = () => {
    if (!ctx || !master || muted || !splashBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = splashBuffer;
    src.playbackRate.value = 0.95 + Math.random() * 0.1;
    const g = ctx.createGain();
    g.gain.value = normalizedSampleGain(splashRms) * Math.min(strength, 1.6);
    src.connect(g);
    g.connect(master);
    src.start();
  };
  if (splashBuffer) {
    playUploadedSplash();
  } else {
    void splashLoad?.then(() => playUploadedSplash());
  }
}

