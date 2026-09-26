'use strict';

// 1. APPLICATION STATE
const STATE = {
  token: localStorage.getItem('token') || '',
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  resetToken: null,
  activePage: 1,
  chartInstance: null,
  activeCampaignId: 1,
  currentQuizId: null,
  availableTemplates: [],
  mcqQuestionCount: 0
};

// 2. PARSE QUERY STRINGS (OAUTH ROLE/ONBOARDING & RESET TOKEN)
(function parseUrlCallbacks() {
  const params = new URLSearchParams(window.location.search);
  const oauthToken = params.get('oauth_token');
  const oauthUserRaw = params.get('oauth_user');

  if (oauthToken) {
    const formatted = oauthToken.startsWith('Bearer ') ? oauthToken : `Bearer ${oauthToken}`;
    localStorage.setItem('token', formatted);
    STATE.token = formatted;

    let parsedUser = { id: 1, name: 'OAuth User', email: '', role: 'Employee', approval_status: 'Pending', needsDepartment: true };
    if (oauthUserRaw) {
      try {
        parsedUser = JSON.parse(oauthUserRaw);
      } catch (e) {
        console.error('Failed parsing oauth_user:', e);
      }
    }

    localStorage.setItem('user', JSON.stringify(parsedUser));
    STATE.user = parsedUser;
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  const resetToken = params.get('reset_token') || params.get('token');
  if (resetToken && !oauthToken) {
    STATE.resetToken = resetToken;
    window.history.replaceState({}, document.title, window.location.pathname);
  }
})();

// 3. API FETCH WRAPPER
async function apiFetch(endpoint, options = {}) {
  const headers = options.headers || {};
  if (STATE.token) {
    headers['Authorization'] = STATE.token.startsWith('Bearer ') ? STATE.token : `Bearer ${STATE.token}`;
  }
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(endpoint, { ...options, headers });
    if (response.status === 401 && STATE.token) {
      showToast('Session expired. Please sign in again.');
      logoutSession();
    }
    return response;
  } catch (err) {
    console.error(`API error on ${endpoint}:`, err);
    return null;
  }
}

function showToast(msg) {
  const toast = document.getElementById('globalToast');
  const text = document.getElementById('globalToastText');
  if (!toast || !text) return;
  text.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 4500);
}

// 4. ROUTER
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();
  bindAllEvents();
  resetDynamicMcqBuilder();
  routeInitialView();
});

function showMainView(viewId) {
  ['viewUserLogin', 'viewAdminLogin', 'viewResetPassword', 'viewOAuthOnboarding', 'viewAdminShell', 'viewEmployeePortal'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
  document.getElementById(viewId)?.classList.remove('hidden');
}

function routeInitialView() {
  if (STATE.resetToken) {
    showMainView('viewResetPassword');
    return;
  }

  if (STATE.token && STATE.user) {
    if (STATE.user.role === 'Employee') {
      // Check if OAuth employee needs to choose a department or is Pending Admin Approval
      if (STATE.user.needsDepartment || STATE.user.department === 'Unassigned' || STATE.user.approval_status === 'Pending') {
        showMainView('viewOAuthOnboarding');
        renderOAuthOnboardingView();
        return;
      }

      showMainView('viewEmployeePortal');
      loadEmployeePortal();
    } else {
      showMainView('viewAdminShell');
      document.getElementById('adminSidebarName').textContent = STATE.user.name || 'Administrator';
      document.getElementById('adminSidebarEmail').textContent = STATE.user.email || 'omjalela4@gmail.com';
      initAdminWorkspace();
    }
    return;
  }

  showMainView('viewUserLogin');
}

function renderOAuthOnboardingView() {
  document.getElementById('oauthEmpName').value = STATE.user?.name || '';
  document.getElementById('oauthEmpEmail').value = STATE.user?.email || '';

  const form = document.getElementById('oauthOnboardingForm');
  const pendingNotice = document.getElementById('oauthPendingNotice');

  if (STATE.user?.department && STATE.user.department !== 'Unassigned' && STATE.user?.approval_status === 'Pending') {
    form.classList.add('hidden');
    pendingNotice.classList.remove('hidden');
  } else {
    form.classList.remove('hidden');
    pendingNotice.classList.add('hidden');
  }
}

function logoutSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  STATE.token = '';
  STATE.user = null;
  showMainView('viewUserLogin');
}

