// 永倉管理系統 (Yongcang Management System) Logic

// Global Cache
let currentUser = null;
let customersCache = [];
let projectsCache = [];
let quotationsCache = [];
let projectStagedFiles = [];

// 將使用者輸入的文字轉成安全的 HTML 文字（防止 XSS）
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 產生可安全放入 onclick="..." 屬性中的 JS 字串參數
function jsArg(value) {
  return escapeHtml(JSON.stringify(value === null || value === undefined ? '' : String(value)));
}

// Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.log('ServiceWorker registration failed: ', err);
    });
  });
}

// Global fetch interceptor to catch 401 Unauthorized
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  if (response.status === 401 && typeof args[0] === 'string' && !args[0].includes('/api/auth/')) {
    currentUser = null;
    applyAuthState(false);
  }
  return response;
};

// Utility: Debounce for search inputs
// 同一個函式共用同一個計時器，HTML 中的 oninput="debounce(loadX, 300)()" 才能真正合併連續輸入
const debouncedFunctions = new Map();
function debounce(func, wait) {
  if (debouncedFunctions.has(func)) return debouncedFunctions.get(func);
  let timeout;
  const executedFunction = function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
  debouncedFunctions.set(func, executedFunction);
  return executedFunction;
}

// Utility: Currency format
function formatCurrency(amount) {
  if (isNaN(amount) || amount === null) return '$0';
  return '$' + Number(amount).toLocaleString('zh-TW');
}

// Utility: Date format
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// Utility: 將 UTC 時間轉成本地時間字串，供 <input type="date"> / <input type="datetime-local"> 使用
function toLocalInputValue(dateStr, withTime) {
  const d = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
  return withTime ? local.slice(0, 16) : local.slice(0, 10);
}

