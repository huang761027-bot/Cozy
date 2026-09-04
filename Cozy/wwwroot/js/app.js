// 永倉管理系統 (Yongcang Management System) Logic

// Global Cache
let customersCache = [];
let quotationsCache = [];

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

// Modal helper
function openModal(id) {
  document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

// Tab Navigation
document.addEventListener('DOMContentLoaded', () => {
  const navItems = document.querySelectorAll('.nav-item, .mobile-nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  // Initial Load
  loadDashboard();
  loadCustomers();
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
    worklogs: '<i class="fa-solid fa-calendar-check"></i> <span>工作行程</span>',
    quotations: '<i class="fa-solid fa-file-invoice-dollar"></i> <span>報價管理</span>',
    payments: '<i class="fa-solid fa-wallet"></i> <span>收費紀錄</span>'
  };

  document.getElementById('page-title').innerHTML = titleConfigs[tabName] || '<i class="fa-solid fa-layer-group"></i> <span>永倉管理</span>';
  const targetView = document.getElementById(`view-${tabName}`);
  if (targetView) targetView.style.display = 'block';

  if (tabName === 'dashboard') loadDashboard();
  if (tabName === 'customers') loadCustomers();
  if (tabName === 'worklogs') loadWorkLogs();
  if (tabName === 'quotations') loadQuotations();
  if (tabName === 'payments') loadPayments();
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
        <div class="list-item-card">
          <div class="list-item-top">
            <div class="list-item-info">
              <div class="list-item-title">
                <i class="fa-solid fa-calendar-check" style="color: var(--primary);"></i>
                <span>${item.title}</span>
                <span class="badge ${getStatusBadgeClass(item.status)}">${item.status}</span>
              </div>
              <div class="list-item-sub">
                <span><i class="fa-regular fa-clock"></i> ${formatDateTime(item.scheduledAt)}</span>
                <span><i class="fa-solid fa-user"></i> ${item.customerName}</span>
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

        <!-- 選擇客戶 > 產生報價 / 產生收費 / 產生工作行程 -->
        <div class="customer-action-btn-group">
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
  if (actionType === 'quote') {
    openQuotationModal(null, customerId);
  } else if (actionType === 'pay') {
    openPaymentModal(null, customerId);
  } else if (actionType === 'log') {
    openWorkLogModal(null, customerId);
  }
}

function populateCustomerDropdowns() {
  const optionsHtml = customersCache.map(c => `<option value="${c.id}">[${c.category || '個人'}] ${c.name} (${c.phone})</option>`).join('');

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
    alert('儲存失敗，請確認姓名與電話皆已填寫');
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

// ==================== 3. 工作行程 (WORKLOGS) ====================
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
      <div class="list-item-card">
        <div class="list-item-top">
          <div class="list-item-info">
            <div class="list-item-title">
              <i class="fa-solid fa-calendar-check" style="color: var(--primary);"></i>
              <span>${w.title}</span>
              <span class="badge ${getStatusBadgeClass(w.status)}">${w.status}</span>
              ${w.customerCategory ? `<span class="badge ${getCategoryBadgeClass(w.customerCategory)}">${w.customerCategory}</span>` : ''}
            </div>
            <div class="list-item-sub">
              <span><i class="fa-solid fa-user"></i> <b>${w.customerName}</b> ${w.customerPhone ? '(' + w.customerPhone + ')' : ''}</span>
              <span><i class="fa-regular fa-clock"></i> 預定: ${formatDateTime(w.scheduledAt)}</span>
              ${w.location ? `<span><i class="fa-solid fa-location-dot" style="color: #ea580c;"></i> ${w.location}</span>` : ''}
            </div>
            ${w.details ? `<div style="font-size: 13.5px; color: #334155; margin-top: 8px; white-space: pre-line; background: #f8fafc; border-left: 3px solid #3b82f6; padding: 8px 12px; border-radius: 4px;">${w.details}</div>` : ''}
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
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

function openWorkLogModal(id = null, preSelectCustomerId = null) {
  document.getElementById('worklog-id').value = id || '';
  document.getElementById('modal-worklog-title').innerHTML = id ? '<i class="fa-solid fa-pen-to-square" style="color: var(--primary);"></i> 編輯工作行程' : '<i class="fa-solid fa-calendar-plus" style="color: var(--primary);"></i> 排定工作行程';
  populateCustomerDropdowns();

  const customerSelect = document.getElementById('worklog-customer');
  const lockedHint = document.getElementById('worklog-customer-locked-hint');

  if (preSelectCustomerId) {
    customerSelect.value = preSelectCustomerId;
    customerSelect.disabled = true;
    if (lockedHint) lockedHint.style.display = 'inline';
  } else {
    customerSelect.disabled = false;
    if (lockedHint) lockedHint.style.display = 'none';
    if (!id) customerSelect.value = '';
  }

  if (!id) {
    document.getElementById('worklog-title-input').value = '';
    const nowIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    document.getElementById('worklog-time').value = nowIso;
    document.getElementById('worklog-location').value = '';
    document.getElementById('worklog-status').value = '待處理';
    document.getElementById('worklog-details').value = '';
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

  document.getElementById('worklog-title-input').value = w.title || '';
  document.getElementById('worklog-time').value = w.scheduledAt ? w.scheduledAt.substring(0, 16) : '';
  document.getElementById('worklog-location').value = w.location || '';
  document.getElementById('worklog-status').value = w.status || '待處理';
  document.getElementById('worklog-details').value = w.details || '';

  openModal('modal-worklog');
}

async function saveWorkLog() {
  const id = document.getElementById('worklog-id').value;
  const title = document.getElementById('worklog-title-input').value.trim();
  const scheduledAt = document.getElementById('worklog-time').value;
  const customerIdVal = document.getElementById('worklog-customer').value;

  if (!title) {
    alert('請填寫工作標題');
    return;
  }

  const payload = {
    id: id ? parseInt(id) : 0,
    customerId: customerIdVal ? parseInt(customerIdVal) : null,
    title,
    scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : new Date().toISOString(),
    location: document.getElementById('worklog-location').value.trim(),
    status: document.getElementById('worklog-status').value,
    details: document.getElementById('worklog-details').value.trim()
  };

  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/worklogs/${id}` : '/api/worklogs';

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
    alert('儲存失敗');
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

function openQuotationModal(id = null, preSelectCustomerId = null) {
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
  } else {
    customerSelect.disabled = false;
    if (lockedHint) lockedHint.style.display = 'none';
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

  const payload = {
    id: id ? parseInt(id) : 0,
    quotationNumber: document.getElementById('quotation-number').value.trim(),
    customerId: parseInt(customerId),
    title,
    issueDate: new Date(document.getElementById('quotation-date').value).toISOString(),
    status: document.getElementById('quotation-status').value,
    notes: document.getElementById('quotation-notes').value.trim(),
    items
  };

  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/quotations/${id}` : '/api/quotations';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    closeModal('modal-quotation');
    loadQuotations();
  } else {
    alert('儲存報價單失敗');
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
              ${p.invoiceNumber ? `<span><i class="fa-solid fa-receipt"></i> 發票: ${p.invoiceNumber}</span>` : ''}
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

function openPaymentModal(id = null, preSelectCustomerId = null) {
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
  } else {
    customerSelect.disabled = false;
    lockedInput.value = '';
    if (lockedHint) lockedHint.style.display = 'none';
    if (optionalHint) optionalHint.style.display = 'inline';
    if (!id) customerSelect.value = '';
  }

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

  document.getElementById('payment-title-input').value = p.title || '';
  document.getElementById('payment-amount').value = p.amount;
  document.getElementById('payment-date').value = p.paymentDate ? p.paymentDate.slice(0, 10) : '';
  document.getElementById('payment-method').value = p.paymentMethod || '現金';
  document.getElementById('payment-status').value = p.status || '已收款';
  document.getElementById('payment-invoice').value = p.invoiceNumber || '';
  document.getElementById('payment-notes').value = p.notes || '';

  openModal('modal-payment');
}

async function savePayment() {
  const id = document.getElementById('payment-id').value;
  const lockedId = document.getElementById('payment-locked-customer-id').value;
  const customerIdVal = lockedId || document.getElementById('payment-customer').value;
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

  const payload = {
    id: id ? parseInt(id) : 0,
    customerId: customerIdVal ? parseInt(customerIdVal) : null,
    title,
    amount,
    paymentDate: new Date(document.getElementById('payment-date').value).toISOString(),
    paymentMethod: document.getElementById('payment-method').value,
    status: document.getElementById('payment-status').value,
    invoiceNumber: document.getElementById('payment-invoice').value.trim(),
    notes: document.getElementById('payment-notes').value.trim()
  };

  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/payments/${id}` : '/api/payments';

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
    alert('儲存收費紀錄失敗');
  }
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
