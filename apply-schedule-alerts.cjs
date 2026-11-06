const fs = require('fs');
const F = 'src/components/EmployeeDashboard.tsx';
let src = fs.readFileSync(F, 'utf8');
const failures = [];

if (src.includes('ScheduleAlertsManager')) {
  console.log('Already patched.');
  process.exit(0);
}

// Replaces only if exactly 1 LIVE (not // commented) match exists.
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

src = once(
  src,
  /import \{ EmployeeForgottenTime \} from '\.\/ForgottenTime';/,
  (m) => m + "\nimport { ScheduleAlertsManager } from './ScheduleAlerts';",
  'import'
);

src = once(
  src,
  /FileText,\s*\} from 'lucide-react';/,
  () => "FileText,\n  Bell,\n} from 'lucide-react';",
  'lucide Bell'
);

src = once(src, /\|\s*'forgotten';/, () => "| 'forgotten'\n  | 'alerts';", 'EmployeeTab type');

src = once(
  src,
  /\{ id: 'forgotten', label: 'Forgotten Time', icon: Clock \},/,
  (m) => m + "\n  { id: 'alerts', label: 'Schedule Alerts', icon: Bell },",
  'EMPLOYEE_TABS'
);

src = once(
  src,
  /\{\/\* TAB CONTENT \*\/\}\s*<div className="flex-1 min-w-0 w-full space-y-6">/,
  (m) =>
    m +
    `

          <ScheduleAlertsManager
            employeeId={currentUser.id}
            showSettings={activeTab === 'alerts'}
            isTracking={isTracking}
            isPaused={isPaused}
            sessionSeconds={sessionSeconds}
            dayTotalSeconds={dayTotalSeconds}
            onStart={startTracking}
            onPause={pauseTracking}
            onResume={resumeTracking}
            onStop={stopTracking}
          />
`,
  'render manager'
);

if (failures.length) {
  console.error('NOTHING WAS WRITTEN:');
  failures.forEach((f) => console.error(' - ' + f));
  process.exit(1);
}

fs.copyFileSync(F, F + '.bak-alerts');
fs.writeFileSync(F, src);
console.log('Patched ' + F + ' (backup: ' + F + '.bak-alerts)');