// Utility: DateTime format
function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Utility: File Size format
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Modal helper
function openModal(id) {
  document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

// Utility: parse server error response
async function parseErrorMessage(res, defaultMsg = '儲存失敗') {
  try {
    const text = await res.text();
    if (!text) return defaultMsg;
    try {
      const data = JSON.parse(text);
      if (data.message) return data.message;
      if (data.errors) {
        const msgs = Object.values(data.errors).flat();
        if (msgs.length > 0) return msgs.join('、');
      }
      if (data.title) return data.title;
      return typeof data === 'string' ? data : JSON.stringify(data);
    } catch {
      return text;
    }
  } catch {
    return defaultMsg;
  }
}

// Tab Navigation
document.addEventListener('DOMContentLoaded', async () => {
  const navItems = document.querySelectorAll('.nav-item, .mobile-nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  // Verify Auth
  const isAuthenticated = await checkAuth();
  if (isAuthenticated) {
    // Initial Load
    loadDashboard();
    loadCustomers();
    loadProjects();
  }
});

function switchTab(tabName) {
  document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(el => {
    if (el.getAttribute('data-tab') === tabName) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  document.querySelectorAll('.content-view').forEach(view => {
    view.style.display = 'none';
  });

  const titleConfigs = {
    dashboard: '<i class="fa-solid fa-chart-pie"></i> <span>總覽管理</span>',
    customers: '<i class="fa-solid fa-users"></i> <span>客戶資料</span>',
    projects: '<i class="fa-solid fa-folder-open"></i> <span>專案案場</span>',
    worklogs: '<i class="fa-solid fa-calendar-check"></i> <span>工作行程</span>',
    payments: '<i class="fa-solid fa-wallet"></i> <span>收費紀錄</span>',
    stats: '<i class="fa-solid fa-chart-column"></i> <span>統計報表</span>',
    users: '<i class="fa-solid fa-user-shield"></i> <span>帳號授權管理</span>'
  };

  document.getElementById('page-title').innerHTML = titleConfigs[tabName] || '<i class="fa-solid fa-layer-group"></i> <span>永倉管理</span>';
  const targetView = document.getElementById(`view-${tabName}`);
  if (targetView) targetView.style.display = 'block';

  if (tabName === 'dashboard') loadDashboard();
  if (tabName === 'stats') loadStats();
  if (tabName === 'customers') loadCustomers();
  if (tabName === 'projects') loadProjects();
  if (tabName === 'worklogs') loadWorkLogs();
  if (tabName === 'payments') loadPayments();
  if (tabName === 'users') loadUsers();
}

// ==================== 🎙️ 語音輸入功能 (SPEECH RECOGNITION - 新增資料時專用) ====================
function getSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('您的瀏覽器不支援語音辨識功能，建議使用 Chrome 或 Safari 瀏覽器。');
    return null;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = 'zh-TW';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  return recognition;
}

// 欄位單獨語音輸入 (客戶、行程、收費使用)
function startFieldVoiceInput(targetInputId, micBtn) {
  const target = document.getElementById(targetInputId);
  if (!target) return;

  const recognition = getSpeechRecognition();
  if (!recognition) return;

  micBtn.classList.add('listening');

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    if (transcript) {
      if (target.tagName.toLowerCase() === 'textarea' && target.value) {
        target.value = target.value + ' ' + transcript;
      } else {
        target.value = transcript;
      }
    }
  };

  recognition.onerror = (event) => {
    console.warn('Voice error:', event.error);
    micBtn.classList.remove('listening');
  };

  recognition.onend = () => {
    micBtn.classList.remove('listening');
  };

  recognition.start();
}

// ==================== 1. 總覽管理 (DASHBOARD) - 以尚未完成的工程依照日期排序 ====================
async function loadDashboard() {
  try {
    const res = await fetch('/api/dashboard/stats');
    if (!res.ok) return;
    const data = await res.json();

    const pendingProjectsEl = document.getElementById('stat-pending-projects');
    if (pendingProjectsEl) pendingProjectsEl.innerText = data.pendingProjectsCount || 0;

    const pendingTasksEl = document.getElementById('stat-pending-tasks');
    if (pendingTasksEl) pendingTasksEl.innerText = data.pendingWorkLogsCount || 0;

    const monthRevenueEl = document.getElementById('stat-month-revenue');
    if (monthRevenueEl) monthRevenueEl.innerText = formatCurrency(data.monthRevenue);

    const pendingPaymentsEl = document.getElementById('stat-pending-payments');
    if (pendingPaymentsEl) pendingPaymentsEl.innerText = formatCurrency(data.pendingPaymentsAmount);

    const badgeCountEl = document.getElementById('badge-pending-projects-count');
    if (badgeCountEl) badgeCountEl.innerText = `${data.pendingProjects ? data.pendingProjects.length : 0} 案`;

    // 1. 尚未完成的工程案場 (依照預計完工日/開工日/建立日期排序)
    const pendingProjectsList = document.getElementById('dashboard-pending-projects-list');
    if (pendingProjectsList) {
      if (data.pendingProjects && data.pendingProjects.length > 0) {
        pendingProjectsList.innerHTML = data.pendingProjects.map(p => `
          <div class="list-item-card">
            <div class="list-item-top">
              <div class="list-item-info">
                <div class="list-item-title" style="flex-wrap: wrap; gap: 6px;">
                  <span class="project-number-badge"><i class="fa-solid fa-hashtag"></i> ${escapeHtml(p.projectNumber || 'PRJ')}</span>
                  <span style="font-size: 16.5px; font-weight: 800; color: #1e293b;">${escapeHtml(p.name)}</span>
                  <span class="badge ${getProjectStatusBadgeClass(p.status)}">${escapeHtml(p.status)}</span>
                  ${p.budget ? `<span style="font-weight: 800; color: var(--success); margin-left: 4px;">預算: ${formatCurrency(p.budget)}</span>` : ''}
                </div>
                <div class="list-item-sub" style="margin-top: 6px;">
                  <span><i class="fa-solid fa-user"></i> <b>${escapeHtml(p.customerName)}</b> ${p.customerPhone ? '(' + escapeHtml(p.customerPhone) + ')' : ''}</span>
                  ${p.endDate ? `<span style="color: #dc2626; font-weight: 700;"><i class="fa-solid fa-flag-checkered"></i> 預計完工: ${formatDate(p.endDate)}</span>` : ''}
                  ${p.startDate ? `<span><i class="fa-regular fa-calendar-plus"></i> 開工: ${formatDate(p.startDate)}</span>` : ''}
                  ${p.address ? `<span><i class="fa-solid fa-location-dot" style="color: #ea580c;"></i> ${escapeHtml(p.address)}</span>` : ''}
                  ${p.contactPerson ? `<span><i class="fa-solid fa-id-badge"></i> 現場: ${escapeHtml(p.contactPerson)} ${escapeHtml(p.contactPhone)}</span>` : ''}
                </div>
              </div>
              <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                <button class="btn btn-sm btn-primary" onclick="openWorkLogModal(null, ${p.customerId}, ${p.id}, '保養')" title="排定此案場工單"><i class="fa-solid fa-calendar-plus"></i> 排行程</button>
                <button class="btn btn-sm btn-secondary" onclick="openProjectFilesModal(${p.id})" title="案場附件庫"><i class="fa-solid fa-paperclip"></i> 附件</button>
                <button class="btn btn-sm btn-secondary" onclick="editProject(${p.id})" title="編輯案場"><i class="fa-solid fa-pen"></i></button>
              </div>
            </div>
          </div>
        `).join('');
      } else {
        pendingProjectsList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 28px;">目前無尚未完工的工程案場 🎉</p>';
      }
    }

    // 2. 待辦/進行中行程與工單 (保養/安裝/維修)
    const pendingWorkLogsList = document.getElementById('dashboard-pending-worklogs-list');
    if (pendingWorkLogsList) {
      if (data.pendingWorkLogs && data.pendingWorkLogs.length > 0) {
        pendingWorkLogsList.innerHTML = data.pendingWorkLogs.map(w => `
          <div class="list-item-card ${w.isPriority ? 'is-priority' : ''}">
            <div class="list-item-top">
              <div class="list-item-info">
                <div class="list-item-title">
                  ${getWorkTypeBadgeHtml(w.workType)}
                  ${w.isPriority ? '<span class="badge badge-priority"><i class="fa-solid fa-star"></i> 優先 (*)</span>' : ''}
                  <span>${escapeHtml(w.title)}</span>
                  <span class="badge ${getStatusBadgeClass(w.status)}">${escapeHtml(w.status)}</span>
                </div>
                <div class="list-item-sub">
                  <span><i class="fa-regular fa-clock"></i> 預定: ${formatDateTime(w.scheduledAt)}</span>
                  <span><i class="fa-solid fa-user"></i> <b>${escapeHtml(w.customerName)}</b></span>
                  ${w.projectName ? `<span style="color: var(--primary);">[${escapeHtml(w.projectName)}]</span>` : ''}
                  ${w.location ? `<span><i class="fa-solid fa-location-dot" style="color: #ea580c;"></i> ${escapeHtml(w.location)}</span>` : ''}
                </div>
              </div>
              <div style="display: flex; gap: 4px; align-items: center;">
                <button class="btn btn-sm btn-gcal" onclick="addToGoogleCalendar(${w.id})" title="Google 日曆"><i class="fa-brands fa-google"></i></button>
                <button class="btn btn-sm btn-secondary" onclick="editWorkLog(${w.id})" title="編輯"><i class="fa-solid fa-pen"></i></button>
              </div>
            </div>
          </div>
        `).join('');
      } else {
        pendingWorkLogsList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 24px;">尚無待辦之行程或保修工單</p>';
      }
    }

    // 3. 近期收費紀錄
    const recentList = document.getElementById('recent-payments-list');
    if (recentList) {
      if (data.recentPayments && data.recentPayments.length > 0) {
        recentList.innerHTML = data.recentPayments.map(p => `
          <div class="list-item-card">
            <div class="list-item-top">
              <div class="list-item-info">
                <div class="list-item-title">
                  <i class="fa-solid fa-receipt" style="color: var(--success);"></i>
                  <span>${escapeHtml(p.title)}</span>
                  <span style="color: var(--success); font-weight: 800; margin-left: 4px;">+${formatCurrency(p.amount)}</span>
                </div>
                <div class="list-item-sub">
                  <span><i class="fa-regular fa-calendar"></i> ${formatDate(p.paymentDate)}</span>
                  <span><i class="fa-solid fa-user"></i> ${escapeHtml(p.customerName)}</span>
                  <span class="badge ${p.status === '已收款' ? 'badge-success' : 'badge-warning'}">${escapeHtml(p.status)}</span>
                </div>
              </div>
            </div>
          </div>
        `).join('');
      } else {
        recentList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 24px;">尚無收費紀錄</p>';
      }
    }
  } catch (err) {
    console.error('Error loading dashboard stats:', err);
  }
}

// ==================== 2. 客戶資料 (CUSTOMERS) ====================
async function loadCustomers() {
  const search = document.getElementById('customer-search').value;
  const category = document.getElementById('customer-category-filter').value;
  try {
    const res = await fetch(`/api/customers?search=${encodeURIComponent(search || '')}&category=${encodeURIComponent(category || '')}`);
    if (!res.ok) return;
    const data = await res.json();
    customersCache = data;

    populateCustomerDropdowns();

    const listEl = document.getElementById('customers-list');
    if (data.length === 0) {
      listEl.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">尚無客戶資料，點擊右上角「新增客戶」建立第一筆</p>';
      return;
    }

    listEl.innerHTML = data.map(c => `
      <div class="list-item-card">
        <div class="list-item-top">
          <div class="list-item-info">
            <div class="list-item-title">
              <i class="fa-solid fa-user-tie" style="color: var(--primary);"></i>
              <span style="font-size: 17px; font-weight: 800;">${escapeHtml(c.name)}</span>
              <span class="badge ${getCategoryBadgeClass(c.category)}">${escapeHtml(c.category || '個人')}</span>
            </div>
            <div class="list-item-sub">
              <span><i class="fa-solid fa-phone" style="color: var(--primary);"></i> <b>${escapeHtml(c.phone)}</b></span>
              ${c.lineId ? `<span><i class="fa-brands fa-line" style="color: #00c300; font-size: 15px;"></i> LINE: ${escapeHtml(c.lineId)}</span>` : ''}
              ${c.address ? `<span><i class="fa-solid fa-location-dot" style="color: #ea580c;"></i> ${escapeHtml(c.address)}</span>` : ''}
              ${c.email ? `<span><i class="fa-solid fa-envelope" style="color: #64748b;"></i> ${escapeHtml(c.email)}</span>` : ''}
            </div>
            ${c.notes ? `<div style="font-size: 13px; color: #475569; margin-top: 6px; background: #f8fafc; border-left: 3px solid #94a3b8; padding: 6px 10px; border-radius: 4px;"><i class="fa-regular fa-note-sticky"></i> 備註: ${escapeHtml(c.notes)}</div>` : ''}
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm btn-secondary" onclick="editCustomer(${c.id})" title="編輯資料"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-sm btn-danger" onclick="deleteCustomer(${c.id}, ${jsArg(c.name)})" title="刪除"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>

        <!-- 客戶動作按鈕群：建立專案 / 保養 / 安裝 / 維修 / 查看保修歷程 / 記帳收費 -->
        <div class="customer-action-btn-group">
          <button class="btn btn-sm btn-action-project" onclick="triggerCustomerAction(${c.id}, 'project')">
            <i class="fa-solid fa-folder-plus"></i> 建立專案案場
          </button>
          <button class="btn btn-sm btn-action-maint" onclick="triggerCustomerAction(${c.id}, 'maint')">
            <i class="fa-solid fa-wrench"></i> 排定保養
          </button>
          <button class="btn btn-sm btn-action-inst" onclick="triggerCustomerAction(${c.id}, 'inst')">
            <i class="fa-solid fa-box"></i> 排定安裝
          </button>
          <button class="btn btn-sm btn-action-repair" onclick="triggerCustomerAction(${c.id}, 'repair')">
            <i class="fa-solid fa-screwdriver-wrench"></i> 排定維修
          </button>
          <button class="btn btn-sm btn-action-history" onclick="viewCustomerHistory(${c.id})" title="查詢此客戶過往所有保養、安裝與維修紀錄">
            <i class="fa-solid fa-clipboard-list"></i> 📋 保修紀錄歷程
          </button>
          <button class="btn btn-sm btn-action-pay" onclick="triggerCustomerAction(${c.id}, 'pay')">
            <i class="fa-solid fa-wallet"></i> 產生收費紀錄
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading customers:', err);
  }
}

function triggerCustomerAction(customerId, actionType) {
  if (actionType === 'project') {
    openProjectModal(null, customerId);
  } else if (actionType === 'maint') {
    openWorkLogModal(null, customerId, null, '保養');
  } else if (actionType === 'inst') {
    openWorkLogModal(null, customerId, null, '安裝');
  } else if (actionType === 'repair') {
    openWorkLogModal(null, customerId, null, '維修');
  } else if (actionType === 'log') {
    openWorkLogModal(null, customerId, null, '保養');
  } else if (actionType === 'pay') {
    openPaymentModal(null, customerId);
  }
}

function populateCustomerDropdowns() {
  const optionsHtml = customersCache.map(c => `<option value="${c.id}">[${escapeHtml(c.category || '個人')}] ${escapeHtml(c.name)} (${escapeHtml(c.phone)})</option>`).join('');

  // Project Modal Customer
  const projectCustSelect = document.getElementById('project-customer-id');
  if (projectCustSelect) {
    const cur = projectCustSelect.value;
    projectCustSelect.innerHTML = '<option value="">-- 請選擇客戶 --</option>' + optionsHtml;
    if (cur) projectCustSelect.value = cur;
  }

  // Project Customer Filter in view-projects
  const projectFilterSelect = document.getElementById('project-customer-filter');
  if (projectFilterSelect) {
    const cur = projectFilterSelect.value;
    projectFilterSelect.innerHTML = '<option value="">全部客戶/設計師/公司</option>' + optionsHtml;
    if (cur) projectFilterSelect.value = cur;
  }

  // Worklogs
  const worklogSelect = document.getElementById('worklog-customer');
  if (worklogSelect) {
    const cur = worklogSelect.value;
    worklogSelect.innerHTML = '<option value="">-- 無關聯客戶 / 內部行程 --</option>' + optionsHtml;
    if (cur) worklogSelect.value = cur;
  }

  // Payments (Default top is 散客 / 現場購買)
  const paySelect = document.getElementById('payment-customer');
  if (paySelect) {
    const cur = paySelect.value;
    paySelect.innerHTML = '<option value="">-- 散客 / 現場購買 (不記客戶) --</option>' + optionsHtml;
    if (cur) paySelect.value = cur;
  }

  // Quick Payment
  const quickSelect = document.getElementById('quick-payment-customer');
  if (quickSelect) {
    const cur = quickSelect.value;
    quickSelect.innerHTML = '<option value="">-- 散客 / 現場購買 (不記客戶) --</option>' + optionsHtml;
    if (cur) quickSelect.value = cur;
  }

  populateProjectDropdowns();
}

function populateProjectDropdowns() {
  const projectOptionsHtml = projectsCache.map(p => 
    `<option value="${p.id}">[${escapeHtml(p.projectNumber)}] ${escapeHtml(p.name)}</option>`
  ).join('');

  const worklogProjSelect = document.getElementById('worklog-project');
  if (worklogProjSelect) {
    const cur = worklogProjSelect.value;
    worklogProjSelect.innerHTML = '<option value="">-- 無關聯專案 --</option>' + projectOptionsHtml;
    if (cur) worklogProjSelect.value = cur;
  }

  const payProjSelect = document.getElementById('payment-project');
  if (payProjSelect) {
    const cur = payProjSelect.value;
    payProjSelect.innerHTML = '<option value="">-- 無關聯專案 --</option>' + projectOptionsHtml;
    if (cur) payProjSelect.value = cur;
  }
}

function filterWorkLogProjects() {
  const custId = document.getElementById('worklog-customer').value;
  const filtered = custId ? projectsCache.filter(p => p.customerId == custId) : projectsCache;
  const projSelect = document.getElementById('worklog-project');
  if (projSelect) {
    projSelect.innerHTML = '<option value="">-- 無關聯專案 --</option>' + filtered.map(p => `<option value="${p.id}">[${escapeHtml(p.projectNumber)}] ${escapeHtml(p.name)}</option>`).join('');
  }
}

function filterPaymentProjects() {
  const custId = document.getElementById('payment-customer').value;
  const filtered = custId ? projectsCache.filter(p => p.customerId == custId) : projectsCache;
  const projSelect = document.getElementById('payment-project');
  if (projSelect) {
    projSelect.innerHTML = '<option value="">-- 無關聯專案 --</option>' + filtered.map(p => `<option value="${p.id}">[${escapeHtml(p.projectNumber)}] ${escapeHtml(p.name)}</option>`).join('');
  }
}

function openCustomerModal(id = null) {
  document.getElementById('customer-id').value = id || '';
  document.getElementById('modal-customer-title').innerHTML = id ? '<i class="fa-solid fa-pen-to-square" style="color: var(--primary);"></i> 編輯客戶資料' : '<i class="fa-solid fa-user-plus" style="color: var(--primary);"></i> 新增客戶資料';
  if (!id) {
    document.getElementById('customer-name').value = '';
    document.getElementById('customer-category').value = '個人';
    document.getElementById('customer-phone').value = '';
    document.getElementById('customer-line').value = '';
    document.getElementById('customer-address').value = '';
    document.getElementById('customer-email').value = '';
    document.getElementById('customer-notes').value = '';
  }
  openModal('modal-customer');
}

async function editCustomer(id) {
  const customer = customersCache.find(c => c.id === id);
  if (!customer) return;
  document.getElementById('customer-id').value = customer.id;
  document.getElementById('customer-name').value = customer.name || '';
  document.getElementById('customer-category').value = customer.category || '個人';
  document.getElementById('customer-phone').value = customer.phone || '';
  document.getElementById('customer-line').value = customer.lineId || '';
  document.getElementById('customer-address').value = customer.address || '';
  document.getElementById('customer-email').value = customer.email || '';
  document.getElementById('customer-notes').value = customer.notes || '';
  document.getElementById('modal-customer-title').innerHTML = '<i class="fa-solid fa-pen-to-square" style="color: var(--primary);"></i> 編輯客戶資料';
  openModal('modal-customer');
}

async function saveCustomer() {
  const id = document.getElementById('customer-id').value;
  const name = document.getElementById('customer-name').value.trim();
  const phone = document.getElementById('customer-phone').value.trim();
  const category = document.getElementById('customer-category').value;

  if (!name) {
    alert('客戶姓名為必填項目！');
    return;
  }
  if (!phone) {
    alert('聯絡電話為必填項目！');
    return;
  }

  const payload = {
    id: id ? parseInt(id) : 0,
    name,
    phone,
    category,
    lineId: document.getElementById('customer-line').value.trim(),
    address: document.getElementById('customer-address').value.trim(),
    email: document.getElementById('customer-email').value.trim(),
    notes: document.getElementById('customer-notes').value.trim()
  };

  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/customers/${id}` : '/api/customers';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      closeModal('modal-customer');
      loadCustomers();
      loadDashboard();
    } else {
      const errMsg = await parseErrorMessage(res, '請確認姓名與電話皆已填寫');
      alert(`儲存客戶資料失敗：${errMsg}`);
    }
  } catch (err) {
    alert(`儲存客戶資料時發生網路錯誤：${err.message || err}`);
  }
}

async function deleteCustomer(id, name) {
  if (!confirm(`確定要刪除客戶「${name}」嗎？這將同時刪除該客戶所有關聯紀錄。`)) return;
  const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
  if (res.ok) {
    loadCustomers();
    loadDashboard();
  }
}

// ==================== 專案/案場管理 (PROJECTS) ====================
async function loadProjects() {
  const searchEl = document.getElementById('project-search');
  const custEl = document.getElementById('project-customer-filter');
  const statusEl = document.getElementById('project-status-filter');

  const search = searchEl ? searchEl.value : '';
  const customerId = custEl ? custEl.value : '';
  const status = statusEl ? statusEl.value : '';

  try {
    const res = await fetch(`/api/projects?search=${encodeURIComponent(search || '')}&customerId=${encodeURIComponent(customerId || '')}&status=${encodeURIComponent(status || '')}`);
    if (!res.ok) return;
    const data = await res.json();
    projectsCache = data;

    populateProjectDropdowns();

    const listEl = document.getElementById('projects-list');
    if (!listEl) return;

    if (data.length === 0) {
      listEl.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">尚無專案/案場資料，點擊右上角「新增專案/案場」或至客戶資料中點擊「建立專案案場」</p>';
      return;
    }

    listEl.innerHTML = data.map(p => `
      <div class="list-item-card">
        <div class="list-item-top">
          <div class="list-item-info">
            <div class="list-item-title" style="flex-wrap: wrap; gap: 6px;">
              <span class="project-number-badge"><i class="fa-solid fa-hashtag"></i> ${escapeHtml(p.projectNumber)}</span>
              <span style="font-size: 17px; font-weight: 800; color: #1e293b;">${escapeHtml(p.name)}</span>
              <span class="badge ${getProjectStatusBadgeClass(p.status)}">${escapeHtml(p.status)}</span>
              <span class="badge ${getCategoryBadgeClass(p.customerCategory)}"><i class="fa-solid fa-user"></i> ${escapeHtml(p.customerName)}</span>
            </div>
            <div class="list-item-sub" style="margin-top: 6px;">
              ${p.customerPhone ? `<span><i class="fa-solid fa-phone" style="color: var(--primary);"></i> ${escapeHtml(p.customerPhone)}</span>` : ''}
              ${p.contactPerson ? `<span><i class="fa-solid fa-user-gear"></i> 現場窗口: <b>${escapeHtml(p.contactPerson)}</b> ${escapeHtml(p.contactPhone)}</span>` : ''}
              ${p.address ? `<span><i class="fa-solid fa-location-dot" style="color: #ea580c;"></i> ${escapeHtml(p.address)}</span>` : ''}
              ${p.budget ? `<span style="color: var(--success); font-weight: 700;"><i class="fa-solid fa-sack-dollar"></i> 預算: ${formatCurrency(p.budget)}</span>` : ''}
              ${p.startDate ? `<span><i class="fa-regular fa-calendar"></i> 進場: ${formatDate(p.startDate)}</span>` : ''}
            </div>
            ${p.notes ? `<div style="font-size: 13px; color: #475569; margin-top: 6px; background: #f8fafc; border-left: 3px solid #6366f1; padding: 6px 10px; border-radius: 4px;"><i class="fa-regular fa-clipboard"></i> <b>施工規範/備註:</b> ${escapeHtml(p.notes)}</div>` : ''}
            
            <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px;">
              <span class="badge ${p.fileCount > 0 ? 'badge-info' : 'badge-gray'}" style="font-size: 12px; cursor: pointer;" onclick="openProjectFilesModal(${p.id})">
                <i class="fa-solid fa-paperclip"></i> ${p.fileCount > 0 ? `附件檔案 (${p.fileCount})` : '尚無附件'}
              </span>
            </div>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm btn-action-files" onclick="openProjectFilesModal(${p.id})" title="管理附件與圖檔"><i class="fa-solid fa-paperclip"></i> 檔案庫 (${p.fileCount})</button>
            <button class="btn btn-sm btn-secondary" onclick="editProject(${p.id})" title="編輯專案"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-sm btn-danger" onclick="deleteProject(${p.id}, ${jsArg(p.name)})" title="刪除"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>

        <div class="customer-action-btn-group">
          <button class="btn btn-sm btn-action-files" onclick="openProjectFilesModal(${p.id})">
            <i class="fa-solid fa-cloud-arrow-up"></i> 上傳/檢視附件 (${p.fileCount})
          </button>
          <button class="btn btn-sm btn-action-maint" onclick="openWorkLogModal(null, ${p.customerId}, ${p.id}, '保養')">
            <i class="fa-solid fa-wrench"></i> 排定保養
          </button>
          <button class="btn btn-sm btn-action-inst" onclick="openWorkLogModal(null, ${p.customerId}, ${p.id}, '安裝')">
            <i class="fa-solid fa-box"></i> 排定安裝
          </button>
          <button class="btn btn-sm btn-action-repair" onclick="openWorkLogModal(null, ${p.customerId}, ${p.id}, '維修')">
            <i class="fa-solid fa-screwdriver-wrench"></i> 排定維修
          </button>
          <button class="btn btn-sm btn-action-pay" onclick="openPaymentModal(null, ${p.customerId}, ${p.id})">
            <i class="fa-solid fa-wallet"></i> 專案收費紀錄
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading projects:', err);
  }
}

function openProjectModal(id = null, preSelectCustomerId = null) {
  document.getElementById('project-id').value = id || '';
  document.getElementById('modal-project-title').innerHTML = id ? '<i class="fa-solid fa-pen-to-square" style="color: var(--primary);"></i> 編輯專案 / 案場' : '<i class="fa-solid fa-folder-plus" style="color: var(--primary);"></i> 新增專案 / 案場';
  populateCustomerDropdowns();

  const custSelect = document.getElementById('project-customer-id');
  if (preSelectCustomerId) {
    custSelect.value = preSelectCustomerId;
  } else if (!id) {
    custSelect.value = '';
  }

  if (!id) {
    document.getElementById('project-number').value = '';
    document.getElementById('project-name').value = '';
    document.getElementById('project-status').value = '進行中';
    document.getElementById('project-contact-person').value = '';
    document.getElementById('project-contact-phone').value = '';
    document.getElementById('project-address').value = '';
    document.getElementById('project-budget').value = '';
    document.getElementById('project-start-date').value = '';
    document.getElementById('project-end-date').value = '';
    document.getElementById('project-notes').value = '';
  }

  openModal('modal-project');
}

async function editProject(id) {
  const res = await fetch(`/api/projects/${id}`);
  if (!res.ok) {
    alert('找不到此專案');
    return;
  }
  const p = await res.json();

  document.getElementById('project-id').value = p.id;
  document.getElementById('modal-project-title').innerHTML = '<i class="fa-solid fa-pen-to-square" style="color: var(--primary);"></i> 編輯專案 / 案場';
  populateCustomerDropdowns();

  document.getElementById('project-customer-id').value = p.customerId;
  document.getElementById('project-number').value = p.projectNumber || '';
  document.getElementById('project-name').value = p.name || '';
  document.getElementById('project-status').value = p.status || '進行中';
  document.getElementById('project-contact-person').value = p.contactPerson || '';
  document.getElementById('project-contact-phone').value = p.contactPhone || '';
  document.getElementById('project-address').value = p.address || '';
  document.getElementById('project-budget').value = p.budget !== null ? p.budget : '';
  document.getElementById('project-start-date').value = p.startDate ? p.startDate.substring(0, 10) : '';
  document.getElementById('project-end-date').value = p.endDate ? p.endDate.substring(0, 10) : '';
  document.getElementById('project-notes').value = p.notes || '';

  openModal('modal-project');
}

async function saveProject() {
  const id = document.getElementById('project-id').value;
  const name = document.getElementById('project-name').value.trim();
  const customerId = parseInt(document.getElementById('project-customer-id').value);

  if (!name) {
    alert('請填寫專案 / 案場名稱');
    return;
  }

  if (!customerId || customerId <= 0) {
    alert('請選擇關聯客戶 / 設計師 / 公司');
    return;
  }

  const budgetVal = document.getElementById('project-budget').value;
  const startDateVal = document.getElementById('project-start-date').value;
  const endDateVal = document.getElementById('project-end-date').value;

  const payload = {
    id: id ? parseInt(id) : 0,
    projectNumber: document.getElementById('project-number').value.trim(),
    name,
    customerId,
    status: document.getElementById('project-status').value || '進行中',
    contactPerson: document.getElementById('project-contact-person').value.trim(),
    contactPhone: document.getElementById('project-contact-phone').value.trim(),
    address: document.getElementById('project-address').value.trim(),
    budget: budgetVal ? parseFloat(budgetVal) : null,
    startDate: startDateVal ? new Date(startDateVal).toISOString() : null,
    endDate: endDateVal ? new Date(endDateVal).toISOString() : null,
    notes: document.getElementById('project-notes').value.trim()
  };

  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/projects/${id}` : '/api/projects';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      closeModal('modal-project');
      loadProjects();
      loadDashboard();
    } else {
      const errMsg = await parseErrorMessage(res, '請檢查輸入欄位');
      alert(`儲存專案失敗：${errMsg}`);
    }
  } catch (err) {
    alert(`儲存專案時發生網路錯誤：${err.message || err}`);
  }
}

async function deleteProject(id, name) {
  if (!confirm(`確定要刪除專案「${name}」嗎？這將同時刪除該專案所有已上傳的檔案與圖檔。`)) return;
  const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
  if (res.ok) {
    loadProjects();
    loadDashboard();
  } else {
    const errMsg = await parseErrorMessage(res, '刪除失敗');
    alert(`刪除專案失敗：${errMsg}`);
  }
}

// 專案檔案附件庫
function getFileIconInfo(fileName, fileType) {
  const ext = (fileType || '').toLowerCase() || (fileName.slice((fileName.lastIndexOf(".") - 1 >>> 0) + 2)).toLowerCase();
  if (['.docx', '.doc', 'docx', 'doc'].includes(ext)) {
    return { icon: 'fa-solid fa-file-word', className: 'icon-word', label: 'Word 文件' };
  }
  if (['.pdf', 'pdf'].includes(ext)) {
    return { icon: 'fa-solid fa-file-pdf', className: 'icon-pdf', label: 'PDF 文件' };
  }
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    return { icon: 'fa-solid fa-file-image', className: 'icon-image', label: '圖片/設計圖' };
  }
  if (['.xlsx', '.xls', '.csv', 'xlsx', 'xls', 'csv'].includes(ext)) {
    return { icon: 'fa-solid fa-file-excel', className: 'icon-excel', label: 'Excel 試算表' };
  }
  return { icon: 'fa-solid fa-file-lines', className: 'icon-generic', label: '檔案' };
}

async function openProjectFilesModal(projectId) {
  document.getElementById('current-project-files-id').value = projectId;
  projectStagedFiles = [];
  document.getElementById('selected-files-preview').style.display = 'none';
  document.getElementById('project-files-input').value = '';

  try {
    const res = await fetch(`/api/projects/${projectId}`);
    if (!res.ok) {
      alert('無法載入專案資料');
      return;
    }
    const p = await res.json();

    document.getElementById('modal-project-files-title').innerHTML = `<i class="fa-solid fa-folder-open" style="color: var(--primary);"></i> 檔案附件庫 - ${escapeHtml(p.name)}`;
    document.getElementById('modal-project-files-sub').innerText = `專案編號: ${p.projectNumber || '無'} | 關聯客戶: ${p.customer ? p.customer.name : '未指定'}`;
    document.getElementById('project-files-total-badge').innerText = p.files ? p.files.length : 0;

    renderAttachedFilesList(p.files || []);
    openModal('modal-project-files');
  } catch (err) {
    alert('載入專案附件時發生錯誤：' + err);
  }
}

function renderAttachedFilesList(files) {
  const container = document.getElementById('project-attached-files-list');
  if (!files || files.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 24px;">尚無附件檔案，點擊上方區域即可上傳 Word、PDF、設計圖或施工照片</p>';
    return;
  }

  container.innerHTML = files.map(f => {
    const iconInfo = getFileIconInfo(f.fileName, f.fileType);
    return `
      <div class="attached-file-item">
        <div class="attached-file-info">
          <div class="attached-file-icon ${iconInfo.className}">
            <i class="${iconInfo.icon}"></i>
          </div>
          <div class="attached-file-meta">
            <div class="attached-file-name" title="${escapeHtml(f.fileName)}">${escapeHtml(f.fileName)}</div>
            <div class="attached-file-sub">
              <span>${iconInfo.label}</span>
              <span>•</span>
              <span>${formatFileSize(f.fileSizeBytes)}</span>
              <span>•</span>
              <span>${formatDateTime(f.uploadedAt)}</span>
            </div>
          </div>
        </div>
        <div class="attached-file-actions">
          <a href="/api/projects/files/${f.id}/download" class="btn btn-sm btn-secondary" target="_blank" download="${escapeHtml(f.fileName)}" title="下載檔案">
            <i class="fa-solid fa-download"></i>
          </a>
          <button class="btn btn-sm btn-danger" onclick="deleteProjectFile(${f.id}, ${jsArg(f.fileName)})" title="刪除檔案">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function handleProjectFilesSelect(e) {
  const files = Array.from(e.target.files);
  if (!files || files.length === 0) return;

  projectStagedFiles = files;
  document.getElementById('selected-files-count').innerText = `已選擇 ${files.length} 個檔案`;

  const listEl = document.getElementById('selected-files-list');
  listEl.innerHTML = files.map(f => `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span><i class="fa-solid fa-file"></i> ${escapeHtml(f.name)}</span>
      <span style="color: #64748b;">${formatFileSize(f.size)}</span>
    </div>
  `).join('');

  document.getElementById('selected-files-preview').style.display = 'block';
}

async function uploadProjectFiles() {
  const projectId = document.getElementById('current-project-files-id').value;
  if (!projectId || projectStagedFiles.length === 0) {
    alert('請先選擇要上傳的檔案');
    return;
  }

  const btn = document.getElementById('btn-upload-project-files');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 上傳中...';

  const formData = new FormData();
  for (const file of projectStagedFiles) {
    formData.append('files', file);
  }

  try {
    const res = await fetch(`/api/projects/${projectId}/files`, {
      method: 'POST',
      body: formData
    });

    if (res.ok) {
      projectStagedFiles = [];
      document.getElementById('selected-files-preview').style.display = 'none';
      document.getElementById('project-files-input').value = '';
      
      // Reload project files
      const pRes = await fetch(`/api/projects/${projectId}`);
      const pData = await pRes.json();
      document.getElementById('project-files-total-badge').innerText = pData.files ? pData.files.length : 0;
      renderAttachedFilesList(pData.files || []);
      loadProjects();
    } else {
      const errMsg = await parseErrorMessage(res, '上傳失敗');
      alert(`檔案上傳失敗：${errMsg}`);
    }
  } catch (err) {
    alert(`上傳檔案時發生網路錯誤：${err.message || err}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-arrow-up-from-bracket"></i> 開始上傳';
  }
}

async function deleteProjectFile(fileId, fileName) {
  if (!confirm(`確定要刪除檔案「${fileName}」嗎？`)) return;

  const projectId = document.getElementById('current-project-files-id').value;
  try {
    const res = await fetch(`/api/projects/files/${fileId}`, { method: 'DELETE' });
    if (res.ok) {
      const pRes = await fetch(`/api/projects/${projectId}`);
      const pData = await pRes.json();
      document.getElementById('project-files-total-badge').innerText = pData.files ? pData.files.length : 0;
      renderAttachedFilesList(pData.files || []);
      loadProjects();
    } else {
      alert('刪除檔案失敗');
    }
  } catch (err) {
    alert('刪除檔案時發生錯誤：' + err);
  }
}

// ==================== 3. 工作行程 / 保養安裝維修工單 (WORKLOGS) ====================
function getWorkTypeBadgeHtml(workType) {
  const type = workType || '保養';
  if (type === '保養') {
    return '<span class="badge badge-worktype-maint"><i class="fa-solid fa-wrench"></i> 保養</span>';
  } else if (type === '安裝') {
    return '<span class="badge badge-worktype-inst"><i class="fa-solid fa-box"></i> 安裝</span>';
  } else if (type === '維修') {
    return '<span class="badge badge-worktype-repair"><i class="fa-solid fa-screwdriver-wrench"></i> 維修</span>';
  }
  return `<span class="badge badge-worktype-other"><i class="fa-solid fa-list-check"></i> ${escapeHtml(type)}</span>`;
}

function handleWorkTypeChange(val) {
  const inputEl = document.getElementById('worklog-type');
  if (inputEl) inputEl.value = val;
}

async function loadWorkLogs() {
  const search = document.getElementById('worklog-search') ? document.getElementById('worklog-search').value : '';
  const typeFilter = document.getElementById('worklog-type-filter') ? document.getElementById('worklog-type-filter').value : '';
  const statusFilter = document.getElementById('worklog-status-filter') ? document.getElementById('worklog-status-filter').value : 'incomplete';

  let url = `/api/worklogs?search=${encodeURIComponent(search || '')}&workType=${encodeURIComponent(typeFilter || '')}`;
  
  if (statusFilter === 'incomplete') {
    url += '&hideCompleted=true';
  } else if (statusFilter === 'all') {
    url += '&showAll=true';
  } else if (statusFilter) {
    url += `&status=${encodeURIComponent(statusFilter)}`;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    const listEl = document.getElementById('worklogs-list');
    if (!listEl) return;

    if (data.length === 0) {
      listEl.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">目前尚無符合條件的行程工單（已完成與取消預設隱藏）</p>';
      return;
    }

    listEl.innerHTML = data.map(w => `
      <div class="list-item-card ${w.isPriority ? 'is-priority' : ''}">
        <div class="list-item-top">
          <div class="list-item-info">
            <div class="list-item-title" style="flex-wrap: wrap; gap: 6px;">
              ${getWorkTypeBadgeHtml(w.workType)}
              ${w.isPriority ? '<span class="badge badge-priority"><i class="fa-solid fa-star"></i> 優先處理 (*)</span>' : ''}
              <span style="font-size: 16px; font-weight: 800;">${escapeHtml(w.title)}</span>
              <span class="badge ${getStatusBadgeClass(w.status)}">${escapeHtml(w.status)}</span>
              ${w.projectName ? `<span style="font-size: 12px; color: var(--primary); font-weight: 700;">[案場: ${escapeHtml(w.projectName)}]</span>` : ''}
              ${w.customerCategory ? `<span class="badge ${getCategoryBadgeClass(w.customerCategory)}">${escapeHtml(w.customerCategory)}</span>` : ''}
            </div>
            <div class="list-item-sub">
              <span><i class="fa-solid fa-user"></i> <b>${escapeHtml(w.customerName)}</b> ${w.customerPhone ? '(' + escapeHtml(w.customerPhone) + ')' : ''}</span>
              <span><i class="fa-regular fa-clock"></i> 預定: ${formatDateTime(w.scheduledAt)}</span>
              ${w.location ? `<span><i class="fa-solid fa-location-dot" style="color: #ea580c;"></i> ${escapeHtml(w.location)}</span>` : ''}
              ${w.statusUpdatedAt ? `<span class="status-time-tag"><i class="fa-solid fa-clock-rotate-left"></i> 狀態更新: ${formatDateTime(w.statusUpdatedAt)}</span>` : ''}
            </div>
            ${w.details ? `<div style="font-size: 13.5px; color: #334155; margin-top: 8px; white-space: pre-line; background: #f8fafc; border-left: 3px solid #3b82f6; padding: 8px 12px; border-radius: 4px;"><i class="fa-regular fa-note-sticky"></i> <b>施工說明/檢修備註：</b>\n${escapeHtml(w.details)}</div>` : ''}
          </div>
          <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap; justify-content: flex-end;">
            <button class="btn btn-sm btn-gcal" onclick="addToGoogleCalendar(${w.id})" title="一鍵加入個人 Google 日曆"><i class="fa-brands fa-google"></i> Google 日曆</button>
            <select class="select-input" style="padding: 4px 8px; font-size: 12.5px; font-weight: 600;" onchange="changeWorkLogStatus(${w.id}, this.value)">
              <option value="待處理" ${w.status === '待處理' ? 'selected' : ''}>待處理</option>
              <option value="進行中" ${w.status === '進行中' ? 'selected' : ''}>進行中</option>
              <option value="已完成" ${w.status === '已完成' ? 'selected' : ''}>已完成</option>
              <option value="已取消" ${w.status === '已取消' ? 'selected' : ''}>已取消</option>
            </select>
            <button class="btn btn-sm btn-secondary" onclick="editWorkLog(${w.id})" title="編輯行程"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-sm btn-danger" onclick="deleteWorkLog(${w.id})" title="刪除"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading worklogs:', err);
  }
}

async function changeWorkLogStatus(id, newStatus) {
  try {
    const res = await fetch(`/api/worklogs/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      loadWorkLogs();
      loadDashboard();
      if (currentHistoryCustomerId) {
        viewCustomerHistory(currentHistoryCustomerId);
      }
    }
  } catch (err) {
    console.error('Error updating status:', err);
  }
}

function openWorkLogModal(id = null, preSelectCustomerId = null, preSelectProjectId = null, defaultWorkType = '保養') {
  document.getElementById('worklog-id').value = id || '';
  document.getElementById('modal-worklog-title').innerHTML = id ? '<i class="fa-solid fa-pen-to-square" style="color: var(--primary);"></i> 編輯工作行程 / 保修工單' : '<i class="fa-solid fa-calendar-plus" style="color: var(--primary);"></i> 排定工作行程 / 保修工單';
  populateCustomerDropdowns();

  const customerSelect = document.getElementById('worklog-customer');
  const lockedHint = document.getElementById('worklog-customer-locked-hint');

  if (preSelectCustomerId) {
    customerSelect.value = preSelectCustomerId;
    customerSelect.disabled = true;
    if (lockedHint) lockedHint.style.display = 'inline';
    filterWorkLogProjects();
  } else {
    customerSelect.disabled = false;
    if (lockedHint) lockedHint.style.display = 'none';
    if (!id) customerSelect.value = '';
  }

  if (preSelectProjectId) {
    const projSelect = document.getElementById('worklog-project');
    if (projSelect) projSelect.value = preSelectProjectId;
  }

  const selectedType = defaultWorkType || '保養';
  const typeInput = document.getElementById('worklog-type');
  if (typeInput) typeInput.value = selectedType;

  const radios = document.getElementsByName('worklog-type-radio');
  for (const r of radios) {
    r.checked = (r.value === selectedType);
  }

  if (!id) {
    document.getElementById('worklog-title-input').value = '';
    const nowIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    document.getElementById('worklog-time').value = nowIso;
    document.getElementById('worklog-location').value = '';
    document.getElementById('worklog-status').value = '待處理';
    document.getElementById('worklog-is-priority').checked = false;
    document.getElementById('worklog-details').value = '';
    if (!preSelectProjectId) {
      const projSelect = document.getElementById('worklog-project');
      if (projSelect) projSelect.value = '';
    }
  }
  openModal('modal-worklog');
}

async function editWorkLog(id) {
  const res = await fetch(`/api/worklogs/${id}`);
  if (!res.ok) return;
  const w = await res.json();

  document.getElementById('worklog-id').value = w.id;
  document.getElementById('modal-worklog-title').innerHTML = '<i class="fa-solid fa-pen-to-square" style="color: var(--primary);"></i> 編輯工作行程 / 保修工單';
  populateCustomerDropdowns();

  const customerSelect = document.getElementById('worklog-customer');
  customerSelect.disabled = false;
  customerSelect.value = w.customerId || '';
  const lockedHint = document.getElementById('worklog-customer-locked-hint');
  if (lockedHint) lockedHint.style.display = 'none';

  filterWorkLogProjects();
  const projSelect = document.getElementById('worklog-project');
  if (projSelect) projSelect.value = w.projectId || '';

  const wType = w.workType || '保養';
  const typeInput = document.getElementById('worklog-type');
  if (typeInput) typeInput.value = wType;

  const radios = document.getElementsByName('worklog-type-radio');
  for (const r of radios) {
    r.checked = (r.value === wType);
  }

  document.getElementById('worklog-title-input').value = w.title || '';
  document.getElementById('worklog-time').value = w.scheduledAt ? toLocalInputValue(w.scheduledAt, true) : '';
  document.getElementById('worklog-location').value = w.location || '';
  document.getElementById('worklog-status').value = w.status || '待處理';
  document.getElementById('worklog-is-priority').checked = !!w.isPriority;
  document.getElementById('worklog-details').value = w.details || '';

  openModal('modal-worklog');
}

async function saveWorkLog() {
  const id = document.getElementById('worklog-id').value;
  const workType = document.getElementById('worklog-type') ? document.getElementById('worklog-type').value : '保養';
  const title = document.getElementById('worklog-title-input').value.trim();
  const scheduledAt = document.getElementById('worklog-time').value;
  const customerIdVal = document.getElementById('worklog-customer').value;
  const projectIdVal = document.getElementById('worklog-project') ? document.getElementById('worklog-project').value : null;

  if (!title) {
    alert('請填寫工作標題');
    return;
  }

  const payload = {
    id: id ? parseInt(id) : 0,
    customerId: customerIdVal ? parseInt(customerIdVal) : null,
    projectId: projectIdVal ? parseInt(projectIdVal) : null,
    workType: workType || '保養',
    title,
    scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : new Date().toISOString(),
    location: document.getElementById('worklog-location').value.trim(),
    status: document.getElementById('worklog-status').value || '待處理',
    isPriority: document.getElementById('worklog-is-priority').checked,
    details: document.getElementById('worklog-details').value.trim()
  };

  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/worklogs/${id}` : '/api/worklogs';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      closeModal('modal-worklog');
      loadWorkLogs();
      loadDashboard();
      if (currentHistoryCustomerId) {
        viewCustomerHistory(currentHistoryCustomerId);
      }
    } else {
      const errMsg = await parseErrorMessage(res, '請檢查輸入欄位');
      alert(`儲存行程失敗：${errMsg}`);
    }
  } catch (err) {
    alert(`儲存行程時發生網路錯誤：${err.message || err}`);
  }
}

async function deleteWorkLog(id) {
  if (!confirm('確定要刪除此工作記錄嗎？')) return;
  const res = await fetch(`/api/worklogs/${id}`, { method: 'DELETE' });
  if (res.ok) {
    loadWorkLogs();
    loadDashboard();
    if (currentHistoryCustomerId) {
      viewCustomerHistory(currentHistoryCustomerId);
    }
  }
}

// ==================== 📋 客戶保修紀錄歷程 (CUSTOMER SERVICE HISTORY) ====================
let currentHistoryCustomerId = null;

async function viewCustomerHistory(customerId) {
  currentHistoryCustomerId = customerId;
  const customer = customersCache.find(c => c.id === customerId);
  const custName = customer ? customer.name : '客戶';
  const custPhone = customer ? customer.phone : '';
  const custCategory = customer ? customer.category : '';
  const custAddress = customer ? customer.address : '';

  document.getElementById('customer-history-title').innerHTML = `
    <i class="fa-solid fa-clipboard-list" style="color: var(--primary);"></i> 
    <b>${escapeHtml(custName)}</b> 的保修歷史紀錄歷程
    ${custCategory ? `<span class="badge ${getCategoryBadgeClass(custCategory)}">${escapeHtml(custCategory)}</span>` : ''}
  `;
  document.getElementById('customer-history-subtitle').innerHTML = `
    <span><i class="fa-solid fa-phone"></i> ${escapeHtml(custPhone || '無電話')}</span>
    ${custAddress ? `<span style="margin-left: 12px;"><i class="fa-solid fa-location-dot" style="color: #ea580c;"></i> ${escapeHtml(custAddress)}</span>` : ''}
  `;

  const timelineEl = document.getElementById('customer-history-timeline');
  timelineEl.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 24px;"><i class="fa-solid fa-spinner fa-spin"></i> 載入保修歷史紀錄中...</p>';

  openModal('modal-customer-history');

  try {
    const res = await fetch(`/api/worklogs/customer/${customerId}`);
    if (!res.ok) {
      timelineEl.innerHTML = '<p style="color: var(--danger); text-align: center; padding: 24px;">載入歷史紀錄失敗</p>';
      return;
    }
    const list = await res.json();

    let maintCount = 0, instCount = 0, repairCount = 0;
    list.forEach(item => {
      const type = item.workType || '保養';
      if (type === '保養') maintCount++;
      else if (type === '安裝') instCount++;
      else if (type === '維修') repairCount++;
    });

    document.getElementById('hist-count-total').innerText = list.length;
    document.getElementById('hist-count-maint').innerText = maintCount;
    document.getElementById('hist-count-inst').innerText = instCount;
    document.getElementById('hist-count-repair').innerText = repairCount;

    if (list.length === 0) {
      timelineEl.innerHTML = `
        <div style="text-align: center; padding: 36px 20px; color: var(--text-muted);">
          <i class="fa-solid fa-clipboard-check" style="font-size: 36px; color: #cbd5e1; margin-bottom: 8px;"></i>
          <p style="font-size: 14.5px; font-weight: 600; color: #64748b;">此客戶目前尚無保養、安裝或維修紀錄</p>
          <div style="display: flex; gap: 8px; justify-content: center; margin-top: 14px; flex-wrap: wrap;">
            <button class="btn btn-sm btn-action-maint" onclick="quickAddServiceFromHistory('保養')"><i class="fa-solid fa-plus"></i> 新增保養紀錄</button>
            <button class="btn btn-sm btn-action-inst" onclick="quickAddServiceFromHistory('安裝')"><i class="fa-solid fa-plus"></i> 新增安裝紀錄</button>
            <button class="btn btn-sm btn-action-repair" onclick="quickAddServiceFromHistory('維修')"><i class="fa-solid fa-plus"></i> 新增維修紀錄</button>
          </div>
        </div>
      `;
      return;
    }

    timelineEl.innerHTML = list.map(item => {
      const type = item.workType || '保養';
      let itemClass = 'item-other';
      if (type === '保養') itemClass = 'item-maint';
      else if (type === '安裝') itemClass = 'item-inst';
      else if (type === '維修') itemClass = 'item-repair';

      return `
        <div class="history-timeline-item ${itemClass}">
          <div class="history-item-top">
            <div class="history-item-title">
              ${getWorkTypeBadgeHtml(type)}
              <span>${escapeHtml(item.title)}</span>
              <span class="badge ${getStatusBadgeClass(item.status)}">${escapeHtml(item.status)}</span>
              ${item.isPriority ? '<span class="badge badge-priority"><i class="fa-solid fa-star"></i> 優先</span>' : ''}
              ${item.projectName ? `<span style="font-size: 12px; color: var(--primary); font-weight: 700;">[案場: ${escapeHtml(item.projectName)}]</span>` : ''}
            </div>
            <div class="history-item-date">
              <i class="fa-regular fa-calendar-days"></i> ${formatDateTime(item.scheduledAt)}
            </div>
          </div>
          ${item.location ? `<div style="font-size: 12.5px; color: #64748b;"><i class="fa-solid fa-location-dot" style="color: #ea580c;"></i> 地點: ${escapeHtml(item.location)}</div>` : ''}
          ${item.details ? `<div class="history-item-body"><i class="fa-regular fa-note-sticky"></i> <b>施作說明/檢修備註：</b>\n${escapeHtml(item.details)}</div>` : ''}
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; font-size: 12px; color: var(--text-muted); flex-wrap: wrap; gap: 6px;">
            <span>${item.statusUpdatedAt ? `狀態更新: ${formatDateTime(item.statusUpdatedAt)}` : `建立時間: ${formatDateTime(item.createdAt)}`}</span>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-sm btn-secondary" onclick="editWorkLog(${item.id})" title="編輯此紀錄"><i class="fa-solid fa-pen"></i></button>
              <button class="btn btn-sm btn-gcal" onclick="addToGoogleCalendar(${item.id})" title="加到 Google 日曆"><i class="fa-brands fa-google"></i> 日曆</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    timelineEl.innerHTML = `<p style="color: var(--danger); text-align: center; padding: 24px;">載入歷史紀錄發生錯誤：${escapeHtml(err)}</p>`;
  }
}

function quickAddServiceFromHistory(workType) {
  if (!currentHistoryCustomerId) return;
  openWorkLogModal(null, currentHistoryCustomerId, null, workType);
}

// ==================== 5. 收費紀錄 (PAYMENTS) ====================
async function loadPayments() {
  const search = document.getElementById('payment-search').value;
  const status = document.getElementById('payment-status-filter').value;
  try {
    const res = await fetch(`/api/payments?search=${encodeURIComponent(search || '')}&status=${encodeURIComponent(status || '')}`);
    if (!res.ok) return;
    const data = await res.json();
    const listEl = document.getElementById('payments-list');

    if (data.length === 0) {
      listEl.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">尚無收費記錄，點擊「單獨新增收費」或從客戶/報價單轉入</p>';
      return;
    }

    listEl.innerHTML = data.map(p => `
      <div class="list-item-card">
        <div class="list-item-top">
          <div class="list-item-info">
            <div class="list-item-title">
              <i class="fa-solid fa-wallet" style="color: var(--success);"></i>
              <span style="font-size: 16.5px; font-weight: 800;">${escapeHtml(p.title)}</span>
              <span style="color: var(--success); font-size: 18px; font-weight: 800; margin-left: 4px;">+${formatCurrency(p.amount)}</span>
              <span class="badge ${p.status === '已收款' ? 'badge-success' : 'badge-warning'}">${escapeHtml(p.status)}</span>
              ${p.quotationNumber ? `<span class="badge badge-info" style="font-size: 11px;"><i class="fa-solid fa-file-invoice"></i> 來自報價單 ${escapeHtml(p.quotationNumber)}</span>` : (!p.customerId ? '<span class="badge badge-gray" style="font-size: 11px;"><i class="fa-solid fa-store"></i> 散客 / 現場購買</span>' : '<span class="badge badge-gray" style="font-size: 11px;">單一產品收費</span>')}
            </div>
            <div class="list-item-sub">
              <span><i class="fa-solid fa-user"></i> <b>${escapeHtml(p.customerName)}</b></span>
              <span><i class="fa-solid fa-money-bill-transfer" style="color: #64748b;"></i> ${escapeHtml(p.paymentMethod)}</span>
              <span><i class="fa-regular fa-calendar"></i> ${formatDate(p.paymentDate)}</span>
              ${p.invoiceNumber ? `<span><i class="fa-solid fa-receipt"></i> 發票: <b>${escapeHtml(p.invoiceNumber)}</b></span>` : ''}
              ${p.hasInvoiceImage ? `<span class="invoice-attachment-tag" onclick="viewPaymentInvoiceImage(${p.id})"><i class="fa-solid fa-image"></i> 檢視發票相片</span>` : ''}
            </div>
            ${p.notes ? `<div style="font-size: 13px; color: #64748b; margin-top: 4px;"><i class="fa-regular fa-comment-dots"></i> 備註: ${escapeHtml(p.notes)}</div>` : ''}
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm btn-secondary" onclick="editPayment(${p.id})"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-sm btn-danger" onclick="deletePayment(${p.id})"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading payments:', err);
  }
}

function openPaymentModal(id = null, preSelectCustomerId = null, preSelectProjectId = null) {
  document.getElementById('payment-id').value = id || '';
  document.getElementById('modal-payment-title').innerHTML = id ? '<i class="fa-solid fa-pen-to-square" style="color: var(--success);"></i> 編輯收費紀錄' : '<i class="fa-solid fa-plus" style="color: var(--success);"></i> 新增收費紀錄 (購買單一產品/收款)';
  populateCustomerDropdowns();

  const customerSelect = document.getElementById('payment-customer');
  const lockedInput = document.getElementById('payment-locked-customer-id');
  const lockedHint = document.getElementById('payment-customer-locked-hint');
  const optionalHint = document.getElementById('payment-customer-optional-hint');

  if (preSelectCustomerId) {
    customerSelect.value = preSelectCustomerId;
    customerSelect.disabled = true;
    lockedInput.value = preSelectCustomerId;
    if (lockedHint) lockedHint.style.display = 'inline';
    if (optionalHint) optionalHint.style.display = 'none';
    filterPaymentProjects();
  } else {
    customerSelect.disabled = false;
    lockedInput.value = '';
    if (lockedHint) lockedHint.style.display = 'none';
    if (optionalHint) optionalHint.style.display = 'inline';
    if (!id) customerSelect.value = '';
  }

  if (preSelectProjectId) {
    const projSelect = document.getElementById('payment-project');
    if (projSelect) projSelect.value = preSelectProjectId;
  } else if (!id) {
    const projSelect = document.getElementById('payment-project');
    if (projSelect) projSelect.value = '';
  }

  clearInvoiceImage();

  if (!id) {
    document.getElementById('payment-title-input').value = '';
    document.getElementById('payment-amount').value = '5000';
    document.getElementById('payment-date').value = toLocalInputValue(null, false);
    document.getElementById('payment-method').value = '現金';
    document.getElementById('payment-status').value = '已收款';
    document.getElementById('payment-invoice').value = '';
    document.getElementById('payment-notes').value = '';
  }
  openModal('modal-payment');
}

async function editPayment(id) {
  const res = await fetch(`/api/payments/${id}`);
  if (!res.ok) return;
  const p = await res.json();

  document.getElementById('payment-id').value = p.id;
  document.getElementById('modal-payment-title').innerHTML = '<i class="fa-solid fa-pen-to-square" style="color: var(--success);"></i> 編輯收費紀錄';
  populateCustomerDropdowns();

  const customerSelect = document.getElementById('payment-customer');
  customerSelect.disabled = false;
  customerSelect.value = p.customerId || '';
  document.getElementById('payment-locked-customer-id').value = '';
  
  const lockedHint = document.getElementById('payment-customer-locked-hint');
  const optionalHint = document.getElementById('payment-customer-optional-hint');
  if (lockedHint) lockedHint.style.display = 'none';
  if (optionalHint) optionalHint.style.display = 'inline';

  filterPaymentProjects();
  const projSelect = document.getElementById('payment-project');
  if (projSelect) projSelect.value = p.projectId || '';

  document.getElementById('payment-title-input').value = p.title || '';
  document.getElementById('payment-amount').value = p.amount;
  document.getElementById('payment-date').value = p.paymentDate ? toLocalInputValue(p.paymentDate, false) : '';
  document.getElementById('payment-method').value = p.paymentMethod || '現金';
  document.getElementById('payment-status').value = p.status || '已收款';
  document.getElementById('payment-invoice').value = p.invoiceNumber || '';
  document.getElementById('payment-notes').value = p.notes || '';

  if (p.invoiceImageUrl) {
    document.getElementById('payment-invoice-image').value = p.invoiceImageUrl;
    document.getElementById('invoice-preview-thumb').src = p.invoiceImageUrl;
    document.getElementById('invoice-preview-card').style.display = 'block';
    document.getElementById('invoice-scan-badge').className = 'badge badge-success';
    document.getElementById('invoice-scan-badge').innerHTML = '<i class="fa-solid fa-image"></i> 已附加相片';
    document.getElementById('invoice-scan-message').innerText = p.invoiceNumber ? `發票號碼: ${p.invoiceNumber}` : '發票相片已附加';
    document.getElementById('invoice-scan-sub').innerText = '點擊縮圖可放大檢視發票';
  } else {
    clearInvoiceImage();
  }

  openModal('modal-payment');
}

async function savePayment() {
  const id = document.getElementById('payment-id').value;
  const lockedId = document.getElementById('payment-locked-customer-id').value;
  const customerIdVal = lockedId || document.getElementById('payment-customer').value;
  const projectIdVal = document.getElementById('payment-project') ? document.getElementById('payment-project').value : null;
  const title = document.getElementById('payment-title-input').value.trim();
  const amount = parseFloat(document.getElementById('payment-amount').value);

  if (!title) {
    alert('請填寫收費項目說明 (如: 購買產品A / 現場收款)！');
    return;
  }
  if (isNaN(amount) || amount < 0) {
    alert('請填寫有效的收費金額！');
    return;
  }

  const paymentDateVal = document.getElementById('payment-date').value;
  const payload = {
    id: id ? parseInt(id) : 0,
    customerId: customerIdVal ? parseInt(customerIdVal) : null,
    projectId: projectIdVal ? parseInt(projectIdVal) : null,
    title,
    amount,
    paymentDate: paymentDateVal ? new Date(paymentDateVal).toISOString() : new Date().toISOString(),
    paymentMethod: document.getElementById('payment-method').value,
    status: document.getElementById('payment-status').value,
    invoiceNumber: document.getElementById('payment-invoice').value.trim(),
    invoiceImageUrl: document.getElementById('payment-invoice-image').value || null,
    notes: document.getElementById('payment-notes').value.trim()
  };

  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/payments/${id}` : '/api/payments';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      closeModal('modal-payment');
      loadPayments();
      loadDashboard();
    } else {
      const errMsg = await parseErrorMessage(res, '請檢查各欄位填寫');
      alert(`儲存收費紀錄失敗：${errMsg}`);
    }
  } catch (err) {
    alert(`儲存收費紀錄時發生網路錯誤：${err.message || err}`);
  }
}

// ==================== 智慧發票拍照 / 條碼辨識 (INVOICE OCR & SCANNING) ====================
async function handleInvoiceUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const loadingEl = document.getElementById('invoice-scan-loading');
  const previewCard = document.getElementById('invoice-preview-card');
  const thumbImg = document.getElementById('invoice-preview-thumb');
  const badgeEl = document.getElementById('invoice-scan-badge');
  const msgEl = document.getElementById('invoice-scan-message');
  const subEl = document.getElementById('invoice-scan-sub');
  const invoiceInput = document.getElementById('payment-invoice');
  const imageInput = document.getElementById('payment-invoice-image');

  loadingEl.style.display = 'flex';
  previewCard.style.display = 'none';

  try {
    // 1. 讀取並壓縮優化相片為 Base64
    const { dataUrl, imageElement } = await readAndOptimizeImage(file);
    imageInput.value = dataUrl;
    thumbImg.src = dataUrl;

    // 2. 進行電子發票條碼 / QR Code 解碼
    const scanResult = await scanInvoiceCode(imageElement);

    loadingEl.style.display = 'none';
    previewCard.style.display = 'block';

    if (scanResult && scanResult.invoiceNumber) {
      invoiceInput.value = scanResult.invoiceNumber;
      badgeEl.className = 'badge badge-success';
      badgeEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> 辨識成功';
      msgEl.innerHTML = `發票號碼：<b style="color: var(--primary);">${escapeHtml(scanResult.invoiceNumber)}</b>`;

      let details = [];
      if (scanResult.amount) {
        details.push(`發票金額: $${scanResult.amount.toLocaleString('zh-TW')}`);
        const curAmt = parseFloat(document.getElementById('payment-amount').value);
        if (!curAmt || curAmt === 5000) {
          document.getElementById('payment-amount').value = scanResult.amount;
        }
      }
      if (scanResult.dateStr) {
        details.push(`發票日期: ${escapeHtml(scanResult.dateStr)}`);
        document.getElementById('payment-date').value = scanResult.dateStr;
      }
      subEl.innerText = details.length > 0 ? details.join(' ｜ ') : '已自動填入發票號碼，點擊縮圖可放大檢視';
    } else {
      badgeEl.className = 'badge badge-warning';
      badgeEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> 照片已載入';
      msgEl.innerText = '未能自動辨識出條碼，請手動輸入發票號碼';
      subEl.innerText = '發票相片已成功附加至此筆紀錄';
    }
  } catch (err) {
    console.error('Invoice scan error:', err);
    loadingEl.style.display = 'none';
    previewCard.style.display = 'block';
    badgeEl.className = 'badge badge-warning';
    badgeEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> 照片已附加';
    msgEl.innerText = '辨識時發生狀況，請手動填寫號碼';
    subEl.innerText = '發票相片已成功保存';
  } finally {
    event.target.value = '';
  }
}

