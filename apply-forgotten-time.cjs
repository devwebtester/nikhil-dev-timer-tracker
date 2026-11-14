const fs = require('fs');

const FILES = {
  server: 'server.js',
  emp: 'src/components/EmployeeDashboard.tsx',
  admin: 'src/components/AdminDashboard.tsx',
  ft: 'src/components/ForgottenTime.tsx',
};

for (const f of Object.values(FILES)) {
  if (!fs.existsSync(f)) {
    console.error('Missing file: ' + f);
    process.exit(1);
  }
}

const SERVER_BLOCK = String.raw`// ======================================================
// FORGOTTEN TIME REQUESTS
// ======================================================
const FORGOTTEN_DB = path.join(UPLOAD_DIR, 'forgotten-time-requests.json');
ensureArrayFile(FORGOTTEN_DB);

const readForgotten = () => readArray(FORGOTTEN_DB, 'forgotten time requests');
const saveForgotten = (data) => writeJson(FORGOTTEN_DB, data);

function approvedSecondsFor(employeeId, dateKey) {
  return readForgotten()
    .filter((r) => r.employeeId === employeeId && r.date === dateKey && r.status === 'approved')
    .reduce((t, r) => t + (Number(r.approvedSeconds) || 0), 0);
}

function approvedSecondsForMonth(employeeId, monthKey) {
  return readForgotten()
    .filter((r) => r.employeeId === employeeId && r.status === 'approved' && String(r.date).startsWith(monthKey))
    .reduce((t, r) => t + (Number(r.approvedSeconds) || 0), 0);
}

function parseHm(value) {
  const parts = String(value || '').split(':');
  if (parts.length !== 2) return null;
  const h = Number(parts[0]);
  const mi = Number(parts[1]);
  if (!Number.isInteger(h) || !Number.isInteger(mi) || h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

// Set FT_ENFORCE_ADMIN=1 to require the admin login token on admin routes.
function requireAdmin(req, res, next) {
  if (process.env.FT_ENFORCE_ADMIN !== '1') return next();
  const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!adminTokens.has(token)) {
    return res.status(401).json({ success: false, error: 'Admin login required.' });
  }
  next();
}

// Adds approvedSeconds to existing GET responses. Actual totalSeconds is NEVER changed.
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const parts = req.path.split('/').filter(Boolean);
  if (parts[0] !== 'api') return next();
  const orig = res.json.bind(res);

  if (parts[1] === 'activity-history' && parts.length === 3) {
    res.json = (body) => {
      try {
        const id = decodeURIComponent(parts[2]);
        if (body && body.success && Array.isArray(body.records)) {
          const approved = readForgotten().filter((r) => r.employeeId === id && r.status === 'approved');
          approved.forEach((r) => {
            if (!body.records.some((x) => x.dateKey === r.date)) {
              body.records.push({
                dateKey: r.date, totalSeconds: 0, screenshotCount: 0,
                activeSeconds: 0, trackedSeconds: 0, mouseMoves: 0, mouseClicks: 0, keyPresses: 0,
              });
            }
          });
          body.records.sort((a, b) => String(b.dateKey).localeCompare(String(a.dateKey)));
          body.records.forEach((rec) => { rec.approvedSeconds = approvedSecondsFor(id, rec.dateKey); });
        }
      } catch (e) { console.warn('Forgotten time history merge failed:', e.message); }
      return orig(body);
    };
  } else if (parts[1] === 'activity' && parts.length === 4) {
    res.json = (body) => {
      try {
        if (body && body.success) {
          body.approvedSeconds = approvedSecondsFor(decodeURIComponent(parts[2]), decodeURIComponent(parts[3]));
        }
      } catch (e) { console.warn('Forgotten time activity merge failed:', e.message); }
      return orig(body);
    };
  } else if (parts[1] === 'admin' && parts[2] === 'activity-summary') {
    res.json = (body) => {
      try {
        if (body && body.success && Array.isArray(body.employees)) {
          body.employees.forEach((e) => {
            e.todaySeconds = (Number(e.todaySeconds) || 0) + approvedSecondsFor(e.employeeId, body.today);
            e.monthlySeconds = (Number(e.monthlySeconds) || 0) + approvedSecondsForMonth(e.employeeId, body.monthKey);
          });
        }
      } catch (e) { console.warn('Forgotten time summary merge failed:', e.message); }
      return orig(body);
    };
  }
  next();
});

// Employee: submit
app.post('/api/forgotten-time', (req, res) => {
  try {
    const { employeeId, date, startTime, endTime, reason } = req.body || {};
    const employee = findEmployeeById(String(employeeId || ''));
    if (!employee) return res.status(404).json({ success: false, error: 'Employee not found.' });

    if (!isValidDateKey(date) || Number.isNaN(Date.parse(date))) {
      return res.status(400).json({ success: false, error: 'Valid date is required.' });
    }
    const today = dateKeyNow();
    if (date > today) return res.status(400).json({ success: false, error: 'Future dates are not allowed.' });

    const s = parseHm(startTime);
    const e = parseHm(endTime);
    if (s === null || e === null) return res.status(400).json({ success: false, error: 'Valid start and end time are required.' });
    if (s >= e) return res.status(400).json({ success: false, error: 'Start time must be before end time.' });
    if (e - s > 16 * 60) return res.status(400).json({ success: false, error: 'A single request cannot exceed 16 hours.' });

    const now = new Date();
    if (date === today && e > now.getHours() * 60 + now.getMinutes()) {
      return res.status(400).json({ success: false, error: 'End time cannot be in the future.' });
    }

    const cleanReason = String(reason || '').trim().slice(0, 500);
    if (cleanReason.length < 5) return res.status(400).json({ success: false, error: 'Please enter a reason (min 5 characters).' });

    const all = readForgotten();
    const clash = all.find(
      (r) =>
        r.employeeId === employee.id &&
        r.date === date &&
        (r.status === 'pending' || r.status === 'approved') &&
        s < parseHm(r.endTime) &&
        parseHm(r.startTime) < e
    );
    if (clash) {
      return res.status(409).json({ success: false, error: 'Overlaps an existing ' + clash.status + ' request (' + clash.startTime + '-' + clash.endTime + ').' });
    }

    const trackedClash = readArray(ACTIVITY_SNAPSHOTS_DB, 'activity snapshots').some((i) => {
      if (i.employeeId !== employee.id || i.dateKey !== date) return false;
      const d = new Date(i.capturedAt);
      if (Number.isNaN(d.getTime())) return false;
      const m = d.getHours() * 60 + d.getMinutes();
      return m >= s && m < e;
    });
    if (trackedClash) {
      return res.status(409).json({ success: false, error: 'This period overlaps time that was already tracked.' });
    }

    const request = {
      id: randomUUID(),
      employeeId: employee.id,
      employeeName: getEmployeeFullName(employee),
      date,
      startTime,
      endTime,
      requestedSeconds: (e - s) * 60,
      reason: cleanReason,
      status: 'pending',
      createdAt: new Date().toISOString(),
      adminId: null,
      adminResponse: '',
      decidedAt: null,
      approvedSeconds: 0,
    };
    all.push(request);
    saveForgotten(all);
    return res.json({ success: true, request });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Employee: own requests only
app.get('/api/forgotten-time/employee/:employeeId', (req, res) => {
  try {
    const employee = findEmployeeById(req.params.employeeId);
    if (!employee) return res.status(404).json({ success: false, error: 'Employee not found.' });
    const requests = readForgotten()
      .filter((r) => r.employeeId === employee.id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return res.json({ success: true, requests });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: list with filters
app.get('/api/admin/forgotten-time', requireAdmin, (req, res) => {
  try {
    const { status, employeeId, date } = req.query;
    const requests = readForgotten()
      .filter((r) => !status || r.status === status)
      .filter((r) => !employeeId || r.employeeId === employeeId)
      .filter((r) => !date || r.date === date)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return res.json({ success: true, requests });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: approve (idempotent - only pending can change)
app.post('/api/admin/forgotten-time/:id/approve', requireAdmin, (req, res) => {
  try {
    const all = readForgotten();
    const request = all.find((r) => r.id === req.params.id);
    if (!request) return res.status(404).json({ success: false, error: 'Request not found.' });
    if (request.status !== 'pending') {
      return res.status(409).json({ success: false, error: 'Request is already ' + request.status + '.', request });
    }
    request.status = 'approved';
    request.adminId = 'admin-master';
    request.decidedAt = new Date().toISOString();
    request.approvedSeconds = Number(request.requestedSeconds) || 0;
    request.adminResponse = String((req.body && req.body.response) || '').trim().slice(0, 500);
    saveForgotten(all);
    return res.json({ success: true, request });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: decline
app.post('/api/admin/forgotten-time/:id/decline', requireAdmin, (req, res) => {
  try {
    const reason = String((req.body && req.body.reason) || '').trim().slice(0, 500);
    if (!reason) return res.status(400).json({ success: false, error: 'Decline reason is required.' });
    const all = readForgotten();
    const request = all.find((r) => r.id === req.params.id);
    if (!request) return res.status(404).json({ success: false, error: 'Request not found.' });
    if (request.status !== 'pending') {
      return res.status(409).json({ success: false, error: 'Request is already ' + request.status + '.', request });
    }
    request.status = 'declined';
    request.adminId = 'admin-master';
    request.decidedAt = new Date().toISOString();
    request.approvedSeconds = 0;
    request.adminResponse = reason;
    saveForgotten(all);
    return res.json({ success: true, request });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

`;

