import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Activity as ActivityIcon,
  AlertCircle,
  Check,
  LoaderCircle,
  MessageSquare,
  Send,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import {
  columns,
  friendlyError,
  normalizeLabels,
  validateTask,
  type Activity,
  type Comment,
  type Priority,
  type Status,
  type Task,
  type TaskInput,
} from "../domain";
import type { Repository } from "../data";
import { SelectField } from "./ui";
export default function TaskEditor({
  task,
  initialStatus,
  repo,
  busy,
  onClose,
  onSave,
  onRemove,
}: {
  task?: Task;
  initialStatus: Status;
  repo: Repository;
  busy: boolean;
  onClose: () => void;
  onSave: (input: TaskInput, id?: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [input, setInput] = useState<TaskInput>(
    task
      ? {
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          due_date: task.due_date,
          labels: task.labels,
        }
      : {
          title: "",
          description: "",
          status: initialStatus,
          priority: "normal",
          due_date: null,
          labels: [],
        },
  );
  const [labelText, setLabelText] = useState(task?.labels.join(", ") ?? "");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(Boolean(task));
  const [detailsError, setDetailsError] = useState("");
  const [detailsRetry, setDetailsRetry] = useState(0);
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [tab, setTab] = useState<"comments" | "activity">("comments");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    if (!task) element?.querySelector<HTMLInputElement>("input")?.focus();
    return () => element?.close();
  }, []);
  useEffect(() => {
    if (!task) return;
    let cancelled = false;
    setDetailsLoading(true);
    setDetailsError("");
    Promise.all([repo.comments(task.id), repo.activity(task.id)])
      .then(([c, a]) => {
        if (!cancelled) {
          setComments(c);
          setActivity(a);
        }
      })
      .catch((e) => {
        if (!cancelled) setDetailsError(friendlyError(e));
      })
      .finally(() => {
        if (!cancelled) setDetailsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [repo, task?.id, detailsRetry]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = {
      ...input,
      title: input.title.trim(),
      labels: normalizeLabels(labelText),
    };
    const validation = validateTask(next);
    if (validation) {
      setError(validation);
      return;
    }
    setError("");
    try {
      await onSave(next, task?.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function deleteTask() {
    if (!task) return;
    try {
      await onRemove(task.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function postComment(e: FormEvent) {
    e.preventDefault();
    if (!task || !comment.trim() || posting) return;
    setPosting(true);
    setDetailsError("");
    try {
      const result = await repo.comment(task.id, comment.trim());
      setComments((c) => [...c, result]);
      setComment("");
    } catch (e) {
      setDetailsError(friendlyError(e));
    } finally {
      setPosting(false);
    }
  }
  const disabled = busy || posting;
  return (
    <dialog
      ref={dialog}
      className="task-dialog"
      aria-labelledby="editor-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!disabled) onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current && !disabled) onClose();
      }}
    >
      <div className="dialog-inner">
        <header className="dialog-header">
          <span className="dialog-kicker">
            <span className="mini-brand" aria-hidden="true">
              r.
            </span>
            {task ? `RL-${task.id.slice(0, 4).toUpperCase()}` : "NEW TASK"}
          </span>
          <button
            className="icon-button"
            aria-label="Close task details"
            disabled={disabled}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <h2 id="editor-title">{task ? "Task details" : "Create a task"}</h2>
        <p className="dialog-subtitle">
          {task
            ? "Edit the task or leave a note below."
            : "Give it a title, then add the details you need."}
        </p>
        <form onSubmit={submit} className="task-form">
          <label className="field">
            Task title <span className="required-mark">*</span>
            <input
              autoFocus={!task}
              required
              maxLength={160}
              value={input.title}
              placeholder="What needs to happen?"
              onChange={(e) =>
                setInput((i) => ({ ...i, title: e.target.value }))
              }
            />
          </label>
          <label className="field">
            Description
            <textarea
              rows={3}
              maxLength={5000}
              placeholder="Add a little context, a checklist, or a useful link…"
              value={input.description}
              onChange={(e) =>
                setInput((i) => ({ ...i, description: e.target.value }))
              }
            />
          </label>
          <div className="form-grid">
            <label className="field">
              Status
              <SelectField
                value={input.status}
                onChange={(e) =>
                  setInput((i) => ({ ...i, status: e.target.value as Status }))
                }
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
            </label>
            <label className="field">
              Priority
              <SelectField
                value={input.priority}
                onChange={(e) =>
                  setInput((i) => ({
                    ...i,
                    priority: e.target.value as Priority,
                  }))
                }
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </SelectField>
            </label>
            <label className="field">
              Due date
              <input
                type="date"
                min="1900-01-01"
                max="9999-12-31"
                value={input.due_date ?? ""}
                onChange={(e) =>
                  setInput((i) => ({ ...i, due_date: e.target.value || null }))
                }
              />
            </label>
            <label className="field">
              Labels
              <input
                value={labelText}
                maxLength={160}
                placeholder="Design, Engineering"
                onChange={(e) => setLabelText(e.target.value)}
              />
            </label>
          </div>
          <p className="field-hint">
            <Tag size={13} />
            Separate labels with commas. Up to 6 labels, 24 characters each.
          </p>
          {error && (
            <div className="inline-error" role="alert">
              <AlertCircle size={16} />
              {error}
            </div>
          )}
          <div className="form-actions">
            {task && (
              <button
                type="button"
                className="text-button delete-button"
                disabled={disabled}
                onClick={() => setDeleting(true)}
              >
                <Trash2 size={15} />
                Delete task
              </button>
            )}
            <span className="action-spacer" />
            <button
              type="button"
              className="button secondary"
              disabled={disabled}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={disabled}
            >
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Check size={16} />
              )}{" "}
              {task ? "Save changes" : "Create task"}
            </button>
          </div>
        </form>
        {deleting && (
          <div className="delete-confirm" role="alert">
            <strong>Delete this task and its comments?</strong>
            <p>This permanently removes it from your board.</p>
            <div>
              <button
                className="button secondary"
                disabled={disabled}
                onClick={() => setDeleting(false)}
              >
                Keep task
              </button>
              <button
                className="button danger"
                disabled={disabled}
                onClick={deleteTask}
              >
                Delete task
              </button>
            </div>
          </div>
        )}
        {task && (
          <section className="task-discussion">
            <div className="discussion-tabs">
              <button
                onClick={() => setTab("comments")}
                className={tab === "comments" ? "active" : ""}
                aria-pressed={tab === "comments"}
              >
                <MessageSquare size={16} />
                Comments<span>{comments.length}</span>
              </button>
              <button
                onClick={() => setTab("activity")}
                className={tab === "activity" ? "active" : ""}
                aria-pressed={tab === "activity"}
              >
                <ActivityIcon size={16} />
                Recent activity
              </button>
            </div>
            {detailsError && (
              <div className="inline-error" role="alert">
                {detailsError}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setDetailsRetry((r) => r + 1)}
                >
                  Retry
                </button>
              </div>
            )}
            {detailsLoading ? (
              <p className="discussion-empty">
                <LoaderCircle size={15} className="spin" />
                Loading details…
              </p>
            ) : tab === "comments" ? (
              <>
                <div className="comments-list">
                  {comments.length ? (
                    comments.map((c) => (
                      <article className="comment" key={c.id}>
                        <span className="avatar">G</span>
                        <div>
                          <div className="comment-meta">
                            <strong>You</strong>
                            <time dateTime={c.created_at}>
                              {new Date(c.created_at).toLocaleString("en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </time>
                          </div>
                          <p>{c.body}</p>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="discussion-empty">
                      No comments yet. Leave a note for your future self.
                    </p>
                  )}
                </div>
                <form onSubmit={postComment} className="comment-form">
                  <label className="sr-only" htmlFor="comment-body">
                    Add a comment
                  </label>
                  <textarea
                    id="comment-body"
                    placeholder="Add a comment…"
                    maxLength={2000}
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="icon-button send-comment"
                    aria-label="Post comment"
                    disabled={disabled || !comment.trim()}
                  >
                    {posting ? (
                      <LoaderCircle size={18} className="spin" />
                    ) : (
                      <Send size={18} />
                    )}
                  </button>
                </form>
              </>
            ) : (
              <div className="activity-list">
                {activity.length ? (
                  activity.map((a) => (
                    <div className="activity-entry" key={a.id}>
                      <Circle size={9} />
                      <div>
                        <p>{a.description}</p>
                        <time dateTime={a.created_at}>
                          {new Date(a.created_at).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="discussion-empty">
                    Changes to this task will appear here.
                  </p>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </dialog>
  );
}