function clearInvoiceImage() {
  document.getElementById('payment-invoice-image').value = '';
  document.getElementById('invoice-preview-thumb').src = '';
  document.getElementById('invoice-preview-card').style.display = 'none';
  const fileInput = document.getElementById('invoice-file-input');
  if (fileInput) fileInput.value = '';
}

// 列表不含發票相片（體積大），點擊時才向伺服器取得
async function viewPaymentInvoiceImage(id) {
  try {
    const res = await fetch(`/api/payments/${id}`);
    if (!res.ok) {
      alert('無法載入發票相片');
      return;
    }
    const p = await res.json();
    viewLargeImage(p.invoiceImageUrl);
  } catch (err) {
    alert('載入發票相片時發生網路錯誤');
  }
}

function viewLargeImage(src) {
  if (!src) return;
  document.getElementById('image-viewer-src').src = src;
  openModal('modal-image-viewer');
}

// 壓縮相片至適合傳輸與辨識的尺寸 (最大寬高 1200px)
function readAndOptimizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1200;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

        const optimizedImg = new Image();
        optimizedImg.onload = () => resolve({ dataUrl, imageElement: optimizedImg });
        optimizedImg.src = dataUrl;
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 多引擎辨識發票條碼與 QR Code (Native BarcodeDetector -> jsQR -> ZXing)
async function scanInvoiceCode(imageElement) {
  const canvas = document.createElement('canvas');
  canvas.width = imageElement.naturalWidth || imageElement.width;
  canvas.height = imageElement.naturalHeight || imageElement.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageElement, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  let rawCode = null;

  // 1. 優先使用現代瀏覽器原生 BarcodeDetector API
  if ('BarcodeDetector' in window) {
    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8'] });
      const barcodes = await detector.detect(imageElement);
      if (barcodes && barcodes.length > 0) {
        for (const b of barcodes) {
          if (b.rawValue) {
            const parsed = parseTaiwanInvoiceText(b.rawValue);
            if (parsed.invoiceNumber) return parsed;
            rawCode = b.rawValue;
          }
        }
      }
    } catch (e) {
      console.log('Native BarcodeDetector info:', e);
    }
  }

  // 2. 使用 jsQR 引擎解析台灣電子發票左側 QR Code
  if (typeof jsQR !== 'undefined') {
    try {
      const qr = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });
      if (qr && qr.data) {
        const parsed = parseTaiwanInvoiceText(qr.data);
        if (parsed.invoiceNumber) return parsed;
        rawCode = qr.data;
      }
    } catch (e) {
      console.log('jsQR pass:', e);
    }
  }

  // 3. 使用 ZXing 引擎解析 1D 發票條碼 (Code 39 / Code 128)
  if (typeof ZXing !== 'undefined') {
    try {
      const reader = new ZXing.BrowserMultiFormatReader();
      const result = await reader.decodeFromImageElement(imageElement);
      if (result && result.getText()) {
        const parsed = parseTaiwanInvoiceText(result.getText());
        if (parsed.invoiceNumber) return parsed;
        rawCode = result.getText();
      }
    } catch (e) {
      // Normal when no 1D barcode
    }
  }

  if (rawCode) {
    return parseTaiwanInvoiceText(rawCode);
  }

  return null;
}

