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

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.4, now + 0.01);
  gain.gain.linearRampToValueAtTime(0.3, now + 0.1);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.5);
  gain.gain.linearRampToValueAtTime(0, now + 2.0);

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

// 키보드 매핑
const KB_MAP_OCT1 = { 'a':'C', 'w':'C#', 's':'D', 'e':'D#', 'd':'E', 'f':'F', 't':'F#', 'g':'G', 'y':'G#', 'h':'A', 'u':'A#', 'j':'B' };
const KB_MAP_OCT2 = { 'k':'C', 'o':'C#', 'l':'D', 'p':'D#', ';':'E', "'":"F" };

let currentOctave = 3;
let isDragMode = false;
const activeNotes = new Map();
const viewport = document.getElementById('keyboard-viewport');
const keyboard = document.getElementById('keyboard');
const modeToggle = document.getElementById('mode-toggle');

// ─── 드래그 스크롤 상태 ───
let dragState = {
  isDragging: false,
  startX: 0,
  scrollLeft: 0,
  movedDistance: 0,  // 클릭 vs 드래그 구분용
};

const DRAG_THRESHOLD = 8; // 이 픽셀 이상 이동하면 드래그로 판정

// ─── 건반 생성 ───
function getKbHint(note, octaveOffset) {
  if (octaveOffset === 0) {
    return Object.entries(KB_MAP_OCT1).find(([, n]) => n === note)?.[0]?.toUpperCase();
  }
  if (octaveOffset === 1) {
    return Object.entries(KB_MAP_OCT2).find(([, n]) => n === note)?.[0]?.toUpperCase();
  }
  return null;
}

function buildKeyboard() {
  keyboard.innerHTML = '';
  keyboard.style.transform = '';

  if (isDragMode) {
    buildFullKeyboard();
  } else {
    buildPagedKeyboard();
  }
}

function buildPagedKeyboard() {
  for (let oct = 0; oct < 2; oct++) {
    const octave = currentOctave + oct;
    NOTES.forEach(key => {
      keyboard.appendChild(createKeyElement(key, octave, getKbHint(key.note, oct)));
    });
  }
}

function buildFullKeyboard() {
  // 옥타브 1~7 전체 건반 생성
  for (let octave = 1; octave <= 7; octave++) {
    NOTES.forEach(key => {
      keyboard.appendChild(createKeyElement(key, octave, null));
    });
  }

  // C4 위치로 초기 스크롤
  requestAnimationFrame(() => {
    scrollToOctave(4);
  });
}

function createKeyElement(key, octave, kbHint) {
  const el = document.createElement('div');
  el.className = `key ${key.type}`;
  el.dataset.note = key.note;
  el.dataset.octave = octave;

  const label = document.createElement('span');
  label.textContent = key.type === 'white' ? `${key.note}${octave}` : key.note;
  el.appendChild(label);

  if (kbHint) {
    const hint = document.createElement('span');
    hint.textContent = kbHint;
    hint.style.fontSize = '10px';
    hint.style.opacity = '0.5';
    hint.style.marginTop = '4px';
    el.appendChild(hint);
    el.style.gap = '2px';
  }

  // 마우스: 드래그 모드에서는 mousedown에서 바로 재생하지 않음
  el.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (!isDragMode) {
      startNote(key.note, octave, el);
    }
    // 드래그 모드에서는 mouseup 시 드래그가 아니었으면 재생
  });
  el.addEventListener('mouseup', () => {
    if (isDragMode && dragState.movedDistance < DRAG_THRESHOLD) {
      startNote(key.note, octave, el);
      setTimeout(() => stopNote(key.note, octave, el), 200);
    } else {
      stopNote(key.note, octave, el);
    }
  });
  el.addEventListener('mouseleave', () => {
    if (!isDragMode) stopNote(key.note, octave, el);
  });

  // 터치
  el.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!isDragMode) {
      startNote(key.note, octave, el);
    }
  });
  el.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (isDragMode && dragState.movedDistance < DRAG_THRESHOLD) {
      startNote(key.note, octave, el);
      setTimeout(() => stopNote(key.note, octave, el), 200);
    } else {
      stopNote(key.note, octave, el);
    }
  });

  return el;
}

