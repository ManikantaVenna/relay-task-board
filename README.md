# Relay task board

A responsive Kanban workspace built with React, TypeScript, Vite, Supabase, and dnd kit. Tasks belong to an automatically created guest account, with ownership enforced in PostgreSQL.

## Run locally

Requires Node.js 22.12+ or 24+.

1. Create a free Supabase project and enable **Authentication → Sign In / Providers → Allow anonymous sign-ins**.
2. Run `supabase/schema.sql` once in the project's SQL Editor. It creates three tables, owner policies, explicit API grants, and timestamp/activity triggers in one transaction.
3. Copy `.env.example` to `.env.local` and enter the project URL and **public publishable key**. Never use a service-role/secret key.
4. Run `npm ci`, then `npm run dev`.

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-publishable-key
```

For a production bundle, run `npm run build`. Deploy `dist/` to a static host. Set the same two public environment variables before building. The project requires no custom API server.

Without configuration, the app shows setup instructions and an explicitly labeled browser-local preview. The normal configured app always uses Supabase. Preview data never claims to be database-backed.

## What works

- Four columns: To Do, In Progress, In Review, Done.
- Create, edit, delete, and move tasks. Drag with the dedicated grip; on a focused grip press Space, Left/Right, then Space to move by keyboard. Task details also offer a status selector.
- Title, description, priority, due date, and up to six custom labels.
- Combined title search, priority filtering, label filtering, and due-soon/completed views.
- Board and list layouts, task counts, completion progress, and overdue counts.
- Task comments and database-generated activity history.
- Responsive board with horizontal scrolling on narrow screens, accessible modal dialogs, loading/empty/error states, reduced-motion support, and optimistic moves with rollback after a failed save.
- An optional **Add sample tasks** action creates six editable fictional sports-product tasks in the current user's account. New users start with an empty board.

## Data and access

`tasks` stores task content, owner UUID, status, priority, date, labels, and timestamps. `comments` and `task_activity` reference `(task_id, user_id)`, so a child record cannot point to another user's task. See the full SQL in `supabase/schema.sql`.

All tables have RLS. Authenticated guest users can access only rows whose `user_id` equals `auth.uid()`. Unsigned requests have no table grants. Clients cannot change owner IDs or server timestamps. Only the database trigger can write activity entries. The public frontend key is intended to be visible; RLS is the access boundary.

A guest session persists in browser storage and refreshes through Supabase Auth. Clearing browser data or switching browser profiles creates a different identity; this version has no account-recovery or cross-device sign-in flow.

## Structure

```text
src/App.tsx            Workspace layout, board state and mutations
src/components/       Task cards, columns, details, comments and shared controls
src/data.ts           Supabase repository and separately labeled local preview
src/domain.ts         Validation, filtering and calendar-date logic
src/styles.css        Responsive layout and visual system
supabase/schema.sql   Tables, constraints, RLS, grants and triggers
scripts/check-isolation.mjs  Live two-guest access checks
```

The frontend calls Supabase directly. A small repository boundary keeps database calls out of visual components and lets the preview share the interface without silently replacing production persistence. The app updates on drop and after mutations; Refresh reloads server state. There is no realtime subscription or collaborative shared board.

## Verification

Run `npm test` for validation, label normalization, combined filters, and local-calendar due-date cases. Run `npm run build` for strict TypeScript checking and production compilation.

With a configured **disposable development project**, `npm run test:security` creates two anonymous users and disposable task/comment records. It checks owner reads/writes, direct-ID attacks, cross-owner child records, immutable fields, generated activity, and database constraints. It removes the test tasks in `finally`, cascading their comments/activity; anonymous auth records remain. Use a fresh development project and respect Supabase sign-in rate limits.

## Tradeoffs and next steps

- Card order follows creation time; status changes persist, but custom ordering within a column is out of scope.
- Comments show the latest 100 in chronological order; history shows the latest 100 changes. A larger workspace would need paginated detail views and server-side search.
- Filters and board/list layout reset on reload; task content and guest identity persist.
- There are no team members or shared assignments. Adding genuine shared workspaces would require a membership model and different RLS policies.
- For a broader public launch, add CAPTCHA to anonymous sign-in, guest-account cleanup, monitoring, and account linking/recovery. Keep the existing auth rate limits and owner policies.
- A static deployment uses the public project key at build time; changing Supabase projects requires a rebuild.
