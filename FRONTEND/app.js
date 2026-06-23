/* ============================================================
   app.js — RecruitIQ Frontend Application
   ============================================================
   Complete UI logic for:
   - Theme toggle (dark/light)
   - JD template loader
   - Candidate card management
   - PDF upload
   - Weight sliders with auto-normalization
   - Pipeline execution via FastAPI
   - Animated score counters
   - Radar charts (Chart.js)
   - Bias flag rendering
   - Side-by-side comparison modal
   - CSV export
   ============================================================ */

'use strict';

// ============================================================
// CONFIGURATION
// ============================================================
const API_BASE = 'http://localhost:8000';

// Layer metadata: label, color, key
const LAYERS = [
  { key: 'score_l1', label: '🧠 Semantic',   color: '#7c6ff7', shortLabel: 'Semantic'   },
  { key: 'score_l2', label: '🗂️ Taxonomy',   color: '#00d4aa', shortLabel: 'Taxonomy'   },
  { key: 'score_l3', label: '📅 Experience', color: '#f79a1e', shortLabel: 'Experience' },
  { key: 'score_l4', label: '💼 Projects',   color: '#e91e8c', shortLabel: 'Projects'   },
  { key: 'score_l5', label: '🐙 GitHub',     color: '#3b9eff', shortLabel: 'GitHub'     },
];

const WEIGHT_DEFAULTS = [8, 7, 6, 5, 4];
const RANK_MEDALS     = ['🥇', '🥈', '🥉'];

// ============================================================
// STATE
// ============================================================
let state = {
  theme        : 'dark',
  jdTemplates  : {},
  candidates   : [],
  weights      : [...WEIGHT_DEFAULTS],
  lastResults  : null,
  radarCharts  : {},
};

// ============================================================
// DOM HELPERS
// ============================================================
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function show(el) { if (el) el.style.display = ''; }
function hide(el) { if (el) el.style.display = 'none'; }

function logProgress(msg, color = '') {
  const log  = $('#progressLog');
  if (!log) return;
  const line = document.createElement('div');
  line.className = 'progress-log-line';
  line.textContent = msg;
  if (color) line.style.color = color;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

function setProgress(pct) {
  const fill = $('#progressBarFill');
  if (fill) fill.style.width = Math.min(pct, 100) + '%';
}

// ============================================================
// THEME TOGGLE
// ============================================================
function initTheme() {
  const saved = localStorage.getItem('recruitiq-theme') || 'dark';
  applyTheme(saved);

  $('#themeToggle').addEventListener('click', () => {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  });
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  $('#themeIcon').textContent    = theme === 'dark' ? '🌙' : '☀️';
  $('#footerMode').textContent   = theme === 'dark' ? '🌙 Dark Mode' : '☀️ Light Mode';
  localStorage.setItem('recruitiq-theme', theme);

  // Re-render radar charts with new theme colours
  Object.values(state.radarCharts).forEach(chart => {
    if (chart) {
      const gridColor = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
      const tickColor = theme === 'dark' ? '#8b92b8' : '#5a6080';
      chart.options.scales.r.grid.color        = gridColor;
      chart.options.scales.r.ticks.color       = tickColor;
      chart.options.scales.r.pointLabels.color = tickColor;
      chart.update();
    }
  });
}

// ============================================================
// API HEALTH CHECK
// ============================================================
async function checkApiHealth() {
  const dot  = $('.status-dot');
  const text = $('#apiStatusText');
  try {
    const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      dot.classList.add('online');
      text.textContent = 'API Online';
    } else {
      throw new Error('Not OK');
    }
  } catch {
    dot.classList.add('offline');
    text.textContent = 'API Offline';
    showApiOfflineWarning();
  }
}

function showApiOfflineWarning() {
  const banner = document.createElement('div');
  banner.style.cssText = `
    background: rgba(233,30,140,0.1);
    border: 1px solid rgba(233,30,140,0.3);
    color: #e91e8c;
    padding: 0.75rem 1.5rem;
    text-align: center;
    font-size: 0.82rem;
    font-weight: 600;
  `;
  banner.innerHTML = `
    ⚠️ FastAPI backend not running.
    Start it with: <code style="background:rgba(0,0,0,0.2);padding:0.1rem 0.4rem;border-radius:4px;">
    cd backend && uvicorn main:app --reload --port 8000</code>
  `;
  document.body.insertBefore(banner, document.body.firstChild);
}