// 解析台灣統一發票 / 電子發票標準格式
function parseTaiwanInvoiceText(text) {
  if (!text) return {};
  const cleaned = text.trim();

  // 1. 台灣電子發票左側 QR Code 標準格式 (前10碼為發票字軌號碼，接著7碼民國日期，接著金額)
  const qrMatch = cleaned.match(/^([A-Z]{2})(\d{8})(\d{7})([0-9a-zA-Z]{4})([0-9a-fA-F]{8})([0-9a-fA-F]{8})/);
  if (qrMatch) {
    const invPrefix = qrMatch[1];
    const invDigits = qrMatch[2];
    const rocDate = qrMatch[3]; // 例: "1130904"
    const totalHex = qrMatch[6];

    const invoiceNumber = `${invPrefix}-${invDigits}`;
    let amount = parseInt(totalHex, 16);
    if (isNaN(amount) || amount === 0) {
      amount = parseInt(totalHex, 10) || null;
    }

    let dateStr = null;
    if (rocDate && rocDate.length === 7) {
      const rocYear = parseInt(rocDate.substring(0, 3), 10);
      const ceYear = rocYear + 1911;
      const month = rocDate.substring(3, 5);
      const day = rocDate.substring(5, 7);
      dateStr = `${ceYear}-${month}-${day}`;
    }

    return {
      invoiceNumber,
      amount,
      dateStr,
      raw: text
    };
  }

  // 2. 台灣發票一維條碼格式 (19碼: 3碼民國年月 + 10碼發票號 + 4碼隨機碼)
  const barcodeMatch = cleaned.match(/^\d{3}(0[1-9]|1[0-2])([A-Z]{2})(\d{8})\d{4}$/);
  if (barcodeMatch) {
    return {
      invoiceNumber: `${barcodeMatch[2]}-${barcodeMatch[3]}`,
      raw: text
    };
  }

  // 3. 通用發票號碼正規式 (2英文字母 + 8碼數字)
  const generalMatch = cleaned.match(/([A-Z]{2})[- ]?(\d{8})/);
  if (generalMatch) {
    return {
      invoiceNumber: `${generalMatch[1]}-${generalMatch[2]}`,
      raw: text
    };
  }

  return { raw: text };
}

