// Cozy Business Assistant App Logic

// Global State
let customersCache = [];

// Service Worker Registration for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.log('ServiceWorker registration failed: ', err);
    });
  });
}

// Utility: Debounce function for search inputs
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

// Utility: Format currency
function formatCurrency(amount) {
  if (isNaN(amount) || amount === null) return '$0';
  return '$' + Number(amount).toLocaleString('zh-TW');
}

// Utility: Format Date
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// Utility: Format DateTime
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
  // Update nav active classes
  document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(el => {
    if (el.getAttribute('data-tab') === tabName) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Update Views
  document.querySelectorAll('.content-view').forEach(view => {
    view.style.display = 'none';
  });

  const titles = {
    dashboard: '儀表板總覽',
    customers: '客戶資料管理',
    worklogs: '工作與行程紀錄',
    quotations: '報價單管理',
    payments: '收費與帳務紀錄'
  };

  document.getElementById('page-title').innerText = titles[tabName] || 'Cozy 業務助理';
  const targetView = document.getElementById(`view-${tabName}`);
  if (targetView) targetView.style.display = 'block';

  // Load specific data on tab change
  if (tabName === 'dashboard') loadDashboard();
  if (tabName === 'customers') loadCustomers();
  if (tabName === 'worklogs') loadWorkLogs();
  if (tabName === 'quotations') loadQuotations();
  if (tabName === 'payments') loadPayments();
}

// ==================== DASHBOARD ====================
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
          <div class="list-item-info">
            <div class="list-item-title">
              <span>${item.title}</span>
              <span class="badge ${getStatusBadgeClass(item.status)}">${item.status}</span>
            </div>
            <div class="list-item-sub">
              <span><i class="fa-regular fa-clock"></i> ${formatDateTime(item.scheduledAt)}</span>
              <span><i class="fa-solid fa-user"></i> ${item.customerName}</span>
            </div>
          </div>
        </div>
      `).join('');
    } else {
      todayList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">今日尚無排定行程</p>';
    }

    // Render recent payments
    const recentList = document.getElementById('recent-payments-list');
    if (data.recentPayments && data.recentPayments.length > 0) {
      recentList.innerHTML = data.recentPayments.map(p => `
        <div class="list-item-card">
          <div class="list-item-info">
            <div class="list-item-title">
              <span>${p.title}</span>
              <span style="color: var(--success); font-weight: 700;">+${formatCurrency(p.amount)}</span>
            </div>
            <div class="list-item-sub">
              <span><i class="fa-regular fa-calendar"></i> ${formatDate(p.paymentDate)}</span>
              <span><i class="fa-solid fa-user"></i> ${p.customerName}</span>
              <span class="badge ${p.status === '已收款' ? 'badge-success' : 'badge-warning'}">${p.status}</span>
            </div>
          </div>
        </div>
      `).join('');
    } else {
      recentList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">尚無收費紀錄</p>';
    }
  } catch (err) {
    console.error('Error loading dashboard stats:', err);
  }
}

// ==================== CUSTOMERS ====================
async function loadCustomers() {
  const search = document.getElementById('customer-search').value;
  try {
    const res = await fetch(`/api/customers?search=${encodeURIComponent(search || '')}`);
    const data = await res.json();
    customersCache = data;

    // Populate dropdowns across app
    populateCustomerDropdowns();

    const listEl = document.getElementById('customers-list');
    if (data.length === 0) {
      listEl.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">尚無客戶資料，點擊右上角新增客戶</p>';
      return;
    }

    listEl.innerHTML = data.map(c => `
      <div class="list-item-card">
        <div class="list-item-info">
          <div class="list-item-title">
            <i class="fa-solid fa-user-tie" style="color: var(--primary);"></i>
            <span>${c.name}</span>
          </div>
          <div class="list-item-sub">
            ${c.phone ? `<span><i class="fa-solid fa-phone"></i> ${c.phone}</span>` : ''}
            ${c.lineId ? `<span><i class="fa-brands fa-line" style="color: #00c300;"></i> ${c.lineId}</span>` : ''}
            ${c.address ? `<span><i class="fa-solid fa-location-dot"></i> ${c.address}</span>` : ''}
          </div>
          ${c.notes ? `<div style="font-size: 12px; color: #475569; margin-top: 4px; background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">備註: ${c.notes}</div>` : ''}
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-sm btn-secondary" onclick="editCustomer(${c.id})"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-sm btn-danger" onclick="deleteCustomer(${c.id}, '${c.name}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading customers:', err);
  }
}

function populateCustomerDropdowns() {
  const dropdownIds = ['worklog-customer', 'quotation-customer', 'payment-customer', 'quick-payment-customer'];
  dropdownIds.forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">-- 請選擇客戶 --</option>' +
      customersCache.map(c => `<option value="${c.id}">${c.name} ${c.phone ? '(' + c.phone + ')' : ''}</option>`).join('');
    if (currentVal) select.value = currentVal;
  });
}

