import { describe, it, expect } from 'vitest'
import { businessDaysBetween, addBusinessDays, formatDateRu, calculateForecast } from './date-utils'

describe('businessDaysBetween', () => {
  it('counts weekdays between two dates', () => {
    // Mon Mar 23 to Fri Mar 27 = 5 days (Mon Tue Wed Thu Fri)
    expect(businessDaysBetween('2026-03-23', '2026-03-27')).toBe(5)
  })

  it('excludes weekends', () => {
    // Mon Mar 23 to Mon Mar 30 = 6 days (skip Sat Sun)
    expect(businessDaysBetween('2026-03-23', '2026-03-30')).toBe(6)
  })

  it('returns 1 for same day (weekday)', () => {
    expect(businessDaysBetween('2026-03-23', '2026-03-23')).toBe(1) // Monday
  })

  it('returns 0 for same day (weekend)', () => {
    expect(businessDaysBetween('2026-03-28', '2026-03-28')).toBe(0) // Saturday
  })

  it('returns 0 when end before start', () => {
    expect(businessDaysBetween('2026-03-27', '2026-03-23')).toBe(0)
  })

  it('handles full week', () => {
    // Mon to next Mon = 6 business days
    expect(businessDaysBetween('2026-03-23', '2026-03-30')).toBe(6)
  })

  it('handles two full weeks', () => {
    // 10 business days
    expect(businessDaysBetween('2026-03-23', '2026-04-03')).toBe(10)
  })
})

describe('addBusinessDays', () => {
  it('adds business days skipping weekends', () => {
    // Mon + 5 business days = Mon (next week)
    expect(addBusinessDays('2026-03-23', 5)).toBe('2026-03-30')
  })

  it('adds 1 business day', () => {
    // Mon + 1 = Tue
    expect(addBusinessDays('2026-03-23', 1)).toBe('2026-03-24')
  })

  it('skips weekend when adding from Friday', () => {
    // Fri + 1 = Mon
    expect(addBusinessDays('2026-03-27', 1)).toBe('2026-03-30')
  })

  it('returns same day for 0 days', () => {
    expect(addBusinessDays('2026-03-23', 0)).toBe('2026-03-23')
  })

  it('adds 10 business days = 2 weeks', () => {
    // Mon + 10 = Mon+2weeks = Mon Apr 6
    expect(addBusinessDays('2026-03-23', 10)).toBe('2026-04-06')
  })
})

describe('formatDateRu', () => {
  it('formats ISO to DD.MM.YYYY', () => {
    expect(formatDateRu('2026-03-22')).toBe('22.03.2026')
  })

  it('returns — for null', () => {
    expect(formatDateRu(null)).toBe('—')
  })

  it('returns — for undefined', () => {
    expect(formatDateRu(undefined)).toBe('—')
  })

  it('returns — for empty string', () => {
    expect(formatDateRu('')).toBe('—')
  })
})

describe('calculateForecast', () => {
  it('returns operational dates for not_started', () => {
    const obj = {
      status: 'not_started',
      plans: [{ plan_type: 'operational', start_date: '2026-04-01', end_date: '2026-04-10', duration_days: 8 }],
    }
    const f = calculateForecast(obj)
    expect(f.start).toBe('2026-04-01')
    expect(f.end).toBe('2026-04-10')
  })

  it('returns actual dates for completed', () => {
    const obj = {
      status: 'completed',
      actual_start_date: '2026-04-02',
      actual_end_date: '2026-04-09',
      plans: [{ plan_type: 'operational', start_date: '2026-04-01', end_date: '2026-04-10' }],
    }
    const f = calculateForecast(obj)
    expect(f.start).toBe('2026-04-02')
    expect(f.end).toBe('2026-04-09')
  })

  it('returns null for no operational plan', () => {
    const obj = { status: 'not_started', plans: [] }
    const f = calculateForecast(obj)
    expect(f.start).toBeNull()
    expect(f.end).toBeNull()
  })

  it('uses actual_start for in_progress', () => {
    const obj = {
      status: 'in_progress',
      actual_start_date: '2026-04-03',
      plans: [{ plan_type: 'operational', start_date: '2026-04-01', end_date: '2026-04-10', duration_days: 8 }],
    }
    const f = calculateForecast(obj)
    expect(f.start).toBe('2026-04-03')
    expect(f.end).toBeDefined()
  })
})
