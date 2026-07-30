// NetSuite Fast Time Tracker — content script
// Intercepts script=2375, replaces it with a fast weekly time entry UI.
// Data comes from script=2373 (the real handler).

(function () {
  'use strict';

  const ACCOUNT_ID = '3851137';
  const HANDLER = `https://${ACCOUNT_ID}.app.netsuite.com/app/site/hosting/scriptlet.nl?script=2373&deploy=1`;
  const TARGET_SCRIPT = '2375';

  if (new URLSearchParams(window.location.search).get('script') !== TARGET_SCRIPT) return;
  if (sessionStorage.getItem('ft_bypass')) { sessionStorage.removeItem('ft_bypass'); return; }

  // ── Date helpers ────────────────────────────────────────────────────────────

  const DAYS = ['mon','tue','wed','thu','fri','sat','sun'];
  const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  function pad(n) { return String(n).padStart(2,'0'); }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  function isoToNS(iso) {
    const [y,m,d] = iso.split('-');
    return `${parseInt(m)}/${parseInt(d)}/${y}`;
  }

  function nsToISO(ns) {
    // "7/31/2025" -> "2025-07-31"
    const [m,d,y] = ns.split('/');
    return `${y}-${pad(m)}-${pad(d)}`;
  }

  function getMondayISO(isoDate) {
    const d = new Date(isoDate + 'T12:00:00');
    const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
    d.setDate(d.getDate() + diff);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  function addDays(isoDate, n) {
    const d = new Date(isoDate + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  function isoToDayKey(iso) {
    const mon = getMondayISO(iso);
    const diff = Math.round((new Date(iso+'T12:00:00') - new Date(mon+'T12:00:00')) / 86400000);
    return DAYS[diff] || null;
  }

  function hoursToNS(h) {
    const hrs = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    return `${hrs}:${pad(mins)}`;
  }

  // Parse "6:00" -> 6.0, "1:30" -> 1.5
  function nsToHours(s) {
    if (!s) return 0;
    const [h,m] = s.split(':').map(Number);
    return h + (m||0)/60;
  }

  function formatHours(h) {
    if (!h) return '';
    const n = parseFloat(h);
    return n === Math.floor(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/,'');
  }

  // ── State ───────────────────────────────────────────────────────────────────

  let _userId = '';
  let _projects = [];   // [{id, raw, name}]  id = numeric part only
  let _tasks = {};      // {projectNumericId: [{id, raw, name}]}
  let _currentWeekISO = getMondayISO(todayISO());

  // weekData[weekMonISO] = { rows: [{projId, taskId, projName, taskName, days:{mon:{hours,memo,timeid,approved}}}] }
  let _weekCache = {};

  // ── API ─────────────────────────────────────────────────────────────────────

  async function apiFetch(url) {
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    return text.replace(/<!--[\s\S]*$/, '').trim();
  }

  async function loadInit() {
    const raw = await apiFetch(`${HANDLER}&requestType=init&opType=fetch`);
    const d = JSON.parse(raw.substring(0, raw.lastIndexOf('}')+1));
    _userId = String(d.userid || '');
    _defaultItemId = String(d.serviceitemtobedefault || '754');
  }

  async function loadWeek(mondayISO) {
    if (_weekCache[mondayISO]) return _weekCache[mondayISO];

    const weekNS = isoToNS(mondayISO);
    const raw = await apiFetch(
      `${HANDLER}&opType=fetch&requestType=time&week=${encodeURIComponent(weekNS)}&employee=${_userId}`
    );
    const data = JSON.parse(raw);

    // Parse projects (only projectsorig = user's assigned ones)
    _projects = (data.projectsorig || []).map(p => ({
      id:   p.internalid.split('|')[0],
      raw:  p.internalid,
      name: p.display,
    }));

    // Parse tasks — keyed by numeric project id (string)
    _tasks = {};
    const rawTasks = data.projecttasksorig || {};
    for (const [pid, arr] of Object.entries(rawTasks)) {
      _tasks[pid] = (arr || []).map(t => ({
        id:   t.internalid.split('|')[0],
        raw:  t.internalid,
        name: t.display,
      }));
    }

    // Parse time entries
    // key format: "projectId_taskId_extraStuff..."
    // value: array of { "M/D/YYYY": { internalid, hours, memo, approval, disableLine } }
    const rows = [];
    const entries = data.timeentries || {};
    for (const [key, dayArr] of Object.entries(entries)) {
      const parts = key.split('_');
      const projId = parts[0];
      const taskId = parts[1];
      const itemId = parts[2] || _defaultItemId;  // key format: projectId_taskId_itemId_...

      const proj = _projects.find(p => p.id === projId);
      const task = (_tasks[projId] || []).find(t => t.id === taskId);

      const days = {};
      for (const dayObj of dayArr) {
        for (const [dateNS, entry] of Object.entries(dayObj)) {
          const iso = nsToISO(dateNS);
          const dk = isoToDayKey(iso);
          if (dk) {
            days[dk] = {
              hours:    nsToHours(entry.hours),
              memo:     entry.memo || '',
              timeid:   entry.internalid || '',
              approved: entry.approval === 'T',
              submitted: entry.rejected === '3',  // "submitted" state uses rejected=3
              disabled: entry.disableLine === true,
            };
          }
        }
      }

      rows.push({
        projId, taskId, itemId,
        projName: proj?.name || projId,
        taskName: task?.name || taskId,
        projRaw:  proj?.raw || projId,
        taskRaw:  task?.raw || taskId,
        days,
      });
    }

    const result = { rows, weekStart: mondayISO };
    _weekCache[mondayISO] = result;
    return result;
  }

  // Default service item id — comes from init, stored here
  let _defaultItemId = '754';

  async function saveRow({ projId, projRaw, taskId, taskRaw, itemId, weekISO, dayKey, hours, memo, timeid, date }) {
    // The real payload format (from buildBlockPayload in the NS source):
    // emp, proj (numeric), projtask (numeric), item (numeric), lines[]{day,date,time,memo,timeid}
    const projNumeric  = (projRaw || projId || '').split('|')[0];
    const taskNumeric  = (taskRaw || taskId || '').split('|')[0];
    const itemNumeric  = (itemId || _defaultItemId || '754');

    // Build date string for the target day: "M/D/YYYY"
    const dayIndex = DAYS.indexOf(dayKey);
    const dayDate  = date || isoToNS(addDays(weekISO, dayIndex));

    const line = {
      day:    dayKey,
      date:   dayDate,
      time:   hoursToNS(parseFloat(hours) || 0),
      memo:   memo || '',
      timeid: timeid || '',
    };

    const block = {
      blockid:    'ft_' + Date.now(),
      emp:        String(_userId),
      proj:       projNumeric,
      projtask:   taskNumeric,
      item:       itemNumeric,
      isbillable: false,
      class:      '',
      location:   '',
      department: '',
      rate:       '',
      approval:   '',
      nonbillps:  false,
      lines:      [line],
    };

    const params = new URLSearchParams({ opType: 'saveAll', payLoad: JSON.stringify([block]) });
    const r = await fetch(HANDLER, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    // Response is either JSON array or a plain error string
    try {
      const arr = JSON.parse(text);
      for (const item of (Array.isArray(arr) ? arr : [arr])) {
        if (item.errors && item.errors !== '' && item.errors !== 'Saving success.')
          throw new Error(item.errors);
      }
    } catch(e) {
      // If JSON.parse itself failed, the response IS the error message
      if (e instanceof SyntaxError) throw new Error(text.substring(0, 200));
      throw e;
    }
    delete _weekCache[weekISO];
    return text;
  }

  // ── CSS ─────────────────────────────────────────────────────────────────────

  const CSS = `
    #ft * { box-sizing: border-box; margin: 0; padding: 0; }
    #ft {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px; color: #1a1a2e;
      max-width: 960px; margin: 28px auto;
      background: white; border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.09); overflow: hidden;
    }
    #ft .hdr {
      background: linear-gradient(135deg,#1a1a2e,#16213e);
      color: white; padding: 16px 24px;
      display: flex; align-items: center; justify-content: space-between;
    }
    #ft .hdr h1 { font-size: 16px; font-weight: 700; }
    #ft .hdr .sub { font-size: 11px; opacity: .55; margin-top: 2px; }
    #ft .week-nav {
      display: flex; align-items: center; gap: 10px; padding: 12px 24px;
      border-bottom: 1px solid #edf0f7; background: #f8f9fc;
    }
    #ft .week-nav button {
      background: none; border: 1.5px solid #ccc; border-radius: 6px;
      padding: 5px 12px; cursor: pointer; font-size: 13px; color: #444;
      transition: all .15s;
    }
    #ft .week-nav button:hover { border-color: #0066cc; color: #0066cc; }
    #ft .week-label { font-weight: 600; font-size: 14px; min-width: 220px; text-align: center; }
    #ft .week-nav .btn-today {
      background: #0066cc; color: white; border-color: #0066cc;
      margin-left: auto;
    }
    #ft .week-nav .btn-today:hover { background: #0055aa; }
    #ft .status-bar {
      padding: 9px 24px; font-size: 12px; font-weight: 500; display: none;
    }
    #ft .status-bar.loading { background: #e8f0fe; color: #1a73e8; display: block; }
    #ft .status-bar.success { background: #e6f4ea; color: #1e7e34; display: block; }
    #ft .status-bar.error   { background: #fdecea; color: #c0392b; display: block; }
    #ft .grid-wrap { overflow-x: auto; }
    #ft table { width: 100%; border-collapse: collapse; min-width: 720px; }
    #ft thead th {
      padding: 8px 10px; font-size: 11px; font-weight: 700;
      text-transform: uppercase; letter-spacing: .4px; color: #888;
      border-bottom: 2px solid #edf0f7; text-align: center;
    }
    #ft thead th.col-proj { text-align: left; min-width: 160px; }
    #ft thead th.col-task { text-align: left; min-width: 140px; }
    #ft thead th.col-day  { min-width: 70px; }
    #ft thead th.col-total{ min-width: 60px; }
    #ft tbody tr { border-bottom: 1px solid #f0f2f8; }
    #ft tbody tr:hover { background: #fafbff; }
    #ft td { padding: 7px 8px; vertical-align: middle; }
    #ft td.col-proj { font-size: 12px; font-weight: 500; color: #333; }
    #ft td.col-task { font-size: 12px; color: #555; }
    #ft td.col-total { text-align: center; font-weight: 700; font-size: 13px; color: #333; }
    #ft .day-cell { text-align: center; }
    #ft .day-input {
      width: 62px; padding: 5px 6px; text-align: center;
      border: 1.5px solid #e0e3eb; border-radius: 5px;
      font-size: 13px; font-family: inherit; background: white;
      transition: border-color .15s;
    }
    #ft .day-input:focus { outline: none; border-color: #0066cc; }
    #ft .day-input.approved {
      background: #e6f4ea; border-color: #b7dfc0; color: #1e7e34;
      cursor: not-allowed;
    }
    #ft .day-input.submitted {
      background: #e8f0fe; border-color: #9ab8e8; color: #1a73e8;
      cursor: not-allowed;
    }
    #ft .day-input.has-value { border-color: #9ab8e8; background: #f0f6ff; }
    #ft .add-row-bar {
      padding: 10px 24px; border-top: 1px solid #edf0f7;
      display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap;
      background: #f8f9fc;
    }
    #ft .add-row-bar select, #ft .add-row-bar input {
      padding: 7px 9px; border: 1.5px solid #dde1e9; border-radius: 6px;
      font-size: 13px; font-family: inherit; background: white;
    }
    #ft .add-row-bar select:focus, #ft .add-row-bar input:focus {
      outline: none; border-color: #0066cc;
    }
    #ft .add-row-bar .sel-proj { min-width: 200px; }
    #ft .add-row-bar .sel-task { min-width: 180px; }
    #ft .btn-add {
      background: #0066cc; color: white; border: none;
      padding: 8px 18px; border-radius: 6px; font-size: 13px;
      font-weight: 600; cursor: pointer; white-space: nowrap;
    }
    #ft .btn-add:hover { background: #0055aa; }
    #ft .footer {
      padding: 10px 24px; border-top: 1px solid #edf0f7;
      font-size: 11px; color: #bbb; text-align: right;
    }
    #ft .footer a { color: #0066cc; text-decoration: none; }
    #ft tfoot td {
      padding: 8px 10px; font-weight: 700; font-size: 13px;
      background: #f8f9fc; border-top: 2px solid #edf0f7; text-align: center;
    }
    #ft tfoot td.lbl { text-align: left; color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; }
    #ft .today-col { background: #fffbe6; }
    #ft .spinner { display: inline-block; width: 14px; height: 14px;
      border: 2px solid #cce; border-top-color: #0066cc;
      border-radius: 50%; animation: spin .7s linear infinite; vertical-align: middle; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `;

  // ── UI helpers ───────────────────────────────────────────────────────────────

  function weekRangeLabel(mondayISO) {
    const mon = new Date(mondayISO + 'T12:00:00');
    const sun = new Date(mondayISO + 'T12:00:00');
    sun.setDate(sun.getDate() + 6);
    const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${fmt(mon)} – ${fmt(sun)}, ${mon.getFullYear()}`;
  }

  function setStatus(msg, type) {
    const el = document.getElementById('ft-status');
    el.textContent = msg;
    el.className = `status-bar ${type}`;
  }

  // ── Build skeleton HTML ──────────────────────────────────────────────────────

  function buildShell() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.innerHTML = '<meta charset="UTF-8"><title>Weekly Time Entry — Fast</title>';
    document.head.appendChild(style);
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;padding:20px;background:#eef0f8;';

    const root = document.createElement('div');
    root.id = 'ft';
    root.innerHTML = `
      <div class="hdr">
        <div><h1>⏱ Weekly Time Entry</h1><div class="sub">Media.Monks — fast entry</div></div>
        <a href="https://${ACCOUNT_ID}.app.netsuite.com" style="color:rgba(255,255,255,.5);font-size:11px;text-decoration:none;">← NetSuite Home</a>
      </div>
      <div class="week-nav">
        <button id="ft-prev">◀ Prev</button>
        <div class="week-label" id="ft-week-label"></div>
        <button id="ft-next">Next ▶</button>
        <button class="btn-today" id="ft-today">This week</button>
        <button id="ft-original" style="margin-left:8px;font-size:12px;">Load original page</button>
      </div>
      <div id="ft-status" class="status-bar"></div>
      <div class="grid-wrap">
        <table id="ft-table">
          <thead id="ft-thead"></thead>
          <tbody id="ft-tbody"></tbody>
          <tfoot id="ft-tfoot"></tfoot>
        </table>
      </div>
      <div class="add-row-bar" id="ft-add-bar">
        <select class="sel-proj" id="ft-add-proj"><option value="">— Add project —</option></select>
        <select class="sel-task" id="ft-add-task"><option value="">— Task (optional) —</option></select>
        <button class="btn-add" id="ft-add-btn">+ Add row</button>
      </div>
      <div class="footer">
        Fast Time Tracker · <a id="ft-orig-link" href="#">Load original page</a>
      </div>
    `;
    document.body.appendChild(root);
  }

  // ── Render week grid ─────────────────────────────────────────────────────────

  function renderWeek(weekData, mondayISO) {
    const todayISO_ = todayISO();
    document.getElementById('ft-week-label').textContent = weekRangeLabel(mondayISO);

    // Build day ISO dates for this week
    const dayDates = DAYS.map((_, i) => addDays(mondayISO, i));

    // thead
    const thead = document.getElementById('ft-thead');
    const todayCols = dayDates.map(d => d === todayISO_ ? 'today-col' : '');
    thead.innerHTML = `<tr>
      <th class="col-proj">Project</th>
      <th class="col-task">Task</th>
      ${DAYS.map((_, i) => `<th class="col-day ${todayCols[i]}">${DAY_LABELS[i]}<br><span style="font-weight:400;font-size:10px">${dayDates[i].slice(5).replace('-','/')}</span></th>`).join('')}
      <th class="col-total">Total</th>
    </tr>`;

    // tbody
    const tbody = document.getElementById('ft-tbody');
    tbody.innerHTML = '';

    const { rows } = weekData;

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${DAYS.length + 3}" style="text-align:center;padding:24px;color:#aaa">No time entries for this week. Use the form below to add one.</td></tr>`;
    }

    for (const row of rows) {
      const tr = document.createElement('tr');
      let rowTotal = 0;

      const dayCells = DAYS.map((dk, i) => {
        const entry = row.days[dk];
        const h = entry?.hours || 0;
        rowTotal += h;
        const val = h ? formatHours(h) : '';
        const approved = entry?.approved;
        const submitted = entry?.submitted;
        const disabled = approved || submitted || entry?.disabled;
        const cls = approved ? 'approved' : submitted ? 'submitted' : (h ? 'has-value' : '');
        const todayCls = dayDates[i] === todayISO_ ? 'today-col' : '';
        return `<td class="day-cell ${todayCls}">
          <input type="text"
            class="day-input ${cls}"
            data-proj="${row.projId}" data-task="${row.taskId}"
            data-projraw="${row.projRaw}" data-taskraw="${row.taskRaw}"
            data-item="${row.itemId || _defaultItemId}"
            data-day="${dk}" data-week="${mondayISO}"
            data-date="${isoToNS(dayDates[i])}"
            data-timeid="${entry?.timeid || ''}"
            value="${val}"
            ${disabled ? 'readonly title="' + (approved ? 'Approved — cannot edit' : 'Submitted — pending approval') + '"' : ''}
          />
        </td>`;
      });

      tr.innerHTML = `
        <td class="col-proj" title="${row.projId}">${row.projName}</td>
        <td class="col-task" title="${row.taskId}">${row.taskName || '—'}</td>
        ${dayCells.join('')}
        <td class="col-total">${rowTotal ? formatHours(rowTotal) : ''}</td>
      `;
      tbody.appendChild(tr);
    }

    // tfoot totals
    const tfoot = document.getElementById('ft-tfoot');
    const dayTotals = DAYS.map((dk, i) => {
      const total = rows.reduce((s, r) => s + (r.days[dk]?.hours || 0), 0);
      const todayCls = dayDates[i] === todayISO_ ? 'today-col' : '';
      return `<td class="${todayCls}">${total ? formatHours(total) : ''}</td>`;
    });
    const grandTotal = rows.reduce((s, r) => s + DAYS.reduce((ds, dk) => ds + (r.days[dk]?.hours || 0), 0), 0);
    tfoot.innerHTML = `<tr>
      <td class="lbl" colspan="2">Week total</td>
      ${dayTotals.join('')}
      <td>${grandTotal ? formatHours(grandTotal) : ''}</td>
    </tr>`;

    // Populate add-row project selector
    const addProj = document.getElementById('ft-add-proj');
    addProj.innerHTML = '<option value="">— Add project —</option>';
    _projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.dataset.raw = p.raw;
      opt.textContent = p.name;
      addProj.appendChild(opt);
    });
  }

  // ── Event wiring ─────────────────────────────────────────────────────────────

  async function navigateToWeek(mondayISO) {
    _currentWeekISO = mondayISO;
    setStatus('<span class="spinner"></span> Loading…', 'loading');
    document.getElementById('ft-status').innerHTML = '<span class="spinner"></span> Loading…';
    document.getElementById('ft-status').className = 'status-bar loading';
    try {
      const data = await loadWeek(mondayISO);
      renderWeek(data, mondayISO);
      setStatus('', '');
    } catch(err) {
      setStatus(`Error loading week: ${err.message}`, 'error');
    }
  }

  function wireEvents() {
    // Week navigation
    document.getElementById('ft-prev').addEventListener('click', () => {
      navigateToWeek(addDays(_currentWeekISO, -7));
    });
    document.getElementById('ft-next').addEventListener('click', () => {
      navigateToWeek(addDays(_currentWeekISO, 7));
    });
    document.getElementById('ft-today').addEventListener('click', () => {
      navigateToWeek(getMondayISO(todayISO()));
    });

    // Load original page
    const bypassAndReload = () => { sessionStorage.setItem('ft_bypass','1'); window.location.reload(); };
    document.getElementById('ft-original').addEventListener('click', bypassAndReload);
    document.getElementById('ft-orig-link').addEventListener('click', e => { e.preventDefault(); bypassAndReload(); });

    // Cell save on blur
    document.getElementById('ft-tbody').addEventListener('blur', async (e) => {
      const input = e.target;
      if (!input.classList.contains('day-input') || input.readOnly) return;

      const raw = input.value.trim();
      const prev = input.dataset.prev || '';
      if (raw === prev) return; // no change

      // Parse hours — accept "1.5", "1:30", "1.5h" etc
      let hours = 0;
      if (raw) {
        const colonMatch = raw.match(/^(\d+):(\d{2})$/);
        if (colonMatch) {
          hours = parseInt(colonMatch[1]) + parseInt(colonMatch[2])/60;
        } else {
          hours = parseFloat(raw.replace(/[^\d.]/g,''));
        }
        if (isNaN(hours) || hours < 0) { input.value = prev; return; }
      }

      const proj   = input.dataset.proj;
      const task   = input.dataset.task;
      const dk     = input.dataset.day;
      const week   = input.dataset.week;
      const timeid = input.dataset.timeid;
      const date   = input.dataset.date;
      const itemId = input.dataset.item;

      // Find raw IDs
      const projRaw = _projects.find(p=>p.id===proj)?.raw || proj;
      const taskRaw = (_tasks[proj]||[]).find(t=>t.id===task)?.raw || task;

      input.style.opacity = '0.5';
      try {
        await saveRow({ projId: proj, projRaw, taskId: task, taskRaw, itemId,
                        weekISO: week, dayKey: dk, date,
                        hours: hours || 0, memo: '', timeid });
        input.value = hours ? formatHours(hours) : '';
        input.dataset.prev = input.value;
        input.classList.toggle('has-value', !!hours);
        // Refresh totals row
        const data = await loadWeek(week);
        renderWeek(data, week);
        setStatus('✓ Saved', 'success');
        setTimeout(() => setStatus('',''), 2000);
      } catch(err) {
        setStatus(`Save failed: ${err.message}`, 'error');
        input.value = prev;
      } finally {
        input.style.opacity = '1';
      }
    }, true);

    // Track "previous" value on focus for change detection
    document.getElementById('ft-tbody').addEventListener('focus', (e) => {
      if (e.target.classList.contains('day-input')) {
        e.target.dataset.prev = e.target.value;
      }
    }, true);

    // Add-row: project change → populate tasks
    document.getElementById('ft-add-proj').addEventListener('change', (e) => {
      const pid = e.target.value;
      const sel = document.getElementById('ft-add-task');
      sel.innerHTML = '<option value="">— Task (optional) —</option>';
      (_tasks[pid] || []).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.dataset.raw = t.raw;
        opt.textContent = t.name;
        sel.appendChild(opt);
      });
    });

    // Add-row button: add a blank row for that project/task to today's cell
    document.getElementById('ft-add-btn').addEventListener('click', async () => {
      const projSel = document.getElementById('ft-add-proj');
      const taskSel = document.getElementById('ft-add-task');
      const projId  = projSel.value;
      if (!projId) { setStatus('Select a project first', 'error'); return; }

      const proj    = _projects.find(p=>p.id===projId);
      const taskId  = taskSel.value;
      const task    = (_tasks[projId]||[]).find(t=>t.id===taskId);

      // Check if row already exists
      const existing = _weekCache[_currentWeekISO];
      if (existing) {
        const dup = existing.rows.find(r => r.projId===projId && r.taskId===taskId);
        if (dup) { setStatus('That project/task row is already in the grid', 'error'); return; }
      }

      // Add empty row to cache so it shows up
      if (existing) {
        existing.rows.push({
          projId, taskId, itemId: _defaultItemId,
          projName: proj?.name || projId,
          taskName: task?.name || taskId,
          projRaw:  proj?.raw || projId,
          taskRaw:  task?.raw || taskId,
          days: {},
        });
        renderWeek(existing, _currentWeekISO);
      }

      projSel.value = '';
      taskSel.innerHTML = '<option value="">— Task (optional) —</option>';
      setStatus('', '');
    });
  }

  // ── Bootstrap ────────────────────────────────────────────────────────────────

  async function init() {
    buildShell();
    wireEvents();
    setStatus('Loading…', 'loading');
    try {
      await loadInit();
      await navigateToWeek(getMondayISO(todayISO()));
    } catch(err) {
      setStatus(`Failed to initialise: ${err.message}`, 'error');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
