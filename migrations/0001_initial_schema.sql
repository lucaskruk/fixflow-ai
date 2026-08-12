PRAGMA foreign_keys = ON;

CREATE TABLE repairs (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  customer_name TEXT NOT NULL CHECK (length(trim(customer_name)) > 0),
  customer_phone TEXT CHECK (customer_phone IS NULL OR length(trim(customer_phone)) > 0),
  brand TEXT NOT NULL CHECK (length(trim(brand)) > 0),
  model TEXT NOT NULL CHECK (length(trim(model)) > 0),
  serial_number TEXT CHECK (serial_number IS NULL OR length(trim(serial_number)) > 0),
  reported_issue TEXT NOT NULL CHECK (length(trim(reported_issue)) > 0),
  accessories TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(accessories) AND json_type(accessories) = 'array'),
  status TEXT NOT NULL CHECK (status IN ('RECEIVED', 'DIAGNOSING', 'REPAIRING', 'READY', 'DELIVERED')),
  diagnosis TEXT CHECK (diagnosis IS NULL OR length(trim(diagnosis)) > 0),
  solution TEXT CHECK (solution IS NULL OR length(trim(solution)) > 0),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24)
);

CREATE TABLE repair_events (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  repair_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('NOTE', 'MEASUREMENT', 'AI_SUGGESTION', 'DIAGNOSIS', 'REPAIR')),
  content TEXT NOT NULL CHECK (length(trim(content)) > 0),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  FOREIGN KEY (repair_id) REFERENCES repairs(id) ON DELETE CASCADE
);

CREATE INDEX repairs_updated_at_idx ON repairs(updated_at DESC);
CREATE INDEX repair_events_repair_created_idx ON repair_events(repair_id, created_at ASC);
