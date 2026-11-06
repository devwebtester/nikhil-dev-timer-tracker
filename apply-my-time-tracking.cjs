// /*
//  * Wires "My Time Tracking" into EmployeeDashboard.tsx and AdminDashboard.tsx.
//  * Run from the project root:   node apply-my-time-tracking.cjs
//  *
//  * Safe by design:
//  *  - commented-out (// ...) code is ignored
//  *  - each edit must match exactly ONE real place, otherwise that file is NOT changed
//  *  - edits already applied are skipped (safe to run twice)
//  *  - a backup (<file>.mtt.bak) is written before saving
//  *  - does NOT touch timer, capture, reconnect, lock handling, upload queue, storage, server.js
//  */
// const fs = require('fs');
// const path = require('path');

// const DIR = path.join('src', 'components');

// /* ======================================================================
//    EMPLOYEE
// ====================================================================== */

// const EMP_STATE = `

//   // My Time Tracking: Day / Week / Month / All. View only: it never touches
//   // the timer, screen sharing, capture or the current task.
//   const [historyViewMode, setHistoryViewMode] =
//     useState<ViewMode>('day');

//   // Stops a slow, older history response from overwriting a newer date.
//   const historyRequestRef = useRef(0);`;

// const EMP_RECORDS = `

//   // Records for the My Time Tracking card. Today's row also reflects the live
//   // timer (read only), so the calendar never lags behind the running clock.
//   const myTimeRecords: ActivityHistoryRecord[] = (() => {
//     const list = activityHistory.map((record) => ({ ...record }));

//     if (dayTotalSeconds > 0) {
//       const todayRecord = list.find((record) => record.dateKey === today);

//       if (todayRecord) {
//         todayRecord.totalSeconds = Math.max(
//           todayRecord.totalSeconds,
//           dayTotalSeconds
//         );
//       } else {
//         list.push({
//           dateKey: today,
//           totalSeconds: dayTotalSeconds,
//           screenshotCount: 0,
//         });
//       }
//     }

//     return list;
//   })();`;

// const EMP_CARD_OPEN = `<MyTimeTracking
//                   mode={historyViewMode}
//                   onModeChange={setHistoryViewMode}
//                   selectedDate={selectedDate}
//                   onSelectedDateChange={setSelectedDate}
//                   todayKey={today}
//                   records={myTimeRecords}
//                   selectedDayScreenshots={
//                     loadingHistory ? undefined : selectedDateScreenshotCount
//                   }
//                   loading={loadingHistory}
//                   onRefresh={() => void loadDateHistory()}
//                   formatDuration={formatSecondsToHoursMinutes}
//                 >
//                   <div className="space-y-5">`;

// const employeeEdits = [
//   { label: 'import',
//     find: /^import \{ PaginationControls, usePagination \} from '\.\/ScreenshotPagination';/m,
//     replace: (m) => `${m}\nimport { MyTimeTracking, type ViewMode } from './MyTimeTracking';`,
//     done: /from '\.\/MyTimeTracking'/ },

//   { label: 'legacy navigator switch (constant)',
//     find: /const EMPLOYEE_TABS: \{/,
//     replace: (m) => `// The old Year > Month > Dates picker is replaced by My Time Tracking.\n// Set to true to show it again.\nconst SHOW_LEGACY_DATE_NAVIGATOR = false;\n\n${m}`,
//     done: /const SHOW_LEGACY_DATE_NAVIGATOR = / },

//   { label: 'view mode state + request guard ref',
//     find: /\] = useState<EmployeeTab>\('dashboard'\);/,
//     replace: (m) => m + EMP_STATE,
//     done: /const \[historyViewMode, setHistoryViewMode\]/ },

//   { label: 'name loadingHistory',
//     find: /const \[\s*,\s*setLoadingHistory,\s*\] =\s*useState\(false\);/,
//     replace: () => 'const [\n    loadingHistory,\n    setLoadingHistory,\n  ] =\n    useState(false);',
//     done: /loadingHistory,\s*setLoadingHistory,/ },

//   { label: 'loadDateHistory request id',
//     find: /const loadDateHistory =\s*async \(\) => \{/,
//     replace: (m) => `${m}\n      const requestId = ++historyRequestRef.current;\n`,
//     done: /const requestId = \+\+historyRequestRef\.current;/ },

