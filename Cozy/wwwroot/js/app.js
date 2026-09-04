// 永倉管理系統 (Yongcang Management System) Logic

// Global Cache
let currentUser = null;
let customersCache = [];
let projectsCache = [];
let quotationsCache = [];
let projectStagedFiles = [];

// Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.log('ServiceWorker registration failed: ', err);
    });
  });
}

// Utility: Debounce for search inputs
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
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
    quotations: '<i class="fa-solid fa-file-invoice-dollar"></i> <span>報價管理</span>',
    payments: '<i class="fa-solid fa-wallet"></i> <span>收費紀錄</span>',
    users: '<i class="fa-solid fa-user-shield"></i> <span>帳號授權管理</span>'
  };

  document.getElementById('page-title').innerHTML = titleConfigs[tabName] || '<i class="fa-solid fa-layer-group"></i> <span>永倉管理</span>';
  const targetView = document.getElementById(`view-${tabName}`);
  if (targetView) targetView.style.display = 'block';

  if (tabName === 'dashboard') loadDashboard();
  if (tabName === 'customers') loadCustomers();
  if (tabName === 'projects') loadProjects();
  if (tabName === 'worklogs') loadWorkLogs();
  if (tabName === 'quotations') loadQuotations();
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

// ==================== 1. 總覽管理 (DASHBOARD) ====================
async function loadDashboard() {
  try {
    const res = await fetch('/api/dashboard/stats');
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById('stat-total-customers').innerText = data.totalCustomers;
    document.getElementById('stat-month-revenue').innerText = formatCurrency(data.monthRevenue);
    document.getElementById('stat-pending-payments').innerText = formatCurrency(data.pendingPaymentsAmount);
    document.getElementById('stat-pending-tasks').innerText = data.pendingWorkLogsCount;

    // Render today's worklogs
    const todayList = document.getElementById('today-worklogs-list');
    if (data.todayWorkLogs && data.todayWorkLogs.length > 0) {
      todayList.innerHTML = data.todayWorkLogs.map(item => `
        <div class="list-item-card ${item.isPriority ? 'is-priority' : ''}">
          <div class="list-item-top">
            <div class="list-item-info">
              <div class="list-item-title">
                <i class="fa-solid fa-calendar-check" style="color: var(--primary);"></i>
                ${item.isPriority ? '<span class="badge badge-priority"><i class="fa-solid fa-star"></i> 優先 (*)</span>' : ''}
                <span>${item.title}</span>
                <span class="badge ${getStatusBadgeClass(item.status)}">${item.status}</span>
              </div>
              <div class="list-item-sub">
                <span><i class="fa-regular fa-clock"></i> 預定: ${formatDateTime(item.scheduledAt)}</span>
                <span><i class="fa-solid fa-user"></i> ${item.customerName}</span>
                ${item.statusUpdatedAt ? `<span class="status-time-tag"><i class="fa-solid fa-clock-rotate-left"></i> 狀態更新: ${formatDateTime(item.statusUpdatedAt)}</span>` : ''}
              </div>
            </div>
          </div>
        </div>
      `).join('');
    } else {
      todayList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 24px;">今日尚無排定行程</p>';
    }

    // Render recent payments
    const recentList = document.getElementById('recent-payments-list');
    if (data.recentPayments && data.recentPayments.length > 0) {
      recentList.innerHTML = data.recentPayments.map(p => `
        <div class="list-item-card">
          <div class="list-item-top">
            <div class="list-item-info">
              <div class="list-item-title">
                <i class="fa-solid fa-receipt" style="color: var(--success);"></i>
                <span>${p.title}</span>
                <span style="color: var(--success); font-weight: 800; margin-left: 4px;">+${formatCurrency(p.amount)}</span>
              </div>
              <div class="list-item-sub">
                <span><i class="fa-regular fa-calendar"></i> ${formatDate(p.paymentDate)}</span>
                <span><i class="fa-solid fa-user"></i> ${p.customerName}</span>
                <span class="badge ${p.status === '已收款' ? 'badge-success' : 'badge-warning'}">${p.status}</span>
              </div>
            </div>
          </div>
        </div>
      `).join('');
    } else {
      recentList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 24px;">尚無收費紀錄</p>';
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
              <span style="font-size: 17px; font-weight: 800;">${c.name}</span>
              <span class="badge ${getCategoryBadgeClass(c.category)}">${c.category || '個人'}</span>
            </div>
            <div class="list-item-sub">
              <span><i class="fa-solid fa-phone" style="color: var(--primary);"></i> <b>${c.phone}</b></span>
              ${c.lineId ? `<span><i class="fa-brands fa-line" style="color: #00c300; font-size: 15px;"></i> LINE: ${c.lineId}</span>` : ''}
              ${c.address ? `<span><i class="fa-solid fa-location-dot" style="color: #ea580c;"></i> ${c.address}</span>` : ''}
              ${c.email ? `<span><i class="fa-solid fa-envelope" style="color: #64748b;"></i> ${c.email}</span>` : ''}
            </div>
            ${c.notes ? `<div style="font-size: 13px; color: #475569; margin-top: 6px; background: #f8fafc; border-left: 3px solid #94a3b8; padding: 6px 10px; border-radius: 4px;"><i class="fa-regular fa-note-sticky"></i> 備註: ${c.notes}</div>` : ''}
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm btn-secondary" onclick="editCustomer(${c.id})" title="編輯資料"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-sm btn-danger" onclick="deleteCustomer(${c.id}, '${c.name}')" title="刪除"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>

        <!-- 選擇客戶 > 產生專案 / 產生報價 / 產生收費 / 產生工作行程 -->
        <div class="customer-action-btn-group">
          <button class="btn btn-sm btn-action-project" onclick="triggerCustomerAction(${c.id}, 'project')">
            <i class="fa-solid fa-folder-plus"></i> 建立專案案場
          </button>
          <button class="btn btn-sm btn-action-quote" onclick="triggerCustomerAction(${c.id}, 'quote')">
            <i class="fa-solid fa-file-invoice-dollar"></i> 產生報價單
          </button>
          <button class="btn btn-sm btn-action-pay" onclick="triggerCustomerAction(${c.id}, 'pay')">
            <i class="fa-solid fa-wallet"></i> 產生收費紀錄
          </button>
          <button class="btn btn-sm btn-action-log" onclick="triggerCustomerAction(${c.id}, 'log')">
            <i class="fa-solid fa-calendar-plus"></i> 產生工作行程
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
  } else if (actionType === 'quote') {
    openQuotationModal(null, customerId);
  } else if (actionType === 'pay') {
    openPaymentModal(null, customerId);
  } else if (actionType === 'log') {
    openWorkLogModal(null, customerId);
  }
}

function populateCustomerDropdowns() {
  const optionsHtml = customersCache.map(c => `<option value="${c.id}">[${c.category || '個人'}] ${c.name} (${c.phone})</option>`).join('');

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

  // Quotations
  const quoteSelect = document.getElementById('quotation-customer');
  if (quoteSelect) {
    const cur = quoteSelect.value;
    quoteSelect.innerHTML = '<option value="">-- 請選擇客戶 --</option>' + optionsHtml;
    if (cur) quoteSelect.value = cur;
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
    `<option value="${p.id}">[${p.projectNumber}] ${p.name}</option>`
  ).join('');

  const worklogProjSelect = document.getElementById('worklog-project');
  if (worklogProjSelect) {
    const cur = worklogProjSelect.value;
    worklogProjSelect.innerHTML = '<option value="">-- 無關聯專案 --</option>' + projectOptionsHtml;
    if (cur) worklogProjSelect.value = cur;
  }

  const quoteProjSelect = document.getElementById('quotation-project');
  if (quoteProjSelect) {
    const cur = quoteProjSelect.value;
    quoteProjSelect.innerHTML = '<option value="">-- 無關聯專案 --</option>' + projectOptionsHtml;
    if (cur) quoteProjSelect.value = cur;
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
    projSelect.innerHTML = '<option value="">-- 無關聯專案 --</option>' + filtered.map(p => `<option value="${p.id}">[${p.projectNumber}] ${p.name}</option>`).join('');
  }
}

function filterQuotationProjects() {
  const custId = document.getElementById('quotation-customer').value;
  const filtered = custId ? projectsCache.filter(p => p.customerId == custId) : projectsCache;
  const projSelect = document.getElementById('quotation-project');
  if (projSelect) {
    projSelect.innerHTML = '<option value="">-- 無關聯專案 --</option>' + filtered.map(p => `<option value="${p.id}">[${p.projectNumber}] ${p.name}</option>`).join('');
  }
}

function filterPaymentProjects() {
  const custId = document.getElementById('payment-customer').value;
  const filtered = custId ? projectsCache.filter(p => p.customerId == custId) : projectsCache;
  const projSelect = document.getElementById('payment-project');
  if (projSelect) {
    projSelect.innerHTML = '<option value="">-- 無關聯專案 --</option>' + filtered.map(p => `<option value="${p.id}">[${p.projectNumber}] ${p.name}</option>`).join('');
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
              <span class="project-number-badge"><i class="fa-solid fa-hashtag"></i> ${p.projectNumber}</span>
              <span style="font-size: 17px; font-weight: 800; color: #1e293b;">${p.name}</span>
              <span class="badge ${getProjectStatusBadgeClass(p.status)}">${p.status}</span>
              <span class="badge ${getCategoryBadgeClass(p.customerCategory)}"><i class="fa-solid fa-user"></i> ${p.customerName}</span>
            </div>
            <div class="list-item-sub" style="margin-top: 6px;">
              ${p.customerPhone ? `<span><i class="fa-solid fa-phone" style="color: var(--primary);"></i> ${p.customerPhone}</span>` : ''}
              ${p.contactPerson ? `<span><i class="fa-solid fa-user-gear"></i> 現場窗口: <b>${p.contactPerson}</b> ${p.contactPhone || ''}</span>` : ''}
              ${p.address ? `<span><i class="fa-solid fa-location-dot" style="color: #ea580c;"></i> ${p.address}</span>` : ''}
              ${p.budget ? `<span style="color: var(--success); font-weight: 700;"><i class="fa-solid fa-sack-dollar"></i> 預算: ${formatCurrency(p.budget)}</span>` : ''}
              ${p.startDate ? `<span><i class="fa-regular fa-calendar"></i> 進場: ${formatDate(p.startDate)}</span>` : ''}
            </div>
            ${p.notes ? `<div style="font-size: 13px; color: #475569; margin-top: 6px; background: #f8fafc; border-left: 3px solid #6366f1; padding: 6px 10px; border-radius: 4px;"><i class="fa-regular fa-clipboard"></i> <b>施工規範/備註:</b> ${p.notes}</div>` : ''}
            
            <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px;">
              <span class="badge ${p.fileCount > 0 ? 'badge-info' : 'badge-gray'}" style="font-size: 12px; cursor: pointer;" onclick="openProjectFilesModal(${p.id})">
                <i class="fa-solid fa-paperclip"></i> ${p.fileCount > 0 ? `附件檔案 (${p.fileCount})` : '尚無附件'}
              </span>
            </div>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm btn-action-files" onclick="openProjectFilesModal(${p.id})" title="管理附件與圖檔"><i class="fa-solid fa-paperclip"></i> 檔案庫 (${p.fileCount})</button>
            <button class="btn btn-sm btn-secondary" onclick="editProject(${p.id})" title="編輯專案"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-sm btn-danger" onclick="deleteProject(${p.id}, '${p.name}')" title="刪除"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>

        <div class="customer-action-btn-group">
          <button class="btn btn-sm btn-action-files" onclick="openProjectFilesModal(${p.id})">
            <i class="fa-solid fa-cloud-arrow-up"></i> 上傳/檢視附件 (${p.fileCount})
          </button>
          <button class="btn btn-sm btn-action-quote" onclick="openQuotationModal(null, ${p.customerId}, ${p.id})">
            <i class="fa-solid fa-file-invoice-dollar"></i> 開立專案報價單
          </button>
          <button class="btn btn-sm btn-action-log" onclick="openWorkLogModal(null, ${p.customerId}, ${p.id})">
            <i class="fa-solid fa-calendar-plus"></i> 排定專案行程
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

    document.getElementById('modal-project-files-title').innerHTML = `<i class="fa-solid fa-folder-open" style="color: var(--primary);"></i> 檔案附件庫 - ${p.name}`;
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
        <div class="file-type-icon ${iconInfo.className}">
          <i class="${iconInfo.icon}"></i>
        </div>
        <div class="file-item-info">
          <div class="file-item-name" title="${f.fileName}">${f.fileName}</div>
          <div class="file-item-meta">
            <span><i class="fa-solid fa-tag"></i> ${iconInfo.label}</span>
            <span><i class="fa-solid fa-hard-drive"></i> ${formatFileSize(f.fileSizeBytes)}</span>
            <span><i class="fa-regular fa-clock"></i> ${formatDateTime(f.uploadedAt)}</span>
          </div>
        </div>
        <div class="file-item-actions">
          <a href="/api/projects/files/${f.id}/download" target="_blank" download="${f.fileName}" class="btn-file-dl" title="下載或檢視檔案">
            <i class="fa-solid fa-download"></i> 檢視/下載
          </a>
          <button class="btn-file-del" onclick="deleteProjectFile(${f.id}, '${f.fileName}')" title="刪除此檔案">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function handleProjectFilesSelect(event) {
  const input = event.target;
  if (!input.files || input.files.length === 0) return;

  projectStagedFiles = Array.from(input.files);
  const previewBox = document.getElementById('selected-files-preview');
  const countSpan = document.getElementById('selected-files-count');
  const listDiv = document.getElementById('selected-files-list');

  countSpan.innerText = `已選擇 ${projectStagedFiles.length} 個檔案`;
  listDiv.innerHTML = projectStagedFiles.map(f => `
    <div style="display: flex; justify-content: space-between; padding: 2px 0;">
      <span>📄 <b>${f.name}</b></span>
      <span style="color: #64748b;">${formatFileSize(f.size)}</span>
    </div>
  `).join('');

  previewBox.style.display = 'block';
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

// ==================== 4. 工作行程 (WORKLOGS) ====================
async function loadWorkLogs() {
  const search = document.getElementById('worklog-search').value;
  const status = document.getElementById('worklog-status-filter').value;
  try {
    const res = await fetch(`/api/worklogs?search=${encodeURIComponent(search || '')}&status=${encodeURIComponent(status || '')}`);
    const data = await res.json();
    const listEl = document.getElementById('worklogs-list');

    if (data.length === 0) {
      listEl.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">尚無工作行程，請至「客戶資料」中點擊「產生工作行程」</p>';
      return;
    }

    listEl.innerHTML = data.map(w => `
      <div class="list-item-card ${w.isPriority ? 'is-priority' : ''}">
        <div class="list-item-top">
          <div class="list-item-info">
            <div class="list-item-title">
              <i class="fa-solid fa-calendar-check" style="color: var(--primary);"></i>
              ${w.isPriority ? '<span class="badge badge-priority"><i class="fa-solid fa-star"></i> 優先處理 (*)</span>' : ''}
              <span>${w.title}</span>
              <span class="badge ${getStatusBadgeClass(w.status)}">${w.status}</span>
              ${w.customerCategory ? `<span class="badge ${getCategoryBadgeClass(w.customerCategory)}">${w.customerCategory}</span>` : ''}
            </div>
            <div class="list-item-sub">
              <span><i class="fa-solid fa-user"></i> <b>${w.customerName}</b> ${w.customerPhone ? '(' + w.customerPhone + ')' : ''}</span>
              <span><i class="fa-regular fa-clock"></i> 預定: ${formatDateTime(w.scheduledAt)}</span>
              ${w.location ? `<span><i class="fa-solid fa-location-dot" style="color: #ea580c;"></i> ${w.location}</span>` : ''}
              ${w.statusUpdatedAt ? `<span class="status-time-tag"><i class="fa-solid fa-clock-rotate-left"></i> 狀態更新: ${formatDateTime(w.statusUpdatedAt)}</span>` : ''}
            </div>
            ${w.details ? `<div style="font-size: 13.5px; color: #334155; margin-top: 8px; white-space: pre-line; background: #f8fafc; border-left: 3px solid #3b82f6; padding: 8px 12px; border-radius: 4px;">${w.details}</div>` : ''}
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
    }
  } catch (err) {
    console.error('Error updating status:', err);
  }
}

function openWorkLogModal(id = null, preSelectCustomerId = null, preSelectProjectId = null) {
  document.getElementById('worklog-id').value = id || '';
  document.getElementById('modal-worklog-title').innerHTML = id ? '<i class="fa-solid fa-pen-to-square" style="color: var(--primary);"></i> 編輯工作行程' : '<i class="fa-solid fa-calendar-plus" style="color: var(--primary);"></i> 排定工作行程';
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
  document.getElementById('modal-worklog-title').innerHTML = '<i class="fa-solid fa-pen-to-square" style="color: var(--primary);"></i> 編輯工作行程';
  populateCustomerDropdowns();

  const customerSelect = document.getElementById('worklog-customer');
  customerSelect.disabled = false;
  customerSelect.value = w.customerId || '';
  const lockedHint = document.getElementById('worklog-customer-locked-hint');
  if (lockedHint) lockedHint.style.display = 'none';

  filterWorkLogProjects();
  const projSelect = document.getElementById('worklog-project');
  if (projSelect) projSelect.value = w.projectId || '';

  document.getElementById('worklog-title-input').value = w.title || '';
  document.getElementById('worklog-time').value = w.scheduledAt ? w.scheduledAt.substring(0, 16) : '';
  document.getElementById('worklog-location').value = w.location || '';
  document.getElementById('worklog-status').value = w.status || '待處理';
  document.getElementById('worklog-is-priority').checked = !!w.isPriority;
  document.getElementById('worklog-details').value = w.details || '';

  openModal('modal-worklog');
}

async function saveWorkLog() {
  const id = document.getElementById('worklog-id').value;
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
  }
}

// ==================== 4. 報價管理 (QUOTATIONS) ====================
async function loadQuotations() {
  const search = document.getElementById('quotation-search').value;
  const status = document.getElementById('quotation-status-filter').value;
  try {
    const res = await fetch(`/api/quotations?search=${encodeURIComponent(search || '')}&status=${encodeURIComponent(status || '')}`);
    const data = await res.json();
    quotationsCache = data;
    const listEl = document.getElementById('quotations-list');

    if (data.length === 0) {
      listEl.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">尚無報價單，請至「客戶資料」中點擊「產生報價單」</p>';
      return;
    }

    const customerGroups = {};
    data.forEach(q => {
      const cId = q.customerId;
      if (!customerGroups[cId]) {
        customerGroups[cId] = [];
      }
      customerGroups[cId].push(q);
    });

    let html = '';
    for (const cId in customerGroups) {
      const quotes = customerGroups[cId];
      const latest = quotes[0];
      const older = quotes.slice(1);

      html += `
        <div class="quotation-group-box">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="font-weight: 800; font-size: 16px; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-user-tie" style="color: var(--primary);"></i>
              <span>${latest.customerName}</span>
              ${latest.customerCategory ? `<span class="badge ${getCategoryBadgeClass(latest.customerCategory)}">${latest.customerCategory}</span>` : ''}
              <span style="font-size: 13px; color: var(--text-muted); font-weight: normal;">${latest.customerPhone || ''}</span>
            </div>
            <span class="badge ${getQuotationBadgeClass(latest.status)}">${latest.status}</span>
          </div>

          <!-- Latest Quotation Card -->
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
              <div style="font-weight: 800; font-size: 16px; color: var(--primary);">
                <i class="fa-solid fa-file-invoice"></i> [${latest.quotationNumber}] ${latest.title}
                <span style="font-size: 11px; background: #dbeafe; color: #1e40af; padding: 2px 6px; border-radius: 4px; margin-left: 6px; font-weight: 700;">最新版本</span>
              </div>
              <div style="font-size: 13.5px; color: var(--text-muted); margin-top: 5px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                <span><i class="fa-regular fa-calendar"></i> 報價日期: ${formatDate(latest.issueDate)}</span>
                <span><i class="fa-solid fa-calculator"></i> 總額: <b style="font-size: 16px; color: var(--text-main);">${formatCurrency(latest.totalAmount)}</b></span>
                ${latest.hasPayment ? '<span class="badge badge-success" style="font-size: 11.5px;"><i class="fa-solid fa-check-double"></i> 已轉入收費</span>' : ''}
              </div>
            </div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <button class="btn btn-sm btn-primary" onclick="viewQuotation(${latest.id})"><i class="fa-solid fa-eye"></i> 預覽/列印</button>
              ${!latest.hasPayment ? `
                <button class="btn btn-sm btn-action-pay" onclick="convertQuotationToPayment(${latest.id}, '${latest.title}', ${latest.totalAmount})">
                  <i class="fa-solid fa-money-bill-wave"></i> 轉入收費紀錄
                </button>
              ` : ''}
              <button class="btn btn-sm btn-secondary" onclick="editQuotation(${latest.id})"><i class="fa-solid fa-pen"></i></button>
              <button class="btn btn-sm btn-danger" onclick="deleteQuotation(${latest.id})"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>

          <!-- Collapsible Older History -->
          ${older.length > 0 ? `
            <button type="button" class="history-toggle-btn" onclick="toggleQuotationHistory('hist-${cId}', this)">
              <i class="fa-solid fa-clock-rotate-left"></i> 展開歷史報價紀錄 (${older.length} 筆)
            </button>
            <div id="hist-${cId}" class="history-container">
              ${older.map(oldQ => `
                <div style="background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; font-size: 13.5px;">
                  <div>
                    <span style="color: #64748b; font-family: monospace;">[${oldQ.quotationNumber}]</span>
                    <b>${oldQ.title}</b>
                    <span class="badge ${getQuotationBadgeClass(oldQ.status)}">${oldQ.status}</span>
                    <span style="color: #64748b; margin-left: 8px;">${formatDate(oldQ.issueDate)}</span>
                    <b style="margin-left: 8px; color: var(--primary);">${formatCurrency(oldQ.totalAmount)}</b>
                  </div>
                  <div style="display: flex; gap: 4px;">
                    <button class="btn btn-sm btn-secondary" onclick="viewQuotation(${oldQ.id})"><i class="fa-solid fa-eye"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteQuotation(${oldQ.id})"><i class="fa-solid fa-trash"></i></button>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }

    listEl.innerHTML = html;
  } catch (err) {
    console.error('Error loading quotations:', err);
  }
}

function toggleQuotationHistory(containerId, btn) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const isOpen = container.classList.contains('open');
  if (isOpen) {
    container.classList.remove('open');
    btn.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> 展開歷史報價紀錄`;
  } else {
    container.classList.add('open');
    btn.innerHTML = `<i class="fa-solid fa-chevron-up"></i> 收合歷史報價紀錄`;
  }
}

async function convertQuotationToPayment(quotationId, title, amount) {
  if (!confirm(`確定要將報價單「${title}」的最終金額 ${formatCurrency(amount)} 轉入收費紀錄嗎？`)) return;

  try {
    const res = await fetch(`/api/quotations/${quotationId}/to-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `報價單結算: ${title}`,
        status: '待收款',
        paymentMethod: '匯款'
      })
    });

    if (res.ok) {
      alert(`已成功將金額 ${formatCurrency(amount)} 建立於收費紀錄！`);
      loadQuotations();
      loadDashboard();
    } else {
      alert('轉入收費紀錄失敗');
    }
  } catch (err) {
    console.error('Error converting to payment:', err);
  }
}

function openQuotationModal(id = null, preSelectCustomerId = null, preSelectProjectId = null) {
  document.getElementById('quotation-id').value = id || '';
  document.getElementById('modal-quotation-title').innerHTML = id ? '<i class="fa-solid fa-pen-to-square" style="color: var(--primary);"></i> 編輯報價單' : '<i class="fa-solid fa-file-circle-plus" style="color: var(--primary);"></i> 建立報價單';
  document.getElementById('quotation-number').value = '';
  document.getElementById('quotation-title-input').value = '';
  document.getElementById('quotation-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('quotation-status').value = '草稿';
  document.getElementById('quotation-notes').value = '1. 報價有效期限 14 天。\n2. 確認簽回後開工，完工結算付清。\n3. 本報價含稅及施工責任險。';
  
  populateCustomerDropdowns();
  const customerSelect = document.getElementById('quotation-customer');
  const lockedHint = document.getElementById('quotation-customer-locked-hint');

  if (preSelectCustomerId) {
    customerSelect.value = preSelectCustomerId;
    customerSelect.disabled = true;
    if (lockedHint) lockedHint.style.display = 'inline';
    filterQuotationProjects();
  } else {
    customerSelect.disabled = false;
    if (lockedHint) lockedHint.style.display = 'none';
  }

  if (preSelectProjectId) {
    const projSelect = document.getElementById('quotation-project');
    if (projSelect) projSelect.value = preSelectProjectId;
  } else if (!id) {
    const projSelect = document.getElementById('quotation-project');
    if (projSelect) projSelect.value = '';
  }

  const container = document.getElementById('quotation-items-container');
  container.innerHTML = '';
  addQuotationRow('標準服務項目', 1, 5000);
  calculateQuotationTotal();

  openModal('modal-quotation');
}

function addQuotationRow(name = '', qty = 1, price = 0) {
  const container = document.getElementById('quotation-items-container');
  const card = document.createElement('div');
  card.className = 'quotation-item-card';
  card.innerHTML = `
    <div class="item-card-header">
      <span class="item-card-num"><i class="fa-solid fa-cube" style="color: var(--primary);"></i> 品項</span>
      <button type="button" class="btn-delete-item" onclick="this.closest('.quotation-item-card').remove(); updateQuotationItemIndices(); calculateQuotationTotal();" title="刪除此品項">
        <i class="fa-solid fa-trash-can"></i> 刪除
      </button>
    </div>
    <div>
      <label class="item-card-label">品項 / 服務說明 <span style="color:red">*</span></label>
      <input type="text" class="form-input item-name" value="${name ? name.replace(/"/g, '&quot;') : ''}" placeholder="例: 客廳天花板平釘木作工程 / 設備安裝" required>
    </div>
    <div class="item-card-grid">
      <div>
        <label class="item-card-label">數量</label>
        <input type="number" class="form-input item-qty" value="${qty}" min="1" step="1" oninput="calculateQuotationTotal()">
      </div>
      <div>
        <label class="item-card-label">單價 (NT$)</label>
        <input type="number" class="form-input item-price" value="${price}" min="0" step="1" oninput="calculateQuotationTotal()">
      </div>
      <div class="item-subtotal-col">
        <label class="item-card-label">小計</label>
        <div class="item-subtotal-box">
          <span class="item-subtotal">$0</span>
        </div>
      </div>
    </div>
  `;
  container.appendChild(card);
  updateQuotationItemIndices();
  calculateQuotationTotal();
}

function updateQuotationItemIndices() {
  const cards = document.querySelectorAll('#quotation-items-container .quotation-item-card');
  cards.forEach((c, idx) => {
    const numEl = c.querySelector('.item-card-num');
    if (numEl) {
      numEl.innerHTML = `<i class="fa-solid fa-cube" style="color: var(--primary);"></i> 品項 #${idx + 1}`;
    }
  });
}

function calculateQuotationTotal() {
  const cards = document.querySelectorAll('#quotation-items-container .quotation-item-card');
  let grandTotal = 0;
  cards.forEach(card => {
    const qty = parseFloat(card.querySelector('.item-qty').value) || 0;
    const price = parseFloat(card.querySelector('.item-price').value) || 0;
    const subtotal = qty * price;
    const subtotalEl = card.querySelector('.item-subtotal');
    if (subtotalEl) {
      subtotalEl.innerText = formatCurrency(subtotal);
    }
    grandTotal += subtotal;
  });

  const totalDisplay = document.getElementById('quotation-total-display');
  if (totalDisplay) {
    totalDisplay.innerText = formatCurrency(grandTotal);
  }
}

async function saveQuotation() {
  const id = document.getElementById('quotation-id').value;
  const customerSelect = document.getElementById('quotation-customer');
  const customerId = customerSelect.value;
  const projectIdVal = document.getElementById('quotation-project') ? document.getElementById('quotation-project').value : null;
  const title = document.getElementById('quotation-title-input').value.trim();

  if (!customerId) {
    alert('請選擇關聯客戶！');
    return;
  }
  if (!title) {
    alert('請填寫報價單名稱！');
    return;
  }

  const items = [];
  const cards = document.querySelectorAll('#quotation-items-container .quotation-item-card');
  cards.forEach(card => {
    const name = card.querySelector('.item-name').value.trim();
    const qty = parseFloat(card.querySelector('.item-qty').value) || 1;
    const price = parseFloat(card.querySelector('.item-price').value) || 0;
    if (name) {
      items.push({
        itemName: name,
        quantity: qty,
        unitPrice: price,
        subtotal: qty * price
      });
    }
  });

  if (items.length === 0) {
    alert('請至少加入一個報價品項！');
    return;
  }

  const issueDateVal = document.getElementById('quotation-date').value;
  const payload = {
    id: id ? parseInt(id) : 0,
    quotationNumber: document.getElementById('quotation-number').value.trim(),
    customerId: parseInt(customerId),
    projectId: projectIdVal ? parseInt(projectIdVal) : null,
    title,
    issueDate: issueDateVal ? new Date(issueDateVal).toISOString() : new Date().toISOString(),
    status: document.getElementById('quotation-status').value,
    notes: document.getElementById('quotation-notes').value.trim(),
    items
  };

  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/quotations/${id}` : '/api/quotations';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      closeModal('modal-quotation');
      loadQuotations();
    } else {
      const errMsg = await parseErrorMessage(res, '請檢查各欄位填寫');
      alert(`儲存報價單失敗：${errMsg}`);
    }
  } catch (err) {
    alert(`儲存報價單時發生網路錯誤：${err.message || err}`);
  }
}

async function editQuotation(id) {
  const res = await fetch(`/api/quotations/${id}`);
  if (!res.ok) return;
  const q = await res.json();

  document.getElementById('quotation-id').value = q.id;
  document.getElementById('modal-quotation-title').innerHTML = '<i class="fa-solid fa-pen-to-square" style="color: var(--primary);"></i> 編輯報價單';
  document.getElementById('quotation-number').value = q.quotationNumber || '';
  populateCustomerDropdowns();
  
  const customerSelect = document.getElementById('quotation-customer');
  customerSelect.disabled = false;
  customerSelect.value = q.customerId;
  const lockedHint = document.getElementById('quotation-customer-locked-hint');
  if (lockedHint) lockedHint.style.display = 'none';

  filterQuotationProjects();
  const projSelect = document.getElementById('quotation-project');
  if (projSelect) projSelect.value = q.projectId || '';

  document.getElementById('quotation-title-input').value = q.title || '';
  document.getElementById('quotation-date').value = q.issueDate ? q.issueDate.slice(0, 10) : '';
  document.getElementById('quotation-status').value = q.status || '草稿';
  document.getElementById('quotation-notes').value = q.notes || '';

  const container = document.getElementById('quotation-items-container');
  container.innerHTML = '';
  if (q.items && q.items.length > 0) {
    q.items.forEach(i => addQuotationRow(i.itemName, i.quantity, i.unitPrice));
  } else {
    addQuotationRow();
  }
  calculateQuotationTotal();

  openModal('modal-quotation');
}

async function viewQuotation(id) {
  const res = await fetch(`/api/quotations/${id}`);
  if (!res.ok) return;
  const q = await res.json();

  const preview = document.getElementById('quotation-preview-content');
  preview.innerHTML = `
    <div style="border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start;">
      <div>
        <h1 style="color: #2563eb; font-size: 26px; margin-bottom: 4px; font-weight: 800;"><i class="fa-solid fa-file-invoice"></i> 永 倉 管 理 - 報 價 單</h1>
        <div style="font-size: 14px; color: #64748b;">單號：<b>${q.quotationNumber}</b></div>
      </div>
      <div style="text-align: right; font-size: 14px;">
        <div>報價日期：${formatDate(q.issueDate)}</div>
        <div>狀態：<span class="badge ${getQuotationBadgeClass(q.status)}">${q.status}</span></div>
      </div>
    </div>

    <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
      <h3 style="font-size: 15px; margin-bottom: 8px; color: #1e293b;"><i class="fa-solid fa-user-tie" style="color: var(--primary);"></i> 客戶資訊</h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 14px;">
        <div>客戶姓名：<b>${q.customer ? q.customer.name : '未指定'}</b> ${q.customer && q.customer.category ? `(${q.customer.category})` : ''}</div>
        <div>聯絡電話：<b>${q.customer && q.customer.phone ? q.customer.phone : '無'}</b></div>
        <div>地址/現場：${q.customer && q.customer.address ? q.customer.address : '無'}</div>
        <div>專案名稱：<b>${q.title}</b></div>
      </div>
    </div>

    <table class="items-table" style="margin-bottom: 20px;">
      <thead>
        <tr>
          <th>品項說明</th>
          <th style="text-align: center; width: 80px;">數量</th>
          <th style="text-align: right; width: 120px;">單價</th>
          <th style="text-align: right; width: 120px;">小計</th>
        </tr>
      </thead>
      <tbody>
        ${(q.items || []).map(item => `
          <tr>
            <td><b>${item.itemName}</b></td>
            <td style="text-align: center;">${item.quantity}</td>
            <td style="text-align: right;">${formatCurrency(item.unitPrice)}</td>
            <td style="text-align: right; font-weight: 700;">${formatCurrency(item.subtotal)}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr style="background: #eff6ff; font-weight: 800; font-size: 16px;">
          <td colspan="3" style="text-align: right;">報價總金額 (TWD)：</td>
          <td style="text-align: right; color: #2563eb; font-size: 18px;">${formatCurrency(q.totalAmount)}</td>
        </tr>
      </tfoot>
    </table>

    ${q.notes ? `
      <div style="font-size: 13px; color: #475569; background: #fff; border: 1px dashed #cbd5e1; padding: 12px; border-radius: 6px;">
        <b>條款與備註說明：</b><br>
        <div style="white-space: pre-line; margin-top: 4px;">${q.notes}</div>
      </div>
    ` : ''}

    <div style="margin-top: 40px; display: flex; justify-content: space-between; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 14px;">
      <div>報價立案方：永倉管理</div>
      <div>客戶確認簽章：__________________</div>
    </div>
  `;

  openModal('modal-quotation-view');
}

async function deleteQuotation(id) {
  if (!confirm('確定要刪除此報價單嗎？')) return;
  const res = await fetch(`/api/quotations/${id}`, { method: 'DELETE' });
  if (res.ok) loadQuotations();
}

// ==================== 5. 收費紀錄 (PAYMENTS) ====================
async function loadPayments() {
  const search = document.getElementById('payment-search').value;
  const status = document.getElementById('payment-status-filter').value;
  try {
    const res = await fetch(`/api/payments?search=${encodeURIComponent(search || '')}&status=${encodeURIComponent(status || '')}`);
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
              <span style="font-size: 16.5px; font-weight: 800;">${p.title}</span>
              <span style="color: var(--success); font-size: 18px; font-weight: 800; margin-left: 4px;">+${formatCurrency(p.amount)}</span>
              <span class="badge ${p.status === '已收款' ? 'badge-success' : 'badge-warning'}">${p.status}</span>
              ${p.quotationNumber ? `<span class="badge badge-info" style="font-size: 11px;"><i class="fa-solid fa-file-invoice"></i> 來自報價單 ${p.quotationNumber}</span>` : (!p.customerId ? '<span class="badge badge-gray" style="font-size: 11px;"><i class="fa-solid fa-store"></i> 散客 / 現場購買</span>' : '<span class="badge badge-gray" style="font-size: 11px;">單一產品收費</span>')}
            </div>
            <div class="list-item-sub">
              <span><i class="fa-solid fa-user"></i> <b>${p.customerName}</b></span>
              <span><i class="fa-solid fa-money-bill-transfer" style="color: #64748b;"></i> ${p.paymentMethod}</span>
              <span><i class="fa-regular fa-calendar"></i> ${formatDate(p.paymentDate)}</span>
              ${p.invoiceNumber ? `<span><i class="fa-solid fa-receipt"></i> 發票: <b>${p.invoiceNumber}</b></span>` : ''}
              ${p.invoiceImageUrl ? `<span class="invoice-attachment-tag" onclick="viewLargeImage('${p.invoiceImageUrl}')"><i class="fa-solid fa-image"></i> 檢視發票相片</span>` : ''}
            </div>
            ${p.notes ? `<div style="font-size: 13px; color: #64748b; margin-top: 4px;"><i class="fa-regular fa-comment-dots"></i> 備註: ${p.notes}</div>` : ''}
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
    document.getElementById('payment-date').value = new Date().toISOString().slice(0, 10);
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
  document.getElementById('payment-date').value = p.paymentDate ? p.paymentDate.slice(0, 10) : '';
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
      msgEl.innerHTML = `發票號碼：<b style="color: var(--primary);">${scanResult.invoiceNumber}</b>`;

      let details = [];
      if (scanResult.amount) {
        details.push(`發票金額: $${scanResult.amount.toLocaleString('zh-TW')}`);
        const curAmt = parseFloat(document.getElementById('payment-amount').value);
        if (!curAmt || curAmt === 5000) {
          document.getElementById('payment-amount').value = scanResult.amount;
        }
      }
      if (scanResult.dateStr) {
        details.push(`發票日期: ${scanResult.dateStr}`);
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
      currentUser = await res.json();
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
    if (loginOverlay) loginOverlay.style.display = 'none';
    if (mainContainer) mainContainer.style.display = 'flex';
    if (userProfileWidget) {
      userProfileWidget.style.display = 'flex';
      const nameEl = document.getElementById('user-display-name');
      if (nameEl) nameEl.textContent = currentUser.name || currentUser.email;
      
      const roleBadge = document.getElementById('user-display-role');
      if (roleBadge) {
        if (currentUser.role === 'Admin') {
          roleBadge.textContent = '👑 超級管理員';
          roleBadge.className = 'badge badge-designer';
        } else {
          roleBadge.textContent = '👤 一般員工';
          roleBadge.className = 'badge badge-company';
        }
      }

      const avatarImg = document.getElementById('user-avatar-img');
      if (avatarImg) {
        if (currentUser.pictureUrl) {
          avatarImg.src = currentUser.pictureUrl;
          avatarImg.style.display = 'block';
        } else {
          avatarImg.style.display = 'none';
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
    if (loginOverlay) loginOverlay.style.display = 'flex';
    if (mainContainer) mainContainer.style.display = 'none';
    if (userProfileWidget) userProfileWidget.style.display = 'none';
    initGoogleLoginBtn();
  }
}

async function initGoogleLoginBtn() {
  try {
    const res = await fetch('/api/auth/config');
    if (!res.ok) return;
    const config = await res.json();
    if (config.clientId && window.google && window.google.accounts) {
      window.google.accounts.id.initialize({
        client_id: config.clientId,
        callback: handleGoogleCredentialResponse,
        auto_select: false
      });
      const btnContainer = document.getElementById('google-login-btn-container');
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
    }
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
      currentUser = await res.json();
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

async function handleDirectEmailLogin(e) {
  e.preventDefault();
  const emailInput = document.getElementById('login-direct-email');
  const email = emailInput ? emailInput.value.trim() : '';
  if (!email) return;

  const errorAlert = document.getElementById('login-error-alert');
  const errorText = document.getElementById('login-error-text');
  if (errorAlert) errorAlert.style.display = 'none';

  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email })
    });

    if (res.ok) {
      currentUser = await res.json();
      applyAuthState(true);
      loadDashboard();
      loadCustomers();
      loadProjects();
    } else {
      const msg = await parseErrorMessage(res, '此 Google 信箱未在授權白名單內或已被停用！');
      if (errorAlert && errorText) {
        errorText.textContent = msg;
        errorAlert.style.display = 'flex';
      } else {
        alert(msg);
      }
    }
  } catch (err) {
    if (errorAlert && errorText) {
      errorText.textContent = '驗證登入連線失敗：' + err;
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
                ${u.pictureUrl ? `<img src="${u.pictureUrl}" class="user-avatar" style="width: 28px; height: 28px;">` : '<i class="fa-solid fa-user-shield" style="color: var(--primary);"></i>'}
                <span><b>${u.name || u.email.split('@')[0]}</b></span>
                <span style="font-size: 13px; color: var(--text-muted); font-weight: normal;">(${u.email})</span>
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
                <button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id}, '${u.email}')" title="刪除授權"><i class="fa-solid fa-trash"></i></button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    listEl.innerHTML = `<p style="color: var(--danger); text-align: center; padding: 40px;">載入錯誤：${err}</p>`;
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

