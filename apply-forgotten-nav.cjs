const fs = require('fs');
const F = 'src/components/EmployeeDashboard.tsx';
let src = fs.readFileSync(F, 'utf8');
const failures = [];

if (src.includes("activeTab === 'forgotten'")) {
  console.log('Already patched.');
  process.exit(0);
}

// Replaces a match only if exactly 1 LIVE (not // commented) match exists.
function once(text, regex, replacer, label) {
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  const live = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) re.lastIndex++;
    const lineStart = text.lastIndexOf('\n', m.index - 1) + 1;
    if (text.slice(lineStart).trimStart().startsWith('//')) continue;
    live.push(m);
  }
  if (live.length !== 1) {
    failures.push(label + ' (found ' + live.length + ' live matches, expected 1)');
    return text;
  }
  const hit = live[0];
  return text.slice(0, hit.index) + replacer(...hit) + text.slice(hit.index + hit[0].length);
}

// 1. tab type
src = once(src, /\|\s*'history';/, () => "| 'history'\n  | 'forgotten';", 'type EmployeeTab');

// 2. nav item
src = once(
  src,
  /\{ id: 'history', label: 'Date-wise Work History', icon: Calendar \},/,
  (m) => m + "\n  { id: 'forgotten', label: 'Forgotten Time', icon: Clock },",
  'EMPLOYEE_TABS'
);

// 3. remove inline card from Dashboard tab
src = once(src, /\s*<EmployeeForgottenTime[\s\S]*?\/>/, () => '', 'remove inline card');

// 4. add new tab content before the Reports tab
src = once(
  src,
  /\{activeTab === 'reports' && \(/,
  (m) =>
    "{activeTab === 'forgotten' && (\n            <EmployeeForgottenTime\n              employeeId={currentUser.id}\n              todayKey={getTodayDateKey()}\n              request={(path, init) => fetch(`${backendUrl}${path}`, init)}\n            />\n          )}\n\n          " +
    m,
  'new tab content'
);

if (failures.length) {
  console.error('NOTHING WAS WRITTEN. Anchors not matched:');
  failures.forEach((f) => console.error(' - ' + f));
  process.exit(1);
}

fs.copyFileSync(F, F + '.bak-nav');
fs.writeFileSync(F, src);
console.log('Patched ' + F + ' (backup: ' + F + '.bak-nav)');