const read = (f) => fs.readFileSync(f, 'utf8');
const failures = [];

function once(src, regex, replacer, label) {
  const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
  const re = new RegExp(regex.source, flags);
  const live = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m[0].length === 0) re.lastIndex++;
    const lineStart = src.lastIndexOf('\n', m.index - 1) + 1;
    // Ignore matches on lines that are commented out with //
    if (src.slice(lineStart).trimStart().startsWith('//')) continue;
    live.push(m);
  }
  if (live.length !== 1) {
    failures.push(label + ' (found ' + live.length + ' live matches, expected 1)');
    return src;
  }
  const hit = live[0];
  const replacement = replacer(...hit);
  return src.slice(0, hit.index) + replacement + src.slice(hit.index + hit[0].length);
}

// ---------------- server.js ----------------
let server = read(FILES.server);
if (server.includes('FORGOTTEN TIME REQUESTS')) {
  console.log('server.js already patched, skipping.');
} else {
  server = once(server, /const app = express\(\);/, (m) => m + '\n\nconst adminTokens = new Set();', 'server: adminTokens');
  server = once(
    server,
    /token: randomUUID\(\),/,
    () => 'token: (() => { const t = randomUUID(); adminTokens.add(t); return t; })(),',
    'server: admin token'
  );
  server = once(
    server,
    /\/\/ =+\r?\n\/\/ BASIC HELPERS/,
    (m) => SERVER_BLOCK + m,
    'server: insert block'
  );
}

