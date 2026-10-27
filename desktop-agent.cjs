'use strict';

// WorkMonitor local Windows input counter. Counts event totals only; it never
// stores key codes, key names, typed text, window titles, or screenshots.
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { uIOhook } = require('uiohook-napi');

const HOST = '127.0.0.1';
const PORT = 3210;
let tracking = false;
let paused = false;
let idlePausePending = false;
let counts = { mouseMoves: 0, mouseClicks: 0, keyPresses: 0 };
let lastMouse = null;
let activeSeconds = 0;
let trackedSeconds = 0;
let lastInputAt = 0;
let idleDurationSeconds = 30;
let idlePopupCountdownSeconds = 10;
let idlePopupOpen = false;
let idlePopupProcess = null;

const ACTIVITY_TIMEOUT_MS = 1000;

setInterval(() => {
  if (!tracking || paused) return;
  trackedSeconds += 1;
  if (lastInputAt > 0 && Date.now() - lastInputAt <= ACTIVITY_TIMEOUT_MS) activeSeconds += 1;
}, 1000);

function resetActivityTime() {
  activeSeconds = 0;
  trackedSeconds = 0;
  lastInputAt = 0;
}

function checkIdleTimeout() {
  if (!tracking || paused || idlePopupOpen || lastInputAt <= 0) return;
  if (Date.now() - lastInputAt < idleDurationSeconds * 1000) return;

  idlePopupOpen = true;
  let result = '';
  try {
    idlePopupProcess = spawn(process.execPath, [
      path.join(__dirname, 'idle-popup.cjs'),
      String(idlePopupCountdownSeconds),
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    idlePopupOpen = false;
    idlePopupProcess = null;
    console.error('Could not start idle popup:', error.message);
    return;
  }

  idlePopupProcess.stdout.setEncoding('utf8');
  idlePopupProcess.stdout.on('data', chunk => { result += chunk; });
  idlePopupProcess.stderr.setEncoding('utf8');
  idlePopupProcess.stderr.on('data', chunk => console.error('[IDLE POPUP STDERR]', chunk));
  idlePopupProcess.on('error', error => {
    idlePopupOpen = false;
    idlePopupProcess = null;
    console.error('Could not start idle popup:', error.message);
  });
  idlePopupProcess.on('close', code => {
    const popupResult = result.trim();
    idlePopupOpen = false;
    idlePopupProcess = null;
    console.log('[IDLE POPUP EXIT CODE]', code, '[RESULT]', JSON.stringify(popupResult));
    if (popupResult.includes('IDLE_RESULT:WORKING')) {
      paused = false;
      idlePausePending = false;
      lastInputAt = Date.now();
    } else if (popupResult.includes('IDLE_RESULT:NOT_WORKING') || popupResult.includes('IDLE_RESULT:TIMEOUT')) {
      paused = true;
      idlePausePending = true;
      lastInputAt = 0;
      console.log('[IDLE] Not working or timeout. Tracking paused.');
    } else {
      console.error('[IDLE] Popup returned no recognized result; keeping tracking state.');
    }
  });
}
setInterval(checkIdleTimeout, 1000);

uIOhook.on('mousemove', event => {
  if (!tracking || paused) return;
  const current = { x: event.x, y: event.y };
  if (lastMouse && Math.hypot(current.x - lastMouse.x, current.y - lastMouse.y) >= 2) {
    counts.mouseMoves += 1;
    lastInputAt = Date.now();
  }
  lastMouse = current;
});
uIOhook.on('mousedown', () => {
  if (!tracking || paused) return;
  counts.mouseClicks += 1;
  lastInputAt = Date.now();
});
uIOhook.on('keydown', () => {
  // Ignore the event payload: no key names or typed content are captured.
  if (!tracking || paused) return;
  counts.keyPresses += 1;
  lastInputAt = Date.now();
});

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}
function readBody(req, callback) {
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 8192) req.destroy();
  });
  req.on('end', () => {
    try { callback(body ? JSON.parse(body) : {}); }
    catch { callback(null); }
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method !== 'POST') return send(res, 405, { error: 'POST required' });
  const action = (req.url || '').replace(/^\//, '').split('?')[0];
  readBody(req, body => {
    if (!body) return send(res, 400, { error: 'Invalid JSON body' });
    if (action !== 'status') console.log(`[REQ] ${new Date().toLocaleTimeString()} ${action}`);
    if (action === 'settings') {
      const duration = Number(body.idleDurationSeconds);
      const countdown = Number(body.idlePopupCountdownSeconds);
      if (Number.isFinite(duration)) idleDurationSeconds = Math.min(86400, Math.max(5, Math.floor(duration)));
      if (Number.isFinite(countdown)) idlePopupCountdownSeconds = Math.min(3600, Math.max(1, Math.floor(countdown)));
      console.log(`[SETTINGS] idle=${idleDurationSeconds}s countdown=${idlePopupCountdownSeconds}s`);
      return send(res, 200, { success: true, idleDurationSeconds, idlePopupCountdownSeconds });
    }
    if (action === 'start') {
      counts = { mouseMoves: 0, mouseClicks: 0, keyPresses: 0 };
      lastMouse = null;
      resetActivityTime();
      tracking = true; paused = false; idlePausePending = false; lastInputAt = Date.now();
      return send(res, 200, { success: true, tracking, paused, idleDurationSeconds, idlePopupCountdownSeconds });
    }
    if (action === 'pause') {
      paused = true; lastInputAt = 0;
      if (idlePopupProcess) { try { idlePopupProcess.kill(); } catch {} idlePopupProcess = null; idlePopupOpen = false; }
      return send(res, 200, { success: true, tracking, paused, idlePausePending });
    }
    if (action === 'resume') {
      // After a browser refresh the dashboard restores its session and only sends
      // "resume" (never "start"), so resume must also begin tracking if needed.
      if (!tracking) {
        counts = { mouseMoves: 0, mouseClicks: 0, keyPresses: 0 };
        lastMouse = null;
        resetActivityTime();
        tracking = true;
      }
      paused = false; idlePausePending = false; lastInputAt = Date.now();
      return send(res, 200, { success: true, tracking, paused, idlePausePending });
    }
    if (action === 'stop') {
      tracking = false; paused = false; idlePausePending = false; lastMouse = null; resetActivityTime();
      if (idlePopupProcess) { try { idlePopupProcess.kill(); } catch {} idlePopupProcess = null; idlePopupOpen = false; }
      return send(res, 200, { success: true, tracking, paused });
    }
    if (action === 'status') return send(res, 200, { success: true, tracking, paused, idlePausePending, idleDurationSeconds, idlePopupCountdownSeconds });
    if (action === 'snapshot') {
      const snapshot = { ...counts, activeSeconds, trackedSeconds, activityPercent: trackedSeconds > 0 ? Math.min(100, Math.round(activeSeconds / trackedSeconds * 100)) : 0 };
      counts = { mouseMoves: 0, mouseClicks: 0, keyPresses: 0 };
      activeSeconds = 0; trackedSeconds = 0; lastMouse = null;
      return send(res, 200, { success: true, counts: snapshot });
    }
    return send(res, 404, { error: 'Unknown action' });
  });
});
server.listen(PORT, HOST, () => {
  console.log(`WorkMonitor activity agent listening on http://${HOST}:${PORT}`);
  console.log('Counts global input event totals only; does not capture key content.');
  try { uIOhook.start(); } catch (error) { console.error('Could not start global input hook:', error); process.exitCode = 1; }
});
function shutdown() {
  tracking = false;
  if (idlePopupProcess) { try { idlePopupProcess.kill(); } catch {} }
  try { uIOhook.stop(); } catch {}
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
