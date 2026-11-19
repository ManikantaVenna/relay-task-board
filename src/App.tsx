import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type KeyboardCoordinateGetter } from '@dnd-kit/core';
import { Activity as ActivityIcon, AlertCircle, ArrowDownWideNarrow, CalendarDays, Check, CheckCheck, ChevronDown, Circle, CircleCheck, Clock3, CloudCheck, GripVertical, LayoutGrid, List, LoaderCircle, LockKeyhole, MessageSquare, Plus, RefreshCw, Search, Send, SlidersHorizontal, Tag, Trash2, X } from 'lucide-react';
import { columns, dueInfo, filterTasks, friendlyError, normalizeLabels, statusName, validateTask, type Activity, type Comment, type Filters, type Priority, type Status, type Task, type TaskInput } from './domain';
import { configured, exampleTasks, repository, type Repository } from './data';

function Brand() { return <div className="brand"><span className="brand-mark" aria-hidden="true"><i/><i/><i/></span><span>relay<span className="brand-period">.</span></span></div>; }
function SelectField({children, ...props}: React.SelectHTMLAttributes<HTMLSelectElement>) { return <span className="select-wrap"><select {...props}>{children}</select><ChevronDown size={14} aria-hidden="true"/></span>; }
function Empty({children, icon = <LayoutGrid size={25}/>} : {children:ReactNode;icon?:ReactNode}) { return <div className="empty-state"><span className="empty-icon">{icon}</span>{children}</div>; }

// Move directly between adjacent columns when a card's drag handle is keyboard-operated.
const columnKeyboardCoordinates: KeyboardCoordinateGetter = (event, {context,currentCoordinates}) => {
  const index = columns.findIndex(c => c.id === context.over?.id);
  const from = index >= 0 ? index : columns.findIndex(c => c.id === context.active?.data.current?.status);
  const offset = event.code === 'ArrowRight' ? 1 : event.code === 'ArrowLeft' ? -1 : 0;
  if (!offset) return currentCoordinates;
  event.preventDefault();
  const target = columns[Math.max(0, Math.min(columns.length - 1, from + offset))];
  const rect = context.droppableRects.get(target.id);
  const active = context.collisionRect;
  if (!rect || !active) return currentCoordinates;
  return {x:currentCoordinates.x + rect.left + rect.width / 2 - (active.left + active.width / 2),y:currentCoordinates.y};
};