async function deletePayment(id) {
  if (!confirm('確定要刪除此收費記錄嗎？')) return;
  const res = await fetch(`/api/payments/${id}`, { method: 'DELETE' });
  if (res.ok) {
    loadPayments();
    loadDashboard();
  }
}

// Quick Payment
function openQuickPaymentModal() {
  populateCustomerDropdowns();
  openModal('modal-quick-payment');
}

async function saveQuickPayment() {
  const customerId = document.getElementById('quick-payment-customer').value;
  const title = document.getElementById('quick-payment-title').value.trim();
  const amount = parseFloat(document.getElementById('quick-payment-amount').value);

  if (!title) {
    alert('請輸入項目說明！');
    return;
  }

  const payload = {
    customerId: customerId ? parseInt(customerId) : null,
    title,
    amount: isNaN(amount) ? 5000 : amount,
    paymentDate: new Date().toISOString(),
    paymentMethod: '現金',
    status: '已收款'
  };

  const res = await fetch('/api/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    closeModal('modal-quick-payment');
    loadPayments();
    loadDashboard();
    alert(`成功記錄收費 $${amount}！`);
  } else {
    alert('記帳失敗');
  }
}

// ==================== BADGE HELPERS ====================
function getCategoryBadgeClass(category) {
  if (category === '設計師') return 'badge-designer';
  if (category === '公司') return 'badge-company';
  if (category === '專案') return 'badge-project';
  if (category === '個人') return 'badge-personal';
  return 'badge-other';
}