// 5. EVENT BINDINGS
function bindAllEvents() {
  document.getElementById('goToAdminLoginBtn').onclick = () => showMainView('viewAdminLogin');
  document.getElementById('backToUserLoginBtn').onclick = () => showMainView('viewUserLogin');
  document.getElementById('cancelResetBtn').onclick = () => { STATE.resetToken = null; showMainView('viewUserLogin'); };
  document.getElementById('toggleForgotDrawerBtn').onclick = () => {
    document.getElementById('forgotPasswordForm').classList.toggle('hidden');
  };

  document.getElementById('userLoginForm').onsubmit = (e) => handleLoginSubmit(e, 'user');
  document.getElementById('adminLoginForm').onsubmit = (e) => handleLoginSubmit(e, 'admin');
  document.getElementById('forgotPasswordForm').onsubmit = handleForgotPasswordSubmit;
  document.getElementById('resetPasswordForm').onsubmit = handleResetPasswordSubmit;
  document.getElementById('oauthOnboardingForm').onsubmit = handleOAuthOnboardingSubmit;

  document.getElementById('adminLogoutBtn').onclick = logoutSession;
  document.getElementById('empLogoutBtn').onclick = logoutSession;
  document.getElementById('oauthOnboardingLogoutBtn').onclick = logoutSession;

  document.querySelectorAll('.admin-nav-btn').forEach(btn => {
    btn.onclick = () => {
      const targetPage = btn.getAttribute('data-admin-nav');
      document.querySelectorAll('.admin-page').forEach(p => p.classList.add('hidden'));
      document.getElementById(targetPage)?.classList.remove('hidden');

      document.querySelectorAll('.admin-nav-btn').forEach(b => {
        b.className = 'admin-nav-btn w-full px-4 py-3 rounded-xl text-slate-300 hover:bg-slate-800 font-medium flex items-center justify-between transition text-left';
      });
      btn.className = 'admin-nav-btn w-full px-4 py-3 rounded-xl bg-blue-600 text-white font-semibold flex items-center justify-between transition text-left';

      if (targetPage === 'pageAwareness') loadAdminAwarenessPage();
      if (targetPage === 'pageCampaigns') loadCampaignsList();
      if (targetPage === 'pageEmployees') {
        loadPendingOAuthEmployees();
        loadTargetRoster(1);
      }
    };
  });

  document.getElementById('analyticsCampaignSelect').onchange = (e) => {
    loadCampaignDashboardMetrics(parseInt(e.target.value, 10));
  };

  document.getElementById('runAiRiskAnalysisBtn').onclick = handleRunAiRiskAnalysis;

  document.getElementById('openAddEmployeeModalBtn').onclick = () => document.getElementById('addEmployeeModal').classList.remove('hidden');
  document.getElementById('closeAddEmployeeModalBtn').onclick = () => document.getElementById('addEmployeeModal').classList.add('hidden');
  document.getElementById('addEmployeeForm').onsubmit = handleAddEmployee;

  document.getElementById('openCsvModalBtn').onclick = () => document.getElementById('csvModal').classList.remove('hidden');
  document.getElementById('closeCsvModalBtn').onclick = () => document.getElementById('csvModal').classList.add('hidden');
  document.getElementById('csvUploadForm').onsubmit = handleCsvUpload;

  document.getElementById('openNewCampaignModalBtn').onclick = () => {
    populateTemplateDropdown();
    document.getElementById('newCampaignModal').classList.remove('hidden');
  };
  document.getElementById('closeNewCampaignModalBtn').onclick = () => document.getElementById('newCampaignModal').classList.add('hidden');
  document.getElementById('createCampaignForm').onsubmit = handleCreateCampaign;

  document.getElementById('openAiModalBtn').onclick = () => document.getElementById('aiModal').classList.remove('hidden');
  document.getElementById('closeAiModalBtn').onclick = () => document.getElementById('aiModal').classList.add('hidden');
  document.getElementById('triggerAiGenerationBtn').onclick = handleAiGeneration;

  document.getElementById('assignTargetType').onchange = (e) => {
    const val = e.target.value;
    document.getElementById('assignEmployeeBox').classList.toggle('hidden', val !== 'employee');
    document.getElementById('assignDepartmentBox').classList.toggle('hidden', val !== 'department');
  };
  document.getElementById('assignQuizForm').onsubmit = handleAssignQuiz;
  document.getElementById('addAnotherMcqBtn').onclick = () => appendMcqQuestionBlock();
  document.getElementById('createQuizForm').onsubmit = handleCreateQuizModule;

  document.getElementById('closeQuizModalBtn').onclick = () => document.getElementById('quizModal').classList.add('hidden');
  document.getElementById('submitAssessmentBtn').onclick = submitActiveQuiz;

  document.getElementById('rosterSearchInput').oninput = debounce(() => loadTargetRoster(1), 350);
  document.getElementById('rosterRiskFilter').onchange = () => loadTargetRoster(1);
  document.getElementById('rosterPrevBtn').onclick = () => { if (STATE.activePage > 1) loadTargetRoster(STATE.activePage - 1); };
  document.getElementById('rosterNextBtn').onclick = () => loadTargetRoster(STATE.activePage + 1);
}

// 6. AUTHENTICATION & OAUTH ONBOARDING HANDLERS
async function handleOAuthOnboardingSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('oauthEmpName').value.trim();
  const department = document.getElementById('oauthEmpDept').value;

  if (!department) return alert('Please select your department.');

  const res = await apiFetch('/api/auth/oauth-onboarding', {
    method: 'POST',
    body: JSON.stringify({ name, department })
  });

  if (res && res.ok) {
    const data = await res.json();
    STATE.user = { ...STATE.user, ...data.employee, needsDepartment: false, approval_status: 'Pending' };
    localStorage.setItem('user', JSON.stringify(STATE.user));
    showToast('Department saved! Sent to Admin for approval.');
    renderOAuthOnboardingView();
  } else {
    alert('Failed to submit department selection.');
  }
}

async function handleLoginSubmit(e, mode) {
  e.preventDefault();
  const email = document.getElementById(mode === 'admin' ? 'adminEmailInput' : 'loginEmailInput').value.trim();
  const password = document.getElementById(mode === 'admin' ? 'adminPasswordInput' : 'loginPasswordInput').value;
  const feedback = document.getElementById(mode === 'admin' ? 'adminLoginFeedback' : 'userLoginFeedback');

  feedback.classList.remove('hidden');
  feedback.className = 'p-3 rounded-xl text-sm font-medium bg-blue-950/50 text-blue-300 border border-blue-500/30';
  feedback.textContent = 'Verifying credentials...';

  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, loginType: mode })
  });

  if (!res) return;
  const data = await res.json();

  if (res.ok && data.token) {
    STATE.token = data.token;
    STATE.user = data.user;
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    feedback.classList.add('hidden');
    routeInitialView();
  } else {
    feedback.className = 'p-3 rounded-xl text-sm font-medium bg-rose-950/50 text-rose-300 border border-rose-500/30';
    feedback.textContent = data.message || 'Authentication failed.';
  }
}

async function handleForgotPasswordSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('forgotEmailInput').value.trim();
  const feedback = document.getElementById('forgotFeedback');
  const btn = document.getElementById('forgotSubmitBtn');

  btn.disabled = true;
  feedback.classList.remove('hidden');
  feedback.className = 'p-3 rounded-xl text-xs font-medium bg-blue-950/50 text-blue-300 border border-blue-500/30';
  feedback.textContent = 'Dispatching recovery link via Gmail...';

  const res = await apiFetch('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
  btn.disabled = false;

  if (res && res.ok) {
    const data = await res.json();
    feedback.className = 'p-3 rounded-xl text-xs font-medium bg-emerald-950/50 text-emerald-300 border border-emerald-500/30';
    feedback.textContent = data.message || 'Recovery email sent! Check your Gmail.';
  } else {
    feedback.className = 'p-3 rounded-xl text-xs font-medium bg-rose-950/50 text-rose-300 border border-rose-500/30';
    feedback.textContent = 'Failed to dispatch recovery email.';
  }
}