// ============================================================
// LOAD JD TEMPLATES
// ============================================================
async function loadJdTemplates() {
  try {
    const res  = await fetch(`${API_BASE}/api/job-descriptions`);
    const data = await res.json();

    state.jdTemplates = data.job_descriptions;

    // Populate selector
    const sel = $('#jdSelector');
    sel.innerHTML = '';
    Object.keys(data.job_descriptions).forEach(key => {
      const opt   = document.createElement('option');
      opt.value   = key;
      opt.textContent = key;
      sel.appendChild(opt);
    });

    // Load default JD
    const defaultKey = data.default || Object.keys(data.job_descriptions)[0];
    sel.value = defaultKey;
    loadJd(defaultKey);

    // Load default candidates
    if (data.candidates && data.candidates.length) {
      state.candidates = data.candidates.map((c, i) => ({ ...c, id: i }));
      renderCandidateCards();
    }

    sel.addEventListener('change', () => loadJd(sel.value));
  } catch (err) {
    console.error('Failed to load JD templates:', err);
  }
}

function loadJd(key) {
  const jd = state.jdTemplates[key];
  if (!jd) return;
  $('#jdText').value       = jd.text;
  $('#jdSkills').value     = jd.required_skills.join(', ');
  $('#requiredYears').value = jd.required_years;
}

// ============================================================
// WEIGHT SLIDERS
// ============================================================
function initSliders() {
  const container = $('#sliderGroup');
  const summary   = $('#weightSummary');
  container.innerHTML = '';

  LAYERS.forEach((layer, i) => {
    const item = document.createElement('div');
    item.className = 'slider-item';
    item.innerHTML = `
      <div class="slider-header">
        <span class="slider-label">${layer.label}</span>
        <span class="slider-value" id="sliderVal${i}">${state.weights[i]}</span>
      </div>
      <input type="range" min="1" max="10"
             value="${state.weights[i]}" id="slider${i}"
             style="accent-color:${layer.color}" />
    `;
    container.appendChild(item);

    $(`#slider${i}`).addEventListener('input', (e) => {
      state.weights[i] = parseInt(e.target.value);
      $(`#sliderVal${i}`).textContent = state.weights[i];
      renderWeightSummary();
    });
  });

  renderWeightSummary();
}

function getNormalizedWeights() {
  const total = state.weights.reduce((a, b) => a + b, 0);
  return state.weights.map(w => w / total);
}

function renderWeightSummary() {
  const norm    = getNormalizedWeights();
  const summary = $('#weightSummary');
  summary.innerHTML = LAYERS.map((l, i) => `
    <div class="weight-item">
      <span>${l.shortLabel}</span>
      <span>${(norm[i] * 100).toFixed(1)}%</span>
    </div>
  `).join('');
}

