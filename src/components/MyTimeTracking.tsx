import React from 'react';
import { Calendar, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';

/* ==========================================================================
   DATE HELPERS
   Work only on "YYYY-MM-DD" strings (UTC calendar math), so the selected date
   can never shift because of the browser time zone.
========================================================================== */

export type ViewMode = 'day' | 'week' | 'month' | 'all';

export interface DayRecord {
  dateKey: string;
  totalSeconds: number;
  screenshotCount: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

const parseKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
};

const toKey = (date: Date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

const toDate = (key: string) => {
  const { y, m, d } = parseKey(key);
  return new Date(Date.UTC(y, m - 1, d));
};

export const isValidDateKey = (key: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(key) && toKey(toDate(key)) === key;

export const addDays = (key: string, days: number) => {
  const date = toDate(key);
  date.setUTCDate(date.getUTCDate() + days);
  return toKey(date);
};

/** Week starts on Sunday (matches the reference design). */
export const startOfWeek = (key: string) =>
  addDays(key, -toDate(key).getUTCDay());

export const weekKeys = (key: string) => {
  const start = startOfWeek(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};

/** Moves by whole months; the day is clamped (Jan 31 + 1 month = Feb 28). */
export const addMonths = (key: string, months: number) => {
  const { y, m, d } = parseKey(key);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return toKey(target);
};

export const monthKeys = (key: string) => {
  const { y, m } = parseKey(key);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`);
};

const fmt = (
  key: string,
  options: Intl.DateTimeFormatOptions
) => new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(toDate(key));

export const formatLongDate = (key: string) =>
  fmt(key, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

export const formatWeekRange = (key: string) => {
  const keys = weekKeys(key);
  const first = fmt(keys[0], { month: 'short', day: 'numeric' });
  const last = fmt(keys[6], { month: 'short', day: 'numeric', year: 'numeric' });
  return `${first} – ${last}`;
};

export const formatMonthLabel = (key: string) =>
  fmt(key, { month: 'long', year: 'numeric' });

/** h:mm:ss, used for the week/month totals. */
export const formatClock = (totalSeconds = 0) => {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

const defaultDuration = (totalSeconds = 0) => {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m ${s % 60}s` : `${m}m ${s % 60}s`;
};

const minKey = (a: string, b: string) => (a <= b ? a : b);

/* ==========================================================================
   COMPONENT (display only: it never touches tracking, timers or screen share)
========================================================================== */

export interface MyTimeTrackingProps {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  selectedDate: string;
  onSelectedDateChange: (dateKey: string) => void;
  /** Today's date key, in the same convention the app already uses. */
  todayKey: string;
  /** One record per day that has history (from the existing history API). */
  records: DayRecord[];
  /** Optional live values for the selected day (override the record). */
  selectedDaySeconds?: number;
  selectedDayScreenshots?: number;
  loading?: boolean;
  onRefresh?: () => void;
  /** Existing duration formatter, e.g. formatSecondsToHoursMinutes. */
  formatDuration?: (seconds: number) => string;
  /** The existing Screenshot History block, rendered under the summary. */
  children?: React.ReactNode;
}

const MODES: { id: ViewMode; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'all', label: 'All' },
];

export const MyTimeTracking: React.FC<MyTimeTrackingProps> = ({
  mode,
  onModeChange,
  selectedDate,
  onSelectedDateChange,
  todayKey,
  records,
  selectedDaySeconds,
  selectedDayScreenshots,
  loading = false,
  onRefresh,
  formatDuration = defaultDuration,
  children,
}) => {
  const byDate = new Map(records.map((r) => [r.dateKey, r]));

  const secondsFor = (key: string) =>
    key === selectedDate && selectedDaySeconds !== undefined
      ? selectedDaySeconds
      : byDate.get(key)?.totalSeconds ?? 0;

  const shotsFor = (key: string) =>
    key === selectedDate && selectedDayScreenshots !== undefined
      ? selectedDayScreenshots
      : byDate.get(key)?.screenshotCount ?? 0;

  const hasData = (key: string) =>
    byDate.has(key) || (key === selectedDate && (selectedDaySeconds ?? 0) > 0);

  const week = weekKeys(selectedDate);
  const month = monthKeys(selectedDate);

  const rangeKeys = mode === 'month' ? month : week;
  const rangeSeconds = rangeKeys.reduce((sum, k) => sum + secondsFor(k), 0);
  const rangeShots = rangeKeys.reduce((sum, k) => sum + shotsFor(k), 0);

  const allRecords = [...records].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  const allSeconds = allRecords.reduce((s, r) => s + secondsFor(r.dateKey), 0);
  const allShots = allRecords.reduce((s, r) => s + shotsFor(r.dateKey), 0);

  /* ---- navigation ---- */

  const step = (direction: -1 | 1) => {
    if (mode === 'all') return;

    const next =
      mode === 'day'
        ? addDays(selectedDate, direction)
        : mode === 'week'
          ? addDays(selectedDate, 7 * direction)
          : addMonths(selectedDate, direction);

    // Never move into the future.
    onSelectedDateChange(minKey(next, todayKey));
  };

  const nextDisabled =
    mode === 'all' ||
    (mode === 'day' && selectedDate >= todayKey) ||
    (mode === 'week' && addDays(week[0], 7) > todayKey) ||
    (mode === 'month' && addMonths(`${selectedDate.slice(0, 7)}-01`, 1) > todayKey);

  const label =
    mode === 'day'
      ? formatLongDate(selectedDate)
      : mode === 'week'
        ? formatWeekRange(selectedDate)
        : mode === 'month'
          ? formatMonthLabel(selectedDate)
          : 'All available dates';

  const pickDate = (key: string) => {
    if (key > todayKey) return;
    onSelectedDateChange(key);
  };

  const navButton =
    'cursor-pointer w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:border-indigo-400';

  const dayCell = (key: string, compact = false) => {
    const { d } = parseKey(key);
    const future = key > todayKey;
    const selected = key === selectedDate;
    const shots = shotsFor(key);

    return (
      <button
        key={key}
        type="button"
        disabled={future}
        onClick={() => pickDate(key)}
        aria-pressed={selected}
        className={`text-left p-3 transition disabled:cursor-not-allowed ${
          selected
            ? 'bg-indigo-50 dark:bg-indigo-950/40'
            : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
        } ${future ? 'opacity-40' : ''}`}
      >
        <div className="text-xs font-bold text-slate-900 dark:text-white">
          {compact ? (
            d
          ) : (
            <>
              {fmt(key, { weekday: 'short' })}{' '}
              <span className="font-normal text-slate-400">{d}</span>
            </>
          )}
        </div>
        <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          {hasData(key) ? formatClock(secondsFor(key)) : '—'}
        </div>
        <div className="mt-1 text-[10px] text-slate-500">
          {shots} screenshot{shots === 1 ? '' : 's'}
        </div>
      </button>
    );
  };

  const summaryShots =
    mode === 'day' ? shotsFor(selectedDate) : mode === 'all' ? allShots : rangeShots;

  const summarySeconds =
    mode === 'day' ? secondsFor(selectedDate) : mode === 'all' ? allSeconds : rangeSeconds;

  const summaryLabel =
    mode === 'day' ? 'Daily Total' : mode === 'week' ? 'Week Total' : mode === 'month' ? 'Month Total' : 'All Time Total';

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="p-5 space-y-4">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h2 className="font-bold flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-600" />
              My Time Tracking
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Check your tracked hours by day, week, month or all time.
            </p>
          </div>

          <div
            role="tablist"
            aria-label="View"
            className="inline-flex self-start rounded-full border border-slate-300 dark:border-slate-700 p-0.5"
          >
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={mode === m.id}
                onClick={() => onModeChange(m.id)}
                className={`cursor-pointer px-4 py-1.5 rounded-full text-xs font-bold transition ${
                  mode === m.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-indigo-600'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* DATE NAVIGATION */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="Previous"
            onClick={() => step(-1)}
            disabled={mode === 'all'}
            className={navButton}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            aria-label="Next"
            onClick={() => step(1)}
            disabled={nextDisabled}
            className={navButton}
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="font-bold text-sm mx-1">{label}</div>

          <input
            type="date"
            value={selectedDate}
            max={todayKey}
            onChange={(event) => {
              const value = event.target.value;
              if (isValidDateKey(value)) pickDate(value);
            }}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
          />

          {onRefresh && (
            <button
              type="button"
              aria-label="Refresh"
              title="Refresh"
              onClick={onRefresh}
              className={navButton}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>

        {/* CALENDAR SUMMARY */}
        {(mode === 'day' || mode === 'week') && (
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="grid grid-cols-7 divide-x divide-slate-200 dark:divide-slate-800 overflow-x-auto min-w-0">
              {week.map((key) => dayCell(key))}
            </div>

            <div className="flex items-center justify-center sm:justify-end px-5 py-3 bg-slate-50 dark:bg-slate-800/60 text-xs font-bold border-t sm:border-t-0 sm:border-l border-slate-200 dark:border-slate-800">
              Total: {formatClock(week.reduce((s, k) => s + secondsFor(k), 0))}
            </div>
          </div>
        )}

        {mode === 'month' && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="grid grid-cols-7 text-[10px] uppercase font-bold text-slate-500 bg-slate-50 dark:bg-slate-800/60">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="px-3 py-2">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 divide-x divide-y divide-slate-200 dark:divide-slate-800 overflow-x-auto">
              {Array.from({ length: toDate(month[0]).getUTCDay() }, (_, i) => (
                <div key={`blank-${i}`} />
              ))}
              {month.map((key) => dayCell(key, true))}
            </div>
          </div>
        )}

        {mode === 'all' && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800 max-h-72 overflow-y-auto">
            {allRecords.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No tracking history available yet.
              </div>
            ) : (
              allRecords.map((r) => (
                <button
                  key={r.dateKey}
                  type="button"
                  onClick={() => pickDate(r.dateKey)}
                  aria-pressed={r.dateKey === selectedDate}
                  className={`w-full text-left p-3 flex items-center justify-between gap-3 ${
                    r.dateKey === selectedDate
                      ? 'bg-indigo-50 dark:bg-indigo-950/40'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <span className="text-sm font-bold">{formatLongDate(r.dateKey)}</span>
                  <span className="text-[11px] text-slate-500">
                    {formatClock(secondsFor(r.dateKey))} • {shotsFor(r.dateKey)} screenshot
                    {shotsFor(r.dateKey) === 1 ? '' : 's'}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {/* DAILY / RANGE SUMMARY */}
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-5 py-3 flex items-center justify-end gap-4 text-xs">
          <span className="text-slate-500">
            {summaryShots} screenshot{summaryShots === 1 ? '' : 's'}
          </span>
          <span className="font-bold">
            {summaryLabel}:{' '}
            <span className="text-emerald-600">{formatDuration(summarySeconds)}</span>
          </span>
        </div>
      </div>

      {/* Existing Screenshot History block goes here */}
      {children && (
        <div className="border-t border-slate-200 dark:border-slate-800 p-5">
          {children}
        </div>
      )}
    </div>
  );
};