//   { label: 'drop stale history response (after fetch)',
//     find: /const activityData =\s*await readApiJson\(\s*activityResponse\s*\);/,
//     replace: (m) => `${m}\n\n        // A newer date was selected while this one was loading: drop this result.\n        if (requestId !== historyRequestRef.current) return; // [mtt] guard 1`,
//     done: /\[mtt\] guard 1/ },

//   { label: 'drop stale history response (before screenshots)',
//     find: /restored\.sort\(/,
//     replace: (m) => `if (requestId !== historyRequestRef.current) return; // [mtt] guard 2\n\n        ${m}`,
//     done: /\[mtt\] guard 2/ },

//   { label: 'loading flag only for the newest request',
//     find: /\} finally \{\s*setLoadingHistory\(\s*false\s*\);\s*\}/,
//     replace: () => '} finally {\n        if (requestId === historyRequestRef.current) {\n          setLoadingHistory(false);\n        }\n      }',
//     done: /if \(requestId === historyRequestRef\.current\) \{/ },

//   { label: 'never show another date while loading',
//     find: /restoredScreenshots\.forEach\(\s*\(\s*screenshot\s*\)\s*=>\s*\{/,
//     replace: (m) => `${m}\n          // Never show another date's screenshots while a new date is loading.\n          if (screenshot.dateKey !== selectedDate) return; // [mtt] date filter\n`,
//     done: /\[mtt\] date filter/ },

//   { label: 'card records',
//     find: /const today =\s*getTodayDateKey\(\);/,
//     replace: (m) => m + EMP_RECORDS,
//     done: /const myTimeRecords: ActivityHistoryRecord\[\]/ },

//   { label: 'history tab: card opening replaces old header',
//     find: /(\{activeTab === 'history' && \(\s*<>\s*)<div className="rounded-2xl[^"]*">\s*<div className="p-5 border-b[\s\S]*?<div className="p-5 space-y-5">/,
//     replace: (m, a) => `${a}${EMP_CARD_OPEN}`,
//     done: /<MyTimeTracking/ },

//   { label: 'history tab: card closing',
//     find: /(<PaginationControls\s+page=\{screenshotPagination\.page\}[\s\S]*?\/>\s*<\/div>\s*)<\/div>\s*<\/div>(\s*<\/>\s*\)\}\s*<\/div>\s*<\/div>\s*\{\/\* PREVIEW \*\/\})/,
//     replace: (m, a, b) => `${a}</div>\n                </MyTimeTracking>${b}`,
//     done: /<\/MyTimeTracking>/ },

//   { label: 'hide legacy navigator',
//     find: /\{activityHistory\.length > 0 && \(\s*<div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">/,
//     replace: (m) => m.replace('{activityHistory.length > 0 &&', '{SHOW_LEGACY_DATE_NAVIGATOR && activityHistory.length > 0 &&'),
//     done: /SHOW_LEGACY_DATE_NAVIGATOR && activityHistory/ },
// ];

// /* ======================================================================
//    ADMIN
// ====================================================================== */

// const ADMIN_STATE = `

//     // My Time Tracking (view only)
//     const [adminViewMode, setAdminViewMode] =
//       useState<ViewMode>('day');

//     // Employee whose history rows are loaded. The card is only shown for that
//     // employee, so a date can never be picked while the history is still loading.
//     const [historyReadyFor, setHistoryReadyFor] =
//       useState<string>('');

//     const latestEmployeeIdRef = useRef('');
//     const latestDateRef = useRef('');`;

// const ADMIN_HOOK = `
//     // ---- My Time Tracking (selected employee only; view only) ----
//     latestEmployeeIdRef.current = selectedEmployeeId;
//     latestDateRef.current = selectedDate;

//     const adminToday = getTodayDateKey();

//     // Same steps as clicking a date in the left list.
//     const handleAdminDateChange = (dateKey: string) => {
//       if (!selectedEmployeeId || dateKey === selectedDate) return;

//       activityRequestRef.current += 1;
//       setSelectedActivity(null);
//       setPreviewImage(null);
//       setSelectedDate(dateKey);
//     };

//     // Reloads this employee's history rows and the selected date,
//     // without changing the selected employee or date.
//     const refreshSelectedEmployeeData = async () => {
//       const employeeId = selectedEmployeeId;
//       const dateAtClick = selectedDate;

//       if (!employeeId) return;

