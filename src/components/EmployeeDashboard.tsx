// import React, { useEffect, useMemo, useRef, useState } from "react";
// import { createPortal } from "react-dom";
// import { AppUser, ScreenshotLog, StorageSettings } from "../types";
// import {
//   Play,
//   Pause,
//   Square,
//   Camera,
//   Calendar,
//   Clock,
//   Monitor,
//   RefreshCw,
//   X,
//   ChevronLeft,
//   ChevronRight,
//   Bell,
//   BellRing,
//   ExternalLink,
// } from "lucide-react";
// import {
//   canvasToBlob,
//   formatSecondsToHoursMinutes,
//   formatTimeString,
//   generateThumbnailDataUrl,
//   getHourSlotKey,
//   getTodayDateKey,
// } from "../lib/utils";
// import {
//   getLocalScreenshots,
//   startScreenshotUploadScheduler,
//   uploadScreenshotLocally,
// } from "../lib/localStorageService";
// import { setCachedScreenshot } from "../lib/screenshotCache";
// import { apiFetch } from "../lib/api";

// // ======================================================
// // BACKEND
// // ======================================================

// const getBackendUrl = (): string => {
//   const configured = import.meta.env.VITE_BACKEND_URL?.trim();
//   if (configured) {
//     return configured.replace(/\/$/, "");
//   }
//   return "https://codesdot-workmonitor.work-nest.workers.dev";
// };

// // Windows-wide input counter. It records event totals only (never key names,
// // typed text, window titles, or screenshots).
// type ScreenshotActivityCounts = {
//   mouseMoves: number;
//   mouseClicks: number;
//   keyPresses: number;
// };

// const GLOBAL_AGENT_URL = "http://127.0.0.1:3210";

// const callGlobalActivityAgent = async (
//   action: "start" | "pause" | "resume" | "stop" | "snapshot",
// ): Promise<Partial<ScreenshotActivityCounts> | null> => {
//   try {
//     const response = await fetch(`${GLOBAL_AGENT_URL}/${action}`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({}),
//       cache: "no-store",
//     });
//     if (!response.ok) return null;
//     const data = await response.json();
//     return action === "snapshot" ? (data?.counts || null) : data;
//   } catch {
//     // The app can still run when the optional Windows agent is unavailable.
//     return null;
//   }
// };

// const normalizeActivityCounts = (
//   counts: Partial<ScreenshotActivityCounts> | null | undefined,
// ): ScreenshotActivityCounts => ({
//   mouseMoves: Math.max(0, Math.floor(Number(counts?.mouseMoves) || 0)),
//   mouseClicks: Math.max(0, Math.floor(Number(counts?.mouseClicks) || 0)),
//   keyPresses: Math.max(0, Math.floor(Number(counts?.keyPresses) || 0)),
// });

// // ====================================================
// // SCREENSHOT CLOUD UPLOAD WINDOW
// // ====================================================

// const INDIA_TIME_ZONE = "Asia/Kolkata";
// const TRACKING_START_MINUTES = 8 * 60 + 30;
// const TRACKING_END_MINUTES = 20 * 60 + 30;

// // ====================================================
// // GALLERY PAGINATION
// // ====================================================

// const SCREENSHOTS_PER_PAGE = 12;

// const getIndiaMinutes = (date = new Date()) => {
//   const parts = new Intl.DateTimeFormat("en-IN", {
//     timeZone: INDIA_TIME_ZONE,
//     hour: "2-digit",
//     minute: "2-digit",
//     hourCycle: "h23",
//   }).formatToParts(date);
//   const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
//   const minute = Number(
//     parts.find((part) => part.type === "minute")?.value || 0,
//   );
//   return hour * 60 + minute;
// };

// const isScreenshotUploadWindowOpen = (date = new Date()) => {
//   const minutes = getIndiaMinutes(date);
//   return minutes >= TRACKING_START_MINUTES && minutes <= TRACKING_END_MINUTES;
// };

// // ======================================================
// // DATE HELPERS (local-time safe, "YYYY-MM-DD" keys)
// // ======================================================

// const parseDateKey = (key: string): Date => {
//   const [year, month, day] = key.split("-").map(Number);
//   return new Date(year, (month || 1) - 1, day || 1);
// };

// const toDateKey = (date: Date): string =>
//   `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
//     2,
//     "0",
//   )}-${String(date.getDate()).padStart(2, "0")}`;

// const addDays = (date: Date, days: number): Date => {
//   const next = new Date(date);
//   next.setDate(next.getDate() + days);
//   return next;
// };

// const formatClock = (seconds: number): string => {
//   const safe = Math.max(0, Math.floor(seconds));
//   const hours = Math.floor(safe / 3600);
//   const minutes = Math.floor((safe % 3600) / 60);
//   const secs = safe % 60;
//   return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(
//     2,
//     "0",
//   )}`;
// };

// // ======================================================
// // SCHEDULE ALERTS
// // ======================================================

// interface AlertSettings {
//   enabled: boolean;
//   startTime: string;
//   breakEnabled: boolean;
//   breakStart: string;
//   breakEnd: string;
//   dailyHours: number;
//   browserNotify: boolean;
//   sound: boolean;
//   floatOnStart: boolean;
// }

// type ScheduleAlertAction = "start" | "resume" | "pause" | "stop";

// interface ScheduleAlert {
//   id: "start" | "breakStart" | "complete" | "test";
//   title: string;
//   message: string;
//   action: ScheduleAlertAction;
// }

// const DEFAULT_ALERT_SETTINGS: AlertSettings = {
//   enabled: true,
//   startTime: "09:00",
//   breakEnabled: true,
//   breakStart: "13:00",
//   breakEnd: "14:00",
//   dailyHours: 8,
//   browserNotify: true,
//   sound: true,
//   floatOnStart: true,
// };

// const ALERT_SNOOZE_MINUTES = 10;
// const MAX_TIMER_CATCHUP_SECONDS = 300;
// const MAX_TIMER_GAP_SECONDS = 5;

// const toMinutes = (value: string): number => {
//   if (!value || !value.includes(":")) {
//     return Number.NaN;
//   }
//   const [hours, minutes] = value.split(":").map(Number);
//   if (Number.isNaN(hours) || Number.isNaN(minutes)) {
//     return Number.NaN;
//   }
//   return hours * 60 + minutes;
// };

// const formatHoursLabel = (hours: number): string =>
//   Number.isInteger(hours) ? `${hours}` : hours.toFixed(1);

// const playAlertSound = () => {
//   try {
//     const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
//     if (!AudioCtx) {
//       return;
//     }
//     const context = new AudioCtx();
//     const oscillator = context.createOscillator();
//     const gain = context.createGain();
//     oscillator.type = "sine";
//     oscillator.frequency.value = 880;
//     gain.gain.value = 0.15;
//     oscillator.connect(gain);
//     gain.connect(context.destination);
//     oscillator.start();
//     oscillator.stop(context.currentTime + 0.35);
//     setTimeout(() => {
//       void context.close().catch(() => {});
//     }, 600);
//   } catch {
//     // ignore
//   }
// };

// const ALERT_ACTION_LABEL: Record<ScheduleAlertAction, string> = {
//   start: "Start Tracking",
//   resume: "Resume",
//   pause: "Pause now",
//   stop: "Stop timer",
// };

// const ALERT_ACTION_SHORT_LABEL: Record<ScheduleAlertAction, string> = {
//   start: "Start",
//   resume: "Resume",
//   pause: "Pause",
//   stop: "Stop timer",
// };

// const getAlertActionLabel = (
//   alert: { id: string; action: ScheduleAlertAction },
//   short = false,
// ): string =>
//   alert.id === "test"
//     ? "Got it"
//     : (short ? ALERT_ACTION_SHORT_LABEL : ALERT_ACTION_LABEL)[alert.action];

// const getScreenshotIdentity = (screenshot: ScreenshotLog): string => {
//   const time = new Date(screenshot.timestamp);
//   const hasRealTime =
//     !Number.isNaN(time.getTime()) &&
//     !screenshot.timestamp.endsWith("T00:00:00");
//   if (hasRealTime) {
//     const pad = (value: number) => String(value).padStart(2, "0");
//     return `shot|${toDateKey(time)} ${pad(time.getHours())}:${pad(
//       time.getMinutes(),
//     )}:${pad(time.getSeconds())}`;
//   }
//   return (
//     screenshot.driveFileId || screenshot.driveThumbnailLink || screenshot.id
//   );
// };

// type HistoryViewMode = "day" | "week" | "month" | "all";

// const VIEW_MODES: { id: HistoryViewMode; label: string }[] = [
//   { id: "day", label: "Day" },
//   { id: "week", label: "Week" },
//   { id: "month", label: "Month" },
//   { id: "all", label: "All" },
// ];

// // ======================================================
// // SAFE JSON
// // ======================================================

// const readApiJson = async (response: Response) => {
//   const contentType = response.headers.get("content-type") || "";
//   const raw = await response.text();
//   if (!contentType.includes("application/json")) {
//     console.warn("Backend returned non-JSON:", raw.slice(0, 150));
//     throw new Error(
//       response.status === 429
//         ? "Backend is rate-limited (429). Please wait a moment and retry."
//         : `Backend returned non-JSON response (${response.status}).`,
//     );
//   }
//   try {
//     return raw ? JSON.parse(raw) : {};
//   } catch {
//     throw new Error("Backend returned invalid JSON.");
//   }
// };

// // ======================================================
// // TYPES
// // ======================================================

// interface ActivityHistoryRecord {
//   dateKey: string;
//   totalSeconds: number;
//   screenshotCount: number;
// }

// interface EmployeeDashboardProps {
//   currentUser: AppUser;
//   storageSettings: StorageSettings;
//   accessToken: string | null;
//   onConnectDrive: () => void;
//   onNewScreenshot: (log: ScreenshotLog) => void;
//   userScreenshots: ScreenshotLog[];
//   onLogout?: () => void;
// }

// // ======================================================
// // COMPONENT
// // ======================================================

// export const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({
//   currentUser,
//   storageSettings,
//   onNewScreenshot,
//   userScreenshots,
//   onLogout,
// }) => {
//   const backendUrl = useMemo(() => getBackendUrl(), []);
//   const backendHeaders = useMemo(() => ({}), []);

//   // ====================================================
//   // TRACKER
//   // ====================================================

//   const [taskName, setTaskName] = useState("Product Design & Implementation");
//   const [isTracking, setIsTracking] = useState(false);
//   const [isPaused, setIsPaused] = useState(false);
//   const [sessionSeconds, setSessionSeconds] = useState(0);
//   const [dayTotalSeconds, setDayTotalSeconds] = useState(0);
//   const [lastStatus, setLastStatus] = useState("Ready to start tracking");
//   const [nextCaptureInSec, setNextCaptureInSec] = useState<number | null>(null);
//   const [lastCapturedTime, setLastCapturedTime] = useState("");
//   const [needsScreenShare, setNeedsScreenShare] = useState(false);
//   // If a refresh interrupted an active session, resume only after the user
//   // explicitly reconnects screen sharing. Preserve an already-paused session.
//   const resumeAfterScreenShareRef = useRef(false);

//   // Two short warning beeps while tracking is active without screen sharing.
//   // The first double-beep starts after 60 seconds; it repeats every minute
//   // until screen sharing reconnects or tracking stops.
//   useEffect(() => {
//     if (!isTracking || !needsScreenShare) {
//       return;
//     }

//     let startTimeout: number | null = null;
//     let repeatInterval: number | null = null;
//     let audioContext: AudioContext | null = null;
//     let stopped = false;
//     let warningNotification: Notification | null = null;

//     const showScreenShareNotification = () => {
//       if (typeof Notification === "undefined" || Notification.permission !== "granted") {
//         return;
//       }
//       try {
//         warningNotification?.close();
//         warningNotification = new Notification("Screen sharing required", {
//           body: "Your WorkMonitor timer is running, but screenshots are paused. Return to WorkMonitor and reconnect screen sharing.",
//           tag: "workmonitor-screen-share-required",
//           requireInteraction: true,
//         });
//         warningNotification.onclick = () => {
//           try {
//             window.focus();
//             warningNotification?.close();
//           } catch {
//             // Ignore notification focus errors.
//           }
//         };
//       } catch (error) {
//         console.warn("Screen-share warning notification could not be shown:", error);
//       }
//     };

//     const playDoubleBeep = async () => {
//       if (stopped) return;

//       // A system notification is the background-tab fallback. Its sound depends
//       // on browser/OS notification settings; Web Audio is attempted as well.
//       showScreenShareNotification();

//       try {
//         const AudioContextConstructor =
//           window.AudioContext || (window as any).webkitAudioContext;
//         if (!AudioContextConstructor) return;

//         audioContext = new AudioContextConstructor();
//         if (audioContext.state === "suspended") {
//           await audioContext.resume();
//         }
//         if (stopped || !audioContext) {
//           await audioContext?.close().catch(() => {});
//           audioContext = null;
//           return;
//         }

//         const context = audioContext;
//         const startAt = context.currentTime + 0.02;
//         // Two brief, clear beeps: "tit-tit", not a continuous siren.
//         [0, 0.24].forEach((offset) => {
//           const oscillator = context.createOscillator();
//           const gain = context.createGain();
//           const beepStart = startAt + offset;
//           oscillator.type = "square";
//           oscillator.frequency.setValueAtTime(880, beepStart);
//           gain.gain.setValueAtTime(0.0001, beepStart);
//           gain.gain.exponentialRampToValueAtTime(0.16, beepStart + 0.015);
//           gain.gain.setValueAtTime(0.16, beepStart + 0.13);
//           gain.gain.exponentialRampToValueAtTime(0.0001, beepStart + 0.17);
//           oscillator.connect(gain);
//           gain.connect(context.destination);
//           oscillator.start(beepStart);
//           oscillator.stop(beepStart + 0.18);
//           oscillator.onended = () => {
//             oscillator.disconnect();
//             gain.disconnect();
//           };
//         });

//         window.setTimeout(() => {
//           if (audioContext === context) {
//             void context.close().catch(() => {});
//             audioContext = null;
//           }
//         }, 800);
//       } catch (error) {
//         console.warn("Screen-share warning beep could not play:", error);
//         if (audioContext) {
//           void audioContext.close().catch(() => {});
//           audioContext = null;
//         }
//       }
//     };

//     startTimeout = window.setTimeout(() => {
//       void playDoubleBeep();
//       repeatInterval = window.setInterval(() => {
//         void playDoubleBeep();
//       }, 60000);
//     }, 60000);

//     return () => {
//       stopped = true;
//       if (startTimeout !== null) window.clearTimeout(startTimeout);
//       if (repeatInterval !== null) window.clearInterval(repeatInterval);
//       warningNotification?.close();
//       warningNotification = null;
//       if (audioContext) {
//         void audioContext.close().catch(() => {});
//         audioContext = null;
//       }
//     };
//   }, [isTracking, needsScreenShare]);

//   // ====================================================
//   // GLOBAL ADMIN POLICY
//   // ====================================================

//   const [captureWindowSeconds, setCaptureWindowSeconds] = useState(
//     Math.max(5, Number(storageSettings.captureIntervalSeconds || 600)),
//   );
//   const [screenshotsPerWindow, setScreenshotsPerWindow] = useState(5);
//   const [capturePresetId, setCapturePresetId] = useState("10m-5");
//   const [centralPolicyUpdatedAt, setCentralPolicyUpdatedAt] = useState("");

//   // ====================================================
//   // HISTORY
//   // ====================================================

//   const [selectedDate, setSelectedDate] = useState(getTodayDateKey());
//   const [historyView, setHistoryView] = useState<HistoryViewMode>("day");
//   const [activityHistory, setActivityHistory] = useState<
//     ActivityHistoryRecord[]
//   >([]);
//   const [selectedDateSeconds, setSelectedDateSeconds] = useState(0);
//   const [dateStats, setDateStats] = useState<
//     Record<string, { screenshotCount: number }>
//   >({});
//   const statsFetchedAtRef = useRef<Record<string, number>>({});
//   const [restoredScreenshots, setRestoredScreenshots] = useState<
//     ScreenshotLog[]
//   >([]);
//   const [loadingHistory, setLoadingHistory] = useState(false);
//   const [previewModal, setPreviewModal] = useState<ScreenshotLog | null>(null);

//   // ====================================================
//   // GALLERY PAGE
//   // ====================================================

//   const [currentPage, setCurrentPage] = useState(1);
//   const [employeeScreenshotUrls, setEmployeeScreenshotUrls] = useState<
//     Record<string, string>
//   >({});

//   // ====================================================
//   // SCREEN CAPTURE
//   // ====================================================

//   const screenVideoRef = useRef<HTMLVideoElement | null>(null);
//   const screenStreamRef = useRef<MediaStream | null>(null);
//   const captureTimerRef = useRef<number | null>(null);
//   const captureInProgressRef = useRef(false);
//   const captureScheduleIdRef = useRef(0);
//   const countdownRef = useRef<number | null>(null);
//   const trackerTimerRef = useRef<number | null>(null);
//   const trackerSyncIntervalRef = useRef<number | null>(null);
//   const trackingRef = useRef(false);
//   const pausedRef = useRef(false);
//   const daySecondsRef = useRef(0);
//   const sessionSecondsRef = useRef(0);
//   const restoredSessionRef = useRef(false);
//   const captureWindowRef = useRef(captureWindowSeconds);
//   const capturePolicyRefreshAtRef = useRef(0);
//   const screenshotCountRef = useRef(screenshotsPerWindow);
//   // Tracks whether the app itself paused the timer when the page became hidden.
//   const autoPausedForHiddenPageRef = useRef(false);

//   // ====================================================
//   // AUTO-PAUSE WHEN THE BROWSER PAGE BECOMES HIDDEN
//   // ====================================================

//   useEffect(() => {
//     const handlePageVisibility = () => {
//       if (document.visibilityState !== "visible") {
//         // Do not override an existing manual pause or pause an inactive timer.
//         if (isTracking && !isPaused) {
//           autoPausedForHiddenPageRef.current = true;
//           setIsPaused(true);
//           setLastStatus(
//             "Tracking paused because the browser page became hidden. It will resume when the page is visible again.",
//           );
//         }
//         return;
//       }

//       // Resume only if this visibility handler caused the pause.
//       if (autoPausedForHiddenPageRef.current) {
//         autoPausedForHiddenPageRef.current = false;
//         if (isTracking) {
//           setIsPaused(false);
//           setLastStatus("Tracking resumed because the browser page is visible again.");
//         }
//       }
//     };

//     document.addEventListener("visibilitychange", handlePageVisibility);
//     window.addEventListener("pageshow", handlePageVisibility);
//     return () => {
//       document.removeEventListener("visibilitychange", handlePageVisibility);
//       window.removeEventListener("pageshow", handlePageVisibility);
//     };
//   }, [isTracking, isPaused]);

//   // ====================================================
//   // KEEP REFS CURRENT
//   // ====================================================

//   useEffect(() => {
//     trackingRef.current = isTracking;
//   }, [isTracking]);

//   useEffect(() => {
//     pausedRef.current = isPaused;
//   }, [isPaused]);

//   useEffect(() => {
//     daySecondsRef.current = dayTotalSeconds;
//   }, [dayTotalSeconds]);

//   useEffect(() => {
//     sessionSecondsRef.current = sessionSeconds;
//   }, [sessionSeconds]);

//   useEffect(() => {
//     captureWindowRef.current = captureWindowSeconds;
//   }, [captureWindowSeconds]);

//   useEffect(() => {
//     screenshotCountRef.current = screenshotsPerWindow;
//   }, [screenshotsPerWindow]);

//   // ====================================================
//   // LOGIN BOOTSTRAP POLICY
//   // ====================================================

//   useEffect(() => {
//     try {
//       const raw = localStorage.getItem("workmonitor_employee_capture_settings");
//       if (!raw) {
//         return;
//       }
//       const settings = JSON.parse(raw);
//       const newWindow = Math.max(
//         5,
//         Number(
//           settings?.captureWindowSeconds ||
//             settings?.captureIntervalSeconds ||
//             600,
//         ),
//       );
//       const newCount = Math.max(1, Number(settings?.screenshotsPerWindow || 5));
//       const newPreset = String(settings?.presetId || "10m-5");
//       setCaptureWindowSeconds(newWindow);
//       setScreenshotsPerWindow(newCount);
//       setCapturePresetId(newPreset);
//       setCentralPolicyUpdatedAt(String(settings?.updatedAt || ""));
//       captureWindowRef.current = newWindow;
//       screenshotCountRef.current = newCount;
//     } catch (error) {
//       console.warn("Capture policy bootstrap warning:", error);
//     }
//   }, []);

//   // ====================================================
//   // SCHEDULE ALERTS (state + engine)
//   // ====================================================

//   const alertSettingsKey = `wm_emp_alert_settings_${currentUser.id}`;

//   const [alertSettings, setAlertSettings] = useState<AlertSettings>(() => {
//     try {
//       const raw = localStorage.getItem(
//         `wm_emp_alert_settings_${currentUser.id}`,
//       );
//       if (raw) {
//         return {
//           ...DEFAULT_ALERT_SETTINGS,
//           ...JSON.parse(raw),
//         };
//       }
//     } catch {
//       // ignore
//     }
//     return DEFAULT_ALERT_SETTINGS;
//   });

//   const [showAlertSettings, setShowAlertSettings] = useState(false);
//   const [scheduleAlerts, setScheduleAlerts] = useState<ScheduleAlert[]>([]);
//   const [notificationPermission, setNotificationPermission] = useState<string>(
//     typeof Notification !== "undefined"
//       ? Notification.permission
//       : "unsupported",
//   );

//   const pipSupported =
//     typeof window !== "undefined" && "documentPictureInPicture" in window;

//   const [pipWindow, setPipWindow] = useState<Window | null>(null);
//   const [pipError, setPipError] = useState("");
//   const pipWindowRef = useRef<Window | null>(null);
//   const pipOpeningRef = useRef(false);
//   const floatDismissedRef = useRef(false);

//   const openFloatingTimer = async () => {
//     if (!pipSupported || pipWindowRef.current || pipOpeningRef.current) {
//       return;
//     }
//     pipOpeningRef.current = true;
//     try {
//       // ✅ ફ્લોટિંગ બારની ઉંચાઈ (Height) ઘટાડીને 80 કરવામાં આવી છે
//       const floatingWindow: Window = await (
//         window as any
//       ).documentPictureInPicture.requestWindow({
//         width: 380,
//         height: 80,
//       });
//       floatingWindow.document.title = "WorkMonitor Timer";
//       floatingWindow.document.documentElement.style.background = "#0b1020";
//       floatingWindow.document.body.style.margin = "0";
//       floatingWindow.document.body.style.background = "#0b1020";
//       floatingWindow.addEventListener("pagehide", () => {
//         floatDismissedRef.current = true;
//         pipWindowRef.current = null;
//         setPipWindow(null);
//       });
//       floatDismissedRef.current = false;
//       pipWindowRef.current = floatingWindow;
//       setPipError("");
//       setPipWindow(floatingWindow);
//     } catch (error) {
//       console.warn("Floating timer could not open:", error);
//       setPipError(error instanceof Error ? error.message : String(error));
//     } finally {
//       pipOpeningRef.current = false;
//     }
//   };

//   const closeFloatingTimer = () => {
//     floatDismissedRef.current = true;
//     try {
//       pipWindowRef.current?.close();
//     } catch {
//       // ignore
//     }
//     pipWindowRef.current = null;
//     setPipWindow(null);
//   };

//   useEffect(() => {
//     return () => {
//       try {
//         pipWindowRef.current?.close();
//       } catch {
//         // ignore
//       }
//     };
//   }, []);

//   useEffect(() => {
//     if (!pipSupported || pipWindow || !alertSettings.floatOnStart) {
//       return;
//     }
//     const handleClick = () => {
//       if (!floatDismissedRef.current) {
//         void openFloatingTimer();
//       }
//     };
//     document.addEventListener("click", handleClick);
//     return () => {
//       document.removeEventListener("click", handleClick);
//     };
//   }, [pipSupported, pipWindow, alertSettings.floatOnStart]);

//   useEffect(() => {
//     if (
//       !pipSupported ||
//       !isTracking ||
//       !alertSettings.floatOnStart ||
//       typeof navigator === "undefined" ||
//       !("mediaSession" in navigator)
//     ) {
//       return;
//     }
//     try {
//       (navigator.mediaSession as any).setActionHandler(
//         "enterpictureinpicture",
//         () => {
//           if (!floatDismissedRef.current) {
//             void openFloatingTimer();
//           }
//         },
//       );
//     } catch {
//       // ignore
//     }
//     return () => {
//       try {
//         (navigator.mediaSession as any).setActionHandler(
//           "enterpictureinpicture",
//           null,
//         );
//       } catch {
//         // ignore
//       }
//     };
//   }, [pipSupported, isTracking, alertSettings.floatOnStart]);

//   const alertSettingsRef = useRef<AlertSettings>(alertSettings);
//   const openNotificationsRef = useRef<Record<string, Notification>>({});
//   const scheduleAlertsRef = useRef<ScheduleAlert[]>([]);
//   const alertSnoozeRef = useRef<Record<string, number>>({});
//   const scheduleAlertChannelRef = useRef<BroadcastChannel | null>(null);
//   const scheduleAlertClientIdRef = useRef(
//     `${currentUser.id}-${Math.random().toString(36).slice(2)}`,
//   );
//   const scheduleAlertStorageKey = `wm_emp_schedule_alerts_${currentUser.id}`;

//   const publishScheduleAlertState = (
//     alerts: ScheduleAlert[],
//     snoozes: Record<string, number> = alertSnoozeRef.current,
//   ) => {
//     const payload = {
//       alerts,
//       snoozes,
//       updatedAt: Date.now(),
//       sourceId: scheduleAlertClientIdRef.current,
//     };
//     try {
//       localStorage.setItem(scheduleAlertStorageKey, JSON.stringify(payload));
//     } catch {
//       // ignore
//     }
//     try {
//       scheduleAlertChannelRef.current?.postMessage(payload);
//     } catch {
//       // ignore
//     }
//   };

//   const applyScheduleAlertState = (
//     alerts: ScheduleAlert[],
//     snoozes: Record<string, number> = {},
//     showBrowserNotification = false,
//   ) => {
//     const now = Date.now();
//     alertSnoozeRef.current = {
//       ...snoozes,
//     };
//     const visibleAlerts = alerts.filter(
//       (alert) => now >= Number(alertSnoozeRef.current[alert.id] || 0),
//     );
//     const previousIds = new Set(
//       scheduleAlertsRef.current.map((alert) => alert.id),
//     );
//     scheduleAlertsRef.current = visibleAlerts;
//     setScheduleAlerts(visibleAlerts);

//     if (showBrowserNotification) {
//       const config = alertSettingsRef.current;
//       visibleAlerts
//         .filter((alert) => !previousIds.has(alert.id))
//         .forEach((alert) => {
//           showSystemNotification(alert);
//           if (config.sound) {
//             playAlertSound();
//           }
//         });
//     }
//   };

//   const dayBaseRef = useRef(0);
//   const sessionBaseRef = useRef(0);
//   const segmentStartRef = useRef<number | null>(null);
//   const lastTickMsRef = useRef(Date.now());
//   const originalTitleRef = useRef("Employee Time Tracker");

//   useEffect(() => {
//     alertSettingsRef.current = alertSettings;
//     try {
//       localStorage.setItem(alertSettingsKey, JSON.stringify(alertSettings));
//     } catch {
//       // ignore
//     }
//   }, [alertSettings, alertSettingsKey]);

//   const updateAlertSetting = <K extends keyof AlertSettings>(
//     key: K,
//     value: AlertSettings[K],
//   ) => {
//     alertSnoozeRef.current = {};
//     setAlertSettings((previous) => ({
//       ...previous,
//       [key]: value,
//     }));
//   };

//   const requestNotificationPermission = async () => {
//     if (typeof Notification === "undefined") {
//       return;
//     }
//     try {
//       const result = await Notification.requestPermission();
//       setNotificationPermission(result);
//     } catch {
//       // ignore
//     }
//   };

//   // ✅ આ ફંક્શન બ્રાઉઝરની સિસ્ટમ પોપઅપ (Notification) બતાવે છે જે દરેક વિન્ડો ઉપર આવે છે
//   const showSystemNotification = (alert: {
//     id: string;
//     title: string;
//     message: string;
//     action: ScheduleAlertAction;
//   }) => {
//     const config = alertSettingsRef.current;
//     if (
//       !config.browserNotify ||
//       typeof Notification === "undefined" ||
//       Notification.permission !== "granted"
//     ) {
//       return;
//     }
//     const tag = `wm-alert-${alert.id}`;
//     try {
//       const notification = new Notification(alert.title, {
//         body: `${alert.message} Click to open WorkMonitor.`,
//         tag,
//         requireInteraction: true,
//       });
//       notification.onclick = () => {
//         try {
//           window.focus();
//           notification.close();
//         } catch {
//           // ignore
//         }
//       };
//       openNotificationsRef.current[tag] = notification;
//     } catch {
//       // ignore
//     }
//   };

//   useEffect(() => {
//     (["start", "breakStart", "complete", "test"] as const).forEach((id) => {
//       const tag = `wm-alert-${id}`;
//       if (
//         !scheduleAlerts.some((alert) => alert.id === id) &&
//         openNotificationsRef.current[tag]
//       ) {
//         try {
//           openNotificationsRef.current[tag].close();
//         } catch {
//           // ignore
//         }
//         delete openNotificationsRef.current[tag];
//       }
//     });
//   }, [scheduleAlerts]);

//   useEffect(() => {
//     if (
//       !alertSettings.browserNotify ||
//       notificationPermission !== "default" ||
//       typeof Notification === "undefined"
//     ) {
//       return;
//     }
//     let timer: number | undefined;
//     const handleClick = () => {
//       timer = window.setTimeout(() => {
//         void requestNotificationPermission();
//       }, 800);
//     };
//     document.addEventListener("click", handleClick, { once: true });
//     return () => {
//       document.removeEventListener("click", handleClick);
//       if (timer !== undefined) {
//         window.clearTimeout(timer);
//       }
//     };
//   }, [alertSettings.browserNotify, notificationPermission]);

//   useEffect(() => {
//     if (scheduleAlerts.length > 0 && pipWindowRef.current) {
//       try {
//         pipWindowRef.current.focus();
//       } catch {
//         // ignore
//       }
//     }
//   }, [scheduleAlerts.length]);

