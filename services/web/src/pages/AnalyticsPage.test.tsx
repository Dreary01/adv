import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'

vi.mock('../lib/api', () => ({
  api: {
    getRefTables: vi.fn(),
    getRefTable: vi.fn(),
    getRefRecords: vi.fn(),
    getObjects: vi.fn(),
  },
}))

import { api } from '../lib/api'
import AnalyticsPage from './AnalyticsPage'
const mockApi = api as any

const sampleTables = [
  { id: 't1', name: 'Бюджет', structure: 'flat', input_mode: 'inline' },
  { id: 't2', name: 'Ресурсы', structure: 'flat', input_mode: 'inline' },
]

const sampleTableDetail = {
  id: 't1',
  name: 'Бюджет',
  columns: [
    { id: 'c1', requisite_id: 'r1', requisite: { id: 'r1', name: 'Статья', type: 'string', config: {} }, is_visible: true },
    { id: 'c2', requisite_id: 'r2', requisite: { id: 'r2', name: 'Сумма', type: 'number', config: {} }, is_visible: true },
  ],
}

const sampleRecords = [
  { id: 'rec1', data: { r1: 'Зарплата', r2: 100 }, sort_order: 0, is_approved: false, created_at: '', updated_at: '' },
  { id: 'rec2', data: { r1: 'Аренда', r2: 200 }, sort_order: 1, is_approved: false, created_at: '', updated_at: '' },
]

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/analytics']}>
      <AnalyticsPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.getRefTables.mockResolvedValue(sampleTables)
  mockApi.getObjects.mockResolvedValue([])
  mockApi.getRefTable.mockResolvedValue(sampleTableDetail)
  mockApi.getRefRecords.mockResolvedValue(sampleRecords)
})

describe('AnalyticsPage', () => {
  it('renders page title', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Аналитика')).toBeInTheDocument()
    })
  })

  it('shows empty state when no tables selected', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Выберите справочники для анализа')).toBeInTheDocument()
    })
  })

  it('shows ref table selector', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('— Выбрать справочники —')).toBeInTheDocument()
    })
  })

  it('loads pivot data when table selected', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('— Выбрать справочники —')).toBeInTheDocument()
    })

    // Open dropdown and select a table
    const selectBtn = screen.getByText('— Выбрать справочники —')
    await userEvent.click(selectBtn)

    await waitFor(() => {
      expect(screen.getByText('Бюджет')).toBeInTheDocument()
    })

    const budgetLabel = screen.getByText('Бюджет')
    await userEvent.click(budgetLabel)

    await waitFor(() => {
      expect(mockApi.getRefTable).toHaveBeenCalledWith('t1')
      expect(mockApi.getRefRecords).toHaveBeenCalledWith('t1', undefined)
    })
  })

  it('shows project filter dropdown', async () => {
    mockApi.getObjects.mockResolvedValue([
      { id: 'p1', name: 'Проект Alpha', status: 'in_progress' },
    ])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Все проекты')).toBeInTheDocument()
    })
  })
})
