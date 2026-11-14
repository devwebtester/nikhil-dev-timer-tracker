// import React, { useCallback, useEffect, useRef, useState } from 'react';
// import { Bell, X } from 'lucide-react';
// import { getTodayDateKey } from '../lib/utils';

// export type AlertKind = 'work-start' | 'break-start' | 'break-end' | 'work-done' | 'test';

// interface AlertSettings {
//   enabled: boolean;
//   workStart: string;
//   breakStart: string;
//   breakEnd: string;
//   workHours: number;
//   takeBreak: boolean;
//   playSound: boolean;
//   floatingOnEveryTab: boolean;
//   desktopNotification: boolean;
//   popup: boolean;
//   floatingBar: boolean;
//   floatingHidden: boolean;
// }

// const DEFAULTS: AlertSettings = {
//   enabled: true,
//   workStart: '09:00',
//   breakStart: '13:00',
//   breakEnd: '14:00',
//   workHours: 8,
//   takeBreak: true,
//   playSound: true,
//   floatingOnEveryTab: true,
//   desktopNotification: true,
//   popup: true,
//   floatingBar: true,
//   floatingHidden: false,
// };

// const COPY: Record<AlertKind, { title: string; text: string; voice: string }> = {
//   'work-start': {
//     title: 'Work time started',
//     text: 'Your work time has started. Please start tracking.',
//     voice: 'Your work time has started. Please start your timer.',
//   },
//   'break-start': {
//     title: 'Break time',
//     text: 'Your break time has started. Please pause your timer.',
//     voice: 'Your break time has started. Please pause your timer.',
//   },
//   'break-end': {
//     title: 'Break is over',
//     text: 'Your break is over. Please resume your work timer.',
//     voice: 'Your break is over. Please resume your timer.',
//   },
//   'work-done': {
//     title: 'Work hours completed',
//     text: 'You have completed your daily work hours. Please stop the timer.',
//     voice: 'You have completed your daily work hours. Please stop your timer.',
//   },
//   test: {
//     title: 'Test reminder',
//     text: 'This is a test reminder. Your timer was not changed.',
//     voice: 'This is a test reminder.',
//   },
// };

// const toMin = (t: string) => {
//   const [h, m] = String(t || '').split(':').map(Number);
//   return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : -1;
// };

// const clock = (total: number) => {
//   const s = Math.max(0, Math.floor(total || 0));
//   const p = (n: number) => String(n).padStart(2, '0');
//   return `${Math.floor(s / 3600)}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
// };

// const loadSettings = (key: string): AlertSettings => {
//   try {
//     const raw = localStorage.getItem(key);
//     return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
//   } catch {
//     return { ...DEFAULTS };
//   }
// };

// const speak = (text: string) => {
//   try {
//     if (!('speechSynthesis' in window)) return;
//     window.speechSynthesis.cancel();
//     window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
//   } catch {
//     // Blocked by browser autoplay rules: popup / bar stay visible.
//   }
// };

// const requestPermission = () => {
//   try {
//     if ('Notification' in window && Notification.permission === 'default') {
//       void Notification.requestPermission();
//     }
//   } catch {
//     // ignore
//   }
// };

// const notify = (title: string, body: string, kind: string) => {
//   try {
//     if (!('Notification' in window) || Notification.permission !== 'granted') return;
//     new Notification(title, { body, tag: `wm-schedule-${kind}` });
//   } catch {
//     // ignore
//   }
// };

// interface Remote {
//   sender: string;
//   isTracking: boolean;
//   isPaused: boolean;
//   seconds: number;
//   ts: number;
// }

// interface Props {
//   employeeId: string;
//   showSettings: boolean;
//   isTracking: boolean;
//   isPaused: boolean;
//   sessionSeconds: number;
//   dayTotalSeconds: number;
//   onStart: () => Promise<void> | void;
//   onPause: () => Promise<void> | void;
//   onResume: () => Promise<void> | void;
//   onStop: () => Promise<void> | void;
// }

// const inputCls =
//   'mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm';
// const btn =
//   'cursor-pointer px-3 py-2 rounded-lg text-xs font-bold text-white';

// export const ScheduleAlertsManager: React.FC<Props> = (props) => {
//   const { employeeId, showSettings } = props;
//   const storageKey = `wm_schedule_alerts_${employeeId}`;

//   const [settings, setSettings] = useState<AlertSettings>(() => loadSettings(storageKey));
//   const [reminder, setReminder] = useState<{ kind: AlertKind; id: number } | null>(null);
//   const [remote, setRemote] = useState<Remote | null>(null);
//   const [, setTick] = useState(0);

//   const senderId = useRef(Math.random().toString(36).slice(2));
//   const channelRef = useRef<BroadcastChannel | null>(null);
//   const latest = useRef(props);
//   latest.current = props;
//   const settingsRef = useRef(settings);
//   settingsRef.current = settings;
//   const remoteRef = useRef<Remote | null>(null);
//   remoteRef.current = remote;

//   const update = (patch: Partial<AlertSettings>) => {
//     const next = { ...settingsRef.current, ...patch };
//     settingsRef.current = next;
//     setSettings(next);
//     try {
//       localStorage.setItem(storageKey, JSON.stringify(next));
//     } catch {
//       // ignore
//     }
//   };

//   const post = useCallback((msg: Record<string, unknown>) => {
//     try {
//       channelRef.current?.postMessage({ ...msg, sender: senderId.current });
//     } catch {
//       // ignore
//     }
//   }, []);

//   // Effective timer state: this tab's own timer, or the tab that owns tracking.
//   const remoteLive = remote && Date.now() - remote.ts < 5000 ? remote : null;
//   const eff = props.isTracking
//     ? { tracking: true, paused: props.isPaused, seconds: props.sessionSeconds, owner: true }
//     : remoteLive
//       ? { tracking: true, paused: remoteLive.isPaused, seconds: remoteLive.seconds, owner: false }
//       : { tracking: false, paused: false, seconds: props.sessionSeconds, owner: false };
//   const effRef = useRef(eff);
//   effRef.current = eff;