//   const sendTestReminder = async () => {
//     if (
//       typeof Notification !== "undefined" &&
//       Notification.permission === "default"
//     ) {
//       await requestNotificationPermission();
//     }
//     const testAlert: ScheduleAlert = {
//       id: "test",
//       title: "Test reminder",
//       message: "This is how reminders look. It shows on every window.",
//       action: "start",
//     };
//     const next = [
//       ...scheduleAlertsRef.current.filter((alert) => alert.id !== "test"),
//       testAlert,
//     ];
//     scheduleAlertsRef.current = next;
//     setScheduleAlerts(next);
//     publishScheduleAlertState(next, alertSnoozeRef.current);
//     showSystemNotification(testAlert);
//     if (alertSettingsRef.current.sound) {
//       playAlertSound();
//     }
//     window.setTimeout(() => {
//       if (scheduleAlertsRef.current.some((alert) => alert.id === "test")) {
//         removeScheduleAlert("test");
//         publishScheduleAlertState(
//           scheduleAlertsRef.current,
//           alertSnoozeRef.current,
//         );
//       }
//     }, 20000);
//   };

//   const removeScheduleAlert = (id: ScheduleAlert["id"]) => {
//     const next = scheduleAlertsRef.current.filter((alert) => alert.id !== id);
//     scheduleAlertsRef.current = next;
//     setScheduleAlerts(next);
//   };

//   const snoozeScheduleAlert = (id: ScheduleAlert["id"]) => {
//     alertSnoozeRef.current[id] = Date.now() + ALERT_SNOOZE_MINUTES * 60 * 1000;
//     removeScheduleAlert(id);
//     publishScheduleAlertState(
//       scheduleAlertsRef.current,
//       alertSnoozeRef.current,
//     );
//   };

//   useEffect(() => {
//     const storageKey = scheduleAlertStorageKey;
//     let channel: BroadcastChannel | null = null;

//     const loadStoredState = () => {
//       try {
//         const raw = localStorage.getItem(storageKey);
//         if (!raw) {
//           return;
//         }
//         const saved = JSON.parse(raw);
//         if (Array.isArray(saved?.alerts)) {
//           applyScheduleAlertState(
//             saved.alerts as ScheduleAlert[],
//             saved?.snoozes && typeof saved.snoozes === "object"
//               ? saved.snoozes
//               : {},
//             true,
//           );
//         }
//       } catch {
//         // ignore
//       }
//     };

//     const handleStorage = (event: StorageEvent) => {
//       if (event.key !== storageKey || !event.newValue) {
//         return;
//       }
//       try {
//         const saved = JSON.parse(event.newValue);
//         if (saved?.sourceId === scheduleAlertClientIdRef.current) {
//           return;
//         }
//         if (Array.isArray(saved?.alerts)) {
//           applyScheduleAlertState(
//             saved.alerts as ScheduleAlert[],
//             saved?.snoozes && typeof saved.snoozes === "object"
//               ? saved.snoozes
//               : {},
//             true,
//           );
//         }
//       } catch {
//         // ignore
//       }
//     };

//     try {
//       if ("BroadcastChannel" in window) {
//         channel = new BroadcastChannel(
//           `workmonitor-schedule-alerts-${currentUser.id}`,
//         );
//         scheduleAlertChannelRef.current = channel;
//         channel.onmessage = (event) => {
//           const data = event.data;
//           if (!data || data.sourceId === scheduleAlertClientIdRef.current) {
//             return;
//           }
//           if (data.type === "request-state") {
//             publishScheduleAlertState(
//               scheduleAlertsRef.current,
//               alertSnoozeRef.current,
//             );
//             return;
//           }
//           if (Array.isArray(data.alerts)) {
//             applyScheduleAlertState(
//               data.alerts as ScheduleAlert[],
//               data.snoozes && typeof data.snoozes === "object"
//                 ? data.snoozes
//                 : {},
//               true,
//             );
//           }
//         };
//       }
//     } catch {
//       scheduleAlertChannelRef.current = null;
//     }

//     window.addEventListener("storage", handleStorage);
//     loadStoredState();

//     try {
//       channel?.postMessage({
//         type: "request-state",
//         sourceId: scheduleAlertClientIdRef.current,
//       });
//     } catch {
//       // ignore
//     }

//     return () => {
//       window.removeEventListener("storage", handleStorage);
//       if (channel) {
//         channel.close();
//       }
//       if (scheduleAlertChannelRef.current === channel) {
//         scheduleAlertChannelRef.current = null;
//       }
//     };
//   }, [currentUser.id]);

//   useEffect(() => {
//     const syncSharedScheduleAlerts = () => {
//       try {
//         const raw = localStorage.getItem(scheduleAlertStorageKey);
//         if (!raw) {
//           return;
//         }
//         const saved = JSON.parse(raw);
//         if (Array.isArray(saved?.alerts)) {
//           applyScheduleAlertState(
//             saved.alerts as ScheduleAlert[],
//             saved?.snoozes && typeof saved.snoozes === "object"
//               ? saved.snoozes
//               : {},
//             true,
//           );
//         }
//       } catch {
//         // ignore
//       }
//     };
//     syncSharedScheduleAlerts();
//     const intervalId = window.setInterval(syncSharedScheduleAlerts, 1000);
//     return () => {
//       window.clearInterval(intervalId);
//     };
//   }, [scheduleAlertStorageKey]);

//   useEffect(() => {
//     const evaluateAlerts = () => {
//       const config = alertSettingsRef.current;
//       if (!config.enabled) {
//         if (scheduleAlertsRef.current.length > 0) {
//           scheduleAlertsRef.current = [];
//           setScheduleAlerts([]);
//           publishScheduleAlertState([], alertSnoozeRef.current);
//         }
//         return;
//       }

//       const now = new Date();
//       const nowMinutes = now.getHours() * 60 + now.getMinutes();
//       const startMinutes = toMinutes(config.startTime);
//       const breakStartMinutes = toMinutes(config.breakStart);
//       const breakEndMinutes = toMinutes(config.breakEnd);
//       const hasBreak =
//         config.breakEnabled &&
//         !Number.isNaN(breakStartMinutes) &&
//         !Number.isNaN(breakEndMinutes) &&
//         breakEndMinutes > breakStartMinutes;
//       const breakLength = hasBreak ? breakEndMinutes - breakStartMinutes : 0;
//       const dailyHours = Math.max(0.5, Number(config.dailyHours) || 8);
//       const goalSeconds = dailyHours * 3600;
//       const tracking = trackingRef.current;
//       const paused = pausedRef.current;
//       const goalReached = daySecondsRef.current >= goalSeconds;
//       const inBreak =
//         hasBreak &&
//         nowMinutes >= breakStartMinutes &&
//         nowMinutes < breakEndMinutes;
//       const workEndMinutes = Number.isNaN(startMinutes)
//         ? 24 * 60
//         : startMinutes + dailyHours * 60 + breakLength + 60;

//       const wanted: ScheduleAlert[] = [];

//       if (goalReached && tracking) {
//         wanted.push({
//           id: "complete",
//           title: "Daily work hours complete",
//           message: `You have tracked ${formatHoursLabel(
//             dailyHours,
//           )} hours today. Please stop the timer.`,
//           action: "stop",
//         });
//       } else if (inBreak && tracking && !paused) {
//         wanted.push({
//           id: "breakStart",
//           title: "Break time",
//           message: "It is break time. Pause tracking while you are away.",
//           action: "pause",
//         });
//       } else if (
//         !inBreak &&
//         !Number.isNaN(startMinutes) &&
//         nowMinutes >= startMinutes &&
//         nowMinutes < workEndMinutes &&
//         !goalReached &&
//         (!tracking || paused)
//       ) {
//         const afterBreak =
//           hasBreak &&
//           nowMinutes >= breakEndMinutes &&
//           nowMinutes < breakEndMinutes + 30;
//         wanted.push({
//           id: "start",
//           title: afterBreak
//             ? "Break is over"
//             : paused
//               ? "Tracking is paused"
//               : "Tracking is not running",
//           message: afterBreak
//             ? paused
//               ? "Welcome back! Resume tracking to continue your work."
//               : "Welcome back! Start tracking to continue your work."
//             : paused
//               ? "Resume tracking to keep logging your time."
//               : "Your work time has started. Start tracking to log your hours.",
//           action: paused ? "resume" : "start",
//         });
//       }

//       const current = scheduleAlertsRef.current;
//       if (!tracking && current.length > 0) {
//         return;
//       }

//       const kept = current
//         .filter(
//           (alert) =>
//             alert.id === "test" || wanted.some((item) => item.id === alert.id),
//         )
//         .map((alert) =>
//           alert.id === "test"
//             ? alert
//             : (wanted.find((item) => item.id === alert.id) as ScheduleAlert),
//         );

//       const additions = wanted.filter(
//         (item) =>
//           !kept.some((alert) => alert.id === item.id) &&
//           Date.now() >= (alertSnoozeRef.current[item.id] || 0),
//       );

//       const next = [...kept, ...additions];

//       if (JSON.stringify(next) === JSON.stringify(current)) {
//         return;
//       }

//       scheduleAlertsRef.current = next;
//       setScheduleAlerts(next);
//       publishScheduleAlertState(next, alertSnoozeRef.current);

//       additions.forEach((item) => {
//         showSystemNotification(item);
//         if (config.sound) {
//           playAlertSound();
//         }
//       });
//     };

//     evaluateAlerts();
//     const intervalId = window.setInterval(evaluateAlerts, 5000);
//     return () => {
//       window.clearInterval(intervalId);
//     };
//   }, [alertSettings, isTracking, isPaused]);

//   // ====================================================
//   // LOCAL TIMER STORAGE
//   // ====================================================

//   const timerStorageKey =
//     `wm_emp_timer_` + `${currentUser.id}_` + `${getTodayDateKey()}`;

//   const readSavedTimer = (key: string) => {
//     try {
//       const raw = localStorage.getItem(key);
//       return raw ? JSON.parse(raw) : null;
//     } catch {
//       return null;
//     }
//   };

//   const [initialSavedTimer] = useState<{ key: string; data: any }>(() => ({
//     key: timerStorageKey,
//     data: readSavedTimer(timerStorageKey),
//   }));

//   const skipFirstTimerSaveRef = useRef(true);

//   useEffect(() => {
//     try {
//       const saved =
//         initialSavedTimer.key === timerStorageKey
//           ? initialSavedTimer.data
//           : readSavedTimer(timerStorageKey);

//       if (!saved) {
//         return;
//       }

//       const savedDay = Math.max(
//         0,
//         Math.floor(Number(saved?.dayTotalSeconds) || 0),
//       );
//       const savedSession = Math.max(
//         0,
//         Math.floor(Number(saved?.sessionSeconds) || 0),
//       );
//       const wasTracking = Boolean(saved?.isTracking);
//       const wasPaused = Boolean(saved?.isPaused);

//       if (saved?.taskName) {
//         setTaskName(saved.taskName);
//       }

//       // A page refresh must pause the timer immediately. Do not count the time
//       // spent refreshing or choosing a screen; resume only after screen share
//       // reconnects successfully.
//       if (wasTracking) {
//         daySecondsRef.current = savedDay;
//         sessionSecondsRef.current = savedSession;
//         trackingRef.current = true;
//         pausedRef.current = true;
//         resumeAfterScreenShareRef.current = !wasPaused;
//         setDayTotalSeconds(savedDay);
//         setSessionSeconds(savedSession);
//         setIsTracking(true);
//         setIsPaused(true);
//         setNeedsScreenShare(true);
//         setLastStatus(
//           wasPaused
//             ? "Page refreshed. Tracking remains paused. Reconnect screen sharing when ready."
//             : "Page refreshed. Timer paused. Reconnect screen sharing to resume tracking and screenshots.",
//         );
//         return;
//       }

//       setDayTotalSeconds(savedDay);
//       daySecondsRef.current = savedDay;

//       if (typeof saved?.sessionSeconds === "number") {
//         setSessionSeconds(savedSession);
//         if (wasTracking && savedSession > 0) {
//           restoredSessionRef.current = true;
//           setLastStatus(
//             "Previous tracking time restored. Click Start Tracking to continue.",
//           );
//         }
//       }
//     } catch (error) {
//       console.warn("Timer restore warning:", error);
//     }
//   }, [timerStorageKey]);

//   useEffect(() => {
//     if (skipFirstTimerSaveRef.current) {
//       skipFirstTimerSaveRef.current = false;
//       return;
//     }
//     try {
//       localStorage.setItem(
//         timerStorageKey,
//         JSON.stringify({
//           dayTotalSeconds,
//           sessionSeconds,
//           taskName,
//           isTracking,
//           isPaused,
//           updatedAt: Date.now(),
//         }),
//       );
//     } catch {
//       // ignore
//     }
//   }, [
//     timerStorageKey,
//     dayTotalSeconds,
//     sessionSeconds,
//     taskName,
//     isTracking,
//     isPaused,
//   ]);

//   useEffect(() => {
//     const persistNow = () => {
//       try {
//         if (!trackingRef.current) {
//           return;
//         }
//         const saved = readSavedTimer(timerStorageKey);
//         if (!saved?.isTracking) {
//           return;
//         }
//         localStorage.setItem(
//           timerStorageKey,
//           JSON.stringify({
//             ...saved,
//             dayTotalSeconds: Math.max(
//               Number(saved.dayTotalSeconds) || 0,
//               daySecondsRef.current,
//             ),
//             sessionSeconds: Math.max(
//               Number(saved.sessionSeconds) || 0,
//               sessionSecondsRef.current,
//             ),
//             updatedAt: Date.now(),
//           }),
//         );
//       } catch {
//         // ignore
//       }
//     };
//     window.addEventListener("pagehide", persistNow);
//     window.addEventListener("beforeunload", persistNow);
//     return () => {
//       window.removeEventListener("pagehide", persistNow);
//       window.removeEventListener("beforeunload", persistNow);
//     };
//   }, [timerStorageKey]);

//   // ====================================================
//   // CENTRAL TRACKER SYNC
//   // ====================================================

