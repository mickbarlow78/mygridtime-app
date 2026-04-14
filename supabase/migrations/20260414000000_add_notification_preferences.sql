-- notification_preferences: global per-email unsubscribe for event notifications.
-- Access via service-role client only. RLS enabled with no policies = deny all user access.

create table if not exists notification_preferences (
  id          uuid        primary key default gen_random_uuid(),
  email       text        not null unique,
  token       uuid        not null default gen_random_uuid() unique,
  unsubscribed boolean   not null default false,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- Enforce lowercase email at the database level
alter table notification_preferences
  add constraint notification_preferences_email_lowercase
  check (email = lower(email));

-- RLS enabled, no policies — all access must go through service-role client
alter table notification_preferences enable row level security;
