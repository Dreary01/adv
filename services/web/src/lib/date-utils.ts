// Business day utilities (Mon-Fri, no holidays for Phase 1)

// Parse ISO date as local (not UTC) to avoid timezone shifting
function parseLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function isWeekend(d: Date): boolean {
  const day = d.getDay()
  return day === 0 || day === 6
}

function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function businessDaysBetween(startISO: string, endISO: string): number {
  const start = parseLocal(startISO)
  const end = parseLocal(endISO)
  if (end < start) return 0
  let count = 0
  const d = new Date(start)
  while (d <= end) {
    if (!isWeekend(d)) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

export function addBusinessDays(startISO: string, days: number): string {
  const d = parseLocal(startISO)
  if (days <= 0) return toISO(d)
  let added = 0
  while (added < days) {
    d.setDate(d.getDate() + 1)
    if (!isWeekend(d)) added++
  }
  return toISO(d)
}

export function formatDateRu(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}.${m}.${y}`
}

export function calculateForecast(obj: any): { start: string | null; end: string | null } {
  const plans = obj.plans || []
  const operational = plans.find((p: any) => p.plan_type === 'operational')
  if (!operational) return { start: null, end: null }

  const now = new Date()
  const today = toISO(now)

  switch (obj.status) {
    case 'not_started':
      return { start: operational.start_date || null, end: operational.end_date || null }

    case 'in_progress': {
      const start = obj.actual_start_date || today
      if (operational.duration_days && operational.duration_days > 0) {
        const elapsed = operational.start_date
          ? businessDaysBetween(operational.start_date, today)
          : 0
        let remaining = operational.duration_days - elapsed
        if (remaining < 1) remaining = 1
        const end = addBusinessDays(today, remaining)
        return { start, end }
      }
      return { start, end: operational.end_date || null }
    }

    case 'completed':
      return { start: obj.actual_start_date || null, end: obj.actual_end_date || null }

    default:
      return { start: operational.start_date || null, end: operational.end_date || null }
  }
}
