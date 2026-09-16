-- PostgreSQL schema for the production persistence layer.
-- Run this once against your PostgreSQL/Supabase database.

create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table if not exists connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references users(id) on delete cascade,
  addressee_id uuid not null references users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connections_not_self check (requester_id <> addressee_id),
  unique(requester_id, addressee_id)
);

create table if not exists connection_codes (
  code char(4) primary key check (code ~ '^[0-9]{4}$'),
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used_at timestamptz
);

create index if not exists connection_codes_user_idx on connection_codes(user_id, expires_at desc);
create index if not exists connection_codes_active_idx on connection_codes(expires_at) where used_at is null;

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references users(id) on delete cascade,
  recipient_id uuid not null references users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  constraint messages_not_self check (sender_id <> recipient_id)
);

create index if not exists messages_pair_idx on messages(sender_id, recipient_id, created_at desc);
create index if not exists messages_recipient_idx on messages(recipient_id, created_at desc);
create index if not exists connections_addressee_idx on connections(addressee_id, status, updated_at desc);
create index if not exists connections_requester_idx on connections(requester_id, status, updated_at desc);

create or replace function touch_connections_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists connections_updated_at on connections;
create trigger connections_updated_at
before update on connections
for each row execute function touch_connections_updated_at();
