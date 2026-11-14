// ======================================================
// FORGOTTEN TIME - Cloudflare Worker (D1) port of the
// Express routes in server.js. Same URLs, same JSON shape.
// D1 table used: forgotten_time_requests (already exists).
// Actual tracked time is never modified here.
// ======================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, ngrok-skip-browser-warning',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

function reply(data, status = 200) {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

function fail(error, status = 400, extra = {}) {
  return reply({ success: false, error, ...extra }, status);
}

const IST = 'Asia/Kolkata';

function istNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value || '0';

  return {
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function parseHm(value) {
  const parts = String(value || '').split(':');
  if (parts.length !== 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (
    !Number.isInteger(h) ||
    !Number.isInteger(m) ||
    h < 0 ||
    h > 23 ||
    m < 0 ||
    m > 59
  ) {
    return null;
  }
  return h * 60 + m;
}

function rowToRequest(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name || '',
    date: row.date_key,
    startTime: row.from_time,
    endTime: row.to_time,
    requestedSeconds: Number(row.requested_seconds) || 0,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    adminId: row.reviewed_by || null,
    adminResponse: row.review_reason || '',
    decidedAt: row.reviewed_at || null,
    approvedSeconds: Number(row.approved_seconds) || 0,
  };
}

async function readBody(request) {
  try {
    return (await request.json()) || {};
  } catch {
    return {};
  }
}

async function findEmployee(env, id) {
  return env.DB.prepare(
    `SELECT id, first_name, last_name, name, email
       FROM employees
      WHERE id = ?
      LIMIT 1`
  )
    .bind(String(id || ''))
    .first();
}

function employeeFullName(emp) {
  const combined = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
  return combined || String(emp.name || '').trim();
}

async function getRequestById(env, id) {
  return env.DB.prepare(
    `SELECT * FROM forgotten_time_requests WHERE id = ? LIMIT 1`
  )
    .bind(id)
    .first();
}

// Employee: submit
async function submitRequest(request, env) {
  const body = await readBody(request);
  const { employeeId, date, startTime, endTime, reason } = body;

  const employee = await findEmployee(env, employeeId);
  if (!employee) return fail('Employee not found.', 404);

  if (!isDateKey(date) || Number.isNaN(Date.parse(date))) {
    return fail('Valid date is required.', 400);
  }

  const now = istNow();
  if (date > now.dateKey) return fail('Future dates are not allowed.', 400);

  const s = parseHm(startTime);
  const e = parseHm(endTime);
  if (s === null || e === null) {
    return fail('Valid start and end time are required.', 400);
  }
  if (s >= e) return fail('Start time must be before end time.', 400);
  if (e - s > 16 * 60) {
    return fail('A single request cannot exceed 16 hours.', 400);
  }
  if (date === now.dateKey && e > now.minutes) {
    return fail('End time cannot be in the future.', 400);
  }

  const cleanReason = String(reason || '').trim().slice(0, 500);
  if (cleanReason.length < 5) {
    return fail('Please enter a reason (min 5 characters).', 400);
  }

  // Overlap with existing pending / approved requests
  const existing = await env.DB.prepare(
    `SELECT from_time, to_time, status
       FROM forgotten_time_requests
      WHERE employee_id = ?
        AND date_key = ?
        AND status IN ('pending', 'approved')`
  )
    .bind(employee.id, date)
    .all();

  for (const r of existing.results || []) {
    const rs = parseHm(r.from_time);
    const re = parseHm(r.to_time);
    if (rs !== null && re !== null && s < re && rs < e) {
      return fail(
        `Overlaps an existing ${r.status} request (${r.from_time}-${r.to_time}).`,
        409
      );
    }
  }

  // Overlap with time that was already tracked (activity snapshots)
  try {
    const snaps = await env.DB.prepare(
      `SELECT captured_at
         FROM activity_snapshots
        WHERE employee_id = ?
          AND date_key = ?`
    )
      .bind(employee.id, date)
      .all();

    for (const snap of snaps.results || []) {
      const d = new Date(snap.captured_at);
      if (Number.isNaN(d.getTime())) continue;
      const m = istNow(d).minutes;
      if (m >= s && m < e) {
        return fail('This period overlaps time that was already tracked.', 409);
      }
    }
  } catch {
    // activity_snapshots table does not exist yet: nothing tracked, skip.
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const fullName = employeeFullName(employee);
  const requestedSeconds = (e - s) * 60;

  await env.DB.prepare(
    `INSERT INTO forgotten_time_requests (
       id, employee_id, employee_name, employee_email,
       date_key, from_time, to_time,
       requested_seconds, approved_seconds,
       reason, status, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'pending', ?)`
  )
    .bind(
      id,
      employee.id,
      fullName,
      employee.email || null,
      date,
      startTime,
      endTime,
      requestedSeconds,
      cleanReason,
      createdAt
    )
    .run();

  const row = await getRequestById(env, id);
  return reply({ success: true, request: rowToRequest(row) });
}

// Employee: own requests only
async function listForEmployee(env, employeeId) {
  const employee = await findEmployee(env, employeeId);
  if (!employee) return fail('Employee not found.', 404);

  const result = await env.DB.prepare(
    `SELECT * FROM forgotten_time_requests
      WHERE employee_id = ?
      ORDER BY created_at DESC`
  )
    .bind(employee.id)
    .all();

  return reply({
    success: true,
    requests: (result.results || []).map(rowToRequest),
  });
}

// Admin: list with filters
async function listForAdmin(env, url) {
  const status = url.searchParams.get('status');
  const employeeId = url.searchParams.get('employeeId');
  const date = url.searchParams.get('date');

  const where = [];
  const binds = [];

  if (status) {
    where.push('status = ?');
    binds.push(status);
  }
  if (employeeId) {
    where.push('employee_id = ?');
    binds.push(employeeId);
  }
  if (date) {
    where.push('date_key = ?');
    binds.push(date);
  }

  const sql = `SELECT * FROM forgotten_time_requests
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY created_at DESC`;

  const result = await env.DB.prepare(sql)
    .bind(...binds)
    .all();

  return reply({
    success: true,
    requests: (result.results || []).map(rowToRequest),
  });
}

// Admin: approve / decline (only a pending request can change)
async function decide(request, env, id, kind) {
  const body = await readBody(request);

  let note = '';
  if (kind === 'approve') {
    note = String(body.response || '').trim().slice(0, 500);
  } else {
    note = String(body.reason || '').trim().slice(0, 500);
    if (!note) return fail('Decline reason is required.', 400);
  }

  const current = await getRequestById(env, id);
  if (!current) return fail('Request not found.', 404);

  if (current.status !== 'pending') {
    return fail(`Request is already ${current.status}.`, 409, {
      request: rowToRequest(current),
    });
  }

  const decidedAt = new Date().toISOString();
  const newStatus = kind === 'approve' ? 'approved' : 'declined';
  const approvedSeconds =
    kind === 'approve' ? Number(current.requested_seconds) || 0 : 0;

  // "AND status = 'pending'" makes this safe against double clicks.
  const update = await env.DB.prepare(
    `UPDATE forgotten_time_requests
        SET status = ?,
            approved_seconds = ?,
            reviewed_at = ?,
            reviewed_by = 'admin-master',
            review_reason = ?
      WHERE id = ?
        AND status = 'pending'`
  )
    .bind(newStatus, approvedSeconds, decidedAt, note, id)
    .run();

  const row = await getRequestById(env, id);

  if (!update?.meta?.changes) {
    return fail(`Request is already ${row?.status || 'updated'}.`, 409, {
      request: row ? rowToRequest(row) : undefined,
    });
  }

  return reply({ success: true, request: rowToRequest(row) });
}

// Entry point: returns a Response for forgotten-time URLs,
// or null so the normal Worker routing continues.
export async function handleForgottenTime(request, env, url) {
  const pathname = url.pathname;
  const method = request.method;

  const isEmployeeRoute =
    pathname === '/api/forgotten-time' ||
    pathname.startsWith('/api/forgotten-time/');
  const isAdminRoute = pathname.startsWith('/api/admin/forgotten-time');

  if (!isEmployeeRoute && !isAdminRoute) return null;

  try {
    const seg = pathname.split('/').filter(Boolean).map(decodeURIComponent);

    if (method === 'POST' && pathname === '/api/forgotten-time') {
      return await submitRequest(request, env);
    }

    if (
      method === 'GET' &&
      seg.length === 4 &&
      seg[0] === 'api' &&
      seg[1] === 'forgotten-time' &&
      seg[2] === 'employee'
    ) {
      return await listForEmployee(env, seg[3]);
    }

    if (method === 'GET' && pathname === '/api/admin/forgotten-time') {
      return await listForAdmin(env, url);
    }

    if (
      method === 'POST' &&
      seg.length === 5 &&
      seg[0] === 'api' &&
      seg[1] === 'admin' &&
      seg[2] === 'forgotten-time' &&
      (seg[4] === 'approve' || seg[4] === 'decline')
    ) {
      return await decide(request, env, seg[3], seg[4]);
    }

    return null;
  } catch (error) {
    console.error('Forgotten time error:', error);
    return fail(error?.message || 'Forgotten time request failed.', 500);
  }
}