function openCustomerModal(id = null) {
  document.getElementById('customer-id').value = id || '';
  document.getElementById('modal-customer-title').innerText = id ? '編輯客戶資料' : '新增客戶資料';
  if (!id) {
    document.getElementById('customer-name').value = '';
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
  document.getElementById('customer-phone').value = customer.phone || '';
  document.getElementById('customer-line').value = customer.lineId || '';
  document.getElementById('customer-address').value = customer.address || '';
  document.getElementById('customer-email').value = customer.email || '';
  document.getElementById('customer-notes').value = customer.notes || '';
  document.getElementById('modal-customer-title').innerText = '編輯客戶資料';
  openModal('modal-customer');
}

async function saveCustomer() {
  const id = document.getElementById('customer-id').value;
  const name = document.getElementById('customer-name').value.trim();
  if (!name) {
    alert('請輸入客戶姓名');
    return;
  }

  const payload = {
    id: id ? parseInt(id) : 0,
    name,
    phone: document.getElementById('customer-phone').value.trim(),
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
    alert('儲存失敗，請檢查輸入內容');
  }
}

async function deleteCustomer(id, name) {
  if (!confirm(`確定要刪除客戶「${name}」嗎？這將同時刪除該客戶所有相關紀錄。`)) return;
  const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
  if (res.ok) {
    loadCustomers();
    loadDashboard();
  } else {
    alert('刪除失敗');
  }
}

// ==================== WORK LOGS ====================
async function loadWorkLogs() {
  const search = document.getElementById('worklog-search').value;
  const status = document.getElementById('worklog-status-filter').value;
  try {
    const res = await fetch(`/api/worklogs?search=${encodeURIComponent(search || '')}&status=${encodeURIComponent(status || '')}`);
    const data = await res.json();
    const listEl = document.getElementById('worklogs-list');

    if (data.length === 0) {
      listEl.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">無符合的工作行程記錄</p>';
      return;
    }

    listEl.innerHTML = data.map(w => `
      <div class="list-item-card">
        <div class="list-item-info">
          <div class="list-item-title">
            <span>${w.title}</span>
            <span class="badge ${getStatusBadgeClass(w.status)}">${w.status}</span>
          </div>
          <div class="list-item-sub">
            <span><i class="fa-solid fa-user"></i> ${w.customerName}</span>
            <span><i class="fa-regular fa-clock"></i> ${formatDateTime(w.scheduledAt)}</span>
            ${w.location ? `<span><i class="fa-solid fa-location-dot"></i> ${w.location}</span>` : ''}
          </div>
          ${w.details ? `<div style="font-size: 13px; color: #334155; margin-top: 6px; white-space: pre-line;">${w.details}</div>` : ''}
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-sm btn-secondary" onclick="editWorkLog(${w.id})"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-sm btn-danger" onclick="deleteWorkLog(${w.id})"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading worklogs:', err);
  }
}

function openWorkLogModal(id = null) {
  document.getElementById('worklog-id').value = id || '';
  document.getElementById('modal-worklog-title').innerText = id ? '編輯工作行程' : '新增工作行程';
  populateCustomerDropdowns();

  if (!id) {
    document.getElementById('worklog-customer').value = '';
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
  document.getElementById('modal-worklog-title').innerText = '編輯工作行程';
  populateCustomerDropdowns();

  document.getElementById('worklog-customer').value = w.customerId || '';
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

// ==================== QUOTATIONS ====================
async function loadQuotations() {
  const search = document.getElementById('quotation-search').value;
  const status = document.getElementById('quotation-status-filter').value;
  try {
    const res = await fetch(`/api/quotations?search=${encodeURIComponent(search || '')}&status=${encodeURIComponent(status || '')}`);
    const data = await res.json();
    const listEl = document.getElementById('quotations-list');

    if (data.length === 0) {
      listEl.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">尚無報價單，點擊建立報價單</p>';
      return;
    }

    listEl.innerHTML = data.map(q => `
      <div class="list-item-card">
        <div class="list-item-info">
          <div class="list-item-title">
            <span style="color: var(--primary); font-family: monospace;">[${q.quotationNumber}]</span>
            <span>${q.title}</span>
            <span class="badge ${getQuotationBadgeClass(q.status)}">${q.status}</span>
          </div>
          <div class="list-item-sub">
            <span><i class="fa-solid fa-user"></i> ${q.customerName}</span>
            <span><i class="fa-regular fa-calendar"></i> ${formatDate(q.issueDate)}</span>
            <span style="font-weight: 700; color: var(--text-main); font-size: 15px;">總計: ${formatCurrency(q.totalAmount)}</span>
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-sm btn-primary" onclick="viewQuotation(${q.id})"><i class="fa-solid fa-eye"></i> 預覽</button>
          <button class="btn btn-sm btn-secondary" onclick="editQuotation(${q.id})"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-sm btn-danger" onclick="deleteQuotation(${q.id})"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading quotations:', err);
  }
}

function openQuotationModal() {
  document.getElementById('quotation-id').value = '';
  document.getElementById('modal-quotation-title').innerText = '建立報價單';
  document.getElementById('quotation-number').value = '';
  document.getElementById('quotation-title-input').value = '';
  document.getElementById('quotation-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('quotation-status').value = '草稿';
  document.getElementById('quotation-notes').value = '報價有效期限 14 天。\n確認簽回後開工，完工結算付清。';
  
  populateCustomerDropdowns();

  // Reset items with one default row
  const tbody = document.getElementById('quotation-items-body');
  tbody.innerHTML = '';
  addQuotationRow('標準服務項目', 1, 5000);
  calculateQuotationTotal();

  openModal('modal-quotation');
}

function addQuotationRow(name = '', qty = 1, price = 0) {
  const tbody = document.getElementById('quotation-items-body');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="form-input item-name" style="width:100%" value="${name}" placeholder="服務或產品名稱" required></td>
    <td><input type="number" class="form-input item-qty" style="width:100%" value="${qty}" min="1" step="1" oninput="calculateQuotationTotal()"></td>
    <td><input type="number" class="form-input item-price" style="width:100%" value="${price}" min="0" step="1" oninput="calculateQuotationTotal()"></td>
    <td class="item-subtotal" style="font-weight:600; vertical-align: middle;">$0</td>
    <td><button type="button" class="btn btn-sm btn-danger" onclick="this.closest('tr').remove(); calculateQuotationTotal();">&times;</button></td>
  `;
  tbody.appendChild(tr);
  calculateQuotationTotal();
}

function calculateQuotationTotal() {
  const rows = document.querySelectorAll('#quotation-items-body tr');
  let grandTotal = 0;

  rows.forEach(row => {
    const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
    const price = parseFloat(row.querySelector('.item-price').value) || 0;
    const subtotal = qty * price;
    row.querySelector('.item-subtotal').innerText = formatCurrency(subtotal);
    grandTotal += subtotal;
  });

  document.getElementById('quotation-total-display').innerText = formatCurrency(grandTotal);
}

async function saveQuotation() {
  const id = document.getElementById('quotation-id').value;
  const customerId = document.getElementById('quotation-customer').value;
  const title = document.getElementById('quotation-title-input').value.trim();

  if (!customerId) {
    alert('請選擇客戶');
    return;
  }
  if (!title) {
    alert('請輸入報價單名稱');
    return;
  }

  // Collect items
  const items = [];
  const rows = document.querySelectorAll('#quotation-items-body tr');
  rows.forEach(row => {
    const name = row.querySelector('.item-name').value.trim();
    const qty = parseFloat(row.querySelector('.item-qty').value) || 1;
    const price = parseFloat(row.querySelector('.item-price').value) || 0;
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
    alert('請至少加入一個報價品項');
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
  document.getElementById('modal-quotation-title').innerText = '編輯報價單';
  document.getElementById('quotation-number').value = q.quotationNumber || '';
  populateCustomerDropdowns();
  document.getElementById('quotation-customer').value = q.customerId;
  document.getElementById('quotation-title-input').value = q.title || '';
  document.getElementById('quotation-date').value = q.issueDate ? q.issueDate.slice(0, 10) : '';
  document.getElementById('quotation-status').value = q.status || '草稿';
  document.getElementById('quotation-notes').value = q.notes || '';

  const tbody = document.getElementById('quotation-items-body');
  tbody.innerHTML = '';
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
        <h2 style="color: #2563eb; font-size: 26px; margin-bottom: 4px;">報 價 單</h2>
        <div style="font-size: 14px; color: #64748b;">單號：<b>${q.quotationNumber}</b></div>
      </div>
      <div style="text-align: right; font-size: 14px;">
        <div>報價日期：${formatDate(q.issueDate)}</div>
        <div>狀態：<span class="badge ${getQuotationBadgeClass(q.status)}">${q.status}</span></div>
      </div>
    </div>

    <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
      <h3 style="font-size: 16px; margin-bottom: 8px;">客戶資料</h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 14px;">
        <div>客戶姓名：<b>${q.customer ? q.customer.name : '未指定'}</b></div>
        <div>聯絡電話：${q.customer && q.customer.phone ? q.customer.phone : '無'}</div>
        <div>地址：${q.customer && q.customer.address ? q.customer.address : '無'}</div>
        <div>專案名稱：<b>${q.title}</b></div>
      </div>
    </div>

    <table class="items-table" style="margin-bottom: 20px;">
      <thead>
        <tr>
          <th>項目說明</th>
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
            <td style="text-align: right; font-weight: 600;">${formatCurrency(item.subtotal)}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr style="background: #eff6ff; font-weight: 700; font-size: 16px;">
          <td colspan="3" style="text-align: right;">報價總金額 (TWD)：</td>
          <td style="text-align: right; color: #2563eb;">${formatCurrency(q.totalAmount)}</td>
        </tr>
      </tfoot>
    </table>

    ${q.notes ? `
      <div style="font-size: 13px; color: #475569; background: #fff; border: 1px dashed #cbd5e1; padding: 12px; border-radius: 6px;">
        <b>備註與條款：</b><br>
        <div style="white-space: pre-line; margin-top: 4px;">${q.notes}</div>
      </div>
    ` : ''}

    <div style="margin-top: 40px; display: flex; justify-content: space-between; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 14px;">
      <div>報價方簽章：__________________</div>
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

// ==================== PAYMENTS ====================
async function loadPayments() {
  const search = document.getElementById('payment-search').value;
  const status = document.getElementById('payment-status-filter').value;
  try {
    const res = await fetch(`/api/payments?search=${encodeURIComponent(search || '')}&status=${encodeURIComponent(status || '')}`);
    const data = await res.json();
    const listEl = document.getElementById('payments-list');

    if (data.length === 0) {
      listEl.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">尚無收費記錄</p>';
      return;
    }

    listEl.innerHTML = data.map(p => `
      <div class="list-item-card">
        <div class="list-item-info">
          <div class="list-item-title">
            <span>${p.title}</span>
            <span style="color: var(--success); font-size: 17px; font-weight: 700;">+${formatCurrency(p.amount)}</span>
            <span class="badge ${p.status === '已收款' ? 'badge-success' : 'badge-warning'}">${p.status}</span>
          </div>
          <div class="list-item-sub">
            <span><i class="fa-solid fa-user"></i> ${p.customerName}</span>
            <span><i class="fa-solid fa-money-bill-transfer"></i> ${p.paymentMethod}</span>
            <span><i class="fa-regular fa-calendar"></i> ${formatDate(p.paymentDate)}</span>
            ${p.invoiceNumber ? `<span><i class="fa-solid fa-file-invoice"></i> 發票: ${p.invoiceNumber}</span>` : ''}
          </div>
          ${p.notes ? `<div style="font-size: 12px; color: #64748b; margin-top: 4px;">備註: ${p.notes}</div>` : ''}
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-sm btn-secondary" onclick="editPayment(${p.id})"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-sm btn-danger" onclick="deletePayment(${p.id})"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading payments:', err);
  }
}

function openPaymentModal(id = null) {
  document.getElementById('payment-id').value = id || '';
  document.getElementById('modal-payment-title').innerText = id ? '編輯收費紀錄' : '新增收費紀錄';
  populateCustomerDropdowns();

  if (!id) {
    document.getElementById('payment-customer').value = '';
    document.getElementById('payment-title-input').value = '';
    document.getElementById('payment-amount').value = '5000';
    document.getElementById('payment-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('payment-method').value = '匯款';
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
  document.getElementById('modal-payment-title').innerText = '編輯收費紀錄';
  populateCustomerDropdowns();

  document.getElementById('payment-customer').value = p.customerId;
  document.getElementById('payment-title-input').value = p.title || '';
  document.getElementById('payment-amount').value = p.amount;
  document.getElementById('payment-date').value = p.paymentDate ? p.paymentDate.slice(0, 10) : '';
  document.getElementById('payment-method').value = p.paymentMethod || '匯款';
  document.getElementById('payment-status').value = p.status || '已收款';
  document.getElementById('payment-invoice').value = p.invoiceNumber || '';
  document.getElementById('payment-notes').value = p.notes || '';

  openModal('modal-payment');
}

async function savePayment() {
  const id = document.getElementById('payment-id').value;
  const customerId = document.getElementById('payment-customer').value;
  const title = document.getElementById('payment-title-input').value.trim();
  const amount = parseFloat(document.getElementById('payment-amount').value);

  if (!customerId) {
    alert('請選擇客戶');
    return;
  }
  if (!title) {
    alert('請填寫收費項目說明');
    return;
  }
  if (isNaN(amount) || amount < 0) {
    alert('請填寫有效的收費金額');
    return;
  }

  const payload = {
    id: id ? parseInt(id) : 0,
    customerId: parseInt(customerId),
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

  if (!customerId) {
    alert('請選擇客戶');
    return;
  }
  if (!title) {
    alert('請輸入項目說明');
    return;
  }

  const payload = {
    customerId: parseInt(customerId),
    title,
    amount,
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

// Helpers
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