export default function App() {
  const [preview,setPreview] = useState(() => new URLSearchParams(location.search).get('preview') === '1');
  const [repo,setRepo] = useState<Repository | null>(null);
  const [tasks,setTasks] = useState<Task[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [retry,setRetry] = useState(0);
  const [announcement,setAnnouncement] = useState('');
  const [filters,setFilters] = useState<Filters>({search:'',priority:'all',label:'all',view:'all'});
  const [layout,setLayout] = useState<'board' | 'list'>('board');
  const [editor,setEditor] = useState<{task?:Task;status:Status} | null>(null);
  const [active,setActive] = useState<Task | null>(null);
  const sensors = useSensors(useSensor(PointerSensor,{activationConstraint:{distance:7}}),useSensor(KeyboardSensor,{coordinateGetter:columnKeyboardCoordinates}));
  useEffect(() => {
    let cancelled = false;
    if (!configured && !preview) {setLoading(false);return;}
    setLoading(true); setError('');
    repository(preview).then(async next => {
      const data = await next.list();
      if (!cancelled) {setRepo(next);setTasks(data);}
    }).catch(e => {if (!cancelled) setError(friendlyError(e));}).finally(() => {if (!cancelled) setLoading(false);});
    return () => {cancelled = true;};
  },[preview,retry]);
  const visible = useMemo(() => filterTasks(tasks,filters),[tasks,filters]);
  const labels = useMemo(() => [...new Set(tasks.flatMap(t=>t.labels))].sort(),[tasks]);
  const complete = tasks.filter(t=>t.status==='done').length;
  const overdue = tasks.filter(t=>dueInfo(t)?.overdue).length;
  const due = tasks.filter(t=>{const d=dueInfo(t);return d?.overdue || d?.soon;}).length;
  const progress = tasks.length ? Math.round(complete/tasks.length*100) : 0;
  const filtered = filters.search !== '' || filters.priority !== 'all' || filters.label !== 'all' || filters.view !== 'all';
  const clearFilters = () => setFilters({search:'',priority:'all',label:'all',view:'all'});
  const openNew = (status:Status='todo') => setEditor({status});
  async function save(input:TaskInput, id?:string) {
    if (!repo || busy) return;
    setBusy(true);setError('');
    try {
      const result = id ? await repo.update(id,input) : await repo.create(input);
      setTasks(current => id ? current.map(t=>t.id===id?result:t) : [result,...current]);
      setEditor(null);setAnnouncement(id?'Task updated.':'Task created.');
    } catch(e) {throw new Error(friendlyError(e));} finally {setBusy(false);}
  }
  async function remove(id:string) {
    if (!repo || busy) return;
    setBusy(true);setError('');
    try {await repo.remove(id);setTasks(current=>current.filter(t=>t.id!==id));setEditor(null);setAnnouncement('Task deleted.');}
    catch(e) {throw new Error(friendlyError(e));} finally {setBusy(false);}
  }
  async function move(event:DragEndEvent) {
    setActive(null);
    const status = event.over?.id as Status | undefined;
    const original = tasks.find(t=>t.id===event.active.id);
    if (!repo || busy || !original || !status || original.status===status || !columns.some(c=>c.id===status)) return;
    setBusy(true);setError('');setTasks(current=>current.map(t=>t.id===original.id?{...t,status}:t));
    try {const result=await repo.update(original.id,{status});setTasks(current=>current.map(t=>t.id===original.id?result:t));setAnnouncement(`Moved ${original.title} to ${statusName(status)}.`);}
    catch(e) {setTasks(current=>current.map(t=>t.id===original.id?original:t));setError(friendlyError(e));setAnnouncement('Move failed. The task was returned to its previous column.');}
    finally {setBusy(false);}
  }
  async function seed() {
    if (!repo || busy) return;
    setBusy(true);setError('');
    try {for (const input of exampleTasks()) {const task=await repo.create(input);setTasks(current=>[task,...current]);}setAnnouncement('Six sample tasks added. You can edit or delete them.');}
    catch(e) {setError(friendlyError(e));} finally {setBusy(false);}
  }
  if (!configured && !preview) return <main className="setup"><Brand/><div className="setup-card"><span className="eyebrow">A PLACE FOR YOUR NEXT IDEA</span><h1>Your work,<br/>in motion.</h1><p>Connect this workspace to Supabase to keep your board saved and private to your guest session.</p><ol><li>Apply <code>supabase/schema.sql</code> to your project.</li><li>Enable anonymous sign-ins in Supabase Auth.</li><li>Add the project URL and public key to <code>.env.local</code>, then restart.</li></ol><button className="button primary" onClick={()=>setPreview(true)}>Explore local preview</button><p className="fine-print">Preview uses sample tasks stored in this browser. It does not connect to Supabase.</p></div></main>;
  return <div className="app-shell">
    <aside className="sidebar">
      <Brand/>
      <div className="workspace"><span className="workspace-avatar">P</span><div><strong>Personal workspace</strong><span>Guest account</span></div></div>
      <span className="nav-heading">WORKSPACE</span>
      <nav aria-label="Board views">
        <button className={filters.view==='all'?'nav-item selected':'nav-item'} onClick={()=>setFilters(f=>({...f,view:'all'}))}><LayoutGrid size={18}/>Project board<span>{tasks.length}</span></button>
        <button className={filters.view==='due'?'nav-item selected':'nav-item'} onClick={()=>setFilters(f=>({...f,view:'due'}))}><Clock3 size={18}/>Due soon<span>{due}</span></button>
        <button className={filters.view==='done'?'nav-item selected':'nav-item'} onClick={()=>setFilters(f=>({...f,view:'done'}))}><CircleCheck size={18}/>Completed<span>{complete}</span></button>
      </nav>
      <div className="sidebar-progress"><div><span>Making progress</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{width:`${progress}%`}}/></div><p>{complete} of {tasks.length} tasks completed</p></div>
      <div className="sidebar-bottom"><span className="privacy-symbol"><LockKeyhole size={18}/></span><strong>Private guest board</strong><p>Your board belongs to this browser’s guest session. Keep browser data to return to it.</p><span className="sidebar-footnote">Saved with Supabase</span></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><span><span className="breadcrumb-root">Workspace</span><span className="breadcrumb-divider">/</span>Project board</span><div className="guest-profile"><span className="avatar">G</span><span>Guest workspace</span><LockKeyhole size={14}/></div></header>
      <main className="main-content">
        {preview && <div className="preview-banner"><AlertCircle size={16}/><span>Local preview · Sample tasks are stored in this browser. Supabase is not connected.</span></div>}
        <div className="page-heading"><div><span className="eyebrow">PERSONAL WORKSPACE</span><h1>{filters.view==='due'?'Coming up next':filters.view==='done'?'Look what you finished':'Project board'}<span className="heading-dot">.</span></h1><p>{filters.view==='due'?'Overdue tasks and work due today or tomorrow.':filters.view==='done'?'Completed tasks from your workspace.':'Plan, prioritize, and keep work moving.'}</p></div><button className="button primary" onClick={()=>openNew()} disabled={!repo || loading || busy}><Plus size={18}/>New task</button></div>
        <section className="board-overview" aria-label="Board summary"><div className="summary-item"><span className="summary-icon"><LayoutGrid size={17}/></span><strong>{tasks.length}</strong><span>total tasks</span></div><div className="summary-item"><span className="summary-icon green"><CheckCheck size={18}/></span><strong>{complete}</strong><span>completed</span></div><div className="summary-item"><span className={`summary-icon ${overdue?'red':''}`}><Clock3 size={17}/></span><strong>{overdue}</strong><span>overdue</span></div><div className="save-state" role="status">{loading || busy ? <><LoaderCircle size={15} className="spin"/>{loading?'Loading workspace':'Saving changes'}</> : error ? <><AlertCircle size={15}/>Needs attention</> : <><CloudCheck size={16}/>{preview?'Saved in this browser':'All changes saved'}</>}</div></section>
        <div className="board-toolbar"><div className="layout-switch" aria-label="Layout"><button aria-label="Board layout" aria-pressed={layout==='board'} className={layout==='board'?'active':''} onClick={()=>setLayout('board')}><LayoutGrid size={16}/><span>Board</span></button><button aria-label="List layout" aria-pressed={layout==='list'} className={layout==='list'?'active':''} onClick={()=>setLayout('list')}><List size={17}/><span>List</span></button></div><div className="filter-controls"><label className="search-field"><Search size={17}/><input aria-label="Search tasks" placeholder="Search tasks…" value={filters.search} onChange={e=>setFilters(f=>({...f,search:e.target.value}))}/>{filters.search && <button aria-label="Clear search" onClick={()=>setFilters(f=>({...f,search:''}))}><X size={14}/></button>}</label><SelectField aria-label="Filter by priority" value={filters.priority} onChange={e=>setFilters(f=>({...f,priority:e.target.value}))}><option value="all">All priorities</option><option value="high">High priority</option><option value="normal">Normal priority</option><option value="low">Low priority</option></SelectField><SelectField aria-label="Filter by label" value={filters.label} onChange={e=>setFilters(f=>({...f,label:e.target.value}))}><option value="all">All labels</option>{labels.map(label=><option key={label}>{label}</option>)}</SelectField><button className="icon-button refresh" aria-label="Refresh board" disabled={loading || busy} onClick={()=>setRetry(r=>r+1)}><RefreshCw size={17}/></button></div></div>
        {error && <div className="error-banner" role="alert"><AlertCircle size={18}/><span>{error}</span><button onClick={()=>setRetry(r=>r+1)}>Retry</button></div>}
        {filtered && <div className="filter-summary"><SlidersHorizontal size={14}/><span>Showing {visible.length} of {tasks.length} tasks</span><button onClick={clearFilters}>Clear filters</button></div>}
        {loading ? <div className="board-grid skeleton-board" aria-label="Loading tasks">{columns.map(c=><div className="skeleton-column" key={c.id}><div/>{[0,1].map(n=><div className="skeleton-card" key={n}><span/><span/><span/></div>)}</div>)}</div> : !repo ? <Empty icon={<AlertCircle size={26}/>}><h2>Let’s get your workspace connected</h2><p>Check the connection settings, then try loading your board again.</p><button className="button secondary" onClick={()=>setRetry(r=>r+1)}>Try again</button></Empty> : <>
        {tasks.length===0 && !error && <section className="welcome-strip"><div><strong>Start with one task</strong><p>Create your first task, or explore with a few editable sample tasks.</p></div><button className="button secondary" disabled={busy} onClick={seed}><Plus size={16}/>Add sample tasks</button></section>}
        {layout==='board' ? <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={e=>setActive(tasks.find(t=>t.id===e.active.id)??null)} onDragEnd={move} onDragCancel={()=>setActive(null)} accessibility={{screenReaderInstructions:{draggable:'To move a task, press Space on its drag handle. Use Left and Right to choose a column, then press Space again to drop. Press Escape to cancel.'}}}>
          <div className="board-grid">{columns.map(column=><BoardColumn key={column.id} column={column} tasks={visible.filter(t=>t.status===column.id)} busy={busy} filtered={filtered} onCreate={()=>openNew(column.id)} onOpen={task=>setEditor({task,status:task.status})}/>)}</div><DragOverlay>{active?<TaskCardContent task={active} overlay/>:null}</DragOverlay>
        </DndContext> : <div className="task-list" aria-label="Task list">{visible.length ? visible.map(task=><button className="list-row" key={task.id} onClick={()=>setEditor({task,status:task.status})}><span className={`status-dot ${columns.find(c=>c.id===task.status)?.className}`}/><span className="list-task-title">{task.title}</span><span className="list-status">{statusName(task.status)}</span><span className={`priority priority-${task.priority}`}>{task.priority}</span><span className="list-due">{dueInfo(task)?.label??'No due date'}</span></button>):<Empty icon={<Search size={24}/>}><h2>No tasks to show</h2><p>{filtered?'Try another search or clear your filters.':'Create a task to get started.'}</p>{filtered && <button className="text-button" onClick={clearFilters}>Clear filters</button>}</Empty>}</div>}
        <footer className="board-footer"><span><GripVertical size={14}/>{layout==='board'?'Drag tasks to move them forward':'Open any task to edit its details'}</span><span>Prefer the keyboard? Open a task to change its status.</span></footer>
        </>}
      </main>
    </div>
    <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
    {editor && repo && <TaskEditor key={editor.task?.id ?? `new-${editor.status}`} task={editor.task} initialStatus={editor.status} repo={repo} busy={busy} onClose={()=>setEditor(null)} onSave={save} onRemove={remove}/>}
  </div>;
}

