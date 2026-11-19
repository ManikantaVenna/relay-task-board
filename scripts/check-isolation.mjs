import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
assert(
  url && key,
  "Provide the Supabase project URL and public key in .env.local.",
);
const makeClient = () =>
  createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
const first = makeClient(),
  second = makeClient(),
  unsigned = makeClient();
const ids = [];
let assertions = 0;
function check(condition, message) {
  assert(condition, message);
  assertions++;
  console.log(`PASS ${message}`);
}
async function result(query) {
  const response = await query;
  if (response.error) throw response.error;
  return response.data;
}
try {
  const authA = await first.auth.signInAnonymously();
  if (authA.error) throw authA.error;
  const authB = await second.auth.signInAnonymously();
  if (authB.error) throw authB.error;
  const a = authA.data.user.id,
    b = authB.data.user.id;
  check(a !== b, "Two anonymous sign-ins create distinct guest users");
  const taskA = await result(
    first
      .from("tasks")
      .insert({ title: "Disposable isolation check A", user_id: a })
      .select()
      .single(),
  );
  ids.push([first, taskA.id]);
  const taskB = await result(
    second
      .from("tasks")
      .insert({ title: "Disposable isolation check B", user_id: b })
      .select()
      .single(),
  );
  ids.push([second, taskB.id]);
  check(
    taskA.status === "todo" && Boolean(taskA.created_at),
    "Defaults and server timestamps are present",
  );
  check(
    (await result(first.from("tasks").select("id"))).some(
      (t) => t.id === taskA.id,
    ),
    "Guest A can read its task",
  );
  check(
    !(await result(second.from("tasks").select("id"))).some(
      (t) => t.id === taskA.id,
    ),
    "Guest B cannot list Guest A’s task",
  );
  check(
    (await result(second.from("tasks").select("*").eq("id", taskA.id)))
      .length === 0,
    "Direct ID lookup cannot bypass RLS",
  );
  check(
    (
      await result(
        second
          .from("tasks")
          .update({ title: "Unauthorized edit" })
          .eq("id", taskA.id)
          .select(),
      )
    ).length === 0,
    "Guest B cannot update Guest A’s task",
  );
  check(
    (await result(second.from("tasks").delete().eq("id", taskA.id).select()))
      .length === 0,
    "Guest B cannot delete Guest A’s task",
  );
  check(
    Boolean(
      (await second.from("tasks").insert({ title: "Forged owner", user_id: a }))
        .error,
    ),
    "Insert cannot forge another owner",
  );
  check(
    Boolean(
      (await first.from("tasks").update({ user_id: b }).eq("id", taskA.id))
        .error,
    ),
    "Task ownership cannot be reassigned by a client",
  );
  check(
    Boolean(
      (
        await first
          .from("tasks")
          .update({ created_at: "2000-01-01T00:00:00Z" })
          .eq("id", taskA.id)
      ).error,
    ),
    "Client cannot forge server-created timestamps",
  );
  await result(
    first
      .from("comments")
      .insert({ task_id: taskA.id, user_id: a, body: "Owner comment" }),
  );
  check(
    (await result(first.from("comments").select("*").eq("task_id", taskA.id)))
      .length === 1,
    "Owner comments persist",
  );
  check(
    (await result(second.from("comments").select("*").eq("task_id", taskA.id)))
      .length === 0,
    "Guest B cannot read Guest A’s comments",
  );
  check(
    Boolean(
      (
        await second
          .from("comments")
          .insert({
            task_id: taskA.id,
            user_id: b,
            body: "Cross-owner comment",
          })
      ).error,
    ),
    "Composite foreign key blocks comments on another guest’s task",
  );
  await result(
    first
      .from("tasks")
      .update({ status: "in_progress", priority: "high" })
      .eq("id", taskA.id),
  );
  const persisted = await result(
    first.from("tasks").select("*").eq("id", taskA.id).single(),
  );
  check(
    persisted.status === "in_progress" && persisted.priority === "high",
    "Task moves and edits persist",
  );
  const activity = await result(
    first.from("task_activity").select("*").eq("task_id", taskA.id),
  );
  check(
    activity.length === 2 &&
      activity.some((x) =>
        x.description.includes("Moved from To Do to In Progress"),
      ),
    "Database trigger records creation and status changes",
  );
  check(
    (
      await result(
        second.from("task_activity").select("*").eq("task_id", taskA.id),
      )
    ).length === 0,
    "Guest B cannot read Guest A’s activity",
  );
  check(
    Boolean(
      (
        await first
          .from("task_activity")
          .insert({
            task_id: taskA.id,
            user_id: a,
            description: "Fake activity",
          })
      ).error,
    ),
    "Clients cannot forge activity log entries",
  );
  check(
    Boolean((await unsigned.from("tasks").select("*")).error),
    "Requests without a guest session have no table access",
  );
  check(
    Boolean(
      (await first.from("tasks").insert({ title: " ", user_id: a })).error,
    ),
    "Database rejects blank titles",
  );
  check(
    Boolean(
      (
        await first
          .from("tasks")
          .insert({ title: "Invalid status", status: "invalid", user_id: a })
      ).error,
    ),
    "Database rejects invalid status values",
  );
  check(
    Boolean(
      (
        await first
          .from("tasks")
          .insert({ title: "Invalid priority", priority: "urgent", user_id: a })
      ).error,
    ),
    "Database rejects invalid priority values",
  );
  console.log(`\n${assertions} live database checks passed.`);
} finally {
  for (const [db, id] of ids) {
    const r = await db.from("tasks").delete().eq("id", id);
    if (r.error)
      console.error("Could not remove disposable test task:", r.error.message);
  }
  for (const db of [first, second]) await db.auth.signOut();
}
