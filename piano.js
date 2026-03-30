const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// 첫 인터랙션에서 AudioContext를 미리 resume
function ensureAudioReady() {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  document.removeEventListener('touchstart', ensureAudioReady);
  document.removeEventListener('mousedown', ensureAudioReady);
  document.removeEventListener('keydown', ensureAudioReady);
}
document.addEventListener('touchstart', ensureAudioReady, { passive: true });
document.addEventListener('mousedown', ensureAudioReady, { passive: true });
document.addEventListener('keydown', ensureAudioReady);

// ─── 주파수 계산 ───
function getFrequency(note, octave) {
  const noteIndex = {
    'C': -9, 'C#': -8, 'D': -7, 'D#': -6, 'E': -5,
    'F': -4, 'F#': -3, 'G': -2, 'G#': -1, 'A': 0, 'A#': 1, 'B': 2
  };
  const semitones = noteIndex[note] + (octave - 4) * 12;
  return 440 * Math.pow(2, semitones / 12);
}

// ─── 악기별 음색 정의 ───
const INSTRUMENTS = {
  piano: {
    harmonics: [
      { ratio: 1, gain: 1.0 },
      { ratio: 2, gain: 0.5 },
      { ratio: 3, gain: 0.25 },
      { ratio: 4, gain: 0.1 },
      { ratio: 5, gain: 0.05 },
    ],
    waveform: 'sine',
    envelope: { attack: 0.003, decay: 0.1, sustain: 0.15, release: 2.0, peak: 0.4, decayLevel: 0.3 },
  },
  epiano: {
    harmonics: [
      { ratio: 1, gain: 1.0 },
      { ratio: 2, gain: 0.6 },
      { ratio: 3, gain: 0.1 },
      { ratio: 7, gain: 0.15 },
      { ratio: 11, gain: 0.05 },
    ],
    waveform: 'sine',
    envelope: { attack: 0.005, decay: 0.15, sustain: 0.1, release: 1.5, peak: 0.35, decayLevel: 0.2 },
    useFM: true,
    fmRatio: 1.5,
    fmDepth: 80,
  },
  organ: {
    harmonics: [
      { ratio: 0.5, gain: 0.6 },
      { ratio: 1, gain: 1.0 },
      { ratio: 2, gain: 0.8 },
      { ratio: 3, gain: 0.6 },
      { ratio: 4, gain: 0.5 },
      { ratio: 6, gain: 0.3 },
      { ratio: 8, gain: 0.2 },
    ],
    waveform: 'sine',
    envelope: { attack: 0.05, decay: 0.1, sustain: 0.35, release: 3.0, peak: 0.35, decayLevel: 0.35 },
  },
  strings: {
    harmonics: [
      { ratio: 1, gain: 1.0 },
      { ratio: 2, gain: 0.7 },
      { ratio: 3, gain: 0.5 },
      { ratio: 4, gain: 0.3 },
      { ratio: 5, gain: 0.2 },
    ],
    waveform: 'sawtooth',
    envelope: { attack: 0.3, decay: 0.2, sustain: 0.3, release: 3.0, peak: 0.2, decayLevel: 0.18 },
  },
  synth: {
    harmonics: [
      { ratio: 1, gain: 1.0 },
      { ratio: 2, gain: 0.3 },
    ],
    waveform: 'square',
    envelope: { attack: 0.02, decay: 0.15, sustain: 0.2, release: 1.0, peak: 0.25, decayLevel: 0.2 },
    useFilter: true,
    filterFreq: 2000,
  },
  bell: {
    harmonics: [
      { ratio: 1, gain: 1.0 },
      { ratio: 2.4, gain: 0.7 },
      { ratio: 3.0, gain: 0.4 },
      { ratio: 5.2, gain: 0.3 },
      { ratio: 7.0, gain: 0.15 },
    ],
    waveform: 'sine',
    envelope: { attack: 0.002, decay: 0.5, sustain: 0.0, release: 3.0, peak: 0.4, decayLevel: 0.05 },
  },
  guitar: {
    harmonics: [
      { ratio: 1, gain: 1.0 },
      { ratio: 2, gain: 0.5 },
      { ratio: 3, gain: 0.35 },
      { ratio: 4, gain: 0.15 },
      { ratio: 5, gain: 0.08 },
    ],
    waveform: 'triangle',
    envelope: { attack: 0.005, decay: 0.3, sustain: 0.05, release: 1.5, peak: 0.4, decayLevel: 0.1 },
    useFilter: true,
    filterFreq: 3000,
  },
  flute: {
    harmonics: [
      { ratio: 1, gain: 1.0 },
      { ratio: 2, gain: 0.15 },
      { ratio: 3, gain: 0.05 },
    ],
    waveform: 'sine',
    envelope: { attack: 0.12, decay: 0.1, sustain: 0.25, release: 2.0, peak: 0.3, decayLevel: 0.25 },
    useNoise: true,
    noiseGain: 0.02,
  },
};

// ─── 드럼 합성 ───
// 건반 음에 따라 다른 퍼커션 매핑
const DRUM_MAP = {
  'C':  'kick',
  'C#': 'rimshot',
  'D':  'snare',
  'D#': 'clap',
  'E':  'closedhat',
  'F':  'openhat',
  'F#': 'lowtom',
  'G':  'midtom',
  'G#': 'hightom',
  'A':  'crash',
  'A#': 'ride',
  'B':  'cowbell',
};