function BoardColumn({column,tasks,busy,filtered,onCreate,onOpen}:{column:typeof columns[number];tasks:Task[];busy:boolean;filtered:boolean;onCreate:()=>void;onOpen:(task:Task)=>void}) {
  const {setNodeRef,isOver} = useDroppable({id:column.id});
  return <section ref={setNodeRef} className={`board-column ${isOver?'drag-over':''}`} aria-label={`${column.name} column`}><div className="column-heading"><div><span className={`status-dot ${column.className}`}/><h2>{column.name}</h2><span className="column-count">{tasks.length}</span></div><button className="icon-button" aria-label={`Add task to ${column.name}`} disabled={busy} onClick={onCreate}><Plus size={17}/></button></div><div className="column-content">{tasks.map(task=><TaskCard task={task} key={task.id} disabled={busy} onOpen={()=>onOpen(task)}/>)}{!tasks.length && <div className="column-empty"><span className={`empty-column-mark ${column.className}`}>{column.id==='done'?<Check size={20}/>:<Plus size={20}/>}</span><p>{filtered?'No matching tasks':column.id==='done'?'Completed work appears here.':'No tasks here yet.'}</p></div>}</div><button className="add-task" disabled={busy} onClick={onCreate}><Plus size={16}/>Add task</button></section>;
}
function TaskCard({task,disabled,onOpen}:{task:Task;disabled:boolean;onOpen:()=>void}) {
  const {setNodeRef,setActivatorNodeRef,attributes,listeners,isDragging} = useDraggable({id:task.id,data:{status:task.status},disabled});
  return <article ref={setNodeRef} className={`task-card ${isDragging?'dragging':''}`}><TaskCardContent task={task} onOpen={onOpen} handle={<button ref={setActivatorNodeRef} className="drag-handle" {...attributes} {...listeners} aria-label={`Drag ${task.title}`}><GripVertical size={16}/></button>}/></article>;
}
function TaskCardContent({task,onOpen,handle,overlay}:{task:Task;onOpen?:()=>void;handle?:ReactNode;overlay?:boolean}) {
  const due = dueInfo(task);
  return <div className={overlay?'task-card card-content overlay-card':'card-content'}><div className="card-top"><span className="task-reference">RL-{task.id.slice(0,4).toUpperCase()}</span>{handle??<GripVertical size={16} className="muted"/>}</div><button className={`task-title ${task.status==='done'?'completed-title':''}`} onClick={onOpen} tabIndex={overlay?-1:0}>{task.title}</button>{task.description && <p className="task-excerpt">{task.description}</p>}{task.labels.length>0 && <div className="task-labels">{task.labels.map(label=><span key={label} className={`label-chip label-${label.length%4}`}>{label}</span>)}</div>}<div className="card-bottom"><span className={`priority priority-${task.priority}`}><ArrowDownWideNarrow size={12}/>{task.priority}</span>{due?<span className={`due-badge ${due.overdue?'overdue':due.soon?'due-soon':''}`}><CalendarDays size={13}/>{due.label}</span>:<span className="no-date">No due date</span>}{task.status==='done' && <CircleCheck size={16} className="completed-check"/>}</div></div>;
}