//   // Settings changed in another tab.
//   useEffect(() => {
//     const onStorage = (e: StorageEvent) => {
//       if (e.key === storageKey) setSettings(loadSettings(storageKey));
//     };
//     window.addEventListener('storage', onStorage);
//     return () => window.removeEventListener('storage', onStorage);
//   }, [storageKey]);

//   const trigger = (kind: AlertKind, loud: boolean) => {
//     const s = settingsRef.current;
//     setReminder({ kind, id: Date.now() });
//     if (!loud) return;
//     post({ type: 'reminder', kind });
//     const c = COPY[kind];
//     if (s.playSound) speak(c.voice);
//     if (s.desktopNotification) notify(c.title, c.text, kind);
//   };
//   const triggerRef = useRef(trigger);
//   triggerRef.current = trigger;

//   // Cross-tab channel (same timer, commands go to the tab that owns tracking).
//   useEffect(() => {
//     if (typeof BroadcastChannel === 'undefined') return;
//     const ch = new BroadcastChannel(`wm-schedule-alerts-${employeeId}`);
//     channelRef.current = ch;

//     ch.onmessage = (e: MessageEvent) => {
//       const m = e.data;
//       if (!m || m.sender === senderId.current) return;

//       if (m.type === 'state') {
//         if (m.isTracking) {
//           setRemote({
//             sender: m.sender,
//             isTracking: true,
//             isPaused: !!m.isPaused,
//             seconds: Number(m.seconds) || 0,
//             ts: Date.now(),
//           });
//         } else if (remoteRef.current?.sender === m.sender) {
//           setRemote(null);
//         }
//       } else if (m.type === 'reminder') {
//         setReminder({ kind: m.kind, id: Date.now() });
//       } else if (m.type === 'dismiss') {
//         setReminder(null);
//       } else if (m.type === 'cmd') {
//         const l = latest.current;
//         if (!l.isTracking) return;
//         if (m.cmd === 'pause' && !l.isPaused) void l.onPause();
//         if (m.cmd === 'resume' && l.isPaused) void l.onResume();
//       }
//     };

//     return () => {
//       ch.close();
//       channelRef.current = null;
//     };
//   }, [employeeId]);

//   // The tab that owns the timer broadcasts its state.
//   const wasTracking = useRef(false);
//   useEffect(() => {
//     if (props.isTracking) {
//       post({
//         type: 'state',
//         isTracking: true,
//         isPaused: props.isPaused,
//         seconds: props.sessionSeconds,
//       });
//       wasTracking.current = true;
//     } else if (wasTracking.current) {
//       post({ type: 'state', isTracking: false });
//       wasTracking.current = false;
//     }
//   }, [props.isTracking, props.isPaused, props.sessionSeconds, post]);

//   // Scheduler: each reminder fires once per day (claimed in localStorage, so
//   // several open tabs never fire it twice).
//   useEffect(() => {
//     try {
//       const prefix = `wm_alert_fired_${employeeId}_`;
//       const today = getTodayDateKey();
//       Object.keys(localStorage).forEach((k) => {
//         if (k.startsWith(prefix) && !k.startsWith(`${prefix}${today}_`)) {
//           localStorage.removeItem(k);
//         }
//       });
//     } catch {
//       // ignore
//     }

//     const claim = (kind: string, time: string) => {
//       const key = `wm_alert_fired_${employeeId}_${getTodayDateKey()}_${kind}_${time}`;
//       try {
//         if (localStorage.getItem(key)) return false;
//         localStorage.setItem(key, '1');
//         return true;
//       } catch {
//         return false;
//       }
//     };

//     const check = () => {
//       setTick((t) => t + 1);
//       const s = settingsRef.current;
//       if (!s.enabled) return;

//       const now = new Date();
//       const mins = now.getHours() * 60 + now.getMinutes();
//       // Only within 5 minutes after the set time, so old times never fire.
//       const due = (t: string) => {
//         const m = toMin(t);
//         return m >= 0 && mins >= m && mins - m <= 5;
//       };
//       const e = effRef.current;

//       if (due(s.workStart) && claim('work-start', s.workStart)) {
//         if (!e.tracking) triggerRef.current('work-start', true);
//       }

//       if (s.takeBreak) {
//         if (due(s.breakStart) && claim('break-start', s.breakStart)) {
//           if (e.tracking && !e.paused) triggerRef.current('break-start', true);
//         }
//         if (due(s.breakEnd) && claim('break-end', s.breakEnd)) {
//           if (!(e.tracking && !e.paused)) triggerRef.current('break-end', true);
//         }
//       }

//       const l = latest.current;
//       if (
//         s.workHours > 0 &&
//         l.isTracking &&
//         !l.isPaused &&
//         l.dayTotalSeconds >= s.workHours * 3600 &&
//         claim('work-done', String(s.workHours))
//       ) {
//         triggerRef.current('work-done', true);
//       }
//     };

//     const id = window.setInterval(check, 1000);
//     check();
//     return () => window.clearInterval(id);
//   }, [employeeId]);

//   /* ---------- actions (always use the existing timer functions) ---------- */

//   const dismiss = () => {
//     setReminder(null);
//     post({ type: 'dismiss' });
//   };

//   const doStart = () => {
//     if (!effRef.current.tracking) void latest.current.onStart();
//     dismiss();
//   };

//   const doPause = () => {
//     const e = effRef.current;
//     if (e.tracking && !e.paused) {
//       if (e.owner) void latest.current.onPause();
//       else post({ type: 'cmd', cmd: 'pause' });
//     }
//     dismiss();
//   };

//   const doResume = () => {
//     const e = effRef.current;
//     if (e.tracking && e.paused) {
//       if (e.owner) void latest.current.onResume();
//       else post({ type: 'cmd', cmd: 'resume' });
//     }
//     dismiss();
//   };