async function handleResetPasswordSubmit(e) {
  e.preventDefault();
  const newPassword = document.getElementById('newPasswordInput').value;
  const confirmPassword = document.getElementById('confirmPasswordInput').value;
  const feedback = document.getElementById('resetPasswordFeedback');

  feedback.classList.remove('hidden');
  if (newPassword !== confirmPassword) {
    feedback.className = 'p-3 rounded-xl text-sm font-medium bg-rose-950/50 text-rose-300 border border-rose-500/30';
    feedback.textContent = 'Passwords do not match.';
    return;
  }

  const res = await apiFetch('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token: STATE.resetToken, newPassword })
  });

  if (res && res.ok) {
    showToast('Password updated! You can now sign in.');
    STATE.resetToken = null;
    showMainView('viewUserLogin');
  } else {
    const err = res ? await res.json() : {};
    feedback.className = 'p-3 rounded-xl text-sm font-medium bg-rose-950/50 text-rose-300 border border-rose-500/30';
    feedback.textContent = err.message || 'Invalid or expired reset token.';
  }
}

// 7. ADMIN WORKSPACE & ANALYTICS
async function initAdminWorkspace() {
  await loadTemplates();
  await loadCampaignsList();
  await loadPendingOAuthEmployees();
  await loadTargetRoster(1);
  await loadTemporalHeatmap();
  await loadDepartmentMatrix();
}

async function loadTemplates() {
  const res = await apiFetch('/api/templates');
  if (res && res.ok) {
    const data = await res.json();
    STATE.availableTemplates = data.data || data.templates || [];
  }
}

function populateTemplateDropdown(selectedId = null) {
  const select = document.getElementById('campTemplateSelect');
  if (!select) return;
  if (STATE.availableTemplates.length === 0) {
    select.innerHTML = '<option value="1">#1: Corporate Security Alert</option>';
    return;
  }
  select.innerHTML = STATE.availableTemplates.map(t =>
    `<option value="${t.id}" ${selectedId === t.id ? 'selected' : ''}>#${t.id}: ${escapeHtml(t.name || t.subject)}</option>`
  ).join('');
}

async function loadCampaignDashboardMetrics(campaignId) {
  if (!campaignId) return;
  STATE.activeCampaignId = campaignId;

  const tokenParam = encodeURIComponent(STATE.token);
  document.getElementById('exportCsvLink').href = `/api/reports/campaign/${campaignId}/csv?token=${tokenParam}`;
  document.getElementById('exportPdfLink').href = `/api/reports/campaign/${campaignId}/pdf?token=${tokenParam}`;

  const res = await apiFetch(`/api/reports/campaign/${campaignId}`);
  if (!res || !res.ok) {
    renderFunnelChart([0, 0, 0, 0]);
    return;
  }

  const payload = await res.json();
  const data = payload.data || payload;
  const totals = data.metrics || data.totals || { totalRecipients: 0, totalSent: 0, clicked: 0, compromised: 0 };
  const rates = data.rates || { clickRate: 0, compromiseRate: 0 };

  const sent = totals.totalSent ?? totals.sent ?? 0;
  const delivered = totals.delivered ?? sent;
  const clicked = totals.clicked ?? 0;
  const compromised = totals.compromised ?? 0;

  document.getElementById('funnelActiveCampaignLabel').textContent = `Campaign #${campaignId}: ${data.campaign?.name || data.name || 'Active Drill'}`;
  document.getElementById('metricTotalSent').textContent = sent;
  document.getElementById('metricTotalClicked').textContent = clicked;
  document.getElementById('metricClickRate').textContent = `${rates.clickRate}%`;
  document.getElementById('metricTotalCompromised').textContent = compromised;
  document.getElementById('metricCompromiseRate').textContent = `${rates.compromiseRate}%`;

  renderFunnelChart([sent, delivered, clicked, compromised]);
}

function renderFunnelChart(series = [0, 0, 0, 0]) {
  const canvas = document.getElementById('campaignFunnelChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (STATE.chartInstance) STATE.chartInstance.destroy();

  const maxVal = Math.max(...series, 5);
  STATE.chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Sent', 'Delivered', 'Clicked', 'Compromised'],
      datasets: [{
        data: series,
        backgroundColor: ['#475569', '#3b82f6', '#f59e0b', '#ef4444'],
        borderRadius: 8,
        barPercentage: 0.55
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 0, suggestedMax: maxVal, grid: { color: '#1e293b' }, ticks: { color: '#94a3b8', stepSize: 1, precision: 0 } },
        x: { grid: { display: false }, ticks: { color: '#e2e8f0', font: { size: 13, weight: 'bold' } } }
      }
    }
  });
}

async function loadTemporalHeatmap() {
  const container = document.getElementById('heatmapGrid');
  if (!container) return;
  container.innerHTML = '';

  const lookup = {};
  const res = await apiFetch('/api/analytics/heatmap');
  if (res && res.ok) {
    const payload = await res.json();
    (payload.data || []).forEach(item => {
      const d = item.dayNumber ?? item.day_of_week;
      const h = item.hourOfDay ?? item.hour;
      const c = item.totalEvents ?? item.event_count ?? 0;
      lookup[`${d}-${h}`] = (lookup[`${d}-${h}`] || 0) + c;
    });
  }

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let d = 1; d <= 7; d++) {
    for (let h = 0; h < 24; h++) {
      const count = lookup[`${d}-${h}`] || 0;
      const cell = document.createElement('div');
      const color = count === 0 ? 'bg-slate-800/90 border border-slate-800' : (count < 3 ? 'bg-blue-950 border border-blue-800' : (count < 5 ? 'bg-blue-600' : 'bg-rose-500'));
      cell.className = `h-3.5 rounded-sm ${color} hover:ring-1 hover:ring-white transition cursor-pointer`;
      cell.title = `${days[d - 1]} ${String(h).padStart(2, '0')}:00 — ${count} interaction(s)`;
      container.appendChild(cell);
    }
  }
}

