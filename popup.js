// NetSuite Fast Time Tracker — popup script
// Uses the real save API (script=2373, opType=saveAll) discovered from the
// actual page source.

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoToNS(iso) {
  const [y, m, d] = iso.split('-');
  return `${parseInt(m)}/${parseInt(d)}/${y}`;
}

// Get Monday of the week containing a given ISO date
function getMondayOfWeek(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Convert hours decimal to HH:MM string (NS format)
function hoursToNSTime(h) {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}:${String(mins).padStart(2, '0')}`;
}

// Determine which day-key a date falls on relative to its week's Monday
function dateToDayKey(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  const monday = new Date(getMondayOfWeek(isoDate) + 'T00:00:00');
  const diff = Math.round((d - monday) / 86400000);
  return DAYS[diff] || null;
}

function setStatus(msg, type) {
  const el = document.getElementById('statusMsg');
  el.textContent = msg;
  el.className = `status ${type}`;
}
function clearStatus() {
  const el = document.getElementById('statusMsg');
  el.className = 'status';
  el.textContent = '';
}

// ── Chrome messaging ──────────────────────────────────────────────────────────

function sendMsg(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (resp && resp.error) return reject(new Error(resp.error));
      resolve(resp);
    });
  });
}

// ── Local storage ─────────────────────────────────────────────────────────────

async function getCached() {
  return new Promise((res) =>
    chrome.storage.local.get(['initData', 'initCachedAt', 'recentEntries'], res)
  );
}

async function saveRecent(entry) {
  const { recentEntries = [] } = await getCached();
  chrome.storage.local.set({ recentEntries: [entry, ...recentEntries].slice(0, 8) });
}

// ── Init data (projects + tasks) ──────────────────────────────────────────────

let _projects = [];    // [{ id, name, raw }]
let _tasks = {};       // { 'projectId': [{ id, name }] }
let _employees = [];   // [{ id, name }]
let _userId = '';

async function loadInitData(forceRefresh = false) {
  const { initData, initCachedAt } = await getCached();
  const age = Date.now() - (initCachedAt || 0);
  const stale = age > 3_600_000;

  if (initData && !stale && !forceRefresh) {
    parseInitData(initData);
    return;
  }

  try {
    // Step 1: get userid from init endpoint
    const initResp = await sendMsg({ type: 'FETCH_INIT' });
    if (!initResp.ok) throw new Error(`HTTP ${initResp.status}`);
    let initRaw = initResp.text.trim();
    initRaw = initRaw.substring(0, initRaw.lastIndexOf('}') + 1);
    const initJson = JSON.parse(initRaw);
    _userId = String(initJson.userid || '');
    _employees = (initJson.employees || []).map((e) => ({ id: String(e.internalid), name: e.display }));

    // Step 2: get projects + tasks from the time/week endpoint
    const today = todayISO();
    const weekStart = isoToNS(getMondayOfWeek(today));
    const weekResp = await sendMsg({ type: 'FETCH_WEEK', weekStart, userId: _userId });
    if (!weekResp.ok) throw new Error(`HTTP ${weekResp.status}`);
    let weekRaw = weekResp.text.replace(/<!--[\s\S]*$/, '').trim();

    chrome.storage.local.set({ initData: weekRaw, initCachedAt: Date.now() });
    parseInitData(weekRaw);
  } catch (err) {
    console.error('Failed to load init data:', err);
    setStatus('Could not load projects. Check your NS session.', 'error');
  }
}

function parseInitData(rawJson) {
  try {
    const data = JSON.parse(rawJson);

    // Use projectsorig = only the user's assigned projects
    const projArray = data.projectsorig || [];
    _projects = projArray.map((p) => ({
      id: String(p.internalid || '').split('|')[0],
      raw: String(p.internalid || ''),
      name: p.display || String(p.internalid),
    }));

    // Tasks keyed by numeric project id
    const rawTasks = data.projecttasksorig || {};
    _tasks = {};
    Object.entries(rawTasks).forEach(([pid, arr]) => {
      if (Array.isArray(arr)) {
        _tasks[String(pid)] = arr.map((t) => ({
          id: String(t.internalid || '').split('|')[0],
          raw: String(t.internalid || ''),
          name: t.display || String(t.internalid),
        }));
      }
    });

    populateProjects();
    populateEmployees();
  } catch (err) {
    console.error('Failed to parse init data:', err, rawJson?.substring(0, 200));
    setStatus('Failed to parse project data. Try refreshing.', 'error');
  }
}

function populateProjects() {
  const sel = document.getElementById('project');
  sel.innerHTML = '<option value="">— Select project —</option>';
  _projects.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    sel.appendChild(opt);
  });
}

function populateEmployees() {
  const sel = document.getElementById('employee');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Myself —</option>';
  _employees.forEach((e) => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = e.name;
    sel.appendChild(opt);
  });
  if (_userId) sel.value = _userId;
}

function populateTasks(projectId) {
  const sel = document.getElementById('task');
  sel.innerHTML = '<option value="">— No specific task —</option>';
  const tasks = _tasks[projectId] || [];
  tasks.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    sel.appendChild(opt);
  });
}

// ── Recent entries ────────────────────────────────────────────────────────────

function renderRecent(entries) {
  const container = document.getElementById('recentEntries');
  if (!entries || entries.length === 0) {
    container.innerHTML = '<div class="empty-recent">No recent entries yet</div>';
    return;
  }
  container.innerHTML = '';
  entries.forEach((e) => {
    const div = document.createElement('div');
    div.className = 'recent-entry';
    div.title = 'Click to pre-fill';
    div.innerHTML = `
      <div class="entry-info">
        <strong>${e.date}</strong> · <span style="color:#555">${e.projectName || e.projectId || ''}</span>
        ${e.memo ? `<br><span style="color:#999;font-size:11px">${e.memo.substring(0, 45)}${e.memo.length > 45 ? '…' : ''}</span>` : ''}
      </div>
      <div class="entry-hours">${e.hours}h</div>
    `;
    div.addEventListener('click', () => {
      document.getElementById('hours').value = e.hours;
      document.getElementById('memo').value = e.memo || '';
      document.getElementById('date').value = e.date;
      if (e.projectId) {
        document.getElementById('project').value = e.projectId;
        populateTasks(e.projectId);
        if (e.taskId) {
          setTimeout(() => { document.getElementById('task').value = e.taskId; }, 50);
        }
      }
      updateQuickButtons(e.hours);
    });
    container.appendChild(div);
  });
}

function updateQuickButtons(val) {
  document.querySelectorAll('.quick-hours button').forEach((btn) =>
    btn.classList.toggle('active', parseFloat(btn.dataset.hours) === parseFloat(val))
  );
}

// ── Submit ────────────────────────────────────────────────────────────────────

async function submitEntry(formData) {
  const dayKey = dateToDayKey(formData.date);
  if (!dayKey) throw new Error('Could not determine day of week for this date');

  // Use raw internalid values (with pipe metadata) that NS expects
  const projRaw = _projects.find((p) => p.id === formData.projectId)?.raw || formData.projectId;
  const taskRaw = (_tasks[formData.projectId] || []).find((t) => t.id === formData.taskId)?.raw || formData.taskId;

  const weekStart = isoToNS(getMondayOfWeek(formData.date));

  const lines = DAYS.map((d) => ({
    day: d,
    hours: d === dayKey ? hoursToNSTime(parseFloat(formData.hours)) : '',
    memo: d === dayKey ? (formData.memo || '') : '',
    timeid: '',
    saved: '',
    timeapproved: '',
  }));

  const block = {
    blockid: 'ft_' + Date.now(),
    projectid: projRaw || '',
    projecttaskid: taskRaw || '',
    employeeid: formData.employeeId || _userId || '',
    weekstart: weekStart,
    lines,
    memo: formData.memo || '',
    billable: '', nonbillable: '',
    classid: '', deptid: '', locationid: '',
    itemid: '', rateid: '',
  };

  const resp = await sendMsg({ type: 'SAVE_ALL', payload: [block] });
  return resp;
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('date').value = todayISO();

  // Quick-hour buttons
  document.getElementById('quickHours').addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') return;
    const h = e.target.dataset.hours;
    document.getElementById('hours').value = h;
    updateQuickButtons(h);
  });

  document.getElementById('hours').addEventListener('input', (e) => {
    updateQuickButtons(e.target.value);
  });

  // Project → tasks
  document.getElementById('project').addEventListener('change', (e) => {
    populateTasks(e.target.value);
  });

  // Load data in parallel
  const { recentEntries = [] } = await getCached();
  renderRecent(recentEntries);
  await loadInitData();

  // Form submit
  document.getElementById('timeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearStatus();

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    setStatus('Submitting…', 'loading');

    const projectEl = document.getElementById('project');
    const taskEl = document.getElementById('task');
    const projectId = projectEl.value;
    const taskId = taskEl.value;
    const projectName = projectEl.options[projectEl.selectedIndex]?.text || projectId;
    const employeeEl = document.getElementById('employee');
    const employeeId = employeeEl ? employeeEl.value : _userId;

    const formData = {
      date: document.getElementById('date').value,
      hours: document.getElementById('hours').value,
      projectId,
      taskId,
      projectName,
      employeeId,
      memo: document.getElementById('memo').value.trim(),
    };

    try {
      const result = await submitEntry(formData);
      const text = result.text || '';

      // Check response for errors
      let hasError = false;
      let errMsg = '';
      try {
        const parsed = JSON.parse(text);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of arr) {
          if (item.errors && item.errors !== '' && item.errors !== 'Saving success.') {
            hasError = true;
            errMsg = item.errors;
          }
        }
      } catch {
        // Non-JSON response
        if (!result.ok) hasError = true;
      }

      if (!hasError && result.ok) {
        setStatus('✓ Time saved successfully!', 'success');
        await saveRecent({ ...formData, timestamp: Date.now() });
        const { recentEntries: updated = [] } = await getCached();
        renderRecent(updated);
        // Clear hours and memo, keep project/date
        document.getElementById('hours').value = '';
        document.getElementById('memo').value = '';
        updateQuickButtons(null);
      } else {
        setStatus(`Error: ${errMsg || `HTTP ${result.status}`}`, 'error');
        console.error('Save failed:', text);
      }
    } catch (err) {
      setStatus(`Error: ${err.message}`, 'error');
      console.error('Submit error:', err);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Log Time';
    }
  });

  // Refresh projects
  document.getElementById('refreshBtn').addEventListener('click', async () => {
    setStatus('Refreshing…', 'loading');
    await loadInitData(true);
    clearStatus();
  });

  // Open original page
  document.getElementById('openNSBtn').addEventListener('click', () => {
    chrome.tabs.create({
      url: 'https://3851137.app.netsuite.com/app/site/hosting/scriptlet.nl?script=2375&deploy=1',
    });
  });
});