//   const syncTrackerTime = async (seconds = daySecondsRef.current) => {
//     try {
//       const response = await fetch(`${backendUrl}/api/tracker-time`, {
//         method: "POST",
//         headers: {
//           ...backendHeaders,
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify({
//           employeeId: currentUser.id,
//           employeeName: currentUser.name,
//           dateKey: getTodayDateKey(),
//           totalSeconds: Math.max(0, Math.floor(seconds)),
//         }),
//       });

//       const data = await readApiJson(response);
//       if (!response.ok || !data?.success) {
//         throw new Error(data?.error || "Tracker sync failed");
//       }
//       return Number(data.totalSeconds || seconds);
//     } catch (error) {
//       console.warn("Tracker sync warning:", error);
//       return seconds;
//     }
//   };

//   // ====================================================
//   // TIMER
//   // ====================================================

//   useEffect(() => {
//     const tick = () => {
//       const segmentStart = segmentStartRef.current;
//       if (segmentStart === null) {
//         return;
//       }
//       const now = Date.now();
//       const gap = now - lastTickMsRef.current;
//       if (gap > MAX_TIMER_GAP_SECONDS * 1000) {
//   segmentStartRef.current = now - 1000;
// }
//       lastTickMsRef.current = now;
//       const elapsed = Math.max(
//         0,
//         Math.floor((now - (segmentStartRef.current as number)) / 1000),
//       );
//       const nextDay = dayBaseRef.current + elapsed;
//       const nextSession = sessionBaseRef.current + elapsed;
//       setDayTotalSeconds((previous) =>
//         previous === nextDay ? previous : nextDay,
//       );
//       setSessionSeconds((previous) =>
//         previous === nextSession ? previous : nextSession,
//       );
//     };

//     let worker: Worker | null = null;
//     let workerUrl = "";

//     const startFallbackInterval = () => {
//       if (trackerTimerRef.current === null) {
//         trackerTimerRef.current = window.setInterval(tick, 250);
//       }
//     };

//     if (isTracking && !isPaused) {
//       dayBaseRef.current = daySecondsRef.current;
//       sessionBaseRef.current = sessionSecondsRef.current;
//       segmentStartRef.current = Date.now();
//       lastTickMsRef.current = segmentStartRef.current;

//       try {
//         workerUrl = URL.createObjectURL(
//           new Blob(["setInterval(function(){postMessage(1)},250)"], {
//             type: "application/javascript",
//           }),
//         );
//         worker = new Worker(workerUrl);
//         worker.onmessage = tick;
//         worker.onerror = () => {
//           startFallbackInterval();
//         };
//       } catch {
//         startFallbackInterval();
//       }
//       document.addEventListener("visibilitychange", tick);
//     }

//     return () => {
//       document.removeEventListener("visibilitychange", tick);
//       tick();
//       if (worker) {
//         worker.terminate();
//         worker = null;
//       }
//       if (workerUrl) {
//         URL.revokeObjectURL(workerUrl);
//         workerUrl = "";
//       }
//       segmentStartRef.current = null;
//       if (trackerTimerRef.current) {
//         clearInterval(trackerTimerRef.current);
//         trackerTimerRef.current = null;
//       }
//     };
//   }, [isTracking, isPaused]);


//   // ====================================================
//   // TIMER — sleep / browser suspension safe
//   // ====================================================

//   useEffect(() => {
//     let worker: Worker | null = null;
//     let workerUrl = "";
//     let fallbackTimer: number | null = null;
//     let suspended = document.visibilityState !== "visible";
//     let lastTick = Date.now();

//     const tick = () => {
//       const now = Date.now();
//       const gap = now - lastTick;
//       lastTick = now;

//       const segmentStart = segmentStartRef.current;

//       if (segmentStart === null || suspended) {
//         return;
//       }

//       // Do not count a long gap caused by system sleep,
//       // browser suspension, or a throttled background tab.
//       if (gap > MAX_TIMER_GAP_SECONDS * 1000) {
//         segmentStartRef.current = now;
//         dayBaseRef.current = daySecondsRef.current;
//         sessionBaseRef.current = sessionSecondsRef.current;
//         return;
//       }

//       const elapsed = Math.max(
//         0,
//         Math.floor((now - segmentStartRef.current) / 1000),
//       );

//       const nextDay = dayBaseRef.current + elapsed;
//       const nextSession = sessionBaseRef.current + elapsed;

//       setDayTotalSeconds((previous) =>
//         previous === nextDay ? previous : nextDay,
//       );

//       setSessionSeconds((previous) =>
//         previous === nextSession ? previous : nextSession,
//       );
//     };

//     const handleVisibilityChange = () => {
//       const now = Date.now();
//       const isHidden = document.visibilityState !== "visible";

//       if (isHidden) {
//         if (!suspended) {
//           tick();
//           suspended = true;
//         }
//         lastTick = now;
//         return;
//       }

//       if (suspended) {
//         suspended = false;
//         lastTick = now;

//         // Resume from the last saved total; never count the
//         // time spent asleep or suspended.
//         dayBaseRef.current = daySecondsRef.current;
//         sessionBaseRef.current = sessionSecondsRef.current;
//         segmentStartRef.current = now;
//       }
//     };

//     const handlePageShow = () => {
//       const now = Date.now();
//       suspended = document.visibilityState !== "visible";
//       lastTick = now;

//       if (!suspended && segmentStartRef.current !== null) {
//         dayBaseRef.current = daySecondsRef.current;
//         sessionBaseRef.current = sessionSecondsRef.current;
//         segmentStartRef.current = now;
//       }
//     };

//     if (isTracking && !isPaused) {
//       const now = Date.now();

//       suspended = document.visibilityState !== "visible";
//       lastTick = now;
//       dayBaseRef.current = daySecondsRef.current;
//       sessionBaseRef.current = sessionSecondsRef.current;
//       segmentStartRef.current = suspended ? null : now;

//       try {
//         workerUrl = URL.createObjectURL(
//           new Blob(["setInterval(function(){postMessage(1)},250)"], {
//             type: "application/javascript",
//           }),
//         );

//         worker = new Worker(workerUrl);
//         worker.onmessage = tick;
//         worker.onerror = () => {
//           if (fallbackTimer === null) {
//             fallbackTimer = window.setInterval(tick, 250);
//           }
//         };
//       } catch {
//         fallbackTimer = window.setInterval(tick, 250);
//       }

//       document.addEventListener("visibilitychange", handleVisibilityChange);
//       window.addEventListener("pageshow", handlePageShow);
//       window.addEventListener("focus", handlePageShow);
//     }

//     return () => {
//       document.removeEventListener("visibilitychange", handleVisibilityChange);
//       window.removeEventListener("pageshow", handlePageShow);
//       window.removeEventListener("focus", handlePageShow);

//       if (worker) {
//         worker.terminate();
//         worker = null;
//       }

//       if (workerUrl) {
//         URL.revokeObjectURL(workerUrl);
//       }

//       if (fallbackTimer !== null) {
//         window.clearInterval(fallbackTimer);
//       }

//       segmentStartRef.current = null;

//       if (trackerTimerRef.current) {
//         clearInterval(trackerTimerRef.current);
//         trackerTimerRef.current = null;
//       }
//     };
//   }, [isTracking, isPaused]);


//   // ====================================================
//   // BROWSER TAB TITLE
//   // ====================================================
//   useEffect(() => {
//     const baseTitle = "Employee Time Tracker";

//     const firstAlertTitle = scheduleAlerts[0]?.title || "";
//     if (!firstAlertTitle) {
//       document.title = baseTitle;
//       return;
//     }

//     const alertTitle = `🔔 ${firstAlertTitle}`;
//     let showAlert = true;
//     document.title = alertTitle;

//     const intervalId = window.setInterval(() => {
//       showAlert = !showAlert;
//       document.title = showAlert ? alertTitle : baseTitle;
//     }, 1000);

//     return () => {
//       window.clearInterval(intervalId);
//       document.title = baseTitle;
//     };
//   }, [scheduleAlerts]);

//   // ====================================================
//   // PERIODIC CENTRAL TRACKER SYNC
//   // ====================================================

//   useEffect(() => {
//     if (!isTracking || isPaused) {
//       if (trackerSyncIntervalRef.current !== null) {
//         window.clearInterval(trackerSyncIntervalRef.current);
//         trackerSyncIntervalRef.current = null;
//       }
//       return;
//     }

//     trackerSyncIntervalRef.current = window.setInterval(() => {
//       if (trackingRef.current && !pausedRef.current) {
//         void syncTrackerTime(daySecondsRef.current);
//       }
//     }, 60 * 1000);

//     return () => {
//       if (trackerSyncIntervalRef.current !== null) {
//         window.clearInterval(trackerSyncIntervalRef.current);
//         trackerSyncIntervalRef.current = null;
//       }
//     };
//   }, [isTracking, isPaused]);

//   // ====================================================
//   // SCREEN SHARE
//   // ====================================================

//   const initScreenStream = async () => {
//     try {
//       if (
//         !window.isSecureContext ||
//         !navigator.mediaDevices ||
//         typeof navigator.mediaDevices.getDisplayMedia !== "function"
//       ) {
//         throw new Error("Screen capture requires HTTPS.");
//       }

//       if (screenStreamRef.current?.active) {
//         return screenStreamRef.current;
//       }

//       let stream: MediaStream;
//       try {
//         stream = await navigator.mediaDevices.getDisplayMedia({
//           video: {
//             displaySurface: "monitor",
//             frameRate: { ideal: 5, max: 15 },
//           },
//           audio: false,
//           monitorTypeSurfaces: "include",
//           selfBrowserSurface: "exclude",
//           surfaceSwitching: "exclude",
//           preferCurrentTab: false,
//         } as any);
//       } catch {
//         stream = await navigator.mediaDevices.getDisplayMedia({
//           video: true,
//           audio: false,
//         });
//       }

//       const videoTrack = stream.getVideoTracks()[0];
//       if (videoTrack) {
//         videoTrack.onended = () => {
//           clearCaptureTimers();
//           captureInProgressRef.current = false;
//           screenStreamRef.current = null;
//           if (screenVideoRef.current) {
//             screenVideoRef.current.srcObject = null;
//           }
//           setNeedsScreenShare(true);
//           setNextCaptureInSec(null);
//           if (trackingRef.current && !pausedRef.current) {
//             setLastStatus(
//               "Screen capture permission required. Reconnect screen sharing to continue screenshots.",
//             );
//           } else {
//             setLastStatus("Screen sharing stopped.");
//           }
//         };
//       }

//       screenStreamRef.current = stream;
//       setNeedsScreenShare(false);

//       if (screenVideoRef.current) {
//         screenVideoRef.current.srcObject = stream;
//         await screenVideoRef.current.play().catch(() => {});
//       }
//       return stream;
//     } catch (error: any) {
//       console.error("Screen permission error:", error);
//       setNeedsScreenShare(true);
//       setLastStatus(
//         `Screen capture permission required: ${error?.message || "Cancelled"}`,
//       );
//       return null;
//     }
//   };

//   // ====================================================
//   // CAPTURE CANVAS
//   // ====================================================

//   const captureCurrentScreen = async (stream: MediaStream) => {
//     const video = screenVideoRef.current;
//     if (!video) return null;

//     if (video.srcObject !== stream) {
//       video.srcObject = stream;
//     }
//     await video.play().catch(() => {});

//     let attempts = 0;
//     while ((!video.videoWidth || !video.videoHeight) && attempts < 50) {
//       await new Promise((resolve) => setTimeout(resolve, 100));
//       if (attempts % 5 === 0) {
//         await video.play().catch(() => {});
//       }
//       attempts++;
//     }

//     if (!video.videoWidth || !video.videoHeight) {
//       throw new Error("Screen frame is not ready.");
//     }

//     const canvas = document.createElement("canvas");
//     canvas.width = video.videoWidth;
//     canvas.height = video.videoHeight;
//     const ctx = canvas.getContext("2d", { alpha: false });
//     if (!ctx) {
//       throw new Error("Canvas unavailable.");
//     }
//     ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
//     return canvas;
//   };

//   // ====================================================
//   // SCREENSHOT UPLOAD
//   // ====================================================

//   const captureAndUpload = async () => {
//     if (!trackingRef.current || pausedRef.current) {
//       return;
//     }
//     if (captureInProgressRef.current) {
//       console.warn(
//         "Screenshot capture skipped: another capture is already in progress.",
//       );
//       return;
//     }

//     captureInProgressRef.current = true;

//     try {
//       setLastStatus("Capturing screenshot...");
//       const stream = await initScreenStream();
//       if (!stream) {
//         setNeedsScreenShare(true);
//         return;
//       }

//       if (!trackingRef.current || pausedRef.current) return;

//       const canvas = await captureCurrentScreen(stream);
//       if (!canvas) return;
//       if (!trackingRef.current || pausedRef.current) return;

//       const format = storageSettings.screenshotFormat || "webp";

//       const fullDataUrl = canvas.toDataURL(
//         format === "png" ? "image/png" : "image/webp",
//         0.9,
//       );

//       const { blob, mimeType, extension } = await canvasToBlob(canvas, format);
//       if (!trackingRef.current || pausedRef.current) return;

//       const now = new Date();
//       const dateKey = getTodayDateKey(now);
//       const timeFormatted = formatTimeString(now);
//       const hourKey = getHourSlotKey(now);
//       const safeTime = now.toTimeString().split(" ")[0].replace(/:/g, "-");
//       const fileName = `Screen_${dateKey}_${safeTime}.${extension}`;

//       // Take a per-screenshot snapshot of the Windows-wide input counters.
//       // Snapshot resets the agent counters so the next capture is a new interval.
//       const rawActivityCounts = await callGlobalActivityAgent("snapshot");
//       const activityCounts = rawActivityCounts
//         ? normalizeActivityCounts(rawActivityCounts)
//         : null;

//       const result = await uploadScreenshotLocally(
//         blob,
//         fileName,
//         currentUser.id,
//         currentUser.name,
//         dateKey,
//       );

//       if (activityCounts) {
//         try {
//           const activityResponse = await apiFetch("/api/activity-snapshot", {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({
//               employeeId: currentUser.id,
//               dateKey,
//               fileName,
//               ...activityCounts,
//             }),
//           });
//           if (!activityResponse.ok) {
//             console.warn("Activity counts were not saved:", activityResponse.status);
//           }
//         } catch (activityError) {
//           console.warn("Could not save activity counts:", activityError);
//         }
//       }

//       const thumbnail = generateThumbnailDataUrl(canvas, 640, 360, 0.75);
//       const id = `scr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

//       setCachedScreenshot(id, fullDataUrl);

//       const log: ScreenshotLog = {
//         id,
//         userId: currentUser.id,
//         userName: currentUser.name,
//         userEmail: currentUser.email,
//         taskName,
//         timestamp: now.toISOString(),
//         timeFormatted,
//         hourKey,
//         dateKey,
//         fileFormat: format,
//         driveFileId: result.fileId,
//         driveThumbnailLink: result.localUrl,
//         previewDataUrl: thumbnail,
//         productivityScore: 92,
//         productivityLabel: "High",
//       };

//       onNewScreenshot(log);

//       if (selectedDate === dateKey) {
//         setRestoredScreenshots((previous) => {
//           const key = getScreenshotIdentity(log);
//           const alreadyExists = previous.some(
//             (screenshot) => getScreenshotIdentity(screenshot) === key,
//           );
//           if (alreadyExists) return previous;
//           return [log, ...previous];
//         });
//       }

//       setLastCapturedTime(timeFormatted);
//       setLastStatus(
//         `✅ Screenshot saved locally and queued for cloud upload. ${
//           isScreenshotUploadWindowOpen()
//             ? "Cloud upload runs in hourly batches."
//             : "Cloud sharing is paused outside 08:30 AM–08:30 PM IST."
//         }`,
//       );
//     } catch (error: any) {
//       console.error("Capture error:", error);
//       setLastStatus(`Capture warning: ${error?.message || "Unknown error"}`);
//     } finally {
//       captureInProgressRef.current = false;
//     }
//   };

//   // ====================================================
//   // RANDOM SCREENSHOT WINDOW
//   // ====================================================

//   const clearCaptureTimers = () => {
//     captureScheduleIdRef.current += 1;
//     if (captureTimerRef.current) {
//       clearTimeout(captureTimerRef.current);
//       captureTimerRef.current = null;
//     }
//     if (countdownRef.current) {
//       clearInterval(countdownRef.current);
//       countdownRef.current = null;
//     }
//   };

//   const scheduleRandomWindow = (
//     windowSeconds = captureWindowRef.current,
//     screenshotCount = screenshotCountRef.current,
//   ) => {
//     clearCaptureTimers();
//     if (!trackingRef.current || pausedRef.current) {
//       return;
//     }

//     const scheduleId = captureScheduleIdRef.current;
//     const safeWindow = Math.max(5, Math.floor(Number(windowSeconds) || 600));
//     const safeCount = Math.max(1, Math.floor(Number(screenshotCount) || 1));
//     const windowMs = safeWindow * 1000;

//     const randomPositions = Array.from({ length: safeCount }, (_, index) => {
//       const zoneStart = (windowMs * index) / safeCount;
//       const zoneEnd = (windowMs * (index + 1)) / safeCount;
//       const padding = Math.min(500, Math.max(50, (zoneEnd - zoneStart) * 0.05));
//       const start = zoneStart + padding;
//       const end = Math.max(start + 25, zoneEnd - padding);
//       return Math.floor(start + Math.random() * (end - start));
//     }).sort((a, b) => a - b);

//     let index = 0;
//     let elapsedPosition = 0;

//     const scheduleNext = () => {
//       if (
//         scheduleId !== captureScheduleIdRef.current ||
//         !trackingRef.current ||
//         pausedRef.current
//       ) {
//         return;
//       }

//       if (index >= randomPositions.length) {
//         const remaining = Math.max(100, windowMs - elapsedPosition);
//         setNextCaptureInSec(Math.ceil(remaining / 1000));
//         countdownRef.current = window.setInterval(() => {
//           setNextCaptureInSec((previous) =>
//             previous === null || previous <= 1 ? 0 : previous - 1,
//           );
//         }, 1000);

//         captureTimerRef.current = window.setTimeout(() => {
//           captureTimerRef.current = null;
//           if (
//             scheduleId !== captureScheduleIdRef.current ||
//             !trackingRef.current ||
//             pausedRef.current
//           ) {
//             return;
//           }
//           if (countdownRef.current) {
//             clearInterval(countdownRef.current);
//             countdownRef.current = null;
//           }
//           scheduleRandomWindow(safeWindow, safeCount);
//         }, remaining);
//         return;
//       }

//       const position = randomPositions[index];
//       const delay = Math.max(50, position - elapsedPosition);
//       setNextCaptureInSec(Math.max(1, Math.ceil(delay / 1000)));
//       countdownRef.current = window.setInterval(() => {
//         setNextCaptureInSec((previous) =>
//           previous === null || previous <= 1 ? 0 : previous - 1,
//         );
//       }, 1000);

//       captureTimerRef.current = window.setTimeout(async () => {
//         captureTimerRef.current = null;
//         if (countdownRef.current) {
//           clearInterval(countdownRef.current);
//           countdownRef.current = null;
//         }
//         if (
//           scheduleId !== captureScheduleIdRef.current ||
//           !trackingRef.current ||
//           pausedRef.current
//         ) {
//           return;
//         }

//         await captureAndUpload();

//         if (scheduleId !== captureScheduleIdRef.current) {
//           return;
//         }
//         if (!trackingRef.current || pausedRef.current) {
//           return;
//         }
//         elapsedPosition = position;
//         index++;
//         scheduleNext();
//       }, delay);
//     };

//     scheduleNext();
//   };

//   // ====================================================
//   // CAPTURE POLICY REFRESH
//   // ====================================================

//   const refreshCapturePolicy = async () => {
//     const now = Date.now();
//     if (now - capturePolicyRefreshAtRef.current < 30000) {
//       return;
//     }
//     capturePolicyRefreshAtRef.current = now;

//     try {
//       const response = await fetch(`${backendUrl}/api/capture-settings`, {
//         cache: "no-store",
//         headers: backendHeaders,
//       });
//       const data = await readApiJson(response);
//       if (!response.ok || !data?.success || !data?.settings) {
//         return;
//       }

//       const settings = data.settings;
//       const newWindow = Math.max(
//         5,
//         Number(
//           settings.captureWindowSeconds ||
//             settings.captureIntervalSeconds ||
//             600,
//         ),
//       );
//       const newCount = Math.max(1, Number(settings.screenshotsPerWindow || 5));
//       const newPreset = String(settings.presetId || "custom");
//       const newUpdatedAt = String(settings.updatedAt || "");

//       const changed =
//         newWindow !== captureWindowRef.current ||
//         newCount !== screenshotCountRef.current ||
//         newPreset !== capturePresetId ||
//         newUpdatedAt !== centralPolicyUpdatedAt;

//       setCaptureWindowSeconds(newWindow);
//       setScreenshotsPerWindow(newCount);
//       setCapturePresetId(newPreset);
//       setCentralPolicyUpdatedAt(newUpdatedAt);
//       captureWindowRef.current = newWindow;
//       screenshotCountRef.current = newCount;

//       if (changed && trackingRef.current && !pausedRef.current) {
//         clearCaptureTimers();
//         scheduleRandomWindow(newWindow, newCount);
//       }

//       try {
//         localStorage.setItem(
//           "workmonitor_employee_capture_settings",
//           JSON.stringify(settings),
//         );
//       } catch {
//         // ignore
//       }
//     } catch (error) {
//       console.warn("Capture policy refresh warning:", error);
//     }
//   };

//   useEffect(() => {
//     const handleVisibilityOrFocus = () => {
//       if (document.visibilityState === "visible") {
//         void refreshCapturePolicy();
//       }
//     };
//     window.addEventListener("focus", handleVisibilityOrFocus);
//     document.addEventListener("visibilitychange", handleVisibilityOrFocus);
//     return () => {
//       window.removeEventListener("focus", handleVisibilityOrFocus);
//       document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
//     };
//   }, [backendUrl, capturePresetId, centralPolicyUpdatedAt]);

//   // ====================================================
//   // HOURLY CLOUD UPLOAD QUEUE
//   // ====================================================

//   useEffect(() => {
//     const stopScheduler = startScreenshotUploadScheduler();
//     return stopScheduler;
//   }, []);

//   // ====================================================
//   // HISTORY
//   // ====================================================

//   const loadDateHistory = async () => {
//     setLoadingHistory(true);
//     try {
//       const [historyResponse, activityResponse] = await Promise.all([
//         fetch(
//           `${backendUrl}/api/activity-history/${encodeURIComponent(
//             currentUser.id,
//           )}`,
//           { cache: "no-store", headers: backendHeaders },
//         ),
//         fetch(
//           `${backendUrl}/api/activity/${encodeURIComponent(
//             currentUser.id,
//           )}/${encodeURIComponent(selectedDate)}`,
//           { cache: "no-store", headers: backendHeaders },
//         ),
//       ]);

//       const historyData = await readApiJson(historyResponse);
//       const activityData = await readApiJson(activityResponse);

//       if (historyResponse.ok && historyData?.success) {
//         setActivityHistory(
//           Array.isArray(historyData.records) ? historyData.records : [],
//         );
//       }

//       if (activityResponse.ok && activityData?.success) {
//         const backendSeconds = Math.max(
//           0,
//           Number(activityData.totalSeconds || 0),
//         );
//         setSelectedDateSeconds(backendSeconds);

//         if (
//           selectedDate === getTodayDateKey() &&
//           backendSeconds > daySecondsRef.current
//         ) {
//           dayBaseRef.current += backendSeconds - daySecondsRef.current;
//           daySecondsRef.current = backendSeconds;
//           setDayTotalSeconds(backendSeconds);
//         }
//       } else {
//         setSelectedDateSeconds(0);
//       }

//       const files = await getLocalScreenshots(currentUser.id, selectedDate);
//       const restored: ScreenshotLog[] = files.map((item, index) => {
//         const fileName = item.fileName;
//         const url = item.localUrl;
//         const match = fileName.match(
//           /Screen_(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})\.(webp|png|jpg|jpeg)$/i,
//         );

//         let timestamp = `${selectedDate}T00:00:00`;
//         let timeFormatted = "";
//         let hourKey = "";

//         if (match) {
//           const [, date, hh, mm, ss] = match;
//           const dateObject = new Date(`${date}T${hh}:${mm}:${ss}`);
//           timestamp = dateObject.toISOString();
//           timeFormatted = formatTimeString(dateObject);
//           hourKey = getHourSlotKey(dateObject);
//         }

//         const extension = fileName.toLowerCase().endsWith(".png")
//           ? "png"
//           : fileName.toLowerCase().match(/\.jpe?g$/)
//             ? "jpg"
//             : "webp";

//         return {
//           id: `saved-${selectedDate}-${fileName}-${index}`,
//           userId: currentUser.id,
//           userName: currentUser.name,
//           userEmail: currentUser.email,
//           taskName: "Saved Screenshot",
//           timestamp,
//           timeFormatted,
//           hourKey,
//           dateKey: selectedDate,
//           fileFormat: extension,
//           driveFileId: fileName,
//           driveThumbnailLink: url,
//           previewDataUrl: url,
//         };
//       });

//       restored.sort(
//         (a, b) =>
//           new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
//       );
//       setRestoredScreenshots(restored);
//     } catch (error) {
//       console.warn("History warning:", error);
//     } finally {
//       setLoadingHistory(false);
//     }
//   };

//   useEffect(() => {
//     void loadDateHistory();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [currentUser.id, selectedDate]);

//   // ====================================================
//   // MERGE SCREENSHOTS
//   // ====================================================

//   const mergedScreenshots = useMemo(() => {
//     const map = new Map<string, ScreenshotLog>();
//     restoredScreenshots.forEach((screenshot) => {
//       map.set(getScreenshotIdentity(screenshot), screenshot);
//     });
//     userScreenshots.forEach((screenshot) => {
//       if (screenshot.dateKey !== selectedDate) return;
//       map.set(getScreenshotIdentity(screenshot), screenshot);
//     });
//     return Array.from(map.values()).sort(
//       (a, b) =>
//         new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
//     );
//   }, [restoredScreenshots, userScreenshots, selectedDate]);

//   useEffect(() => {
//     const visibleCount = mergedScreenshots.length;
//     setActivityHistory((previous) =>
//       previous.map((record) =>
//         record.dateKey === selectedDate
//           ? { ...record, screenshotCount: visibleCount }
//           : record,
//       ),
//     );
//   }, [mergedScreenshots.length, selectedDate]);

//   // ====================================================
//   // GALLERY PAGINATION
//   // ====================================================

//   const totalPages = Math.max(
//     1,
//     Math.ceil(mergedScreenshots.length / SCREENSHOTS_PER_PAGE),
//   );

//   useEffect(() => {
//     setCurrentPage(1);
//   }, [selectedDate]);

//   useEffect(() => {
//     if (currentPage > totalPages) {
//       setCurrentPage(totalPages);
//     }
//   }, [currentPage, totalPages]);

//   const pagedScreenshots = useMemo(() => {
//     const startIndex = (currentPage - 1) * SCREENSHOTS_PER_PAGE;
//     return mergedScreenshots.slice(
//       startIndex,
//       startIndex + SCREENSHOTS_PER_PAGE,
//     );
//   }, [mergedScreenshots, currentPage]);

//   const pageNumbers = useMemo(() => {
//     if (totalPages <= 7) {
//       return Array.from({ length: totalPages }, (_, index) => index + 1) as (
//         | number
//         | string
//       )[];
//     }
//     const pages: (number | string)[] = [1];
//     const start = Math.max(2, currentPage - 1);
//     const end = Math.min(totalPages - 1, currentPage + 1);
//     if (start > 2) pages.push("ellipsis-left");
//     for (let page = start; page <= end; page++) {
//       pages.push(page);
//     }
//     if (end < totalPages - 1) pages.push("ellipsis-right");
//     pages.push(totalPages);
//     return pages;
//   }, [currentPage, totalPages]);

//   // ====================================================
//   // EMPLOYEE SCREENSHOT IMAGE LOADING
//   // ====================================================

//   const employeeScreenshotUrlCacheRef = useRef<Record<string, string>>({});

//   useEffect(() => {
//     let cancelled = false;
//     const loadImages = async () => {
//       const loaded: Record<string, string> = {};
//       const cache = employeeScreenshotUrlCacheRef.current;

//       for (const screenshot of mergedScreenshots) {
//         const source =
//           screenshot.driveThumbnailLink || screenshot.previewDataUrl || "";
//         if (!source || cancelled) continue;

//         if (source.startsWith("data:") || source.startsWith("blob:")) {
//           loaded[source] = source;
//           continue;
//         }

//         const cachedUrl = cache[source];
//         if (cachedUrl) {
//           loaded[source] = cachedUrl;
//           continue;
//         }

//         try {
//           const response = await fetch(source, {
//             method: "GET",
//             cache: "force-cache",
//             headers: {},
//           });
//           if (!response.ok) throw new Error(`HTTP ${response.status}`);
//           const blob = await response.blob();
//           if (cancelled) return;
//           const objectUrl = URL.createObjectURL(blob);
//           cache[source] = objectUrl;
//           loaded[source] = objectUrl;
//         } catch (error) {
//           console.warn(
//             "Employee screenshot fetch failed; using direct image URL:",
//             screenshot.driveFileId,
//             error,
//           );
//           loaded[source] = source;
//         }
//       }

//       if (!cancelled) {
//         setEmployeeScreenshotUrls(loaded);
//       }
//     };
//     void loadImages();
//     return () => {
//       cancelled = true;
//     };
//   }, [mergedScreenshots]);

//   // ====================================================
//   // START
//   // ====================================================

//   const startTracking = async () => {
//     if (trackingRef.current) {
//       console.warn("Tracking already active. Start request ignored.");
//       return;
//     }

//     const stream = await initScreenStream();

//     if (!restoredSessionRef.current) {
//       sessionSecondsRef.current = 0;
//     }

//     if (!stream) {
//       void callGlobalActivityAgent("start");
//       trackingRef.current = true;
//       pausedRef.current = false;
//       setIsTracking(true);
//       setIsPaused(false);
//       setNeedsScreenShare(true);

//       if (restoredSessionRef.current) {
//         restoredSessionRef.current = false;
//       } else {
//         setSessionSeconds(0);
//       }
//       setLastStatus(
//         "Tracking started. Reconnect screen sharing to enable screenshots.",
//       );
//       await syncTrackerTime();
//       clearCaptureTimers();
//       return;
//     }

//     setNeedsScreenShare(false);
//     void callGlobalActivityAgent("start");
//     trackingRef.current = true;
//     pausedRef.current = false;
//     setIsTracking(true);
//     setIsPaused(false);

//     if (restoredSessionRef.current) {
//       restoredSessionRef.current = false;
//     } else {
//       setSessionSeconds(0);
//     }
//     setLastStatus("✅ Tracking started");
//     await syncTrackerTime();
//     clearCaptureTimers();
//     scheduleRandomWindow(captureWindowRef.current, screenshotCountRef.current);
//   };

//   // ====================================================
//   // PAUSE
//   // ====================================================

//   const pauseTracking = async () => {
//     void callGlobalActivityAgent("pause");
//     pausedRef.current = true;
//     setIsPaused(true);
//     clearCaptureTimers();
//     setNextCaptureInSec(null);
//     await syncTrackerTime();
//     setLastStatus("Tracking paused");
//   };

//   // ====================================================
//   // RESUME
//   // ====================================================

//   const resumeTracking = () => {
//     if (!trackingRef.current) {
//       return;
//     }
//     void callGlobalActivityAgent("resume");
//     pausedRef.current = false;
//     setIsPaused(false);
//     clearCaptureTimers();
//     scheduleRandomWindow(captureWindowRef.current, screenshotCountRef.current);
//     setLastStatus("Tracking resumed");
//   };

//   // ====================================================
//   // STOP
//   // ====================================================

//   const stopTracking = async () => {
//     void callGlobalActivityAgent("stop");
//     trackingRef.current = false;
//     pausedRef.current = false;
//     resumeAfterScreenShareRef.current = false;
//     clearCaptureTimers();
//     setNextCaptureInSec(null);
//     await syncTrackerTime();
//     segmentStartRef.current = null;
//     setIsTracking(false);
//     setIsPaused(false);

//     if (screenStreamRef.current) {
//       screenStreamRef.current.getTracks().forEach((track) => track.stop());
//       screenStreamRef.current = null;
//     }
//     if (screenVideoRef.current) {
//       screenVideoRef.current.srcObject = null;
//     }
//     setSessionSeconds(0);
//     restoredSessionRef.current = false;
//     setNeedsScreenShare(false);
//     setLastStatus(
//       `Tracking stopped. Today: ${formatSecondsToHoursMinutes(
//         daySecondsRef.current,
//       )}`,
//     );
//     await loadDateHistory();
//   };

//   // ====================================================
//   // RECONNECT SCREEN SHARING
//   // ====================================================

//   const reconnectScreenShare = async () => {
//     const stream = await initScreenStream();
//     if (!stream) return;

//     setNeedsScreenShare(false);

//     // If the page was refreshed during an active session, resume the timer
//     // only after the screen-share chooser succeeds. A manually paused session
//     // remains paused.
//     if (trackingRef.current && resumeAfterScreenShareRef.current) {
//       resumeAfterScreenShareRef.current = false;
//       pausedRef.current = false;
//       setIsPaused(false);
//       clearCaptureTimers();
//       scheduleRandomWindow(
//         captureWindowRef.current,
//         screenshotCountRef.current,
//       );
//       setLastStatus("✅ Screen sharing connected. Timer and screenshots resumed.");
//       return;
//     }

//     setLastStatus(
//       trackingRef.current && pausedRef.current
//         ? "✅ Screen sharing connected. Tracking remains paused; click Resume when ready."
//         : "✅ Screen sharing connected. Screenshots resumed.",
//     );

//     if (trackingRef.current && !pausedRef.current) {
//       clearCaptureTimers();
//       scheduleRandomWindow(
//         captureWindowRef.current,
//         screenshotCountRef.current,
//       );
//     }
//   };

//   // ====================================================
//   // SCHEDULE ALERT ACTIONS
//   // ====================================================

//   const handleScheduleAlertAction = async (alert: ScheduleAlert) => {
//     if (alert.id === "test") {
//       removeScheduleAlert("test");
//       publishScheduleAlertState(
//         scheduleAlertsRef.current,
//         alertSnoozeRef.current,
//       );
//       return;
//     }

//     alertSnoozeRef.current[alert.id] = Date.now() + 60 * 1000;
//     removeScheduleAlert(alert.id);
//     publishScheduleAlertState(
//       scheduleAlertsRef.current,
//       alertSnoozeRef.current,
//     );

//     if (alert.action === "start") {
//       await startTracking();
//     } else if (alert.action === "resume") {
//       resumeTracking();
//     } else if (alert.action === "pause") {
//       await pauseTracking();
//     } else if (alert.action === "stop") {
//       await stopTracking();
//     }
//   };

//   // ====================================================
//   // FLOATING BAR
//   // ====================================================

//   const handleStartClick = () => {
//     floatDismissedRef.current = false;
//     const startPromise = startTracking();
//     if (alertSettings.floatOnStart && pipSupported && !pipWindowRef.current) {
//       void openFloatingTimer();
//     }
//     void startPromise;
//   };

//   const handleToggleTracking = () => {
//     if (!isTracking) {
//       handleStartClick();
//     } else if (isPaused) {
//       resumeTracking();
//     } else {
//       void pauseTracking();
//     }
//   };

//   const renderFloatingPanel = () => {
//     const running = isTracking && !isPaused;
//     const dotColor = running ? "#34d399" : isTracking ? "#fbbf24" : "#64748b";
//     const activeAlert = scheduleAlerts[0];

//     const circleButton = (
//       background: string,
//       size = 32,
//     ): React.CSSProperties => ({
//       width: size,
//       height: size,
//       borderRadius: "50%",
//       border: "none",
//       cursor: "pointer",
//       display: "flex",
//       alignItems: "center",
//       justifyContent: "center",
//       background,
//       color: "#ffffff",
//       padding: 0,
//       flexShrink: 0,
//     });

//     const textButton = (background: string): React.CSSProperties => ({
//       cursor: "pointer",
//       border: "none",
//       borderRadius: 999,
//       padding: "4px 10px",
//       fontSize: 11,
//       fontWeight: 700,
//       color: "#ffffff",
//       background,
//       whiteSpace: "nowrap",
//       flexShrink: 0,
//     });

//     return (
//       <div
//         style={{
//           fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
//           color: "#e5e7eb",
//           padding: "6px 10px", // ✅ પેડિંગ ઓછું કર્યું
//           boxSizing: "border-box",
//           minHeight: "100vh",
//           display: "flex",
//           flexDirection: "column",
//           justifyContent: "center", // ✅ સેન્ટર કર્યું
//           gap: 4,
//         }}
//       >
//         <style>
//           {
//             "@keyframes wmflash{0%,100%{box-shadow:0 0 0 0 rgba(129,140,248,0)}50%{box-shadow:0 0 0 3px rgba(129,140,248,.85)}}"
//           }
//         </style>

//         <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
//           <span
//             style={{
//               width: 8,
//               height: 8,
//               borderRadius: "50%",
//               background: dotColor,
//               display: "inline-block",
//               flexShrink: 0,
//             }}
//           />
//           <div
//             style={{
//               fontFamily: "ui-monospace, Consolas, monospace",
//               fontSize: 20,
//               fontWeight: 800,
//               color: running ? "#34d399" : "#e5e7eb",
//               fontVariantNumeric: "tabular-nums",
//               flex: 1,
//             }}
//           >
//             {formatClock(dayTotalSeconds)}
//           </div>
//           <button
//             type="button"
//             onClick={handleToggleTracking}
//             title={
//               !isTracking ? "Start tracking" : isPaused ? "Resume" : "Pause"
//             }
//             style={circleButton(running ? "#f59e0b" : "#059669")}
//           >
//             <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
//               {running ? (
//                 <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
//               ) : (
//                 <path d="M8 5v14l11-7z" />
//               )}
//             </svg>
//           </button>
//           {isTracking && (
//             <button
//               type="button"
//               onClick={() => void stopTracking()}
//               title="Stop"
//               style={circleButton("#e11d48")}
//             >
//               <svg
//                 width="10"
//                 height="10"
//                 viewBox="0 0 24 24"
//                 fill="currentColor"
//               >
//                 <path d="M6 6h12v12H6z" />
//               </svg>
//             </button>
//           )}
//         </div>

//         {activeAlert ? (
//           <div
//             style={{
//               background: "#1e1b4b",
//               border: "1px solid #6366f1",
//               borderRadius: 8,
//               padding: "4px 6px", // ✅ કોમ્પેક્ટ પેડિંગ
//               animation: "wmflash 1.2s ease-in-out infinite",
//             }}
//           >
//             <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
//               <div
//                 style={{
//                   fontSize: 10,
//                   fontWeight: 800,
//                   whiteSpace: "nowrap",
//                   overflow: "hidden",
//                   textOverflow: "ellipsis",
//                   flex: 1,
//                 }}
//                 title={activeAlert.message}
//               >
//                 {activeAlert.title}
//               </div>
//               <button
//                 type="button"
//                 onClick={() => void handleScheduleAlertAction(activeAlert)}
//                 style={{ ...textButton("#4f46e5"), padding: "2px 6px", fontSize: 10 }}
//               >
//                 {getAlertActionLabel(activeAlert, true)}
//               </button>
//               <button
//                 type="button"
//                 onClick={() => snoozeScheduleAlert(activeAlert.id)}
//                 style={{ ...textButton("#334155"), padding: "2px 6px", fontSize: 10 }}
//               >
//                 Snooze
//               </button>
//             </div>
//           </div>
//         ) : isTracking && needsScreenShare ? (
//           <div
//             style={{
//               display: "flex",
//               alignItems: "center",
//               gap: 6,
//               fontSize: 11,
//               color: "#fbbf24",
//             }}
//           >
//             <span style={{ flex: 1 }}>Screenshots paused</span>
//             <button
//               type="button"
//               onClick={() => window.focus()}
//               style={textButton("#334155")}
//             >
//               Open dashboard
//             </button>
//           </div>
//         ) : (
//           <div style={{ fontSize: 10, color: "#94a3b8" }}>
//             {running ? "Tracking" : isTracking ? "Paused" : "Not tracking"}
//             {" • Today"}
//           </div>
//         )}
//       </div>
//     );
//   };

//   // ====================================================
//   // CLEANUP
//   // ====================================================

//   useEffect(() => {
//     return () => {
//       clearCaptureTimers();
//       captureInProgressRef.current = false;
//       trackingRef.current = false;
//       pausedRef.current = false;
//       if (trackerTimerRef.current) {
//         clearInterval(trackerTimerRef.current);
//         trackerTimerRef.current = null;
//       }
//       if (trackerSyncIntervalRef.current !== null) {
//         window.clearInterval(trackerSyncIntervalRef.current);
//         trackerSyncIntervalRef.current = null;
//       }
//       if (scheduleAlertChannelRef.current) {
//         scheduleAlertChannelRef.current.close();
//         scheduleAlertChannelRef.current = null;
//       }
//       if (screenStreamRef.current) {
//         screenStreamRef.current.getTracks().forEach((track) => track.stop());
//         screenStreamRef.current = null;
//       }
//     };
//   }, []);

//   // ====================================================
//   // UI HELPERS
//   // ====================================================

//   const policyText = `${screenshotsPerWindow} screenshot${
//     screenshotsPerWindow === 1 ? "" : "s"
//   } randomly / ${
//     captureWindowSeconds < 60
//       ? `${captureWindowSeconds} sec`
//       : `${Math.round(captureWindowSeconds / 60)} min`
//   }`;

//   const today = getTodayDateKey();

//   const notificationReady =
//     alertSettings.browserNotify && notificationPermission === "granted";

//   // ====================================================
//   // DAY / WEEK / MONTH / ALL  TIME TRACKING VIEW
//   // ====================================================

//   const sessionScreenshotCounts: Record<string, number> = {};
//   userScreenshots.forEach((screenshot) => {
//     sessionScreenshotCounts[screenshot.dateKey] =
//       (sessionScreenshotCounts[screenshot.dateKey] || 0) + 1;
//   });

//   const getDayInfo = (dateKey: string) => {
//     const record = activityHistory.find((item) => item.dateKey === dateKey);
//     let seconds = record?.totalSeconds || 0;
//     if (dateKey === today) {
//       seconds = dayTotalSeconds;
//     } else if (dateKey === selectedDate) {
//       seconds = selectedDateSeconds;
//     }
//     const count =
//       dateKey === selectedDate
//         ? mergedScreenshots.length
//         : Math.max(
//             record?.screenshotCount || 0,
//             dateStats[dateKey]?.screenshotCount || 0,
//             sessionScreenshotCounts[dateKey] || 0,
//           );
//     return { seconds, count };
//   };

//   const selectedDateObject = parseDateKey(selectedDate);
//   const weekStartObject = addDays(
//     selectedDateObject,
//     -selectedDateObject.getDay(),
//   );
//   const weekKeys = Array.from({ length: 7 }, (_, index) =>
//     toDateKey(addDays(weekStartObject, index)),
//   );
//   const selectedMonthKey = selectedDate.slice(0, 7);

//   const monthStartObject = new Date(
//     selectedDateObject.getFullYear(),
//     selectedDateObject.getMonth(),
//     1,
//   );
//   const monthEndObject = new Date(
//     selectedDateObject.getFullYear(),
//     selectedDateObject.getMonth() + 1,
//     0,
//   );
//   const monthCalendarStart = addDays(
//     monthStartObject,
//     -monthStartObject.getDay(),
//   );
//   const monthCalendarEnd = addDays(monthEndObject, 6 - monthEndObject.getDay());
//   const monthWeekCount =
//     Math.floor(
//       (monthCalendarEnd.getTime() - monthCalendarStart.getTime()) /
//         (24 * 60 * 60 * 1000),
//     ) /
//       7 +
//     1;
//   const monthWeekKeys = Array.from({ length: monthWeekCount }, (_, weekIndex) =>
//     Array.from({ length: 7 }, (_, dayIndex) =>
//       toDateKey(addDays(monthCalendarStart, weekIndex * 7 + dayIndex)),
//     ),
//   );

//   const allKnownDateKeys = Array.from(
//     new Set([
//       ...activityHistory.map((record) => record.dateKey),
//       today,
//       selectedDate,
//     ]),
//   ).sort((a, b) => b.localeCompare(a));

//   const rangeKeys: string[] =
//     historyView === "day"
//       ? [selectedDate]
//       : historyView === "week"
//         ? [...weekKeys].reverse()
//         : historyView === "month"
//           ? allKnownDateKeys.filter((key) =>
//               key.startsWith(`${selectedMonthKey}-`),
//             )
//           : allKnownDateKeys;

//   const statsFetchKeys = (() => {
//     const historyKeySet = new Set(
//       activityHistory.map((record) => record.dateKey),
//     );
//     let candidates: string[] = [];
//     if (historyView === "day" || historyView === "week") {
//       candidates = [...weekKeys];
//     } else if (historyView === "month") {
//       candidates = allKnownDateKeys.filter((key) =>
//         key.startsWith(`${selectedMonthKey}-`),
//       );
//     } else {
//       candidates = allKnownDateKeys.slice(0, 120);
//     }
//     return Array.from(new Set(candidates))
//       .filter(
//         (key) =>
//           key <= today &&
//           key !== selectedDate &&
//           (historyKeySet.has(key) || key === today),
//       )
//       .sort((a, b) => b.localeCompare(a));
//   })();

//   const statsFetchSignature = statsFetchKeys.join(",");

//   useEffect(() => {
//     let cancelled = false;
//     const staleKeys = statsFetchKeys.filter((key) => {
//       const fetchedAt = statsFetchedAtRef.current[key];
//       return !fetchedAt || Date.now() - fetchedAt > 60000;
//     });
//     if (!staleKeys.length) return;

//     const run = async () => {
//       await new Promise((resolve) => setTimeout(resolve, 600));
//       if (cancelled) return;
//       const batchSize = 3;

//       for (let i = 0; i < staleKeys.length && !cancelled; i += batchSize) {
//         const batch = staleKeys.slice(i, i + batchSize);
//         const results = await Promise.all(
//           batch.map(async (key) => {
//             try {
//               let apiCount = 0;
//               try {
//                 const response = await fetch(
//                   `${backendUrl}/api/activity/${encodeURIComponent(
//                     currentUser.id,
//                   )}/${encodeURIComponent(key)}`,
//                   { cache: "no-store", headers: backendHeaders },
//                 );
//                 const data = await readApiJson(response);
//                 if (response.ok && data?.success) {
//                   apiCount = Math.max(0, Number(data.screenshotCount || 0));
//                 }
//               } catch (error) {
//                 console.warn("Date stats warning:", key, error);
//               }
//               let localCount = 0;
//               try {
//                 const files = await getLocalScreenshots(currentUser.id, key);
//                 localCount = files.length;
//               } catch {
//                 localCount = 0;
//               }
//               statsFetchedAtRef.current[key] = Date.now();
//               return [
//                 key,
//                 { screenshotCount: Math.max(apiCount, localCount) },
//               ] as const;
//             } catch {
//               return null;
//             }
//           }),
//         );

//         if (cancelled) return;
//         const valid = results.filter(
//           (item): item is readonly [string, { screenshotCount: number }] =>
//             item !== null,
//         );
//         if (valid.length) {
//           setDateStats((previous) => {
//             const next = { ...previous };
//             valid.forEach(([key, stats]) => {
//               next[key] = stats;
//             });
//             return next;
//           });
//         }
//         await new Promise((resolve) => setTimeout(resolve, 250));
//       }
//     };
//     void run();
//     return () => {
//       cancelled = true;
//     };
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [statsFetchSignature, currentUser.id, backendUrl]);

//   const historyRows = rangeKeys
//     .map((key) => ({ key, ...getDayInfo(key) }))
//     .filter(
//       (row) =>
//         historyView === "day" ||
//         row.key === selectedDate ||
//         row.seconds > 0 ||
//         row.count > 0,
//     );

//   const rangeTotalSeconds = historyRows.reduce(
//     (sum, row) => sum + row.seconds,
//     0,
//   );
//   const rangeTotalScreenshots = historyRows.reduce(
//     (sum, row) => sum + row.count,
//     0,
//   );
//   const weekTotalSeconds = weekKeys.reduce(
//     (sum, key) => sum + getDayInfo(key).seconds,
//     0,
//   );

//   const rangeLabel = (() => {
//     if (historyView === "day") {
//       return selectedDateObject.toLocaleDateString("en-US", {
//         weekday: "short",
//         month: "short",
//         day: "numeric",
//         year: "numeric",
//       });
//     }
//     if (historyView === "week") {
//       const start = parseDateKey(weekKeys[0]);
//       const end = parseDateKey(weekKeys[6]);
//       return `${start.toLocaleDateString("en-US", {
//         month: "short",
//         day: "numeric",
//       })} – ${end.toLocaleDateString("en-US", {
//         month: "short",
//         day: "numeric",
//         year: "numeric",
//       })}`;
//     }
//     if (historyView === "month") {
//       return selectedDateObject.toLocaleDateString("en-US", {
//         month: "long",
//         year: "numeric",
//       });
//     }
//     return "All time";
//   })();

//   const canGoNext = (() => {
//     if (historyView === "day") {
//       return toDateKey(addDays(selectedDateObject, 1)) <= today;
//     }
//     if (historyView === "week") {
//       return toDateKey(addDays(weekStartObject, 7)) <= today;
//     }
//     if (historyView === "month") {
//       return selectedMonthKey < today.slice(0, 7);
//     }
//     return false;
//   })();

//   const shiftRange = (direction: -1 | 1) => {
//     let nextKey = selectedDate;
//     if (historyView === "day") {
//       nextKey = toDateKey(addDays(selectedDateObject, direction));
//     } else if (historyView === "week") {
//       nextKey = toDateKey(addDays(selectedDateObject, direction * 7));
//     } else if (historyView === "month") {
//       const target = new Date(
//         selectedDateObject.getFullYear(),
//         selectedDateObject.getMonth() + direction,
//         1,
//       );
//       nextKey = toDateKey(target);
//     } else {
//       return;
//     }
//     if (nextKey > today) {
//       nextKey = today;
//     }
//     if (historyView === "month" && nextKey.slice(0, 7) === today.slice(0, 7)) {
//       nextKey = today;
//     }
//     setSelectedDate(nextKey);
//   };

//   // ====================================================
//   // RENDER
//   // ====================================================

//   return (
//     <div className="w-full max-w-7xl mx-auto space-y-6">
//       {/* FLOATING MINI BAR */}
//       <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/95 text-white pl-3 pr-1.5 py-1.5 shadow-xl backdrop-blur">
//         <span
//           aria-hidden="true"
//           className="text-slate-500 text-[10px] leading-none tracking-[-0.15em] select-none"
//         >
//           ⋮⋮
//         </span>
//         <span
//           className={`w-2 h-2 rounded-full shrink-0 ${
//             isTracking && !isPaused
//               ? "bg-emerald-400 animate-pulse"
//               : isTracking
//                 ? "bg-amber-400"
//                 : "bg-slate-500"
//           }`}
//         />
//         <span className="font-mono text-sm font-bold tabular-nums">
//           {formatClock(dayTotalSeconds)}
//         </span>
//         <button
//           type="button"
//           onClick={handleToggleTracking}
//           aria-label={
//             !isTracking
//               ? "Start tracking"
//               : isPaused
//                 ? "Resume tracking"
//                 : "Pause tracking"
//           }
//           title={
//             !isTracking
//               ? "Start tracking"
//               : isPaused
//                 ? "Resume tracking"
//                 : "Pause tracking"
//           }
//           className={`cursor-pointer w-8 h-8 rounded-full flex items-center justify-center text-white transition ${
//             isTracking && !isPaused
//               ? "bg-amber-500 hover:bg-amber-400"
//               : "bg-emerald-600 hover:bg-emerald-500"
//           }`}
//         >
//           {isTracking && !isPaused ? (
//             <Pause className="w-3.5 h-3.5" />
//           ) : (
//             <Play className="w-3.5 h-3.5" />
//           )}
//         </button>
//         {pipSupported && (
//           <button
//             type="button"
//             onClick={() =>
//               pipWindow ? closeFloatingTimer() : void openFloatingTimer()
//             }
//             aria-label="Floating timer"
//             title={
//               pipWindow
//                 ? "Close floating timer"
//                 : "Keep this timer on top of every tab and app"
//             }
//             className={`cursor-pointer h-8 px-3 gap-1.5 rounded-full flex items-center justify-center border transition ${
//               pipWindow
//                 ? "border-indigo-400 text-indigo-300 bg-indigo-950"
//                 : `border-slate-600 text-slate-300 hover:border-indigo-400 ${
//                     isTracking ? "animate-pulse" : ""
//                   }`
//             }`}
//           >
//             <ExternalLink className="w-3.5 h-3.5" />
//             <span className="text-[11px] font-bold whitespace-nowrap">
//               {pipWindow ? "On all screens" : "All screens"}
//             </span>
//           </button>
//         )}
//         {alertSettings.browserNotify &&
//           notificationPermission === "default" && (
//             <button
//               type="button"
//               onClick={() => void requestNotificationPermission()}
//               aria-label="Allow desktop alerts"
//               title="Allow desktop alerts so reminders show on every tab"
//               className="cursor-pointer w-8 h-8 rounded-full flex items-center justify-center border border-amber-500 text-amber-400 hover:bg-amber-950 transition"
//             >
//               <Bell className="w-3.5 h-3.5" />
//             </button>
//           )}
//       </div>

//       {pipWindow &&
//         createPortal(renderFloatingPanel(), pipWindow.document.body)}

//       {/* SCHEDULE ALERT TOASTS */}
//       {scheduleAlerts.length > 0 && (
//         <div
//           className="fixed top-4 right-4 z-[60] w-[calc(100vw-2rem)] max-w-sm space-y-3"
//           role="region"
//           aria-live="assertive"
//           aria-label="Reminders"
//         >
//           {scheduleAlerts.map((alert) => {
//             const tone =
//               alert.id === "complete"
//                 ? "border-rose-400 dark:border-rose-700"
//                 : alert.id === "breakStart"
//                   ? "border-amber-400 dark:border-amber-700"
//                   : "border-indigo-400 dark:border-indigo-700";
//             const iconTone =
//               alert.id === "complete"
//                 ? "text-rose-600"
//                 : alert.id === "breakStart"
//                   ? "text-amber-500"
//                   : "text-indigo-600";
//             return (
//               <div
//                 key={alert.id}
//                 className={`rounded-xl border-2 bg-white dark:bg-slate-900 p-4 shadow-2xl ${tone}`}
//               >
//                 <div className="flex items-start gap-3">
//                   <BellRing className={`w-5 h-5 mt-0.5 shrink-0 ${iconTone}`} />
//                   <div className="flex-1 min-w-0">
//                     <div className="text-sm font-bold">{alert.title}</div>
//                     <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
//                       {alert.message}
//                     </div>
//                   </div>
//                   <button
//                     type="button"
//                     onClick={() => snoozeScheduleAlert(alert.id)}
//                     aria-label="Close reminder"
//                     className="cursor-pointer p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
//                   >
//                     <X className="w-4 h-4" />
//                   </button>
//                 </div>
//                 <div className="mt-3 flex gap-2">
//                   <button
//                     type="button"
//                     onClick={() => void handleScheduleAlertAction(alert)}
//                     className="cursor-pointer flex-1 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
//                   >
//                     {getAlertActionLabel(alert)}
//                   </button>
//                   <button
//                     type="button"
//                     onClick={() => snoozeScheduleAlert(alert.id)}
//                     className="cursor-pointer px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold hover:border-indigo-400"
//                   >
//                     Snooze {ALERT_SNOOZE_MINUTES} min
//                   </button>
//                 </div>
//               </div>
//             );
//           })}
//         </div>
//       )}

//       {/* HEADER */}
//       <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
//         <div className="flex items-center gap-3">
//           <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
//             <Monitor className="w-6 h-6" />
//           </div>
//           <div>
//             <h1 className="text-2xl font-bold">Employee Dashboard</h1>
//             <div className="text-sm text-slate-500">
//               {currentUser.name}
//               {" • "}
//               {currentUser.email}
//             </div>
//           </div>
//         </div>
//         {onLogout && (
//           <button
//             type="button"
//             onClick={onLogout}
//             className="cursor-pointer px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold"
//           >
//             Logout
//           </button>
//         )}
//       </div>

//       {/* TRACKING CARD */}
//       <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-950/20 p-6 space-y-5">
//         <div>
//           <label className="text-xs uppercase font-bold text-slate-500">
//             Currently Working On
//           </label>
//           <input
//             type="text"
//             value={taskName}
//             onChange={(event) => setTaskName(event.target.value)}
//             className="mt-2 w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
//           />
//         </div>

//         <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
//           <div className="flex flex-wrap items-center gap-2">
//             <Camera className="w-4 h-4 text-indigo-600" />
//             <span className="text-xs font-bold">
//               Live Admin Capture Policy:
//             </span>
//             <span className="text-sm font-black text-indigo-600">
//               {policyText}
//             </span>
//             <span className="px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
//               AUTO SYNC
//             </span>
//           </div>
//           <div className="mt-2 text-[11px] text-slate-500">
//             {capturePresetId === "custom"
//               ? "Custom policy selected by Admin."
//               : "Preset policy selected by Admin."}
//             {centralPolicyUpdatedAt
//               ? ` Last updated: ${new Date(
//                   centralPolicyUpdatedAt,
//                 ).toLocaleTimeString()}`
//               : ""}
//           </div>
//         </div>

//         <div className="flex flex-col sm:flex-row gap-3">
//           {!isTracking ? (
//             <button
//               type="button"
//               onClick={handleStartClick}
//               className="cursor-pointer flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
//             >
//               <Play className="w-4 h-4" />
//               Start Tracking
//             </button>
//           ) : (
//             <>
//               {!isPaused ? (
//                 <button
//                   type="button"
//                   onClick={pauseTracking}
//                   className="cursor-pointer flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold"
//                 >
//                   <Pause className="w-4 h-4" />
//                   Pause
//                 </button>
//               ) : (
//                 <button
//                   type="button"
//                   onClick={resumeTracking}
//                   className="cursor-pointer flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
//                 >
//                   <Play className="w-4 h-4" />
//                   Resume
//                 </button>
//               )}
//               <button
//                 type="button"
//                 onClick={stopTracking}
//                 className="cursor-pointer flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold"
//               >
//                 <Square className="w-4 h-4" />
//                 Stop
//               </button>
//             </>
//           )}
//         </div>

//         {isTracking && pipSupported && !pipWindow && (
//           <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
//             <div className="text-xs">
//               <span className="font-bold">
//                 The timer is visible only inside this tab.
//               </span>{" "}
//               Float it to see the timer, reminders and Play / Pause on every tab
//               and app.
//               {pipError && (
//                 <span className="block mt-1 text-amber-600">
//                   Could not open the floating bar: {pipError}
//                 </span>
//               )}
//             </div>
//             <button
//               type="button"
//               onClick={() => void openFloatingTimer()}
//               className="cursor-pointer inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold whitespace-nowrap"
//             >
//               <ExternalLink className="w-3.5 h-3.5" />
//               Float on all screens
//             </button>
//           </div>
//         )}

//         {isTracking && !isPaused && nextCaptureInSec !== null && (
//           <div className="text-xs text-center font-semibold text-slate-600 dark:text-slate-300">
//             Next random screenshot in approximately{" "}
//             <span className="font-mono text-indigo-600">
//               {nextCaptureInSec}s
//             </span>
//           </div>
//         )}
//       </div>

//       {/* SUMMARY */}
//       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//         <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
//           <div className="text-[11px] uppercase font-bold text-slate-500">
//             {historyView === "day"
//               ? selectedDate === today
//                 ? "Today Total Tracked"
//                 : "Daily Total Tracked"
//               : historyView === "week"
//                 ? "Weekly Total Tracked"
//                 : historyView === "month"
//                   ? "Monthly Total Tracked"
//                   : "Overall Total Tracked"}
//           </div>
//           <div className="text-2xl font-black mt-2 text-emerald-600">
//             {loadingHistory && selectedDate !== today
//               ? "Loading..."
//               : formatSecondsToHoursMinutes(rangeTotalSeconds)}
//           </div>
//         </div>
//         <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
//           <div className="text-[11px] uppercase font-bold text-slate-500">
//             {historyView === "day"
//               ? "Selected Date Screenshots"
//               : historyView === "week"
//                 ? "Weekly Screenshots"
//                 : historyView === "month"
//                   ? "Monthly Screenshots"
//                   : "Total Screenshots"}
//           </div>
//           <div className="text-2xl font-black mt-2 text-indigo-600">
//             {loadingHistory ? "..." : rangeTotalScreenshots}
//           </div>
//         </div>
//       </div>

//       {/* STATUS */}
//       <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-4">
//         <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs leading-5">
//           <span>{lastStatus}</span>
//           {isTracking && needsScreenShare && (
//             <button
//               type="button"
//               onClick={() => void reconnectScreenShare()}
//               className="cursor-pointer px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold whitespace-nowrap"
//             >
//               Reconnect screen sharing
//             </button>
//           )}
//         </div>
//         {lastCapturedTime && (
//           <div className="text-slate-500 mt-1 text-xs">
//             Last screenshot: {lastCapturedTime}
//           </div>
//         )}
//       </div>

//       {/* SCHEDULE ALERT SETTINGS */}
//       <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
//         <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
//           <div className="flex items-start gap-3">
//             <Bell className="w-5 h-5 mt-0.5 text-indigo-600" />
//             <div>
//               <h2 className="font-bold">Schedule Alerts</h2>
//               <p className="text-xs text-slate-500 mt-1">
//                 {alertSettings.enabled
//                   ? `Start ${alertSettings.startTime || "--:--"}${
//                       alertSettings.breakEnabled
//                         ? ` • Break ${alertSettings.breakStart || "--:--"}–${
//                             alertSettings.breakEnd || "--:--"
//                           }`
//                         : ""
//                     } • ${formatHoursLabel(
//                       Number(alertSettings.dailyHours) || 0,
//                     )}h work day`
//                   : "Reminders are turned off."}
//               </p>
//             </div>
//           </div>
//           <div className="flex items-center gap-2">
//             <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer">
//               <input
//                 type="checkbox"
//                 checked={alertSettings.enabled}
//                 onChange={(event) =>
//                   updateAlertSetting("enabled", event.target.checked)
//                 }
//                 className="w-4 h-4 accent-indigo-600"
//               />
//               Alerts on
//             </label>
//             <button
//               type="button"
//               onClick={() => setShowAlertSettings((previous) => !previous)}
//               className="cursor-pointer px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold hover:border-indigo-400 transition"
//             >
//               {showAlertSettings ? "Hide" : "Set times"}
//             </button>
//           </div>
//         </div>

//         {alertSettings.enabled && (
//           <div className="mx-5 mb-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-4 space-y-3">
//             <div className="text-xs font-bold">
//               Get reminders on every window and tab
//             </div>
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
//               <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
//                 <div className="min-w-0">
//                   <div className="text-xs font-bold">Popup notification</div>
//                   <div className="text-[11px] text-slate-500 mt-0.5">
//                     {!alertSettings.browserNotify
//                       ? "Turned off. Enable 'Desktop notification' in Set times."
//                       : notificationPermission === "granted"
//                         ? "Popups appear over every window and tab."
//                         : notificationPermission === "denied"
//                           ? "Blocked. Click the lock icon next to the address bar, set Notifications to Allow, then reload."
//                           : notificationPermission === "unsupported"
//                             ? "Not supported in this browser."
//                             : "Allow it once to get popups over every window."}
//                   </div>
//                 </div>
//                 {notificationReady ? (
//                   <span className="text-xs font-bold text-emerald-600 whitespace-nowrap">
//                     ✓ On
//                   </span>
//                 ) : alertSettings.browserNotify &&
//                   notificationPermission === "default" ? (
//                   <button
//                     type="button"
//                     onClick={() => void requestNotificationPermission()}
//                     className="cursor-pointer px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold whitespace-nowrap"
//                   >
//                     Allow
//                   </button>
//                 ) : null}
//               </div>

//               <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
//                 <div className="min-w-0">
//                   <div className="text-xs font-bold">
//                     Floating bar (always on top)
//                   </div>
//                   <div className="text-[11px] text-slate-500 mt-0.5">
//                     {!pipSupported
//                       ? "Not supported in this browser. Use Chrome or Edge."
//                       : pipWindow
//                         ? "The timer and reminders stay above every window."
//                         : "Open it once and it stays above every window."}
//                   </div>
//                 </div>
//                 {pipSupported &&
//                   (pipWindow ? (
//                     <span className="text-xs font-bold text-emerald-600 whitespace-nowrap">
//                       ✓ On
//                     </span>
//                   ) : (
//                     <button
//                       type="button"
//                       onClick={() => void openFloatingTimer()}
//                       className="cursor-pointer px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold whitespace-nowrap"
//                     >
//                       Open
//                     </button>
//                   ))}
//               </div>
//             </div>
//             {pipError && (
//               <div className="text-[11px] text-amber-600">
//                 The floating bar could not open: {pipError}
//               </div>
//             )}
//             <div className="flex flex-wrap items-center gap-3">
//               <button
//                 type="button"
//                 onClick={() => void sendTestReminder()}
//                 className="cursor-pointer px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold hover:border-indigo-400 transition"
//               >
//                 Send test reminder
//               </button>
//               <span className="text-[11px] text-slate-500">
//                 Shows a sample reminder on this page, the floating bar, the tab
//                 title and as a popup. Switch to another window to see it.
//               </span>
//             </div>
//           </div>
//         )}

//         {showAlertSettings && (
//           <div className="px-5 pb-5 pt-1 border-t border-slate-200 dark:border-slate-800 space-y-5">
//             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
//               <label className="block">
//                 <span className="text-[11px] font-bold text-slate-500">
//                   Work start time
//                 </span>
//                 <input
//                   type="time"
//                   value={alertSettings.startTime}
//                   onChange={(event) =>
//                     updateAlertSetting("startTime", event.target.value)
//                   }
//                   className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
//                 />
//                 <span className="block text-[11px] text-slate-500 mt-1">
//                   Reminds you to start tracking.
//                 </span>
//               </label>
//               <label className="block">
//                 <span className="text-[11px] font-bold text-slate-500">
//                   Break starts
//                 </span>
//                 <input
//                   type="time"
//                   value={alertSettings.breakStart}
//                   disabled={!alertSettings.breakEnabled}
//                   onChange={(event) =>
//                     updateAlertSetting("breakStart", event.target.value)
//                   }
//                   className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40"
//                 />
//                 <span className="block text-[11px] text-slate-500 mt-1">
//                   Reminds you to pause.
//                 </span>
//               </label>
//               <label className="block">
//                 <span className="text-[11px] font-bold text-slate-500">
//                   Break ends
//                 </span>
//                 <input
//                   type="time"
//                   value={alertSettings.breakEnd}
//                   disabled={!alertSettings.breakEnabled}
//                   onChange={(event) =>
//                     updateAlertSetting("breakEnd", event.target.value)
//                   }
//                   className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40"
//                 />
//                 <span className="block text-[11px] text-slate-500 mt-1">
//                   Reminds you to resume.
//                 </span>
//               </label>
//               <label className="block">
//                 <span className="text-[11px] font-bold text-slate-500">
//                   Work hours per day
//                 </span>
//                 <input
//                   type="number"
//                   min={1}
//                   max={16}
//                   step={0.5}
//                   value={alertSettings.dailyHours}
//                   onChange={(event) =>
//                     updateAlertSetting(
//                       "dailyHours",
//                       Math.min(16, Math.max(0, Number(event.target.value))),
//                     )
//                   }
//                   className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
//                 />
//                 <span className="block text-[11px] text-slate-500 mt-1">
//                   Reminds you to stop the timer.
//                 </span>
//               </label>
//             </div>
//             <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
//               <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
//                 <input
//                   type="checkbox"
//                   checked={alertSettings.breakEnabled}
//                   onChange={(event) =>
//                     updateAlertSetting("breakEnabled", event.target.checked)
//                   }
//                   className="w-4 h-4 accent-indigo-600"
//                 />
//                 I take a break
//               </label>
//               <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
//                 <input
//                   type="checkbox"
//                   checked={alertSettings.sound}
//                   onChange={(event) =>
//                     updateAlertSetting("sound", event.target.checked)
//                   }
//                   className="w-4 h-4 accent-indigo-600"
//                 />
//                 Play sound
//               </label>
//               {pipSupported && (
//                 <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
//                   <input
//                     type="checkbox"
//                     checked={alertSettings.floatOnStart}
//                     onChange={(event) =>
//                       updateAlertSetting("floatOnStart", event.target.checked)
//                     }
//                     className="w-4 h-4 accent-indigo-600"
//                   />
//                   Floating bar on every tab
//                 </label>
//               )}
//               <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
//                 <input
//                   type="checkbox"
//                   checked={alertSettings.browserNotify}
//                   onChange={(event) =>
//                     updateAlertSetting("browserNotify", event.target.checked)
//                   }
//                   className="w-4 h-4 accent-indigo-600"
//                 />
//                 Desktop notification
//               </label>
//               {alertSettings.browserNotify &&
//                 notificationPermission === "default" && (
//                   <button
//                     type="button"
//                     onClick={() => void requestNotificationPermission()}
//                     className="cursor-pointer px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
//                   >
//                     Allow notifications
//                   </button>
//                 )}
//               {alertSettings.browserNotify &&
//                 notificationPermission === "denied" && (
//                   <span className="text-[11px] text-amber-600">
//                     Notifications are blocked in the browser. Reminders will
//                     still show on this page.
//                   </span>
//                 )}
//             </div>
//             <p className="text-[11px] text-slate-500">
//               Times use this computer's clock. A reminder you close comes back
//               after {ALERT_SNOOZE_MINUTES} minutes if it is still needed.
//             </p>
//           </div>
//         )}
//       </div>

//       {/* TIME TRACKING (DAY / WEEK / MONTH / ALL) */}
//       <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
//         <div className="p-5 border-b border-slate-200 dark:border-slate-800 space-y-4">
//           <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
//             <div>
//               <h2 className="font-bold flex items-center gap-2">
//                 <Calendar className="w-5 h-5 text-indigo-600" />
//                 My Time Tracking
//               </h2>
//               <p className="text-xs text-slate-500 mt-1">
//                 Check your tracked hours by day, week, month or all time.
//               </p>
//             </div>
//             <div
//               role="tablist"
//               aria-label="Time range"
//               className="inline-flex self-start md:self-auto rounded-full border border-slate-300 dark:border-slate-700 overflow-hidden"
//             >
//               {VIEW_MODES.map((mode) => (
//                 <button
//                   key={mode.id}
//                   type="button"
//                   role="tab"
//                   aria-selected={historyView === mode.id}
//                   onClick={() => setHistoryView(mode.id)}
//                   className={`cursor-pointer px-5 py-2 text-sm font-semibold transition ${
//                     historyView === mode.id
//                       ? "bg-indigo-600 text-white"
//                       : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
//                   }`}
//                 >
//                   {mode.label}
//                 </button>
//               ))}
//             </div>
//           </div>

//           <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
//             <div className="flex items-center gap-2">
//               {historyView !== "all" && (
//                 <>
//                   <button
//                     type="button"
//                     onClick={() => shiftRange(-1)}
//                     aria-label="Previous"
//                     className="cursor-pointer p-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-indigo-400 transition"
//                   >
//                     <ChevronLeft className="w-4 h-4" />
//                   </button>
//                   <button
//                     type="button"
//                     onClick={() => shiftRange(1)}
//                     disabled={!canGoNext}
//                     aria-label="Next"
//                     className="cursor-pointer p-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-indigo-400 transition disabled:opacity-40 disabled:cursor-not-allowed"
//                   >
//                     <ChevronRight className="w-4 h-4" />
//                   </button>
//                 </>
//               )}
//               <div className="text-base font-bold px-1">{rangeLabel}</div>
//               {historyView !== "all" && (
//                 <input
//                   type="date"
//                   value={selectedDate}
//                   max={today}
//                   onChange={(event) =>
//                     setSelectedDate(event.target.value || today)
//                   }
//                   aria-label="Pick a date"
//                   className="ml-1 px-2 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
//                 />
//               )}
//               <button
//                 type="button"
//                 onClick={loadDateHistory}
//                 className="cursor-pointer p-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-indigo-400 transition"
//                 title="Refresh"
//                 aria-label="Refresh"
//               >
//                 <RefreshCw
//                   className={`w-4 h-4 ${loadingHistory ? "animate-spin" : ""}`}
//                 />
//               </button>
//             </div>
//           </div>

//           {(historyView === "day" || historyView === "week") && (
//             <div className="overflow-x-auto">
//               <div className="min-w-[640px] grid grid-cols-[repeat(7,minmax(0,1fr))_minmax(120px,1.3fr)] rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
//                 {weekKeys.map((key) => {
//                   const info = getDayInfo(key);
//                   const dateObject = parseDateKey(key);
//                   const isSelected = key === selectedDate;
//                   const isFuture = key > today;
//                   return (
//                     <button
//                       key={key}
//                       type="button"
//                       disabled={isFuture}
//                       onClick={() => setSelectedDate(key)}
//                       className={`text-left px-3 py-2 border-r border-slate-200 dark:border-slate-800 transition disabled:opacity-40 disabled:cursor-not-allowed ${
//                         isSelected
//                           ? "bg-indigo-100 dark:bg-indigo-950/60"
//                           : "hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
//                       }`}
//                     >
//                       <div className="text-xs font-bold">
//                         {dateObject.toLocaleDateString("en-US", {
//                           weekday: "short",
//                         })}{" "}
//                         <span className="font-normal text-slate-500">
//                           {dateObject.getDate()}
//                         </span>
//                       </div>
//                       <div
//                         className={`text-xs mt-0.5 ${
//                           info.seconds > 0
//                             ? "font-bold text-emerald-600"
//                             : "text-slate-400"
//                         }`}
//                       >
//                         {info.seconds > 0 ? formatClock(info.seconds) : "—"}
//                       </div>
//                       <div className="text-[10px] text-slate-500 mt-1">
//                         {info.count} screenshot
//                         {info.count === 1 ? "" : "s"}
//                       </div>
//                     </button>
//                   );
//                 })}
//                 <div className="px-3 py-2 flex items-center justify-end text-sm font-bold bg-slate-50 dark:bg-slate-800/60">
//                   Total: {formatClock(weekTotalSeconds)}
//                 </div>
//               </div>
//             </div>
//           )}

//           {historyView === "month" && (
//             <div className="space-y-3 overflow-x-auto">
//               {monthWeekKeys.map((week, weekIndex) => {
//                 const weekTotal = week.reduce((sum, key) => {
//                   if (!key.startsWith(`${selectedMonthKey}-`)) {
//                     return sum;
//                   }
//                   return sum + getDayInfo(key).seconds;
//                 }, 0);
//                 return (
//                   <div
//                     key={`month-week-${weekIndex}`}
//                     className="min-w-[640px] grid grid-cols-[repeat(7,minmax(0,1fr))_minmax(120px,1.3fr)] rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden"
//                   >
//                     {week.map((key) => {
//                       const dateObject = parseDateKey(key);
//                       const isInMonth = key.startsWith(`${selectedMonthKey}-`);
//                       const isSelected = key === selectedDate;
//                       const isFuture = key > today;
//                       const info = isInMonth
//                         ? getDayInfo(key)
//                         : { seconds: 0, count: 0 };
//                       return (
//                         <button
//                           key={key}
//                           type="button"
//                           disabled={!isInMonth || isFuture}
//                           onClick={() => setSelectedDate(key)}
//                           className={`text-left px-3 py-2 border-r border-slate-200 dark:border-slate-800 transition disabled:cursor-default ${
//                             !isInMonth
//                               ? "opacity-35 bg-slate-50/30 dark:bg-slate-900/30"
//                               : isSelected
//                                 ? "bg-indigo-100 dark:bg-indigo-950/60"
//                                 : "hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
//                           } ${isFuture ? "opacity-40" : ""}`}
//                         >
//                           <div className="text-xs font-bold">
//                             {dateObject.toLocaleDateString("en-US", {
//                               weekday: "short",
//                             })}{" "}
//                             <span className="font-normal text-slate-500">
//                               {dateObject.getDate()}
//                             </span>
//                           </div>
//                           <div
//                             className={`text-xs mt-0.5 ${
//                               info.seconds > 0
//                                 ? "font-bold text-emerald-600"
//                                 : "text-slate-400"
//                             }`}
//                           >
//                             {isInMonth && info.seconds > 0
//                               ? formatClock(info.seconds)
//                               : "—"}
//                           </div>
//                           <div className="text-[10px] text-slate-500 mt-1">
//                             {isInMonth ? info.count : 0} screenshot
//                             {info.count === 1 ? "" : "s"}
//                           </div>
//                         </button>
//                       );
//                     })}
//                     <div className="px-3 py-2 flex items-center justify-end text-sm font-bold bg-slate-50 dark:bg-slate-800/60">
//                       Week {weekIndex + 1}: {formatClock(weekTotal)}
//                     </div>
//                   </div>
//                 );
//               })}
//             </div>
//           )}

//           <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-4 py-3 text-sm">
//             <span className="text-slate-500">
//               {rangeTotalScreenshots} screenshot
//               {rangeTotalScreenshots === 1 ? "" : "s"}
//             </span>
//             <span className="font-bold">
//               {historyView === "day"
//                 ? "Daily Total"
//                 : historyView === "week"
//                   ? "Weekly Total"
//                   : historyView === "month"
//                     ? "Monthly Total"
//                     : "Overall Total"}
//               :{" "}
//               <span className="text-emerald-600">
//                 {loadingHistory && selectedDate !== today
//                   ? "Loading..."
//                   : formatSecondsToHoursMinutes(rangeTotalSeconds)}
//               </span>
//             </span>
//           </div>
//         </div>

//         <div className="px-5 pb-5 pt-2">
//           <div className="flex items-center justify-between gap-3 my-4">
//             <div>
//               <h3 className="font-bold flex items-center gap-2">
//                 <Camera className="w-4 h-4 text-indigo-600" />
//                 Screenshot History
//               </h3>
//               <div className="text-xs text-slate-500 mt-1">{selectedDate}</div>
//             </div>
//             <div className="text-xs font-bold text-indigo-600">
//               {mergedScreenshots.length} captures
//             </div>
//           </div>

//           {mergedScreenshots.length === 0 ? (
//             <div className="py-14 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
//               <Camera className="w-10 h-10 mx-auto text-slate-400 mb-2" />
//               <div className="text-sm font-semibold">No screenshots found</div>
//               <div className="text-xs text-slate-500 mt-1">
//                 No central screenshots are available for {selectedDate}.
//               </div>
//             </div>
//           ) : (
//             <>
//               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
//                 {pagedScreenshots.map((screenshot) => (
//                   <button
//                     key={screenshot.id}
//                     type="button"
//                     onClick={() => setPreviewModal(screenshot)}
//                     className="cursor-pointer text-left rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 hover:border-indigo-400 transition"
//                   >
//                     {(() => {
//                       const source =
//                         screenshot.driveThumbnailLink ||
//                         screenshot.previewDataUrl ||
//                         "";
//                       const displayUrl =
//                         employeeScreenshotUrls[source] ||
//                         (source.startsWith("data:") ||
//                         source.startsWith("blob:")
//                           ? source
//                           : "");
//                       return displayUrl ? (
//                         <img
//                           src={displayUrl}
//                           alt="Screenshot"
//                           className="w-full aspect-video object-cover bg-slate-950"
//                         />
//                       ) : (
//                         <div className="w-full aspect-video bg-slate-950 flex items-center justify-center text-xs text-slate-400">
//                           Loading screenshot...
//                         </div>
//                       );
//                     })()}
//                     <div className="p-3">
//                       <div className="text-xs font-bold">
//                         {screenshot.taskName}
//                       </div>
//                       <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
//                         <Clock className="w-3 h-3" />
//                         {screenshot.timeFormatted || "Saved capture"}
//                       </div>
//                     </div>
//                   </button>
//                 ))}
//               </div>

//               {mergedScreenshots.length > SCREENSHOTS_PER_PAGE && (
//                 <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-3">
//                   <div className="text-xs text-slate-500">
//                     Showing {(currentPage - 1) * SCREENSHOTS_PER_PAGE + 1}
//                     {"–"}
//                     {Math.min(
//                       currentPage * SCREENSHOTS_PER_PAGE,
//                       mergedScreenshots.length,
//                     )}{" "}
//                     of {mergedScreenshots.length}
//                   </div>
//                   <div className="flex flex-wrap items-center justify-center gap-2">
//                     <button
//                       type="button"
//                       disabled={currentPage === 1}
//                       onClick={() =>
//                         setCurrentPage((previous) => Math.max(1, previous - 1))
//                       }
//                       className="cursor-pointer inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:border-indigo-400 transition"
//                     >
//                       <ChevronLeft className="w-4 h-4" />
//                       Prev
//                     </button>
//                     {pageNumbers.map((page) =>
//                       typeof page === "number" ? (
//                         <button
//                           key={page}
//                           type="button"
//                           onClick={() => setCurrentPage(page)}
//                           className={`cursor-pointer min-w-[36px] px-3 py-2 rounded-lg text-xs font-bold border transition ${
//                             currentPage === page
//                               ? "bg-indigo-600 text-white border-indigo-600"
//                               : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 hover:border-indigo-400"
//                           }`}
//                         >
//                           {page}
//                         </button>
//                       ) : (
//                         <span
//                           key={page}
//                           className="px-1 text-xs text-slate-500"
//                         >
//                           …
//                         </span>
//                       ),
//                     )}
//                     <button
//                       type="button"
//                       disabled={currentPage === totalPages}
//                       onClick={() =>
//                         setCurrentPage((previous) =>
//                           Math.min(totalPages, previous + 1),
//                         )
//                       }
//                       className="cursor-pointer inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:border-indigo-400 transition"
//                     >
//                       Next
//                       <ChevronRight className="w-4 h-4" />
//                     </button>
//                   </div>
//                 </div>
//               )}
//             </>
//           )}
//         </div>
//       </div>

//       {/* SCREEN SHARE RECONNECT POPUP */}
//       {isTracking && needsScreenShare && (
//         <div
//           role="dialog"
//           aria-modal="true"
//           aria-labelledby="screen-share-reconnect-title"
//           className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
//         >
//           <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-2xl">
//             <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950">
//               <Monitor className="h-7 w-7 text-indigo-600" />
//             </div>
//             <h2
//               id="screen-share-reconnect-title"
//               className="text-center text-xl font-black text-slate-900 dark:text-white"
//             >
//               Reconnect screen sharing
//             </h2>
//             <p className="mt-3 text-center text-sm leading-6 text-slate-600 dark:text-slate-300">
//               Your timer is still running, but screenshots are paused until you
//               share your screen again. Click below, then choose the screen in
//               your browser's sharing window. A loud alarm will sound after one
//               minute and repeat every minute until sharing reconnects.
//             </p>
//             <button
//               type="button"
//               onClick={() => void reconnectScreenShare()}
//               className="mt-6 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white transition hover:bg-indigo-500"
//             >
//               <Monitor className="h-4 w-4" />
//               Choose screen &amp; reconnect
//             </button>
//             <p className="mt-3 text-center text-xs text-slate-500">
//               Browser security requires you to click this button before the
//               screen-sharing chooser can open.
//             </p>
//           </div>
//         </div>
//       )}

//       {/* PREVIEW */}
//       {previewModal && (
//         <div
//           className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
//           onClick={() => setPreviewModal(null)}
//         >
//           <div
//             className="w-full max-w-6xl"
//             onClick={(event) => event.stopPropagation()}
//           >
//             <div className="flex justify-end mb-2">
//               <button
//                 type="button"
//                 onClick={() => setPreviewModal(null)}
//                 className="cursor-pointer p-2 text-white"
//               >
//                 <X className="w-6 h-6" />
//               </button>
//             </div>
//             <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden">
//               {(() => {
//                 const source =
//                   previewModal.driveThumbnailLink ||
//                   previewModal.previewDataUrl ||
//                   "";
//                 const displayUrl =
//                   employeeScreenshotUrls[source] ||
//                   (source.startsWith("data:") || source.startsWith("blob:")
//                     ? source
//                     : "");
//                 return displayUrl ? (
//                   <img
//                     src={displayUrl}
//                     alt="Screenshot preview"
//                     className="w-full max-h-[80vh] object-contain bg-slate-950"
//                   />
//                 ) : (
//                   <div className="min-h-[320px] flex items-center justify-center bg-slate-950 text-slate-400">
//                     Loading screenshot...
//                   </div>
//                 );
//               })()}
//               <div className="p-4">
//                 <div className="font-bold">{previewModal.taskName}</div>
//                 <div className="text-xs text-slate-500 mt-1">
//                   {previewModal.timeFormatted}
//                 </div>
//               </div>
//             </div>
//           </div>
//         </div>
//       )}

//       {/* HIDDEN VIDEO */}
//       <video
//         ref={screenVideoRef}
//         autoPlay
//         muted
//         playsInline
//         style={{
//           position: "fixed",
//           top: 0,
//           left: 0,
//           width: "2px",
//           height: "2px",
//           opacity: 0.01,
//           pointerEvents: "none",
//           zIndex: -1,
//         }}
//       />
//     </div>
//   );
// };



import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AppUser, ScreenshotLog, StorageSettings } from "../types";
import {
  Play,
  Pause,
  Square,
  Camera,
  Calendar,
  Clock,
  Monitor,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  Bell,
  BellRing,
  ExternalLink,
} from "lucide-react";
import {
  canvasToBlob,
  formatSecondsToHoursMinutes,
  formatTimeString,
  generateThumbnailDataUrl,
  getHourSlotKey,
  getTodayDateKey,
} from "../lib/utils";
import {
  getLocalScreenshots,
  startScreenshotUploadScheduler,
  uploadScreenshotLocally,
} from "../lib/localStorageService";
import { setCachedScreenshot } from "../lib/screenshotCache";