// ============================================================
// CANDIDATE CARDS
// ============================================================
function renderCandidateCards() {
  const grid = $('#candidatesGrid');
  grid.innerHTML = '';

  if (!state.candidates.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <span class="empty-state-icon">👥</span>
        No candidates yet. Click "Add Candidate" to begin.
      </div>`;
    return;
  }

  state.candidates.forEach((c, i) => {
    const card = document.createElement('div');
    card.className = 'candidate-card';
    card.dataset.id = i;
    card.innerHTML = `
      <div class="candidate-card-header">
        <div>
          <div class="candidate-name" id="cName${i}">${escHtml(c.name)}</div>
          <div class="candidate-meta">${c.years_of_experience} yrs experience</div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="removeCandidate(${i})" title="Remove">✕</button>
      </div>

      <div class="candidate-field">
        <label>Full Name</label>
        <input type="text" value="${escHtml(c.name)}"
               oninput="updateCandidate(${i}, 'name', this.value)" />
      </div>

      <div class="candidate-field">
        <label>Resume Text</label>
        <textarea rows="3"
          oninput="updateCandidate(${i}, 'resume_text', this.value)"
        >${escHtml(c.resume_text)}</textarea>
        ${c._pdfSource ? `<span class="pdf-badge">📄 ${escHtml(c._pdfSource)}</span>` : ''}
      </div>

      <div class="candidate-field">
        <label>Skills (comma-separated)</label>
        <input type="text" value="${escHtml((c.skills || []).join(', '))}"
               oninput="updateCandidate(${i}, 'skills', this.value.split(',').map(s=>s.trim()).filter(Boolean))" />
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
        <div class="candidate-field">
          <label>Years Exp.</label>
          <input type="number" min="0" max="40" value="${c.years_of_experience}"
                 oninput="updateCandidate(${i}, 'years_of_experience', parseInt(this.value)||0)" />
        </div>
        <div class="candidate-field">
          <label>GitHub Username</label>
          <input type="text" value="${escHtml(c.github_username || '')}"
                 oninput="updateCandidate(${i}, 'github_username', this.value)" />
        </div>
      </div>

      <div class="candidate-field">
        <label>Projects Text</label>
        <textarea rows="2"
          oninput="updateCandidate(${i}, 'projects_text', this.value)"
        >${escHtml(c.projects_text || '')}</textarea>
      </div>
    `;
    grid.appendChild(card);
  });
}

function updateCandidate(idx, field, value) {
  if (state.candidates[idx]) {
    state.candidates[idx][field] = value;
    if (field === 'name') {
      const nameEl = document.getElementById(`cName${idx}`);
      if (nameEl) nameEl.textContent = value;
    }
  }
}

function removeCandidate(idx) {
  state.candidates.splice(idx, 1);
  renderCandidateCards();
}

function addCandidate() {
  state.candidates.push({
    id                 : Date.now(),
    name               : `Candidate ${state.candidates.length + 1}`,
    resume_text        : '',
    skills             : [],
    years_of_experience: 0,
    projects_text      : '',
    github_username    : '',
  });
  renderCandidateCards();
  // Scroll to bottom of grid
  const grid = $('#candidatesGrid');
  grid.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

window.removeCandidate = removeCandidate;
window.updateCandidate = updateCandidate;

// ============================================================
// PDF UPLOAD
// ============================================================
function initPdfUpload() {
  const btn   = $('#uploadPdfBtn');
  const input = $('#pdfInput');

  btn.addEventListener('click', () => input.click());

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    btn.innerHTML = `<span class="spinner"></span> Parsing PDF...`;
    btn.disabled  = true;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res  = await fetch(`${API_BASE}/api/upload-resume`, {
        method: 'POST',
        body  : formData,
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.detail || 'Upload failed');

      // Add as new candidate
      state.candidates.push({
        id                 : Date.now(),
        name               : file.name.replace('.pdf', ''),
        resume_text        : data.extracted_text,
        skills             : [],
        years_of_experience: 0,
        projects_text      : '',
        github_username    : '',
        _pdfSource         : file.name,
      });
      renderCandidateCards();
      showToast(`✅ PDF parsed: ${data.extracted_text.length} chars extracted`, 'success');

    } catch (err) {
      showToast(`❌ PDF upload failed: ${err.message}`, 'error');
    } finally {
      btn.innerHTML = '<i data-lucide="upload"></i> Upload PDF';
      btn.disabled  = false;
      lucide.createIcons();
      input.value   = '';
    }
  });
}

// ============================================================
// EVALUATION PIPELINE
// ============================================================
async function runEvaluation() {
  // Validate inputs
  if (!state.candidates.length) {
    showToast('Add at least one candidate before running.', 'error');
    return;
  }

  const jdText       = $('#jdText').value.trim();
  const jdSkillsRaw  = $('#jdSkills').value.trim();
  const requiredYears= parseInt($('#requiredYears').value) || 0;

  if (!jdText) {
    showToast('Please enter a job description.', 'error');
    return;
  }

  const jdSkills = jdSkillsRaw.split(',').map(s => s.trim()).filter(Boolean);

  // Build weights
  const norm = getNormalizedWeights();
  const weights = {
    w1: parseFloat((norm[0] * 100).toFixed(4)),
    w2: parseFloat((norm[1] * 100).toFixed(4)),
    w3: parseFloat((norm[2] * 100).toFixed(4)),
    w4: parseFloat((norm[3] * 100).toFixed(4)),
    w5: parseFloat((norm[4] * 100).toFixed(4)),
  };

  // Build request body
  const body = {
    jd_text         : jdText,
    jd_skills       : jdSkills,
    required_years  : requiredYears,
    candidates      : state.candidates.map(c => ({
      name               : c.name || 'Unknown',
      resume_text        : c.resume_text || '',
      skills             : Array.isArray(c.skills) ? c.skills : [],
      years_of_experience: c.years_of_experience || 0,
      projects_text      : c.projects_text || '',
      github_username    : c.github_username || '',
    })),
    weights              : weights,
    generate_verdicts    : $('#generateVerdicts').checked,
  };

  // Update UI: show progress, hide results
  const runBtn = $('#runBtn');
  runBtn.disabled     = true;
  runBtn.innerHTML    = `<span class="spinner"></span> Running Pipeline...`;
  hide($('#resultsSection'));

  const progressPanel = $('#progressPanel');
  show(progressPanel);
  $('#progressLog').innerHTML = '';
  setProgress(0);

  // Progress simulation steps
  const totalSteps = state.candidates.length * 5 + 2;
  let   step       = 0;

  function tick(msg, color) {
    step++;
    logProgress(msg, color);
    setProgress((step / totalSteps) * 95);
  }

  try {
    tick('⚙️  Initializing evaluation pipeline...');

    for (let i = 0; i < state.candidates.length; i++) {
      const name = state.candidates[i].name;
      tick(`\n🔍 Evaluating: ${name}`);
      tick(`  → 🧠 Layer 1: Neural semantic matching...`);
      tick(`  → 🗂️  Layer 2: Taxonomy & alias resolution...`);
      tick(`  → 📅 Layer 3: Experience ratio scoring...`);
      tick(`  → 💼 Layer 4: Project portfolio relevance...`);
      tick(`  → 🐙 Layer 5: GitHub behavioral API...`);
    }

    tick('\n📊 Computing composite scores & ranking...');

    // Actual API call
    const res  = await fetch(`${API_BASE}/api/evaluate`, {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    const data = await res.json();
    state.lastResults = data;

    setProgress(100);
    logProgress('\n✅ Pipeline complete!', '#00d4aa');

    // Render results
    setTimeout(() => {
      hide(progressPanel);
      renderResults(data);
    }, 600);

  } catch (err) {
    logProgress(`\n❌ Error: ${err.message}`, '#e91e8c');
    showToast(`Evaluation failed: ${err.message}`, 'error');
    runBtn.disabled  = false;
    runBtn.innerHTML = `<i data-lucide="zap"></i> Run Evaluation Pipeline`;
    lucide.createIcons();
  } finally {
    runBtn.disabled  = false;
    runBtn.innerHTML = `<i data-lucide="zap"></i> Run Evaluation Pipeline`;
    lucide.createIcons();
  }
}

// ============================================================
// RENDER RESULTS
// ============================================================
function renderResults(data) {
  const section = $('#resultsSection');
  show(section);
  section.scrollIntoView({ behavior: 'smooth' });

  // Destroy old radar charts
  Object.values(state.radarCharts).forEach(c => c?.destroy());
  state.radarCharts = {};

  renderRankingCards(data.results);
  renderBiasFlags(data.bias_flags);
  renderScoreTable(data.results);
  renderWeightGrid(data.weights);
}

// ============================================================
// RANKING CARDS
// ============================================================
function renderRankingCards(results) {
  const container = $('#rankingCards');
  container.innerHTML = '';

  const animated = $('#animatedCounters').checked;

  results.forEach((r, i) => {
    const medal = RANK_MEDALS[i] || `#${i + 1}`;
    const card  = document.createElement('div');
    card.className = 'ranking-card';

    const verdictHTML = r.verdict ? buildVerdictHTML(r.verdict) : '';
    const githubHTML  = buildGithubHTML(r.github_data);
    const skillHTML   = buildSkillHTML(r.matched_skills, r.missing_skills);

    card.innerHTML = `
      <!-- HEADER -->
      <div class="ranking-card-header">
        <div class="ranking-card-left">
          <span class="rank-medal">${medal}</span>
          <div>
            <div class="ranking-name">${escHtml(r.name)}</div>
            <div class="ranking-meta">
              ${r.years_of_experience} yrs exp &nbsp;·&nbsp;
              Required: ${r.required_years} yrs &nbsp;·&nbsp;
              GitHub: ${r.github_data?.status === 'success' ? r.github_data.public_repos + ' repos' : 'N/A'}
            </div>
          </div>
        </div>
        <div class="composite-score" id="cScore${i}">0%</div>
      </div>

      <!-- BODY: Layer scores + Radar chart -->
      <div class="card-body-grid">
        <div>
          <!-- Layer scores -->
          <div class="layer-scores-grid">
            ${LAYERS.map((l, li) => `
              <div class="layer-score-item">
                <span class="layer-score-label">${l.shortLabel}</span>
                <span class="layer-score-value" id="lScore${i}_${li}" style="color:${l.color}">0%</span>
                <div class="score-bar">
                  <div class="score-bar-fill" id="lBar${i}_${li}" style="background:${l.color}"></div>
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Composite bar -->
          <div class="composite-bar-wrap">
            <div class="composite-bar-label">
              <span>Overall Composite Score</span>
              <span id="cBarLabel${i}">0%</span>
            </div>
            <div class="composite-bar">
              <div class="composite-bar-fill" id="cBar${i}"></div>
            </div>
          </div>

          <!-- Skill explanation -->
          ${skillHTML}

          <!-- GitHub info -->
          ${githubHTML}

          <!-- LLM Verdict -->
          ${verdictHTML}
        </div>

        <!-- Radar Chart -->
        <div class="radar-wrap">
          <canvas id="radar${i}" width="240" height="240"></canvas>
        </div>
      </div>
    `;

    container.appendChild(card);

    // Animate scores
    const scoreValues = LAYERS.map(l => r[l.key]);

    if (animated) {
      animateCounter(`cScore${i}`, r.composite, '%', 1500);
      animateCounter(`cBarLabel${i}`, r.composite, '%', 1500);
      scoreValues.forEach((val, li) => {
        animateCounter(`lScore${i}_${li}`, val, '%', 1200);
      });
    } else {
      $(`#cScore${i}`).textContent    = r.composite + '%';
      $(`#cBarLabel${i}`).textContent = r.composite + '%';
      scoreValues.forEach((val, li) => {
        $(`#lScore${i}_${li}`).textContent = val + '%';
      });
    }

    // Animate bars (slight delay for visual effect)
    setTimeout(() => {
      $(`#cBar${i}`).style.width = Math.min(r.composite, 100) + '%';
      scoreValues.forEach((val, li) => {
        $(`#lBar${i}_${li}`).style.width = Math.min(val, 100) + '%';
      });
    }, 200);

    // Render radar chart
    renderRadarChart(i, r, scoreValues);
  });
}