function getStatusBadgeClass(status) {
  if (status === '已完成') return 'badge-success';
  if (status === '進行中') return 'badge-info';
  if (status === '待處理') return 'badge-warning';
  return 'badge-gray';
}

function getQuotationBadgeClass(status) {
  if (status === '客戶確認' || status === '已結案') return 'badge-success';
  if (status === '已發送') return 'badge-info';
  if (status === '草稿') return 'badge-gray';
  return 'badge-warning';
}

function getProjectStatusBadgeClass(status) {
  if (status === '已完工' || status === '已結案') return 'badge-success';
  if (status === '進行中') return 'badge-info';
  if (status === '待進場') return 'badge-warning';
  if (status === '暫停') return 'badge-danger';
  return 'badge-gray';
}

// ==================== 🔒 身份驗證與 Google 登入 (AUTHENTICATION) ====================
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user || data;
      applyAuthState(true);
      return true;
    } else {
      currentUser = null;
      applyAuthState(false);
      return false;
    }
  } catch (err) {
    console.error('Check auth error:', err);
    currentUser = null;
    applyAuthState(false);
    return false;
  }
}

function applyAuthState(isLoggedIn) {
  const loginOverlay = document.getElementById('view-login');
  const mainContainer = document.getElementById('app-main-container');
  const userProfileWidget = document.getElementById('user-profile-widget');
  const navItemUsers = document.getElementById('nav-item-users');
  const mobileNavItemUsers = document.getElementById('mobile-nav-item-users');

  if (isLoggedIn && currentUser) {
    if (loginOverlay) {
      loginOverlay.style.display = 'none';
      loginOverlay.classList.add('hidden-overlay');
    }
    if (mainContainer) mainContainer.style.display = 'flex';
    if (userProfileWidget) {
      userProfileWidget.style.display = 'flex';
      const nameEl = document.getElementById('user-display-name');
      if (nameEl) nameEl.textContent = currentUser.name || currentUser.email;
      
      const roleBadge = document.getElementById('user-display-role');
      if (roleBadge) {
        if (currentUser.role === 'Admin') {
          roleBadge.textContent = '👑 超級管理員';
          roleBadge.className = 'user-role-badge role-admin';
        } else {
          roleBadge.textContent = '👤 一般員工';
          roleBadge.className = 'user-role-badge';
        }
      }

      const avatarImg = document.getElementById('user-avatar-img');
      const avatarFallback = document.getElementById('user-avatar-fallback');
      if (avatarImg && avatarFallback) {
        if (currentUser.pictureUrl) {
          avatarImg.src = currentUser.pictureUrl;
          avatarImg.style.display = 'block';
          avatarFallback.style.display = 'none';
        } else {
          avatarImg.style.display = 'none';
          avatarFallback.style.display = 'flex';
          const initial = (currentUser.name && currentUser.name.trim().length > 0) ? currentUser.name.trim().charAt(0) : 'U';
          avatarFallback.innerHTML = `<span>${escapeHtml(initial)}</span>`;
        }
      }
    }

    if (currentUser.role === 'Admin') {
      if (navItemUsers) navItemUsers.style.display = 'flex';
      if (mobileNavItemUsers) mobileNavItemUsers.style.display = 'flex';
    } else {
      if (navItemUsers) navItemUsers.style.display = 'none';
      if (mobileNavItemUsers) mobileNavItemUsers.style.display = 'none';
    }
  } else {
    if (loginOverlay) {
      loginOverlay.classList.remove('hidden-overlay');
      loginOverlay.style.display = 'flex';
    }
    if (mainContainer) mainContainer.style.display = 'none';
    if (userProfileWidget) userProfileWidget.style.display = 'none';
    initGoogleLoginBtn();
  }
}

async function initGoogleLoginBtn() {
  const btnContainer = document.getElementById('google-login-btn-container');
  const promptContainer = document.getElementById('google-setup-prompt');

  try {
    const res = await fetch('/api/auth/config');
    if (!res.ok) return;
    const config = await res.json();

    if (!config.clientId) {
      if (promptContainer) promptContainer.style.display = 'block';
      if (btnContainer) btnContainer.style.display = 'none';
      return;
    }

    if (promptContainer) promptContainer.style.display = 'none';
    if (btnContainer) btnContainer.style.display = 'flex';

    // Wait for Google Identity Services script to be ready if needed
    const tryRender = (retries = 0) => {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        window.google.accounts.id.initialize({
          client_id: config.clientId,
          callback: handleGoogleCredentialResponse,
          auto_select: false
        });
        if (btnContainer) {
          btnContainer.innerHTML = '';
          window.google.accounts.id.renderButton(btnContainer, {
            theme: 'outline',
            size: 'large',
            type: 'standard',
            shape: 'pill',
            text: 'signin_with',
            logo_alignment: 'left',
            width: 320
          });
        }
      } else if (retries < 10) {
        setTimeout(() => tryRender(retries + 1), 300);
      }
    };

    tryRender();
  } catch (err) {
    console.error('Init Google GSI failed:', err);
  }
}