function scrollToOctave(octave) {
  const targetKey = keyboard.querySelector(`[data-note="C"][data-octave="${octave}"]`);
  if (!targetKey) return;

  const viewportWidth = viewport.clientWidth;
  const keyLeft = targetKey.offsetLeft;
  // 타겟 건반을 뷰포트 중앙 근처에 배치
  const scrollPos = keyLeft - viewportWidth / 2 + 100;
  viewport.scrollLeft = Math.max(0, scrollPos);
}

// ─── 음 재생/정지 ───
function startNote(note, octave, el) {
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const noteId = `${note}${octave}`;
  if (activeNotes.has(noteId)) return;

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

// ─── 드래그 스크롤 (뷰포트 레벨) ───
viewport.addEventListener('mousedown', (e) => {
  if (!isDragMode) return;
  dragState.isDragging = true;
  dragState.startX = e.pageX;
  dragState.scrollLeft = viewport.scrollLeft;
  dragState.movedDistance = 0;
  viewport.classList.add('dragging');
});

viewport.addEventListener('mousemove', (e) => {
  if (!isDragMode || !dragState.isDragging) return;
  const dx = e.pageX - dragState.startX;
  dragState.movedDistance = Math.abs(dx);
  viewport.scrollLeft = dragState.scrollLeft - dx;
});

document.addEventListener('mouseup', () => {
  if (dragState.isDragging) {
    dragState.isDragging = false;
    viewport.classList.remove('dragging');
  }
});

// 터치 드래그
viewport.addEventListener('touchstart', (e) => {
  if (!isDragMode) return;
  const touch = e.touches[0];
  dragState.isDragging = true;
  dragState.startX = touch.pageX;
  dragState.scrollLeft = viewport.scrollLeft;
  dragState.movedDistance = 0;
  viewport.classList.add('dragging');
}, { passive: true });

viewport.addEventListener('touchmove', (e) => {
  if (!isDragMode || !dragState.isDragging) return;
  const touch = e.touches[0];
  const dx = touch.pageX - dragState.startX;
  dragState.movedDistance = Math.abs(dx);
  viewport.scrollLeft = dragState.scrollLeft - dx;
}, { passive: true });

viewport.addEventListener('touchend', () => {
  if (dragState.isDragging) {
    dragState.isDragging = false;
    viewport.classList.remove('dragging');
  }
});

// ─── 모드 전환 ───
modeToggle.addEventListener('click', () => {
  isDragMode = !isDragMode;
  modeToggle.classList.toggle('active', isDragMode);
  modeToggle.textContent = isDragMode ? '🎹 페이지 모드' : '🔀 드래그 모드';
  viewport.classList.toggle('drag-mode', isDragMode);

  // 옥타브 버튼 숨김/표시
  document.getElementById('octave-down').style.display = isDragMode ? 'none' : '';
  document.getElementById('octave-up').style.display = isDragMode ? 'none' : '';
  document.getElementById('octave-display').style.display = isDragMode ? 'none' : '';

  buildKeyboard();
});

// ─── 키보드 입력 ───
function resolveKey(kbKey) {
  const k = kbKey.toLowerCase();
  if (isDragMode) {
    // 드래그 모드에서는 화면 중앙 근처의 옥타브 기준
    const centerOctave = getCenterOctave();
    if (KB_MAP_OCT1[k]) return { note: KB_MAP_OCT1[k], octave: centerOctave };
    if (KB_MAP_OCT2[k]) return { note: KB_MAP_OCT2[k], octave: centerOctave + 1 };
  } else {
    if (KB_MAP_OCT1[k]) return { note: KB_MAP_OCT1[k], octave: currentOctave };
    if (KB_MAP_OCT2[k]) return { note: KB_MAP_OCT2[k], octave: currentOctave + 1 };
  }
  return null;
}

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

// ─── 옥타브 조절 (페이지 모드) ───
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

document.addEventListener('keydown', (e) => {
  if (e.key === 'z' && !isDragMode && currentOctave > 1) {
    currentOctave--;
    updateOctaveDisplay();
    buildKeyboard();
  }
  if (e.key === 'x' && !isDragMode && currentOctave < 6) {
    currentOctave++;
    updateOctaveDisplay();
    buildKeyboard();
  }
});

function updateOctaveDisplay() {
  document.getElementById('octave-display').textContent = `옥타브: ${currentOctave}–${currentOctave + 1}`;
}

// ─── 초기화 ───
buildKeyboard();
