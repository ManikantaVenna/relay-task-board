import type { SupabaseClient } from '@supabase/supabase-js';
import { type Activity, type Comment, type Task, type TaskInput, localDate, statusName } from './domain';

export const configured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
export interface Repository {
  userId: string;
  list(): Promise<Task[]>;
  create(input: TaskInput): Promise<Task>;
  update(id: string, input: Partial<TaskInput>): Promise<Task>;
  remove(id: string): Promise<void>;
  comments(id: string): Promise<Comment[]>;
  comment(id: string, body: string): Promise<Comment>;
  activity(id: string): Promise<Activity[]>;
}
let initialization: Promise<Repository> | null = null;
let client: SupabaseClient | null = null;
export function repository(preview: boolean): Promise<Repository> {
  if (preview) return Promise.resolve(previewRepository());
  if (!configured) return Promise.reject(new Error('Missing configuration'));
  if (!initialization) initialization = initialize().catch(error => { initialization = null; throw error; });
  return initialization;
}
async function initialize(): Promise<Repository> {
  const { createClient } = await import('@supabase/supabase-js');
  client ??= createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
  const db = client;
  const existing = await db.auth.getSession();
  if (existing.error) throw existing.error;
  let userId = existing.data.session?.user.id;
  if (!userId) {
    const result = await db.auth.signInAnonymously();
    if (result.error) throw result.error;
    userId = result.data.user?.id;
  }
  if (!userId) throw new Error('Session unavailable');
  const owner = userId;
  return {
    userId: owner,
    async list() {
      const tasks: Task[] = [];
      for (let from = 0; ; from += 1000) {
        const result = await db.from('tasks').select('*').eq('user_id', owner).order('created_at', {ascending: false}).order('id').range(from, from + 999);
        if (result.error) throw result.error;
        tasks.push(...result.data as Task[]);
        if (result.data.length < 1000) return tasks;
      }
    },
    async create(input) {
      const result = await db.from('tasks').insert({...input, title: input.title.trim(), user_id: owner}).select().single();
      if (result.error) throw result.error;
      return result.data as Task;
    },
    async update(id, input) {
      const result = await db.from('tasks').update(input).eq('id', id).eq('user_id', owner).select().single();
      if (result.error) throw result.error;
      return result.data as Task;
    },
    async remove(id) {
      const result = await db.from('tasks').delete().eq('id', id).eq('user_id', owner).select('id').single();
      if (result.error) throw result.error;
    },
    async comments(id) {
      const result = await db.from('comments').select('*').eq('task_id', id).eq('user_id', owner).order('created_at', {ascending: false}).limit(100);
      if (result.error) throw result.error;
      return result.data.reverse() as Comment[];
    },
    async comment(id, body) {
      const result = await db.from('comments').insert({task_id: id, user_id: owner, body: body.trim()}).select().single();
      if (result.error) throw result.error;
      return result.data as Comment;
    },
    async activity(id) {
      const result = await db.from('task_activity').select('*').eq('task_id', id).eq('user_id', owner).order('created_at', {ascending: false}).limit(100);
      if (result.error) throw result.error;
      return result.data as Activity[];
    },
  };
}

interface PreviewStore { tasks: Task[]; comments: Comment[]; activity: Activity[] }
const previewKey = 'relay-preview-v1';
const previewOwner = '00000000-0000-4000-8000-000000000001';
export function exampleTasks(): TaskInput[] {
  const date = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return localDate(d); };
  return [
    {title: 'Plan the matchday release', description: 'Choose what ships before Saturday. Keep score updates and team signup at the top of the list.',status:'todo',priority:'high',due_date:date(1),labels:['Planning']},
    {title: 'Simplify team signup', description: 'Sketch a shorter registration flow. Ask for the team name first and collect the roster later.',status:'todo',priority:'normal',due_date:date(3),labels:['Design']},
    {title: 'Polish live score cards', description: 'Check team-name wrapping, score alignment, and touch targets on a small screen.',status:'in_progress',priority:'high',due_date:date(0),labels:['Design','Frontend']},
    {title: 'Connect the fixtures API', description: 'Handle postponed matches and missing kick-off times without leaving blank cards.',status:'in_progress',priority:'normal',due_date:date(2),labels:['Engineering']},
    {title: 'Review the mobile ticket flow', description: 'Make the QR code easy to find and include the venue entrance in the confirmation.',status:'in_review',priority:'normal',due_date:date(-1),labels:['Design']},
    {title: 'Set up the launch board', description: 'Group the release tasks, choose priorities, and give each task a clear next step.',status:'done',priority:'low',due_date:date(-2),labels:['Planning']},
  ];
}
function loadPreview(): PreviewStore {
  const value = localStorage.getItem(previewKey);
  if (value) { try { const parsed = JSON.parse(value); if (Array.isArray(parsed.tasks) && Array.isArray(parsed.comments) && Array.isArray(parsed.activity)) return parsed; } catch { /* Reset only invalid preview data. */ } }
  const now = new Date().toISOString();
  const data = {tasks: exampleTasks().map(t => ({...t,id:crypto.randomUUID(),user_id:previewOwner,created_at:now,updated_at:now})), comments:[],activity:[]} as PreviewStore;
  localStorage.setItem(previewKey, JSON.stringify(data)); return data;
}
function previewRepository(): Repository {
  const persist = (data: PreviewStore) => localStorage.setItem(previewKey, JSON.stringify(data));
  const record = (data: PreviewStore, taskId: string, description: string) => data.activity.unshift({id:crypto.randomUUID(),task_id:taskId,user_id:previewOwner,description,created_at:new Date().toISOString()});
  return {
    userId: previewOwner,
    async list() { return loadPreview().tasks; },
    async create(input) {
      const data = loadPreview(); const now = new Date().toISOString();
      const task = {...input,id:crypto.randomUUID(),user_id:previewOwner,created_at:now,updated_at:now};
      data.tasks.unshift(task); record(data, task.id, 'Created this task'); persist(data); return task;
    },
    async update(id, input) {
      const data = loadPreview(); const old = data.tasks.find(t => t.id === id); if (!old) throw new Error('Task unavailable');
      const updated = {...old,...input,updated_at:new Date().toISOString()};
      data.tasks = data.tasks.map(t => t.id === id ? updated : t);
      record(data,id,input.status && input.status !== old.status ? `Moved from ${statusName(old.status)} to ${statusName(input.status)}` : 'Updated this task'); persist(data); return updated;
    },
    async remove(id) { const d=loadPreview();d.tasks=d.tasks.filter(t=>t.id!==id);d.comments=d.comments.filter(c=>c.task_id!==id);d.activity=d.activity.filter(a=>a.task_id!==id);persist(d); },
    async comments(id) { return loadPreview().comments.filter(c=>c.task_id===id); },
    async comment(id, body) { const d=loadPreview();const c={id:crypto.randomUUID(),task_id:id,user_id:previewOwner,body,created_at:new Date().toISOString()};d.comments.push(c);persist(d);return c; },
    async activity(id) { return loadPreview().activity.filter(a=>a.task_id===id); },
  };
}