//   const doStop = () => {
//     if (effRef.current.owner) void latest.current.onStop();
//     dismiss();
//   };

//   const sendTest = () => {
//     requestPermission();
//     triggerRef.current('test', true); // never touches timer or fired flags
//   };

//   const kind = reminder?.kind;
//   const actions = (
//     <>
//       {!eff.tracking && (kind === 'work-start' || kind === 'break-end') && (
//         <button type="button" onClick={doStart} className={`${btn} bg-emerald-600 hover:bg-emerald-500`}>
//           Start Timer
//         </button>
//       )}
//       {eff.tracking && !eff.paused && kind === 'break-start' && (
//         <button type="button" onClick={doPause} className={`${btn} bg-amber-500 hover:bg-amber-400`}>
//           Pause Timer
//         </button>
//       )}
//       {eff.tracking && eff.paused && kind === 'break-end' && (
//         <button type="button" onClick={doResume} className={`${btn} bg-indigo-600 hover:bg-indigo-500`}>
//           Resume Timer
//         </button>
//       )}
//       {eff.owner && kind === 'work-done' && (
//         <button type="button" onClick={doStop} className={`${btn} bg-rose-600 hover:bg-rose-500`}>
//           Stop Timer
//         </button>
//       )}
//       {reminder && (
//         <button
//           type="button"
//           onClick={dismiss}
//           className="cursor-pointer px-3 py-2 rounded-lg text-xs font-bold border border-slate-400 text-slate-700 dark:text-slate-200"
//         >
//           Dismiss
//         </button>
//       )}
//     </>
//   );

//   const barVisible =
//     settings.floatingBar &&
//     !settings.floatingHidden &&
//     (settings.floatingOnEveryTab || showSettings || !!reminder);

//   const statusText = reminder
//     ? COPY[reminder.kind].text
//     : eff.tracking
//       ? eff.paused
//         ? 'Timer paused'
//         : 'Tracking is running'
//       : 'Tracking is not running';

//   const check = (label: string, key: keyof AlertSettings, onEnable?: () => void) => (
//     <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer">
//       <input
//         type="checkbox"
//         checked={Boolean(settings[key])}
//         onChange={(e) => {
//           update({ [key]: e.target.checked } as Partial<AlertSettings>);
//           if (e.target.checked) onEnable?.();
//         }}
//       />
//       {label}
//     </label>
//   );

//   const toggle = (label: string, desc: string, key: 'popup' | 'floatingBar') => (
//     <button
//       type="button"
//       onClick={() => update({ [key]: !settings[key] } as Partial<AlertSettings>)}
//       className="cursor-pointer text-left rounded-xl border border-slate-200 dark:border-slate-700 p-3 flex items-center justify-between gap-3"
//     >
//       <div>
//         <div className="text-xs font-bold">{label}</div>
//         <div className="text-[11px] text-slate-500 mt-1">{desc}</div>
//       </div>
//       <span className={`text-xs font-bold ${settings[key] ? 'text-emerald-600' : 'text-slate-400'}`}>
//         {settings[key] ? '✓ On' : 'Off'}
//       </span>
//     </button>
//   );

//   return (
//     <>
//       {showSettings && (
//         <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
//           <div className="flex items-start justify-between gap-3">
//             <div>
//               <h2 className="font-bold flex items-center gap-2">
//                 <Bell className="w-4 h-4 text-indigo-600" />
//                 Schedule Alerts
//               </h2>
//               <div className="text-xs text-slate-500 mt-1">
//                 Start {settings.workStart} • Break {settings.breakStart}–{settings.breakEnd} •{' '}
//                 {settings.workHours}h work day
//               </div>
//             </div>
//             <div className="flex items-center gap-3">
//               <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer">
//                 <input
//                   type="checkbox"
//                   checked={settings.enabled}
//                   onChange={(e) => update({ enabled: e.target.checked })}
//                 />
//                 Alerts on
//               </label>
//               <button
//                 type="button"
//                 onClick={() => update({ floatingHidden: !settings.floatingHidden })}
//                 className="cursor-pointer px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold"
//               >
//                 {settings.floatingHidden ? 'Show' : 'Hide'}
//               </button>
//             </div>
//           </div>

//           <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
//             <div className="text-xs font-bold">Get reminders on every window and tab</div>
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
//               {toggle('Popup notification', 'Popups appear over the app on every tab.', 'popup')}
//               {toggle('Floating bar', 'The timer and reminders stay visible on screen.', 'floatingBar')}
//             </div>
//             <div className="flex flex-wrap items-center gap-3">
//               <button
//                 type="button"
//                 onClick={sendTest}
//                 className="cursor-pointer px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold"
//               >
//                 Send test reminder
//               </button>
//               <span className="text-[11px] text-slate-500">
//                 Shows a sample reminder. It never changes your timer.
//               </span>
//             </div>
//           </div>

//           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
//             <label className="block text-[11px] font-bold uppercase text-slate-500">
//               Work start time
//               <input
//                 type="time"
//                 value={settings.workStart}
//                 onChange={(e) => update({ workStart: e.target.value })}
//                 className={inputCls}
//               />
//               <span className="block mt-1 normal-case font-normal">Reminds you to start tracking.</span>
//             </label>
//             <label className="block text-[11px] font-bold uppercase text-slate-500">
//               Break starts
//               <input
//                 type="time"
//                 value={settings.breakStart}
//                 onChange={(e) => update({ breakStart: e.target.value })}
//                 className={inputCls}
//               />
//               <span className="block mt-1 normal-case font-normal">Reminds you to pause.</span>
//             </label>
//             <label className="block text-[11px] font-bold uppercase text-slate-500">
//               Break ends
//               <input
//                 type="time"
//                 value={settings.breakEnd}
//                 onChange={(e) => update({ breakEnd: e.target.value })}
//                 className={inputCls}
//               />
//               <span className="block mt-1 normal-case font-normal">Reminds you to resume.</span>
//             </label>
//             <label className="block text-[11px] font-bold uppercase text-slate-500">
//               Work hours per day
//               <input
//                 type="number"
//                 min={1}
//                 max={24}
//                 value={settings.workHours}
//                 onChange={(e) =>
//                   update({ workHours: Math.min(24, Math.max(1, Number(e.target.value) || 1)) })
//                 }
//                 className={inputCls}
//               />
//               <span className="block mt-1 normal-case font-normal">Reminds you to stop the timer.</span>
//             </label>
//           </div>