// ============================================================
// ANIMATED COUNTER
// ============================================================
function animateCounter(elId, target, suffix, duration) {
  const el = document.getElementById(elId);
  if (!el) return;

  const start     = performance.now();
  const startVal  = 0;

  function update(now) {
    const elapsed  = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased    = 1 - Math.pow(1 - progress, 3);
    const current  = startVal + (target - startVal) * eased;
    el.textContent = current.toFixed(1) + suffix;
    if (progress < 1) requestAnimationFrame(update);
    else el.textContent = target + suffix;
  }

  requestAnimationFrame(update);
}

// ============================================================
// RADAR CHART
// ============================================================
function renderRadarChart(idx, result, scores) {
  const canvas = document.getElementById(`radar${idx}`);
  if (!canvas) return;

  const isDark    = state.theme === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const tickColor = isDark ? '#8b92b8' : '#5a6080';

  const chart = new Chart(canvas, {
    type: 'radar',
    data: {
      labels  : LAYERS.map(l => l.shortLabel),
      datasets: [{
        label          : result.name,
        data           : scores,
        backgroundColor: 'rgba(124,111,247,0.15)',
        borderColor    : '#7c6ff7',
        borderWidth    : 2,
        pointBackgroundColor: LAYERS.map(l => l.color),
        pointBorderColor    : 'transparent',
        pointRadius         : 4,
      }],
    },
    options: {
      responsive        : true,
      maintainAspectRatio: true,
      animation         : { duration: 1000, easing: 'easeOutQuart' },
      scales: {
        r: {
          min        : 0,
          max        : 100,
          ticks      : { stepSize: 25, color: tickColor, font: { size: 9 }, backdropColor: 'transparent' },
          grid       : { color: gridColor },
          pointLabels: { color: tickColor, font: { size: 10, weight: '600' } },
          angleLines  : { color: gridColor },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.raw.toFixed(1)}%`
          }
        }
      },
    },
  });

  state.radarCharts[idx] = chart;
}

// ============================================================
// SKILL EXPLANATION HTML
// ============================================================
function buildSkillHTML(matched, missing) {
  if (!matched?.length && !missing?.length) return '';
  return `
    <div class="skill-explanation">
      <div>
        <div class="skill-col-title matched">✅ Matched Skills (${matched?.length || 0})</div>
        <div class="skill-tags">
          ${(matched || []).map(s => `<span class="skill-tag matched">${escHtml(s)}</span>`).join('') || '<span class="text-muted" style="font-size:0.75rem">None</span>'}
        </div>
      </div>
      <div>
        <div class="skill-col-title missing">❌ Missing Skills (${missing?.length || 0})</div>
        <div class="skill-tags">
          ${(missing || []).map(s => `<span class="skill-tag missing">${escHtml(s)}</span>`).join('') || '<span class="text-muted" style="font-size:0.75rem">None — full match!</span>'}
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// GITHUB INFO HTML
// ============================================================
function buildGithubHTML(githubData) {
  if (!githubData || githubData.status !== 'success') {
    const statusMessages = {
      no_username     : 'No GitHub username provided — neutral score applied.',
      not_found       : 'GitHub profile not found (404).',
      rate_limited    : 'GitHub API rate limit reached — neutral score applied.',
      connection_error: 'Could not connect to GitHub API.',
      timeout         : 'GitHub API request timed out.',
    };
    const msg = statusMessages[githubData?.status] || 'GitHub data unavailable.';
    return `<div class="github-info"><span>🐙 ${msg}</span></div>`;
  }

  return `
    <div class="github-info">
      <span class="github-stat">🐙 <strong>${githubData.public_repos}</strong> public repos (+${githubData.repo_score} pts)</span>
      <span class="github-stat">👥 <strong>${githubData.followers}</strong> followers (+${githubData.follower_score} pts)</span>
      <span class="github-stat">⭐ GitHub Score: <strong>${githubData.score}/100</strong></span>
    </div>
  `;
}

// ============================================================
// VERDICT HTML
// ============================================================
function buildVerdictHTML(verdict) {
  if (!verdict) return '';

  const recBadge = {
    'Strong Hire': '<span class="badge badge-hire">✅ Strong Hire</span>',
    'Consider'   : '<span class="badge badge-consider">⚠️ Consider</span>',
    'Pass'       : '<span class="badge badge-pass">❌ Pass</span>',
  }[verdict.recommendation] || '';

  const sourceTag = verdict.source === 'llm'
    ? '<span style="font-size:0.65rem;color:var(--accent-purple);font-weight:700;">✨ AI VERDICT</span>'
    : '<span style="font-size:0.65rem;color:var(--text-muted);">RULE-BASED VERDICT</span>';

  return `
    <div class="verdict-box">
      <div class="verdict-header">
        <span class="verdict-label">🤖 Hiring Recommendation</span>
        <div style="display:flex;gap:0.5rem;align-items:center;">
          ${sourceTag}
          ${recBadge}
        </div>
      </div>
      <p>${escHtml(verdict.verdict)}</p>
    </div>
  `;
}

// ============================================================
// BIAS FLAGS
// ============================================================
function renderBiasFlags(flags) {
  const panel   = $('#biasFlagsPanel');
  const content = $('#biasFlagsContent');

  if (!$('#showBiasFlags').checked || !flags || !flags.length) {
    hide(panel);
    return;
  }

  show(panel);
  content.innerHTML = flags.map(f => `
    <div class="bias-flag ${f.severity}">
      <span class="bias-flag-icon">${f.severity === 'warning' ? '⚠️' : 'ℹ️'}</span>
      <div>
        <div class="bias-flag-type">${escHtml(f.flag_type)}</div>
        <div class="bias-flag-candidate">${escHtml(f.candidate)}</div>
        <div class="bias-flag-message">${escHtml(f.message)}</div>
        <div class="bias-flag-rec">💡 ${escHtml(f.recommendation)}</div>
      </div>
    </div>
  `).join('');
}

// ============================================================
// SCORE TABLE
// ============================================================
function renderScoreTable(results) {
  const tbody = $('#scoreTableBody');
  tbody.innerHTML = results.map((r, i) => {
    const medal  = RANK_MEDALS[i] || `#${i + 1}`;
    const recBadge = r.verdict ? ({
      'Strong Hire': '<span class="badge badge-hire" style="font-size:0.65rem">✅ Hire</span>',
      'Consider'   : '<span class="badge badge-consider" style="font-size:0.65rem">⚠️ Consider</span>',
      'Pass'       : '<span class="badge badge-pass" style="font-size:0.65rem">❌ Pass</span>',
    }[r.verdict.recommendation] || '') : '—';

    return `
      <tr>
        <td class="rank-cell">${medal}</td>
        <td style="font-weight:700;color:var(--text-primary)">${escHtml(r.name)}</td>
        <td class="score-cell">${r.composite}%</td>
        ${LAYERS.map(l => `<td>${r[l.key]}%</td>`).join('')}
        <td>${recBadge}</td>
      </tr>
    `;
  }).join('');
}

// ============================================================
// WEIGHT GRID
// ============================================================
function renderWeightGrid(weights) {
  const grid = $('#weightGrid');
  const norm = [weights.w1, weights.w2, weights.w3, weights.w4, weights.w5];
  grid.innerHTML = LAYERS.map((l, i) => `
    <div class="weight-grid-item">
      <span class="weight-grid-label">${l.shortLabel}</span>
      <span class="weight-grid-value" style="color:${l.color}">
        ${(norm[i] * 100).toFixed(1)}%
      </span>
    </div>
  `).join('');
}

// ============================================================
// CSV EXPORT
// ============================================================
async function exportCsv() {
  if (!state.lastResults) {
    showToast('Run an evaluation first to export results.', 'error');
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/api/export-csv`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'candidate_rankings.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('✅ CSV downloaded successfully!', 'success');
  } catch (err) {
    showToast(`CSV export failed: ${err.message}`, 'error');
  }
}

// ============================================================
// COMPARISON MODAL
// ============================================================
function openCompareModal() {
  if (!state.lastResults?.results?.length) {
    showToast('Run an evaluation first to compare candidates.', 'error');
    return;
  }

  const results = state.lastResults.results;
  if (results.length < 2) {
    showToast('Need at least 2 candidates to compare.', 'error');
    return;
  }

  const a   = results[0];
  const b   = results[1];
  const modal = $('#compareModal');
  const content = $('#compareContent');

  content.innerHTML = `
    <div class="compare-grid">
      ${[a, b].map((r, ci) => `
        <div>
          <div class="compare-col-name">
            ${RANK_MEDALS[ci] || '#' + (ci + 1)} ${escHtml(r.name)}
            <span style="font-size:0.8rem;color:var(--accent-teal);margin-left:0.5rem;">
              ${r.composite}%
            </span>
          </div>
          ${LAYERS.map((l, li) => {
            const myScore    = r[l.key];
            const otherScore = (ci === 0 ? b : a)[l.key];
            const delta      = myScore - otherScore;
            const deltaClass = delta > 0 ? 'delta-pos' : delta < 0 ? 'delta-neg' : 'delta-tie';
            const deltaSign  = delta > 0 ? '+' : '';
            return `
              <div class="compare-row">
                <span class="compare-layer-name">${l.shortLabel}</span>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                  <span class="compare-score" style="color:${l.color}">${myScore}%</span>
                  <span class="compare-delta ${deltaClass}">${deltaSign}${delta.toFixed(1)}</span>
                </div>
              </div>
            `;
          }).join('')}
          <div class="compare-row" style="margin-top:0.5rem;border-top:2px solid var(--border);padding-top:0.5rem;">
            <span class="compare-layer-name" style="font-weight:800;color:var(--text-primary)">Composite</span>
            <span class="compare-score" style="font-size:1rem;background:var(--gradient-accent);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">${r.composite}%</span>
          </div>
          ${r.verdict ? `
            <div style="margin-top:1rem;font-size:0.78rem;color:var(--text-secondary);font-style:italic;line-height:1.5;">
              "${escHtml(r.verdict.verdict)}"
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>

    <!-- Side-by-side radar comparison -->
    <div style="margin-top:1.5rem;">
      <div style="font-size:0.78rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.75rem;">
        Radar Comparison
      </div>
      <canvas id="compareRadar" height="300"></canvas>
    </div>
  `;

  show(modal);

  // Render comparison radar with both candidates
  const isDark    = state.theme === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const tickColor = isDark ? '#8b92b8' : '#5a6080';

  new Chart(document.getElementById('compareRadar'), {
    type: 'radar',
    data: {
      labels  : LAYERS.map(l => l.shortLabel),
      datasets: [
        {
          label          : a.name,
          data           : LAYERS.map(l => a[l.key]),
          backgroundColor: 'rgba(124,111,247,0.15)',
          borderColor    : '#7c6ff7',
          borderWidth    : 2,
          pointBackgroundColor: '#7c6ff7',
          pointRadius    : 4,
        },
        {
          label          : b.name,
          data           : LAYERS.map(l => b[l.key]),
          backgroundColor: 'rgba(0,212,170,0.12)',
          borderColor    : '#00d4aa',
          borderWidth    : 2,
          pointBackgroundColor: '#00d4aa',
          pointRadius    : 4,
        },
      ],
    },
    options: {
      responsive : true,
      scales: {
        r: {
          min: 0, max: 100,
          ticks      : { stepSize: 25, color: tickColor, font: { size: 9 }, backdropColor: 'transparent' },
          grid       : { color: gridColor },
          pointLabels: { color: tickColor, font: { size: 11, weight: '600' } },
          angleLines  : { color: gridColor },
        },
      },
      plugins: {
        legend : { labels: { color: tickColor, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%` } },
      },
      animation: { duration: 800 },
    },
  });
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
function showToast(message, type = 'info') {
  const colors = {
    success: { bg: 'rgba(0,212,170,0.12)', border: 'rgba(0,212,170,0.3)',  color: '#00d4aa' },
    error  : { bg: 'rgba(233,30,140,0.12)', border: 'rgba(233,30,140,0.3)', color: '#e91e8c' },
    info   : { bg: 'rgba(124,111,247,0.12)', border: 'rgba(124,111,247,0.3)', color: '#7c6ff7' },
  };
  const c = colors[type] || colors.info;

  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    z-index: 9999;
    background: ${c.bg};
    border: 1px solid ${c.border};
    color: ${c.color};
    padding: 0.75rem 1.25rem;
    border-radius: 10px;
    font-size: 0.85rem;
    font-weight: 600;
    max-width: 360px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    animation: slideIn 0.3s ease;
    font-family: inherit;
    backdrop-filter: blur(8px);
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity    = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ============================================================
// UTILITY: HTML ESCAPE
// ============================================================
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function initEventListeners() {
  // Run button
  $('#runBtn').addEventListener('click', runEvaluation);

  // Add candidate
  $('#addCandidateBtn').addEventListener('click', addCandidate);

  // CSV export
  $('#exportCsvBtn').addEventListener('click', exportCsv);

  // Compare button
  $('#compareBtn').addEventListener('click', openCompareModal);

  // Close compare modal
  $('#closeCompareBtn').addEventListener('click', () => hide($('#compareModal')));
  $('#compareModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hide(e.currentTarget);
  });

  // Keyboard: close modal on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide($('#compareModal'));
  });
}

// ============================================================
// INIT
// ============================================================
async function init() {
  // Initialize Lucide icons
  lucide.createIcons();

  // Theme
  initTheme();

  // Sliders
  initSliders();

  // Event listeners
  initEventListeners();

  // PDF upload
  initPdfUpload();

  // Check API health (non-blocking)
  checkApiHealth();

  // Load JD templates + candidates from API
  await loadJdTemplates();

  console.log('✅ RecruitIQ initialized');
}

// Boot on DOM ready
document.addEventListener('DOMContentLoaded', init);