// ---------------- EmployeeDashboard.tsx ----------------
let emp = read(FILES.emp);
if (emp.includes('EmployeeForgottenTime')) {
  console.log('EmployeeDashboard.tsx already patched, skipping.');
} else {
  emp = once(
    emp,
    /import \{ MyTimeTracking, type ViewMode \} from '\.\/MyTimeTracking';/,
    (m) => m + "\nimport { EmployeeForgottenTime } from './ForgottenTime';",
    'emp: import'
  );
    emp = once(
    emp,
    /^interface ActivityHistoryRecord \{([^}]*)\}/m,
    (m, body) => 'interface ActivityHistoryRecord {' + body + '  approvedSeconds?: number;\n}',
    'emp: ActivityHistoryRecord'
  );
  emp = once(
    emp,
    /return list;/,
    () =>
      'return list.map((record) => ({\n      ...record,\n      totalSeconds: record.totalSeconds + (record.approvedSeconds || 0),\n    }));',
    'emp: myTimeRecords'
  );
  emp = once(
    emp,
     /^[ \t]*return records;/m,
    () =>
      'return records.map((r) => ({\n                      ...r,\n                      totalSeconds: r.totalSeconds + (r.approvedSeconds || 0),\n                    }));',
    'emp: reports loadHistory'
  );
  emp = once(
    emp,
    /\{statusPanel\}/,
    (m) =>
      m +
      '\n\n              <EmployeeForgottenTime\n                employeeId={currentUser.id}\n                todayKey={getTodayDateKey()}\n                request={(path, init) => fetch(`${backendUrl}${path}`, init)}\n              />',
    'emp: render component'
  );
}

