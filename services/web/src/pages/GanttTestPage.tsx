import { Gantt } from '@svar-ui/react-gantt'
import '@svar-ui/react-gantt/all.css'

const tasks = [
  { id: 1, text: 'Project planning', progress: 40, parent: 0, type: 'summary' as const, open: true },
  { id: 10, start: new Date(2026, 3, 2), duration: 3, text: 'Marketing analysis', progress: 100, parent: 1, type: 'task' as const },
  { id: 11, start: new Date(2026, 3, 5), duration: 2, text: 'Discussions', progress: 72, parent: 1, type: 'task' as const },
  { id: 12, start: new Date(2026, 3, 8), duration: 0, text: 'Approval', progress: 0, parent: 1, type: 'milestone' as const },
  { id: 2, text: 'Development', progress: 30, parent: 0, type: 'summary' as const, open: true },
  { id: 20, start: new Date(2026, 3, 9), duration: 4, text: 'Coding', progress: 50, parent: 2, type: 'task' as const },
  { id: 21, start: new Date(2026, 3, 13), duration: 3, text: 'Testing', progress: 10, parent: 2, type: 'task' as const },
]

const links = [
  { id: 1, source: 10, target: 11, type: 'e2s' as const },
  { id: 2, source: 11, target: 12, type: 'e2s' as const },
  { id: 3, source: 20, target: 21, type: 'e2s' as const },
]

const scales = [
  { unit: 'month' as any, step: 1, format: '%F %Y' },
  { unit: 'day' as any, step: 1, format: '%j' },
]

export default function GanttTestPage() {
  return (
    <div style={{ padding: 20 }}>
      <h1>SVAR Gantt Test</h1>
      <div style={{ width: '100%', height: 500 }}>
        <Gantt tasks={tasks} links={links} scales={scales} />
      </div>
    </div>
  )
}