//       try {
//         const response = await apiFetch(
//           \`/api/activity-history/\${encodeURIComponent(employeeId)}\`,
//           { method: 'GET', cache: 'no-store' }
//         );

//         const data = await readApiJson(response);

//         if (
//           response.ok &&
//           data?.success &&
//           latestEmployeeIdRef.current === employeeId
//         ) {
//           setHistoryRows(Array.isArray(data.records) ? data.records : []);
//         }
//       } catch (err: any) {
//         flash(\`❌ \${err.message}\`);
//       }

//       if (
//         dateAtClick &&
//         latestEmployeeIdRef.current === employeeId &&
//         latestDateRef.current === dateAtClick
//       ) {
//         void loadSelectedActivity(employeeId, dateAtClick);
//       }
//     };

//     `;

// const ADMIN_CARD = `

//                   {selectedEmployeeId &&
//                     historyReadyFor === selectedEmployeeId && (
//                       <MyTimeTracking
//                         mode={adminViewMode}
//                         onModeChange={setAdminViewMode}
//                         selectedDate={selectedDate || adminToday}
//                         onSelectedDateChange={handleAdminDateChange}
//                         todayKey={adminToday}
//                         records={historyRows}
//                         selectedDaySeconds={
//                           selectedActivity ? selectedActivity.totalSeconds : undefined
//                         }
//                         selectedDayScreenshots={
//                           selectedActivity ? selectedActivity.screenshotCount : undefined
//                         }
//                         onRefresh={() => void refreshSelectedEmployeeData()}
//                         formatDuration={formatSeconds}
//                       />
//                     )}
// `;

// const adminEdits = [
//   { label: 'imports',
//     find: /^import \{ PaginationControls, usePagination \} from '\.\/ScreenshotPagination';/m,
//     replace: (m) => `${m}\nimport { MyTimeTracking, type ViewMode } from './MyTimeTracking';\nimport { getTodayDateKey } from '../lib/utils';`,
//     done: /from '\.\/MyTimeTracking'/ },

//   { label: 'state',
//     find: /const activityRequestRef =\s*useRef\(0\);/,
//     replace: (m) => m + ADMIN_STATE,
//     done: /const \[adminViewMode, setAdminViewMode\]/ },

//   { label: 'history loaded: mark employee ready, select today',
//     find: /setHistoryRows\(\s*records\s*\);\s*setSelectedDate\(\s*''\s*\);/,
//     replace: () => "setHistoryRows(records);\n\n          setHistoryReadyFor(employeeId);\n\n          // Show today first (like the Employee dashboard).\n          setSelectedDate(getTodayDateKey());",
//     done: /setHistoryReadyFor\(employeeId\);/ },

//   { label: 'handlers',
//     find: /\/\*\s*=+\s*UI\s*=+\s*\*\//,
//     replace: (m) => `${ADMIN_HOOK}${m}`,
//     done: /const handleAdminDateChange = / },

//   { label: 'card',
//     find: /(\{\/\* RIGHT 75% \*\/\}\s*<div className="\s*space-y-4\s*min-w-0\s*">)/,
//     replace: (m) => m + ADMIN_CARD,
//     done: /<MyTimeTracking/ },
// ];

// /* ======================================================================
//    ENGINE
// ====================================================================== */

// const realMatches = (text, regex) => {
//   const g = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
//   const out = [];
//   let m;
//   while ((m = g.exec(text)) !== null) {
//     const lineStart = text.lastIndexOf('\n', m.index - 1) + 1;
//     if (!/^\s*\/\//.test(text.slice(lineStart, m.index))) out.push(m);
//     if (m[0].length === 0) g.lastIndex++;
//   }
//   return out;
// };

// const patchFile = (name, edits) => {
//   const file = path.join(DIR, name);
//   if (!fs.existsSync(file)) {
//     console.log(`FAIL  ${name}: not found at ${file} (run from the project root)`);
//     return false;
//   }
//   const original = fs.readFileSync(file, 'utf8');
//   const crlf = original.includes('\r\n');
//   let text = original.replace(/\r\n/g, '\n');
//   let applied = 0;
//   let skipped = 0;