// ======================================================
// BACKEND
// ======================================================

const getBackendUrl = (): string => {
  const configured = import.meta.env.VITE_BACKEND_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  return "https://codesdot-workmonitor.work-nest.workers.dev";
};

// ====================================================
// SCREENSHOT CLOUD UPLOAD WINDOW
// ====================================================

const INDIA_TIME_ZONE = "Asia/Kolkata";
const TRACKING_START_MINUTES = 8 * 60 + 30;
const TRACKING_END_MINUTES = 20 * 60 + 30;

// ====================================================
// GALLERY PAGINATION
// ====================================================

const SCREENSHOTS_PER_PAGE = 12;

const getIndiaMinutes = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: INDIA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value || 0,
  );
  return hour * 60 + minute;
};

const isScreenshotUploadWindowOpen = (date = new Date()) => {
  const minutes = getIndiaMinutes(date);
  return minutes >= TRACKING_START_MINUTES && minutes <= TRACKING_END_MINUTES;
};

// ======================================================
// DATE HELPERS (local-time safe, "YYYY-MM-DD" keys)
// ======================================================

const parseDateKey = (key: string): Date => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const toDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const formatClock = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(
    2,
    "0",
  )}`;
};

// ======================================================
// SCHEDULE ALERTS
// ======================================================

interface AlertSettings {
  enabled: boolean;
  startTime: string;
  breakEnabled: boolean;
  breakStart: string;
  breakEnd: string;
  dailyHours: number;
  browserNotify: boolean;
  sound: boolean;
  floatOnStart: boolean;
}

type ScheduleAlertAction = "start" | "resume" | "pause" | "stop";

interface ScheduleAlert {
  id: "start" | "breakStart" | "complete" | "test";
  title: string;
  message: string;
  action: ScheduleAlertAction;
}

const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  enabled: true,
  startTime: "09:00",
  breakEnabled: true,
  breakStart: "13:00",
  breakEnd: "14:00",
  dailyHours: 8,
  browserNotify: true,
  sound: true,
  floatOnStart: true,
};

const ALERT_SNOOZE_MINUTES = 10;
const MAX_TIMER_CATCHUP_SECONDS = 300;
const MAX_TIMER_GAP_SECONDS = 5;

const toMinutes = (value: string): number => {
  if (!value || !value.includes(":")) {
    return Number.NaN;
  }
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return Number.NaN;
  }
  return hours * 60 + minutes;
};

const formatHoursLabel = (hours: number): string =>
  Number.isInteger(hours) ? `${hours}` : hours.toFixed(1);

const playAlertSound = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) {
      return;
    }
    const context = new AudioCtx();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.15;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.35);
    setTimeout(() => {
      void context.close().catch(() => {});
    }, 600);
  } catch {
    // ignore
  }
};

const ALERT_ACTION_LABEL: Record<ScheduleAlertAction, string> = {
  start: "Start Tracking",
  resume: "Resume",
  pause: "Pause now",
  stop: "Stop timer",
};

const ALERT_ACTION_SHORT_LABEL: Record<ScheduleAlertAction, string> = {
  start: "Start",
  resume: "Resume",
  pause: "Pause",
  stop: "Stop timer",
};

const getAlertActionLabel = (
  alert: { id: string; action: ScheduleAlertAction },
  short = false,
): string =>
  alert.id === "test"
    ? "Got it"
    : (short ? ALERT_ACTION_SHORT_LABEL : ALERT_ACTION_LABEL)[alert.action];

const getScreenshotIdentity = (screenshot: ScreenshotLog): string => {
  const time = new Date(screenshot.timestamp);
  const hasRealTime =
    !Number.isNaN(time.getTime()) &&
    !screenshot.timestamp.endsWith("T00:00:00");
  if (hasRealTime) {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `shot|${toDateKey(time)} ${pad(time.getHours())}:${pad(
      time.getMinutes(),
    )}:${pad(time.getSeconds())}`;
  }
  return (
    screenshot.driveFileId || screenshot.driveThumbnailLink || screenshot.id
  );
};

type HistoryViewMode = "day" | "week" | "month" | "all";

const VIEW_MODES: { id: HistoryViewMode; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "all", label: "All" },
];

// ======================================================
// SAFE JSON
// ======================================================

const readApiJson = async (response: Response) => {
  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text();
  if (!contentType.includes("application/json")) {
    console.warn("Backend returned non-JSON:", raw.slice(0, 150));
    throw new Error(
      response.status === 429
        ? "Backend is rate-limited (429). Please wait a moment and retry."
        : `Backend returned non-JSON response (${response.status}).`,
    );
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error("Backend returned invalid JSON.");
  }
};

// ======================================================
// TYPES
// ======================================================

interface ActivityHistoryRecord {
  dateKey: string;
  totalSeconds: number;
  screenshotCount: number;
}

interface ScreenshotActivityCounts {
  mouseMoves: number;
  mouseClicks: number;
  keyPresses: number;
  // Added: share of tracked seconds in which input was detected (0-100).
  activityPercent?: number;
  activeSeconds?: number;
  trackedSeconds?: number;
}

const calculateActivityPercent = (
  activeSeconds: number,
  trackedSeconds: number,
) =>
  trackedSeconds > 0
    ? Math.min(100, Math.round((activeSeconds / trackedSeconds) * 100))
    : 0;

const normalizeActivityCounts = (
  raw: Partial<ScreenshotActivityCounts> | null | undefined,
): ScreenshotActivityCounts => {
  const activeSeconds = Math.max(0, Number(raw?.activeSeconds) || 0);
  const trackedSeconds = Math.max(0, Number(raw?.trackedSeconds) || 0);
  return {
    mouseMoves: Math.max(0, Number(raw?.mouseMoves) || 0),
    mouseClicks: Math.max(0, Number(raw?.mouseClicks) || 0),
    keyPresses: Math.max(0, Number(raw?.keyPresses) || 0),
    activeSeconds,
    trackedSeconds,
    activityPercent:
      trackedSeconds > 0
        ? calculateActivityPercent(activeSeconds, trackedSeconds)
        : Math.min(100, Math.max(0, Number(raw?.activityPercent) || 0)),
  };
};

// Optional local Windows agent (desktop-agent.cjs). It counts global input
// events only while tracking is active; it never records key names or text.
const GLOBAL_AGENT_URL = "http://127.0.0.1:3210";

const callGlobalActivityAgent = async (
  action: "start" | "pause" | "resume" | "stop" | "snapshot",
): Promise<Partial<ScreenshotActivityCounts> | null> => {
  try {
    const response = await fetch(`${GLOBAL_AGENT_URL}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = await response.json();
    return action === "snapshot" ? data?.counts || null : data;
  } catch {
    return null;
  }
};

