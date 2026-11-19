import { describe, expect, it } from 'vitest';
import { dueInfo, filterTasks, localDate, normalizeLabels, validateTask, type Task, type TaskInput } from './domain';
const input:TaskInput={title:'Review mobile layout',description:'Check touch targets',status:'todo',priority:'high',due_date:'2026-11-19',labels:['Design']};
const task:Task={...input,id:'a',user_id:'owner',created_at:'2026-11-19T12:00:00Z',updated_at:'2026-11-19T12:00:00Z'};
const now=new Date(2026,10,19,23,45);
describe('Due date behavior',()=>{
  it('uses local calendar dates instead of UTC boundaries',()=>{expect(localDate(now)).toBe('2026-11-19');expect(dueInfo(task,now)).toMatchObject({label:'Today',soon:true,overdue:false});});
  it('does not flag completed tasks as overdue',()=>{expect(dueInfo({...task,status:'done',due_date:'2026-11-18'},now)?.overdue).toBe(false);});
  it('includes tomorrow across a month boundary',()=>{expect(dueInfo({...task,due_date:'2026-12-01'},new Date(2026,10,30,23))).toMatchObject({label:'Tomorrow',soon:true});});
  it('does not call a future date overdue',()=>{expect(dueInfo({...task,due_date:'2026-11-25'},now)).toMatchObject({soon:false,overdue:false});});
  it('handles tasks without due dates',()=>{expect(dueInfo({...task,due_date:null},now)).toBeNull();});
});
describe('Task validation and labels',()=>{
  it('rejects whitespace titles',()=>{expect(validateTask({...input,title:' \n '})).toBeTruthy();});
  it('rejects invalid calendar dates',()=>{expect(validateTask({...input,due_date:'2026-02-30'})).toBeTruthy();expect(validateTask({...input,due_date:'2026-13-01'})).toBeTruthy();});
  it('accepts leap day only in a leap year',()=>{expect(validateTask({...input,due_date:'2028-02-29'})).toBeNull();expect(validateTask({...input,due_date:'2027-02-29'})).toBeTruthy();});
  it('deduplicates and trims labels, ignoring empty items',()=>{expect(normalizeLabels(' Design, Engineering,, Design, ')).toEqual(['Design','Engineering']);});
  it('bounds label count and length',()=>{const labels=normalizeLabels('x'.repeat(40)+',a,b,c,d,e,f,g');expect(labels).toHaveLength(6);expect(labels[0]).toHaveLength(24);});
  it('does not create duplicate labels after shortening long values',()=>{expect(normalizeLabels('a'.repeat(24)+'x,'+'a'.repeat(24)+'y')).toHaveLength(1);});
});
describe('Combined board filters',()=>{
  const tasks=[task,{...task,id:'b',title:'Review API',priority:'low',labels:['Engineering'],due_date:'2026-11-18'},{...task,id:'c',status:'done',due_date:'2026-11-18'}] as Task[];
  it('combines case-insensitive title, priority and label filters',()=>{expect(filterTasks(tasks,{search:' MOBILE ',priority:'high',label:'Design',view:'all'},now).map(t=>t.id)).toEqual(['a','c']);});
  it('shows overdue, today and tomorrow in due-soon view, excluding completed work',()=>{expect(filterTasks(tasks,{search:'',priority:'all',label:'all',view:'due'},now).map(t=>t.id)).toEqual(['a','b']);});
  it('shows only completed work in completed view',()=>{expect(filterTasks(tasks,{search:'',priority:'all',label:'all',view:'done'},now).map(t=>t.id)).toEqual(['c']);});
});