//   for (const edit of edits) {
//     if (realMatches(text, edit.done).length > 0) { skipped++; continue; }
//     const matches = realMatches(text, edit.find);
//     if (matches.length !== 1) {
//       console.log(`FAIL  ${name}: "${edit.label}" matched ${matches.length} real places (expected 1). File NOT changed.`);
//       return false;
//     }
//     const m = matches[0];
//     text = text.slice(0, m.index) + edit.replace(...m) + text.slice(m.index + m[0].length);
//     applied++;
//   }

//   if (applied === 0) {
//     console.log(`SKIP  ${name}: all ${edits.length} edits were already applied`);
//     return true;
//   }

//   if (crlf) text = text.replace(/\n/g, '\r\n');
//   fs.writeFileSync(file + '.mtt.bak', original);
//   fs.writeFileSync(file, text);
//   console.log(`OK    ${name}: ${applied} edits applied` + (skipped ? `, ${skipped} already there` : '') + ` (backup: ${name}.mtt.bak)`);
//   return true;
// };

// for (const needed of ['MyTimeTracking.tsx', 'ScreenshotPagination.tsx']) {
//   if (!fs.existsSync(path.join(DIR, needed))) {
//     console.log(`STOP  src/components/${needed} is missing. Create it first.`);
//     process.exit(1);
//   }
// }

// const a = patchFile('EmployeeDashboard.tsx', employeeEdits);
// const b = patchFile('AdminDashboard.tsx', adminEdits);
// process.exit(a && b ? 0 : 1);


/*
 * Fixes "calendar says 17 but Screenshot History says 27 captures".
 * The same capture was listed twice: once as a live log from this session and
 * once loaded from storage / the server. They have different IDs, so they were
 * not recognised as the same screenshot.
 *
 * Run from the project root:   node fix-duplicate-screenshots.cjs
 * Only edits EmployeeDashboard.tsx (mergedScreenshots). Safe to run twice.
 * Backup: EmployeeDashboard.tsx.dedupe.bak
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join('src', 'components', 'EmployeeDashboard.tsx');

const REPLACEMENT = `// The same capture can arrive twice: once as a live log from this session
      // and once loaded from storage / the server. Their IDs differ, so match them
      // by the second they were captured (file names are Screen_<date>_<HH-MM-SS>).
      // Items without a usable time keep their own key and are never merged.
      const uniqueByCapture = new Map<string, ScreenshotLog>();

      map.forEach((screenshot, originalKey) => {
        const capturedAt = new Date(screenshot.timestamp).getTime();

        const captureKey =
          screenshot.timeFormatted && Number.isFinite(capturedAt)
            ? \`t:\${Math.floor(capturedAt / 1000)}\`
            : \`k:\${originalKey}\`;

        // Later entries (live logs) win over earlier ones (loaded copies).
        uniqueByCapture.set(captureKey, screenshot);
      });

      return Array.from(
        uniqueByCapture.values()
      ).sort(`;

const edit = {
  label: 'dedupe mergedScreenshots',
  find: /return Array\.from\(\s*map\.values\(\)\s*\)\.sort\(/,
  done: /const uniqueByCapture = new Map<string, ScreenshotLog>\(\);/,
};

const realMatches = (text, regex) => {
  const g = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  const out = [];
  let m;
  while ((m = g.exec(text)) !== null) {
    const lineStart = text.lastIndexOf('\n', m.index - 1) + 1;
    if (!/^\s*\/\//.test(text.slice(lineStart, m.index))) out.push(m);
  }
  return out;
};

if (!fs.existsSync(FILE)) {
  console.log(`FAIL  ${FILE} not found (run from the project root)`);
  process.exit(1);
}

const original = fs.readFileSync(FILE, 'utf8');
const crlf = original.includes('\r\n');
let text = original.replace(/\r\n/g, '\n');

if (realMatches(text, edit.done).length > 0) {
  console.log('SKIP  already applied');
  process.exit(0);
}

const matches = realMatches(text, edit.find);
if (matches.length !== 1) {
  console.log(`FAIL  "${edit.label}" matched ${matches.length} real places (expected 1). File NOT changed.`);
  process.exit(1);
}

const m = matches[0];
text = text.slice(0, m.index) + REPLACEMENT + text.slice(m.index + m[0].length);

if (crlf) text = text.replace(/\n/g, '\r\n');
fs.writeFileSync(FILE + '.dedupe.bak', original);
fs.writeFileSync(FILE, text);
console.log('OK    EmployeeDashboard.tsx: duplicate screenshots are now merged (backup: EmployeeDashboard.tsx.dedupe.bak)');
