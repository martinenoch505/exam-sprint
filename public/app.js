const $ = selector => document.querySelector(selector);
const state = { mode: 'topic', files: [], pack: null, activeCard: 0, activeQuiz: 0, score: 0, answered: false };
const form = $('#pack-form'); const fileInput = $('#files'); const cameraInput = $('#camera'); const status = $('#status');
const STORAGE_KEY = 'exam-sprint-study-pack';

function setStatus(message) { status.textContent = message; }
function updateHeader() {
  const course = $('#course').value.trim(); const date = $('#exam-date').value; const type = $('#exam-type').value;
  $('#header-course').textContent = course || (state.pack ? state.pack.title : 'Your study space');
  $('#badge-date').textContent = date ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${date}T12:00:00`)) : 'Set your exam date';
  $('#badge-type').textContent = type;
}

function setMode(mode) {
  state.mode = mode;
  const isTopic = mode === 'topic';
  const topicBtn = $('#mode-topic-btn');
  const notesBtn = $('#mode-notes-btn');
  if (topicBtn) {
    topicBtn.classList.toggle('active', isTopic);
    topicBtn.setAttribute('aria-selected', isTopic ? 'true' : 'false');
  }
  if (notesBtn) {
    notesBtn.classList.toggle('active', !isTopic);
    notesBtn.setAttribute('aria-selected', !isTopic ? 'true' : 'false');
  }
  const packForm = $('#pack-form');
  if (packForm) {
    packForm.classList.toggle('mode-topic', isTopic);
    packForm.classList.toggle('mode-notes', !isTopic);
  }
  const labelText = $('#course-label-text');
  const courseInput = $('#course');
  if (isTopic) {
    if (labelText) labelText.textContent = 'Topic to study';
    if (courseInput) courseInput.placeholder = 'e.g. Virtual Memory or Normalization';
    const consent = $('#consent');
    if (consent) consent.checked = true;
  } else {
    if (labelText) labelText.textContent = 'Course name';
    if (courseInput) courseInput.placeholder = 'e.g. Introduction to Sociology';
  }
  updateHeader();
}

function makeChip(file, index) {
  const chip = document.createElement('div'); chip.className = 'file-chip';
  const name = document.createElement('span'); name.textContent = file.name;
  const remove = document.createElement('button'); remove.type = 'button'; remove.setAttribute('aria-label', `Remove ${file.name}`); remove.textContent = '×';
  remove.addEventListener('click', () => { state.files.splice(index, 1); renderFiles(); }); chip.append(name, remove); return chip;
}
function renderFiles() { $('#file-chips').replaceChildren(...state.files.map(makeChip)); }
function addFiles(files) {
  const incoming = [...files]; const permitted = incoming.filter(file => ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'].includes(file.type) && file.size <= 8 * 1024 * 1024);
  const remaining = Math.max(0, 30 - state.files.length); state.files.push(...permitted.slice(0, remaining)); renderFiles();
  if (permitted.length !== incoming.length || incoming.length > remaining) setStatus('Only JPG, PNG, WEBP, PDF, or text files under 8 MB are accepted; 30 files maximum.'); else setStatus(`${state.files.length} file${state.files.length === 1 ? '' : 's'} ready.`);
}

function createItem(title, detail) {
  const item = document.createElement('li');
  const heading = document.createElement('strong');
  heading.textContent = title;
  const sep = document.createTextNode(' — ');
  const text = document.createElement('span');
  text.textContent = detail;
  item.append(heading, sep, text);
  return item;
}

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === tab));
}

function showPack(pack, options = {}) {
  state.pack = pack; state.activeCard = 0; state.activeQuiz = 0; state.score = 0; state.answered = false;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pack)); } catch (_) { }
  $('#workspace-course').textContent = pack.title; $('#course-summary').textContent = pack.summary;
  $('#source-note').textContent = options.restored
    ? 'Restored from local storage. Ready for offline review.'
    : 'Built for fast exam review. Practice questions are for recall, not predictions.';
  const terms = $('#key-terms'); terms.replaceChildren(...pack.keyTerms.map(item => { const term = document.createElement('dt'); const definition = document.createElement('dd'); term.textContent = item.term; definition.textContent = item.definition; return [term, definition]; }).flat());
  $('#study-plan').replaceChildren(...pack.studyPlan.map(item => {
    const title = item.topic || item.step;
    const detail = item.focus;
    return createItem(title, detail);
  }));
  $('#workspace').hidden = false; $('#setup-card').hidden = true; renderFlashcard(); renderQuiz(); switchTab('summary');
  if (!options.silent) $('#workspace').scrollIntoView({ behavior: 'smooth' });
}

function hasSavedPack() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const pack = JSON.parse(raw);
    return Boolean(pack && pack.title && pack.summary && Array.isArray(pack.keyTerms));
  } catch (_) {
    return false;
  }
}

function restoreSavedPack() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const pack = JSON.parse(raw);
    if (pack && pack.title && pack.summary && Array.isArray(pack.keyTerms)) {
      showPack(pack, { restored: true, silent: true });
      return true;
    }
  } catch (_) { }
  return false;
}

function renderFlashcard() {
  const cards = state.pack.flashcards;
  if (!cards.length) {
    $('#card-counter').textContent = 'No flashcards available'; $('#card-progress').textContent = '0 / 0'; $('#card-question').textContent = 'The material did not contain enough concepts for flashcards.'; $('#card-answer').textContent = 'Try another topic or clearer notes.'; $('#flashcard').disabled = true; $('#review-card').disabled = true; $('#got-card').disabled = true; return;
  }
  const card = cards[state.activeCard]; $('#card-counter').textContent = `Card ${state.activeCard + 1}`; $('#card-progress').textContent = `${state.activeCard + 1} / ${cards.length}`; $('#card-question').textContent = card.question; $('#card-answer').textContent = card.answer; $('#flashcard').disabled = false; $('#review-card').disabled = false; $('#got-card').disabled = false; $('#flashcard').classList.remove('flipped');
}
function advanceCard() { state.activeCard = (state.activeCard + 1) % state.pack.flashcards.length; renderFlashcard(); }

function renderQuiz() {
  const quiz = state.pack.quiz;
  if (!quiz.length) {
    $('#quiz-count').textContent = 'No practice questions available'; $('#quiz-score').textContent = '0 correct'; $('#quiz-question').textContent = 'The material did not contain enough content to build a quiz.'; $('#quiz-options').replaceChildren(); $('#quiz-feedback').textContent = 'Try another topic and generate a new study pack.'; $('#toggle-explanation').hidden = true; $('#quiz-explanation').hidden = true; $('#next-question').disabled = true; return;
  }
  const item = quiz[state.activeQuiz]; state.answered = false; $('#next-question').disabled = false; $('#quiz-count').textContent = `Question ${state.activeQuiz + 1} of ${quiz.length}`; $('#quiz-score').textContent = `${state.score} correct`; $('#quiz-question').textContent = item.question; $('#quiz-feedback').textContent = ''; $('#toggle-explanation').hidden = true; $('#quiz-explanation').hidden = true; $('#quiz-explanation').textContent = item.explanation;
  const options = $('#quiz-options'); options.replaceChildren(...item.options.map((option, index) => { const label = document.createElement('label'); label.className = 'option'; const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'quiz-option'; radio.value = String(index); const text = document.createElement('span'); text.textContent = option; radio.addEventListener('change', () => gradeQuiz(index)); label.append(radio, text); return label; }));
}

function gradeQuiz(index) {
  if (state.answered) return; state.answered = true; const item = state.pack.quiz[state.activeQuiz]; const labels = [...$('#quiz-options').querySelectorAll('.option')]; labels.forEach((label, optionIndex) => { const radio = label.querySelector('input'); radio.disabled = true; if (optionIndex === item.correctIndex) label.classList.add('correct'); if (optionIndex === index && index !== item.correctIndex) label.classList.add('incorrect'); });
  const correct = index === item.correctIndex; if (correct) state.score += 1; $('#quiz-score').textContent = `${state.score} correct`; $('#quiz-feedback').textContent = correct ? 'Correct — keep going.' : 'Not quite. Review the explanation, then continue.'; $('#toggle-explanation').hidden = false;
}

function showOfflineMessage() {
  const savedHint = hasSavedPack()
    ? ' Your previously saved pack is still stored on this device if you want to review it.'
    : '';
  setStatus(`Your internet connection is off. Check your network and try again.${savedHint}`);
}

async function submitPack(event) {
  event.preventDefault();
  const courseOrTopic = $('#course').value.trim();
  if (courseOrTopic.length < 2) {
    return setStatus(state.mode === 'topic' ? 'Enter a topic to study (at least 2 characters).' : 'Enter your course name.');
  }
  if (state.mode === 'notes' && !state.files.length && !$('#pasted-notes').value.trim()) {
    return setStatus('Add a note, image, PDF, text file, or paste your notes.');
  }
  if (!$('#consent').checked) {
    return setStatus('Confirm that you have permission to upload these materials.');
  }

  if (!navigator.onLine) {
    return showOfflineMessage();
  }

  $('#loading').hidden = false;
  $('#submit').disabled = true;
  setStatus('');

  const data = new FormData();
  data.set('mode', state.mode);
  data.set('course', courseOrTopic);
  const context = $('#topic-context')?.value?.trim();
  if (context) data.set('topicContext', context);
  data.set('examDate', $('#exam-date').value);
  data.set('examType', $('#exam-type').value);
  data.set('pastedNotes', state.mode === 'notes' ? $('#pasted-notes').value.trim() : '');
  data.set('consent', 'true');
  if (state.mode === 'notes') {
    state.files.forEach(file => data.append('files', file, file.name));
  }

  try {
    const response = await fetch('/api/study-pack', { method: 'POST', body: data });
    const rawText = await response.text();
    let body = {};
    if (rawText) {
      try {
        body = JSON.parse(rawText);
      } catch (_) {
        if (!response.ok) {
          throw new Error('Your internet connection is off or unstable. Check your network and try again.');
        }
        throw new Error('Received an invalid response from the server. Please try again.');
      }
    }
    if (!response.ok) {
      const serverMsg = body.error || 'Could not create this study pack.';
      if (/timeout|connect|network|offline|etimedout|econnreset|enotfound/i.test(serverMsg)) {
        throw new Error('Your internet connection is off or timed out. Check your network and try again.');
      }
      throw new Error(serverMsg);
    }
    showPack(body);
  } catch (error) {
    const msg = error?.message || '';
    const isNetworkError =
      !navigator.onLine ||
      error?.name === 'TypeError' ||
      /network|failed to fetch|load failed|offline|internet connection|timed out|connect/i.test(msg);

    if (isNetworkError) {
      showOfflineMessage();
    } else {
      setStatus(msg || 'Could not create this study pack. Please try again.');
    }
  } finally {
    $('#loading').hidden = true;
    $('#submit').disabled = false;
  }
}

function updateOnlineStatus() {
  const dot = document.querySelector('.status-dot');
  if (!dot) return;
  if (navigator.onLine) {
    dot.innerHTML = '<i></i> Ready';
    dot.style.color = '';
  } else {
    dot.innerHTML = '<i style="background:#d97706"></i> Offline';
    dot.style.color = 'var(--muted)';
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { });
  });
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

$('#mode-topic-btn')?.addEventListener('click', () => setMode('topic'));
$('#mode-notes-btn')?.addEventListener('click', () => setMode('notes'));
['#course', '#exam-date', '#exam-type'].forEach(selector => $(selector).addEventListener('input', updateHeader));
$('#choose-files').addEventListener('click', () => fileInput.click()); $('#snap-notes').addEventListener('click', () => cameraInput.click()); fileInput.addEventListener('change', () => addFiles(fileInput.files)); cameraInput.addEventListener('change', () => addFiles(cameraInput.files));
const dropzone = $('#dropzone');['dragenter', 'dragover'].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add('dragging'); }));['dragleave', 'drop'].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove('dragging'); })); dropzone.addEventListener('drop', event => addFiles(event.dataTransfer.files)); dropzone.addEventListener('click', () => fileInput.click()); dropzone.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); } });
form.addEventListener('submit', submitPack); document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab))); $('#flashcard').addEventListener('click', () => $('#flashcard').classList.toggle('flipped')); $('#review-card').addEventListener('click', advanceCard); $('#got-card').addEventListener('click', advanceCard); $('#next-question').addEventListener('click', () => { state.activeQuiz = (state.activeQuiz + 1) % state.pack.quiz.length; renderQuiz(); }); $('#toggle-explanation').addEventListener('click', () => { const explanation = $('#quiz-explanation'); explanation.hidden = !explanation.hidden; $('#toggle-explanation').textContent = explanation.hidden ? 'Show explanation' : 'Hide explanation'; });
$('#save-local').addEventListener('click', () => { if (!state.pack) return; localStorage.setItem(STORAGE_KEY, JSON.stringify(state.pack)); $('#save-status').textContent = 'Saved on this device.'; }); $('#print-pack').addEventListener('click', () => window.print()); $('#new-pack').addEventListener('click', () => { $('#workspace').hidden = true; $('#setup-card').hidden = false; state.files = []; renderFiles(); setStatus(''); setMode(state.mode); window.scrollTo({ top: 0, behavior: 'smooth' }); });

setMode('topic');
updateHeader();
restoreSavedPack();