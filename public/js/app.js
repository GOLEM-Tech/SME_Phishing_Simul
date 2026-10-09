/* eslint-env browser */
'use strict';

(function () {
  const page = document.body.getAttribute('data-page') || '';
  const urlParams = new URLSearchParams(window.location.search);

  // =========================================================================
  // 1. HELPER UTILITIES & AUTHENTICATION STATE MANAGEMENT
  // =========================================================================
  function getAuthToken() {
    return localStorage.getItem('jwt') || localStorage.getItem('token') || null;
  }

  function getAuthUser() {
    try {
      const raw = localStorage.getItem('auth_user') || localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function getSessionId() {
    return localStorage.getItem('session_id') || getAuthUser()?.sessionId || null;
  }

  function saveAuthSession(token, user, sessionId) {
    if (!token) return;
    const formattedToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    localStorage.setItem('jwt', formattedToken);
    localStorage.setItem('token', formattedToken);
    if (user) {
      localStorage.setItem('auth_user', JSON.stringify(user));
      localStorage.setItem('user', JSON.stringify(user));
    }
    if (sessionId) {
      localStorage.setItem('session_id', sessionId);
    }
  }

  function clearAuthSession() {
    localStorage.removeItem('jwt');
    localStorage.removeItem('token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('user');
    localStorage.removeItem('session_id');
  }

  function decodeJwtPayload(tokenStr) {
    try {
      if (!tokenStr) return null;
      const clean = tokenStr.replace(/^Bearer\s+/i, '');
      const parts = clean.split('.');
      if (parts.length !== 3) return null;
      return JSON.parse(atob(parts[1]));
    } catch {
      return null;
    }
  }

  async function apiFetch(url, options = {}) {
    const token = getAuthToken();
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) {
      headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    }
    const response = await fetch(url, { ...options, headers });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const errorMsg = (data && data.error) || (data && data.message) || `Request failed (${response.status})`;
      const err = new Error(errorMsg);
      err.status = response.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function closeAnyModal() {
    if (window.CP_UI && typeof window.CP_UI.close === 'function') {
      window.CP_UI.close();
    }
  }

  // Intercept OAuth Redirect Callbacks Across Any Entrypoint
  const incomingOAuthToken = urlParams.get('oauth_token');
  const incomingSessionId = urlParams.get('session_id');
  if (incomingOAuthToken) {
    const payload = decodeJwtPayload(incomingOAuthToken);
    saveAuthSession(
      incomingOAuthToken,
      payload
        ? {
            id: payload.id,
            name: payload.name || 'OAuth User',
            email: payload.email,
            role: payload.role || 'Employee',
            sessionId: incomingSessionId || payload.sessionId,
          }
        : null,
      incomingSessionId || payload?.sessionId
    );
    urlParams.delete('oauth_token');
    urlParams.delete('session_id');
    const cleanSearch = urlParams.toString();
    window.history.replaceState({}, document.title, window.location.pathname + (cleanSearch ? `?${cleanSearch}` : ''));
  }

  // Global Sign-Out Action Handler
  const logoutBtn = document.getElementById('logout-btn') || 
                    document.getElementById('logoutBtn') || 
                    document.getElementById('adminLogoutBtn') || 
                    document.getElementById('empLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      const currentRole = getAuthUser()?.role;
      clearAuthSession();
      window.location.href = currentRole === 'Admin' ? '/admin-login' : '/login';
    });
  }

  // =========================================================================
  // PAGE 1: /login (Unified & Employee Training Portal Login)
  // =========================================================================
  if (page === 'login' || (!page && window.location.pathname.includes('/login'))) {
    const isolationBanner = document.getElementById('isolation-banner');
    const reason = urlParams.get('isolation_reason');
    const targetEmail = urlParams.get('target_email');
    const assignedQuiz = urlParams.get('assigned_quiz');

    if (reason === 'admin_session_cleared' && isolationBanner) {
      isolationBanner.classList.remove('hidden');
      isolationBanner.innerHTML = `
        <strong>🔒 Security Session Isolation Active:</strong> Your active Administrator session was automatically cleared because you clicked an Employee Training Portal link. Please sign in with the assigned Employee account (<strong>${escapeHtml(targetEmail || 'Employee')}</strong>) to take the quiz.
      `;
    }

    const emailInput = document.getElementById('login-email') || document.getElementById('loginEmail') || document.getElementById('loginEmailInput');
    if (targetEmail && emailInput) {
      emailInput.value = targetEmail;
    }

    const toggleForgotBtn = document.getElementById('toggle-forgot-btn') || document.getElementById('toggleForgotDrawerBtn');
    const cancelForgotBtn = document.getElementById('cancel-forgot-btn');
    const forgotForm = document.getElementById('forgot-form') || document.getElementById('forgotPasswordForm');

    if (toggleForgotBtn && forgotForm) {
      toggleForgotBtn.addEventListener('click', () => forgotForm.classList.toggle('hidden'));
    }
    if (cancelForgotBtn && forgotForm) {
      cancelForgotBtn.addEventListener('click', () => forgotForm.classList.add('hidden'));
    }

    const alertBox = document.getElementById('auth-alert') || document.getElementById('loginAlert') || document.getElementById('userLoginFeedback');
    function showLoginAlert(msg, isError = true) {
      if (!alertBox) return;
      alertBox.className = `mb-4 p-3 rounded-lg text-xs font-medium ${
        isError
          ? 'bg-rose-500/10 border border-rose-500/40 text-rose-300'
          : 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-300'
      }`;
      alertBox.textContent = msg;
      alertBox.classList.remove('hidden');
    }

    const loginForm = document.getElementById('login-form') || document.getElementById('loginForm') || document.getElementById('userLoginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailEl = document.getElementById('login-email') || document.getElementById('loginEmail') || document.getElementById('loginEmailInput');
        const passEl = document.getElementById('login-password') || document.getElementById('loginPassword') || document.getElementById('loginPasswordInput');
        const email = emailEl?.value.trim();
        const password = passEl?.value;

        try {
          const portalType = assignedQuiz || urlParams.get('portal') === 'employee' ? 'employee' : undefined;
          const res = await apiFetch('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password, portalType, loginType: portalType }),
          });

          saveAuthSession(res.token, res.user, res.sessionId);

          if (res.user.role === 'Employee' && assignedQuiz) {
            window.location.href = `/employee?assigned_quiz=${encodeURIComponent(assignedQuiz)}`;
            return;
          }
          window.location.href = res.redirectUrl || (res.user.role === 'Admin' ? '/admin' : '/employee');
        } catch (err) {
          showLoginAlert(err.message, true);
        }
      });
    }

    if (forgotForm) {
      forgotForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const forgotEmailEl = document.getElementById('forgot-email') || document.getElementById('forgotEmailInput');
        const email = forgotEmailEl ? forgotEmailEl.value.trim() : '';
        try {
          const res = await apiFetch('/api/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email }),
          });
          showLoginAlert(res.message, false);
          forgotForm.classList.add('hidden');
          closeAnyModal();
        } catch (err) {
          showLoginAlert(err.message, true);
        }
      });
    }
  }

  // =========================================================================
  // PAGE 2: /admin-login (Dedicated Admin SOC Authentication Portal)
  // =========================================================================
  if (page === 'admin-login' || window.location.pathname.includes('/admin-login')) {
    const alertBox = document.getElementById('auth-alert') || document.getElementById('adminAlert') || document.getElementById('adminLoginFeedback');
    const form = document.getElementById('admin-login-form') || document.getElementById('adminLoginForm');

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailEl = document.getElementById('admin-email') || document.getElementById('adminEmailInput');
        const passEl = document.getElementById('admin-password') || document.getElementById('adminPasswordInput');
        const email = emailEl ? emailEl.value.trim() : '';
        const password = passEl ? passEl.value : '';

        try {
          const res = await apiFetch('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password, portalType: 'admin', loginType: 'admin' }),
          });
          saveAuthSession(res.token, res.user, res.sessionId);
          window.location.href = '/admin';
        } catch (err) {
          if (alertBox) {
            alertBox.className = 'mb-4 p-3 rounded-lg text-xs font-medium bg-rose-500/10 border border-rose-500/40 text-rose-300';
            alertBox.textContent = err.message;
            alertBox.classList.remove('hidden');
          }
        }
      });
    }
  }

  // =========================================================================
  // PAGE 5: /employee (Isolated Portal, Assigned-Only Quizzes & Awareness Quotes)
  // =========================================================================
  if (page === 'employee' || window.location.pathname.includes('/employee')) {
    const token = getAuthToken();
    const assignedQuizParam = urlParams.get('assigned_quiz');
    const targetEmailParam = urlParams.get('target_email');

    if (!token) {
      const redirectParams = new URLSearchParams();
      redirectParams.set('portal', 'employee');
      if (assignedQuizParam) redirectParams.set('assigned_quiz', assignedQuizParam);
      if (targetEmailParam) redirectParams.set('target_email', targetEmailParam);
      window.location.replace(`/login?${redirectParams.toString()}`);
      return;
    }

    const greetingEl = document.getElementById('emp-portal-greeting') || document.getElementById('empGreeting');
    const sessionEl = document.getElementById('emp-session-id') || document.getElementById('empSessionId');
    const riskEl = document.getElementById('emp-portal-risk') || document.getElementById('empRiskBadge');

    const undeterminedQuotes = [
      {
        tag: 'Welcome to Security Training',
        quote: 'Welcome to the enterprise awareness program! Read through our 5 study modules below to learn how modern phishing drills operate.',
      },
      {
        tag: 'Baseline Awareness Advice',
        quote: 'Legitimate organizations will never demand your passwords, PINs, or emergency gift card transfers via unsolicited emails.',
      }
    ];

    const critical100Quotes = [
      {
        tag: 'Critical Compromise Alert (100% Risk)',
        quote: 'Account compromised: Credentials were submitted during a recent drill. Review mandatory awareness modules immediately.',
      }
    ];

    const high40Quotes = [
      {
        tag: 'High Risk Notice (40% Risk)',
        quote: 'Your risk score is getting higher — stay safe, stay away from any sketchy links, your account will thank you!',
      }
    ];

    const low15Quotes = [
      {
        tag: 'Low Risk Reminder (15% Risk)',
        quote: 'You opened a simulated email. Good discipline avoiding the link—always cross-check urgent requests before taking action.',
      }
    ];

    const perfect0Quotes = [
      {
        tag: 'Perfect Security Posture (0% Risk)',
        quote: 'Flawless defense! No clicks, no credential drops, and no compromises detected. Keep scrutinizing incoming messages.',
      }
    ];

    let quoteIndex = 0;
    let activeEmployeeRiskTier = 'UNDETERMINED';

    function updateAwarenessQuote(riskTier) {
      if (riskTier) activeEmployeeRiskTier = riskTier;
      const r = String(activeEmployeeRiskTier || '');
      let quotePool = perfect0Quotes;
      let badgeStyle = 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300';
      let tagStyle = 'bg-cyan-500/20 text-cyan-300';
      let icon = '🛡️';

      if (r.toUpperCase().includes('UNDETERMINED')) {
        quotePool = undeterminedQuotes;
        badgeStyle = 'bg-slate-800/80 border-slate-700 text-slate-300';
        tagStyle = 'bg-slate-700 text-slate-200 font-bold';
        icon = '👋';
      } else if (r.includes('100%') || r.includes('CRITICAL')) {
        quotePool = critical100Quotes;
        badgeStyle = 'bg-rose-500/15 border-rose-500/50 text-rose-300';
        tagStyle = 'bg-rose-500/25 text-rose-200 font-bold';
        icon = '🚨';
      } else if (r.includes('40%') || r.includes('High')) {
        quotePool = high40Quotes;
        badgeStyle = 'bg-amber-500/15 border-amber-500/40 text-amber-300';
        tagStyle = 'bg-amber-500/25 text-amber-200 font-bold';
        icon = '⚠️';
      } else if (r.includes('15%') || r.includes('Low')) {
        quotePool = low15Quotes;
        badgeStyle = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300';
        tagStyle = 'bg-emerald-500/20 text-emerald-300';
        icon = '🔍';
      }

      const current = quotePool[quoteIndex % quotePool.length];
      const banner = document.getElementById('awareness-quote-banner');
      const tagEl = document.getElementById('awareness-quote-tag');
      const textEl = document.getElementById('awareness-quote-text');
      const iconEl = document.getElementById('awareness-quote-icon');

      if (banner && tagEl && textEl) {
        banner.className = `p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 ${badgeStyle}`;
        tagEl.className = `text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${tagStyle}`;
        tagEl.textContent = current.tag;
        textEl.textContent = `"${current.quote}"`;
        if (iconEl) iconEl.textContent = icon;
      }
    }

    const rotateBtn = document.getElementById('awareness-rotate-btn');
    if (rotateBtn) {
      rotateBtn.addEventListener('click', () => {
        quoteIndex++;
        updateAwarenessQuote();
      });
    }

    async function loadAlwaysAvailableModules() {
      const container = document.getElementById('emp-modules-list') || document.getElementById('trainingModulesContainer');
      if (!container) return;

      try {
        const res = await apiFetch('/api/quizzes/modules');
        const modules = Array.isArray(res) ? res : (res.modules || res.data || []);

        if (modules.length === 0) {
          container.innerHTML = '<p class="text-slate-400 text-xs">No curriculum modules published yet.</p>';
          return;
        }

        container.innerHTML = modules.map((m) => `
          <div class="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-2 hover:border-slate-700 transition">
            <div class="truncate">
              <div class="font-semibold text-white text-xs truncate">${escapeHtml(m.title)}</div>
              <div class="text-[10px] text-slate-400">Core Curriculum • Standard Reading</div>
            </div>
            <button data-mod-id="${m.id}" class="read-mod-btn px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-semibold whitespace-nowrap transition">
              Read 📖
            </button>
          </div>
        `).join('');

        container.querySelectorAll('.read-mod-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            const modId = Number(btn.dataset.modId);
            const selected = modules.find((m) => m.id === modId);
            if (selected) {
              openModuleReader(selected);
            }
          });
        });
      } catch (err) {
        console.warn('Could not load modules:', err.message);
      }
    }

    function openModuleReader(mod) {
      const workspace = document.getElementById('quiz-workspace');
      if (!workspace) return;

      const formattedContent = escapeHtml(mod.content)
        .replace(/### (.*?)\n/g, '<h4 class="text-sm font-bold text-blue-400 mt-4 mb-2 tracking-wide uppercase">$1</h4>')
        .replace(/\n\n/g, '</p><p class="text-xs text-slate-300 leading-relaxed mb-3">');

      workspace.innerHTML = `
        <div class="space-y-6">
          <div class="border-b border-slate-800 pb-4 flex items-center justify-between">
            <div>
              <span class="text-[11px] uppercase tracking-wider text-blue-400 font-bold">Standard Curriculum Lesson #${mod.id}</span>
              <h2 class="text-lg font-bold text-white mt-1">${escapeHtml(mod.title)}</h2>
            </div>
            <span class="px-2.5 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30 text-[11px] font-semibold">
              Study Curriculum
            </span>
          </div>

          <div class="p-6 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-slate-300 leading-relaxed max-h-[500px] overflow-y-auto space-y-2">
            <p class="text-xs text-slate-300 leading-relaxed mb-3">${formattedContent}</p>
          </div>

          <div class="pt-4 border-t border-slate-800 flex items-center justify-between gap-4">
            <div class="text-xs text-slate-400">
              Finished reading? Test your understanding with the corresponding assessment.
            </div>
            <div class="flex items-center space-x-2">
              <button id="close-reader-btn" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition">
                Close Lesson
              </button>
              <button id="launch-module-quiz-btn" data-mod-id="${mod.id}" class="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-blue-500/20 transition flex items-center gap-1.5">
                <span>Take Assessment Drill</span>
                <span>✍️</span>
              </button>
            </div>
          </div>
        </div>
      `;

      document.getElementById('close-reader-btn')?.addEventListener('click', () => {
        window.location.reload();
      });

      document.getElementById('launch-module-quiz-btn')?.addEventListener('click', () => {
        const user = getAuthUser();
        const quizId = Number(mod.id);
        openQuizWorkspace(quizId, user?.id);
      });
    }

    async function loadAssignedQuizzesOnly(empId, empName) {
      const listEl = document.getElementById('emp-quizzes-list');
      const welcomeBox = document.getElementById('unassigned-welcome-box');
      const welcomeText = document.getElementById('unassigned-welcome-text');
      const countBadge = document.getElementById('assigned-badge-count');
      if (!listEl) return;

      try {
        const res = await apiFetch(`/api/quizzes?employee_id=${empId}`);
        const assignedQuizzes = Array.isArray(res) ? res : (res.quizzes || res.assignedQuizzes || res.data || []);

        if (countBadge) {
          countBadge.textContent = `${assignedQuizzes.length} active`;
        }

        if (assignedQuizzes.length === 0) {
          listEl.innerHTML = '';
          if (welcomeBox) {
            welcomeBox.classList.remove('hidden');
            if (welcomeText) {
              welcomeText.textContent = `Hello ${escapeHtml(empName || 'there')}, you look new here, welcome to the phishing awareness program!!`;
            }
          }
          return;
        }

        if (welcomeBox) welcomeBox.classList.add('hidden');

        listEl.innerHTML = assignedQuizzes.map((q) => `
          <div class="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
            <div>
              <div class="font-semibold text-white text-xs">${escapeHtml(q.title)}</div>
              <div class="text-[11px] text-slate-400">Pass Score: ${q.pass_score}% • ${q.question_count || 7} Questions</div>
            </div>
            <button data-quiz-id="${q.id}" class="start-quiz-btn px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition">
              Attempt
            </button>
          </div>
        `).join('');

        listEl.querySelectorAll('.start-quiz-btn').forEach((btn) => {
          btn.addEventListener('click', () => openQuizWorkspace(Number(btn.dataset.quizId), empId));
        });
      } catch (err) {
        listEl.innerHTML = `<div class="text-rose-400 text-xs">${escapeHtml(err.message)}</div>`;
      }
    }

    async function loadEmployeeQuizHistory(empId) {
      const historyBody = document.getElementById('emp-history-list') || document.getElementById('empQuizHistoryBody');
      if (!historyBody) return;
      try {
        const res = await apiFetch(`/api/quizzes/employee/${empId}`);
        const history = Array.isArray(res) ? res : (res.quizHistory || res.data?.quizHistory || []);

        if (history.length === 0) {
          historyBody.innerHTML = '<div class="text-xs text-slate-400">No attempts recorded yet.</div>';
          return;
        }

        historyBody.innerHTML = history.map((h) => `
          <div class="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
            <div>
              <div class="font-semibold text-white text-xs">${escapeHtml(h.quiz_title)}</div>
              <div class="text-[10px] text-slate-400">${new Date(h.completed_at).toLocaleDateString()} • Score: ${h.score}%</div>
            </div>
            <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${h.passed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}">
                ${h.passed ? 'PASSED' : 'FAILED'}
            </span>
          </div>
        `).join('');
      } catch (e) {
        console.warn('Could not load quiz history:', e.message);
      }
    }

    async function openQuizWorkspace(quizId, empId) {
      const workspace = document.getElementById('quiz-workspace');
      if (!workspace) return;
      try {
        const data = await apiFetch(`/api/quizzes/${quizId}/questions`);
        const { quiz, questions } = data;

        workspace.innerHTML = `
          <div class="space-y-6">
            <div class="border-b border-slate-800 pb-4">
              <span class="text-[11px] uppercase tracking-wider text-blue-400 font-bold">Assigned Remediation Drill</span>
              <h2 class="text-lg font-bold text-white mt-1">${escapeHtml(quiz.title)}</h2>
              <div class="mt-3 p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                ${escapeHtml(quiz.module_content || 'Carefully review each scenario and question before submitting your response.')}
              </div>
            </div>

            <form id="employee-quiz-form" class="space-y-4">
              ${questions.map((q, idx) => `
                <div class="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5">
                  <div class="text-xs font-semibold text-white">${idx + 1}.${escapeHtml(q.question)}</div>
                  <div class="grid grid-cols-1 gap-2 text-xs">
                    ${['A', 'B', 'C', 'D'].map((opt) => `
                      <label class="flex items-center space-x-2.5 p-2 rounded-lg hover:bg-slate-900 cursor-pointer">
                        <input type="radio" name="q_${q.id}" value="${opt}" required class="text-blue-600" />
                        <span class="text-slate-300"><strong>${opt}:</strong> ${escapeHtml(q[`option_${opt.toLowerCase()}`])}</span>
                      </label>
                    `).join('')}
                  </div>
                </div>
              `).join('')}

              <button type="submit" class="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-lg transition">
                Submit Assessment Answers
              </button>
            </form>
            <div id="quiz-submit-result" class="hidden p-4 rounded-xl text-xs font-semibold"></div>
          </div>
        `;

        const form = document.getElementById('employee-quiz-form');
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const answers = {};
          questions.forEach((q) => {
            const chosen = form.querySelector(`input[name="q_${q.id}"]:checked`);
            if (chosen) answers[q.id] = chosen.value;
          });

          try {
            const res = await apiFetch(`/api/quizzes/${quizId}/submit`, {
              method: 'POST',
              body: JSON.stringify({ employee_id: empId, answers }),
            });
            const resBox = document.getElementById('quiz-submit-result');
            resBox.className = `p-4 rounded-xl text-xs font-semibold ${
              res.passed
                ? 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-300'
                : 'bg-rose-500/10 border border-rose-500/40 text-rose-300'
            }`;
            resBox.textContent = `${res.message} • Updated Risk Tier: ${res.newRiskLevel || 'Evaluated'}`;
            resBox.classList.remove('hidden');

            if (riskEl && res.newRiskLevel) {
              riskEl.textContent = res.newRiskLevel;
              updateAwarenessQuote(res.newRiskLevel);
            }
            await loadEmployeeQuizHistory(empId);
            const user = getAuthUser();
            await loadAssignedQuizzesOnly(empId, user?.name);
          } catch (err) {
            alert(err.message);
          }
        });
      } catch (err) {
        workspace.innerHTML = `<div class="text-rose-400 text-xs">${escapeHtml(err.message)}</div>`;
      }
    }

    async function initEmployeePortal() {
      try {
        const me = await apiFetch('/api/auth/me');
        if (!me || !me.user) {
          throw new Error('No user profile returned from session.');
        }

        const emp = me.user;

        if (emp.role === 'Admin') {
          window.location.replace('/admin');
          return;
        }

        if (targetEmailParam && emp.email && targetEmailParam.toLowerCase() !== emp.email.toLowerCase()) {
          clearAuthSession();
          window.location.replace(`/login?portal=employee&target_email=${encodeURIComponent(targetEmailParam)}`);
          return;
        }

        saveAuthSession(getAuthToken(), emp, me.sessionId || getSessionId());

        if (greetingEl) {
          greetingEl.textContent = `${emp.name} (${emp.email})`;
        }
        if (riskEl && emp.risk_level) {
          riskEl.textContent = emp.risk_level;
        }
        if (sessionEl) {
          sessionEl.textContent = me.sessionId || getSessionId() || 'sess_active';
        }

        updateAwarenessQuote(emp.risk_level);

        await loadAlwaysAvailableModules();
        await loadAssignedQuizzesOnly(emp.id, emp.name);
        await loadEmployeeQuizHistory(emp.id);

        if (assignedQuizParam) {
          openQuizWorkspace(Number(assignedQuizParam), emp.id);
        }
      } catch (err) {
        clearAuthSession();
        window.location.replace('/login?portal=employee');
      }
    }

    initEmployeePortal();
  }

  // =========================================================================
  // PAGE 6: /admin (Full SOC Dashboard Console Workspace)
  // =========================================================================
  if (page === 'admin' || (!page && (window.location.pathname === '/admin' || window.location.pathname === '/'))) {
    const token = getAuthToken();
    const payload = decodeJwtPayload(token);
    const user = getAuthUser();

    if (!token || (payload?.role !== 'Admin' && user?.role !== 'Admin')) {
      clearAuthSession();
      window.location.replace('/admin-login');
      return;
    }

    const adminUserDisplay = document.getElementById('admin-user-display');
    const adminSessionBadge = document.getElementById('admin-session-id');

    if (adminUserDisplay) {
      adminUserDisplay.textContent = `${user?.name || payload?.name || 'Admin'} (${user?.email || payload?.email || ''})`;
    }
    if (adminSessionBadge) {
      adminSessionBadge.textContent = payload?.sessionId || getSessionId() || 'sess_active';
    }

    const toastEl = document.getElementById('admin-toast');
    function showToast(msg, ok = true) {
      if (!toastEl) return;
      toastEl.className = `p-3.5 rounded-xl text-xs font-semibold border ${
        ok
          ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
          : 'bg-rose-500/10 border-rose-500/40 text-rose-300'
      }`;
      const textSpan = document.getElementById('globalToastText');
      if (textSpan) textSpan.textContent = msg;
      else toastEl.textContent = msg;
      toastEl.classList.remove('hidden');
      setTimeout(() => toastEl.classList.add('hidden'), 5000);
    }

    // Tab Navigation Configuration
    let tabBtns = document.querySelectorAll('.admin-tab-btn');
    if (!tabBtns.length) tabBtns = document.querySelectorAll('.admin-nav-btn');

    let tabSections = document.querySelectorAll('.admin-tab-section');
    if (!tabSections.length) tabSections = document.querySelectorAll('.admin-page');

    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab') || btn.getAttribute('data-admin-nav');

        tabBtns.forEach((b) => {
          b.className = 'admin-tab-btn px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition';
        });

        btn.className = 'admin-tab-btn px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white transition cp-primary';

        tabSections.forEach((sec) => {
          const match = sec.id === target || sec.id === `tab-${target}` || sec.id.replace('tab-', '') === target;
          sec.classList.toggle('hidden', !match);
        });

        if (target === 'tab-audit' || target === 'audit') {
          loadAuditLogs(1);
        } else if (target === 'tab-employees' || target === 'employees') {
          loadEmployees();
        } else if (target === 'tab-campaigns' || target === 'campaigns') {
          loadCampaigns();
        } else if (target === 'tab-quizzes' || target === 'quizzes') {
          loadAdminQuizzes();
        }
      });
    });

    // Funnel & KPI Loader
    let funnelChartInstance = null;

    async function loadCampaignFunnelAndKPIs(campaignId) {
      if (!campaignId) return;
      try {
        const report = await apiFetch(`/api/reports/campaign/${campaignId}`);
        const metrics = report.metrics || report.summary || report.totals || report;
        const rates = report.rates || {};

        const sent = Number(metrics.sent ?? metrics.total_sent ?? metrics.totalRecipients ?? 0);
        const opened = Number(metrics.opened ?? metrics.total_opened ?? 0);
        const clicked = Number(metrics.clicked ?? metrics.total_clicked ?? 0);
        const compromised = Number(metrics.submitted ?? metrics.compromised ?? metrics.total_submitted ?? 0);

        const openRate = rates.openRate !== undefined ? rates.openRate : (sent > 0 ? Math.round((opened / sent) * 100) : 0);
        const clickRate = rates.clickRate !== undefined ? rates.clickRate : (sent > 0 ? Math.round((clicked / sent) * 100) : 0);
        const compRate = rates.compromiseRate !== undefined ? rates.compromiseRate : (sent > 0 ? Math.round((compromised / sent) * 100) : 0);

        const elSent = document.getElementById('kpi-total-sent') || document.getElementById('metricTotalSent');
        const elOpenRate = document.getElementById('kpi-open-rate');
        const elClicked = document.getElementById('metricTotalClicked') || document.getElementById('kpi-total-clicked');
        const elClickRate = document.getElementById('metricClickRate') || document.getElementById('kpi-click-rate');
        const elComp = document.getElementById('metricTotalCompromised') || document.getElementById('kpi-total-compromised');
        const elCompRate = document.getElementById('metricCompromiseRate') || document.getElementById('kpi-compromise-rate');
        const elLabel = document.getElementById('funnelActiveCampaignLabel') || document.getElementById('funnel-campaign-label');

        if (elSent) elSent.textContent = sent;
        if (elOpenRate) elOpenRate.textContent = `${openRate}% Opened (${opened})`;
        if (elClicked) elClicked.textContent = clicked;
        if (elClickRate) elClickRate.textContent = `${clickRate}% Click Rate`;
        if (elComp) elComp.textContent = compromised;
        if (elCompRate) elCompRate.textContent = `${compRate}% Compromised`;

        if (elLabel) {
          if (campaignId === 'all') {
            elLabel.textContent = `Organization-Wide Executive Rollup (${report.campaign?.totalCampaignsCount || 'All'} Drills)`;
          } else {
            elLabel.textContent = `${report.campaign?.name || 'Selected Drill'} (Campaign #${campaignId})`;
          }
        }

        const ctx = document.getElementById('campaignFunnelChart');
        if (ctx && window.Chart) {
          if (funnelChartInstance) funnelChartInstance.destroy();
          funnelChartInstance = new window.Chart(ctx, {
            type: 'bar',
            data: {
              labels: ['Dispatched', 'Opened', 'Clicked Link', 'Submitted Credentials'],
              datasets: [
                {
                  label: campaignId === 'all' ? 'Organization Interactions' : 'Target Interactions',
                  data: [sent, opened, clicked, compromised],
                  backgroundColor: ['#3b82f6', '#6366f1', '#f59e0b', '#f43f5e'],
                  borderRadius: 8,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: {
                  beginAtZero: true,
                  min: 0,
                  suggestedMax: Math.max(sent, 5),
                  ticks: { stepSize: 1, color: '#94a3b8' },
                  grid: { color: '#1e293b' },
                },
                x: {
                  ticks: { color: '#cbd5e1' },
                  grid: { display: false },
                },
              },
            },
          });
        }
      } catch (err) {
        console.warn('[Funnel Metrics Warning]:', err.message);
      }
    }

    // 24x7 Activity Matrix (Temporal Heatmap)
    async function loadHeatmapMatrix() {
      const container = document.getElementById('heatmapGrid');
      if (!container) return;
      try {
        const res = await apiFetch('/api/analytics/heatmap');
        const raw = Array.isArray(res) ? res : (res.heatmap || res.data || []);

        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const lookup = {};
        raw.forEach((item) => {
          const dayName =
            item.dayOfWeek ||
            item.day_of_week ||
            item.day ||
            days[Number(item.dayNumber || item.day_number || 1) - 1] ||
            'Monday';
          const hour = Number(item.hourOfDay ?? item.hour_of_day ?? item.hour ?? 0);
          const count = Number(item.totalEvents ?? item.event_count ?? item.count ?? item.total ?? 0);
          lookup[`${dayName}_${hour}`] = (lookup[`${dayName}_${hour}`] || 0) + count;
        });

        container.innerHTML = days
          .map((day) => {
            let cells = '';
            for (let h = 0; h < 24; h++) {
              const count = lookup[`${day}_${h}`] || 0;
              let color = 'bg-slate-800/70 border-slate-700/50';
              if (count >= 5) color = 'bg-rose-500 border-rose-400';
              else if (count >= 3) color = 'bg-blue-600 border-blue-500';
              else if (count >= 1) color = 'bg-blue-900 border-blue-700';
              cells += `<div title="${day} ${String(h).padStart(2, '0')}:00 — ${count} events" class="h-4 rounded-sm border ${color}"></div>`;
            }
            return `
              <div class="flex items-center space-x-2">
                <span class="w-10 text-[9px] text-slate-400 font-mono truncate">${day.slice(0, 3)}</span>
                <div class="flex-1 grid grid-cols-24 gap-1">${cells}</div>
              </div>
            `;
          })
          .join('');
      } catch {
        container.innerHTML = `<div class="text-xs text-slate-500">Heatmap data unavailable.</div>`;
      }
    }

    async function downloadProtectedReport(url, filename) {
      try {
        const token = getAuthToken();
        const res = await fetch(url, {
          headers: { Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Export failed (${res.status})`);
        const blob = await res.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        showToast(`Downloaded ${filename}`);
      } catch (err) {
        showToast(err.message, false);
      }
    }

    const analyticsSelect = document.getElementById('analyticsCampaignSelect');
    if (analyticsSelect) {
      analyticsSelect.addEventListener('change', () => {
        loadCampaignFunnelAndKPIs(analyticsSelect.value);
      });
    }

    document.getElementById('export-csv-btn')?.addEventListener('click', () => {
      const cid = analyticsSelect?.value || 'all';
      downloadProtectedReport(`/api/reports/campaign/${cid}/csv`, `campaign_${cid}_report.csv`);
    });

    document.getElementById('export-pdf-btn')?.addEventListener('click', () => {
      const cid = analyticsSelect?.value || 'all';
      downloadProtectedReport(`/api/reports/campaign/${cid}/pdf`, `campaign_${cid}_report.pdf`);
    });

    // Employee Roster Management
    async function loadEmployees() {
      const tbody = document.getElementById('rosterTableBody');
      const assignEmpSelect = document.getElementById('assign-emp-select');
      const search = document.getElementById('rosterSearchInput')?.value.trim() || '';
      const riskFilter = document.getElementById('rosterRiskFilter')?.value || '';
      if (!tbody) return;

      try {
        const data = await apiFetch(`/api/employees?limit=200&search=${encodeURIComponent(search)}`);
        let list = Array.isArray(data) ? data : (data.employees || data.data || []);

        const kpiRecipients = document.getElementById('metricTotalRecipients');
        if (kpiRecipients) kpiRecipients.textContent = list.length;

        if (riskFilter) {
          list = list.filter((e) => (e.risk_level || '').toLowerCase().includes(riskFilter.toLowerCase()));
        }

        tbody.innerHTML = list
          .map((emp) => {
            const risk = emp.risk_level || 'Low (15% Risk)';
            let badgeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
            if (risk.includes('CRITICAL')) badgeColor = 'bg-rose-500/20 text-rose-400 border-rose-500/40 font-bold';
            else if (risk.includes('High')) badgeColor = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
            else if (risk.includes('Low')) badgeColor = 'bg-blue-500/15 text-blue-400 border-blue-500/30';

            return `
              <tr>
                <td class="py-2.5 px-3">
                  <div class="font-semibold text-white">${escapeHtml(emp.name)}</div>
                  <div class="text-[11px] text-slate-400">${escapeHtml(emp.email)}</div>
                </td>
                <td class="py-2.5 px-3 text-slate-300">${escapeHtml(emp.department || 'General')}</td>
                <td class="py-2.5 px-3">
                  <span class="px-2 py-0.5 rounded border text-[11px] ${badgeColor}">${escapeHtml(risk)}</span>
                </td>
                <td class="py-2.5 px-3">
                  <span class="text-[11px] font-semibold ${
                    emp.approval_status === 'Pending' ? 'text-amber-400' : 'text-emerald-400'
                  }">
                    ${escapeHtml(emp.approval_status || 'Approved')}
                  </span>
                </td>
                <td class="py-2.5 px-3 text-right space-x-2">
                  ${
                    emp.approval_status === 'Pending'
                      ? `<button data-approve-id="${emp.id}" class="approve-emp-btn px-2 py-0.5 bg-emerald-600 text-white rounded text-[11px]">Approve</button>`
                      : ''
                  }
                  <button data-del-id="${emp.id}" class="del-emp-btn text-rose-400 hover:underline">Delete</button>
                </td>
              </tr>
            `;
          })
          .join('');

        tbody.querySelectorAll('.approve-emp-btn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              await apiFetch(`/api/employees/${btn.dataset.approveId}`, {
                method: 'PUT',
                body: JSON.stringify({ approval_status: 'Approved' }),
              });
              showToast('Employee approved!');
              loadEmployees();
            } catch (err) {
              showToast(err.message, false);
            }
          });
        });

        tbody.querySelectorAll('.del-emp-btn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            if (!confirm('Delete this employee target?')) return;
            try {
              await apiFetch(`/api/employees/${btn.dataset.delId}`, { method: 'DELETE' });
              showToast('Employee deleted.');
              loadEmployees();
            } catch (err) {
              showToast(err.message, false);
            }
          });
        });

        if (assignEmpSelect) {
          assignEmpSelect.innerHTML = list
            .map((e) => `<option value="${e.id}">${escapeHtml(e.name)} (${escapeHtml(e.email)}) — ${escapeHtml(e.risk_level)}</option>`)
            .join('');
        }
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-4 px-3 text-rose-400">${escapeHtml(err.message)}</td></tr>`;
      }
    }

    const addEmpForm = document.getElementById('addEmployeeForm');
    if (addEmpForm) {
      addEmpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await apiFetch('/api/employees', {
            method: 'POST',
            body: JSON.stringify({
              name: document.getElementById('addEmpName')?.value.trim(),
              email: document.getElementById('addEmpEmail')?.value.trim(),
              department: document.getElementById('addEmpDept')?.value,
            }),
          });
          addEmpForm.reset();
          showToast('Target employee added.');
          closeAnyModal();
          loadEmployees();
        } catch (err) {
          showToast(err.message, false);
        }
      });
    }

    const csvForm = document.getElementById('csvUploadForm');
    if (csvForm) {
      csvForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('csvFilePicker');
        if (!fileInput || !fileInput.files.length) return;
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        try {
          const res = await apiFetch('/api/employees/upload-csv', {
            method: 'POST',
            body: formData,
          });
          showToast(res.message || 'CSV imported successfully.');
          csvForm.reset();
          closeAnyModal();
          loadEmployees();
        } catch (err) {
          showToast(err.message, false);
        }
      });
    }

    document.getElementById('rosterSearchInput')?.addEventListener('input', loadEmployees);
    document.getElementById('rosterRiskFilter')?.addEventListener('change', loadEmployees);

    // Resources & Campaign Management
    async function loadCampaignResources() {
      try {
        const res = await apiFetch('/api/templates');
        const templates = Array.isArray(res) ? res : (res.templates || res.data || []);
        const tplSelect = document.getElementById('campTemplateSelect');
        if (tplSelect && templates.length) {
          tplSelect.innerHTML = templates.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
        }
      } catch {}

      const defaultLandings = [
        { id: 1, name: 'Microsoft Office 365 Clone' },
        { id: 2, name: 'Google Workspace Clone' },
        { id: 3, name: 'Axis Bank NetBanking Clone' },
        { id: 4, name: 'Jio 5G SIM e-KYC Clone' },
        { id: 5, name: 'MrBreast YouTube Collab Invite' },
      ];
      const lpSelect = document.getElementById('campLandingSelect');
      if (lpSelect) {
        lpSelect.innerHTML = defaultLandings.map((l) => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
      }
    }

    async function loadCampaigns() {
      const tbody = document.getElementById('campaignTableBody');
      if (!tbody) return;
      try {
        const data = await apiFetch('/api/campaigns');
        const list = Array.isArray(data) ? data : (data.campaigns || data.data || []);

        if (analyticsSelect) {
          analyticsSelect.innerHTML = [
            '<option value="all">🏢 Organization-Wide Executive Rollup (All Campaigns)</option>',
            ...list.map((c) => `<option value="${c.id}">#${c.id} — ${escapeHtml(c.name)} (${escapeHtml(c.status)})</option>`)
          ].join('');

          loadCampaignFunnelAndKPIs('all');
        }

        if (!list.length) {
          tbody.innerHTML = '<tr><td colspan="4" class="py-4 px-3 text-slate-500 text-center">No campaigns found.</td></tr>';
          return;
        }

        tbody.innerHTML = list
          .map((c) => `
            <tr data-campaign-row="${c.id}">
              <td class="py-2.5 px-3 font-semibold text-white">
                <div>${escapeHtml(c.name)}</div>
                <div class="text-[11px] font-mono text-slate-400">#${c.id} • ${new Date(c.created_at).toLocaleDateString()}</div>
              </td>
              <td class="py-2.5 px-3">
                <span class="px-2 py-0.5 rounded ${
                  c.status === 'Completed'
                    ? 'bg-slate-800 text-emerald-400'
                    : c.status === 'Running'
                    ? 'bg-blue-900/40 text-blue-400 border border-blue-500/30'
                    : 'bg-amber-900/30 text-amber-400 border border-amber-500/30'
                } text-[11px]">${escapeHtml(c.status)}</span>
              </td>
              <td class="py-2.5 px-3 text-slate-400 text-xs">${escapeHtml(c.template_name || 'Standard Template')}</td>
              <td class="py-2.5 px-3 text-right space-x-2">
                <button data-send-id="${c.id}" data-camp-name="${escapeHtml(c.name)}" class="send-camp-btn px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-semibold transition cp-primary">
                  🚀 Dispatch
                </button>
                <button data-pdf-id="${c.id}" class="pdf-camp-btn px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px]">PDF</button>
                <button data-csv-id="${c.id}" class="csv-camp-btn px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px]">CSV</button>
              </td>
            </tr>
          `).join('');
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-4 px-3 text-rose-400">${escapeHtml(err.message)}</td></tr>`;
      }
    }

    const campaignsTbody = document.getElementById('campaignTableBody');
    if (campaignsTbody && !campaignsTbody.dataset.listenerAttached) {
      campaignsTbody.dataset.listenerAttached = 'true';

      campaignsTbody.addEventListener('click', async (e) => {
        const sendBtn = e.target.closest('.send-camp-btn');
        const pdfBtn = e.target.closest('.pdf-camp-btn');
        const csvBtn = e.target.closest('.csv-camp-btn');

        if (sendBtn) {
          const campId = sendBtn.dataset.sendId;
          const campName = sendBtn.dataset.campName || `Campaign #${campId}`;

          const confirmed = confirm(`Are you sure you want to dispatch "${campName}" to target employees now?`);
          if (!confirmed) return;

          const originalText = sendBtn.innerHTML;
          sendBtn.disabled = true;
          sendBtn.innerHTML = '⏳ Sending...';

          const fromName = document.getElementById('customSenderMask')?.value.trim() || undefined;
          const fromAlias = document.getElementById('customSenderAlias')?.value.trim() || undefined;

          try {
            showToast(`Dispatching ${campName}... Please wait.`);
            const res = await apiFetch(`/api/campaigns/${campId}/send`, {
              method: 'POST',
              body: JSON.stringify({ fromName, fromAlias }),
            });
            showToast(res.message || 'Campaign dispatched successfully!');
            await loadCampaigns();
          } catch (err) {
            showToast(err.message || 'Failed to dispatch campaign', false);
            alert(`Dispatch Error: ${err.message}`);
          } finally {
            sendBtn.disabled = false;
            sendBtn.innerHTML = originalText;
          }
          return;
        }

        if (pdfBtn) {
          downloadProtectedReport(`/api/reports/campaign/${pdfBtn.dataset.pdfId}/pdf`, `campaign_${pdfBtn.dataset.pdfId}.pdf`);
          return;
        }

        if (csvBtn) {
          downloadProtectedReport(`/api/reports/campaign/${csvBtn.dataset.csvId}/csv`, `campaign_${csvBtn.dataset.csvId}.csv`);
          return;
        }
      });
    }

    const createCampForm = document.getElementById('createCampaignForm');
    if (createCampForm) {
      createCampForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await apiFetch('/api/campaigns', {
            method: 'POST',
            body: JSON.stringify({
              name: document.getElementById('campNameInput')?.value.trim(),
              description: document.getElementById('campDescInput')?.value.trim(),
              template_id: Number(document.getElementById('campTemplateSelect')?.value) || 1,
              landing_page_id: Number(document.getElementById('campLandingSelect')?.value) || 1,
              department: 'ALL',
            }),
          });
          showToast('Campaign created!');
          createCampForm.reset();
          loadCampaigns();
        } catch (err) {
          showToast(err.message, false);
        }
      });
    }

    // Gemini AI Phishing Pretext Generator
    const aiForm = document.getElementById('ai-generate-form');
    if (aiForm) {
      aiForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const preview = document.getElementById('ai-template-preview');
        const subjectEl = document.getElementById('ai-preview-subject');
        const bodyEl = document.getElementById('ai-preview-body');
        const generateBtn = document.getElementById('ai-generate-btn');

        const scenario = document.getElementById('ai-scenario')?.value.trim();
        const department = document.getElementById('ai-dept')?.value;
        const urgency = document.getElementById('ai-urgency')?.value;

        if (!scenario) return;

        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating... ⏳';

        try {
          const res = await apiFetch('/api/ai/generate-email', {
            method: 'POST',
            body: JSON.stringify({ scenario, department, urgency, tone: 'Professional and Urgent' }),
          });

          const data = res.data || res;
          const templateId = data.templateId;

          if (preview && subjectEl && bodyEl) {
            preview.classList.remove('hidden');
            subjectEl.textContent = `Subject: ${data.subject}`;
            bodyEl.innerHTML = data.bodyHtml;

            const useBtn = document.getElementById('use-ai-template-btn');
            if (useBtn) {
              useBtn.onclick = () => {
                const campNameInput = document.getElementById('campNameInput');
                const campDescInput = document.getElementById('campDescInput');
                const campTemplateSelect = document.getElementById('campTemplateSelect');

                if (campNameInput) campNameInput.value = `${scenario} Drill`;
                if (campDescInput) campDescInput.value = `AI Generated Pretext: ${data.subject}`;

                loadCampaignResources().then(() => {
                  if (campTemplateSelect && templateId) {
                    campTemplateSelect.value = String(templateId);
                  }
                });

                showToast('Applied AI template to Campaign Launch form!');
              };
            }
          }
          showToast('AI Pretext generated & saved to templates!');
        } catch (err) {
          showToast(err.message || 'Failed to generate AI email template', false);
        } finally {
          generateBtn.disabled = false;
          generateBtn.textContent = 'Generate Lure ✨';
        }
      });
    }

    // Quiz Management & Assignment
    async function loadAdminQuizzes() {
      const selectEl = document.getElementById('assign-quiz-select');
      const listEl = document.getElementById('adminQuizzesList');
      try {
        const res = await apiFetch('/api/quizzes');
        const quizzes = Array.isArray(res) ? res : (res.quizzes || []);
        if (selectEl) {
          selectEl.innerHTML = quizzes.map((q) => `<option value="${q.id}">${escapeHtml(q.title)} (Pass: ${q.pass_score}%)</option>`).join('');
        }
        if (listEl) {
          listEl.innerHTML = quizzes.map((q) => `
            <div class="p-3 bg-slate-950 border border-slate-800 rounded-xl flex justify-between items-center hover:border-slate-700 transition">
              <div>
                <div class="font-semibold text-white text-xs">${escapeHtml(q.title)}</div>
                <div class="text-[11px] text-slate-400">Module: ${escapeHtml(q.module_title || q.title)} • Pass Score: ${q.pass_score}%</div>
              </div>
              <span class="text-[11px] font-mono text-emerald-400">${q.question_count || 7} MCQs</span>
            </div>
          `).join('');
        }
      } catch {}
    }

    const createQuizForm = document.getElementById('createQuizForm');
    if (createQuizForm) {
      createQuizForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await apiFetch('/api/quizzes/create', {
            method: 'POST',
            body: JSON.stringify({
              module_title: document.getElementById('newModTitle')?.value.trim(),
              module_content: document.getElementById('newModContent')?.value.trim(),
              title: document.getElementById('newQuizTitle')?.value.trim(),
              pass_score: Number(document.getElementById('newQuizPassScore')?.value) || 70,
              questions: [
                {
                  question: document.getElementById('newQText')?.value.trim(),
                  option_a: document.getElementById('newQOptA')?.value.trim(),
                  option_b: document.getElementById('newQOptB')?.value.trim(),
                  option_c: document.getElementById('newQOptC')?.value.trim(),
                  option_d: document.getElementById('newQOptD')?.value.trim(),
                  correct_option: document.getElementById('newQCorrect')?.value,
                },
              ],
            }),
          });
          showToast('New Training Module & Quiz published!');
          createQuizForm.reset();
          loadAdminQuizzes();
        } catch (err) {
          showToast(err.message, false);
        }
      });
    }

    const assignQuizForm = document.getElementById('assign-quiz-form');
    if (assignQuizForm) {
      assignQuizForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const employeeId = document.getElementById('assign-emp-select')?.value;
        const quizId = document.getElementById('assign-quiz-select')?.value;
        const previewBox = document.getElementById('assigned-link-preview');

        if (!employeeId || !quizId) {
          showToast('Please select both an employee and a quiz.', false);
          return;
        }

        try {
          const res = await apiFetch('/api/quizzes/assign', {
            method: 'POST',
            body: JSON.stringify({ employee_id: Number(employeeId), quiz_id: Number(quizId) }),
          });
          showToast(res.message);
          if (previewBox && res.trainingPortalLink) {
            previewBox.classList.remove('hidden');
            previewBox.innerHTML = `
              <div class="text-emerald-400 font-semibold">✅ Isolated Training Portal Link Dispatched:</div>
              <a href="${res.trainingPortalLink}" class="text-blue-400 underline break-all">${res.trainingPortalLink}</a>
              <p class="text-[11px] text-slate-400 mt-1">Direct assessment link dispatched for this employee account.</p>
            `;
          }
        } catch (err) {
          showToast(err.message, false);
        }
      });
    }

    // Cross-Department Matrix
    async function loadAnalytics() {
      const deptContainer = document.getElementById('deptMatrixTableBody');
      try {
        const depts = await apiFetch('/api/analytics/departments');
        const rows = Array.isArray(depts) ? depts : (depts.departments || depts.data || []);
        if (deptContainer) {
          deptContainer.innerHTML = rows.map((d) => `
            <tr class="hover:bg-slate-900/40 transition">
              <td class="p-3 font-semibold text-white">${escapeHtml(d.department)}</td>
              <td class="p-3">${d.totalTargeted ?? d.totalEmployees ?? d.total_targeted ?? d.total_employees ?? 0}</td>
              <td class="p-3 text-amber-400">${d.clickRate ?? d.totalClicked ?? 0}%</td>
              <td class="p-3 text-rose-400 font-bold">${d.compromiseRate ?? d.totalCompromised ?? 0}%</td>
            </tr>
          `).join('');
        }
      } catch {}
    }

    const aiRiskBtn = document.getElementById('runAiRiskAnalysisBtn');
    if (aiRiskBtn) {
      aiRiskBtn.addEventListener('click', async () => {
        const out = document.getElementById('aiRiskAnalysisBox');
        if (out) out.textContent = 'Running Gemini AI risk assessment...';
        try {
          const data = await apiFetch('/api/ai/risk-analysis');
          const info = data.analysis || data.data || data;
          if (out) {
            if (info && info.executiveSummary) {
              out.innerHTML = `
                <div class="space-y-2">
                  <div class="text-white font-semibold">${escapeHtml(info.executiveSummary)}</div>
                  <ul class="list-disc pl-4 text-slate-300 space-y-1">
                    ${(info.recommendations || []).map((r) => `<li>${escapeHtml(r)}</li>`).join('')}
                  </ul>
                </div>
              `;
            } else {
              out.innerHTML = `<pre class="whitespace-pre-wrap text-xs text-slate-200">${
                typeof info === 'string' ? escapeHtml(info) : escapeHtml(JSON.stringify(info, null, 2))
              }</pre>`;
            }
          }
        } catch (err) {
          if (out) out.textContent = err.message;
        }
      });
    }

    // Paginated Audit Logs Explorer
    async function loadAuditLogs(pageNum = 1) {
      const tbody = document.getElementById('auditLogsTableBody');
      if (!tbody) return;

      try {
        const data = await apiFetch(`/api/audit-logs?page=${pageNum}&limit=50`);
        const logs = Array.isArray(data) ? data : (data.logs || data.data || []);

        if (!logs.length) {
          tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-500">No matching audit logs found.</td></tr>';
          return;
        }

        tbody.innerHTML = logs.map((l) => `
          <tr class="hover:bg-slate-900/80 transition">
            <td class="p-3.5 text-slate-400 whitespace-nowrap">${new Date(l.created_at).toLocaleString()}</td>
            <td class="p-3.5 text-slate-200">${escapeHtml(l.actor_email || (l.user_id ? `Admin #${l.user_id}` : 'System'))}</td>
            <td class="p-3.5"><span class="px-2 py-0.5 rounded border border-blue-500/30 bg-blue-500/10 text-blue-400 font-semibold">${escapeHtml(l.action)}</span></td>
            <td class="p-3.5 font-mono text-slate-500">${escapeHtml(l.ip_address || '127.0.0.1')}</td>
          </tr>
        `).join('');
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-rose-400">${escapeHtml(err.message)}</td></tr>`;
      }
    }

    document.getElementById('refresh-audit-btn')?.addEventListener('click', () => loadAuditLogs(1));

    // Initial Dashboard Bootstrap
    loadEmployees();
    loadCampaignResources();
    loadCampaigns();
    loadHeatmapMatrix();
    loadAdminQuizzes();
    loadAnalytics();
    loadAuditLogs(1);
  }
})();