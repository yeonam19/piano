const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// 피아노 음의 주파수 계산: A4 = 440Hz 기준
function getFrequency(note, octave) {
  const noteIndex = {
    'C': -9, 'C#': -8, 'D': -7, 'D#': -6, 'E': -5,
    'F': -4, 'F#': -3, 'G': -2, 'G#': -1, 'A': 0, 'A#': 1, 'B': 2
  };
  const semitones = noteIndex[note] + (octave - 4) * 12;
  return 440 * Math.pow(2, semitones / 12);
}

// 피아노 소리 합성 (배음 + ADSR 엔벨로프)
function playNote(frequency) {
  const now = audioCtx.currentTime;

  const gain = audioCtx.createGain();
  gain.connect(audioCtx.destination);

  // ADSR 엔벨로프
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.4, now + 0.01);   // Attack
  gain.gain.linearRampToValueAtTime(0.3, now + 0.1);    // Decay
  gain.gain.linearRampToValueAtTime(0.15, now + 0.5);   // Sustain
  gain.gain.linearRampToValueAtTime(0, now + 2.0);      // Release

  // 기본음 + 배음으로 피아노 음색 구현
  const harmonics = [
    { ratio: 1, gain: 1.0 },
    { ratio: 2, gain: 0.5 },
    { ratio: 3, gain: 0.25 },
    { ratio: 4, gain: 0.1 },
    { ratio: 5, gain: 0.05 },
  ];

  const oscillators = harmonics.map(h => {
    const osc = audioCtx.createOscillator();
    const hGain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency * h.ratio, now);
    hGain.gain.setValueAtTime(h.gain, now);
    osc.connect(hGain);
    hGain.connect(gain);
    osc.start(now);
    osc.stop(now + 2.0);
    return osc;
  });

  return { gain, oscillators };
}

// 1옥타브 음 정의
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

// 키보드 매핑: 첫째 옥타브(좌측) + 둘째 옥타브(우측)
const KB_MAP_OCT1 = { 'a':'C', 'w':'C#', 's':'D', 'e':'D#', 'd':'E', 'f':'F', 't':'F#', 'g':'G', 'y':'G#', 'h':'A', 'u':'A#', 'j':'B' };
const KB_MAP_OCT2 = { 'k':'C', 'o':'C#', 'l':'D', 'p':'D#', ';':'E', "'":"F" };

let currentOctave = 3;
const activeNotes = new Map(); // 현재 울리고 있는 음 추적
const keyboard = document.getElementById('keyboard');

// 키보드 키 → 옥타브 오프셋 역매핑
function getKbHint(note, octaveOffset) {
  if (octaveOffset === 0) {
    return Object.entries(KB_MAP_OCT1).find(([, n]) => n === note)?.[0]?.toUpperCase();
  }
  return Object.entries(KB_MAP_OCT2).find(([, n]) => n === note)?.[0]?.toUpperCase();
}

function buildKeyboard() {
  keyboard.innerHTML = '';

  // 2옥타브 생성
  for (let oct = 0; oct < 2; oct++) {
    const octave = currentOctave + oct;

    NOTES.forEach(key => {
      const el = document.createElement('div');
      el.className = `key ${key.type}`;
      el.dataset.note = key.note;
      el.dataset.octave = octave;

      const label = document.createElement('span');
      label.textContent = key.type === 'white' ? `${key.note}${octave}` : key.note;
      el.appendChild(label);

      const kbHint = getKbHint(key.note, oct);
      if (kbHint) {
        const hint = document.createElement('span');
        hint.textContent = kbHint;
        hint.style.fontSize = '10px';
        hint.style.opacity = '0.5';
        hint.style.marginTop = '4px';
        el.appendChild(hint);
        el.style.gap = '2px';
      }

      // 마우스 이벤트
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startNote(key.note, octave, el);
      });
      el.addEventListener('mouseup', () => stopNote(key.note, octave, el));
      el.addEventListener('mouseleave', () => stopNote(key.note, octave, el));

      // 터치 이벤트
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startNote(key.note, octave, el);
      });
      el.addEventListener('touchend', (e) => {
        e.preventDefault();
        stopNote(key.note, octave, el);
      });

      keyboard.appendChild(el);
    });
  }
}

function startNote(note, octave, el) {
  // AudioContext resume (브라우저 자동재생 정책 대응)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const noteId = `${note}${octave}`;
  if (activeNotes.has(noteId)) return; // 이미 재생 중

  const freq = getFrequency(note, octave);
  const sound = playNote(freq);
  activeNotes.set(noteId, sound);

  if (el) el.classList.add('active');
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
    activeNotes.delete(noteId);
  }

  if (el) el.classList.remove('active');
}

// 키보드 입력 처리
function resolveKey(kbKey) {
  const k = kbKey.toLowerCase();
  if (KB_MAP_OCT1[k]) return { note: KB_MAP_OCT1[k], octave: currentOctave };
  if (KB_MAP_OCT2[k]) return { note: KB_MAP_OCT2[k], octave: currentOctave + 1 };
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

// 옥타브 조절
document.getElementById('octave-down').addEventListener('click', () => {
  if (currentOctave > 1) {
    currentOctave--;
    updateOctaveDisplay();
    buildKeyboard();
  }
});

document.getElementById('octave-up').addEventListener('click', () => {
  if (currentOctave < 6) {
    currentOctave++;
    updateOctaveDisplay();
    buildKeyboard();
  }
});

// 키보드로 옥타브 조절 (Z: 내리기, X: 올리기)
document.addEventListener('keydown', (e) => {
  if (e.key === 'z' && currentOctave > 1) {
    currentOctave--;
    updateOctaveDisplay();
    buildKeyboard();
  }
  if (e.key === 'x' && currentOctave < 6) {
    currentOctave++;
    updateOctaveDisplay();
    buildKeyboard();
  }
});

function updateOctaveDisplay() {
  document.getElementById('octave-display').textContent = `옥타브: ${currentOctave}–${currentOctave + 1}`;
}

// 초기 건반 생성
buildKeyboard();