const getActivityStorageKey = (
  employeeId: string,
  dateKey: string,
  fileName: string,
) => `wm_screenshot_activity_${employeeId}_${dateKey}_${fileName}`;

const readSavedActivityCounts = (
  employeeId: string,
  dateKey: string,
  fileName: string,
): ScreenshotActivityCounts | undefined => {
  try {
    const raw = localStorage.getItem(
      getActivityStorageKey(employeeId, dateKey, fileName),
    );
    if (!raw) return undefined;
    return normalizeActivityCounts(JSON.parse(raw));
  } catch {
    return undefined;
  }
};

const saveActivityCounts = (
  employeeId: string,
  dateKey: string,
  fileName: string,
  counts: ScreenshotActivityCounts,
) => {
  try {
    localStorage.setItem(
      getActivityStorageKey(employeeId, dateKey, fileName),
      JSON.stringify(counts),
    );
  } catch {
    // Local persistence is a fallback; screenshot capture should continue.
  }
};

interface EmployeeDashboardProps {
  currentUser: AppUser;
  storageSettings: StorageSettings;
  accessToken: string | null;
  onConnectDrive: () => void;
  onNewScreenshot: (log: ScreenshotLog) => void;
  userScreenshots: ScreenshotLog[];
  onLogout?: () => void;
}

// ======================================================
// COMPONENT
// ======================================================

