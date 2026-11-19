export const columns = [
  { id: 'todo', name: 'To Do', className: 'todo' },
  { id: 'in_progress', name: 'In Progress', className: 'progress' },
  { id: 'in_review', name: 'In Review', className: 'review' },
  { id: 'done', name: 'Done', className: 'done' },
] as const;
export type Status = typeof columns[number]['id'];
export type Priority = 'low' | 'normal' | 'high';
export interface Task {
  id: string; user_id: string; title: string; description: string; status: Status;
  priority: Priority; due_date: string | null; labels: string[]; created_at: string; updated_at: string;
}
export type TaskInput = Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'due_date' | 'labels'>;
export interface Comment { id: string; task_id: string; user_id: string; body: string; created_at: string }
export interface Activity { id: string; task_id: string; user_id: string; description: string; created_at: string }
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function dueInfo(task: Pick<Task, 'due_date' | 'status'>, now = new Date()) {
  if (!task.due_date) return null;
  const [y, m, d] = task.due_date.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = localDate(now);
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const overdue = task.status !== 'done' && task.due_date < today;
  const soon = task.status !== 'done' && task.due_date >= today && task.due_date <= localDate(tomorrow);
  return { overdue, soon, label: overdue ? 'Overdue' : task.due_date === today ? 'Today' : task.due_date === localDate(tomorrow) ? 'Tomorrow' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(date.getFullYear() !== now.getFullYear() ? {year: 'numeric'} : {}) }) };
}
export function normalizeLabels(value: string): string[] {
  return [...new Set(value.split(',').map(x => x.trim().slice(0, 24)).filter(Boolean))].slice(0, 6);
}
export function validateTask(task: TaskInput): string | null {
  if (!task.title.trim()) return 'Give your task a title.';
  if (task.title.trim().length > 160) return 'Keep the title under 160 characters.';
  if (task.description.length > 5000) return 'Keep the description under 5,000 characters.';
  if (!columns.some(c => c.id === task.status)) return 'Choose a valid status.';
  if (!['low', 'normal', 'high'].includes(task.priority)) return 'Choose a valid priority.';
  if (task.due_date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(task.due_date)) return 'Choose a valid due date.';
    const [y,m,d] = task.due_date.split('-').map(Number);
    const parsed = new Date(0); parsed.setFullYear(y, m - 1, d); parsed.setHours(0,0,0,0);
    if (localDate(parsed) !== task.due_date || y < 1900 || y > 9999) return 'Choose a valid due date.';
  }
  return null;
}
export interface Filters { search: string; priority: string; label: string; view: 'all' | 'due' | 'done' }
export function filterTasks(tasks: Task[], filters: Filters, now = new Date()) {
  const query = filters.search.trim().toLocaleLowerCase();
  return tasks.filter(task => {
    const due = dueInfo(task, now);
    return (!query || task.title.toLocaleLowerCase().includes(query)) &&
      (filters.priority === 'all' || task.priority === filters.priority) &&
      (filters.label === 'all' || task.labels.includes(filters.label)) &&
      (filters.view !== 'done' || task.status === 'done') &&
      (filters.view !== 'due' || Boolean(due?.overdue || due?.soon));
  });
}
export const statusName = (status: string) => columns.find(c => c.id === status)?.name ?? status;
export function friendlyError(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
  if (/anonymous.*disabled/i.test(message)) return 'Anonymous sign-in is disabled. Enable it in Supabase Authentication settings, then retry.';
  if (/fetch|network/i.test(message)) return 'We could not reach the server. Check your connection and try again.';
  if (/rate|too many/i.test(message)) return 'Too many requests. Wait a moment, then try again.';
  if (/row.level|permission|jwt|session/i.test(message)) return 'Your session could not access this item. Refresh the board and try again.';
  if (/relation|schema cache|does not exist/i.test(message)) return 'The database is not ready. Apply the included schema, then retry.';
  return 'That change could not be saved. Please try again.';
}