function TaskEditor({task,initialStatus,repo,busy,onClose,onSave,onRemove}:{task?:Task;initialStatus:Status;repo:Repository;busy:boolean;onClose:()=>void;onSave:(input:TaskInput,id?:string)=>Promise<void>;onRemove:(id:string)=>Promise<void>}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [input,setInput]=useState<TaskInput>(task?{title:task.title,description:task.description,status:task.status,priority:task.priority,due_date:task.due_date,labels:task.labels}:{title:'',description:'',status:initialStatus,priority:'normal',due_date:null,labels:[]});
  const [labelText,setLabelText]=useState(task?.labels.join(', ')??'');
  const [error,setError]=useState('');
  const [deleting,setDeleting]=useState(false);
  const [comments,setComments]=useState<Comment[]>([]);
  const [activity,setActivity]=useState<Activity[]>([]);
  const [detailsLoading,setDetailsLoading]=useState(Boolean(task));
  const [detailsError,setDetailsError]=useState('');
  const [detailsRetry,setDetailsRetry]=useState(0);
  const [comment,setComment]=useState('');
  const [posting,setPosting]=useState(false);
  const [tab,setTab]=useState<'comments'|'activity'>('comments');
  useEffect(()=>{const element=dialog.current;element?.showModal();if(!task)element?.querySelector<HTMLInputElement>('input')?.focus();return()=>element?.close();},[]);
  useEffect(()=>{
    if (!task) return;
    let cancelled=false;setDetailsLoading(true);setDetailsError('');
    Promise.all([repo.comments(task.id),repo.activity(task.id)]).then(([c,a])=>{if(!cancelled){setComments(c);setActivity(a);}}).catch(e=>{if(!cancelled)setDetailsError(friendlyError(e));}).finally(()=>{if(!cancelled)setDetailsLoading(false);});
    return()=>{cancelled=true;};
  },[repo,task?.id,detailsRetry]);
  async function submit(e:FormEvent) {e.preventDefault();const next={...input,title:input.title.trim(),labels:normalizeLabels(labelText)};const validation=validateTask(next);if(validation){setError(validation);return;}setError('');try{await onSave(next,task?.id);}catch(e){setError((e as Error).message);}}
  async function deleteTask() {if(!task)return;try{await onRemove(task.id);}catch(e){setError((e as Error).message);}}
  async function postComment(e:FormEvent) {e.preventDefault();if(!task || !comment.trim() || posting)return;setPosting(true);setDetailsError('');try{const result=await repo.comment(task.id,comment.trim());setComments(c=>[...c,result]);setComment('');}catch(e){setDetailsError(friendlyError(e));}finally{setPosting(false);}}
  const disabled=busy || posting;
  return <dialog ref={dialog} className="task-dialog" aria-labelledby="editor-title" onCancel={e=>{e.preventDefault();if(!disabled)onClose();}} onClick={e=>{if(e.target===dialog.current && !disabled)onClose();}}><div className="dialog-inner"><header className="dialog-header"><span className="dialog-kicker"><span className="mini-brand" aria-hidden="true">r.</span>{task?`RL-${task.id.slice(0,4).toUpperCase()}`:'NEW TASK'}</span><button className="icon-button" aria-label="Close task details" disabled={disabled} onClick={onClose}><X size={20}/></button></header><h2 id="editor-title">{task?'Task details':'Create a task'}</h2><p className="dialog-subtitle">{task?'Edit the task or leave a note below.':'Give it a title, then add the details you need.'}</p><form onSubmit={submit} className="task-form"><label className="field">Task title <span className="required-mark">*</span><input autoFocus={!task} required maxLength={160} value={input.title} placeholder="What needs to happen?" onChange={e=>setInput(i=>({...i,title:e.target.value}))}/></label><label className="field">Description<textarea rows={3} maxLength={5000} placeholder="Add a little context, a checklist, or a useful link…" value={input.description} onChange={e=>setInput(i=>({...i,description:e.target.value}))}/></label><div className="form-grid"><label className="field">Status<SelectField value={input.status} onChange={e=>setInput(i=>({...i,status:e.target.value as Status}))}>{columns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</SelectField></label><label className="field">Priority<SelectField value={input.priority} onChange={e=>setInput(i=>({...i,priority:e.target.value as Priority}))}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></SelectField></label><label className="field">Due date<input type="date" min="1900-01-01" max="9999-12-31" value={input.due_date??''} onChange={e=>setInput(i=>({...i,due_date:e.target.value||null}))}/></label><label className="field">Labels<input value={labelText} maxLength={160} placeholder="Design, Engineering" onChange={e=>setLabelText(e.target.value)}/></label></div><p className="field-hint"><Tag size={13}/>Separate labels with commas. Up to 6 labels, 24 characters each.</p>{error && <div className="inline-error" role="alert"><AlertCircle size={16}/>{error}</div>}<div className="form-actions">{task && <button type="button" className="text-button delete-button" disabled={disabled} onClick={()=>setDeleting(true)}><Trash2 size={15}/>Delete task</button>}<span className="action-spacer"/><button type="button" className="button secondary" disabled={disabled} onClick={onClose}>Cancel</button><button type="submit" className="button primary" disabled={disabled}>{busy?<LoaderCircle size={16} className="spin"/>:<Check size={16}/>} {task?'Save changes':'Create task'}</button></div></form>{deleting && <div className="delete-confirm" role="alert"><strong>Delete this task and its comments?</strong><p>This permanently removes it from your board.</p><div><button className="button secondary" disabled={disabled} onClick={()=>setDeleting(false)}>Keep task</button><button className="button danger" disabled={disabled} onClick={deleteTask}>Delete task</button></div></div>}
    {task && <section className="task-discussion"><div className="discussion-tabs"><button onClick={()=>setTab('comments')} className={tab==='comments'?'active':''} aria-pressed={tab==='comments'}><MessageSquare size={16}/>Comments<span>{comments.length}</span></button><button onClick={()=>setTab('activity')} className={tab==='activity'?'active':''} aria-pressed={tab==='activity'}><ActivityIcon size={16}/>Recent activity</button></div>{detailsError && <div className="inline-error" role="alert">{detailsError}<button type="button" className="text-button" onClick={()=>setDetailsRetry(r=>r+1)}>Retry</button></div>}{detailsLoading?<p className="discussion-empty"><LoaderCircle size={15} className="spin"/>Loading details…</p>:tab==='comments'?<><div className="comments-list">{comments.length?comments.map(c=><article className="comment" key={c.id}><span className="avatar">G</span><div><div className="comment-meta"><strong>You</strong><time dateTime={c.created_at}>{new Date(c.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</time></div><p>{c.body}</p></div></article>):<p className="discussion-empty">No comments yet. Leave a note for your future self.</p>}</div><form onSubmit={postComment} className="comment-form"><label className="sr-only" htmlFor="comment-body">Add a comment</label><textarea id="comment-body" placeholder="Add a comment…" maxLength={2000} rows={2} value={comment} onChange={e=>setComment(e.target.value)}/><button type="submit" className="icon-button send-comment" aria-label="Post comment" disabled={disabled || !comment.trim()}>{posting?<LoaderCircle size={18} className="spin"/>:<Send size={18}/>}</button></form></>:<div className="activity-list">{activity.length?activity.map(a=><div className="activity-entry" key={a.id}><Circle size={9}/><div><p>{a.description}</p><time dateTime={a.created_at}>{new Date(a.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</time></div></div>):<p className="discussion-empty">Changes to this task will appear here.</p>}</div>}</section>}
    </div></dialog>;
}