export const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({
  currentUser,
  storageSettings,
  onNewScreenshot,
  userScreenshots,
  onLogout,
}) => {
  const backendUrl = useMemo(() => getBackendUrl(), []);
  const backendHeaders = useMemo(() => ({}), []);

  // ====================================================
  // TRACKER
  // ====================================================

  const [taskName, setTaskName] = useState("Product Design & Implementation");
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [dayTotalSeconds, setDayTotalSeconds] = useState(0);
  const [lastStatus, setLastStatus] = useState("Ready to start tracking");
  const [nextCaptureInSec, setNextCaptureInSec] = useState<number | null>(null);
  const [lastCapturedTime, setLastCapturedTime] = useState("");
  const [needsScreenShare, setNeedsScreenShare] = useState(false);
  // If a refresh interrupted an active session, resume only after the user
  // explicitly reconnects screen sharing. Preserve an already-paused session.
  const resumeAfterScreenShareRef = useRef(false);

  // Two short warning beeps while tracking is active without screen sharing.
  // The first double-beep starts after 60 seconds; it repeats every minute
  // until screen sharing reconnects or tracking stops.
  useEffect(() => {
    if (!isTracking || !needsScreenShare) {
      return;
    }

    let startTimeout: number | null = null;
    let repeatInterval: number | null = null;
    let audioContext: AudioContext | null = null;
    let stopped = false;
    let warningNotification: Notification | null = null;

    const showScreenShareNotification = () => {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") {
        return;
      }
      try {
        warningNotification?.close();
        warningNotification = new Notification("Screen sharing required", {
          body: "Your WorkMonitor timer is running, but screenshots are paused. Return to WorkMonitor and reconnect screen sharing.",
          tag: "workmonitor-screen-share-required",
          requireInteraction: true,
        });
        warningNotification.onclick = () => {
          try {
            window.focus();
            warningNotification?.close();
          } catch {
            // Ignore notification focus errors.
          }
        };
      } catch (error) {
        console.warn("Screen-share warning notification could not be shown:", error);
      }
    };

    const playDoubleBeep = async () => {
      if (stopped) return;

      // A system notification is the background-tab fallback. Its sound depends
      // on browser/OS notification settings; Web Audio is attempted as well.
      showScreenShareNotification();

      try {
        const AudioContextConstructor =
          window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextConstructor) return;

        audioContext = new AudioContextConstructor();
        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }
        if (stopped || !audioContext) {
          await audioContext?.close().catch(() => {});
          audioContext = null;
          return;
        }

        const context = audioContext;
        const startAt = context.currentTime + 0.02;
        // Two brief, clear beeps: "tit-tit", not a continuous siren.
        [0, 0.24].forEach((offset) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const beepStart = startAt + offset;
          oscillator.type = "square";
          oscillator.frequency.setValueAtTime(880, beepStart);
          gain.gain.setValueAtTime(0.0001, beepStart);
          gain.gain.exponentialRampToValueAtTime(0.16, beepStart + 0.015);
          gain.gain.setValueAtTime(0.16, beepStart + 0.13);
          gain.gain.exponentialRampToValueAtTime(0.0001, beepStart + 0.17);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(beepStart);
          oscillator.stop(beepStart + 0.18);
          oscillator.onended = () => {
            oscillator.disconnect();
            gain.disconnect();
          };
        });

        window.setTimeout(() => {
          if (audioContext === context) {
            void context.close().catch(() => {});
            audioContext = null;
          }
        }, 800);
      } catch (error) {
        console.warn("Screen-share warning beep could not play:", error);
        if (audioContext) {
          void audioContext.close().catch(() => {});
          audioContext = null;
        }
      }
    };

    startTimeout = window.setTimeout(() => {
      void playDoubleBeep();
      repeatInterval = window.setInterval(() => {
        void playDoubleBeep();
      }, 60000);
    }, 60000);

    return () => {
      stopped = true;
      if (startTimeout !== null) window.clearTimeout(startTimeout);
      if (repeatInterval !== null) window.clearInterval(repeatInterval);
      warningNotification?.close();
      warningNotification = null;
      if (audioContext) {
        void audioContext.close().catch(() => {});
        audioContext = null;
      }
    };
  }, [isTracking, needsScreenShare]);

  // ====================================================
  // GLOBAL ADMIN POLICY
  // ====================================================

  const [captureWindowSeconds, setCaptureWindowSeconds] = useState(
    Math.max(5, Number(storageSettings.captureIntervalSeconds || 600)),
  );
  const [screenshotsPerWindow, setScreenshotsPerWindow] = useState(5);
  const [capturePresetId, setCapturePresetId] = useState("10m-5");
  const [centralPolicyUpdatedAt, setCentralPolicyUpdatedAt] = useState("");

  // ====================================================
  // HISTORY
  // ====================================================

  const [selectedDate, setSelectedDate] = useState(getTodayDateKey());
  const [historyView, setHistoryView] = useState<HistoryViewMode>("day");
  const [activityHistory, setActivityHistory] = useState<
    ActivityHistoryRecord[]
  >([]);
  const [selectedDateSeconds, setSelectedDateSeconds] = useState(0);
  const [dateStats, setDateStats] = useState<
    Record<string, { screenshotCount: number }>
  >({});
  const statsFetchedAtRef = useRef<Record<string, number>>({});
  const [restoredScreenshots, setRestoredScreenshots] = useState<
    ScreenshotLog[]
  >([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [previewModal, setPreviewModal] = useState<ScreenshotLog | null>(null);

  // ====================================================
  // GALLERY PAGE
  // ====================================================

  const [currentPage, setCurrentPage] = useState(1);
  const [employeeScreenshotUrls, setEmployeeScreenshotUrls] = useState<
    Record<string, string>
  >({});

  // ====================================================
  // SCREEN CAPTURE
  // ====================================================

  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  // Count activity only while tracking is active. Keyboard content is never read
  // or stored; only the number of keydown events is recorded.
  const activityCountsRef = useRef<ScreenshotActivityCounts>({
    mouseMoves: 0,
    mouseClicks: 0,
    keyPresses: 0,
  });
  const lastMousePositionRef = useRef({ x: 0, y: 0, initialized: false });
  // Fallback used only when the Windows activity agent is not running.
  const browserActivityRef = useRef({
    activeSeconds: 0,
    trackedSeconds: 0,
    lastInputAt: 0,
  });
  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!trackingRef.current || pausedRef.current || event.pointerType === "touch") return;

      const last = lastMousePositionRef.current;
      const dx = event.clientX - last.x;
      const dy = event.clientY - last.y;
      if (!last.initialized) {
        last.x = event.clientX;
        last.y = event.clientY;
        last.initialized = true;
        return;
      }

      // Count meaningful movement rather than every tiny pointer event.
      if (Math.abs(dx) + Math.abs(dy) >= 4) {
        activityCountsRef.current.mouseMoves += 1;
        browserActivityRef.current.lastInputAt = Date.now();
        last.x = event.clientX;
        last.y = event.clientY;
      }
    };

    const handleClick = () => {
      if (trackingRef.current && !pausedRef.current) {
        activityCountsRef.current.mouseClicks += 1;
        browserActivityRef.current.lastInputAt = Date.now();
      }
    };

    const handleKeyDown = () => {
      if (trackingRef.current && !pausedRef.current) {
        activityCountsRef.current.keyPresses += 1;
        browserActivityRef.current.lastInputAt = Date.now();
      }
    };

    const activityTimer = window.setInterval(() => {
      if (!trackingRef.current || pausedRef.current) return;
      const browserActivity = browserActivityRef.current;
      browserActivity.trackedSeconds += 1;
      if (
        browserActivity.lastInputAt > 0 &&
        Date.now() - browserActivity.lastInputAt <= 1000
      ) {
        browserActivity.activeSeconds += 1;
      }
    }, 1000);

    window.addEventListener("pointermove", handlePointerMove, { capture: true, passive: true });
    window.addEventListener("click", handleClick, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("click", handleClick, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.clearInterval(activityTimer);
    };
  }, []);

  const captureTimerRef = useRef<number | null>(null);
  const captureInProgressRef = useRef(false);
  const captureScheduleIdRef = useRef(0);
  const countdownRef = useRef<number | null>(null);
  const trackerTimerRef = useRef<number | null>(null);
  const trackerSyncIntervalRef = useRef<number | null>(null);
  const trackingRef = useRef(false);
  const pausedRef = useRef(false);
  const daySecondsRef = useRef(0);
  const sessionSecondsRef = useRef(0);
  const restoredSessionRef = useRef(false);
  const captureWindowRef = useRef(captureWindowSeconds);
  const capturePolicyRefreshAtRef = useRef(0);
  const screenshotCountRef = useRef(screenshotsPerWindow);
  // Tracks whether the app itself paused the timer when the page became hidden.
  const autoPausedForHiddenPageRef = useRef(false);

  // ====================================================
  // AUTO-PAUSE WHEN THE BROWSER PAGE BECOMES HIDDEN
  // ====================================================

  useEffect(() => {
    const handlePageVisibility = () => {
      if (document.visibilityState !== "visible") {
        // Do not override an existing manual pause or pause an inactive timer.
        if (isTracking && !isPaused) {
          autoPausedForHiddenPageRef.current = true;
          setIsPaused(true);
          setLastStatus(
            "Tracking paused because the browser page became hidden. It will resume when the page is visible again.",
          );
        }
        return;
      }

      // Resume only if this visibility handler caused the pause.
      if (autoPausedForHiddenPageRef.current) {
        autoPausedForHiddenPageRef.current = false;
        if (isTracking) {
          setIsPaused(false);
          setLastStatus("Tracking resumed because the browser page is visible again.");
        }
      }
    };

    document.addEventListener("visibilitychange", handlePageVisibility);
    window.addEventListener("pageshow", handlePageVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handlePageVisibility);
      window.removeEventListener("pageshow", handlePageVisibility);
    };
  }, [isTracking, isPaused]);

  // ====================================================
  // KEEP REFS CURRENT
  // ====================================================

  useEffect(() => {
    trackingRef.current = isTracking;
  }, [isTracking]);

  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    daySecondsRef.current = dayTotalSeconds;
  }, [dayTotalSeconds]);

  useEffect(() => {
    sessionSecondsRef.current = sessionSeconds;
  }, [sessionSeconds]);

  useEffect(() => {
    captureWindowRef.current = captureWindowSeconds;
  }, [captureWindowSeconds]);

  useEffect(() => {
    screenshotCountRef.current = screenshotsPerWindow;
  }, [screenshotsPerWindow]);

  // ====================================================
  // LOGIN BOOTSTRAP POLICY
  // ====================================================

  useEffect(() => {
    try {
      const raw = localStorage.getItem("workmonitor_employee_capture_settings");
      if (!raw) {
        return;
      }
      const settings = JSON.parse(raw);
      const newWindow = Math.max(
        5,
        Number(
          settings?.captureWindowSeconds ||
            settings?.captureIntervalSeconds ||
            600,
        ),
      );
      const newCount = Math.max(1, Number(settings?.screenshotsPerWindow || 5));
      const newPreset = String(settings?.presetId || "10m-5");
      setCaptureWindowSeconds(newWindow);
      setScreenshotsPerWindow(newCount);
      setCapturePresetId(newPreset);
      setCentralPolicyUpdatedAt(String(settings?.updatedAt || ""));
      captureWindowRef.current = newWindow;
      screenshotCountRef.current = newCount;
    } catch (error) {
      console.warn("Capture policy bootstrap warning:", error);
    }
  }, []);

  // ====================================================
  // SCHEDULE ALERTS (state + engine)
  // ====================================================

  const alertSettingsKey = `wm_emp_alert_settings_${currentUser.id}`;

  const [alertSettings, setAlertSettings] = useState<AlertSettings>(() => {
    try {
      const raw = localStorage.getItem(
        `wm_emp_alert_settings_${currentUser.id}`,
      );
      if (raw) {
        return {
          ...DEFAULT_ALERT_SETTINGS,
          ...JSON.parse(raw),
        };
      }
    } catch {
      // ignore
    }
    return DEFAULT_ALERT_SETTINGS;
  });

  const [showAlertSettings, setShowAlertSettings] = useState(false);
  const [scheduleAlerts, setScheduleAlerts] = useState<ScheduleAlert[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<string>(
    typeof Notification !== "undefined"
      ? Notification.permission
      : "unsupported",
  );

  const pipSupported =
    typeof window !== "undefined" && "documentPictureInPicture" in window;

  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [pipError, setPipError] = useState("");
  const pipWindowRef = useRef<Window | null>(null);
  const pipOpeningRef = useRef(false);
  const floatDismissedRef = useRef(false);

  const openFloatingTimer = async () => {
    if (!pipSupported || pipWindowRef.current || pipOpeningRef.current) {
      return;
    }
    pipOpeningRef.current = true;
    try {
      // ✅ ફ્લોટિંગ બારની ઉંચાઈ (Height) ઘટાડીને 80 કરવામાં આવી છે
      const floatingWindow: Window = await (
        window as any
      ).documentPictureInPicture.requestWindow({
        width: 380,
        height: 80,
      });
      floatingWindow.document.title = "WorkMonitor Timer";
      floatingWindow.document.documentElement.style.background = "#0b1020";
      floatingWindow.document.body.style.margin = "0";
      floatingWindow.document.body.style.background = "#0b1020";
      floatingWindow.addEventListener("pagehide", () => {
        floatDismissedRef.current = true;
        pipWindowRef.current = null;
        setPipWindow(null);
      });
      floatDismissedRef.current = false;
      pipWindowRef.current = floatingWindow;
      setPipError("");
      setPipWindow(floatingWindow);
    } catch (error) {
      console.warn("Floating timer could not open:", error);
      setPipError(error instanceof Error ? error.message : String(error));
    } finally {
      pipOpeningRef.current = false;
    }
  };

  const closeFloatingTimer = () => {
    floatDismissedRef.current = true;
    try {
      pipWindowRef.current?.close();
    } catch {
      // ignore
    }
    pipWindowRef.current = null;
    setPipWindow(null);
  };

  useEffect(() => {
    return () => {
      try {
        pipWindowRef.current?.close();
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    if (!pipSupported || pipWindow || !alertSettings.floatOnStart) {
      return;
    }
    const handleClick = () => {
      if (!floatDismissedRef.current) {
        void openFloatingTimer();
      }
    };
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, [pipSupported, pipWindow, alertSettings.floatOnStart]);

  useEffect(() => {
    if (
      !pipSupported ||
      !isTracking ||
      !alertSettings.floatOnStart ||
      typeof navigator === "undefined" ||
      !("mediaSession" in navigator)
    ) {
      return;
    }
    try {
      (navigator.mediaSession as any).setActionHandler(
        "enterpictureinpicture",
        () => {
          if (!floatDismissedRef.current) {
            void openFloatingTimer();
          }
        },
      );
    } catch {
      // ignore
    }
    return () => {
      try {
        (navigator.mediaSession as any).setActionHandler(
          "enterpictureinpicture",
          null,
        );
      } catch {
        // ignore
      }
    };
  }, [pipSupported, isTracking, alertSettings.floatOnStart]);

  const alertSettingsRef = useRef<AlertSettings>(alertSettings);
  const openNotificationsRef = useRef<Record<string, Notification>>({});
  const scheduleAlertsRef = useRef<ScheduleAlert[]>([]);
  const alertSnoozeRef = useRef<Record<string, number>>({});
  const scheduleAlertChannelRef = useRef<BroadcastChannel | null>(null);
  const scheduleAlertClientIdRef = useRef(
    `${currentUser.id}-${Math.random().toString(36).slice(2)}`,
  );
  const scheduleAlertStorageKey = `wm_emp_schedule_alerts_${currentUser.id}`;

  const publishScheduleAlertState = (
    alerts: ScheduleAlert[],
    snoozes: Record<string, number> = alertSnoozeRef.current,
  ) => {
    const payload = {
      alerts,
      snoozes,
      updatedAt: Date.now(),
      sourceId: scheduleAlertClientIdRef.current,
    };
    try {
      localStorage.setItem(scheduleAlertStorageKey, JSON.stringify(payload));
    } catch {
      // ignore
    }
    try {
      scheduleAlertChannelRef.current?.postMessage(payload);
    } catch {
      // ignore
    }
  };

  const applyScheduleAlertState = (
    alerts: ScheduleAlert[],
    snoozes: Record<string, number> = {},
    showBrowserNotification = false,
  ) => {
    const now = Date.now();
    alertSnoozeRef.current = {
      ...snoozes,
    };
    const visibleAlerts = alerts.filter(
      (alert) => now >= Number(alertSnoozeRef.current[alert.id] || 0),
    );
    const previousIds = new Set(
      scheduleAlertsRef.current.map((alert) => alert.id),
    );
    scheduleAlertsRef.current = visibleAlerts;
    setScheduleAlerts(visibleAlerts);

    if (showBrowserNotification) {
      const config = alertSettingsRef.current;
      visibleAlerts
        .filter((alert) => !previousIds.has(alert.id))
        .forEach((alert) => {
          showSystemNotification(alert);
          if (config.sound) {
            playAlertSound();
          }
        });
    }
  };

  const dayBaseRef = useRef(0);
  const sessionBaseRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);
  const lastTickMsRef = useRef(Date.now());
  const originalTitleRef = useRef("Employee Time Tracker");

  useEffect(() => {
    alertSettingsRef.current = alertSettings;
    try {
      localStorage.setItem(alertSettingsKey, JSON.stringify(alertSettings));
    } catch {
      // ignore
    }
  }, [alertSettings, alertSettingsKey]);

  const updateAlertSetting = <K extends keyof AlertSettings>(
    key: K,
    value: AlertSettings[K],
  ) => {
    alertSnoozeRef.current = {};
    setAlertSettings((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const requestNotificationPermission = async () => {
    if (typeof Notification === "undefined") {
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setNotificationPermission(result);
    } catch {
      // ignore
    }
  };

  // ✅ આ ફંક્શન બ્રાઉઝરની સિસ્ટમ પોપઅપ (Notification) બતાવે છે જે દરેક વિન્ડો ઉપર આવે છે
  const showSystemNotification = (alert: {
    id: string;
    title: string;
    message: string;
    action: ScheduleAlertAction;
  }) => {
    const config = alertSettingsRef.current;
    if (
      !config.browserNotify ||
      typeof Notification === "undefined" ||
      Notification.permission !== "granted"
    ) {
      return;
    }
    const tag = `wm-alert-${alert.id}`;
    try {
      const notification = new Notification(alert.title, {
        body: `${alert.message} Click to open WorkMonitor.`,
        tag,
        requireInteraction: true,
      });
      notification.onclick = () => {
        try {
          window.focus();
          notification.close();
        } catch {
          // ignore
        }
      };
      openNotificationsRef.current[tag] = notification;
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    (["start", "breakStart", "complete", "test"] as const).forEach((id) => {
      const tag = `wm-alert-${id}`;
      if (
        !scheduleAlerts.some((alert) => alert.id === id) &&
        openNotificationsRef.current[tag]
      ) {
        try {
          openNotificationsRef.current[tag].close();
        } catch {
          // ignore
        }
        delete openNotificationsRef.current[tag];
      }
    });
  }, [scheduleAlerts]);

  useEffect(() => {
    if (
      !alertSettings.browserNotify ||
      notificationPermission !== "default" ||
      typeof Notification === "undefined"
    ) {
      return;
    }
    let timer: number | undefined;
    const handleClick = () => {
      timer = window.setTimeout(() => {
        void requestNotificationPermission();
      }, 800);
    };
    document.addEventListener("click", handleClick, { once: true });
    return () => {
      document.removeEventListener("click", handleClick);
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [alertSettings.browserNotify, notificationPermission]);

  useEffect(() => {
    if (scheduleAlerts.length > 0 && pipWindowRef.current) {
      try {
        pipWindowRef.current.focus();
      } catch {
        // ignore
      }
    }
  }, [scheduleAlerts.length]);

  const sendTestReminder = async () => {
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      await requestNotificationPermission();
    }
    const testAlert: ScheduleAlert = {
      id: "test",
      title: "Test reminder",
      message: "This is how reminders look. It shows on every window.",
      action: "start",
    };
    const next = [
      ...scheduleAlertsRef.current.filter((alert) => alert.id !== "test"),
      testAlert,
    ];
    scheduleAlertsRef.current = next;
    setScheduleAlerts(next);
    publishScheduleAlertState(next, alertSnoozeRef.current);
    showSystemNotification(testAlert);
    if (alertSettingsRef.current.sound) {
      playAlertSound();
    }
    window.setTimeout(() => {
      if (scheduleAlertsRef.current.some((alert) => alert.id === "test")) {
        removeScheduleAlert("test");
        publishScheduleAlertState(
          scheduleAlertsRef.current,
          alertSnoozeRef.current,
        );
      }
    }, 20000);
  };

  const removeScheduleAlert = (id: ScheduleAlert["id"]) => {
    const next = scheduleAlertsRef.current.filter((alert) => alert.id !== id);
    scheduleAlertsRef.current = next;
    setScheduleAlerts(next);
  };

  const snoozeScheduleAlert = (id: ScheduleAlert["id"]) => {
    alertSnoozeRef.current[id] = Date.now() + ALERT_SNOOZE_MINUTES * 60 * 1000;
    removeScheduleAlert(id);
    publishScheduleAlertState(
      scheduleAlertsRef.current,
      alertSnoozeRef.current,
    );
  };

  useEffect(() => {
    const storageKey = scheduleAlertStorageKey;
    let channel: BroadcastChannel | null = null;

    const loadStoredState = () => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) {
          return;
        }
        const saved = JSON.parse(raw);
        if (Array.isArray(saved?.alerts)) {
          applyScheduleAlertState(
            saved.alerts as ScheduleAlert[],
            saved?.snoozes && typeof saved.snoozes === "object"
              ? saved.snoozes
              : {},
            true,
          );
        }
      } catch {
        // ignore
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey || !event.newValue) {
        return;
      }
      try {
        const saved = JSON.parse(event.newValue);
        if (saved?.sourceId === scheduleAlertClientIdRef.current) {
          return;
        }
        if (Array.isArray(saved?.alerts)) {
          applyScheduleAlertState(
            saved.alerts as ScheduleAlert[],
            saved?.snoozes && typeof saved.snoozes === "object"
              ? saved.snoozes
              : {},
            true,
          );
        }
      } catch {
        // ignore
      }
    };

    try {
      if ("BroadcastChannel" in window) {
        channel = new BroadcastChannel(
          `workmonitor-schedule-alerts-${currentUser.id}`,
        );
        scheduleAlertChannelRef.current = channel;
        channel.onmessage = (event) => {
          const data = event.data;
          if (!data || data.sourceId === scheduleAlertClientIdRef.current) {
            return;
          }
          if (data.type === "request-state") {
            publishScheduleAlertState(
              scheduleAlertsRef.current,
              alertSnoozeRef.current,
            );
            return;
          }
          if (Array.isArray(data.alerts)) {
            applyScheduleAlertState(
              data.alerts as ScheduleAlert[],
              data.snoozes && typeof data.snoozes === "object"
                ? data.snoozes
                : {},
              true,
            );
          }
        };
      }
    } catch {
      scheduleAlertChannelRef.current = null;
    }

    window.addEventListener("storage", handleStorage);
    loadStoredState();

    try {
      channel?.postMessage({
        type: "request-state",
        sourceId: scheduleAlertClientIdRef.current,
      });
    } catch {
      // ignore
    }

    return () => {
      window.removeEventListener("storage", handleStorage);
      if (channel) {
        channel.close();
      }
      if (scheduleAlertChannelRef.current === channel) {
        scheduleAlertChannelRef.current = null;
      }
    };
  }, [currentUser.id]);

  useEffect(() => {
    const syncSharedScheduleAlerts = () => {
      try {
        const raw = localStorage.getItem(scheduleAlertStorageKey);
        if (!raw) {
          return;
        }
        const saved = JSON.parse(raw);
        if (Array.isArray(saved?.alerts)) {
          applyScheduleAlertState(
            saved.alerts as ScheduleAlert[],
            saved?.snoozes && typeof saved.snoozes === "object"
              ? saved.snoozes
              : {},
            true,
          );
        }
      } catch {
        // ignore
      }
    };
    syncSharedScheduleAlerts();
    const intervalId = window.setInterval(syncSharedScheduleAlerts, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [scheduleAlertStorageKey]);

  useEffect(() => {
    const evaluateAlerts = () => {
      const config = alertSettingsRef.current;
      if (!config.enabled) {
        if (scheduleAlertsRef.current.length > 0) {
          scheduleAlertsRef.current = [];
          setScheduleAlerts([]);
          publishScheduleAlertState([], alertSnoozeRef.current);
        }
        return;
      }

      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const startMinutes = toMinutes(config.startTime);
      const breakStartMinutes = toMinutes(config.breakStart);
      const breakEndMinutes = toMinutes(config.breakEnd);
      const hasBreak =
        config.breakEnabled &&
        !Number.isNaN(breakStartMinutes) &&
        !Number.isNaN(breakEndMinutes) &&
        breakEndMinutes > breakStartMinutes;
      const breakLength = hasBreak ? breakEndMinutes - breakStartMinutes : 0;
      const dailyHours = Math.max(0.5, Number(config.dailyHours) || 8);
      const goalSeconds = dailyHours * 3600;
      const tracking = trackingRef.current;
      const paused = pausedRef.current;
      const goalReached = daySecondsRef.current >= goalSeconds;
      const inBreak =
        hasBreak &&
        nowMinutes >= breakStartMinutes &&
        nowMinutes < breakEndMinutes;
      const workEndMinutes = Number.isNaN(startMinutes)
        ? 24 * 60
        : startMinutes + dailyHours * 60 + breakLength + 60;

      const wanted: ScheduleAlert[] = [];

      if (goalReached && tracking) {
        wanted.push({
          id: "complete",
          title: "Daily work hours complete",
          message: `You have tracked ${formatHoursLabel(
            dailyHours,
          )} hours today. Please stop the timer.`,
          action: "stop",
        });
      } else if (inBreak && tracking && !paused) {
        wanted.push({
          id: "breakStart",
          title: "Break time",
          message: "It is break time. Pause tracking while you are away.",
          action: "pause",
        });
      } else if (
        !inBreak &&
        !Number.isNaN(startMinutes) &&
        nowMinutes >= startMinutes &&
        nowMinutes < workEndMinutes &&
        !goalReached &&
        (!tracking || paused)
      ) {
        const afterBreak =
          hasBreak &&
          nowMinutes >= breakEndMinutes &&
          nowMinutes < breakEndMinutes + 30;
        wanted.push({
          id: "start",
          title: afterBreak
            ? "Break is over"
            : paused
              ? "Tracking is paused"
              : "Tracking is not running",
          message: afterBreak
            ? paused
              ? "Welcome back! Resume tracking to continue your work."
              : "Welcome back! Start tracking to continue your work."
            : paused
              ? "Resume tracking to keep logging your time."
              : "Your work time has started. Start tracking to log your hours.",
          action: paused ? "resume" : "start",
        });
      }

      const current = scheduleAlertsRef.current;
      if (!tracking && current.length > 0) {
        return;
      }

      const kept = current
        .filter(
          (alert) =>
            alert.id === "test" || wanted.some((item) => item.id === alert.id),
        )
        .map((alert) =>
          alert.id === "test"
            ? alert
            : (wanted.find((item) => item.id === alert.id) as ScheduleAlert),
        );

      const additions = wanted.filter(
        (item) =>
          !kept.some((alert) => alert.id === item.id) &&
          Date.now() >= (alertSnoozeRef.current[item.id] || 0),
      );

      const next = [...kept, ...additions];

      if (JSON.stringify(next) === JSON.stringify(current)) {
        return;
      }

      scheduleAlertsRef.current = next;
      setScheduleAlerts(next);
      publishScheduleAlertState(next, alertSnoozeRef.current);

      additions.forEach((item) => {
        showSystemNotification(item);
        if (config.sound) {
          playAlertSound();
        }
      });
    };

    evaluateAlerts();
    const intervalId = window.setInterval(evaluateAlerts, 5000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [alertSettings, isTracking, isPaused]);

  // ====================================================
  // LOCAL TIMER STORAGE
  // ====================================================

  const timerStorageKey =
    `wm_emp_timer_` + `${currentUser.id}_` + `${getTodayDateKey()}`;

  const readSavedTimer = (key: string) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const [initialSavedTimer] = useState<{ key: string; data: any }>(() => ({
    key: timerStorageKey,
    data: readSavedTimer(timerStorageKey),
  }));

  const skipFirstTimerSaveRef = useRef(true);

  useEffect(() => {
    try {
      const saved =
        initialSavedTimer.key === timerStorageKey
          ? initialSavedTimer.data
          : readSavedTimer(timerStorageKey);

      if (!saved) {
        return;
      }

      const savedDay = Math.max(
        0,
        Math.floor(Number(saved?.dayTotalSeconds) || 0),
      );
      const savedSession = Math.max(
        0,
        Math.floor(Number(saved?.sessionSeconds) || 0),
      );
      const wasTracking = Boolean(saved?.isTracking);
      const wasPaused = Boolean(saved?.isPaused);

      if (saved?.taskName) {
        setTaskName(saved.taskName);
      }

      // A page refresh must pause the timer immediately. Do not count the time
      // spent refreshing or choosing a screen; resume only after screen share
      // reconnects successfully.
      if (wasTracking) {
        daySecondsRef.current = savedDay;
        sessionSecondsRef.current = savedSession;
        trackingRef.current = true;
        pausedRef.current = true;
        resumeAfterScreenShareRef.current = !wasPaused;
        setDayTotalSeconds(savedDay);
        setSessionSeconds(savedSession);
        setIsTracking(true);
        setIsPaused(true);
        setNeedsScreenShare(true);
        setLastStatus(
          wasPaused
            ? "Page refreshed. Tracking remains paused. Reconnect screen sharing when ready."
            : "Page refreshed. Timer paused. Reconnect screen sharing to resume tracking and screenshots.",
        );
        return;
      }

      setDayTotalSeconds(savedDay);
      daySecondsRef.current = savedDay;

      if (typeof saved?.sessionSeconds === "number") {
        setSessionSeconds(savedSession);
        if (wasTracking && savedSession > 0) {
          restoredSessionRef.current = true;
          setLastStatus(
            "Previous tracking time restored. Click Start Tracking to continue.",
          );
        }
      }
    } catch (error) {
      console.warn("Timer restore warning:", error);
    }
  }, [timerStorageKey]);

  useEffect(() => {
    if (skipFirstTimerSaveRef.current) {
      skipFirstTimerSaveRef.current = false;
      return;
    }
    try {
      localStorage.setItem(
        timerStorageKey,
        JSON.stringify({
          dayTotalSeconds,
          sessionSeconds,
          taskName,
          isTracking,
          isPaused,
          updatedAt: Date.now(),
        }),
      );
    } catch {
      // ignore
    }
  }, [
    timerStorageKey,
    dayTotalSeconds,
    sessionSeconds,
    taskName,
    isTracking,
    isPaused,
  ]);

  useEffect(() => {
    const persistNow = () => {
      try {
        if (!trackingRef.current) {
          return;
        }
        const saved = readSavedTimer(timerStorageKey);
        if (!saved?.isTracking) {
          return;
        }
        localStorage.setItem(
          timerStorageKey,
          JSON.stringify({
            ...saved,
            dayTotalSeconds: Math.max(
              Number(saved.dayTotalSeconds) || 0,
              daySecondsRef.current,
            ),
            sessionSeconds: Math.max(
              Number(saved.sessionSeconds) || 0,
              sessionSecondsRef.current,
            ),
            updatedAt: Date.now(),
          }),
        );
      } catch {
        // ignore
      }
    };
    window.addEventListener("pagehide", persistNow);
    window.addEventListener("beforeunload", persistNow);
    return () => {
      window.removeEventListener("pagehide", persistNow);
      window.removeEventListener("beforeunload", persistNow);
    };
  }, [timerStorageKey]);

  // ====================================================
  // CENTRAL TRACKER SYNC
  // ====================================================

  const syncTrackerTime = async (seconds = daySecondsRef.current) => {
    try {
      const response = await fetch(`${backendUrl}/api/tracker-time`, {
        method: "POST",
        headers: {
          ...backendHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: currentUser.id,
          employeeName: currentUser.name,
          dateKey: getTodayDateKey(),
          totalSeconds: Math.max(0, Math.floor(seconds)),
        }),
      });

      const data = await readApiJson(response);
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Tracker sync failed");
      }
      return Number(data.totalSeconds || seconds);
    } catch (error) {
      console.warn("Tracker sync warning:", error);
      return seconds;
    }
  };

  // ====================================================
  // TIMER
  // ====================================================

  useEffect(() => {
    const tick = () => {
      const segmentStart = segmentStartRef.current;
      if (segmentStart === null) {
        return;
      }
      const now = Date.now();
      const gap = now - lastTickMsRef.current;
      if (gap > MAX_TIMER_GAP_SECONDS * 1000) {
  segmentStartRef.current = now - 1000;
}
      lastTickMsRef.current = now;
      const elapsed = Math.max(
        0,
        Math.floor((now - (segmentStartRef.current as number)) / 1000),
      );
      const nextDay = dayBaseRef.current + elapsed;
      const nextSession = sessionBaseRef.current + elapsed;
      setDayTotalSeconds((previous) =>
        previous === nextDay ? previous : nextDay,
      );
      setSessionSeconds((previous) =>
        previous === nextSession ? previous : nextSession,
      );
    };

    let worker: Worker | null = null;
    let workerUrl = "";

    const startFallbackInterval = () => {
      if (trackerTimerRef.current === null) {
        trackerTimerRef.current = window.setInterval(tick, 250);
      }
    };

    if (isTracking && !isPaused) {
      dayBaseRef.current = daySecondsRef.current;
      sessionBaseRef.current = sessionSecondsRef.current;
      segmentStartRef.current = Date.now();
      lastTickMsRef.current = segmentStartRef.current;

      try {
        workerUrl = URL.createObjectURL(
          new Blob(["setInterval(function(){postMessage(1)},250)"], {
            type: "application/javascript",
          }),
        );
        worker = new Worker(workerUrl);
        worker.onmessage = tick;
        worker.onerror = () => {
          startFallbackInterval();
        };
      } catch {
        startFallbackInterval();
      }
      document.addEventListener("visibilitychange", tick);
    }

    return () => {
      document.removeEventListener("visibilitychange", tick);
      tick();
      if (worker) {
        worker.terminate();
        worker = null;
      }
      if (workerUrl) {
        URL.revokeObjectURL(workerUrl);
        workerUrl = "";
      }
      segmentStartRef.current = null;
      if (trackerTimerRef.current) {
        clearInterval(trackerTimerRef.current);
        trackerTimerRef.current = null;
      }
    };
  }, [isTracking, isPaused]);


  // ====================================================
  // TIMER — sleep / browser suspension safe
  // ====================================================

  useEffect(() => {
    let worker: Worker | null = null;
    let workerUrl = "";
    let fallbackTimer: number | null = null;
    let suspended = document.visibilityState !== "visible";
    let lastTick = Date.now();

    const tick = () => {
      const now = Date.now();
      const gap = now - lastTick;
      lastTick = now;

      const segmentStart = segmentStartRef.current;

      if (segmentStart === null || suspended) {
        return;
      }

      // Do not count a long gap caused by system sleep,
      // browser suspension, or a throttled background tab.
      if (gap > MAX_TIMER_GAP_SECONDS * 1000) {
        segmentStartRef.current = now;
        dayBaseRef.current = daySecondsRef.current;
        sessionBaseRef.current = sessionSecondsRef.current;
        return;
      }

      const elapsed = Math.max(
        0,
        Math.floor((now - segmentStartRef.current) / 1000),
      );

      const nextDay = dayBaseRef.current + elapsed;
      const nextSession = sessionBaseRef.current + elapsed;

      setDayTotalSeconds((previous) =>
        previous === nextDay ? previous : nextDay,
      );

      setSessionSeconds((previous) =>
        previous === nextSession ? previous : nextSession,
      );
    };

    const handleVisibilityChange = () => {
      const now = Date.now();
      const isHidden = document.visibilityState !== "visible";

      if (isHidden) {
        if (!suspended) {
          tick();
          suspended = true;
        }
        lastTick = now;
        return;
      }

      if (suspended) {
        suspended = false;
        lastTick = now;

        // Resume from the last saved total; never count the
        // time spent asleep or suspended.
        dayBaseRef.current = daySecondsRef.current;
        sessionBaseRef.current = sessionSecondsRef.current;
        segmentStartRef.current = now;
      }
    };

    const handlePageShow = () => {
      const now = Date.now();
      suspended = document.visibilityState !== "visible";
      lastTick = now;

      if (!suspended && segmentStartRef.current !== null) {
        dayBaseRef.current = daySecondsRef.current;
        sessionBaseRef.current = sessionSecondsRef.current;
        segmentStartRef.current = now;
      }
    };

    if (isTracking && !isPaused) {
      const now = Date.now();

      suspended = document.visibilityState !== "visible";
      lastTick = now;
      dayBaseRef.current = daySecondsRef.current;
      sessionBaseRef.current = sessionSecondsRef.current;
      segmentStartRef.current = suspended ? null : now;

      try {
        workerUrl = URL.createObjectURL(
          new Blob(["setInterval(function(){postMessage(1)},250)"], {
            type: "application/javascript",
          }),
        );

        worker = new Worker(workerUrl);
        worker.onmessage = tick;
        worker.onerror = () => {
          if (fallbackTimer === null) {
            fallbackTimer = window.setInterval(tick, 250);
          }
        };
      } catch {
        fallbackTimer = window.setInterval(tick, 250);
      }

      document.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("pageshow", handlePageShow);
      window.addEventListener("focus", handlePageShow);
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handlePageShow);

      if (worker) {
        worker.terminate();
        worker = null;
      }

      if (workerUrl) {
        URL.revokeObjectURL(workerUrl);
      }

      if (fallbackTimer !== null) {
        window.clearInterval(fallbackTimer);
      }

      segmentStartRef.current = null;

      if (trackerTimerRef.current) {
        clearInterval(trackerTimerRef.current);
        trackerTimerRef.current = null;
      }
    };
  }, [isTracking, isPaused]);


  // ====================================================
  // BROWSER TAB TITLE
  // ====================================================
  useEffect(() => {
    const baseTitle = "Employee Time Tracker";

    const firstAlertTitle = scheduleAlerts[0]?.title || "";
    if (!firstAlertTitle) {
      document.title = baseTitle;
      return;
    }

    const alertTitle = `🔔 ${firstAlertTitle}`;
    let showAlert = true;
    document.title = alertTitle;

    const intervalId = window.setInterval(() => {
      showAlert = !showAlert;
      document.title = showAlert ? alertTitle : baseTitle;
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
      document.title = baseTitle;
    };
  }, [scheduleAlerts]);

  // ====================================================
  // PERIODIC CENTRAL TRACKER SYNC
  // ====================================================

  useEffect(() => {
    if (!isTracking || isPaused) {
      if (trackerSyncIntervalRef.current !== null) {
        window.clearInterval(trackerSyncIntervalRef.current);
        trackerSyncIntervalRef.current = null;
      }
      return;
    }

    trackerSyncIntervalRef.current = window.setInterval(() => {
      if (trackingRef.current && !pausedRef.current) {
        void syncTrackerTime(daySecondsRef.current);
      }
    }, 60 * 1000);

    return () => {
      if (trackerSyncIntervalRef.current !== null) {
        window.clearInterval(trackerSyncIntervalRef.current);
        trackerSyncIntervalRef.current = null;
      }
    };
  }, [isTracking, isPaused]);

  // ====================================================
  // SCREEN SHARE
  // ====================================================

  const initScreenStream = async () => {
    try {
      if (
        !window.isSecureContext ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getDisplayMedia !== "function"
      ) {
        throw new Error("Screen capture requires HTTPS.");
      }

      if (screenStreamRef.current?.active) {
        return screenStreamRef.current;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: "monitor",
            frameRate: { ideal: 5, max: 15 },
          },
          audio: false,
          monitorTypeSurfaces: "include",
          selfBrowserSurface: "exclude",
          surfaceSwitching: "exclude",
          preferCurrentTab: false,
        } as any);
      } catch {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          clearCaptureTimers();
          captureInProgressRef.current = false;
          screenStreamRef.current = null;
          if (screenVideoRef.current) {
            screenVideoRef.current.srcObject = null;
          }
          setNeedsScreenShare(true);
          setNextCaptureInSec(null);
          if (trackingRef.current && !pausedRef.current) {
            setLastStatus(
              "Screen capture permission required. Reconnect screen sharing to continue screenshots.",
            );
          } else {
            setLastStatus("Screen sharing stopped.");
          }
        };
      }

      screenStreamRef.current = stream;
      setNeedsScreenShare(false);

      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream;
        await screenVideoRef.current.play().catch(() => {});
      }
      return stream;
    } catch (error: any) {
      console.error("Screen permission error:", error);
      setNeedsScreenShare(true);
      setLastStatus(
        `Screen capture permission required: ${error?.message || "Cancelled"}`,
      );
      return null;
    }
  };

  // ====================================================
  // CAPTURE CANVAS
  // ====================================================

  const captureCurrentScreen = async (stream: MediaStream) => {
    const video = screenVideoRef.current;
    if (!video) return null;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    await video.play().catch(() => {});

    let attempts = 0;
    while ((!video.videoWidth || !video.videoHeight) && attempts < 50) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (attempts % 5 === 0) {
        await video.play().catch(() => {});
      }
      attempts++;
    }

    if (!video.videoWidth || !video.videoHeight) {
      throw new Error("Screen frame is not ready.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error("Canvas unavailable.");
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  };

  // ====================================================
  // SCREENSHOT UPLOAD
  // ====================================================

  const captureAndUpload = async () => {
    if (!trackingRef.current || pausedRef.current) {
      return;
    }
    if (captureInProgressRef.current) {
      console.warn(
        "Screenshot capture skipped: another capture is already in progress.",
      );
      return;
    }

    captureInProgressRef.current = true;

    try {
      setLastStatus("Capturing screenshot...");
      const stream = await initScreenStream();
      if (!stream) {
        setNeedsScreenShare(true);
        return;
      }

      if (!trackingRef.current || pausedRef.current) return;

      const canvas = await captureCurrentScreen(stream);
      if (!canvas) return;
      if (!trackingRef.current || pausedRef.current) return;

      const format = storageSettings.screenshotFormat || "webp";

      const fullDataUrl = canvas.toDataURL(
        format === "png" ? "image/png" : "image/webp",
        0.9,
      );

      const { blob, mimeType, extension } = await canvasToBlob(canvas, format);
      if (!trackingRef.current || pausedRef.current) return;

      const now = new Date();
      const dateKey = getTodayDateKey(now);
      const timeFormatted = formatTimeString(now);
      const hourKey = getHourSlotKey(now);
      const safeTime = now.toTimeString().split(" ")[0].replace(/:/g, "-");
      const fileName = `Screen_${dateKey}_${safeTime}.${extension}`;

      // Freeze this screenshot's activity interval before awaiting the upload so
      // events during a slow upload belong to the next interval. Prefer the
      // Windows-wide agent; fall back to the existing in-page counters.
      const globalCounts = await callGlobalActivityAgent("snapshot");
      const activityCounts: ScreenshotActivityCounts = globalCounts
        ? normalizeActivityCounts(globalCounts)
        : normalizeActivityCounts({
            mouseMoves: activityCountsRef.current.mouseMoves,
            mouseClicks: activityCountsRef.current.mouseClicks,
            keyPresses: activityCountsRef.current.keyPresses,
            activeSeconds: browserActivityRef.current.activeSeconds,
            trackedSeconds: browserActivityRef.current.trackedSeconds,
          });
      activityCountsRef.current = { mouseMoves: 0, mouseClicks: 0, keyPresses: 0 };
      lastMousePositionRef.current = { x: 0, y: 0, initialized: false };
      browserActivityRef.current = {
        activeSeconds: 0,
        trackedSeconds: 0,
        lastInputAt: 0,
      };

      const result = await uploadScreenshotLocally(
        blob,
        fileName,
        currentUser.id,
        currentUser.name,
        dateKey,
      );

      const thumbnail = generateThumbnailDataUrl(canvas, 640, 360, 0.75);
      const id = `scr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      setCachedScreenshot(id, fullDataUrl);

      const log: ScreenshotLog & { activityCounts?: ScreenshotActivityCounts } = {
        id,
        userId: currentUser.id,
        userName: currentUser.name,
        userEmail: currentUser.email,
        taskName,
        timestamp: now.toISOString(),
        timeFormatted,
        hourKey,
        dateKey,
        fileFormat: format,
        driveFileId: result.fileId,
        driveThumbnailLink: result.localUrl,
        previewDataUrl: thumbnail,
        productivityScore: 92,
        productivityLabel: "High",
        activityCounts,
      };

      // Save counts locally and to the backend alongside the screenshot. A failed
      // activity request must never cancel or undo a successfully saved screenshot.
      saveActivityCounts(currentUser.id, dateKey, fileName, activityCounts);
      try {
        const activityResponse = await fetch(`${backendUrl}/api/activity-snapshot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: currentUser.id,
            employeeName: currentUser.name,
            dateKey,
            screenshotKey: fileName,
            capturedAt: now.toISOString(),
            mouseMoves: activityCounts.mouseMoves,
            mouseClicks: activityCounts.mouseClicks,
            keyPresses: activityCounts.keyPresses,
            activeSeconds: activityCounts.activeSeconds,
            trackedSeconds: activityCounts.trackedSeconds,
          }),
        });
        if (!activityResponse.ok) {
          console.warn("Activity snapshot save failed:", activityResponse.status);
        }
      } catch (activityError) {
        console.warn("Activity snapshot save warning:", activityError);
      }

      onNewScreenshot(log);

      if (selectedDate === dateKey) {
        setRestoredScreenshots((previous) => {
          const key = getScreenshotIdentity(log);
          const alreadyExists = previous.some(
            (screenshot) => getScreenshotIdentity(screenshot) === key,
          );
          if (alreadyExists) return previous;
          return [log, ...previous];
        });
      }

      setLastCapturedTime(timeFormatted);
      setLastStatus(
        `✅ Screenshot saved locally and queued for cloud upload. ${
          isScreenshotUploadWindowOpen()
            ? "Cloud upload runs in hourly batches."
            : "Cloud sharing is paused outside 08:30 AM–08:30 PM IST."
        }`,
      );
    } catch (error: any) {
      console.error("Capture error:", error);
      setLastStatus(`Capture warning: ${error?.message || "Unknown error"}`);
    } finally {
      captureInProgressRef.current = false;
    }
  };

  // ====================================================
  // RANDOM SCREENSHOT WINDOW
  // ====================================================

  const clearCaptureTimers = () => {
    captureScheduleIdRef.current += 1;
    if (captureTimerRef.current) {
      clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  };

  const scheduleRandomWindow = (
    windowSeconds = captureWindowRef.current,
    screenshotCount = screenshotCountRef.current,
  ) => {
    clearCaptureTimers();
    if (!trackingRef.current || pausedRef.current) {
      return;
    }

    const scheduleId = captureScheduleIdRef.current;
    const safeWindow = Math.max(5, Math.floor(Number(windowSeconds) || 600));
    const safeCount = Math.max(1, Math.floor(Number(screenshotCount) || 1));
    const windowMs = safeWindow * 1000;

    const randomPositions = Array.from({ length: safeCount }, (_, index) => {
      const zoneStart = (windowMs * index) / safeCount;
      const zoneEnd = (windowMs * (index + 1)) / safeCount;
      const padding = Math.min(500, Math.max(50, (zoneEnd - zoneStart) * 0.05));
      const start = zoneStart + padding;
      const end = Math.max(start + 25, zoneEnd - padding);
      return Math.floor(start + Math.random() * (end - start));
    }).sort((a, b) => a - b);

    let index = 0;
    let elapsedPosition = 0;

    const scheduleNext = () => {
      if (
        scheduleId !== captureScheduleIdRef.current ||
        !trackingRef.current ||
        pausedRef.current
      ) {
        return;
      }

      if (index >= randomPositions.length) {
        const remaining = Math.max(100, windowMs - elapsedPosition);
        setNextCaptureInSec(Math.ceil(remaining / 1000));
        countdownRef.current = window.setInterval(() => {
          setNextCaptureInSec((previous) =>
            previous === null || previous <= 1 ? 0 : previous - 1,
          );
        }, 1000);

        captureTimerRef.current = window.setTimeout(() => {
          captureTimerRef.current = null;
          if (
            scheduleId !== captureScheduleIdRef.current ||
            !trackingRef.current ||
            pausedRef.current
          ) {
            return;
          }
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          scheduleRandomWindow(safeWindow, safeCount);
        }, remaining);
        return;
      }

      const position = randomPositions[index];
      const delay = Math.max(50, position - elapsedPosition);
      setNextCaptureInSec(Math.max(1, Math.ceil(delay / 1000)));
      countdownRef.current = window.setInterval(() => {
        setNextCaptureInSec((previous) =>
          previous === null || previous <= 1 ? 0 : previous - 1,
        );
      }, 1000);

      captureTimerRef.current = window.setTimeout(async () => {
        captureTimerRef.current = null;
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
        if (
          scheduleId !== captureScheduleIdRef.current ||
          !trackingRef.current ||
          pausedRef.current
        ) {
          return;
        }

        await captureAndUpload();

        if (scheduleId !== captureScheduleIdRef.current) {
          return;
        }
        if (!trackingRef.current || pausedRef.current) {
          return;
        }
        elapsedPosition = position;
        index++;
        scheduleNext();
      }, delay);
    };

    scheduleNext();
  };

  // ====================================================
  // CAPTURE POLICY REFRESH
  // ====================================================

  const refreshCapturePolicy = async () => {
    const now = Date.now();
    if (now - capturePolicyRefreshAtRef.current < 30000) {
      return;
    }
    capturePolicyRefreshAtRef.current = now;

    try {
      const response = await fetch(`${backendUrl}/api/capture-settings`, {
        cache: "no-store",
        headers: backendHeaders,
      });
      const data = await readApiJson(response);
      if (!response.ok || !data?.success || !data?.settings) {
        return;
      }

      const settings = data.settings;
      const newWindow = Math.max(
        5,
        Number(
          settings.captureWindowSeconds ||
            settings.captureIntervalSeconds ||
            600,
        ),
      );
      const newCount = Math.max(1, Number(settings.screenshotsPerWindow || 5));
      const newPreset = String(settings.presetId || "custom");
      const newUpdatedAt = String(settings.updatedAt || "");

      const changed =
        newWindow !== captureWindowRef.current ||
        newCount !== screenshotCountRef.current ||
        newPreset !== capturePresetId ||
        newUpdatedAt !== centralPolicyUpdatedAt;

      setCaptureWindowSeconds(newWindow);
      setScreenshotsPerWindow(newCount);
      setCapturePresetId(newPreset);
      setCentralPolicyUpdatedAt(newUpdatedAt);
      captureWindowRef.current = newWindow;
      screenshotCountRef.current = newCount;

      if (changed && trackingRef.current && !pausedRef.current) {
        clearCaptureTimers();
        scheduleRandomWindow(newWindow, newCount);
      }

      try {
        localStorage.setItem(
          "workmonitor_employee_capture_settings",
          JSON.stringify(settings),
        );
      } catch {
        // ignore
      }
    } catch (error) {
      console.warn("Capture policy refresh warning:", error);
    }
  };

  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        void refreshCapturePolicy();
      }
    };
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [backendUrl, capturePresetId, centralPolicyUpdatedAt]);

  // ====================================================
  // HOURLY CLOUD UPLOAD QUEUE
  // ====================================================

  useEffect(() => {
    const stopScheduler = startScreenshotUploadScheduler();
    return stopScheduler;
  }, []);

  // ====================================================
  // HISTORY
  // ====================================================

  const loadDateHistory = async () => {
    setLoadingHistory(true);
    try {
      const [historyResponse, activityResponse] = await Promise.all([
        fetch(
          `${backendUrl}/api/activity-history/${encodeURIComponent(
            currentUser.id,
          )}`,
          { cache: "no-store", headers: backendHeaders },
        ),
        fetch(
          `${backendUrl}/api/activity/${encodeURIComponent(
            currentUser.id,
          )}/${encodeURIComponent(selectedDate)}`,
          { cache: "no-store", headers: backendHeaders },
        ),
      ]);

      const historyData = await readApiJson(historyResponse);
      const activityData = await readApiJson(activityResponse);

      if (historyResponse.ok && historyData?.success) {
        setActivityHistory(
          Array.isArray(historyData.records) ? historyData.records : [],
        );
      }

      if (activityResponse.ok && activityData?.success) {
        const backendSeconds = Math.max(
          0,
          Number(activityData.totalSeconds || 0),
        );
        setSelectedDateSeconds(backendSeconds);

        if (
          selectedDate === getTodayDateKey() &&
          backendSeconds > daySecondsRef.current
        ) {
          dayBaseRef.current += backendSeconds - daySecondsRef.current;
          daySecondsRef.current = backendSeconds;
          setDayTotalSeconds(backendSeconds);
        }
      } else {
        setSelectedDateSeconds(0);
      }

      const files = await getLocalScreenshots(currentUser.id, selectedDate);
      const restored: ScreenshotLog[] = files.map((item, index) => {
        const fileName = item.fileName;
        const url = item.localUrl;
        const match = fileName.match(
          /Screen_(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})\.(webp|png|jpg|jpeg)$/i,
        );

        let timestamp = `${selectedDate}T00:00:00`;
        let timeFormatted = "";
        let hourKey = "";

        if (match) {
          const [, date, hh, mm, ss] = match;
          const dateObject = new Date(`${date}T${hh}:${mm}:${ss}`);
          timestamp = dateObject.toISOString();
          timeFormatted = formatTimeString(dateObject);
          hourKey = getHourSlotKey(dateObject);
        }

        const extension = fileName.toLowerCase().endsWith(".png")
          ? "png"
          : fileName.toLowerCase().match(/\.jpe?g$/)
            ? "jpg"
            : "webp";

        return {
          id: `saved-${selectedDate}-${fileName}-${index}`,
          userId: currentUser.id,
          userName: currentUser.name,
          userEmail: currentUser.email,
          taskName: "Saved Screenshot",
          timestamp,
          timeFormatted,
          hourKey,
          dateKey: selectedDate,
          fileFormat: extension,
          driveFileId: fileName,
          driveThumbnailLink: url,
          previewDataUrl: url,
          activityCounts: readSavedActivityCounts(
            currentUser.id,
            selectedDate,
            fileName,
          ),
        };
      });

      // Prefer server-persisted counts; localStorage is only a fallback.
      try {
        const snapshotResponse = await fetch(
          `${backendUrl}/api/activity-snapshots/${encodeURIComponent(currentUser.id)}/${selectedDate}`,
        );
        if (snapshotResponse.ok) {
          const snapshotPayload = await snapshotResponse.json();
          const countsByFile = new Map<string, ScreenshotActivityCounts>();
          for (const snapshot of snapshotPayload?.snapshots || []) {
            if (snapshot?.screenshotKey) {
              countsByFile.set(
                String(snapshot.screenshotKey),
                normalizeActivityCounts(snapshot),
              );
            }
          }
          for (const screenshot of restored as (ScreenshotLog & {
            activityCounts?: ScreenshotActivityCounts;
          })[]) {
            const fileKey = String(screenshot.driveFileId || "");
            const serverCounts = countsByFile.get(fileKey);
            if (!serverCounts) continue;
            const localCounts = screenshot.activityCounts;
            // Keep a locally stored percent only if the server row has none
            // (rows saved before activity percent was introduced).
            const merged: ScreenshotActivityCounts =
              (serverCounts.trackedSeconds || 0) > 0 || !localCounts
                ? serverCounts
                : {
                    ...serverCounts,
                    activityPercent: localCounts.activityPercent ?? 0,
                    activeSeconds: localCounts.activeSeconds ?? 0,
                    trackedSeconds: localCounts.trackedSeconds ?? 0,
                  };
            screenshot.activityCounts = merged;
            saveActivityCounts(currentUser.id, selectedDate, fileKey, merged);
          }
        }
      } catch (activityFetchError) {
        console.warn("Activity snapshot fetch failed; using local counts:", activityFetchError);
      }

      restored.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      setRestoredScreenshots(restored);
    } catch (error) {
      console.warn("History warning:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    void loadDateHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, selectedDate]);

  // ====================================================
  // MERGE SCREENSHOTS
  // ====================================================

  const mergedScreenshots = useMemo(() => {
    const map = new Map<string, ScreenshotLog>();
    restoredScreenshots.forEach((screenshot) => {
      map.set(getScreenshotIdentity(screenshot), screenshot);
    });
    userScreenshots.forEach((screenshot) => {
      if (screenshot.dateKey !== selectedDate) return;
      map.set(getScreenshotIdentity(screenshot), screenshot);
    });
    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [restoredScreenshots, userScreenshots, selectedDate]);

  useEffect(() => {
    const visibleCount = mergedScreenshots.length;
    setActivityHistory((previous) =>
      previous.map((record) =>
        record.dateKey === selectedDate
          ? { ...record, screenshotCount: visibleCount }
          : record,
      ),
    );
  }, [mergedScreenshots.length, selectedDate]);

  // ====================================================
  // GALLERY PAGINATION
  // ====================================================

  const totalPages = Math.max(
    1,
    Math.ceil(mergedScreenshots.length / SCREENSHOTS_PER_PAGE),
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDate]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pagedScreenshots = useMemo(() => {
    const startIndex = (currentPage - 1) * SCREENSHOTS_PER_PAGE;
    return mergedScreenshots.slice(
      startIndex,
      startIndex + SCREENSHOTS_PER_PAGE,
    );
  }, [mergedScreenshots, currentPage]);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1) as (
        | number
        | string
      )[];
    }
    const pages: (number | string)[] = [1];
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    if (start > 2) pages.push("ellipsis-left");
    for (let page = start; page <= end; page++) {
      pages.push(page);
    }
    if (end < totalPages - 1) pages.push("ellipsis-right");
    pages.push(totalPages);
    return pages;
  }, [currentPage, totalPages]);

  // ====================================================
  // EMPLOYEE SCREENSHOT IMAGE LOADING
  // ====================================================

  const employeeScreenshotUrlCacheRef = useRef<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const loadImages = async () => {
      const loaded: Record<string, string> = {};
      const cache = employeeScreenshotUrlCacheRef.current;

      for (const screenshot of mergedScreenshots) {
        const source =
          screenshot.driveThumbnailLink || screenshot.previewDataUrl || "";
        if (!source || cancelled) continue;

        if (source.startsWith("data:") || source.startsWith("blob:")) {
          loaded[source] = source;
          continue;
        }

        const cachedUrl = cache[source];
        if (cachedUrl) {
          loaded[source] = cachedUrl;
          continue;
        }

        try {
          const response = await fetch(source, {
            method: "GET",
            cache: "force-cache",
            headers: {},
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          if (cancelled) return;
          const objectUrl = URL.createObjectURL(blob);
          cache[source] = objectUrl;
          loaded[source] = objectUrl;
        } catch (error) {
          console.warn(
            "Employee screenshot fetch failed; using direct image URL:",
            screenshot.driveFileId,
            error,
          );
          loaded[source] = source;
        }
      }

      if (!cancelled) {
        setEmployeeScreenshotUrls(loaded);
      }
    };
    void loadImages();
    return () => {
      cancelled = true;
    };
  }, [mergedScreenshots]);

  // ====================================================
  // START
  // ====================================================

  const startTracking = async () => {
    if (trackingRef.current) {
      console.warn("Tracking already active. Start request ignored.");
      return;
    }

    const stream = await initScreenStream();

    // Start a fresh activity interval (Windows agent + in-page fallback).
    void callGlobalActivityAgent("start");
    activityCountsRef.current = { mouseMoves: 0, mouseClicks: 0, keyPresses: 0 };
    lastMousePositionRef.current = { x: 0, y: 0, initialized: false };
    browserActivityRef.current = {
      activeSeconds: 0,
      trackedSeconds: 0,
      lastInputAt: 0,
    };

    if (!restoredSessionRef.current) {
      sessionSecondsRef.current = 0;
    }

    if (!stream) {
      trackingRef.current = true;
      pausedRef.current = false;
      setIsTracking(true);
      setIsPaused(false);
      setNeedsScreenShare(true);

      if (restoredSessionRef.current) {
        restoredSessionRef.current = false;
      } else {
        setSessionSeconds(0);
      }
      setLastStatus(
        "Tracking started. Reconnect screen sharing to enable screenshots.",
      );
      await syncTrackerTime();
      clearCaptureTimers();
      return;
    }

    setNeedsScreenShare(false);
    trackingRef.current = true;
    pausedRef.current = false;
    setIsTracking(true);
    setIsPaused(false);

    if (restoredSessionRef.current) {
      restoredSessionRef.current = false;
    } else {
      setSessionSeconds(0);
    }
    setLastStatus("✅ Tracking started");
    await syncTrackerTime();
    clearCaptureTimers();
    scheduleRandomWindow(captureWindowRef.current, screenshotCountRef.current);
  };

  // ====================================================
  // PAUSE
  // ====================================================

  const pauseTracking = async () => {
    pausedRef.current = true;
    void callGlobalActivityAgent("pause");
    setIsPaused(true);
    clearCaptureTimers();
    setNextCaptureInSec(null);
    await syncTrackerTime();
    setLastStatus("Tracking paused");
  };

  // ====================================================
  // RESUME
  // ====================================================

  const resumeTracking = () => {
    if (!trackingRef.current) {
      return;
    }
    pausedRef.current = false;
    void callGlobalActivityAgent("resume");
    setIsPaused(false);
    clearCaptureTimers();
    scheduleRandomWindow(captureWindowRef.current, screenshotCountRef.current);
    setLastStatus("Tracking resumed");
  };

  // ====================================================
  // STOP
  // ====================================================

  const stopTracking = async () => {
    void callGlobalActivityAgent("stop");
    trackingRef.current = false;
    pausedRef.current = false;
    resumeAfterScreenShareRef.current = false;
    clearCaptureTimers();
    setNextCaptureInSec(null);
    await syncTrackerTime();
    segmentStartRef.current = null;
    setIsTracking(false);
    setIsPaused(false);

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null;
    }
    setSessionSeconds(0);
    restoredSessionRef.current = false;
    setNeedsScreenShare(false);
    setLastStatus(
      `Tracking stopped. Today: ${formatSecondsToHoursMinutes(
        daySecondsRef.current,
      )}`,
    );
    await loadDateHistory();
  };

  // ====================================================
  // RECONNECT SCREEN SHARING
  // ====================================================

  const reconnectScreenShare = async () => {
    const stream = await initScreenStream();
    if (!stream) return;

    setNeedsScreenShare(false);

    // If the page was refreshed during an active session, resume the timer
    // only after the screen-share chooser succeeds. A manually paused session
    // remains paused.
    if (trackingRef.current && resumeAfterScreenShareRef.current) {
      resumeAfterScreenShareRef.current = false;
      pausedRef.current = false;
      void callGlobalActivityAgent("resume");
      setIsPaused(false);
      clearCaptureTimers();
      scheduleRandomWindow(
        captureWindowRef.current,
        screenshotCountRef.current,
      );
      setLastStatus("✅ Screen sharing connected. Timer and screenshots resumed.");
      return;
    }

    setLastStatus(
      trackingRef.current && pausedRef.current
        ? "✅ Screen sharing connected. Tracking remains paused; click Resume when ready."
        : "✅ Screen sharing connected. Screenshots resumed.",
    );

    if (trackingRef.current && !pausedRef.current) {
      clearCaptureTimers();
      scheduleRandomWindow(
        captureWindowRef.current,
        screenshotCountRef.current,
      );
    }
  };

  // ====================================================
  // SCHEDULE ALERT ACTIONS
  // ====================================================

  const handleScheduleAlertAction = async (alert: ScheduleAlert) => {
    if (alert.id === "test") {
      removeScheduleAlert("test");
      publishScheduleAlertState(
        scheduleAlertsRef.current,
        alertSnoozeRef.current,
      );
      return;
    }

    alertSnoozeRef.current[alert.id] = Date.now() + 60 * 1000;
    removeScheduleAlert(alert.id);
    publishScheduleAlertState(
      scheduleAlertsRef.current,
      alertSnoozeRef.current,
    );

    if (alert.action === "start") {
      await startTracking();
    } else if (alert.action === "resume") {
      resumeTracking();
    } else if (alert.action === "pause") {
      await pauseTracking();
    } else if (alert.action === "stop") {
      await stopTracking();
    }
  };

  // ====================================================
  // FLOATING BAR
  // ====================================================

  const handleStartClick = () => {
    floatDismissedRef.current = false;
    const startPromise = startTracking();
    if (alertSettings.floatOnStart && pipSupported && !pipWindowRef.current) {
      void openFloatingTimer();
    }
    void startPromise;
  };

  const handleToggleTracking = () => {
    if (!isTracking) {
      handleStartClick();
    } else if (isPaused) {
      resumeTracking();
    } else {
      void pauseTracking();
    }
  };

  const renderFloatingPanel = () => {
    const running = isTracking && !isPaused;
    const dotColor = running ? "#34d399" : isTracking ? "#fbbf24" : "#64748b";
    const activeAlert = scheduleAlerts[0];

    const circleButton = (
      background: string,
      size = 32,
    ): React.CSSProperties => ({
      width: size,
      height: size,
      borderRadius: "50%",
      border: "none",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background,
      color: "#ffffff",
      padding: 0,
      flexShrink: 0,
    });

    const textButton = (background: string): React.CSSProperties => ({
      cursor: "pointer",
      border: "none",
      borderRadius: 999,
      padding: "4px 10px",
      fontSize: 11,
      fontWeight: 700,
      color: "#ffffff",
      background,
      whiteSpace: "nowrap",
      flexShrink: 0,
    });

    return (
      <div
        style={{
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          color: "#e5e7eb",
          padding: "6px 10px", // ✅ પેડિંગ ઓછું કર્યું
          boxSizing: "border-box",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center", // ✅ સેન્ટર કર્યું
          gap: 4,
        }}
      >
        <style>
          {
            "@keyframes wmflash{0%,100%{box-shadow:0 0 0 0 rgba(129,140,248,0)}50%{box-shadow:0 0 0 3px rgba(129,140,248,.85)}}"
          }
        </style>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: dotColor,
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          <div
            style={{
              fontFamily: "ui-monospace, Consolas, monospace",
              fontSize: 20,
              fontWeight: 800,
              color: running ? "#34d399" : "#e5e7eb",
              fontVariantNumeric: "tabular-nums",
              flex: 1,
            }}
          >
            {formatClock(dayTotalSeconds)}
          </div>
          <button
            type="button"
            onClick={handleToggleTracking}
            title={
              !isTracking ? "Start tracking" : isPaused ? "Resume" : "Pause"
            }
            style={circleButton(running ? "#f59e0b" : "#059669")}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              {running ? (
                <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
              ) : (
                <path d="M8 5v14l11-7z" />
              )}
            </svg>
          </button>
          {isTracking && (
            <button
              type="button"
              onClick={() => void stopTracking()}
              title="Stop"
              style={circleButton("#e11d48")}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M6 6h12v12H6z" />
              </svg>
            </button>
          )}
        </div>

        {activeAlert ? (
          <div
            style={{
              background: "#1e1b4b",
              border: "1px solid #6366f1",
              borderRadius: 8,
              padding: "4px 6px", // ✅ કોમ્પેક્ટ પેડિંગ
              animation: "wmflash 1.2s ease-in-out infinite",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  flex: 1,
                }}
                title={activeAlert.message}
              >
                {activeAlert.title}
              </div>
              <button
                type="button"
                onClick={() => void handleScheduleAlertAction(activeAlert)}
                style={{ ...textButton("#4f46e5"), padding: "2px 6px", fontSize: 10 }}
              >
                {getAlertActionLabel(activeAlert, true)}
              </button>
              <button
                type="button"
                onClick={() => snoozeScheduleAlert(activeAlert.id)}
                style={{ ...textButton("#334155"), padding: "2px 6px", fontSize: 10 }}
              >
                Snooze
              </button>
            </div>
          </div>
        ) : isTracking && needsScreenShare ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "#fbbf24",
            }}
          >
            <span style={{ flex: 1 }}>Screenshots paused</span>
            <button
              type="button"
              onClick={() => window.focus()}
              style={textButton("#334155")}
            >
              Open dashboard
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 10, color: "#94a3b8" }}>
            {running ? "Tracking" : isTracking ? "Paused" : "Not tracking"}
            {" • Today"}
          </div>
        )}
      </div>
    );
  };

  // ====================================================
  // CLEANUP
  // ====================================================

  useEffect(() => {
    return () => {
      clearCaptureTimers();
      captureInProgressRef.current = false;
      trackingRef.current = false;
      pausedRef.current = false;
      if (trackerTimerRef.current) {
        clearInterval(trackerTimerRef.current);
        trackerTimerRef.current = null;
      }
      if (trackerSyncIntervalRef.current !== null) {
        window.clearInterval(trackerSyncIntervalRef.current);
        trackerSyncIntervalRef.current = null;
      }
      if (scheduleAlertChannelRef.current) {
        scheduleAlertChannelRef.current.close();
        scheduleAlertChannelRef.current = null;
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
        screenStreamRef.current = null;
      }
    };
  }, []);

  // ====================================================
  // UI HELPERS
  // ====================================================

  const policyText = `${screenshotsPerWindow} screenshot${
    screenshotsPerWindow === 1 ? "" : "s"
  } randomly / ${
    captureWindowSeconds < 60
      ? `${captureWindowSeconds} sec`
      : `${Math.round(captureWindowSeconds / 60)} min`
  }`;

  const today = getTodayDateKey();

  const notificationReady =
    alertSettings.browserNotify && notificationPermission === "granted";

  // ====================================================
  // DAY / WEEK / MONTH / ALL  TIME TRACKING VIEW
  // ====================================================

  const sessionScreenshotCounts: Record<string, number> = {};
  userScreenshots.forEach((screenshot) => {
    sessionScreenshotCounts[screenshot.dateKey] =
      (sessionScreenshotCounts[screenshot.dateKey] || 0) + 1;
  });

  const getDayInfo = (dateKey: string) => {
    const record = activityHistory.find((item) => item.dateKey === dateKey);
    let seconds = record?.totalSeconds || 0;
    if (dateKey === today) {
      seconds = dayTotalSeconds;
    } else if (dateKey === selectedDate) {
      seconds = selectedDateSeconds;
    }
    const count =
      dateKey === selectedDate
        ? mergedScreenshots.length
        : Math.max(
            record?.screenshotCount || 0,
            dateStats[dateKey]?.screenshotCount || 0,
            sessionScreenshotCounts[dateKey] || 0,
          );
    return { seconds, count };
  };

  const selectedDateObject = parseDateKey(selectedDate);
  const weekStartObject = addDays(
    selectedDateObject,
    -selectedDateObject.getDay(),
  );
  const weekKeys = Array.from({ length: 7 }, (_, index) =>
    toDateKey(addDays(weekStartObject, index)),
  );
  const selectedMonthKey = selectedDate.slice(0, 7);

  const monthStartObject = new Date(
    selectedDateObject.getFullYear(),
    selectedDateObject.getMonth(),
    1,
  );
  const monthEndObject = new Date(
    selectedDateObject.getFullYear(),
    selectedDateObject.getMonth() + 1,
    0,
  );
  const monthCalendarStart = addDays(
    monthStartObject,
    -monthStartObject.getDay(),
  );
  const monthCalendarEnd = addDays(monthEndObject, 6 - monthEndObject.getDay());
  const monthWeekCount =
    Math.floor(
      (monthCalendarEnd.getTime() - monthCalendarStart.getTime()) /
        (24 * 60 * 60 * 1000),
    ) /
      7 +
    1;
  const monthWeekKeys = Array.from({ length: monthWeekCount }, (_, weekIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) =>
      toDateKey(addDays(monthCalendarStart, weekIndex * 7 + dayIndex)),
    ),
  );

  const allKnownDateKeys = Array.from(
    new Set([
      ...activityHistory.map((record) => record.dateKey),
      today,
      selectedDate,
    ]),
  ).sort((a, b) => b.localeCompare(a));

  const rangeKeys: string[] =
    historyView === "day"
      ? [selectedDate]
      : historyView === "week"
        ? [...weekKeys].reverse()
        : historyView === "month"
          ? allKnownDateKeys.filter((key) =>
              key.startsWith(`${selectedMonthKey}-`),
            )
          : allKnownDateKeys;

  const statsFetchKeys = (() => {
    const historyKeySet = new Set(
      activityHistory.map((record) => record.dateKey),
    );
    let candidates: string[] = [];
    if (historyView === "day" || historyView === "week") {
      candidates = [...weekKeys];
    } else if (historyView === "month") {
      candidates = allKnownDateKeys.filter((key) =>
        key.startsWith(`${selectedMonthKey}-`),
      );
    } else {
      candidates = allKnownDateKeys.slice(0, 120);
    }
    return Array.from(new Set(candidates))
      .filter(
        (key) =>
          key <= today &&
          key !== selectedDate &&
          (historyKeySet.has(key) || key === today),
      )
      .sort((a, b) => b.localeCompare(a));
  })();

  const statsFetchSignature = statsFetchKeys.join(",");

  useEffect(() => {
    let cancelled = false;
    const staleKeys = statsFetchKeys.filter((key) => {
      const fetchedAt = statsFetchedAtRef.current[key];
      return !fetchedAt || Date.now() - fetchedAt > 60000;
    });
    if (!staleKeys.length) return;

    const run = async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      if (cancelled) return;
      const batchSize = 3;

      for (let i = 0; i < staleKeys.length && !cancelled; i += batchSize) {
        const batch = staleKeys.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (key) => {
            try {
              let apiCount = 0;
              try {
                const response = await fetch(
                  `${backendUrl}/api/activity/${encodeURIComponent(
                    currentUser.id,
                  )}/${encodeURIComponent(key)}`,
                  { cache: "no-store", headers: backendHeaders },
                );
                const data = await readApiJson(response);
                if (response.ok && data?.success) {
                  apiCount = Math.max(0, Number(data.screenshotCount || 0));
                }
              } catch (error) {
                console.warn("Date stats warning:", key, error);
              }
              let localCount = 0;
              try {
                const files = await getLocalScreenshots(currentUser.id, key);
                localCount = files.length;
              } catch {
                localCount = 0;
              }
              statsFetchedAtRef.current[key] = Date.now();
              return [
                key,
                { screenshotCount: Math.max(apiCount, localCount) },
              ] as const;
            } catch {
              return null;
            }
          }),
        );

        if (cancelled) return;
        const valid = results.filter(
          (item): item is readonly [string, { screenshotCount: number }] =>
            item !== null,
        );
        if (valid.length) {
          setDateStats((previous) => {
            const next = { ...previous };
            valid.forEach(([key, stats]) => {
              next[key] = stats;
            });
            return next;
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsFetchSignature, currentUser.id, backendUrl]);

  const historyRows = rangeKeys
    .map((key) => ({ key, ...getDayInfo(key) }))
    .filter(
      (row) =>
        historyView === "day" ||
        row.key === selectedDate ||
        row.seconds > 0 ||
        row.count > 0,
    );

  const rangeTotalSeconds = historyRows.reduce(
    (sum, row) => sum + row.seconds,
    0,
  );
  const rangeTotalScreenshots = historyRows.reduce(
    (sum, row) => sum + row.count,
    0,
  );
  const weekTotalSeconds = weekKeys.reduce(
    (sum, key) => sum + getDayInfo(key).seconds,
    0,
  );

  const rangeLabel = (() => {
    if (historyView === "day") {
      return selectedDateObject.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
    if (historyView === "week") {
      const start = parseDateKey(weekKeys[0]);
      const end = parseDateKey(weekKeys[6]);
      return `${start.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })} – ${end.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`;
    }
    if (historyView === "month") {
      return selectedDateObject.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
    }
    return "All time";
  })();

  const canGoNext = (() => {
    if (historyView === "day") {
      return toDateKey(addDays(selectedDateObject, 1)) <= today;
    }
    if (historyView === "week") {
      return toDateKey(addDays(weekStartObject, 7)) <= today;
    }
    if (historyView === "month") {
      return selectedMonthKey < today.slice(0, 7);
    }
    return false;
  })();

  const shiftRange = (direction: -1 | 1) => {
    let nextKey = selectedDate;
    if (historyView === "day") {
      nextKey = toDateKey(addDays(selectedDateObject, direction));
    } else if (historyView === "week") {
      nextKey = toDateKey(addDays(selectedDateObject, direction * 7));
    } else if (historyView === "month") {
      const target = new Date(
        selectedDateObject.getFullYear(),
        selectedDateObject.getMonth() + direction,
        1,
      );
      nextKey = toDateKey(target);
    } else {
      return;
    }
    if (nextKey > today) {
      nextKey = today;
    }
    if (historyView === "month" && nextKey.slice(0, 7) === today.slice(0, 7)) {
      nextKey = today;
    }
    setSelectedDate(nextKey);
  };

  // ====================================================
  // RENDER
  // ====================================================

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* FLOATING MINI BAR */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/95 text-white pl-3 pr-1.5 py-1.5 shadow-xl backdrop-blur">
        <span
          aria-hidden="true"
          className="text-slate-500 text-[10px] leading-none tracking-[-0.15em] select-none"
        >
          ⋮⋮
        </span>
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            isTracking && !isPaused
              ? "bg-emerald-400 animate-pulse"
              : isTracking
                ? "bg-amber-400"
                : "bg-slate-500"
          }`}
        />
        <span className="font-mono text-sm font-bold tabular-nums">
          {formatClock(dayTotalSeconds)}
        </span>
        <button
          type="button"
          onClick={handleToggleTracking}
          aria-label={
            !isTracking
              ? "Start tracking"
              : isPaused
                ? "Resume tracking"
                : "Pause tracking"
          }
          title={
            !isTracking
              ? "Start tracking"
              : isPaused
                ? "Resume tracking"
                : "Pause tracking"
          }
          className={`cursor-pointer w-8 h-8 rounded-full flex items-center justify-center text-white transition ${
            isTracking && !isPaused
              ? "bg-amber-500 hover:bg-amber-400"
              : "bg-emerald-600 hover:bg-emerald-500"
          }`}
        >
          {isTracking && !isPaused ? (
            <Pause className="w-3.5 h-3.5" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
        </button>
        {pipSupported && (
          <button
            type="button"
            onClick={() =>
              pipWindow ? closeFloatingTimer() : void openFloatingTimer()
            }
            aria-label="Floating timer"
            title={
              pipWindow
                ? "Close floating timer"
                : "Keep this timer on top of every tab and app"
            }
            className={`cursor-pointer h-8 px-3 gap-1.5 rounded-full flex items-center justify-center border transition ${
              pipWindow
                ? "border-indigo-400 text-indigo-300 bg-indigo-950"
                : `border-slate-600 text-slate-300 hover:border-indigo-400 ${
                    isTracking ? "animate-pulse" : ""
                  }`
            }`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold whitespace-nowrap">
              {pipWindow ? "On all screens" : "All screens"}
            </span>
          </button>
        )}
        {alertSettings.browserNotify &&
          notificationPermission === "default" && (
            <button
              type="button"
              onClick={() => void requestNotificationPermission()}
              aria-label="Allow desktop alerts"
              title="Allow desktop alerts so reminders show on every tab"
              className="cursor-pointer w-8 h-8 rounded-full flex items-center justify-center border border-amber-500 text-amber-400 hover:bg-amber-950 transition"
            >
              <Bell className="w-3.5 h-3.5" />
            </button>
          )}
      </div>

      {pipWindow &&
        createPortal(renderFloatingPanel(), pipWindow.document.body)}

      {/* SCHEDULE ALERT TOASTS */}
      {scheduleAlerts.length > 0 && (
        <div
          className="fixed top-4 right-4 z-[60] w-[calc(100vw-2rem)] max-w-sm space-y-3"
          role="region"
          aria-live="assertive"
          aria-label="Reminders"
        >
          {scheduleAlerts.map((alert) => {
            const tone =
              alert.id === "complete"
                ? "border-rose-400 dark:border-rose-700"
                : alert.id === "breakStart"
                  ? "border-amber-400 dark:border-amber-700"
                  : "border-indigo-400 dark:border-indigo-700";
            const iconTone =
              alert.id === "complete"
                ? "text-rose-600"
                : alert.id === "breakStart"
                  ? "text-amber-500"
                  : "text-indigo-600";
            return (
              <div
                key={alert.id}
                className={`rounded-xl border-2 bg-white dark:bg-slate-900 p-4 shadow-2xl ${tone}`}
              >
                <div className="flex items-start gap-3">
                  <BellRing className={`w-5 h-5 mt-0.5 shrink-0 ${iconTone}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold">{alert.title}</div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                      {alert.message}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => snoozeScheduleAlert(alert.id)}
                    aria-label="Close reminder"
                    className="cursor-pointer p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleScheduleAlertAction(alert)}
                    className="cursor-pointer flex-1 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                  >
                    {getAlertActionLabel(alert)}
                  </button>
                  <button
                    type="button"
                    onClick={() => snoozeScheduleAlert(alert.id)}
                    className="cursor-pointer px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold hover:border-indigo-400"
                  >
                    Snooze {ALERT_SNOOZE_MINUTES} min
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
            <Monitor className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Employee Dashboard</h1>
            <div className="text-sm text-slate-500">
              {currentUser.name}
              {" • "}
              {currentUser.email}
            </div>
          </div>
        </div>
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="cursor-pointer px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold"
          >
            Logout
          </button>
        )}
      </div>

      {/* TRACKING CARD */}
      <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-950/20 p-6 space-y-5">
        <div>
          <label className="text-xs uppercase font-bold text-slate-500">
            Currently Working On
          </label>
          <input
            type="text"
            value={taskName}
            onChange={(event) => setTaskName(event.target.value)}
            className="mt-2 w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
          />
        </div>

        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Camera className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-bold">
              Live Admin Capture Policy:
            </span>
            <span className="text-sm font-black text-indigo-600">
              {policyText}
            </span>
            <span className="px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
              AUTO SYNC
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            {capturePresetId === "custom"
              ? "Custom policy selected by Admin."
              : "Preset policy selected by Admin."}
            {centralPolicyUpdatedAt
              ? ` Last updated: ${new Date(
                  centralPolicyUpdatedAt,
                ).toLocaleTimeString()}`
              : ""}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {!isTracking ? (
            <button
              type="button"
              onClick={handleStartClick}
              className="cursor-pointer flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
            >
              <Play className="w-4 h-4" />
              Start Tracking
            </button>
          ) : (
            <>
              {!isPaused ? (
                <button
                  type="button"
                  onClick={pauseTracking}
                  className="cursor-pointer flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold"
                >
                  <Pause className="w-4 h-4" />
                  Pause
                </button>
              ) : (
                <button
                  type="button"
                  onClick={resumeTracking}
                  className="cursor-pointer flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                >
                  <Play className="w-4 h-4" />
                  Resume
                </button>
              )}
              <button
                type="button"
                onClick={stopTracking}
                className="cursor-pointer flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold"
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
            </>
          )}
        </div>

        {isTracking && pipSupported && !pipWindow && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
            <div className="text-xs">
              <span className="font-bold">
                The timer is visible only inside this tab.
              </span>{" "}
              Float it to see the timer, reminders and Play / Pause on every tab
              and app.
              {pipError && (
                <span className="block mt-1 text-amber-600">
                  Could not open the floating bar: {pipError}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => void openFloatingTimer()}
              className="cursor-pointer inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Float on all screens
            </button>
          </div>
        )}

        {isTracking && !isPaused && nextCaptureInSec !== null && (
          <div className="text-xs text-center font-semibold text-slate-600 dark:text-slate-300">
            Next random screenshot in approximately{" "}
            <span className="font-mono text-indigo-600">
              {nextCaptureInSec}s
            </span>
          </div>
        )}
      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="text-[11px] uppercase font-bold text-slate-500">
            {historyView === "day"
              ? selectedDate === today
                ? "Today Total Tracked"
                : "Daily Total Tracked"
              : historyView === "week"
                ? "Weekly Total Tracked"
                : historyView === "month"
                  ? "Monthly Total Tracked"
                  : "Overall Total Tracked"}
          </div>
          <div className="text-2xl font-black mt-2 text-emerald-600">
            {loadingHistory && selectedDate !== today
              ? "Loading..."
              : formatSecondsToHoursMinutes(rangeTotalSeconds)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="text-[11px] uppercase font-bold text-slate-500">
            {historyView === "day"
              ? "Selected Date Screenshots"
              : historyView === "week"
                ? "Weekly Screenshots"
                : historyView === "month"
                  ? "Monthly Screenshots"
                  : "Total Screenshots"}
          </div>
          <div className="text-2xl font-black mt-2 text-indigo-600">
            {loadingHistory ? "..." : rangeTotalScreenshots}
          </div>
        </div>
      </div>

      {/* STATUS */}
      <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs leading-5">
          <span>{lastStatus}</span>
          {isTracking && needsScreenShare && (
            <button
              type="button"
              onClick={() => void reconnectScreenShare()}
              className="cursor-pointer px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold whitespace-nowrap"
            >
              Reconnect screen sharing
            </button>
          )}
        </div>
        {lastCapturedTime && (
          <div className="text-slate-500 mt-1 text-xs">
            Last screenshot: {lastCapturedTime}
          </div>
        )}
      </div>

      {/* SCHEDULE ALERT SETTINGS */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Bell className="w-5 h-5 mt-0.5 text-indigo-600" />
            <div>
              <h2 className="font-bold">Schedule Alerts</h2>
              <p className="text-xs text-slate-500 mt-1">
                {alertSettings.enabled
                  ? `Start ${alertSettings.startTime || "--:--"}${
                      alertSettings.breakEnabled
                        ? ` • Break ${alertSettings.breakStart || "--:--"}–${
                            alertSettings.breakEnd || "--:--"
                          }`
                        : ""
                    } • ${formatHoursLabel(
                      Number(alertSettings.dailyHours) || 0,
                    )}h work day`
                  : "Reminders are turned off."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={alertSettings.enabled}
                onChange={(event) =>
                  updateAlertSetting("enabled", event.target.checked)
                }
                className="w-4 h-4 accent-indigo-600"
              />
              Alerts on
            </label>
            <button
              type="button"
              onClick={() => setShowAlertSettings((previous) => !previous)}
              className="cursor-pointer px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold hover:border-indigo-400 transition"
            >
              {showAlertSettings ? "Hide" : "Set times"}
            </button>
          </div>
        </div>

        {alertSettings.enabled && (
          <div className="mx-5 mb-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-4 space-y-3">
            <div className="text-xs font-bold">
              Get reminders on every window and tab
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold">Popup notification</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {!alertSettings.browserNotify
                      ? "Turned off. Enable 'Desktop notification' in Set times."
                      : notificationPermission === "granted"
                        ? "Popups appear over every window and tab."
                        : notificationPermission === "denied"
                          ? "Blocked. Click the lock icon next to the address bar, set Notifications to Allow, then reload."
                          : notificationPermission === "unsupported"
                            ? "Not supported in this browser."
                            : "Allow it once to get popups over every window."}
                  </div>
                </div>
                {notificationReady ? (
                  <span className="text-xs font-bold text-emerald-600 whitespace-nowrap">
                    ✓ On
                  </span>
                ) : alertSettings.browserNotify &&
                  notificationPermission === "default" ? (
                  <button
                    type="button"
                    onClick={() => void requestNotificationPermission()}
                    className="cursor-pointer px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold whitespace-nowrap"
                  >
                    Allow
                  </button>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold">
                    Floating bar (always on top)
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {!pipSupported
                      ? "Not supported in this browser. Use Chrome or Edge."
                      : pipWindow
                        ? "The timer and reminders stay above every window."
                        : "Open it once and it stays above every window."}
                  </div>
                </div>
                {pipSupported &&
                  (pipWindow ? (
                    <span className="text-xs font-bold text-emerald-600 whitespace-nowrap">
                      ✓ On
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void openFloatingTimer()}
                      className="cursor-pointer px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold whitespace-nowrap"
                    >
                      Open
                    </button>
                  ))}
              </div>
            </div>
            {pipError && (
              <div className="text-[11px] text-amber-600">
                The floating bar could not open: {pipError}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void sendTestReminder()}
                className="cursor-pointer px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold hover:border-indigo-400 transition"
              >
                Send test reminder
              </button>
              <span className="text-[11px] text-slate-500">
                Shows a sample reminder on this page, the floating bar, the tab
                title and as a popup. Switch to another window to see it.
              </span>
            </div>
          </div>
        )}

        {showAlertSettings && (
          <div className="px-5 pb-5 pt-1 border-t border-slate-200 dark:border-slate-800 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
              <label className="block">
                <span className="text-[11px] font-bold text-slate-500">
                  Work start time
                </span>
                <input
                  type="time"
                  value={alertSettings.startTime}
                  onChange={(event) =>
                    updateAlertSetting("startTime", event.target.value)
                  }
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
                <span className="block text-[11px] text-slate-500 mt-1">
                  Reminds you to start tracking.
                </span>
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-slate-500">
                  Break starts
                </span>
                <input
                  type="time"
                  value={alertSettings.breakStart}
                  disabled={!alertSettings.breakEnabled}
                  onChange={(event) =>
                    updateAlertSetting("breakStart", event.target.value)
                  }
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40"
                />
                <span className="block text-[11px] text-slate-500 mt-1">
                  Reminds you to pause.
                </span>
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-slate-500">
                  Break ends
                </span>
                <input
                  type="time"
                  value={alertSettings.breakEnd}
                  disabled={!alertSettings.breakEnabled}
                  onChange={(event) =>
                    updateAlertSetting("breakEnd", event.target.value)
                  }
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40"
                />
                <span className="block text-[11px] text-slate-500 mt-1">
                  Reminds you to resume.
                </span>
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-slate-500">
                  Work hours per day
                </span>
                <input
                  type="number"
                  min={1}
                  max={16}
                  step={0.5}
                  value={alertSettings.dailyHours}
                  onChange={(event) =>
                    updateAlertSetting(
                      "dailyHours",
                      Math.min(16, Math.max(0, Number(event.target.value))),
                    )
                  }
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
                <span className="block text-[11px] text-slate-500 mt-1">
                  Reminds you to stop the timer.
                </span>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={alertSettings.breakEnabled}
                  onChange={(event) =>
                    updateAlertSetting("breakEnabled", event.target.checked)
                  }
                  className="w-4 h-4 accent-indigo-600"
                />
                I take a break
              </label>
              <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={alertSettings.sound}
                  onChange={(event) =>
                    updateAlertSetting("sound", event.target.checked)
                  }
                  className="w-4 h-4 accent-indigo-600"
                />
                Play sound
              </label>
              {pipSupported && (
                <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alertSettings.floatOnStart}
                    onChange={(event) =>
                      updateAlertSetting("floatOnStart", event.target.checked)
                    }
                    className="w-4 h-4 accent-indigo-600"
                  />
                  Floating bar on every tab
                </label>
              )}
              <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={alertSettings.browserNotify}
                  onChange={(event) =>
                    updateAlertSetting("browserNotify", event.target.checked)
                  }
                  className="w-4 h-4 accent-indigo-600"
                />
                Desktop notification
              </label>
              {alertSettings.browserNotify &&
                notificationPermission === "default" && (
                  <button
                    type="button"
                    onClick={() => void requestNotificationPermission()}
                    className="cursor-pointer px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                  >
                    Allow notifications
                  </button>
                )}
              {alertSettings.browserNotify &&
                notificationPermission === "denied" && (
                  <span className="text-[11px] text-amber-600">
                    Notifications are blocked in the browser. Reminders will
                    still show on this page.
                  </span>
                )}
            </div>
            <p className="text-[11px] text-slate-500">
              Times use this computer's clock. A reminder you close comes back
              after {ALERT_SNOOZE_MINUTES} minutes if it is still needed.
            </p>
          </div>
        )}
      </div>

      {/* TIME TRACKING (DAY / WEEK / MONTH / ALL) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
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
              aria-label="Time range"
              className="inline-flex self-start md:self-auto rounded-full border border-slate-300 dark:border-slate-700 overflow-hidden"
            >
              {VIEW_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  role="tab"
                  aria-selected={historyView === mode.id}
                  onClick={() => setHistoryView(mode.id)}
                  className={`cursor-pointer px-5 py-2 text-sm font-semibold transition ${
                    historyView === mode.id
                      ? "bg-indigo-600 text-white"
                      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div className="flex items-center gap-2">
              {historyView !== "all" && (
                <>
                  <button
                    type="button"
                    onClick={() => shiftRange(-1)}
                    aria-label="Previous"
                    className="cursor-pointer p-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-indigo-400 transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftRange(1)}
                    disabled={!canGoNext}
                    aria-label="Next"
                    className="cursor-pointer p-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-indigo-400 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}
              <div className="text-base font-bold px-1">{rangeLabel}</div>
              {historyView !== "all" && (
                <input
                  type="date"
                  value={selectedDate}
                  max={today}
                  onChange={(event) =>
                    setSelectedDate(event.target.value || today)
                  }
                  aria-label="Pick a date"
                  className="ml-1 px-2 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              )}
              <button
                type="button"
                onClick={loadDateHistory}
                className="cursor-pointer p-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-indigo-400 transition"
                title="Refresh"
                aria-label="Refresh"
              >
                <RefreshCw
                  className={`w-4 h-4 ${loadingHistory ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </div>

          {(historyView === "day" || historyView === "week") && (
            <div className="overflow-x-auto">
              <div className="min-w-[640px] grid grid-cols-[repeat(7,minmax(0,1fr))_minmax(120px,1.3fr)] rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                {weekKeys.map((key) => {
                  const info = getDayInfo(key);
                  const dateObject = parseDateKey(key);
                  const isSelected = key === selectedDate;
                  const isFuture = key > today;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={isFuture}
                      onClick={() => setSelectedDate(key)}
                      className={`text-left px-3 py-2 border-r border-slate-200 dark:border-slate-800 transition disabled:opacity-40 disabled:cursor-not-allowed ${
                        isSelected
                          ? "bg-indigo-100 dark:bg-indigo-950/60"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
                      }`}
                    >
                      <div className="text-xs font-bold">
                        {dateObject.toLocaleDateString("en-US", {
                          weekday: "short",
                        })}{" "}
                        <span className="font-normal text-slate-500">
                          {dateObject.getDate()}
                        </span>
                      </div>
                      <div
                        className={`text-xs mt-0.5 ${
                          info.seconds > 0
                            ? "font-bold text-emerald-600"
                            : "text-slate-400"
                        }`}
                      >
                        {info.seconds > 0 ? formatClock(info.seconds) : "—"}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">
                        {info.count} screenshot
                        {info.count === 1 ? "" : "s"}
                      </div>
                    </button>
                  );
                })}
                <div className="px-3 py-2 flex items-center justify-end text-sm font-bold bg-slate-50 dark:bg-slate-800/60">
                  Total: {formatClock(weekTotalSeconds)}
                </div>
              </div>
            </div>
          )}

          {historyView === "month" && (
            <div className="space-y-3 overflow-x-auto">
              {monthWeekKeys.map((week, weekIndex) => {
                const weekTotal = week.reduce((sum, key) => {
                  if (!key.startsWith(`${selectedMonthKey}-`)) {
                    return sum;
                  }
                  return sum + getDayInfo(key).seconds;
                }, 0);
                return (
                  <div
                    key={`month-week-${weekIndex}`}
                    className="min-w-[640px] grid grid-cols-[repeat(7,minmax(0,1fr))_minmax(120px,1.3fr)] rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden"
                  >
                    {week.map((key) => {
                      const dateObject = parseDateKey(key);
                      const isInMonth = key.startsWith(`${selectedMonthKey}-`);
                      const isSelected = key === selectedDate;
                      const isFuture = key > today;
                      const info = isInMonth
                        ? getDayInfo(key)
                        : { seconds: 0, count: 0 };
                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={!isInMonth || isFuture}
                          onClick={() => setSelectedDate(key)}
                          className={`text-left px-3 py-2 border-r border-slate-200 dark:border-slate-800 transition disabled:cursor-default ${
                            !isInMonth
                              ? "opacity-35 bg-slate-50/30 dark:bg-slate-900/30"
                              : isSelected
                                ? "bg-indigo-100 dark:bg-indigo-950/60"
                                : "hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
                          } ${isFuture ? "opacity-40" : ""}`}
                        >
                          <div className="text-xs font-bold">
                            {dateObject.toLocaleDateString("en-US", {
                              weekday: "short",
                            })}{" "}
                            <span className="font-normal text-slate-500">
                              {dateObject.getDate()}
                            </span>
                          </div>
                          <div
                            className={`text-xs mt-0.5 ${
                              info.seconds > 0
                                ? "font-bold text-emerald-600"
                                : "text-slate-400"
                            }`}
                          >
                            {isInMonth && info.seconds > 0
                              ? formatClock(info.seconds)
                              : "—"}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-1">
                            {isInMonth ? info.count : 0} screenshot
                            {info.count === 1 ? "" : "s"}
                          </div>
                        </button>
                      );
                    })}
                    <div className="px-3 py-2 flex items-center justify-end text-sm font-bold bg-slate-50 dark:bg-slate-800/60">
                      Week {weekIndex + 1}: {formatClock(weekTotal)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-4 py-3 text-sm">
            <span className="text-slate-500">
              {rangeTotalScreenshots} screenshot
              {rangeTotalScreenshots === 1 ? "" : "s"}
            </span>
            <span className="font-bold">
              {historyView === "day"
                ? "Daily Total"
                : historyView === "week"
                  ? "Weekly Total"
                  : historyView === "month"
                    ? "Monthly Total"
                    : "Overall Total"}
              :{" "}
              <span className="text-emerald-600">
                {loadingHistory && selectedDate !== today
                  ? "Loading..."
                  : formatSecondsToHoursMinutes(rangeTotalSeconds)}
              </span>
            </span>
          </div>
        </div>

        <div className="px-5 pb-5 pt-2">
          <div className="flex items-center justify-between gap-3 my-4">
            <div>
              <h3 className="font-bold flex items-center gap-2">
                <Camera className="w-4 h-4 text-indigo-600" />
                Screenshot History
              </h3>
              <div className="text-xs text-slate-500 mt-1">{selectedDate}</div>
            </div>
            <div className="text-xs font-bold text-indigo-600">
              {mergedScreenshots.length} captures
            </div>
          </div>

          {mergedScreenshots.length === 0 ? (
            <div className="py-14 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
              <Camera className="w-10 h-10 mx-auto text-slate-400 mb-2" />
              <div className="text-sm font-semibold">No screenshots found</div>
              <div className="text-xs text-slate-500 mt-1">
                No central screenshots are available for {selectedDate}.
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pagedScreenshots.map((screenshot) => (
                  <button
                    key={screenshot.id}
                    type="button"
                    onClick={() => setPreviewModal(screenshot)}
                    className="cursor-pointer text-left rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 hover:border-indigo-400 transition"
                  >
                    {(() => {
                      const source =
                        screenshot.driveThumbnailLink ||
                        screenshot.previewDataUrl ||
                        "";
                      const displayUrl =
                        employeeScreenshotUrls[source] ||
                        (source.startsWith("data:") ||
                        source.startsWith("blob:")
                          ? source
                          : "");
                      return displayUrl ? (
                        <img
                          src={displayUrl}
                          alt="Screenshot"
                          className="w-full aspect-video object-cover bg-slate-950"
                        />
                      ) : (
                        <div className="w-full aspect-video bg-slate-950 flex items-center justify-center text-xs text-slate-400">
                          Loading screenshot...
                        </div>
                      );
                    })()}
                    <div className="p-3">
                      <div className="text-xs font-bold">
                        {screenshot.taskName}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {screenshot.timeFormatted || "Saved capture"}
                      </div>
                      {(() => {
                        const counts = (
                          screenshot as ScreenshotLog & {
                            activityCounts?: ScreenshotActivityCounts;
                          }
                        ).activityCounts;
                        const activityPercent = Math.min(
                          100,
                          Math.max(0, Number(counts?.activityPercent) || 0),
                        );
                        const activityColor =
                          activityPercent === 0
                            ? "bg-slate-400"
                            : activityPercent <= 25
                              ? "bg-red-500"
                              : activityPercent <= 55
                                ? "bg-orange-500"
                                : "bg-green-500";
                        const activityTextColor =
                          activityPercent === 0
                            ? "text-slate-500"
                            : activityPercent <= 25
                              ? "text-red-500"
                              : activityPercent <= 55
                                ? "text-orange-500"
                                : "text-green-600";
                        return (
                          <div className="mt-3">
                            <div className="mb-1 flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                Activity
                              </span>
                              <span className={`text-xs font-bold ${activityTextColor}`}>
                                {activityPercent}%
                              </span>
                            </div>
                            <div
                              className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                              role="progressbar"
                              aria-label="Screenshot activity"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={activityPercent}
                            >
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${activityColor}`}
                                style={{ width: `${activityPercent}%` }}
                              />
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-slate-600 dark:text-slate-300">
                              <div className="rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">
                                <div className="font-semibold">Mouse moves</div>
                                <div>{counts?.mouseMoves ?? 0}</div>
                              </div>
                              <div className="rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">
                                <div className="font-semibold">Clicks</div>
                                <div>{counts?.mouseClicks ?? 0}</div>
                              </div>
                              <div className="rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">
                                <div className="font-semibold">Key presses</div>
                                <div>{counts?.keyPresses ?? 0}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </button>
                ))}
              </div>

              {mergedScreenshots.length > SCREENSHOTS_PER_PAGE && (
                <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">
                    Showing {(currentPage - 1) * SCREENSHOTS_PER_PAGE + 1}
                    {"–"}
                    {Math.min(
                      currentPage * SCREENSHOTS_PER_PAGE,
                      mergedScreenshots.length,
                    )}{" "}
                    of {mergedScreenshots.length}
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() =>
                        setCurrentPage((previous) => Math.max(1, previous - 1))
                      }
                      className="cursor-pointer inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:border-indigo-400 transition"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Prev
                    </button>
                    {pageNumbers.map((page) =>
                      typeof page === "number" ? (
                        <button
                          key={page}
                          type="button"
                          onClick={() => setCurrentPage(page)}
                          className={`cursor-pointer min-w-[36px] px-3 py-2 rounded-lg text-xs font-bold border transition ${
                            currentPage === page
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 hover:border-indigo-400"
                          }`}
                        >
                          {page}
                        </button>
                      ) : (
                        <span
                          key={page}
                          className="px-1 text-xs text-slate-500"
                        >
                          …
                        </span>
                      ),
                    )}
                    <button
                      type="button"
                      disabled={currentPage === totalPages}
                      onClick={() =>
                        setCurrentPage((previous) =>
                          Math.min(totalPages, previous + 1),
                        )
                      }
                      className="cursor-pointer inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:border-indigo-400 transition"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* SCREEN SHARE RECONNECT POPUP */}
      {isTracking && needsScreenShare && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="screen-share-reconnect-title"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950">
              <Monitor className="h-7 w-7 text-indigo-600" />
            </div>
            <h2
              id="screen-share-reconnect-title"
              className="text-center text-xl font-black text-slate-900 dark:text-white"
            >
              Reconnect screen sharing
            </h2>
            <p className="mt-3 text-center text-sm leading-6 text-slate-600 dark:text-slate-300">
              Your timer is still running, but screenshots are paused until you
              share your screen again. Click below, then choose the screen in
              your browser's sharing window. A loud alarm will sound after one
              minute and repeat every minute until sharing reconnects.
            </p>
            <button
              type="button"
              onClick={() => void reconnectScreenShare()}
              className="mt-6 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white transition hover:bg-indigo-500"
            >
              <Monitor className="h-4 w-4" />
              Choose screen &amp; reconnect
            </button>
            <p className="mt-3 text-center text-xs text-slate-500">
              Browser security requires you to click this button before the
              screen-sharing chooser can open.
            </p>
          </div>
        </div>
      )}

      {/* PREVIEW */}
      {previewModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewModal(null)}
        >
          <div
            className="w-full max-w-6xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-end mb-2">
              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                className="cursor-pointer p-2 text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden">
              {(() => {
                const source =
                  previewModal.driveThumbnailLink ||
                  previewModal.previewDataUrl ||
                  "";
                const displayUrl =
                  employeeScreenshotUrls[source] ||
                  (source.startsWith("data:") || source.startsWith("blob:")
                    ? source
                    : "");
                return displayUrl ? (
                  <img
                    src={displayUrl}
                    alt="Screenshot preview"
                    className="w-full max-h-[80vh] object-contain bg-slate-950"
                  />
                ) : (
                  <div className="min-h-[320px] flex items-center justify-center bg-slate-950 text-slate-400">
                    Loading screenshot...
                  </div>
                );
              })()}
              <div className="p-4">
                <div className="font-bold">{previewModal.taskName}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {previewModal.timeFormatted}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HIDDEN VIDEO */}
      <video
        ref={screenVideoRef}
        autoPlay
        muted
        playsInline
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "2px",
          height: "2px",
          opacity: 0.01,
          pointerEvents: "none",
          zIndex: -1,
        }}
      />
    </div>
  );
};
