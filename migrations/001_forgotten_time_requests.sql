CREATE TABLE IF NOT EXISTS forgotten_time_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  employee_name TEXT,
  employee_email TEXT,
  date_key TEXT NOT NULL,
  from_time TEXT NOT NULL,
  to_time TEXT NOT NULL,
  requested_seconds INTEGER NOT NULL DEFAULT 0,
  approved_seconds INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT,
  review_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_ftr_employee_date ON forgotten_time_requests (employee_id, date_key);
CREATE INDEX IF NOT EXISTS idx_ftr_status ON forgotten_time_requests (status);