//           <div className="flex flex-wrap gap-5">
//             {check('I take a break', 'takeBreak')}
//             {check('Play sound', 'playSound')}
//             {check('Floating bar on every tab', 'floatingOnEveryTab')}
//             {check('Desktop notification', 'desktopNotification', requestPermission)}
//           </div>

//           <div className="text-[11px] text-slate-500">
//             Times use this computer&apos;s clock. Each reminder appears only once at its set time.
//           </div>
//         </div>
//       )}

//       {/* POPUP */}
//       {settings.popup && reminder && (
//         <div className="fixed inset-0 z-[75] bg-black/40 flex items-center justify-center p-4">
//           <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-2xl">
//             <div className="flex items-center gap-2 font-bold">
//               <Bell className="w-4 h-4 text-indigo-600" />
//               {COPY[reminder.kind].title}
//             </div>
//             <div className="text-sm text-slate-600 dark:text-slate-300">
//               {COPY[reminder.kind].text}
//             </div>
//             <div className="flex flex-wrap gap-2">{actions}</div>
//           </div>
//         </div>
//       )}

//       {/* FLOATING BAR */}
//       {barVisible && (
//         <div className="fixed bottom-4 right-4 z-[65] w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl bg-slate-900 text-white border border-indigo-500 shadow-2xl p-3 space-y-2">
//           <div className="flex items-center justify-between gap-2">
//             <div className="font-mono text-lg font-black">{clock(eff.seconds)}</div>
//             <button
//               type="button"
//               aria-label="Hide floating bar"
//               title="Hide floating bar (reminders keep working)"
//               onClick={() => update({ floatingHidden: true })}
//               className="cursor-pointer p-1 text-slate-300 hover:text-white"
//             >
//               <X className="w-4 h-4" />
//             </button>
//           </div>
//           <div className="text-xs font-semibold text-slate-200">{statusText}</div>
//           <div className="flex flex-wrap gap-2">
//             {!eff.tracking && (
//               <button type="button" onClick={doStart} className={`${btn} bg-emerald-600 hover:bg-emerald-500`}>
//                 Start Timer
//               </button>
//             )}
//             {eff.tracking && !eff.paused && (
//               <button type="button" onClick={doPause} className={`${btn} bg-amber-500 hover:bg-amber-400`}>
//                 Pause Timer
//               </button>
//             )}
//             {eff.tracking && eff.paused && (
//               <button type="button" onClick={doResume} className={`${btn} bg-indigo-600 hover:bg-indigo-500`}>
//                 Resume Timer
//               </button>
//             )}
//             {reminder && (
//               <button
//                 type="button"
//                 onClick={dismiss}
//                 className="cursor-pointer px-3 py-2 rounded-lg text-xs font-bold border border-slate-500 text-slate-200"
//               >
//                 Dismiss
//               </button>
//             )}
//           </div>
//         </div>
//       )}
//     </>
//   );
// };

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X, ExternalLink } from 'lucide-react';
import { getTodayDateKey } from '../lib/utils';

export type AlertKind = 'work-start' | 'break-start' | 'break-end' | 'work-done' | 'test';

interface AlertSettings {
  enabled: boolean;
  workStart: string;
  breakStart: string;
  breakEnd: string;
  workHours: number;
  takeBreak: boolean;
  playSound: boolean;
  floatingOnEveryTab: boolean;
  desktopNotification: boolean;
  popup: boolean;
  floatingBar: boolean;
  floatingHidden: boolean;
}

const DEFAULTS: AlertSettings = {
  enabled: true,
  workStart: '09:00',
  breakStart: '13:00',
  breakEnd: '14:00',
  workHours: 8,
  takeBreak: true,
  playSound: true,
  floatingOnEveryTab: true,
  desktopNotification: true,
  popup: true,
  floatingBar: true,
  floatingHidden: false,
};

const COPY: Record<AlertKind, { title: string; text: string; voice: string }> = {
  'work-start': {
    title: 'Work time started',
    text: 'Your work time has started. Please start tracking.',
    voice: 'Your work time has started. Please start your timer.',
  },
  'break-start': {
    title: 'Break time',
    text: 'Your break time has started. Please pause your timer.',
    voice: 'Your break time has started. Please pause your timer.',
  },
  'break-end': {
    title: 'Break is over',
    text: 'Your break is over. Please resume your work timer.',
    voice: 'Your break is over. Please resume your timer.',
  },
  'work-done': {
    title: 'Work hours completed',
    text: 'You have completed your daily work hours. Please stop the timer.',
    voice: 'You have completed your daily work hours. Please stop your timer.',
  },
  test: {
    title: 'Test reminder',
    text: 'This is a test reminder. Your timer was not changed.',
    voice: 'This is a test reminder.',
  },
};

const toMin = (t: string) => {
  const [h, m] = String(t || '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : -1;
};

const clock = (total: number) => {
  const s = Math.max(0, Math.floor(total || 0));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(s / 3600)}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};

const loadSettings = (key: string): AlertSettings => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
};

interface BarPos {
  x: number;
  y: number;
}

const BAR_W = 320;
const BAR_H = 120;

const loadPos = (key: string): BarPos | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return Number.isFinite(p?.x) && Number.isFinite(p?.y) ? { x: p.x, y: p.y } : null;
  } catch {
    return null;
  }
};

