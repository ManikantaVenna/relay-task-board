import type { ReactNode } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  ArrowDownWideNarrow,
  CalendarDays,
  Check,
  CircleCheck,
  GripVertical,
  Plus,
} from "lucide-react";
import { columns, dueInfo, type Task } from "../domain";
export default function BoardColumn({
  column,
  tasks,
  busy,
  filtered,
  onCreate,
  onOpen,
}: {
  column: (typeof columns)[number];
  tasks: Task[];
  busy: boolean;
  filtered: boolean;
  onCreate: () => void;
  onOpen: (task: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <section
      ref={setNodeRef}
      className={`board-column ${isOver ? "drag-over" : ""}`}
      aria-label={`${column.name} column`}
    >
      <div className="column-heading">
        <div>
          <span className={`status-dot ${column.className}`} />
          <h2>{column.name}</h2>
          <span className="column-count">{tasks.length}</span>
        </div>
        <button
          className="icon-button"
          aria-label={`Add task to ${column.name}`}
          disabled={busy}
          onClick={onCreate}
        >
          <Plus size={17} />
        </button>
      </div>
      <div className="column-content">
        {tasks.map((task) => (
          <TaskCard
            task={task}
            key={task.id}
            disabled={busy}
            onOpen={() => onOpen(task)}
          />
        ))}
        {!tasks.length && (
          <div className="column-empty">
            <span className={`empty-column-mark ${column.className}`}>
              {column.id === "done" ? <Check size={20} /> : <Plus size={20} />}
            </span>
            <p>
              {filtered
                ? "No matching tasks"
                : column.id === "done"
                  ? "Completed work appears here."
                  : "No tasks here yet."}
            </p>
          </div>
        )}
      </div>
      <button className="add-task" disabled={busy} onClick={onCreate}>
        <Plus size={16} />
        Add task
      </button>
    </section>
  );
}
function TaskCard({
  task,
  disabled,
  onOpen,
}: {
  task: Task;
  disabled: boolean;
  onOpen: () => void;
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } =
    useDraggable({ id: task.id, data: { status: task.status }, disabled });
  return (
    <article
      ref={setNodeRef}
      className={`task-card ${isDragging ? "dragging" : ""}`}
    >
      <TaskCardContent
        task={task}
        onOpen={onOpen}
        handle={
          <button
            ref={setActivatorNodeRef}
            className="drag-handle"
            {...attributes}
            {...listeners}
            aria-label={`Drag ${task.title}`}
          >
            <GripVertical size={16} />
          </button>
        }
      />
    </article>
  );
}
export function TaskCardContent({
  task,
  onOpen,
  handle,
  overlay,
}: {
  task: Task;
  onOpen?: () => void;
  handle?: ReactNode;
  overlay?: boolean;
}) {
  const due = dueInfo(task);
  return (
    <div
      className={
        overlay ? "task-card card-content overlay-card" : "card-content"
      }
    >
      <div className="card-top">
        <span className="task-reference">
          RL-{task.id.slice(0, 4).toUpperCase()}
        </span>
        {handle ?? <GripVertical size={16} className="muted" />}
      </div>
      <button
        className={`task-title ${task.status === "done" ? "completed-title" : ""}`}
        onClick={onOpen}
        tabIndex={overlay ? -1 : 0}
      >
        {task.title}
      </button>
      {task.description && <p className="task-excerpt">{task.description}</p>}
      {task.labels.length > 0 && (
        <div className="task-labels">
          {task.labels.map((label) => (
            <span
              key={label}
              className={`label-chip label-${label.length % 4}`}
            >
              {label}
            </span>
          ))}
        </div>
      )}
      <div className="card-bottom">
        <span className={`priority priority-${task.priority}`}>
          <ArrowDownWideNarrow size={12} />
          {task.priority}
        </span>
        {due ? (
          <span
            className={`due-badge ${due.overdue ? "overdue" : due.soon ? "due-soon" : ""}`}
          >
            <CalendarDays size={13} />
            {due.label}
          </span>
        ) : (
          <span className="no-date">No due date</span>
        )}
        {task.status === "done" && (
          <CircleCheck size={16} className="completed-check" />
        )}
      </div>
    </div>
  );
}
