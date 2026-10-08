const $ = (selector) => document.querySelector(selector);
const state = {
  interview: null,
  recognition: null,
  listening: false,
  baseTranscript: '',
  finalTranscript: '',
  timerId: null,
  submitting: false,
};

$('#setup-form').addEventListener('submit', startInterview);
$('#submit-answer').addEventListener('click', submitAnswer);
$('#record-button').addEventListener('click', toggleRecording);
$('#read-question').addEventListener('click', readQuestion);
$('#end-interview').addEventListener('click', finishInterview);
$('#print-report').addEventListener('click', () => window.print());

async function startInterview(event) {
  event.preventDefault();
  setError('#setup-error', '');
  showLoading('Building your 30-minute interview plan…');
  try {
    const response = await api('/api/interviews', {
      method: 'POST',
      body: JSON.stringify({
        role: $('#role').value,
        technology: $('#technology').value,
        level: $('#level').value,
      }),
    });
    state.interview = response.interview;
    showView('interview');
    renderQuestion();
    startTimer();
    setupSpeechRecognition();
  } catch (error) {
    setError('#setup-error', error.message);
  } finally {
    hideLoading();
  }
}

function renderQuestion() {
  const interview = state.interview;
  const question = interview.currentQuestion;
  if (!question) return;
  $('#interview-meta').textContent = `${interview.level} · ${interview.role} · ${interview.technology}`;
  $('#interview-title').textContent = interview.title;
  $('#question-count').textContent = `Question ${interview.currentQuestionNumber} of ${interview.totalQuestions}`;
  $('#question-weight').textContent = `${question.weight}% weight`;
  $('#question-category').textContent = question.category;
  $('#question-text').textContent = question.question;
  $('#follow-up').textContent = question.followUpHint;
  $('#expected-time').textContent = `~${question.expectedMinutes} min`;
  $('#progress-bar').style.width = `${(interview.answeredCount / interview.totalQuestions) * 100}%`;
  $('#answer').value = '';
  state.baseTranscript = '';
  state.finalTranscript = '';
  setError('#answer-error', '');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function submitAnswer() {
  const answer = $('#answer').value.trim();
  if (!answer) {
    setError('#answer-error', 'Record or enter the candidate response before continuing.');
    return;
  }
  if (state.submitting) return;
  state.submitting = true;
  stopRecording();
  setError('#answer-error', '');
  showLoading('Assessing the response against the rubric…');
  try {
    const result = await api(`/api/interviews/${state.interview.id}/answers`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    });
    if (result.completed) {
      showReport(result.report);
      return;
    }
    showAssessment(result.assessment);
    state.interview = result.interview;
    renderQuestion();
  } catch (error) {
    setError('#answer-error', error.message);
  } finally {
    state.submitting = false;
    hideLoading();
  }
}

async function finishInterview() {
  if (!state.interview || state.submitting) return;
  stopRecording();
  showLoading('Compiling the weighted report…');
  try {
    const result = await api(`/api/interviews/${state.interview.id}/finish`, {
      method: 'POST',
      body: '{}',
    });
    showReport(result.report);
  } catch (error) {
    setError('#answer-error', error.message);
  } finally {
    hideLoading();
  }
}

