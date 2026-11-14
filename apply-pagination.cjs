/*
 * Adds screenshot pagination to EmployeeDashboard.tsx and AdminDashboard.tsx.
 * Run from the project root:   node apply-pagination.cjs
 *
 * Safe by design:
 *  - lines that are commented out (// ...) are ignored
 *  - each edit must match EXACTLY ONE real place, else the file is not touched
 *  - edits that are already applied are skipped, so a half-patched file is completed
 *  - a backup (<file>.bak) is written before saving
 *  - it never touches timer, capture, reconnect or storage code
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join('src', 'components');
const IMPORT_LINE = "import { PaginationControls, usePagination } from './ScreenshotPagination';";

const EMPLOYEE_HOOK = `
  // ---- Screenshot pagination (client-side, filtered list only) ----
  const screenshotPagination = usePagination(
    mergedScreenshots,
    \`\${currentUser.id}|\${selectedDate}\`
  );
  const pagedScreenshots = screenshotPagination.pageItems;
`;

const EMPLOYEE_CONTROLS = `
            <PaginationControls
              page={screenshotPagination.page}
              totalPages={screenshotPagination.totalPages}
              totalItems={screenshotPagination.totalItems}
              firstItemNumber={screenshotPagination.firstItemNumber}
              lastItemNumber={screenshotPagination.lastItemNumber}
              onPageChange={screenshotPagination.setPage}
            />
`;

const ADMIN_HOOK = `
    // ---- Screenshot pagination (selected employee + selected date only) ----
    const adminScreenshots = useMemo<ScreenshotItem[]>(
      () =>
        Array.isArray(selectedActivity?.screenshots)
          ? selectedActivity.screenshots
          : [],
      [selectedActivity]
    );

    const adminPagination = usePagination(
      adminScreenshots,
      \`\${selectedEmployeeId}|\${selectedDate}\`
    );

`;

const ADMIN_CONTROLS = `

                    <PaginationControls
                      page={adminPagination.page}
                      totalPages={adminPagination.totalPages}
                      totalItems={adminPagination.totalItems}
                      firstItemNumber={adminPagination.firstItemNumber}
                      lastItemNumber={adminPagination.lastItemNumber}
                      onPageChange={adminPagination.setPage}
                    />`;

// Each edit: { label, find, replace(match, ...groups), done }
//  done = regex that is true when this edit is already in the file.
const employeeEdits = [
  { label: 'import',
    find: /^import \{ TimeActivityReport \} from '\.\/TimeActivityReport';/m,
    replace: (m) => `${m}\n${IMPORT_LINE}`,
    done: /from '\.\/ScreenshotPagination'/ },
  { label: 'pagination hook after mergedScreenshots',
    find: /\}, \[\s*restoredScreenshots,\s*userScreenshots,\s*selectedDate,?\s*\]\);/,
    replace: (m) => `${m}\n${EMPLOYEE_HOOK}`,
    done: /const screenshotPagination = usePagination/ },
  { label: 'image loader loops current page only',
    find: /for \(const screenshot of mergedScreenshots\)/,
    replace: () => 'for (const screenshot of pagedScreenshots)',
    done: /for \(const screenshot of pagedScreenshots\)/ },
  { label: 'image loader dependency',
    find: /\}, \[mergedScreenshots\]\);/,
    replace: () => '}, [pagedScreenshots]);',
    done: /\}, \[pagedScreenshots\]\);/ },
  { label: 'render current page only',
    find: /\{\s*mergedScreenshots\.map\(/,
    replace: () => '{pagedScreenshots.map(',
    done: /\{\s*pagedScreenshots\.map\(/ },
  { label: 'pagination controls',
    find: /(\)\}\s*)(<\/div>\s*<\/div>\s*<\/div>\s*\{\/\* PREVIEW \*\/\})/,
    replace: (m, a, b) => `${a}${EMPLOYEE_CONTROLS}\n          ${b}`,
    done: /<PaginationControls/ },
];

const adminEdits = [
  { label: 'add useMemo to react import',
    find: /import React, \{\s*useEffect,\s*useRef,\s*useState,?\s*\} from 'react';/,
    replace: () => `import React, {\n  useEffect,\n  useMemo,\n  useRef,\n  useState,\n} from 'react';`,
    done: /import React, \{[^}]*\buseMemo\b[^}]*\} from 'react';/ },
  { label: 'pagination import',
    find: /import React, \{[^}]*\} from 'react';/,
    replace: (m) => `${m}\n${IMPORT_LINE}`,
    done: /from '\.\/ScreenshotPagination'/ },
  { label: 'pagination hook before UI',
    find: /\/\*\s*=+\s*UI\s*=+\s*\*\//,
    replace: (m) => `${ADMIN_HOOK}    ${m}`,
    done: /const adminPagination = usePagination/ },
  { label: 'render current page only',
    find: /\{\s*selectedActivity\s*\.screenshots\s*\.map\(/,
    replace: () => '{adminPagination.pageItems.map(',
    done: /\{\s*adminPagination\.pageItems\.map\(/ },
  { label: 'pagination controls',
    find: /('Select a date to view screenshots'\s*\}\s*<\/div>\s*<\/div>\s*\)\})/,
    replace: (m) => `${m}${ADMIN_CONTROLS}`,
    done: /<PaginationControls/ },
];

// Matches that start on a commented-out line (// ...) are not real code.
const realMatches = (text, regex) => {
  const g = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  const out = [];
  let m;
  while ((m = g.exec(text)) !== null) {
    const lineStart = text.lastIndexOf('\n', m.index - 1) + 1;
    const before = text.slice(lineStart, m.index);
    if (!/^\s*\/\//.test(before)) out.push(m);
    if (m[0].length === 0) g.lastIndex++;
  }
  return out;
};

// Same idea for "already applied" checks: ignore commented lines.
const isDone = (text, regex) => realMatches(text, regex).length > 0;

const patchFile = (name, edits) => {
  const file = path.join(DIR, name);
  if (!fs.existsSync(file)) {
    console.log(`FAIL  ${name}: not found at ${file} (run from the project root)`);
    return false;
  }
  const original = fs.readFileSync(file, 'utf8');
  const crlf = original.includes('\r\n');
  let text = original.replace(/\r\n/g, '\n');
  let applied = 0;
  let skipped = 0;

  for (const edit of edits) {
    if (isDone(text, edit.done)) { skipped++; continue; }

    const matches = realMatches(text, edit.find);
    if (matches.length !== 1) {
      console.log(
        `FAIL  ${name}: "${edit.label}" matched ${matches.length} real places (expected 1). File NOT changed.`
      );
      return false;
    }
    const m = matches[0];
    text = text.slice(0, m.index) + edit.replace(...m) + text.slice(m.index + m[0].length);
    applied++;
  }

  if (applied === 0) {
    console.log(`SKIP  ${name}: all ${edits.length} edits were already applied`);
    return true;
  }

  if (crlf) text = text.replace(/\n/g, '\r\n');
  fs.writeFileSync(file + '.bak', original);
  fs.writeFileSync(file, text);
  console.log(
    `OK    ${name}: ${applied} edits applied` +
    (skipped ? `, ${skipped} were already there` : '') +
    ` (backup: ${name}.bak)`
  );
  return true;
};

if (!fs.existsSync(path.join(DIR, 'ScreenshotPagination.tsx'))) {
  console.log('STOP  src/components/ScreenshotPagination.tsx is missing. Create it first.');
  process.exit(1);
}
const a = patchFile('EmployeeDashboard.tsx', employeeEdits);
const b = patchFile('AdminDashboard.tsx', adminEdits);
process.exit(a && b ? 0 : 1);