const clampPos = (p: BarPos, w = BAR_W, h = BAR_H): BarPos => ({
  x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - w)),
  y: Math.min(Math.max(0, p.y), Math.max(0, window.innerHeight - h)),
});

const speak = (text: string) => {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  } catch {
    // Blocked by browser autoplay rules: popup / bar stay visible.
  }
};

const requestPermission = () => {
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  } catch {
    // ignore
  }
};

const notify = (title: string, body: string, kind: string) => {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification(title, { body, tag: `wm-schedule-${kind}` });
  } catch {
    // ignore
  }
};

interface Remote {
  sender: string;
  isTracking: boolean;
  isPaused: boolean;
  seconds: number;
  ts: number;
}

// Another tab's timer state is trusted for this long without a new update
// (background tabs can be throttled by the browser).
const REMOTE_STALE_MS = 90000;

// The active reminder is also kept in localStorage, so every tab (even one that
// was sleeping, reloaded or opened later) shows the same popup.
const REMINDER_TTL_MS = 10 * 60 * 1000;

const loadActiveReminder = (key: string): { kind: AlertKind; id: number } | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const r = JSON.parse(raw);
    if (!r || !COPY[r.kind as AlertKind]) return null;
    const id = Number(r.id);
    if (!Number.isFinite(id) || Date.now() - id > REMINDER_TTL_MS) return null;
    return { kind: r.kind as AlertKind, id };
  } catch {
    return null;
  }
};

interface Props {
  employeeId: string;
  showSettings: boolean;
  isTracking: boolean;
  isPaused: boolean;
  sessionSeconds: number;
  dayTotalSeconds: number;
  onStart: () => Promise<void> | void;
  onPause: () => Promise<void> | void;
  onResume: () => Promise<void> | void;
  onStop: () => Promise<void> | void;
}

const inputCls =
  'mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm';
const btn =
  'cursor-pointer px-3 py-2 rounded-lg text-xs font-bold text-white';