function playDrum(note) {
  const now = audioCtx.currentTime;
  const type = DRUM_MAP[note] || 'kick';
  const allOsc = [];
  let noiseSource = null;

  const masterGain = audioCtx.createGain();
  masterGain.connect(audioCtx.destination);

  if (type === 'kick') {
    // 킥: 사인파 피치 드롭
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.8, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.4);
    allOsc.push(osc);
  } else if (type === 'snare') {
    // 스네어: 삼각파 + 노이즈
    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, now);
    const og = audioCtx.createGain();
    og.gain.setValueAtTime(0.4, now);
    og.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.connect(og);
    og.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.15);
    allOsc.push(osc);

    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.2, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = buf;
    const ng = audioCtx.createGain();
    ng.gain.setValueAtTime(0.5, now);
    ng.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    const filt = audioCtx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.setValueAtTime(1000, now);
    noiseSource.connect(filt);
    filt.connect(ng);
    ng.connect(masterGain);
    noiseSource.start(now);
    noiseSource.stop(now + 0.2);
  } else if (type === 'closedhat' || type === 'openhat') {
    const dur = type === 'closedhat' ? 0.08 : 0.3;
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = buf;
    const ng = audioCtx.createGain();
    ng.gain.setValueAtTime(0.3, now);
    ng.gain.exponentialRampToValueAtTime(0.01, now + dur);
    const filt = audioCtx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.setValueAtTime(5000, now);
    noiseSource.connect(filt);
    filt.connect(ng);
    ng.connect(masterGain);
    noiseSource.start(now);
    noiseSource.stop(now + dur);
  } else if (type === 'lowtom' || type === 'midtom' || type === 'hightom') {
    const freq = type === 'lowtom' ? 80 : type === 'midtom' ? 120 : 180;
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.5, now);
    osc.frequency.exponentialRampToValueAtTime(freq, now + 0.05);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.6, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.3);
    allOsc.push(osc);
  } else if (type === 'crash' || type === 'ride') {
    const dur = type === 'crash' ? 0.8 : 0.4;
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = buf;
    const ng = audioCtx.createGain();
    ng.gain.setValueAtTime(0.35, now);
    ng.gain.exponentialRampToValueAtTime(0.01, now + dur);
    const filt = audioCtx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(type === 'crash' ? 6000 : 8000, now);
    filt.Q.setValueAtTime(0.5, now);
    noiseSource.connect(filt);
    filt.connect(ng);
    ng.connect(masterGain);
    noiseSource.start(now);
    noiseSource.stop(now + dur);
  } else if (type === 'clap') {
    const dur = 0.15;
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = buf;
    const ng = audioCtx.createGain();
    ng.gain.setValueAtTime(0, now);
    ng.gain.linearRampToValueAtTime(0.5, now + 0.01);
    ng.gain.exponentialRampToValueAtTime(0.01, now + dur);
    const filt = audioCtx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(1500, now);
    filt.Q.setValueAtTime(1, now);
    noiseSource.connect(filt);
    filt.connect(ng);
    ng.connect(masterGain);
    noiseSource.start(now);
    noiseSource.stop(now + dur);
  } else if (type === 'rimshot') {
    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, now);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.5, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.06);
    allOsc.push(osc);
  } else if (type === 'cowbell') {
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    osc1.type = 'square';
    osc2.type = 'square';
    osc1.frequency.setValueAtTime(560, now);
    osc2.frequency.setValueAtTime(845, now);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    const filt = audioCtx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(700, now);
    filt.Q.setValueAtTime(3, now);
    osc1.connect(filt);
    osc2.connect(filt);
    filt.connect(g);
    g.connect(masterGain);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.2);
    osc2.stop(now + 0.2);
    allOsc.push(osc1, osc2);
  }

  masterGain.gain.setValueAtTime(masterGain.gain.value || 1, now);
  return { gain: masterGain, oscillators: allOsc, noiseSource };
}

let currentInstrument = 'piano';

// ─── 소리 합성 ───
function playSound(frequency, note) {
  if (currentInstrument === 'drum') {
    return playDrum(note);
  }
  return playNote(frequency);
}

function playNote(frequency) {
  const now = audioCtx.currentTime;
  const inst = INSTRUMENTS[currentInstrument];
  const env = inst.envelope;

  // 마스터 게인
  const masterGain = audioCtx.createGain();
  const duration = env.attack + env.decay + env.sustain + env.release;

  // 필터 (선택적)
  let outputNode = masterGain;
  if (inst.useFilter) {
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(inst.filterFreq, now);
    filter.Q.setValueAtTime(1, now);
    masterGain.connect(filter);
    filter.connect(audioCtx.destination);
    outputNode = masterGain;
  } else {
    masterGain.connect(audioCtx.destination);
  }

  // ADSR 엔벨로프 - 즉시 peak로 시작하여 지연 없음
  masterGain.gain.setValueAtTime(env.peak, now);
  masterGain.gain.setTargetAtTime(env.decayLevel, now + env.attack, env.decay * 0.3);
  masterGain.gain.setTargetAtTime(0, now + env.attack + env.decay + env.sustain, env.release * 0.3);

  const allOsc = [];

  // FM 변조 (일렉 피아노용)
  let fmOsc = null;
  let fmGain = null;
  if (inst.useFM) {
    fmOsc = audioCtx.createOscillator();
    fmGain = audioCtx.createGain();
    fmOsc.frequency.setValueAtTime(frequency * inst.fmRatio, now);
    fmGain.gain.setValueAtTime(inst.fmDepth, now);
    fmGain.gain.linearRampToValueAtTime(inst.fmDepth * 0.3, now + duration);
    fmOsc.connect(fmGain);
    fmOsc.start(now);
    fmOsc.stop(now + duration);
    allOsc.push(fmOsc);
  }

  // 배음 오실레이터
  inst.harmonics.forEach(h => {
    const osc = audioCtx.createOscillator();
    const hGain = audioCtx.createGain();
    osc.type = inst.waveform;
    osc.frequency.setValueAtTime(frequency * h.ratio, now);
    hGain.gain.setValueAtTime(h.gain, now);

    if (fmGain) fmGain.connect(osc.frequency);

    osc.connect(hGain);
    hGain.connect(masterGain);
    osc.start(now);
    osc.stop(now + duration);
    allOsc.push(osc);
  });

  // 브레스 노이즈 (플루트용)
  let noiseSource = null;
  if (inst.useNoise) {
    const bufferSize = audioCtx.sampleRate * duration;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * inst.noiseGain;
    }
    noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(frequency * 2, now);
    noiseFilter.Q.setValueAtTime(2, now);
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(masterGain);
    noiseSource.start(now);
    noiseSource.stop(now + duration);
  }

  return { gain: masterGain, oscillators: allOsc, noiseSource };
}

