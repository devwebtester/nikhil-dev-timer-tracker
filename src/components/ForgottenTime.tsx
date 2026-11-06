import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, X } from 'lucide-react';

export type ForgottenStatus = 'pending' | 'approved' | 'declined';

export interface ForgottenRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  startTime: string;
  endTime: string;
  requestedSeconds: number;
  reason: string;
  status: ForgottenStatus;
  createdAt: string;
  adminId?: string | null;
  adminResponse?: string;
  decidedAt?: string | null;
  approvedSeconds?: number;
}

export type ApiRequest = (path: string, init?: RequestInit) => Promise<Response>;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const fmtDur = (seconds: number) => {
  const m = Math.round((Number(seconds) || 0) / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m % 60}m`;
};

const fmt12 = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const readJson = async (res: Response) => {
  try {
    return await res.json();
  } catch {
    return {};
  }
};

const STATUS_STYLE: Record<ForgottenStatus, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  declined: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
};

const StatusBadge: React.FC<{ status: ForgottenStatus }> = ({ status }) => (
  <span className={`px-2 py-1 rounded-full text-[10px] font-bold capitalize ${STATUS_STYLE[status]}`}>
    {status}
  </span>
);

const inputCls =
  'mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm';

/* ==========================================================================
   EMPLOYEE
========================================================================== */

interface EmployeeProps {
  employeeId: string;
  todayKey: string;
  request: ApiRequest;
}

export const EmployeeForgottenTime: React.FC<EmployeeProps> = ({ employeeId, todayKey, request }) => {
  const [requests, setRequests] = useState<ForgottenRequest[]>([]);
  const [showList, setShowList] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState(todayKey);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await request(`/api/forgotten-time/employee/${encodeURIComponent(employeeId)}`, {
        method: 'GET',
        cache: 'no-store',
      });
      const data = await readJson(res);
      if (res.ok && data?.success) setRequests(data.requests || []);
    } catch (e) {
      console.warn('Forgotten time load failed:', e);
    }
  }, [employeeId, request]);

  useEffect(() => {
    void load();
  }, [load]);

  const durationSeconds =
    startTime && endTime && toMin(endTime) > toMin(startTime) ? (toMin(endTime) - toMin(startTime)) * 60 : 0;

  const openForm = () => {
    setError('');
    setNotice('');
    setDate(todayKey);
    setReason('');
    setShowForm(true);
  };

  const submit = async () => {
    setError('');
    if (!date || !startTime || !endTime || !reason.trim()) return setError('All fields are required.');
    if (date > todayKey) return setError('Future dates are not allowed.');
    if (toMin(startTime) >= toMin(endTime)) return setError('Start time must be before end time.');

    setSaving(true);
    try {
      const res = await request('/api/forgotten-time', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ employeeId, date, startTime, endTime, reason }),
      });
      const data = await readJson(res);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Request failed.');
      setShowForm(false);
      setShowList(true);
      setNotice('✅ Request submitted. Waiting for Admin approval.');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Request failed.');
    } finally {
      setSaving(false);
    }
  };

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="font-bold">Forgot to start your timer?</div>
          <div className="text-xs text-slate-500 mt-1">Submit your missing work time for Admin approval.</div>
        </div>
        <button
          type="button"
          onClick={openForm}
          className="cursor-pointer px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
        >
          Request Missed Time
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-bold">My Forgotten Time Requests</div>
            <div className="text-xs text-slate-500 mt-1">
              {requests.length} request{requests.length === 1 ? '' : 's'}
              {pendingCount > 0 ? ` • ${pendingCount} pending` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowList((v) => !v);
              void load();
            }}
            className="cursor-pointer px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold"
          >
            {showList ? 'Hide Requests' : 'View Requests'}
          </button>
        </div>

        {notice && <div className="text-xs font-semibold text-emerald-600">{notice}</div>}

        {showList &&
          (requests.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
              No requests yet.
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((r) => (
                <div key={r.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-bold">
                      {r.date} • {fmt12(r.startTime)} – {fmt12(r.endTime)}
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {fmtDur(r.requestedSeconds)}
                  </div>
                  <div className="text-xs">{r.reason}</div>
                  {r.adminResponse && (
                    <div className="text-xs rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2">
                      <span className="font-bold">Admin response:</span> {r.adminResponse}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">Request Missed Time</h3>
              <button type="button" onClick={() => setShowForm(false)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <label className="block text-xs font-bold uppercase text-slate-500">
              Date
              <input type="date" value={date} max={todayKey} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-bold uppercase text-slate-500">
                Start Time
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} />
              </label>
              <label className="block text-xs font-bold uppercase text-slate-500">
                End Time
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} />
              </label>
            </div>

            <div className="text-xs font-bold text-indigo-600">
              Requested duration: {durationSeconds > 0 ? fmtDur(durationSeconds) : '—'}
            </div>

            <label className="block text-xs font-bold uppercase text-slate-500">
              Reason
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="I forgot to start the timer after logging in."
                className={inputCls}
              />
            </label>

            {error && <div className="text-xs font-semibold text-rose-600">{error}</div>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void submit()}
                disabled={saving}
                className="cursor-pointer flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-bold"
              >
                {saving ? 'Submitting...' : 'Submit Request'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="cursor-pointer px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-bold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ==========================================================================
   ADMIN
========================================================================== */

interface AdminProps {
  request: ApiRequest;
  employees: { id: string; name: string }[];
  onChanged?: () => void;
}

export const AdminForgottenTime: React.FC<AdminProps> = ({ request, employees, onChanged }) => {
  const [rows, setRows] = useState<ForgottenRequest[]>([]);
  const [status, setStatus] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<ForgottenRequest | null>(null);
  const [response, setResponse] = useState('');
  const [acting, setActing] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (employeeId) p.set('employeeId', employeeId);
    if (date) p.set('date', date);
    const s = p.toString();
    return s ? `?${s}` : '';
  }, [status, employeeId, date]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request(`/api/admin/forgotten-time${query}`, { method: 'GET', cache: 'no-store' });
      const data = await readJson(res);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to load requests.');
      setRows(data.requests || []);
    } catch (e: any) {
      setMessage(`❌ ${e?.message || 'Failed to load requests.'}`);
    } finally {
      setLoading(false);
    }
  }, [request, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (kind: 'approve' | 'decline') => {
    if (!selected) return;
    if (kind === 'decline' && !response.trim()) {
      setMessage('❌ Please enter a decline reason.');
      return;
    }
    setActing(true);
    try {
      const res = await request(`/api/admin/forgotten-time/${encodeURIComponent(selected.id)}/${kind}`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(kind === 'approve' ? { response } : { reason: response }),
      });
      const data = await readJson(res);
      if (!res.ok || !data?.success) throw new Error(data?.error || `${kind} failed.`);
      setMessage(kind === 'approve' ? '✅ Request approved.' : '✅ Request declined.');
      setSelected(null);
      setResponse('');
      await load();
      onChanged?.();
    } catch (e: any) {
      setMessage(`❌ ${e?.message || 'Action failed.'}`);
      await load();
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <label className="text-[11px] font-bold uppercase text-slate-500">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="declined">Declined</option>
          </select>
        </label>
        <label className="text-[11px] font-bold uppercase text-slate-500">
          Employee
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputCls}>
            <option value="">All</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] font-bold uppercase text-slate-500">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => void load()}
            className="cursor-pointer w-full py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {message && <div className="text-xs font-semibold">{message}</div>}

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs">
            <tr>
              {['Employee', 'Date', 'Start', 'End', 'Duration', 'Reason', 'Submitted', 'Status'].map((h) => (
                <th key={h} className="text-left p-3 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => {
                  setSelected(r);
                  setResponse('');
                }}
                className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/70"
              >
                <td className="p-3 font-bold whitespace-nowrap">{r.employeeName}</td>
                <td className="p-3 whitespace-nowrap">{r.date}</td>
                <td className="p-3 whitespace-nowrap">{fmt12(r.startTime)}</td>
                <td className="p-3 whitespace-nowrap">{fmt12(r.endTime)}</td>
                <td className="p-3 whitespace-nowrap">{fmtDur(r.requestedSeconds)}</td>
                <td className="p-3 max-w-[220px] truncate">{r.reason}</td>
                <td className="p-3 whitespace-nowrap text-xs">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="p-3">
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="p-10 text-center text-xs text-slate-500">
                  No forgotten time requests found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">Request Details</h3>
              <button type="button" onClick={() => setSelected(null)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-sm space-y-1">
              <div><b>Employee:</b> {selected.employeeName}</div>
              <div><b>Date:</b> {selected.date}</div>
              <div><b>Time:</b> {fmt12(selected.startTime)} – {fmt12(selected.endTime)} ({fmtDur(selected.requestedSeconds)})</div>
              <div><b>Reason:</b> {selected.reason}</div>
              <div><b>Submitted:</b> {new Date(selected.createdAt).toLocaleString()}</div>
              <div className="flex items-center gap-2"><b>Status:</b> <StatusBadge status={selected.status} /></div>
              {selected.adminResponse && <div><b>Admin response:</b> {selected.adminResponse}</div>}
              {selected.decidedAt && <div><b>Decided:</b> {new Date(selected.decidedAt).toLocaleString()}</div>}
            </div>

            {selected.status === 'pending' && (
              <>
                <label className="block text-xs font-bold uppercase text-slate-500">
                  Response (required for decline)
                  <textarea value={response} onChange={(e) => setResponse(e.target.value)} rows={2} className={inputCls} />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={acting}
                    onClick={() => void act('approve')}
                    className="cursor-pointer flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-bold"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={acting}
                    onClick={() => void act('decline')}
                    className="cursor-pointer flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white text-sm font-bold"
                  >
                    Decline
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};