export const ScheduleAlertsManager: React.FC<Props> = (props) => {
  const { employeeId, showSettings } = props;
  const storageKey = `wm_schedule_alerts_${employeeId}`;
  const posKey = `wm_schedule_bar_pos_${employeeId}`;
  const reminderKey = `wm_schedule_active_reminder_${employeeId}`;

  const [settings, setSettings] = useState<AlertSettings>(() => loadSettings(storageKey));
  const [reminder, setReminder] = useState<{ kind: AlertKind; id: number } | null>(() =>
    loadActiveReminder(reminderKey)
  );
  const [remote, setRemote] = useState<Remote | null>(null);
  const [barPos, setBarPos] = useState<BarPos | null>(() => loadPos(posKey));
  const [, setTick] = useState(0);
  const [pip, setPip] = useState<Window | null>(null);
  const pipRef = useRef<Window | null>(null);
  pipRef.current = pip;

  const senderId = useRef(Math.random().toString(36).slice(2));
  const channelRef = useRef<BroadcastChannel | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const remoteRef = useRef<Remote | null>(null);
  remoteRef.current = remote;

  const barRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const barPosRef = useRef<BarPos | null>(barPos);
  barPosRef.current = barPos;

  const update = (patch: Partial<AlertSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const post = useCallback((msg: Record<string, unknown>) => {
    try {
      channelRef.current?.postMessage({ ...msg, sender: senderId.current });
    } catch {
      // ignore
    }
  }, []);

  // Effective timer state: this tab's own timer, or the tab that owns tracking.
  const remoteLive = remote && Date.now() - remote.ts < REMOTE_STALE_MS ? remote : null;
  const remoteSeconds = remoteLive
    ? remoteLive.isPaused
      ? remoteLive.seconds
      : remoteLive.seconds + Math.floor((Date.now() - remoteLive.ts) / 1000)
    : 0;
  const eff = props.isTracking
    ? { tracking: true, paused: props.isPaused, seconds: props.sessionSeconds, owner: true }
    : remoteLive
      ? { tracking: true, paused: remoteLive.isPaused, seconds: remoteSeconds, owner: false }
      : { tracking: false, paused: false, seconds: props.sessionSeconds, owner: false };
  const effRef = useRef(eff);
  effRef.current = eff;

  // Settings / bar position changed in another tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey) setSettings(loadSettings(storageKey));
      if (e.key === posKey) setBarPos(loadPos(posKey));
      if (e.key === reminderKey) setReminder(loadActiveReminder(reminderKey));
    };
    // When a sleeping / background tab becomes active again, pick up the current reminder.
    const resync = () => {
      if (document.visibilityState === 'visible') {
        setReminder(loadActiveReminder(reminderKey));
        setSettings(loadSettings(storageKey));
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', resync);
    document.addEventListener('visibilitychange', resync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', resync);
      document.removeEventListener('visibilitychange', resync);
    };
  }, [storageKey, posKey, reminderKey]);

  // Keep the bar inside the screen when the window is resized.
  useEffect(() => {
    const onResize = () => {
      const p = barPosRef.current;
      if (p) setBarPos(clampPos(p, barRef.current?.offsetWidth, barRef.current?.offsetHeight));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const trigger = (kind: AlertKind, loud: boolean) => {
    const s = settingsRef.current;
    const r = { kind, id: Date.now() };
    setReminder(r);
    try {
      localStorage.setItem(reminderKey, JSON.stringify(r));
    } catch {
      // ignore
    }
    if (!loud) return;
    post({ type: 'reminder', kind });
    const c = COPY[kind];
    if (s.playSound) speak(c.voice);
    if (s.desktopNotification) notify(c.title, c.text, kind);
  };
  const triggerRef = useRef(trigger);
  triggerRef.current = trigger;

  // Cross-tab channel (same timer, commands go to the tab that owns tracking).
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(`wm-schedule-alerts-${employeeId}`);
    channelRef.current = ch;

    ch.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (!m || m.sender === senderId.current) return;

      if (m.type === 'state') {
        if (m.isTracking) {
          setRemote({
            sender: m.sender,
            isTracking: true,
            isPaused: !!m.isPaused,
            seconds: Number(m.seconds) || 0,
            ts: Date.now(),
          });
        } else if (remoteRef.current?.sender === m.sender) {
          setRemote(null);
        }
      } else if (m.type === 'hello') {
        // A new tab just opened: the tab that owns the timer tells it the state.
        const l = latest.current;
        if (l.isTracking) {
          try {
            ch.postMessage({
              type: 'state',
              isTracking: true,
              isPaused: l.isPaused,
              seconds: l.sessionSeconds,
              sender: senderId.current,
            });
          } catch {
            // ignore
          }
        }
      } else if (m.type === 'reminder') {
        setReminder({ kind: m.kind, id: Date.now() });
      } else if (m.type === 'dismiss') {
        setReminder(null);
      } else if (m.type === 'cmd') {
        const l = latest.current;
        if (!l.isTracking) return;
        if (m.cmd === 'pause' && !l.isPaused) void l.onPause();
        if (m.cmd === 'resume' && l.isPaused) void l.onResume();
      }
    };

    // Ask the other tabs for the current timer state.
    try {
      ch.postMessage({ type: 'hello', sender: senderId.current });
    } catch {
      // ignore
    }

    // If the tab that owns the timer closes, other tabs must not show a stale timer.
    const onPageHide = () => {
      if (latest.current.isTracking) {
        try {
          ch.postMessage({ type: 'state', isTracking: false, sender: senderId.current });
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('pagehide', onPageHide);

    return () => {
      window.removeEventListener('pagehide', onPageHide);
      ch.close();
      channelRef.current = null;
    };
  }, [employeeId]);

  // The tab that owns the timer broadcasts its state.
  const wasTracking = useRef(false);
  useEffect(() => {
    if (props.isTracking) {
      post({
        type: 'state',
        isTracking: true,
        isPaused: props.isPaused,
        seconds: props.sessionSeconds,
      });
      wasTracking.current = true;
    } else if (wasTracking.current) {
      post({ type: 'state', isTracking: false });
      wasTracking.current = false;
    }
  }, [props.isTracking, props.isPaused, props.sessionSeconds, post]);

  // Scheduler: each reminder fires once per day (claimed in localStorage, so
  // several open tabs never fire it twice).
  useEffect(() => {
    try {
      const prefix = `wm_alert_fired_${employeeId}_`;
      const today = getTodayDateKey();
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith(prefix) && !k.startsWith(`${prefix}${today}_`)) {
          localStorage.removeItem(k);
        }
      });
    } catch {
      // ignore
    }

    const claim = (kind: string, time: string) => {
      const key = `wm_alert_fired_${employeeId}_${getTodayDateKey()}_${kind}_${time}`;
      try {
        if (localStorage.getItem(key)) return false;
        localStorage.setItem(key, '1');
        return true;
      } catch {
        return false;
      }
    };

    const check = () => {
      setTick((t) => t + 1);
      const s = settingsRef.current;
      if (!s.enabled) return;

      const now = new Date();
      const mins = now.getHours() * 60 + now.getMinutes();
      // Only within 5 minutes after the set time, so old times never fire.
      const due = (t: string, win = 5) => {
        const m = toMin(t);
        return m >= 0 && mins >= m && mins - m <= win;
      };
      const e = effRef.current;

      // The condition is checked BEFORE claiming, so a tab that sees a different
      // timer state can never "use up" a reminder without showing it.
      if (due(s.workStart) && !e.tracking && claim('work-start', s.workStart)) {
        triggerRef.current('work-start', true);
      }

      if (s.takeBreak) {
        if (due(s.breakStart, 1) && e.tracking && !e.paused && claim('break-start', s.breakStart)) {
          triggerRef.current('break-start', true);
        }
        if (due(s.breakEnd, 1) && !(e.tracking && !e.paused) && claim('break-end', s.breakEnd)) {
          triggerRef.current('break-end', true);
        }
      }

      const l = latest.current;
      if (
        s.workHours > 0 &&
        l.isTracking &&
        !l.isPaused &&
        l.dayTotalSeconds >= s.workHours * 3600 &&
        claim('work-done', String(s.workHours))
      ) {
        triggerRef.current('work-done', true);
      }
    };

    const id = window.setInterval(check, 1000);
    check();
    return () => window.clearInterval(id);
  }, [employeeId]);

  /* ---------- actions (always use the existing timer functions) ---------- */
  /* The timer only changes when the employee clicks a button. Switching tabs,
     dragging or hiding the bar never starts, pauses or stops it. */

  const dismiss = () => {
    setReminder(null);
    try {
      localStorage.removeItem(reminderKey);
    } catch {
      // ignore
    }
    post({ type: 'dismiss' });
  };

  const doStart = () => {
    if (!effRef.current.tracking) void latest.current.onStart();
    dismiss();
  };

  const doPause = () => {
    const e = effRef.current;
    if (e.tracking && !e.paused) {
      if (e.owner) void latest.current.onPause();
      else post({ type: 'cmd', cmd: 'pause' });
    }
    dismiss();
  };

  const doResume = () => {
    const e = effRef.current;
    if (e.tracking && e.paused) {
      if (e.owner) void latest.current.onResume();
      else post({ type: 'cmd', cmd: 'resume' });
    }
    dismiss();
  };

  const doStop = () => {
    if (effRef.current.owner) void latest.current.onStop();
    dismiss();
  };

  const sendTest = () => {
    requestPermission();
    triggerRef.current('test', true); // never touches timer or fired flags
  };

  /* ---------- drag the floating bar ---------- */

  const onBarPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Buttons keep working normally; only the empty area of the bar drags.
    if ((e.target as HTMLElement).closest('button')) return;
    const el = barRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const onBarPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = barRef.current;
    if (!d || !el) return;
    d.moved = true;
    setBarPos(
      clampPos({ x: e.clientX - d.dx, y: e.clientY - d.dy }, el.offsetWidth, el.offsetHeight)
    );
  };

  const onBarPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (d?.moved && barPosRef.current) {
      try {
        localStorage.setItem(posKey, JSON.stringify(barPosRef.current));
      } catch {
        // ignore
      }
    }
  };

  /* ---------- always-on-top pop-out window (shows over Chrome, VS Code, desktop) ---------- */

  const pipSupported = typeof window !== 'undefined' && 'documentPictureInPicture' in window;

  const openPip = async () => {
    const api = (window as unknown as { documentPictureInPicture?: { requestWindow: (o: object) => Promise<Window> } })
      .documentPictureInPicture;
    if (!api) return;
    if (pipRef.current) {
      pipRef.current.close();
      return;
    }
    try {
      const w = await api.requestWindow({ width: 340, height: 190 });
      // Copy the app styles so the bar looks the same inside the pop-out window.
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          const css = Array.from(sheet.cssRules)
            .map((r) => r.cssText)
            .join('\n');
          const st = w.document.createElement('style');
          st.textContent = css;
          w.document.head.appendChild(st);
        } catch {
          if (sheet.href) {
            const l = w.document.createElement('link');
            l.rel = 'stylesheet';
            l.href = sheet.href;
            w.document.head.appendChild(l);
          }
        }
      });
      w.document.documentElement.className = document.documentElement.className;
      w.document.body.style.margin = '0';
      w.document.body.style.background = '#0f172a';
      w.addEventListener('pagehide', () => setPip(null));
      setPip(w);
    } catch {
      // Not allowed (needs a click) or not supported.
    }
  };

  // Keep the pop-out clock ticking even when the main tab is in the background.
  useEffect(() => {
    if (!pip) return;
    const id = pip.setInterval(() => setTick((t) => t + 1), 1000);
    return () => pip.clearInterval(id);
  }, [pip]);

  // Close the pop-out when this screen is closed.
  useEffect(() => {
    return () => {
      pipRef.current?.close();
    };
  }, []);

  const kind = reminder?.kind;
  const actions = (
    <>
      {!eff.tracking && (kind === 'work-start' || kind === 'break-end') && (
        <button type="button" onClick={doStart} className={`${btn} bg-emerald-600 hover:bg-emerald-500`}>
          Start Timer
        </button>
      )}
      {eff.tracking && !eff.paused && kind === 'break-start' && (
        <button type="button" onClick={doPause} className={`${btn} bg-amber-500 hover:bg-amber-400`}>
          Pause Timer
        </button>
      )}
      {eff.tracking && eff.paused && kind === 'break-end' && (
        <button type="button" onClick={doResume} className={`${btn} bg-indigo-600 hover:bg-indigo-500`}>
          Resume Timer
        </button>
      )}
      {eff.owner && kind === 'work-done' && (
        <button type="button" onClick={doStop} className={`${btn} bg-rose-600 hover:bg-rose-500`}>
          Stop Timer
        </button>
      )}
      {reminder && (
        <button
          type="button"
          onClick={dismiss}
          className="cursor-pointer px-3 py-2 rounded-lg text-xs font-bold border border-slate-400 text-slate-700 dark:text-slate-200"
        >
          Dismiss
        </button>
      )}
    </>
  );

  const barVisible =
    !pip &&
    settings.floatingBar &&
    !settings.floatingHidden &&
    (settings.floatingOnEveryTab || showSettings || !!reminder);

  const statusText = reminder
    ? COPY[reminder.kind].text
    : eff.tracking
      ? eff.paused
        ? 'Timer paused'
        : 'Tracking is running'
      : 'Tracking is not running';

  const check = (label: string, key: keyof AlertSettings, onEnable?: () => void) => (
    <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer">
      <input
        type="checkbox"
        checked={Boolean(settings[key])}
        onChange={(e) => {
          update({ [key]: e.target.checked } as Partial<AlertSettings>);
          if (e.target.checked) onEnable?.();
        }}
      />
      {label}
    </label>
  );

  const toggle = (label: string, desc: string, key: 'popup' | 'floatingBar') => (
    <button
      type="button"
      onClick={() => update({ [key]: !settings[key] } as Partial<AlertSettings>)}
      className="cursor-pointer text-left rounded-xl border border-slate-200 dark:border-slate-700 p-3 flex items-center justify-between gap-3"
    >
      <div>
        <div className="text-xs font-bold">{label}</div>
        <div className="text-[11px] text-slate-500 mt-1">{desc}</div>
      </div>
      <span className={`text-xs font-bold ${settings[key] ? 'text-emerald-600' : 'text-slate-400'}`}>
        {settings[key] ? '✓ On' : 'Off'}
      </span>
    </button>
  );

  const barStyle: React.CSSProperties = barPos
    ? (() => {
        const p = clampPos(barPos);
        return { left: p.x, top: p.y };
      })()
    : { right: 16, bottom: 16 };

  return (
    <>
      {showSettings && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold flex items-center gap-2">
                <Bell className="w-4 h-4 text-indigo-600" />
                Schedule Alerts
              </h2>
              <div className="text-xs text-slate-500 mt-1">
                Start {settings.workStart} • Break {settings.breakStart}–{settings.breakEnd} •{' '}
                {settings.workHours}h work day
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) => update({ enabled: e.target.checked })}
                />
                Alerts on
              </label>
              <button
                type="button"
                onClick={() => update({ floatingHidden: !settings.floatingHidden })}
                className="cursor-pointer px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold"
              >
                {settings.floatingHidden ? 'Show' : 'Hide'}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <div className="text-xs font-bold">Get reminders on every window and tab</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {toggle('Popup notification', 'Popups appear over the app on every tab.', 'popup')}
              {toggle('Floating bar', 'The timer and reminders stay visible on screen. Drag it anywhere.', 'floatingBar')}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={sendTest}
                className="cursor-pointer px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold"
              >
                Send test reminder
              </button>
              <span className="text-[11px] text-slate-500">
                Shows a sample reminder. It never changes your timer.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <label className="block text-[11px] font-bold uppercase text-slate-500">
              Work start time
              <input
                type="time"
                value={settings.workStart}
                onChange={(e) => update({ workStart: e.target.value })}
                className={inputCls}
              />
              <span className="block mt-1 normal-case font-normal">Reminds you to start tracking.</span>
            </label>
            <label className="block text-[11px] font-bold uppercase text-slate-500">
              Break starts
              <input
                type="time"
                value={settings.breakStart}
                onChange={(e) => update({ breakStart: e.target.value })}
                className={inputCls}
              />
              <span className="block mt-1 normal-case font-normal">Reminds you to pause.</span>
            </label>
            <label className="block text-[11px] font-bold uppercase text-slate-500">
              Break ends
              <input
                type="time"
                value={settings.breakEnd}
                onChange={(e) => update({ breakEnd: e.target.value })}
                className={inputCls}
              />
              <span className="block mt-1 normal-case font-normal">Reminds you to resume.</span>
            </label>
            <label className="block text-[11px] font-bold uppercase text-slate-500">
              Work hours per day
              <input
                type="number"
                min={1}
                max={24}
                value={settings.workHours}
                onChange={(e) =>
                  update({ workHours: Math.min(24, Math.max(1, Number(e.target.value) || 1)) })
                }
                className={inputCls}
              />
              <span className="block mt-1 normal-case font-normal">Reminds you to stop the timer.</span>
            </label>
          </div>

          <div className="flex flex-wrap gap-5">
            {check('I take a break', 'takeBreak')}
            {check('Play sound', 'playSound')}
            {check('Floating bar on every tab', 'floatingOnEveryTab')}
            {check('Desktop notification', 'desktopNotification', requestPermission)}
          </div>

          <div className="text-[11px] text-slate-500">
            Times use this computer&apos;s clock. Each reminder appears only once at its set time.
          </div>
        </div>
      )}

      {/* POPUP */}
      {settings.popup && reminder && (
        <div className="fixed inset-0 z-[75] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 font-bold">
              <Bell className="w-4 h-4 text-indigo-600" />
              {COPY[reminder.kind].title}
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-300">
              {COPY[reminder.kind].text}
            </div>
            <div className="flex flex-wrap gap-2">{actions}</div>
          </div>
        </div>
      )}

      {/* FLOATING BAR (draggable) */}
      {barVisible && (
        <div
          ref={barRef}
          style={barStyle}
          onPointerDown={onBarPointerDown}
          onPointerMove={onBarPointerMove}
          onPointerUp={onBarPointerUp}
          onPointerCancel={onBarPointerUp}
          title="Drag to move"
          className="fixed z-[65] w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl bg-slate-900 text-white border border-indigo-500 shadow-2xl p-3 space-y-2 cursor-move select-none touch-none"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="font-mono text-lg font-black">{clock(eff.seconds)}</div>
            <div className="flex items-center gap-1">
              {pipSupported && (
                <button
                  type="button"
                  aria-label="Pop out on top of all apps"
                  title="Pop out: keep this bar on top of all apps (Chrome, VS Code, desktop)"
                  onClick={() => void openPip()}
                  className="cursor-pointer p-1 text-slate-300 hover:text-white"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                aria-label="Hide floating bar"
                title="Hide floating bar (reminders keep working)"
                onClick={() => update({ floatingHidden: true })}
                className="cursor-pointer p-1 text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="text-xs font-semibold text-slate-200">{statusText}</div>
          <div className="flex flex-wrap gap-2">
            {!eff.tracking && (
              <button type="button" onClick={doStart} className={`${btn} bg-emerald-600 hover:bg-emerald-500`}>
                Start Timer
              </button>
            )}
            {eff.tracking && !eff.paused && (
              <button type="button" onClick={doPause} className={`${btn} bg-amber-500 hover:bg-amber-400`}>
                Pause Timer
              </button>
            )}
            {eff.tracking && eff.paused && (
              <button type="button" onClick={doResume} className={`${btn} bg-indigo-600 hover:bg-indigo-500`}>
                Resume Timer
              </button>
            )}
            {reminder && (
              <button
                type="button"
                onClick={dismiss}
                className="cursor-pointer px-3 py-2 rounded-lg text-xs font-bold border border-slate-500 text-slate-200"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}

      {/* ALWAYS-ON-TOP POP-OUT WINDOW (same timer, same buttons) */}
      {pip &&
        createPortal(
          <div className="min-h-screen bg-slate-900 text-white p-3 space-y-2">
            <div className="font-mono text-lg font-black">{clock(eff.seconds)}</div>
            <div className="text-xs font-semibold text-slate-200">{statusText}</div>
            <div className="flex flex-wrap gap-2">
              {!eff.tracking && (
                <button type="button" onClick={doStart} className={`${btn} bg-emerald-600 hover:bg-emerald-500`}>
                  Start Timer
                </button>
              )}
              {eff.tracking && !eff.paused && (
                <button type="button" onClick={doPause} className={`${btn} bg-amber-500 hover:bg-amber-400`}>
                  Pause Timer
                </button>
              )}
              {eff.tracking && eff.paused && (
                <button type="button" onClick={doResume} className={`${btn} bg-indigo-600 hover:bg-indigo-500`}>
                  Resume Timer
                </button>
              )}
              {reminder && (
                <button
                  type="button"
                  onClick={dismiss}
                  className="cursor-pointer px-3 py-2 rounded-lg text-xs font-bold border border-slate-500 text-slate-200"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>,
          pip.document.body
        )}
    </>
  );
};