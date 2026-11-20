(() => {
  'use strict';

  const STORAGE_KEY = 'attendance-helper-v1';
  const COLORS = ['#285f4c', '#c66c42', '#5579a1', '#8a628c', '#a1843c', '#536b59'];
  const moneyFormatter = new Intl.NumberFormat('zh-TW', {
    style: 'currency', currency: 'TWD', maximumFractionDigits: 0
  });

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const el = (id) => document.getElementById(id);

  let state = loadState();
  let selectedEmployeeId = state.employees[0]?.id || null;
  let selectedColor = COLORS[0];
  let deletingEmployeeId = null;
  let installPrompt = null;
  let toastTimer = null;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.employees) && Array.isArray(saved.records)) return saved;
    } catch (error) {
      console.warn('Unable to read saved data', error);
    }
    return { employees: [], records: [] };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function initials(name) {
    return [...name.trim()].slice(0, 2).join('').toUpperCase();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[char]);
  }

  function localDateKey(dateLike = new Date()) {
    const date = new Date(dateLike);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function currentMonthKey() {
    return localDateKey().slice(0, 7);
  }

  function formatTime(dateLike) {
    return new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(dateLike));
  }

  function formatDate(dateLike) {
    return new Intl.DateTimeFormat('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(dateLike));
  }

  function durationHours(record, live = false) {
    const end = record.clockOut ? new Date(record.clockOut) : (live ? new Date() : new Date(record.clockIn));
    return Math.max(0, (end - new Date(record.clockIn)) / 3600000);
  }

  function formatDuration(hours) {
    const minutes = Math.round(hours * 60);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (!h) return `${m} 分鐘`;
    return m ? `${h} 小時 ${m} 分` : `${h} 小時`;
  }

  function getEmployee(employeeId) {
    return state.employees.find((employee) => employee.id === employeeId);
  }

  function employeeSnapshot(record) {
    const employee = getEmployee(record.employeeId);
    return {
      name: employee?.name || record.employeeName || '已刪除員工',
      color: employee?.color || record.employeeColor || '#777777',
      hourlyRate: Number(record.hourlyRate ?? employee?.hourlyRate ?? 0)
    };
  }

  function activeRecord(employeeId) {
    return state.records.find((record) => record.employeeId === employeeId && !record.clockOut);
  }

  function showToast(message) {
    const toast = el('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
  }

  function updateClock() {
    const now = new Date();
    el('liveClock').textContent = new Intl.DateTimeFormat('zh-TW', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(now);
    el('fullDate').textContent = new Intl.DateTimeFormat('zh-TW', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
    }).format(now);
    renderSelectedState();
  }

  function goToPage(pageId) {
    $$('.page').forEach((page) => page.classList.toggle('active', page.id === pageId));
    $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.page === pageId));
    if (pageId === 'recordsPage') renderRecords();
    if (pageId === 'employeesPage') renderEmployees();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderAll() {
    if (selectedEmployeeId && !getEmployee(selectedEmployeeId)) selectedEmployeeId = state.employees[0]?.id || null;
    renderEmployeePicker();
    renderSelectedState();
    renderTodayActivity();
    renderEmployees();
    renderRecordFilters();
    renderRecords();
  }

  function renderEmployeePicker() {
    const picker = el('employeePicker');
    const empty = el('employeeEmptyState');
    picker.innerHTML = state.employees.map((employee) => `
      <button class="employee-chip ${employee.id === selectedEmployeeId ? 'selected' : ''}" type="button" role="option" aria-selected="${employee.id === selectedEmployeeId}" data-select-employee="${employee.id}">
        <span class="mini-avatar" style="background:${employee.color}">${escapeHtml(initials(employee.name))}</span>
        ${escapeHtml(employee.name)}
      </button>
    `).join('');
    empty.hidden = state.employees.length > 0;
    picker.hidden = !state.employees.length;
  }

  function renderSelectedState() {
    const employee = getEmployee(selectedEmployeeId);
    const summary = el('selectedSummary');
    const clockInButton = el('clockInButton');
    const clockOutButton = el('clockOutButton');
    summary.hidden = !employee;
    clockInButton.disabled = !employee;
    clockOutButton.disabled = true;
    if (!employee) return;

    const active = activeRecord(employee.id);
    el('selectedEmployeeName').textContent = employee.name;
    const status = el('selectedStatus');
    if (active) {
      status.textContent = `工作中 · ${formatDuration(durationHours(active, true))}`;
      status.classList.add('working');
      clockInButton.disabled = true;
      clockOutButton.disabled = false;
    } else {
      status.textContent = '尚未上班';
      status.classList.remove('working');
      clockInButton.disabled = false;
      clockOutButton.disabled = true;
    }
  }

  function renderTodayActivity() {
    const today = localDateKey();
    const activities = [];
    state.records.forEach((record) => {
      const employee = employeeSnapshot(record);
      if (localDateKey(record.clockIn) === today) {
        activities.push({ time: record.clockIn, type: 'in', employee: employee.name });
      }
      if (record.clockOut && localDateKey(record.clockOut) === today) {
        activities.push({ time: record.clockOut, type: 'out', employee: employee.name });
      }
    });
    activities.sort((a, b) => new Date(b.time) - new Date(a.time));
    el('todayCount').textContent = `${activities.length} 筆`;
    el('todayActivity').innerHTML = activities.length ? activities.map((item) => `
      <div class="activity-item">
        <i class="activity-dot ${item.type === 'out' ? 'out' : ''}"></i>
        <div><strong>${escapeHtml(item.employee)}</strong><span>${item.type === 'in' ? '上班打卡' : '下班打卡'}</span></div>
        <time class="activity-time">${formatTime(item.time)}</time>
      </div>
    `).join('') : '<p class="muted-line">今天還沒有打卡動態</p>';
  }

  function renderEmployees() {
    const list = el('employeeList');
    const empty = el('employeeListEmpty');
    empty.hidden = state.employees.length > 0;
    list.hidden = !state.employees.length;
    list.innerHTML = state.employees.map((employee) => {
      const active = activeRecord(employee.id);
      return `
        <article class="employee-item">
          <div class="employee-avatar" style="background:${employee.color}">${escapeHtml(initials(employee.name))}</div>
          <div class="employee-info">
            <h3>${escapeHtml(employee.name)} ${active ? '<span class="working-label">工作中</span>' : ''}</h3>
            <p>時薪 <b>${moneyFormatter.format(employee.hourlyRate)}</b></p>
          </div>
          <div class="employee-actions">
            <button type="button" data-edit-employee="${employee.id}" aria-label="編輯 ${escapeHtml(employee.name)}">編輯</button>
            <button type="button" data-delete-employee="${employee.id}" aria-label="刪除 ${escapeHtml(employee.name)}">刪除</button>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderRecordFilters() {
    const select = el('recordEmployeeFilter');
    const currentValue = select.value || 'all';
    select.innerHTML = '<option value="all">所有員工</option>' + state.employees.map((employee) =>
      `<option value="${employee.id}">${escapeHtml(employee.name)}</option>`
    ).join('');
    select.value = [...select.options].some((option) => option.value === currentValue) ? currentValue : 'all';
    if (!el('recordMonthFilter').value) el('recordMonthFilter').value = currentMonthKey();
  }

  function filteredRecords() {
    const employeeId = el('recordEmployeeFilter').value;
    const month = el('recordMonthFilter').value;
    return state.records
      .filter((record) => employeeId === 'all' || record.employeeId === employeeId)
      .filter((record) => !month || localDateKey(record.clockIn).startsWith(month))
      .sort((a, b) => new Date(b.clockIn) - new Date(a.clockIn));
  }

  function renderRecords() {
    const records = filteredRecords();
    const completed = records.filter((record) => record.clockOut);
    const hours = completed.reduce((sum, record) => sum + durationHours(record), 0);
    const pay = completed.reduce((sum, record) => sum + durationHours(record) * employeeSnapshot(record).hourlyRate, 0);
    el('monthHours').textContent = `${hours.toFixed(1)} 小時`;
    el('monthPay').textContent = moneyFormatter.format(Math.round(pay));
    el('recordEmpty').hidden = records.length > 0;
    el('recordList').hidden = !records.length;

    const groups = records.reduce((map, record) => {
      const key = localDateKey(record.clockIn);
      (map[key] ||= []).push(record);
      return map;
    }, {});

    el('recordList').innerHTML = Object.entries(groups).map(([date, dateRecords]) => {
      const dateHours = dateRecords.filter((record) => record.clockOut).reduce((sum, record) => sum + durationHours(record), 0);
      return `
        <section class="record-group">
          <div class="record-group-date"><strong>${formatDate(`${date}T12:00:00`)}</strong><span>${dateHours.toFixed(1)} 小時</span></div>
          ${dateRecords.map((record) => {
            const employee = employeeSnapshot(record);
            const hours = durationHours(record, true);
            const wage = record.clockOut ? hours * employee.hourlyRate : 0;
            return `
              <article class="record-row">
                <div>
                  <h4><i class="activity-dot" style="background:${employee.color};box-shadow:none"></i>${escapeHtml(employee.name)} ${record.clockOut ? '' : '<span class="working-label">進行中</span>'}</h4>
                  <p>${formatTime(record.clockIn)} → ${record.clockOut ? formatTime(record.clockOut) : '尚未下班'}</p>
                </div>
                <div class="record-pay">
                  <strong>${record.clockOut ? moneyFormatter.format(Math.round(wage)) : '—'}</strong>
                  <span>${formatDuration(hours)}</span>
                </div>
              </article>
            `;
          }).join('')}
        </section>
      `;
    }).join('');
  }

  function openEmployeeModal(employeeId = null) {
    const employee = employeeId ? getEmployee(employeeId) : null;
    el('employeeForm').reset();
    el('employeeId').value = employee?.id || '';
    el('employeeName').value = employee?.name || '';
    el('employeeRate').value = employee?.hourlyRate ?? '';
    selectedColor = employee?.color || COLORS[state.employees.length % COLORS.length];
    el('employeeModalTitle').textContent = employee ? '編輯員工' : '新增員工';
    el('employeeFormError').textContent = '';
    renderColorChoices();
    el('employeeModal').showModal();
    setTimeout(() => el('employeeName').focus(), 50);
  }

  function renderColorChoices() {
    el('colorChoices').innerHTML = COLORS.map((color) => `
      <button class="color-choice ${selectedColor === color ? 'selected' : ''}" type="button" data-color="${color}" style="background:${color}" aria-label="選擇代表顏色"></button>
    `).join('');
  }

  function saveEmployee(event) {
    event.preventDefault();
    const id = el('employeeId').value;
    const name = el('employeeName').value.trim();
    const hourlyRate = Number(el('employeeRate').value);
    if (!name || !Number.isFinite(hourlyRate) || hourlyRate < 0) {
      el('employeeFormError').textContent = '請填寫員工姓名與有效的時薪。';
      return;
    }
    const duplicate = state.employees.some((employee) => employee.id !== id && employee.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      el('employeeFormError').textContent = '已經有同名員工，請使用不同名稱。';
      return;
    }
    if (id) {
      const employee = getEmployee(id);
      Object.assign(employee, { name, hourlyRate, color: selectedColor });
      showToast('員工資料已更新');
    } else {
      const employee = { id: uid(), name, hourlyRate, color: selectedColor, createdAt: new Date().toISOString() };
      state.employees.push(employee);
      selectedEmployeeId = employee.id;
      showToast('員工新增完成');
    }
    saveState();
    el('employeeModal').close();
    renderAll();
  }

  function requestDelete(employeeId) {
    const employee = getEmployee(employeeId);
    if (!employee) return;
    if (activeRecord(employeeId)) {
      showToast('請先替這位員工打下班卡');
      return;
    }
    deletingEmployeeId = employeeId;
    el('confirmMessage').textContent = `「${employee.name}」會從員工名單移除，既有打卡紀錄仍會保留。`;
    el('confirmModal').showModal();
  }

  function confirmDelete() {
    const employee = getEmployee(deletingEmployeeId);
    if (!employee) return;
    state.employees = state.employees.filter((item) => item.id !== deletingEmployeeId);
    if (selectedEmployeeId === deletingEmployeeId) selectedEmployeeId = state.employees[0]?.id || null;
    deletingEmployeeId = null;
    saveState();
    el('confirmModal').close();
    renderAll();
    showToast('員工已刪除，舊紀錄已保留');
  }

  function clockIn() {
    const employee = getEmployee(selectedEmployeeId);
    if (!employee || activeRecord(employee.id)) return;
    state.records.push({
      id: uid(), employeeId: employee.id, employeeName: employee.name, employeeColor: employee.color,
      hourlyRate: employee.hourlyRate, clockIn: new Date().toISOString(), clockOut: null
    });
    saveState();
    renderAll();
    showToast(`${employee.name} 上班打卡成功`);
  }

  function clockOut() {
    const employee = getEmployee(selectedEmployeeId);
    const record = employee ? activeRecord(employee.id) : null;
    if (!record) return;
    record.clockOut = new Date().toISOString();
    saveState();
    renderAll();
    showToast(`${employee.name} 下班打卡成功`);
  }

  function csvCell(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
  }

  function exportCsv() {
    const records = filteredRecords();
    if (!records.length) {
      showToast('目前沒有可下載的紀錄');
      return;
    }
    const headers = ['員工', '日期', '上班時間', '下班時間', '工時（小時）', '時薪', '預估薪資'];
    const rows = records.map((record) => {
      const employee = employeeSnapshot(record);
      const hours = record.clockOut ? durationHours(record) : 0;
      return [
        employee.name, localDateKey(record.clockIn), formatTime(record.clockIn), record.clockOut ? formatTime(record.clockOut) : '進行中',
        record.clockOut ? hours.toFixed(2) : '', employee.hourlyRate, record.clockOut ? Math.round(hours * employee.hourlyRate) : ''
      ];
    });
    const csv = '\uFEFF' + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `打卡紀錄-${el('recordMonthFilter').value || localDateKey()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('CSV 紀錄已下載');
  }

  function bindEvents() {
    $$('.nav-item').forEach((button) => button.addEventListener('click', () => goToPage(button.dataset.page)));
    $$('[data-go-page]').forEach((button) => button.addEventListener('click', () => goToPage(button.dataset.goPage)));
    el('openEmployeeModal').addEventListener('click', () => openEmployeeModal());
    $('[data-open-employee-modal]').addEventListener('click', () => openEmployeeModal());
    el('closeEmployeeModal').addEventListener('click', () => el('employeeModal').close());
    el('employeeForm').addEventListener('submit', saveEmployee);
    el('clockInButton').addEventListener('click', clockIn);
    el('clockOutButton').addEventListener('click', clockOut);
    el('recordEmployeeFilter').addEventListener('change', renderRecords);
    el('recordMonthFilter').addEventListener('change', renderRecords);
    el('exportButton').addEventListener('click', exportCsv);
    el('cancelDelete').addEventListener('click', () => el('confirmModal').close());
    el('confirmDelete').addEventListener('click', confirmDelete);

    document.addEventListener('click', (event) => {
      const selectButton = event.target.closest('[data-select-employee]');
      const editButton = event.target.closest('[data-edit-employee]');
      const deleteButton = event.target.closest('[data-delete-employee]');
      const colorButton = event.target.closest('[data-color]');
      if (selectButton) {
        selectedEmployeeId = selectButton.dataset.selectEmployee;
        renderEmployeePicker();
        renderSelectedState();
      }
      if (editButton) openEmployeeModal(editButton.dataset.editEmployee);
      if (deleteButton) requestDelete(deleteButton.dataset.deleteEmployee);
      if (colorButton) {
        selectedColor = colorButton.dataset.color;
        renderColorChoices();
      }
    });

    [el('employeeModal'), el('confirmModal')].forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
      });
    });

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      installPrompt = event;
      el('installButton').hidden = false;
    });
    el('installButton').addEventListener('click', async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      el('installButton').hidden = true;
    });
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.warn));
    }
  }

  bindEvents();
  renderAll();
  updateClock();
  setInterval(updateClock, 1000);
  registerServiceWorker();
})();