// ---------------- AdminDashboard.tsx ----------------
let admin = read(FILES.admin);
if (admin.includes('AdminForgottenTime')) {
  console.log('AdminDashboard.tsx already patched, skipping.');
} else {
  admin = once(
    admin,
    /import \{ MyTimeTracking, type ViewMode \} from '\.\/MyTimeTracking';/,
    (m) => m + "\nimport { AdminForgottenTime } from './ForgottenTime';",
    'admin: import'
  );
  admin = once(admin, /\|\s*'storage';/, () => "| 'storage'\n  | 'forgotten';", 'admin: AdminTab');
  admin = once(
    admin,
    /^type ActivityHistoryRow = \{([^}]*)\};/m,
    (m, body) => 'type ActivityHistoryRow = {' + body + '  approvedSeconds?: number;\n};',
    'admin: ActivityHistoryRow'
  );
  admin = once(
    admin,
    /'Global Capture Settings',\s*\],/,
    (m) => m + "\n\n            ['forgotten', 'Forgotten Time Requests'],",
    'admin: tabs array'
  );
  admin = once(
    admin,
    /\{activeTab\s*===\s*'storage'\s*&&\s*\(/,
    (m) =>
      "{activeTab === 'forgotten' && (\n          <AdminForgottenTime\n            request={apiFetch}\n            employees={centralUsers.map((u) => ({ id: u.id, name: u.name }))}\n            onChanged={() => {\n              void refreshCentralData(true);\n              void refreshSelectedEmployeeData();\n            }}\n          />\n        )}\n\n        " +
      m,
    'admin: render tab'
  );
  admin = once(
    admin,
    /records=\{historyRows\}/,
    () =>
      'records={historyRows.map((r) => ({\n                          ...r,\n                          totalSeconds: r.totalSeconds + (r.approvedSeconds || 0),\n                        }))}',
    'admin: MyTimeTracking records'
  );
  admin = once(
    admin,
    /selectedActivity \? selectedActivity\.totalSeconds : undefined/,
    () =>
      'selectedActivity ? selectedActivity.totalSeconds + (selectedActivity.approvedSeconds || 0) : undefined',
    'admin: selectedDaySeconds'
  );
  admin = once(
    admin,
    /formatSeconds\(\s*row\.totalSeconds\s*\)/,
    () => 'formatSeconds(row.totalSeconds + (row.approvedSeconds || 0))',
    'admin: date list'
  );
  admin = once(
    admin,
    /return Array\.isArray\(data\.records\) \? data\.records : \[\];/,
    () =>
      'return (Array.isArray(data.records) ? data.records : []).map((r: ActivityHistoryRow) => ({\n                ...r,\n                totalSeconds: r.totalSeconds + (r.approvedSeconds || 0),\n              }));',
    'admin: reports loadHistory'
  );
}

if (failures.length) {
  console.error('\nNOTHING WAS WRITTEN. These anchors did not match:');
  failures.forEach((f) => console.error(' - ' + f));
  console.error('\nSend me these lines and I will give manual edits.');
  process.exit(1);
}

for (const [key, content] of [['server', server], ['emp', emp], ['admin', admin]]) {
  const f = FILES[key];
  if (content !== read(f)) {
    fs.copyFileSync(f, f + '.bak-forgotten');
    fs.writeFileSync(f, content);
    console.log('Patched ' + f + ' (backup: ' + f + '.bak-forgotten)');
  }
}
console.log('\nDone. Now run: npx tsc --noEmit');