begin;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 5000),
  status text not null default 'todo' check (status in ('todo','in_progress','in_review','done')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  due_date date,
  labels text[] not null default '{}' check (cardinality(labels) <= 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index tasks_owner_status on public.tasks(user_id, status);
create index tasks_owner_created on public.tasks(user_id, created_at desc);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade
);
create index comments_task_created on public.comments(task_id, created_at);

create table public.task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  created_at timestamptz not null default now(),
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade
);
create index activity_task_created on public.task_activity(task_id, created_at);

alter table public.tasks enable row level security;
alter table public.comments enable row level security;
alter table public.task_activity enable row level security;

create policy tasks_read_own on public.tasks for select to authenticated using ((select auth.uid()) = user_id);
create policy tasks_insert_own on public.tasks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy tasks_update_own on public.tasks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy tasks_delete_own on public.tasks for delete to authenticated using ((select auth.uid()) = user_id);
create policy comments_read_own on public.comments for select to authenticated using ((select auth.uid()) = user_id);
create policy comments_insert_own on public.comments for insert to authenticated with check ((select auth.uid()) = user_id);
create policy activity_read_own on public.task_activity for select to authenticated using ((select auth.uid()) = user_id);

-- Explicit grants also work when automatic Data API grants are disabled.
revoke all on public.tasks, public.comments, public.task_activity from anon, authenticated;
grant usage on schema public to authenticated;
grant select, delete on public.tasks to authenticated;
grant insert (id, user_id, title, description, status, priority, due_date, labels) on public.tasks to authenticated;
grant update (title, description, status, priority, due_date, labels) on public.tasks to authenticated;
grant select on public.comments, public.task_activity to authenticated;
grant insert (id, task_id, user_id, body) on public.comments to authenticated;

create function public.stamp_task_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger stamp_task_update before update on public.tasks for each row execute function public.stamp_task_update();

-- Only this trigger writes history; clients cannot forge audit entries.
create function public.record_task_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare details text[] := '{}';
begin
  if tg_op = 'INSERT' then
    details := array['Created this task'];
  else
    if new.status is distinct from old.status then
      details := array_append(details, 'Moved from ' || replace(initcap(replace(old.status, '_', ' ')), 'Todo', 'To Do') || ' to ' || replace(initcap(replace(new.status, '_', ' ')), 'Todo', 'To Do'));
    end if;
    if new.title is distinct from old.title then details := array_append(details, 'Updated the title'); end if;
    if new.description is distinct from old.description then details := array_append(details, 'Updated the description'); end if;
    if new.priority is distinct from old.priority then details := array_append(details, 'Set priority to ' || new.priority); end if;
    if new.due_date is distinct from old.due_date then details := array_append(details, case when new.due_date is null then 'Removed the due date' else 'Set due date to ' || new.due_date::text end); end if;
    if new.labels is distinct from old.labels then details := array_append(details, 'Updated labels'); end if;
  end if;
  if cardinality(details) > 0 then
    insert into public.task_activity(task_id, user_id, description) values (new.id, new.user_id, array_to_string(details, ' · '));
  end if;
  return new;
end;
$$;
revoke all on function public.record_task_activity() from public;
revoke all on function public.stamp_task_update() from public;
create trigger record_task_activity after insert or update on public.tasks for each row execute function public.record_task_activity();

commit;