async function loadDepartmentMatrix() {
  const tbody = document.getElementById('deptMatrixTableBody');
  const res = await apiFetch('/api/analytics/departments');
  if (!res || !res.ok) return;

  const payload = await res.json();
  const rows = payload.data || [];
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-500">No departmental data available.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => `
    <tr class="hover:bg-slate-850/60">
      <td class="p-3 font-semibold text-white">${escapeHtml(r.department)}</td>
      <td class="p-3">${r.totalTargeted || r.totalEmployees || 0}</td>
      <td class="p-3 text-amber-400 font-medium">${r.clickRate || 0}%</td>
      <td class="p-3 text-rose-400 font-bold">${r.compromiseRate || 0}%</td>
    </tr>
  `).join('');
}

async function handleRunAiRiskAnalysis() {
  const box = document.getElementById('aiRiskAnalysisBox');
  box.innerHTML = `<span class="text-blue-400 animate-pulse">Running Gemini 3.8 Flash Risk & Remediation Analysis...</span>`;

  const res = await apiFetch('/api/ai/risk-analysis');
  if (!res || !res.ok) {
    box.innerHTML = `<span class="text-rose-400">Failed to run AI Risk Analysis.</span>`;
    return;
  }

  const payload = await res.json();
  const data = payload.data || payload;
  const summary = data.executiveSummary || 'High-risk click patterns detected in Finance and HR.';
  const recs = data.recommendations || [];

  box.innerHTML = `
    <p class="font-semibold text-white">${escapeHtml(summary)}</p>
    ${Array.isArray(recs) && recs.length > 0 ? `<ul class="list-disc pl-5 space-y-1 mt-2 text-slate-300">${recs.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
  `;
}

// 8. EMPLOYEE DIRECTORY & PENDING OAUTH APPROVALS
async function loadPendingOAuthEmployees() {
  const tbody = document.getElementById('pendingEmployeesTableBody');
  const badge = document.getElementById('pendingNavBadge');
  const countLabel = document.getElementById('pendingCountLabel');
  if (!tbody) return;

  const res = await apiFetch('/api/employees/pending');
  if (!res || !res.ok) return;

  const data = await res.json();
  const pending = data.pendingEmployees || [];

  if (countLabel) countLabel.textContent = `${pending.length} Pending`;
  if (badge) {
    badge.textContent = pending.length;
    badge.classList.toggle('hidden', pending.length === 0);
  }

  if (pending.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-500">No pending OAuth sign-ups awaiting approval.</td></tr>`;
    return;
  }

  tbody.innerHTML = pending.map(emp => `
    <tr class="hover:bg-slate-850/60 transition">
      <td class="py-3.5 px-5">
        <div class="font-bold text-white">${escapeHtml(emp.name)}</div>
        <div class="text-xs text-amber-400">${escapeHtml(emp.email)}</div>
      </td>
      <td class="py-3.5 px-5">
        <span class="px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-semibold">
          ${escapeHtml(emp.department || 'Unassigned')}
        </span>
      </td>
      <td class="py-3.5 px-5 text-slate-400 text-xs">${new Date(emp.created_at).toLocaleString()}</td>
      <td class="py-3.5 px-5 text-right space-x-2">
        <button onclick="approveOAuthEmployee(${emp.id})" class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow transition">
          Approve
        </button>
        <button onclick="ignoreOAuthEmployee(${emp.id})" class="px-3.5 py-1.5 bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition">
          Ignore
        </button>
      </td>
    </tr>
  `).join('');
}

async function approveOAuthEmployee(id) {
  const res = await apiFetch(`/api/employees/${id}/approve`, { method: 'PUT' });
  if (res && res.ok) {
    showToast('OAuth Employee approved and added to active roster!');
    await loadPendingOAuthEmployees();
    await loadTargetRoster(STATE.activePage);
  } else {
    alert('Failed to approve employee.');
  }
}

async function ignoreOAuthEmployee(id) {
  if (!confirm('Ignore and remove this pending OAuth sign-up request?')) return;
  const res = await apiFetch(`/api/employees/${id}`, { method: 'DELETE' });
  if (res && res.ok) {
    showToast('Pending OAuth request ignored and removed.');
    await loadPendingOAuthEmployees();
  }
}

async function loadTargetRoster(page = 1) {
  STATE.activePage = page;
  const tbody = document.getElementById('rosterTableBody');
  const search = document.getElementById('rosterSearchInput').value.trim();
  const risk = document.getElementById('rosterRiskFilter').value;

  const query = new URLSearchParams({ page, limit: 10 });
  if (search) query.append('search', search);
  if (risk) query.append('risk_level', risk);

  const res = await apiFetch(`/api/employees?${query.toString()}`);
  if (!res || !res.ok) return;

  const payload = await res.json();
  const employees = payload.employees || payload.data || [];
  const pagination = payload.pagination || { currentPage: 1, totalPages: 1, total: employees.length };
  const currentPage = pagination.currentPage || pagination.page || 1;

  document.getElementById('metricTotalRecipients').textContent = pagination.totalRecords || pagination.total || employees.length;
  document.getElementById('rosterPaginationInfo').textContent = `Page ${currentPage} of ${pagination.totalPages || 1}`;
  document.getElementById('rosterPrevBtn').disabled = currentPage <= 1;
  document.getElementById('rosterNextBtn').disabled = currentPage >= (pagination.totalPages || 1);

  if (employees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-500">No approved employees match your filter criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = employees.map(emp => `
    <tr class="hover:bg-slate-850/60 transition">
      <td class="py-4 px-5">
        <div class="font-semibold text-white">${escapeHtml(emp.name)}</div>
        <div class="text-xs text-slate-400">${escapeHtml(emp.email)}</div>
      </td>
      <td class="py-4 px-5 text-slate-300">${escapeHtml(emp.department || 'General')}</td>
      <td class="py-4 px-5">
        <span class="px-3 py-1 rounded-full text-xs font-semibold ${getRiskBadgeStyle(emp.risk_level)}">${emp.risk_level}</span>
      </td>
      <td class="py-4 px-5 text-slate-400">${new Date(emp.created_at).toLocaleDateString()}</td>
      <td class="py-4 px-5 text-right">
        <button onclick="deleteEmployee(${emp.id})" class="text-xs text-rose-400 hover:underline font-medium">Delete</button>
      </td>
    </tr>
  `).join('');
}

async function handleAddEmployee(e) {
  e.preventDefault();
  const name = document.getElementById('addEmpName').value.trim();
  const email = document.getElementById('addEmpEmail').value.trim();
  const department = document.getElementById('addEmpDept').value.trim();

  const res = await apiFetch('/api/employees', {
    method: 'POST',
    body: JSON.stringify({ name, email, department, risk_level: 'Low' })
  });

  if (res && res.ok) {
    showToast(`Added ${name} (${email}) to roster!`);
    document.getElementById('addEmployeeModal').classList.add('hidden');
    document.getElementById('addEmployeeForm').reset();
    loadTargetRoster(1);
  } else {
    alert('Failed to add employee.');
  }
}

async function deleteEmployee(id) {
  if (!confirm('Remove this employee from the target directory?')) return;
  const res = await apiFetch(`/api/employees/${id}`, { method: 'DELETE' });
  if (res && res.ok) {
    showToast('Employee removed.');
    loadTargetRoster(STATE.activePage);
  }
}

async function handleCsvUpload(e) {
  e.preventDefault();
  const fileInput = document.getElementById('csvFileInput');
  if (!fileInput.files[0]) return alert('Choose a .csv file first.');

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  const res = await apiFetch('/api/employees/upload-csv', { method: 'POST', body: formData });
  if (res && res.ok) {
    const data = await res.json();
    showToast(`CSV Imported: ${data.totalRows || data.affectedRows || 0} rows processed.`);
    document.getElementById('csvModal').classList.add('hidden');
    fileInput.value = '';
    loadTargetRoster(1);
  } else {
    alert('CSV upload failed.');
  }
}

// 9. AUTHENTICATED PDF DOWNLOAD
async function downloadCampaignPdf(campaignId) {
  showToast(`Generating PDF Report for Campaign #${campaignId}...`);
  try {
    const res = await apiFetch(`/api/reports/campaign/${campaignId}/pdf`);
    if (!res || !res.ok) {
      alert('Failed to generate PDF.');
      return;
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign_${campaignId}_report.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    showToast(`Campaign #${campaignId} PDF downloaded!`);
  } catch (err) {
    alert('Failed to download PDF.');
  }
}

// 10. CAMPAIGNS & MASKED DISPATCH
async function loadCampaignsList() {
  const tbody = document.getElementById('campaignTableBody');
  const select = document.getElementById('analyticsCampaignSelect');

  const res = await apiFetch('/api/campaigns');
  if (!res || !res.ok) return;

  const payload = await res.json();
  const campaigns = payload.campaigns || payload.data || [];

  if (campaigns.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-slate-500">No campaigns created yet.</td></tr>`;
    return;
  }

  select.innerHTML = campaigns.map(c => `<option value="${c.id}">#${c.id} — ${escapeHtml(c.name)} (${c.status})</option>`).join('');
  loadCampaignDashboardMetrics(campaigns[0].id);

  tbody.innerHTML = campaigns.map(c => `
    <tr class="hover:bg-slate-850/60 transition">
      <td class="py-4 px-5">
        <div class="font-semibold text-white">${escapeHtml(c.name)}</div>
        <div class="text-xs text-slate-400">Campaign ID: #${c.id}</div>
      </td>
      <td class="py-4 px-5">
        <span class="px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadgeStyle(c.status)}">${c.status}</span>
      </td>
      <td class="py-4 px-5 text-slate-300">
        Template #${c.template_id || 1}
      </td>
      <td class="py-4 px-5 text-right space-x-2">
        <button onclick="triggerDispatch(${c.id})" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition">
          Send Masked Phishing Mail
        </button>
        <button onclick="downloadCampaignPdf(${c.id})" class="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 text-xs font-semibold transition">
          PDF
        </button>
      </td>
    </tr>
  `).join('');
}

async function handleCreateCampaign(e) {
  e.preventDefault();
  let name = document.getElementById('campNameInput').value.trim();
  const description = document.getElementById('campDescInput').value.trim();
  const template_id = parseInt(document.getElementById('campTemplateSelect')?.value, 10) || 1;
  const landing_page_id = parseInt(document.getElementById('campLandingSelect')?.value, 10) || 1;

  if (!name) name = `Phishing Simulation (${new Date().toLocaleDateString()})`;

  const res = await apiFetch('/api/campaigns', {
    method: 'POST',
    body: JSON.stringify({ name, description: description || 'Simulated security awareness drill', template_id, landing_page_id })
  });

  if (!res) return;
  const data = await res.json();

  if (res.ok && (data.success || data.campaign_id || data.id)) {
    showToast(`Campaign "${name}" registered!`);
    document.getElementById('newCampaignModal').classList.add('hidden');
    document.getElementById('createCampaignForm').reset();
    await loadCampaignsList();
  } else {
    alert(`Error: ${data.error || data.message}`);
  }
}

async function triggerDispatch(campaignId) {
  const senderMask = document.getElementById('customSenderMask')?.value || 'Microsoft 365 Security Alert';
  const senderAlias = document.getElementById('customSenderAlias')?.value || 'ms365-security';

  if (!confirm(`Dispatch Campaign #${campaignId} via Gmail using display mask "${senderMask}" (+${senderAlias})?`)) return;

  showToast(`Dispatching emails via Gmail SMTP...`);
  const res = await apiFetch(`/api/campaigns/${campaignId}/send`, {
    method: 'POST',
    body: JSON.stringify({ senderMask, senderAlias })
  });

  if (res && res.ok) {
    showToast(`Simulation sent! Check target Gmail inboxes.`);
    loadCampaignsList();
    loadCampaignDashboardMetrics(campaignId);
    loadTemporalHeatmap();
  } else {
    alert('Campaign dispatch failed.');
  }
}

// 11. GEMINI AI GENERATOR
async function handleAiGeneration() {
  const scenario = document.getElementById('aiScenarioInput').value.trim();
  const department = document.getElementById('aiDeptInput').value.trim();
  const urgency = document.getElementById('aiUrgencyInput').value;
  const resultArea = document.getElementById('aiResultArea');

  if (!scenario) return alert('Enter a pretext scenario first.');

  resultArea.classList.remove('hidden');
  resultArea.innerHTML = `<span class="text-blue-400 animate-pulse">Generating lure with Gemini 3.8 Flash & saving to database...</span>`;

  const res = await apiFetch('/api/ai/generate-email', {
    method: 'POST',
    body: JSON.stringify({ scenario, department, urgency })
  });

  if (res && res.ok) {
    const payload = await res.json();
    const data = payload.data || {};
    const tId = data.templateId;

    await loadTemplates();

    resultArea.innerHTML = `
      <div class="flex items-center justify-between pb-2 border-b border-slate-800">
        <div>
          <span class="text-xs bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded">Saved in MySQL as Template #${tId}</span>
          <h4 class="font-bold text-white text-base mt-1">${escapeHtml(data.templateName || scenario)}</h4>
        </div>
        <button onclick="useAiTemplateInCampaign(${tId}, '${escapeHtml(data.templateName || scenario)}')" class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs shadow-md">
          Use in New Campaign →
        </button>
      </div>
      <div class="text-sm"><strong class="text-slate-400">Subject:</strong> <span class="text-white">${escapeHtml(data.subject)}</span></div>
      <div class="p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 max-h-36 overflow-y-auto">
        ${escapeHtml(data.bodyHtml)}
      </div>
    `;
  } else {
    resultArea.innerHTML = `<span class="text-rose-400">Failed to generate template.</span>`;
  }
}

function useAiTemplateInCampaign(templateId, name) {
  document.getElementById('aiModal').classList.add('hidden');
  populateTemplateDropdown(templateId);
  const cleanName = (name || 'AI Generated Drill').replace(/^Simulation:\s*/, '');
  document.getElementById('campNameInput').value = `Simulation: ${cleanName}`;
  document.getElementById('newCampaignModal').classList.remove('hidden');
}

// 12. AWARENESS PAGE: ASSIGN QUIZ + MULTI-MCQ BUILDER + AUDIT LOGS
function resetDynamicMcqBuilder() {
  const container = document.getElementById('dynamicMcqBuilderList');
  if (!container) return;
  container.innerHTML = '';
  STATE.mcqQuestionCount = 0;
  appendMcqQuestionBlock();
}

function appendMcqQuestionBlock() {
  const container = document.getElementById('dynamicMcqBuilderList');
  if (!container) return;
  STATE.mcqQuestionCount++;
  const idx = STATE.mcqQuestionCount;

  const block = document.createElement('div');
  block.className = 'mcq-builder-item p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5';
  block.innerHTML = `
    <div class="flex items-center justify-between">
      <span class="font-bold text-blue-400 text-xs uppercase">MCQ Question #${idx}</span>
      ${idx > 1 ? `<button type="button" onclick="this.closest('.mcq-builder-item').remove()" class="text-xs text-rose-400 hover:underline">Remove</button>` : ''}
    </div>
    <input type="text" required placeholder="Enter Question #${idx}..." class="mcq-q w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-white text-sm" />
    <div class="grid grid-cols-2 gap-2">
      <input type="text" required placeholder="Option A" class="mcq-a bg-slate-900 border border-slate-800 rounded-lg p-2 text-white text-xs" />
      <input type="text" required placeholder="Option B" class="mcq-b bg-slate-900 border border-slate-800 rounded-lg p-2 text-white text-xs" />
      <input type="text" required placeholder="Option C" class="mcq-c bg-slate-900 border border-slate-800 rounded-lg p-2 text-white text-xs" />
      <input type="text" required placeholder="Option D" class="mcq-d bg-slate-900 border border-slate-800 rounded-lg p-2 text-white text-xs" />
    </div>
    <div class="flex items-center justify-between pt-1">
      <span class="text-xs text-slate-400">Correct Answer:</span>
      <select class="mcq-correct bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-white text-xs font-bold">
        <option value="A">Option A</option>
        <option value="B">Option B</option>
        <option value="C">Option C</option>
        <option value="D">Option D</option>
      </select>
    </div>
  `;
  container.appendChild(block);
}

async function loadAdminAwarenessPage() {
  const list = document.getElementById('adminQuizzesList');
  const quizSelect = document.getElementById('assignQuizSelect');

  const qRes = await apiFetch('/api/quizzes');
  if (qRes && qRes.ok) {
    const data = await qRes.json();
    const quizzes = data.quizzes || [];

    if (quizSelect) {
      quizSelect.innerHTML = quizzes.map(q =>
        `<option value="${q.id}">#${q.id}: ${escapeHtml(q.title)} (${q.question_count || 7} MCQs)</option>`
      ).join('');
    }

    list.innerHTML = quizzes.map(q => `
      <div class="p-4 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3">
        <div>
          <span class="text-[11px] text-emerald-400 font-bold uppercase">${escapeHtml(q.module_title || 'Security Module')}</span>
          <p class="font-bold text-white text-sm mt-0.5">${escapeHtml(q.title)}</p>
          <p class="text-xs text-slate-400 mt-1">${escapeHtml(q.content || '')}</p>
        </div>
        <div class="flex flex-col items-end space-y-2 shrink-0">
          <span class="px-2.5 py-1 bg-blue-500/10 text-blue-400 rounded-lg text-xs font-semibold">${q.question_count || 7} MCQs | Pass: ${q.pass_score}%</span>
          <button onclick="launchQuiz(${q.id}, '${escapeHtml(q.title)}', ${q.pass_score || 70})" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold">
            Preview Quiz
          </button>
        </div>
      </div>
    `).join('');
  }

  const empSelect = document.getElementById('assignEmployeeSelect');
  const empRes = await apiFetch('/api/employees?page=1&limit=100');
  if (empRes && empRes.ok && empSelect) {
    const empData = await empRes.json();
    const emps = empData.employees || empData.data || [];
    empSelect.innerHTML = emps.map(e =>
      `<option value="${e.id}">${escapeHtml(e.name)} (${escapeHtml(e.email)}) — [${e.risk_level} Risk]</option>`
    ).join('');
  }

  const auditBody = document.getElementById('auditLogsTableBody');
  const aRes = await apiFetch('/api/audit-logs?page=1&limit=12');
  if (aRes && aRes.ok) {
    const aData = await aRes.json();
    const logs = aData.data || aData.logs || [];
    auditBody.innerHTML = logs.map(l => `
      <tr>
        <td class="p-3.5 text-slate-400">${new Date(l.created_at).toLocaleString()}</td>
        <td class="p-3.5 text-white">${escapeHtml(l.user_email || `User #${l.user_id || 1}`)}</td>
        <td class="p-3.5 text-emerald-400 font-semibold">${escapeHtml(l.action)}</td>
        <td class="p-3.5 text-slate-400">${escapeHtml(l.ip_address || '127.0.0.1')}</td>
      </tr>
    `).join('');
  }
}

async function handleAssignQuiz(e) {
  e.preventDefault();
  const quizId = parseInt(document.getElementById('assignQuizSelect').value, 10);
  const targetType = document.getElementById('assignTargetType').value;
  const employeeId = parseInt(document.getElementById('assignEmployeeSelect').value, 10);
  const department = document.getElementById('assignDeptSelect').value;
  const feedback = document.getElementById('assignQuizFeedback');
  const btn = document.getElementById('assignQuizSubmitBtn');

  btn.disabled = true;
  feedback.classList.remove('hidden');
  feedback.className = 'p-3.5 rounded-xl text-sm font-medium bg-blue-950/50 text-blue-300 border border-blue-500/30';
  feedback.textContent = 'Assigning quiz and dispatching email notification via Gmail SMTP...';

  const res = await apiFetch('/api/quizzes/assign', {
    method: 'POST',
    body: JSON.stringify({ quizId, targetType, employeeId, department })
  });
  btn.disabled = false;

  if (res && res.ok) {
    const data = await res.json();
    feedback.className = 'p-3.5 rounded-xl text-sm font-medium bg-emerald-950/50 text-emerald-300 border border-emerald-500/30';
    feedback.textContent = `✓ ${data.message} (Sent to: ${(data.summary?.emailedTo || []).join(', ')})`;
    showToast(data.message);
    loadAdminAwarenessPage();
  } else {
    const err = res ? await res.json() : {};
    feedback.className = 'p-3.5 rounded-xl text-sm font-medium bg-rose-950/50 text-rose-300 border border-rose-500/30';
    feedback.textContent = err.message || 'Failed to assign quiz.';
  }
}

async function handleCreateQuizModule(e) {
  e.preventDefault();
  const moduleTitle = document.getElementById('newModTitle').value.trim();
  const moduleContent = document.getElementById('newModContent').value.trim();
  const quizTitle = document.getElementById('newQuizTitle').value.trim();
  const passScore = parseInt(document.getElementById('newQuizPassScore').value, 10) || 70;

  const questionBlocks = document.querySelectorAll('.mcq-builder-item');
  const questions = [];
  questionBlocks.forEach(block => {
    questions.push({
      question: block.querySelector('.mcq-q').value.trim(),
      option_a: block.querySelector('.mcq-a').value.trim(),
      option_b: block.querySelector('.mcq-b').value.trim(),
      option_c: block.querySelector('.mcq-c').value.trim(),
      option_d: block.querySelector('.mcq-d').value.trim(),
      correct_option: block.querySelector('.mcq-correct').value
    });
  });

  const res = await apiFetch('/api/quizzes/create', {
    method: 'POST',
    body: JSON.stringify({ moduleTitle, moduleContent, quizTitle, passScore, questions })
  });

  if (res && res.ok) {
    const data = await res.json();
    showToast(data.message || 'Training Module & Quiz published!');
    document.getElementById('createQuizForm').reset();
    resetDynamicMcqBuilder();
    loadAdminAwarenessPage();
  } else {
    alert('Failed to create quiz.');
  }
}

// 13. EMPLOYEE PERSONAL PORTAL
async function loadEmployeePortal() {
  const empId = STATE.user?.employeeId || STATE.user?.id || 1;
  const empEmail = STATE.user?.email || '';

  const pRes = await apiFetch(`/api/quizzes/employee/${empId}?email=${encodeURIComponent(empEmail)}`);
  if (pRes && pRes.ok) {
    const pData = await pRes.json();
    const emp = pData.employee || {};
    const history = pData.quizHistory || [];

    STATE.user = { ...STATE.user, id: emp.id, employeeId: emp.id, name: emp.name, email: emp.email, department: emp.department, risk_level: emp.risk_level };
    localStorage.setItem('user', JSON.stringify(STATE.user));

    document.getElementById('empPortalName').textContent = emp.name || 'Employee';
    document.getElementById('empPortalEmail').textContent = emp.email || '';
    document.getElementById('empContextRisk').textContent = emp.risk_level || 'Low';
    document.getElementById('empContextDept').textContent = emp.department || 'General';
    document.getElementById('empContextCompletedCount').textContent = history.length;

    const hBody = document.getElementById('empQuizHistoryBody');
    hBody.innerHTML = history.length === 0
      ? `<tr><td colspan="4" class="p-4 text-center text-slate-500">No quizzes completed yet.</td></tr>`
      : history.map(h => `
          <tr>
            <td class="p-3.5 font-semibold text-white">${escapeHtml(h.quiz_title)}</td>
            <td class="p-3.5 font-bold">${h.score}%</td>
            <td class="p-3.5"><span class="px-2.5 py-1 rounded-full text-xs font-semibold ${h.passed ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}">${h.passed ? 'Passed' : 'Failed'}</span></td>
            <td class="p-3.5 text-slate-400">${new Date(h.completed_at).toLocaleString()}</td>
          </tr>
        `).join('');
  }

  const qRes = await apiFetch('/api/quizzes');
  const container = document.getElementById('trainingModulesContainer');
  if (qRes && qRes.ok) {
    const qData = await qRes.json();
    const modules = qData.quizzes || [];
    if (modules.length === 0) {
      container.innerHTML = '<p class="text-slate-400 text-sm">No quizzes found in database.</p>';
      return;
    }
    container.innerHTML = modules.map(m => `
      <div class="p-5 bg-slate-950 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-4">
        <div class="max-w-2xl">
          <span class="text-xs font-bold uppercase text-emerald-400">${escapeHtml(m.module_title || 'Security Awareness Module')}</span>
          <h4 class="text-base font-bold text-white mt-0.5">${escapeHtml(m.title)}</h4>
          <p class="text-sm text-slate-400 mt-1 leading-relaxed">${escapeHtml(m.content || '')}</p>
          <div class="flex items-center space-x-3 mt-2.5">
            <span class="text-xs text-blue-400 bg-blue-500/10 px-3 py-1 rounded-lg font-semibold">${m.question_count || 7} MCQ Questions</span>
            <span class="text-xs text-amber-400 bg-amber-500/10 px-3 py-1 rounded-lg font-semibold">Pass Threshold: ${m.pass_score || 70}%</span>
          </div>
        </div>
        <button onclick="launchQuiz(${m.id}, '${escapeHtml(m.title)}', ${m.pass_score || 70})" class="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-600/20 transition">
          Start 7-MCQ Quiz →
        </button>
      </div>
    `).join('');
  }
}

async function launchQuiz(quizId, title, passScore) {
  STATE.currentQuizId = quizId;
  const modal = document.getElementById('quizModal');
  const questionsBox = document.getElementById('quizQuestionsContainer');
  document.getElementById('quizModalTitle').textContent = title;
  document.getElementById('quizModalThreshold').textContent = `Pass threshold: ${passScore}% — Answer all questions below`;
  document.getElementById('quizSubmissionFeedback').textContent = '';
  questionsBox.innerHTML = '<p class="text-slate-400">Loading MCQ questions...</p>';
  modal.classList.remove('hidden');

  const res = await apiFetch(`/api/quizzes/${quizId}`);
  if (!res || !res.ok) return;

  const payload = await res.json();
  const questions = payload.questions || [];

  questionsBox.innerHTML = questions.map((q, idx) => `
    <div class="space-y-3 p-4 bg-slate-950 border border-slate-800 rounded-xl">
      <p class="font-bold text-white text-sm">${idx + 1}. ${escapeHtml(q.question)}</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-slate-200 text-sm">
        <label class="flex items-center space-x-2.5 bg-slate-900 p-3 rounded-xl border border-slate-800 hover:border-blue-500 cursor-pointer">
          <input type="radio" name="question_${q.id}" value="A" class="text-blue-600" />
          <span><strong>A:</strong> ${escapeHtml(q.option_a)}</span>
        </label>
        <label class="flex items-center space-x-2.5 bg-slate-900 p-3 rounded-xl border border-slate-800 hover:border-blue-500 cursor-pointer">
          <input type="radio" name="question_${q.id}" value="B" class="text-blue-600" />
          <span><strong>B:</strong> ${escapeHtml(q.option_b)}</span>
        </label>
        <label class="flex items-center space-x-2.5 bg-slate-900 p-3 rounded-xl border border-slate-800 hover:border-blue-500 cursor-pointer">
          <input type="radio" name="question_${q.id}" value="C" class="text-blue-600" />
          <span><strong>C:</strong> ${escapeHtml(q.option_c)}</span>
        </label>
        <label class="flex items-center space-x-2.5 bg-slate-900 p-3 rounded-xl border border-slate-800 hover:border-blue-500 cursor-pointer">
          <input type="radio" name="question_${q.id}" value="D" class="text-blue-600" />
          <span><strong>D:</strong> ${escapeHtml(q.option_d)}</span>
        </label>
      </div>
    </div>
  `).join('');
}

async function submitActiveQuiz() {
  if (!STATE.currentQuizId) return;
  const empId = STATE.user?.employeeId || STATE.user?.id || 1;
  const empEmail = STATE.user?.email || '';
  const questionsBox = document.getElementById('quizQuestionsContainer');
  const feedback = document.getElementById('quizSubmissionFeedback');
  const checked = questionsBox.querySelectorAll('input[type="radio"]:checked');

  const answers = {};
  checked.forEach(input => {
    answers[input.name.replace('question_', '')] = input.value;
  });

  const res = await apiFetch(`/api/quizzes/${STATE.currentQuizId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ employee_id: empId, employee_email: empEmail, answers })
  });

  if (res && res.ok) {
    const result = await res.json();
    feedback.className = result.passed ? 'text-sm text-emerald-400 font-bold' : 'text-sm text-rose-400 font-bold';
    feedback.textContent = result.message;
    showToast(result.message);
    if (STATE.user?.role === 'Employee') {
      loadEmployeePortal();
    }
  }
}

// HELPERS
function getStatusBadgeStyle(status) {
  if (status === 'Completed') return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
  if (status === 'Running') return 'bg-blue-500/15 text-blue-400 border border-blue-500/30 animate-pulse';
  return 'bg-slate-800 text-slate-300 border border-slate-700';
}

function getRiskBadgeStyle(risk) {
  if (risk === 'High') return 'bg-rose-500/15 text-rose-400 border border-rose-500/30';
  if (risk === 'Medium') return 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
  return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
}

function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), wait); };
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}