function showReport(report) {
  clearInterval(state.timerId);
  stopRecording();
  showView('report');
  const recommendation = report.recommendation;
  const recommendationCard = $('#recommendation-card');
  recommendationCard.className = `recommendation-card ${recommendation.decision.toLowerCase()}`;
  recommendationCard.innerHTML = `
    <div><p class="eyebrow">Recommendation</p><h2>${escapeHtml(recommendation.label)}</h2>
    <p>${escapeHtml(recommendation.rationale)}</p></div>
    <strong>${report.overallScore}%</strong>`;
  $('#overall-score').innerHTML = `<strong>${report.overallScore}</strong><span>/100</span>`;
  $('#coverage').textContent = `${report.answeredCount} of ${report.totalQuestions} questions answered`;
  $('#category-scores').innerHTML = report.categoryScores.map((item) => `
    <div class="category-row">
      <div><span>${escapeHtml(item.category)}</span><strong>${item.score}%</strong></div>
      <div class="score-track"><span style="width:${item.score}%"></span></div>
    </div>`).join('');
  $('#question-results').innerHTML = report.questionResults.map((item, index) => `
    <article class="panel result-card">
      <div class="result-header">
        <div><span class="result-number">${String(index + 1).padStart(2, '0')}</span>
        <span class="eyebrow">${escapeHtml(item.category)} · ${item.weight}% weight</span></div>
        <strong class="question-score">${item.score}/100</strong>
      </div>
      <h3>${escapeHtml(item.question)}</h3>
      <div class="result-section"><h4>Candidate answer</h4>
        <p>${item.answer ? escapeHtml(item.answer) : '<em>Not answered</em>'}</p></div>
      ${item.assessment ? `
        <div class="result-section"><h4>Assessment</h4><p>${escapeHtml(item.assessment.summary)}</p></div>
        <div class="evidence-grid">
          <div><h4>Strengths</h4>${renderList(item.assessment.strengths)}</div>
          <div><h4>Gaps</h4>${renderList(item.assessment.gaps)}</div>
        </div>` : ''}
      <details><summary>Expected answer points</summary>${renderList(item.idealAnswerPoints)}</details>
    </article>`).join('');
  window.scrollTo({ top: 0 });
}

function setupSpeechRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    $('#record-button').disabled = true;
    $('#speech-message').textContent = 'Speech recognition is unavailable in this browser. Type the response instead, or use Chrome/Edge.';
    return;
  }
  const recognition = new Recognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.onresult = (event) => {
    let interim = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript;
      if (event.results[index].isFinal) state.finalTranscript += `${transcript} `;
      else interim += transcript;
    }
    $('#answer').value = [state.baseTranscript, state.finalTranscript, interim]
      .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  };
  recognition.onerror = (event) => {
    state.listening = false;
    updateRecordButton();
    $('#speech-message').textContent = `Microphone error: ${event.error}. You can continue by typing.`;
  };
  recognition.onend = () => {
    if (state.listening) recognition.start();
  };
  state.recognition = recognition;
}

function toggleRecording() {
  if (!state.recognition) return;
  if (state.listening) {
    stopRecording();
  } else {
    state.baseTranscript = $('#answer').value.trim();
    state.finalTranscript = '';
    state.listening = true;
    $('#speech-message').textContent = 'Listening… speak naturally. You can edit the transcript at any time.';
    state.recognition.start();
    updateRecordButton();
  }
}

function stopRecording() {
  if (!state.listening) return;
  state.listening = false;
  state.recognition?.stop();
  $('#speech-message').textContent = 'Recording stopped. Review the transcript before submitting.';
  updateRecordButton();
}

function updateRecordButton() {
  const button = $('#record-button');
  button.classList.toggle('recording', state.listening);
  button.innerHTML = state.listening
    ? '<span class="mic-dot"></span> Stop listening'
    : '<span class="mic-dot"></span> Start listening';
}

function readQuestion() {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(state.interview.currentQuestion.question));
}

function startTimer() {
  const update = () => {
    const remaining = Math.max(0, new Date(state.interview.deadlineAt).getTime() - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    $('#timer').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    $('#timer').classList.toggle('warning', seconds <= 300);
    if (seconds <= 0) {
      clearInterval(state.timerId);
      finishInterview();
    }
  };
  update();
  state.timerId = setInterval(update, 1000);
}

function showAssessment(assessment) {
  const toast = $('#assessment-toast');
  toast.innerHTML = `<strong>Previous answer: ${assessment.score}/100</strong><span>${escapeHtml(assessment.summary)}</span>`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 6000);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
  return body;
}

function showView(name) {
  for (const view of document.querySelectorAll('.view')) view.classList.add('hidden');
  $(`#${name}-view`).classList.remove('hidden');
}

function showLoading(message) {
  $('#loading-text').textContent = message;
  $('#loading').classList.remove('hidden');
}

function hideLoading() {
  $('#loading').classList.add('hidden');
}

function setError(selector, message) {
  $(selector).textContent = message;
}

function renderList(items) {
  return items?.length
    ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '<p>None noted.</p>';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character]));
}