async function handleGoogleCredentialResponse(response) {
  const errorAlert = document.getElementById('login-error-alert');
  const errorText = document.getElementById('login-error-text');
  if (errorAlert) errorAlert.style.display = 'none';

  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential })
    });

    if (res.ok) {
      const data = await res.json();
      currentUser = data.user || data;
      applyAuthState(true);
      loadDashboard();
      loadCustomers();
      loadProjects();
    } else {
      const msg = await parseErrorMessage(res, '此 Google 帳號未獲得系統授權，無法存取！');
      if (errorAlert && errorText) {
        errorText.textContent = msg;
        errorAlert.style.display = 'flex';
      } else {
        alert(msg);
      }
    }
  } catch (err) {
    if (errorAlert && errorText) {
      errorText.textContent = '登入連線失敗：' + err;
      errorAlert.style.display = 'flex';
    }
  }
}

async function handleLogout() {
  if (!confirm('確定要登出永倉管理系統嗎？')) return;
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {}
  currentUser = null;
  applyAuthState(false);
  window.location.reload();
}

// ==================== 📅 GOOGLE 日曆連動與 ICAL 匯出 ====================
async function addToGoogleCalendar(workLogId) {
  try {
    const res = await fetch(`/api/worklogs/${workLogId}`);
    if (!res.ok) {
      alert('無法取得工作行程資訊');
      return;
    }
    const w = await res.json();

    const startDate = new Date(w.scheduledAt || Date.now());
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 預設 1 小時

    const formatGCalTime = (d) => {
      return d.toISOString().replace(/-|:|\.\d+/g, '');
    };

    const dates = `${formatGCalTime(startDate)}/${formatGCalTime(endDate)}`;
    const title = encodeURIComponent(`[永倉] ${w.title}${w.customerName ? ' - ' + w.customerName : ''}`);
    const location = encodeURIComponent(w.location || '');
    
    let detailsText = `【工作項目】${w.title}\n`;
    if (w.customerName) detailsText += `【客戶姓名】${w.customerName} ${w.customerPhone ? '(' + w.customerPhone + ')' : ''}\n`;
    if (w.details) detailsText += `【行程備註】\n${w.details}\n`;
    detailsText += `\n來自永倉管理系統`;
    const details = encodeURIComponent(detailsText);

    const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}&sf=true&output=xml`;
    window.open(gcalUrl, '_blank');
  } catch (err) {
    alert('產生 Google 日曆連結時發生錯誤：' + err);
  }
}

function exportWorkLogsCalendar() {
  window.open('/api/worklogs/calendar.ics', '_blank');
}

// ==================== 👑 帳號授權白名單管理 (USER MANAGEMENT) ====================
async function loadUsers() {
  const listEl = document.getElementById('users-list');
  if (!listEl) return;

  const search = (document.getElementById('user-search')?.value || '').toLowerCase().trim();
  const roleFilter = document.getElementById('user-role-filter')?.value || '';
  const statusFilter = document.getElementById('user-status-filter')?.value || '';

  try {
    const res = await fetch('/api/users');
    if (res.status === 403) {
      listEl.innerHTML = '<p style="color: var(--danger); text-align: center; padding: 40px;"><i class="fa-solid fa-lock"></i> 只有超級管理者有權限管理使用者清單</p>';
      return;
    }
    if (!res.ok) {
      listEl.innerHTML = '<p style="color: var(--danger); text-align: center; padding: 40px;">載入使用者失敗</p>';
      return;
    }

    let users = await res.json();

    if (search) {
      users = users.filter(u => 
        (u.name && u.name.toLowerCase().includes(search)) ||
        (u.email && u.email.toLowerCase().includes(search)) ||
        (u.role && u.role.toLowerCase().includes(search))
      );
    }

    if (roleFilter) {
      users = users.filter(u => u.role === roleFilter);
    }

    if (statusFilter === 'active') {
      users = users.filter(u => u.isActive);
    } else if (statusFilter === 'disabled') {
      users = users.filter(u => !u.isActive);
    }

    if (users.length === 0) {
      listEl.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">查無符合條件的授權帳號</p>';
      return;
    }

    listEl.innerHTML = users.map(u => {
      const isRootAdmin = u.email.toLowerCase() === 'huang761027@gmail.com';
      const roleBadge = u.role === 'Admin' ? '<span class="badge badge-designer">👑 超級管理員</span>' : '<span class="badge badge-company">👤 一般員工</span>';
      const statusBadge = u.isActive ? '<span class="badge badge-success">✅ 啟用中</span>' : '<span class="badge badge-danger">⛔ 已停用</span>';

      return `
        <div class="list-item-card">
          <div class="list-item-top">
            <div class="list-item-info">
              <div class="list-item-title" style="align-items: center;">
                ${u.pictureUrl ? `<img src="${escapeHtml(u.pictureUrl)}" class="user-avatar" style="width: 28px; height: 28px;">` : '<i class="fa-solid fa-user-shield" style="color: var(--primary);"></i>'}
                <span><b>${escapeHtml(u.name || u.email.split('@')[0])}</b></span>
                <span style="font-size: 13px; color: var(--text-muted); font-weight: normal;">(${escapeHtml(u.email)})</span>
                ${roleBadge}
                ${statusBadge}
                ${isRootAdmin ? '<span class="badge badge-warning">系統創始帳號</span>' : ''}
              </div>
              <div class="list-item-sub">
                <span><i class="fa-regular fa-clock"></i> 授權建立: ${formatDateTime(u.createdAt)}</span>
                ${u.lastLoginAt ? `<span><i class="fa-solid fa-arrow-right-to-bracket"></i> 最後登入: ${formatDateTime(u.lastLoginAt)}</span>` : '<span style="color: var(--text-muted);">尚未登入過</span>'}
              </div>
            </div>
            <div style="display: flex; gap: 6px; align-items: center;">
              <button class="btn btn-sm btn-secondary" onclick="openUserModal(${u.id})" title="編輯授權"><i class="fa-solid fa-pen"></i></button>
              ${!isRootAdmin ? `
                <button class="btn btn-sm ${u.isActive ? 'btn-danger' : 'btn-success'}" onclick="toggleUserStatus(${u.id}, ${!u.isActive})" title="${u.isActive ? '停用此帳號' : '啟用此帳號'}">
                  ${u.isActive ? '<i class="fa-solid fa-ban"></i>' : '<i class="fa-solid fa-check"></i>'}
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id}, ${jsArg(u.email)})" title="刪除授權"><i class="fa-solid fa-trash"></i></button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    listEl.innerHTML = `<p style="color: var(--danger); text-align: center; padding: 40px;">載入錯誤：${escapeHtml(err)}</p>`;
  }
}

async function openUserModal(id = null) {
  document.getElementById('user-id').value = id || '';
  document.getElementById('modal-user-title').innerHTML = id ? '<i class="fa-solid fa-user-pen" style="color: var(--primary);"></i> 編輯授權帳號' : '<i class="fa-solid fa-user-plus" style="color: var(--primary);"></i> 新增授權 Google 帳號';

  const emailInput = document.getElementById('user-email');

  if (id) {
    try {
      const res = await fetch('/api/users');
      if (!res.ok) return;
      const users = await res.json();
      const u = users.find(x => x.id === id);
      if (u) {
        emailInput.value = u.email;
        emailInput.disabled = (u.email.toLowerCase() === 'huang761027@gmail.com');
        document.getElementById('user-name').value = u.name || '';
        document.getElementById('user-role').value = u.role || 'Staff';
        document.getElementById('user-is-active').value = u.isActive ? 'true' : 'false';
      }
    } catch (err) {
      alert('載入使用者資料失敗');
      return;
    }
  } else {
    emailInput.disabled = false;
    emailInput.value = '';
    document.getElementById('user-name').value = '';
    document.getElementById('user-role').value = 'Staff';
    document.getElementById('user-is-active').value = 'true';
  }

  openModal('modal-user');
}

async function saveUser() {
  const id = document.getElementById('user-id').value;
  const email = document.getElementById('user-email').value.trim();
  const name = document.getElementById('user-name').value.trim();
  const role = document.getElementById('user-role').value;
  const isActive = document.getElementById('user-is-active').value === 'true';

  if (!email) {
    alert('請輸入 Google 信箱！');
    return;
  }

  const payload = {
    id: id ? parseInt(id) : 0,
    email: email,
    name: name || email.split('@')[0],
    role: role,
    isActive: isActive
  };

  try {
    const url = id ? `/api/users/${id}` : '/api/users';
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      closeModal('modal-user');
      loadUsers();
      alert(id ? '使用者授權修改成功！' : '成功新增授權帳號！');
    } else {
      const msg = await parseErrorMessage(res, '儲存授權資料失敗');
      alert(msg);
    }
  } catch (err) {
    alert('儲存時發生錯誤：' + err);
  }
}

async function toggleUserStatus(id, newStatus) {
  try {
    const res = await fetch('/api/users');
    if (!res.ok) return;
    const users = await res.json();
    const u = users.find(x => x.id === id);
    if (!u) return;

    u.isActive = newStatus;

    const putRes = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(u)
    });

    if (putRes.ok) {
      loadUsers();
    } else {
      const msg = await parseErrorMessage(putRes, '變更狀態失敗');
      alert(msg);
    }
  } catch (err) {
    alert('變更狀態時發生錯誤：' + err);
  }
}

async function deleteUser(id, email) {
  if (!confirm(`確定要刪除「${email}」的授權嗎？\n刪除後該 Google 帳號將無法登入系統。`)) return;

  try {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    if (res.ok) {
      loadUsers();
      alert('已成功刪除該帳號授權');
    } else {
      const msg = await parseErrorMessage(res, '刪除失敗');
      alert(msg);
    }
  } catch (err) {
    alert('刪除時發生錯誤：' + err);
  }
}


// ==================== 📊 統計報表 (STATISTICS) ====================
let statsData = null;

// 工單類型固定配色（顏色跟著類型走，不隨排序或篩選改變）
const WORK_TYPE_SERIES = [
  { key: '保養', color: 'var(--series-1)' },
  { key: '安裝', color: 'var(--series-2)' },
  { key: '維修', color: 'var(--series-3)' },
  { key: '其他', color: 'var(--series-4)' }
];

function getStatsQuery() {
  const value = document.getElementById('stats-period')?.value || 'months:12';
  const [kind, arg] = value.split(':');
  if (kind === 'year') {
    const year = new Date().getFullYear() - (arg === 'previous' ? 1 : 0);
    return `year=${year}`;
  }
  return `months=${encodeURIComponent(arg)}`;
}

function formatMonthLabel(key) {
  const [y, m] = key.split('-');
  return `${y} 年 ${Number(m)} 月`;
}

function formatAxisCurrency(v) {
  if (v >= 10000) return `${Number((v / 10000).toFixed(1))}萬`;
  return Number(v).toLocaleString('zh-TW');
}

async function loadStats() {
  const kpiEl = document.getElementById('stats-kpis');
  if (!kpiEl) return;
  kpiEl.innerHTML = '<p style="color: var(--text-muted); padding: 24px;"><i class="fa-solid fa-spinner fa-spin"></i> 統計資料載入中...</p>';

  try {
    const res = await fetch(`/api/stats?${getStatsQuery()}`);
    if (!res.ok) {
      const errMsg = await parseErrorMessage(res, '無法載入統計資料');
      kpiEl.innerHTML = `<p style="color: var(--danger); padding: 24px;">${escapeHtml(errMsg)}</p>`;
      return;
    }
    statsData = await res.json();
    renderStats();
  } catch (err) {
    kpiEl.innerHTML = `<p style="color: var(--danger); padding: 24px;">載入統計資料時發生網路錯誤：${escapeHtml(err.message || err)}</p>`;
  }
}

function renderStats() {
  const d = statsData;
  if (!d) return;
  const t = d.totals;

  const rangeEl = document.getElementById('stats-range-label');
  if (rangeEl && d.months.length) {
    rangeEl.innerText = `${formatMonthLabel(d.months[0])} – ${formatMonthLabel(d.months[d.months.length - 1])}`;
  }

  // KPI tiles
  let changeHtml = '<span class="stat-delta">前期無資料</span>';
  if (t.prevRevenue > 0) {
    const pct = ((t.revenue - t.prevRevenue) / t.prevRevenue) * 100;
    const up = pct >= 0;
    changeHtml = `<span class="stat-delta ${up ? 'is-up' : 'is-down'}"><i class="fa-solid ${up ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}"></i> ${up ? '+' : ''}${pct.toFixed(1)}% 較前期</span>`;
  }
  const tiles = [
    { label: '期間營收', value: formatCurrency(t.revenue), sub: changeHtml, icon: 'fa-sack-dollar', cls: 'stat-icon-success' },
    { label: '收款筆數 / 平均客單', value: `${t.paymentCount} 筆`, sub: `<span class="stat-delta">平均 ${formatCurrency(t.averageTicket)}</span>`, icon: 'fa-receipt', cls: 'stat-icon-primary' },
    { label: '目前待收款', value: formatCurrency(t.pendingAmount), sub: `<span class="stat-delta">${t.pendingCount} 筆未收</span>`, icon: 'fa-hourglass-half', cls: 'stat-icon-warning' },
    { label: '工單完成 / 總數', value: `${t.completedWorkOrders} / ${t.workOrders}`, sub: `<span class="stat-delta">完成率 ${t.workOrders ? Math.round(t.completedWorkOrders / t.workOrders * 100) : 0}%</span>`, icon: 'fa-clipboard-check', cls: 'stat-icon-info' },
    { label: '新增客戶', value: `${t.newCustomers} 位`, sub: '<span class="stat-delta">期間內建立</span>', icon: 'fa-user-plus', cls: 'stat-icon-primary' }
  ];
  document.getElementById('stats-kpis').innerHTML = tiles.map(tile => `
    <div class="stat-card">
      <div class="stat-info">
        <span class="stat-label">${tile.label}</span>
        <span class="stat-value">${tile.value}</span>
        ${tile.sub}
      </div>
      <div class="stat-icon-wrapper ${tile.cls}"><i class="fa-solid ${tile.icon}"></i></div>
    </div>
  `).join('');

  const labels = d.months.map(m => `${Number(m.split('-')[1])}月`);
  const fullLabels = d.months.map(formatMonthLabel);

  renderBarChart(document.getElementById('stats-revenue-chart'), {
    labels, fullLabels,
    series: [{ name: '營收', color: 'var(--series-1)', values: d.revenueByMonth }],
    formatValue: formatCurrency,
    formatAxis: formatAxisCurrency,
    extraTooltip: i => `收款 ${d.paymentCountByMonth[i]} 筆`,
    labelMax: true
  });

  document.getElementById('stats-worklog-legend').innerHTML = WORK_TYPE_SERIES.map(s =>
    `<span class="viz-legend-item"><span class="viz-swatch" style="background: ${s.color};"></span>${s.key}</span>`
  ).join('');
  renderBarChart(document.getElementById('stats-worklog-chart'), {
    labels, fullLabels,
    series: WORK_TYPE_SERIES.map(s => ({ name: s.key, color: s.color, values: d.workOrdersByType[s.key] || [] })),
    stacked: true,
    formatValue: v => `${v} 件`,
    formatAxis: v => String(v),
    extraTooltip: i => `已完成 ${d.completedByMonth[i]} 件`
  });

  renderHBars(document.getElementById('stats-methods'),
    d.paymentMethods.map(m => ({ label: m.method, value: m.amount, text: `${formatCurrency(m.amount)} · ${m.count} 筆` })),
    '期間內尚無已收款紀錄');
  renderHBars(document.getElementById('stats-projects'),
    d.projectStatus.map(p => ({ label: p.status, value: p.count, text: `${p.count} 案` })),
    '尚無專案資料');

  renderTopCustomers(d.topCustomers, t.revenue);
  renderMonthlyTable(d);
}

// 垂直長條圖（單一數列或堆疊），以 SVG 繪製並提供滑鼠 / 觸控提示
function renderBarChart(el, opts) {
  if (!el) return;
  const { labels, fullLabels, series, stacked = false, formatValue, formatAxis, extraTooltip, labelMax = false } = opts;
  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((sum, s) => sum + (Number(s.values[i]) || 0), 0));
  const maxVal = Math.max(...totals, 0);

  if (maxVal === 0) {
    el.innerHTML = '<p class="viz-empty">此期間尚無資料</p>';
    return;
  }

  const width = Math.max(el.clientWidth, 280);
  const height = 240;
  const m = { top: 22, right: 8, bottom: 26, left: 48 };
  const plotW = width - m.left - m.right;
  const plotH = height - m.top - m.bottom;

  // 「漂亮」的刻度上限
  const rawStep = maxVal / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= rawStep) || rawStep;
  const yMax = Math.max(step * Math.ceil(maxVal / step), step);
  const y = v => m.top + plotH - (v / yMax) * plotH;

  const band = plotW / n;
  const barW = Math.max(Math.min(band * 0.62, 40), 4);
  const labelEvery = band >= 30 ? 1 : (band >= 16 ? 2 : 3);

  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="viz-svg">`;

  // 格線與 Y 軸刻度（淡色、不搶資料）
  for (let v = 0; v <= yMax + 1e-9; v += step) {
    const yy = y(v);
    svg += `<line x1="${m.left}" x2="${width - m.right}" y1="${yy}" y2="${yy}" class="viz-grid${v === 0 ? ' is-base' : ''}"/>`;
    svg += `<text x="${m.left - 8}" y="${yy + 4}" class="viz-axis" text-anchor="end">${escapeHtml(formatAxis(v))}</text>`;
  }

  const maxIndex = totals.indexOf(maxVal);

  labels.forEach((label, i) => {
    const cx = m.left + band * i + band / 2;
    const x = cx - barW / 2;
    let base = 0;
    const segs = series.map(s => ({ color: s.color, v: Number(s.values[i]) || 0 })).filter(s => s.v > 0);

    segs.forEach((seg, k) => {
      const yTop = y(base + seg.v);
      let yBottom = y(base);
      if (k > 0) yBottom -= 2; // 堆疊區段之間保留 2px 間隔
      const h = Math.max(yBottom - yTop, 1);
      const isTop = k === segs.length - 1;
      const r = isTop ? Math.min(4, barW / 2, h) : 0;
      svg += `<path d="${roundedTopRect(x, yTop, barW, h, r)}" fill="${seg.color}" class="viz-bar"/>`;
      base += seg.v;
    });

    if (labelMax && i === maxIndex) {
      svg += `<text x="${cx}" y="${y(totals[i]) - 6}" class="viz-value" text-anchor="middle">${escapeHtml(formatAxis(totals[i]))}</text>`;
    }

    if (i % labelEvery === 0) {
      svg += `<text x="${cx}" y="${height - 8}" class="viz-axis" text-anchor="middle">${escapeHtml(label)}</text>`;
    }

    // 整欄的感應區（比長條大，方便手機點選）
    svg += `<rect x="${m.left + band * i}" y="${m.top}" width="${band}" height="${plotH}" class="viz-hit" data-index="${i}"/>`;
  });

  svg += '</svg>';
  el.innerHTML = svg;

  const tooltipHtml = i => {
    let html = `<div class="viz-tip-title">${escapeHtml(fullLabels[i])}</div>`;
    if (series.length > 1) {
      html += series.map(s => `<div class="viz-tip-row"><span class="viz-swatch" style="background: ${s.color};"></span>${escapeHtml(s.name)}<b>${escapeHtml(formatValue(Number(s.values[i]) || 0))}</b></div>`).join('');
      html += `<div class="viz-tip-row is-total">合計<b>${escapeHtml(formatValue(totals[i]))}</b></div>`;
    } else {
      html += `<div class="viz-tip-row">${escapeHtml(series[0].name)}<b>${escapeHtml(formatValue(totals[i]))}</b></div>`;
    }
    if (extraTooltip) html += `<div class="viz-tip-sub">${escapeHtml(extraTooltip(i))}</div>`;
    return html;
  };

  el.querySelectorAll('.viz-hit').forEach(hit => {
    const show = evt => {
      el.querySelectorAll('.viz-hit.is-active').forEach(h => h.classList.remove('is-active'));
      hit.classList.add('is-active');
      showVizTooltip(tooltipHtml(Number(hit.dataset.index)), evt);
    };
    hit.addEventListener('mouseenter', show);
    hit.addEventListener('mousemove', evt => moveVizTooltip(evt));
    hit.addEventListener('click', show);
    hit.addEventListener('mouseleave', () => {
      hit.classList.remove('is-active');
      hideVizTooltip();
    });
  });
}

function roundedTopRect(x, y, w, h, r) {
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function getVizTooltip() {
  let tip = document.getElementById('viz-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'viz-tooltip';
    tip.className = 'viz-tooltip';
    document.body.appendChild(tip);
  }
  return tip;
}

function showVizTooltip(html, evt) {
  const tip = getVizTooltip();
  tip.innerHTML = html;
  tip.style.display = 'block';
  moveVizTooltip(evt);
}

function moveVizTooltip(evt) {
  const tip = getVizTooltip();
  if (tip.style.display !== 'block' || !evt) return;
  const pad = 12;
  let left = evt.clientX + pad;
  let top = evt.clientY + pad;
  const rect = tip.getBoundingClientRect();
  if (left + rect.width > window.innerWidth - 8) left = evt.clientX - rect.width - pad;
  if (top + rect.height > window.innerHeight - 8) top = evt.clientY - rect.height - pad;
  tip.style.left = `${Math.max(left, 8)}px`;
  tip.style.top = `${Math.max(top, 8)}px`;
}

function hideVizTooltip() {
  const tip = document.getElementById('viz-tooltip');
  if (tip) tip.style.display = 'none';
}

// 水平長條（依數值排序的分類比較），每列直接標示數值
function renderHBars(el, items, emptyText) {
  if (!el) return;
  if (!items.length) {
    el.innerHTML = `<p class="viz-empty">${escapeHtml(emptyText)}</p>`;
    return;
  }
  const max = Math.max(...items.map(i => i.value), 1);
  el.innerHTML = items.map(item => `
    <div class="viz-hbar-row" title="${escapeHtml(item.label)}：${escapeHtml(item.text)}">
      <span class="viz-hbar-label">${escapeHtml(item.label)}</span>
      <span class="viz-hbar-track"><span class="viz-hbar-fill" style="width: ${Math.max(item.value / max * 100, 1.5)}%;"></span></span>
      <span class="viz-hbar-value">${escapeHtml(item.text)}</span>
    </div>
  `).join('');
}

function renderTopCustomers(list, totalRevenue) {
  const el = document.getElementById('stats-top-customers');
  if (!el) return;
  if (!list.length) {
    el.innerHTML = '<p class="viz-empty">期間內尚無已收款紀錄</p>';
    return;
  }
  el.innerHTML = `
    <table class="stats-table">
      <thead><tr><th>#</th><th>客戶</th><th class="num">收款筆數</th><th class="num">營收</th><th class="num">占比</th></tr></thead>
      <tbody>
        ${list.map((c, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${c.customerId ? `<a href="javascript:void(0)" onclick="viewCustomerHistory(${c.customerId})">${escapeHtml(c.name)}</a>` : escapeHtml(c.name)}</td>
            <td class="num">${c.count}</td>
            <td class="num">${formatCurrency(c.amount)}</td>
            <td class="num">${totalRevenue > 0 ? (c.amount / totalRevenue * 100).toFixed(1) : '0.0'}%</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function getMonthlyRows(d) {
  return d.months.map((key, i) => ({
    month: formatMonthLabel(key),
    revenue: Number(d.revenueByMonth[i]) || 0,
    payments: d.paymentCountByMonth[i] || 0,
    workOrders: WORK_TYPE_SERIES.reduce((sum, s) => sum + ((d.workOrdersByType[s.key] || [])[i] || 0), 0),
    byType: WORK_TYPE_SERIES.map(s => (d.workOrdersByType[s.key] || [])[i] || 0),
    completed: d.completedByMonth[i] || 0,
    newCustomers: d.newCustomersByMonth[i] || 0
  }));
}

function renderMonthlyTable(d) {
  const el = document.getElementById('stats-monthly-table');
  if (!el) return;
  const rows = getMonthlyRows(d);
  const t = d.totals;
  el.innerHTML = `
    <table class="stats-table">
      <thead>
        <tr>
          <th>月份</th><th class="num">營收</th><th class="num">收款筆數</th>
          ${WORK_TYPE_SERIES.map(s => `<th class="num">${s.key}</th>`).join('')}
          <th class="num">工單合計</th><th class="num">已完成</th><th class="num">新客戶</th>
        </tr>
      </thead>
      <tbody>
        ${rows.slice().reverse().map(r => `
          <tr>
            <td>${r.month}</td>
            <td class="num">${formatCurrency(r.revenue)}</td>
            <td class="num">${r.payments}</td>
            ${r.byType.map(v => `<td class="num">${v}</td>`).join('')}
            <td class="num">${r.workOrders}</td>
            <td class="num">${r.completed}</td>
            <td class="num">${r.newCustomers}</td>
          </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td>合計</td>
          <td class="num">${formatCurrency(t.revenue)}</td>
          <td class="num">${t.paymentCount}</td>
          ${WORK_TYPE_SERIES.map((s, k) => `<td class="num">${rows.reduce((sum, r) => sum + r.byType[k], 0)}</td>`).join('')}
          <td class="num">${t.workOrders}</td>
          <td class="num">${t.completedWorkOrders}</td>
          <td class="num">${t.newCustomers}</td>
        </tr>
      </tfoot>
    </table>`;
}

function exportStatsCsv() {
  if (!statsData) {
    alert('請先載入統計資料');
    return;
  }
  const rows = getMonthlyRows(statsData);
  const header = ['月份', '營收', '收款筆數', ...WORK_TYPE_SERIES.map(s => s.key), '工單合計', '已完成', '新客戶'];
  const csvCell = v => {
    const text = String(v);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [header, ...rows.map(r => [r.month, r.revenue, r.payments, ...r.byType, r.workOrders, r.completed, r.newCustomers])]
    .map(cols => cols.map(csvCell).join(','));
  // 加上 BOM，Excel 開啟中文才不會亂碼
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `永倉月報表_${statsData.months[0]}_${statsData.months[statsData.months.length - 1]}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 視窗大小改變時重新繪製圖表（統計頁開啟時）
window.addEventListener('resize', () => debounce(rerenderStatsIfVisible, 200)());
function rerenderStatsIfVisible() {
  const view = document.getElementById('view-stats');
  if (statsData && view && view.style.display !== 'none') renderStats();
}
document.addEventListener('scroll', hideVizTooltip, { passive: true });
