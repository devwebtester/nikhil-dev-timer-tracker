const fs = require('fs');
const failures = [];

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

const EMP = 'src/components/EmployeeDashboard.tsx';
const ADM = 'src/components/AdminDashboard.tsx';
let emp = fs.readFileSync(EMP, 'utf8');
let adm = fs.readFileSync(ADM, 'utf8');

// Employee: "Today Total Tracked" card shows actual + approved (display only)
emp = once(
  emp,
  /formatSecondsToHoursMinutes\(\s*dayTotalSeconds\s*\)/,
  () =>
    'formatSecondsToHoursMinutes(dayTotalSeconds + (activityHistory.find((r) => r.dateKey === today)?.approvedSeconds || 0))',
  'emp: today total card'
);

// Admin: "Tracked Time" card shows actual + approved
adm = once(
  adm,
  /formatSeconds\(\s*selectedActivity\s*\?\.totalSeconds\s*\|\|\s*0\s*\)/,
  () =>
    'formatSeconds((selectedActivity?.totalSeconds || 0) + (selectedActivity?.approvedSeconds || 0))',
  'admin: tracked time card'
);

if (failures.length) {
  console.error('NOTHING WAS WRITTEN:');
  failures.forEach((f) => console.error(' - ' + f));
  process.exit(1);
}

fs.copyFileSync(EMP, EMP + '.bak-display');
fs.copyFileSync(ADM, ADM + '.bak-display');
fs.writeFileSync(EMP, emp);
fs.writeFileSync(ADM, adm);
console.log('Patched both files.');