// ─── 동요 데이터 ───
const NOTE_TO_KR = {
  'C': '도', 'C#': '도#', 'D': '레', 'D#': '레#', 'E': '미',
  'F': '파', 'F#': '파#', 'G': '솔', 'G#': '솔#', 'A': '라', 'A#': '라#', 'B': '시',
};
const DUR_SYMBOL = { 1: '𝅝', 2: '𝅗𝅥', 4: '♩', 8: '♪' };

// 간편 표기 파서: "G4 G4 A2 |" → [{n:'G',d:4}, {n:'G',d:4}, {n:'A',d:2}, '|']
function parseSong(str) {
  return str.trim().split(/\s+/).map(t => {
    if (t === '|') return '|';
    const m = t.match(/^([A-G]#?)(\d)$/);
    return m ? { n: m[1], d: parseInt(m[2]) } : { n: t, d: 4 };
  });
}

const SONGS = {
  'school-bell': {
    title: '학교종',
    octave: 4,
    // 학교종이 땡땡땡 어서 모이자 선생님이 우리를 기다리신다
    notes: parseSong(
      'G4 G4 A4 A4 G4 G4 E2 | G4 G4 E4 E4 D2 | G4 G4 A4 A4 G4 G4 E2 | G4 G4 E4 D4 C2'
    ),
  },
  'butterfly': {
    title: '나비야',
    octave: 4,
    // 나비야 나비야 이리날아 오너라
    notes: parseSong(
      'G4 E4 E2 | F4 D4 D2 | C4 D4 E4 F4 G4 G4 G2 | ' +
      'G4 E4 E2 | F4 D4 D2 | C4 E4 G4 G4 E2 | ' +
      'D4 D4 D4 D4 D4 E4 F2 | E4 E4 E4 E4 E4 F4 G2 | ' +
      'G4 E4 E2 | F4 D4 D2 | C4 E4 G4 G4 C2'
    ),
  },
  'airplane': {
    title: '비행기',
    octave: 4,
    // 떴다떴다 비행기 날아라 날아라
    notes: parseSong(
      'E4 D4 C4 D4 E4 E4 E2 | D4 D4 D2 E4 G4 G2 | ' +
      'E4 D4 C4 D4 E4 E4 E2 | E4 D4 D4 E4 D4 C2'
    ),
  },
  'twinkle': {
    title: '반짝반짝 작은별',
    octave: 4,
    notes: parseSong(
      'C4 C4 G4 G4 A4 A4 G2 | F4 F4 E4 E4 D4 D4 C2 | ' +
      'G4 G4 F4 F4 E4 E4 D2 | G4 G4 F4 F4 E4 E4 D2 | ' +
      'C4 C4 G4 G4 A4 A4 G2 | F4 F4 E4 E4 D4 D4 C2'
    ),
  },
  'three-bears': {
    title: '곰 세 마리',
    octave: 4,
    // 곰세마리가 한집에있어 | 아빠곰 엄마곰 애기곰
    // 아빠곰은 뚱뚱해 | 엄마곰은 날씬해
    // 애기곰은 너무 귀여워 | 으쓱으쓱 잘한다
    notes: parseSong(
      'C4 C4 C4 C8 D8 E4 | E8 D8 E8 F8 G2 | ' +
      'G4 G4 G4 E4 E4 E4 | C4 E4 G4 G4 E2 | ' +
      'F4 F4 F4 F4 E4 E4 E2 | D4 D4 D4 D4 E4 E4 D2 | ' +
      'F4 F4 F4 F4 E4 E4 E2 | D4 D4 E4 D4 C2'
    ),
  },
  'mountain-rabbit': {
    title: '산토끼',
    octave: 4,
    // 산토끼 토끼야 어디를 가느냐
    notes: parseSong(
      'G4 G4 A4 B4 B2 | A4 A4 G2 | A4 A4 G2 | ' +
      'G4 G4 A4 B4 B2 | A4 G4 E4 D4 C2 | ' +
      'D4 D4 E4 D4 C2 | D4 D4 E4 D4 C2'
    ),
  },
  'spring-girl': {
    title: '봄나들이',
    octave: 4,
    // 나오너라 나오너라
    notes: parseSong(
      'G4 E8 G8 E4 G4 A4 G2 | E4 C4 D4 E4 D2 | ' +
      'G4 E8 G8 E4 G4 A4 G2 | E4 D4 E4 D4 C2'
    ),
  },
  'alphabet': {
    title: 'ABC송',
    octave: 4,
    notes: parseSong(
      'C4 C4 G4 G4 A4 A4 G2 | F4 F4 E4 E4 D4 D4 C2 | ' +
      'G4 G4 F2 E4 E4 D2 | G4 G4 F2 E4 E4 D2 | ' +
      'C4 C4 G4 G4 A4 A4 G2 | F4 F4 E4 E4 D4 D4 C2'
    ),
  },
  'head-shoulders': {
    title: '머리 어깨 무릎 발',
    octave: 4,
    notes: parseSong(
      'C8 C8 E8 E8 G8 G8 E4 | F8 F8 E8 E8 D2 | ' +
      'C8 C8 E8 E8 G8 G8 E4 | F4 E4 D4 E4 C2 | ' +
      'G4 G4 G8 A8 G4 | E4 E4 E8 F8 E4 | ' +
      'C8 C8 E8 E8 G8 G8 E4 | F4 E4 D4 E4 C2'
    ),
  },
  'elephant': {
    title: '코끼리 아저씨',
    octave: 4,
    // 코끼리 아저씨는 코가 손이래
    notes: parseSong(
      'E4 E4 G4 G4 A4 G4 E2 | E4 E4 D4 D4 C2 | ' +
      'E4 E4 G4 G4 A4 G4 E2 | E4 D4 E4 D4 C2 | ' +
      'G4 G4 E4 G4 A4 A4 G2 | E4 E4 D4 E4 F4 F4 E2 | ' +
      'E4 E4 G4 G4 A4 G4 E2 | E4 D4 E4 D4 C2'
    ),
  },
  'frog': {
    title: '개구리',
    octave: 4,
    notes: parseSong(
      'C4 D4 E4 F4 E4 D4 C2 | E4 F4 G4 A4 G4 F4 E2 | ' +
      'C2 C2 C2 C2 | C4 D4 E4 F4 E4 D4 C2'
    ),
  },
  'round-round': {
    title: '둥글게 둥글게',
    octave: 4,
    notes: parseSong(
      'G4 G8 G8 E4 G4 | A4 A8 A8 G4 A4 | ' +
      'G4 G4 E4 E4 D2 | E4 E4 D4 D4 C2 | ' +
      'G4 G8 G8 E4 G4 | A4 A8 A8 G4 A4 | ' +
      'G4 E4 G4 D4 D2 | E4 D4 E4 D4 C2'
    ),
  },
  'arirang': {
    title: '아리랑',
    octave: 4,
    // 아리랑 아리랑 아라리요
    notes: parseSong(
      'E4 E4 A4 A2 G8 A8 | G4 E4 D4 E2 | ' +
      'E4 E4 A4 A2 G8 A8 | G4 E4 D4 E2 | ' +
      'A2 A4 G8 A8 G4 E4 | D4 E4 G4 A4 G4 E4 | ' +
      'E4 E4 A4 A2 G8 A8 | G4 E4 D4 E2'
    ),
  },
  'conan': {
    title: '명탐정 코난 메인테마',
    octave: 4,
    notes: parseSong(
      // 파파파 파 솔솔#파 x3 파파#솔도라#
      'F8 F8 F8 F4 G8 G#8 F8 G8 G#8 F8 G8 G#8 F8 | F#8 G8 C4 A#4 | ' +
      // 파파파 파 솔솔#파 x3 파 미
      'F8 F8 F8 F4 G8 G#8 F8 G8 G#8 F8 G8 G#8 F8 | F4 E4 | ' +
      // 솔#솔파 도 솔#파솔 도#도라#
      'G#4 G8 F4 C4 | G#8 F8 G4 C#4 C4 A#4 | ' +
      // 솔#라#솔#라# 도 솔#솔파 라#솔#솔
      'G#8 A#8 G#8 A#8 C4 | G#8 G8 F4 A#8 G#8 G4 | ' +
      // 파솔솔# 파 도 솔# 라#파 레# 도#도라#도
      'F8 G8 G#4 F4 C4 | G#4 A#8 F8 D#4 | C#8 C8 A#8 C4 | ' +
      // 솔#솔파 도 솔#파솔 도#도라#
      'G#4 G8 F4 C4 | G#8 F8 G4 C#4 C4 A#4 | ' +
      // 솔#라#솔#라# 도 솔#솔파 라#솔#솔
      'G#8 A#8 G#8 A#8 C4 | G#8 G8 F4 A#8 G#8 G4 | ' +
      // 파솔솔# 파 도 솔# 라#파 레# 도#도라#도
      'F8 G8 G#4 F4 C4 | G#4 A#8 F8 D#4 | C#8 C8 A#8 C4 | ' +
      // 도도 파파 파솔# 솔파레# 파 솔#라#솔#라#도
      'C8 C8 F8 F8 | F8 G#8 G8 F8 D#8 F4 | G#8 A#8 G#8 A#8 C4 | ' +
      // 솔#라#도 도#도라# 파 레# 도#레#파솔
      'G#8 A#8 C4 C#8 C8 A#4 | F4 D#4 C#8 D#8 F8 G8 | ' +
      // 솔#솔파 도 솔#파솔 도#도라# 솔#라#솔#라#
      'G#4 G8 F4 C4 | G#8 F8 G4 C#4 C4 A#4 | G#8 A#8 G#8 A#8 | ' +
      // 도도도# 레# 파 솔#솔미 파
      'C4 C8 C#8 D#4 F4 | G#8 G8 E8 F4 | ' +
      // 파파파 파 솔솔#파 x3 파파#솔도라#
      'F8 F8 F8 F4 G8 G#8 F8 G8 G#8 F8 G8 G#8 F8 | F#8 G8 C4 A#4 | ' +
      // 파파파 파 솔솔#파 x3 파 미
      'F8 F8 F8 F4 G8 G#8 F8 G8 G#8 F8 G8 G#8 F8 | F4 E4 | ' +
      // 파 레#미파 도도# 라#도 솔솔#파
      'F4 | D#8 E8 F4 C8 C#8 | A#8 C8 G8 G#8 F2'
    ),
  },
  'school-bell1': {
    title: '학교벨1',
    octave: 4,
    notes: parseSong(
      'C4 E4 G4 | A4 G4 F4 A4 G4 | F4 G4 E4 C4 | D4 E4 C2'
    ),
  },
  'school-bell2': {
    title: '학교벨2',
    octave: 4,
    notes: parseSong(
      'F4 E4 F4 G4 F4 | F4 E4 F4 G4 F4 | ' +
      'C4 C4 C4 D4 E4 | F4 C4 F2'
    ),
  },
  'chopsticks': {
    title: '젓가락 행진곡',
    octave: 4,
    notes: parseSong(
      'F8 G8 F8 G8 F8 G8 F8 G8 | F8 G8 F8 G8 F4 F4 | ' +
      'E8 G8 E8 G8 E8 G8 E8 G8 | E8 G8 E8 G8 E4 E4 | ' +
      'D8 F8 D8 F8 D8 F8 D8 F8 | D8 F8 D8 F8 D4 D4 | ' +
      'C8 E8 C8 E8 C8 E8 C8 E8 | C8 E8 C8 E8 C4 C4 | ' +
      'F8 G8 F8 G8 F8 G8 F8 G8 | F8 G8 F8 G8 F4 F4 | ' +
      'E8 G8 E8 G8 E8 G8 E8 G8 | E8 G8 E8 G8 E4 E4 | ' +
      'D8 F8 D8 B8 D8 F8 D8 B8 | C4 E4 G4 C4 C2'
    ),
  },
};

// ─── 연습 모드 상태 ───
let practiceState = {
  active: false,
  songId: null,
  notes: [],
  currentIndex: 0,
  correctCount: 0,
  wrongCount: 0,
};

const songSelect = document.getElementById('song-select');
const practiceStart = document.getElementById('practice-start');
const practiceStop = document.getElementById('practice-stop');
const practiceScore = document.getElementById('practice-score');
const noteDisplay = document.getElementById('note-display');
const noteTrack = document.getElementById('note-track');

const autoplayBtn = document.getElementById('autoplay-btn');
let autoplayState = { playing: false, timer: null, index: 0 };

songSelect.addEventListener('change', () => {
  const hasVal = !!songSelect.value;
  practiceStart.disabled = !hasVal;
  autoplayBtn.disabled = !hasVal;
});

practiceStart.addEventListener('click', () => {
  if (!songSelect.value) return;
  stopAutoplay();
  startPractice(songSelect.value);
});

autoplayBtn.addEventListener('click', () => {
  if (!songSelect.value) return;
  if (autoplayState.playing) {
    stopAutoplay();
  } else {
    startAutoplay(songSelect.value);
  }
});

practiceStop.addEventListener('click', () => {
  stopAutoplay();
  stopPractice();
});

function startPractice(songId) {
  const song = SONGS[songId];
  if (!song) return;

  // 연습용 음만 필터 (마디 구분자 제외)
  const playableNotes = song.notes.filter(n => n !== '|');

  practiceState = {
    active: true,
    songId,
    notes: song.notes,
    playableNotes,         // [{n, d}, ...]
    currentIndex: 0,
    correctCount: 0,
    wrongCount: 0,
    octave: song.octave,
  };

  practiceStart.style.display = 'none';
  autoplayBtn.style.display = 'none';
  practiceStop.style.display = '';
  noteDisplay.style.display = '';
  practiceScore.textContent = `${song.title} - 0/${playableNotes.length}`;

  renderNoteTrack();
  highlightTargetKey();

  // 해당 옥타브로 스크롤
  requestAnimationFrame(() => scrollToOctave(song.octave));
}

function stopPractice() {
  practiceState.active = false;
  practiceStart.style.display = '';
  autoplayBtn.style.display = '';
  practiceStop.style.display = 'none';
  noteDisplay.style.display = 'none';
  practiceScore.textContent = '';
  clearKeyHighlight();
}

// ─── 자동 연주 ───
function durToMs(d, bpm) {
  // d: 1=whole, 2=half, 4=quarter, 8=eighth
  const beatMs = 60000 / bpm;
  return (4 / d) * beatMs;
}

function startAutoplay(songId) {
  const song = SONGS[songId];
  if (!song) return;

  const playableNotes = song.notes.filter(n => n !== '|');

  // UI 설정
  practiceState = {
    active: false, // 연습 판정 비활성
    songId,
    notes: song.notes,
    playableNotes,
    currentIndex: 0,
    correctCount: 0,
    wrongCount: 0,
    octave: song.octave,
  };

  practiceStart.style.display = 'none';
  autoplayBtn.textContent = '⏸ 일시정지';
  practiceStop.style.display = '';
  noteDisplay.style.display = '';
  practiceScore.textContent = `${song.title} - 자동연주`;

  renderNoteTrack();
  requestAnimationFrame(() => scrollToOctave(song.octave));

  autoplayState = { playing: true, timer: null, index: 0 };
  playNextAutoNote(playableNotes, song.octave, 120);
}

function playNextAutoNote(notes, octave, bpm) {
  if (!autoplayState.playing) return;
  if (autoplayState.index >= notes.length) {
    // 곡 완료
    practiceScore.textContent = `${SONGS[practiceState.songId].title} - 자동연주 완료`;
    stopAutoplay();
    return;
  }

  const noteObj = notes[autoplayState.index];
  const note = noteObj.n;
  const dur = noteObj.d;
  const holdMs = durToMs(dur, bpm) * 0.85; // 음 지속 시간
  const totalMs = durToMs(dur, bpm);        // 다음 음까지 간격

  // 건반 찾기 & 재생
  const el = keyboard.querySelector(`.key[data-note="${note}"][data-octave="${octave}"]`);
  startNote(note, octave, el);

  // 노트 트랙 업데이트
  const prevEl = noteTrack.querySelector(`.note-item[data-playable-index="${autoplayState.index - 1}"]`);
  if (prevEl) { prevEl.classList.remove('current'); prevEl.classList.add('played'); }
  const curEl = noteTrack.querySelector(`.note-item[data-playable-index="${autoplayState.index}"]`);
  if (curEl) curEl.classList.add('current');
  scrollNoteTrack();

  // 건반 하이라이트
  clearKeyHighlight();
  if (el) el.classList.add('hint-glow');

  // 음 릴리즈
  setTimeout(() => {
    stopNote(note, octave, el);
  }, holdMs);

  autoplayState.index++;

  // 다음 음 예약
  autoplayState.timer = setTimeout(() => {
    playNextAutoNote(notes, octave, bpm);
  }, totalMs);
}

function stopAutoplay() {
  autoplayState.playing = false;
  if (autoplayState.timer) {
    clearTimeout(autoplayState.timer);
    autoplayState.timer = null;
  }
  autoplayBtn.textContent = '🔊 자동연주';
  autoplayBtn.style.display = '';
  clearKeyHighlight();

  // 울리고 있는 노트 모두 정지
  activeNotes.forEach((sound, noteId) => {
    const pn = noteId.replace(/\d+$/, '');
    const po = parseInt(noteId.match(/\d+$/)[0]);
    const el = keyboard.querySelector(`.key[data-note="${pn}"][data-octave="${po}"]`);
    stopNote(pn, po, el);
  });
}

function renderNoteTrack() {
  noteTrack.innerHTML = '';
  let playableIdx = 0;

  practiceState.notes.forEach(item => {
    const el = document.createElement('div');

    if (item === '|') {
      el.className = 'note-item bar';
    } else {
      el.className = 'note-item';
      el.dataset.playableIndex = playableIdx;

      // 박자에 따른 너비 클래스
      el.classList.add('dur-' + item.d);

      const kr = document.createElement('span');
      kr.textContent = NOTE_TO_KR[item.n] || item.n;
      el.appendChild(kr);

      const durLine = document.createElement('span');
      durLine.className = 'note-dur';
      durLine.textContent = (DUR_SYMBOL[item.d] || '♩') + ' ' + item.n;
      el.appendChild(durLine);

      if (playableIdx === 0) el.classList.add('current');
      playableIdx++;
    }

    noteTrack.appendChild(el);
  });

  scrollNoteTrack();
}

function scrollNoteTrack() {
  const currentEl = noteTrack.querySelector('.note-item.current');
  if (!currentEl) return;

  // offsetLeft는 transform에 영향받지 않으므로 안정적
  const displayWidth = noteDisplay.clientWidth;
  const offset = currentEl.offsetLeft - displayWidth / 3;

  noteTrack.style.transform = `translateX(${-Math.max(0, offset)}px)`;
}

function checkNote(note) {
  if (!practiceState.active) return;

  const { playableNotes, currentIndex } = practiceState;
  if (currentIndex >= playableNotes.length) return;

  const expected = playableNotes[currentIndex].n;
  const currentEl = noteTrack.querySelector(`.note-item[data-playable-index="${currentIndex}"]`);

  if (note === expected) {
    // 정답
    practiceState.correctCount++;
    if (currentEl) {
      currentEl.classList.remove('current');
      currentEl.classList.add('played');
    }

    practiceState.currentIndex++;
    const total = playableNotes.length;
    const song = SONGS[practiceState.songId];
    practiceScore.textContent = `${song.title} - ${practiceState.currentIndex}/${total}`;

    if (practiceState.currentIndex >= total) {
      // 곡 완료
      clearKeyHighlight();
      const pct = Math.round((practiceState.correctCount / (practiceState.correctCount + practiceState.wrongCount)) * 100);
      practiceScore.textContent = `${song.title} 완료! 정확도: ${pct}%`;
      noteTrack.innerHTML = `<div class="practice-complete">🎉 ${song.title} 연주 완료! 정확도 ${pct}%</div>`;
      noteTrack.style.transform = '';
      practiceState.active = false;
      practiceStart.style.display = '';
      practiceStop.style.display = 'none';
      return;
    }

    // 다음 음 표시
    const nextEl = noteTrack.querySelector(`.note-item[data-playable-index="${practiceState.currentIndex}"]`);
    if (nextEl) nextEl.classList.add('current');
    scrollNoteTrack();
    highlightTargetKey();
  } else {
    // 오답
    practiceState.wrongCount++;
    if (currentEl) {
      currentEl.classList.add('wrong');
      setTimeout(() => currentEl.classList.remove('wrong'), 300);
    }
  }
}

function highlightTargetKey() {
  clearKeyHighlight();
  if (!practiceState.active) return;

  const { playableNotes, currentIndex, octave } = practiceState;
  if (currentIndex >= playableNotes.length) return;

  const targetNote = playableNotes[currentIndex].n;
  const targetEl = keyboard.querySelector(
    `.key[data-note="${targetNote}"][data-octave="${octave}"]`
  );
  if (targetEl) targetEl.classList.add('hint-glow');
}

function clearKeyHighlight() {
  keyboard.querySelectorAll('.hint-glow').forEach(el => el.classList.remove('hint-glow'));
}

// ─── 건반 정의 ───
const NOTES = [
  { note: 'C',  type: 'white' },
  { note: 'C#', type: 'black' },
  { note: 'D',  type: 'white' },
  { note: 'D#', type: 'black' },
  { note: 'E',  type: 'white' },
  { note: 'F',  type: 'white' },
  { note: 'F#', type: 'black' },
  { note: 'G',  type: 'white' },
  { note: 'G#', type: 'black' },
  { note: 'A',  type: 'white' },
  { note: 'A#', type: 'black' },
  { note: 'B',  type: 'white' },
];

const KB_MAP_OCT1 = { 'a':'C', 'w':'C#', 's':'D', 'e':'D#', 'd':'E', 'f':'F', 't':'F#', 'g':'G', 'y':'G#', 'h':'A', 'u':'A#', 'j':'B' };
const KB_MAP_OCT2 = { 'k':'C', 'o':'C#', 'l':'D', 'p':'D#', ';':'E', "'":"F" };

let currentOctave = 4;
const activeNotes = new Map();
const viewport = document.getElementById('keyboard-viewport');
const keyboard = document.getElementById('keyboard');
const instrumentSelect = document.getElementById('instrument-select');

const DRUM_LABELS = {
  'C': 'Kick', 'C#': 'Rim', 'D': 'Snare', 'D#': 'Clap',
  'E': 'HH', 'F': 'OH', 'F#': 'LTom', 'G': 'MTom',
  'G#': 'HTom', 'A': 'Crash', 'A#': 'Ride', 'B': 'Bell',
};

instrumentSelect.addEventListener('change', () => {
  currentInstrument = instrumentSelect.value;
  buildKeyboard();
});

// ─── 테마 변경 ───
const themeSelect = document.getElementById('theme-select');
themeSelect.addEventListener('change', () => {
  // keyboard 요소에서 기존 테마 클래스 제거 후 새 테마 적용
  keyboard.className = keyboard.className.replace(/theme-\S+/g, '').trim();
  if (themeSelect.value !== 'classic') {
    keyboard.classList.add('theme-' + themeSelect.value);
  }
});

// ─── 멀티터치 추적 ───
const activeTouches = new Map(); // touchId → noteId

function getKeyAtPoint(x, y) {
  const els = document.elementsFromPoint(x, y);
  return els.find(el => el.classList.contains('key')) || null;
}

function getKeyFromTarget(target) {
  // target이 key 자체이거나 key 안의 span일 수 있음
  if (target.classList && target.classList.contains('key')) return target;
  if (target.parentElement && target.parentElement.classList.contains('key')) return target.parentElement;
  return null;
}

// ─── 건반 생성 ───
function buildKeyboard() {
  // 테마 클래스 보존
  const themeClass = [...keyboard.classList].find(c => c.startsWith('theme-')) || '';
  keyboard.innerHTML = '';
  keyboard.className = themeClass;

  for (let octave = 1; octave <= 7; octave++) {
    NOTES.forEach(key => {
      const el = document.createElement('div');
      el.className = `key ${key.type}`;
      el.dataset.note = key.note;
      el.dataset.octave = octave;

      const label = document.createElement('span');
      if (currentInstrument === 'drum') {
        label.textContent = DRUM_LABELS[key.note] || key.note;
        label.style.fontSize = '10px';
      } else {
        label.textContent = key.type === 'white' ? `${key.note}${octave}` : key.note;
      }
      el.appendChild(label);

      keyboard.appendChild(el);
    });
  }

  if (practiceState.active) highlightTargetKey();
  requestAnimationFrame(() => {
    scrollToOctave(currentOctave);
    updateNavWindow();
  });
}

function scrollToOctave(octave) {
  const targetKey = keyboard.querySelector(`[data-note="C"][data-octave="${octave}"]`);
  if (!targetKey) return;
  const scrollPos = targetKey.offsetLeft - viewport.clientWidth / 2 + 100;
  viewport.scrollLeft = Math.max(0, scrollPos);
}

// ─── 마우스 이벤트 (글리산도 + 동시 누르기) ───
let mouseDown = false;
let mouseNoteId = null;

keyboard.addEventListener('mousedown', (e) => {
  e.preventDefault();
  mouseDown = true;
  const el = getKeyFromTarget(e.target);
  if (el) {
    const note = el.dataset.note;
    const octave = parseInt(el.dataset.octave);
    mouseNoteId = `${note}${octave}`;
    startNote(note, octave, el);
  }
});

document.addEventListener('mousemove', (e) => {
  if (!mouseDown) return;
  const el = getKeyAtPoint(e.clientX, e.clientY);
  if (!el) return;

  const note = el.dataset.note;
  const octave = parseInt(el.dataset.octave);
  const newId = `${note}${octave}`;

  if (newId !== mouseNoteId) {
    // 이전 건반 릴리즈, 새 건반 프레스 (글리산도)
    if (mouseNoteId) {
      const prevEl = keyboard.querySelector(`.key[data-note="${mouseNoteId.replace(/\d+$/, '')}"][data-octave="${mouseNoteId.match(/\d+$/)[0]}"]`);
      const [pn, po] = [mouseNoteId.replace(/\d+$/, ''), parseInt(mouseNoteId.match(/\d+$/)[0])];
      stopNote(pn, po, prevEl);
    }
    mouseNoteId = newId;
    startNote(note, octave, el);
  }
});

document.addEventListener('mouseup', () => {
  if (!mouseDown) return;
  mouseDown = false;
  if (mouseNoteId) {
    const pn = mouseNoteId.replace(/\d+$/, '');
    const po = parseInt(mouseNoteId.match(/\d+$/)[0]);
    const prevEl = keyboard.querySelector(`.key[data-note="${pn}"][data-octave="${po}"]`);
    stopNote(pn, po, prevEl);
    mouseNoteId = null;
  }
});

// ─── 터치 이벤트 (멀티터치 + 글리산도) ───
keyboard.addEventListener('touchstart', (e) => {
  e.preventDefault();
  for (const touch of e.changedTouches) {
    const el = getKeyFromTarget(touch.target) || getKeyAtPoint(touch.clientX, touch.clientY);
    if (!el) continue;
    const note = el.dataset.note;
    const octave = parseInt(el.dataset.octave);
    const noteId = `${note}${octave}`;
    activeTouches.set(touch.identifier, noteId);
    startNote(note, octave, el);
  }
}, { passive: false });

keyboard.addEventListener('touchmove', (e) => {
  e.preventDefault();
  for (const touch of e.changedTouches) {
    const el = getKeyAtPoint(touch.clientX, touch.clientY);
    if (!el) continue;
    const note = el.dataset.note;
    const octave = parseInt(el.dataset.octave);
    const newId = `${note}${octave}`;
    const prevId = activeTouches.get(touch.identifier);

    if (prevId && prevId !== newId) {
      // 이전 건반 릴리즈
      const pn = prevId.replace(/\d+$/, '');
      const po = parseInt(prevId.match(/\d+$/)[0]);
      const prevEl = keyboard.querySelector(`.key[data-note="${pn}"][data-octave="${po}"]`);
      stopNote(pn, po, prevEl);
    }

    if (prevId !== newId) {
      activeTouches.set(touch.identifier, newId);
      startNote(note, octave, el);
    }
  }
}, { passive: false });

keyboard.addEventListener('touchend', (e) => {
  for (const touch of e.changedTouches) {
    const noteId = activeTouches.get(touch.identifier);
    if (noteId) {
      const pn = noteId.replace(/\d+$/, '');
      const po = parseInt(noteId.match(/\d+$/)[0]);
      const prevEl = keyboard.querySelector(`.key[data-note="${pn}"][data-octave="${po}"]`);
      stopNote(pn, po, prevEl);
      activeTouches.delete(touch.identifier);
    }
  }
});

keyboard.addEventListener('touchcancel', (e) => {
  for (const touch of e.changedTouches) {
    const noteId = activeTouches.get(touch.identifier);
    if (noteId) {
      const pn = noteId.replace(/\d+$/, '');
      const po = parseInt(noteId.match(/\d+$/)[0]);
      const prevEl = keyboard.querySelector(`.key[data-note="${pn}"][data-octave="${po}"]`);
      stopNote(pn, po, prevEl);
      activeTouches.delete(touch.identifier);
    }
  }
});

// ─── 음 재생/정지 ───
function startNote(note, octave, el) {
  const noteId = `${note}${octave}`;
  if (activeNotes.has(noteId)) return;

  const freq = getFrequency(note, octave);
  const sound = playSound(freq, note);
  activeNotes.set(noteId, sound);

  if (el) el.classList.add('active');

  // 연습 모드 판정
  if (practiceState.active && octave === practiceState.octave) {
    checkNote(note);
  }
}

function stopNote(note, octave, el) {
  const noteId = `${note}${octave}`;
  const sound = activeNotes.get(noteId);
  if (sound) {
    const now = audioCtx.currentTime;
    sound.gain.gain.cancelScheduledValues(now);
    sound.gain.gain.setValueAtTime(sound.gain.gain.value, now);
    sound.gain.gain.linearRampToValueAtTime(0, now + 0.3);
    sound.oscillators.forEach(osc => osc.stop(now + 0.3));
    if (sound.noiseSource) {
      try { sound.noiseSource.stop(now + 0.3); } catch (e) {}
    }
    activeNotes.delete(noteId);
  }
  if (el) el.classList.remove('active');
}

// ─── 네비게이션 미니맵 ───
const navTrack = document.getElementById('nav-track');
const navWindow = document.getElementById('nav-window');
const navLabels = document.getElementById('nav-labels');

// 라벨 생성
for (let i = 1; i <= 7; i++) {
  const span = document.createElement('span');
  span.textContent = `C${i}`;
  navLabels.appendChild(span);
}

function updateNavWindow() {
  const totalWidth = keyboard.scrollWidth;
  const viewWidth = viewport.clientWidth;
  const trackWidth = navTrack.clientWidth;

  if (totalWidth <= viewWidth) {
    navWindow.style.left = '0px';
    navWindow.style.width = `${trackWidth}px`;
    return;
  }

  const ratio = viewWidth / totalWidth;
  const winW = Math.max(30, trackWidth * ratio);
  const scrollRatio = viewport.scrollLeft / (totalWidth - viewWidth);
  const winLeft = scrollRatio * (trackWidth - winW);

  navWindow.style.width = `${winW}px`;
  navWindow.style.left = `${winLeft}px`;
}

// 네비게이션바 드래그로 스크롤
let navDragging = false;
let navDragOffset = 0;

function navScrollTo(clientX) {
  const rect = navTrack.getBoundingClientRect();
  const trackWidth = navTrack.clientWidth;
  const winW = navWindow.clientWidth;
  const totalWidth = keyboard.scrollWidth;
  const viewWidth = viewport.clientWidth;

  let pos = clientX - rect.left - navDragOffset;
  pos = Math.max(0, Math.min(pos, trackWidth - winW));
  const scrollRatio = pos / (trackWidth - winW);
  viewport.scrollLeft = scrollRatio * (totalWidth - viewWidth);
  updateNavWindow();
}

navTrack.addEventListener('mousedown', (e) => {
  e.preventDefault();
  navDragging = true;
  const winRect = navWindow.getBoundingClientRect();
  if (e.clientX >= winRect.left && e.clientX <= winRect.right) {
    navDragOffset = e.clientX - winRect.left;
  } else {
    navDragOffset = navWindow.clientWidth / 2;
    navScrollTo(e.clientX);
  }
});

document.addEventListener('mousemove', (e) => {
  if (navDragging) navScrollTo(e.clientX);
});

document.addEventListener('mouseup', () => { navDragging = false; });

// 터치 네비게이션
navTrack.addEventListener('touchstart', (e) => {
  e.preventDefault();
  navDragging = true;
  const touch = e.touches[0];
  const winRect = navWindow.getBoundingClientRect();
  if (touch.clientX >= winRect.left && touch.clientX <= winRect.right) {
    navDragOffset = touch.clientX - winRect.left;
  } else {
    navDragOffset = navWindow.clientWidth / 2;
    navScrollTo(touch.clientX);
  }
}, { passive: false });

navTrack.addEventListener('touchmove', (e) => {
  if (navDragging) navScrollTo(e.touches[0].clientX);
}, { passive: true });

navTrack.addEventListener('touchend', () => { navDragging = false; });

// viewport 스크롤 시 미니맵 동기화 (프로그래밍 방식 스크롤 포함)
viewport.addEventListener('scroll', updateNavWindow);

// ─── 키보드 입력 ───
function getCenterOctave() {
  const viewportCenter = viewport.scrollLeft + viewport.clientWidth / 2;
  const keys = keyboard.querySelectorAll('[data-note="C"]');
  let closest = 4;
  let minDist = Infinity;
  keys.forEach(key => {
    const dist = Math.abs(key.offsetLeft - viewportCenter);
    if (dist < minDist) {
      minDist = dist;
      closest = parseInt(key.dataset.octave);
    }
  });
  return closest;
}

function resolveKey(kbKey) {
  const k = kbKey.toLowerCase();
  const centerOctave = getCenterOctave();
  if (KB_MAP_OCT1[k]) return { note: KB_MAP_OCT1[k], octave: centerOctave };
  if (KB_MAP_OCT2[k]) return { note: KB_MAP_OCT2[k], octave: centerOctave + 1 };
  return null;
}

document.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const resolved = resolveKey(e.key);
  if (!resolved) return;

  const el = keyboard.querySelector(`[data-note="${resolved.note}"][data-octave="${resolved.octave}"]`);
  startNote(resolved.note, resolved.octave, el);
});

document.addEventListener('keyup', (e) => {
  const resolved = resolveKey(e.key);
  if (!resolved) return;

  const el = keyboard.querySelector(`[data-note="${resolved.note}"][data-octave="${resolved.octave}"]`);
  stopNote(resolved.note, resolved.octave, el);
});

// ─── 키보드 옥타브 이동 (Z/X) ───
document.addEventListener('keydown', (e) => {
  if (e.key === 'z') {
    const oct = getCenterOctave();
    if (oct > 1) scrollToOctave(oct - 1);
  }
  if (e.key === 'x') {
    const oct = getCenterOctave();
    if (oct < 7) scrollToOctave(oct + 1);
  }
});

// ─── 초기화 ───
buildKeyboard();
