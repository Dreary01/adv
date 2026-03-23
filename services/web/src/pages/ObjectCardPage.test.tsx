import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Mock api
vi.mock('../lib/api', () => ({
  api: {
    getObject: vi.fn(),
    getObjectSubtree: vi.fn(),
    getObjectTypes: vi.fn(),
    createObject: vi.fn(),
    deleteObject: vi.fn(),
    getDescendantsCount: vi.fn(),
    getTypeRefTables: vi.fn(),
    getRefTable: vi.fn(),
    getRefRecords: vi.fn(),
    getRefAggregations: vi.fn(),
    createRefRecord: vi.fn(),
    updateRefRecord: vi.fn(),
    deleteRefRecord: vi.fn(),
    getClassifierValues: vi.fn(),
    getObjects: vi.fn(),
  },
}))

import { api } from '../lib/api'
const mockApi = api as any

const sampleObject = {
  id: 'obj-1',
  name: 'Test Project',
  type_id: 'type-1',
  type_name: 'Project',
  type_kind: 'project',
  type_color: '#3d5af5',
  type_icon: 'target',
  status: 'in_progress',
  priority: 2,
  progress: 50,
  field_values: {},
  owner_id: null,
  assignee_id: null,
  children: [],
  plans: [],
  updated_at: '2026-01-01T00:00:00Z',
}

const sampleRefTable = {
  id: 'rt-1',
  name: 'Contacts',
  columns: [
    { id: 'c1', requisite_id: 'req-str', requisite: { id: 'req-str', name: 'ФИО', type: 'string', config: {} }, is_visible: true },
    { id: 'c2', requisite_id: 'req-num', requisite: { id: 'req-num', name: 'Телефон', type: 'string', config: {} }, is_visible: true },
  ],
}

const sampleRecords = [
  { id: 'rec-1', table_id: 'rt-1', object_id: 'obj-1', data: { 'req-str': 'Иванов И.И.', 'req-num': '555-1234' }, sort_order: 0, is_approved: false, created_at: '2026-01-01', updated_at: '2026-01-01' },
]

function renderPage(path = '/projects/obj-1?tab=ref-tables') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/projects/:id" element={<ObjectCardPageWrapper />} />
      </Routes>
    </MemoryRouter>
  )
}

// Lazy import to avoid module resolution issues
let ObjectCardPage: any
function ObjectCardPageWrapper() {
  const [Comp, setComp] = vi.importActual('../pages/ObjectCardPage') as any
  // Just use a dynamic import workaround
  return <ObjectCardPageInner />
}

// Direct import for testing
import ObjectCardPageDirect from './ObjectCardPage'
function ObjectCardPageInner() {
  return <ObjectCardPageDirect />
}

function renderWithRouter(path = '/projects/obj-1?tab=ref-tables') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/projects/:id" element={<ObjectCardPageDirect />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.getObject.mockResolvedValue(sampleObject)
  mockApi.getObjectSubtree.mockResolvedValue([])
  mockApi.getObjectTypes.mockResolvedValue([])
  mockApi.getTypeRefTables.mockResolvedValue([sampleRefTable])
  mockApi.getRefTable.mockResolvedValue(sampleRefTable)
  mockApi.getRefRecords.mockResolvedValue(sampleRecords)
  mockApi.getRefAggregations.mockResolvedValue({})
  mockApi.createRefRecord.mockResolvedValue({ id: 'rec-2' })
  mockApi.updateRefRecord.mockResolvedValue({})
  mockApi.deleteRefRecord.mockResolvedValue(undefined)
  mockApi.getDescendantsCount.mockResolvedValue({ count: 0 })
  mockApi.createObject.mockResolvedValue({ id: 'new-1' })
  mockApi.getClassifierValues.mockResolvedValue([])
  mockApi.getObjects.mockResolvedValue([])
})

describe('ObjectCardPage', () => {
  it('renders object name', async () => {
    renderWithRouter('/projects/obj-1?tab=main')
    await waitFor(() => {
      expect(screen.getAllByText('Test Project').length).toBeGreaterThan(0)
    })
  })

  it('shows tabs', async () => {
    renderWithRouter('/projects/obj-1?tab=main')
    await waitFor(() => {
      expect(screen.getByText('Главная')).toBeInTheDocument()
      expect(screen.getByText('Справочники')).toBeInTheDocument()
    })
  })

  it('loads ref tables on ref-tables tab', async () => {
    renderWithRouter('/projects/obj-1?tab=ref-tables')
    await waitFor(() => {
      expect(mockApi.getTypeRefTables).toHaveBeenCalledWith('type-1')
    })
  })

  it('shows ref table with records', async () => {
    renderWithRouter('/projects/obj-1?tab=ref-tables')
    await waitFor(() => {
      expect(screen.getByText('Иванов И.И.')).toBeInTheDocument()
      expect(screen.getByText('555-1234')).toBeInTheDocument()
    })
  })

  it('shows column names as links to requisites', async () => {
    renderWithRouter('/projects/obj-1?tab=ref-tables')
    await waitFor(() => {
      const link = screen.getByText('ФИО')
      expect(link.tagName).toBe('A')
      expect(link.getAttribute('href')).toBe('/admin/requisites')
    })
  })

  it('shows add button for records', async () => {
    renderWithRouter('/projects/obj-1?tab=ref-tables')
    await waitFor(() => {
      expect(screen.getByText('Добавить')).toBeInTheDocument()
    })
  })

  it('shows delete button on hover', async () => {
    renderWithRouter('/projects/obj-1?tab=ref-tables')
    await waitFor(() => {
      const deleteButtons = screen.getAllByTitle('Удалить объект')
      // At least the header delete button
      expect(deleteButtons.length).toBeGreaterThan(0)
    })
  })
})

describe('renderFieldValue', () => {
  it('shows dash for empty values', async () => {
    mockApi.getRefRecords.mockResolvedValue([
      { id: 'r1', data: {}, sort_order: 0, is_approved: false, created_at: '', updated_at: '' }
    ])
    renderWithRouter('/projects/obj-1?tab=ref-tables')
    await waitFor(() => {
      const dashes = screen.getAllByText('—')
      expect(dashes.length).toBeGreaterThan(0)
    })
  })
})

describe('formula columns', () => {
  it('shows computed formula value as read-only', async () => {
    const tableWithFormula = {
      ...sampleRefTable,
      columns: [
        ...sampleRefTable.columns,
        { id: 'c3', requisite_id: 'req-formula', requisite: { id: 'req-formula', name: 'Итого', type: 'formula', config: { elements: [] } }, is_visible: true },
      ],
    }
    mockApi.getTypeRefTables.mockResolvedValue([tableWithFormula])
    mockApi.getRefTable.mockResolvedValue(tableWithFormula)
    mockApi.getRefRecords.mockResolvedValue([
      { id: 'r1', data: { 'req-str': 'A', 'req-num': '1', 'req-formula': 42 }, sort_order: 0, is_approved: false, created_at: '', updated_at: '' }
    ])
    renderWithRouter('/projects/obj-1?tab=ref-tables')
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument()
    })
  })
})

describe('aggregation row', () => {
  it('shows aggregation footer when aggregations are present', async () => {
    const tableWithAgg = {
      ...sampleRefTable,
      columns: [
        { id: 'c1', requisite_id: 'req-str', requisite: { id: 'req-str', name: 'Название', type: 'string', config: {} }, is_visible: true, aggregation: '' },
        { id: 'c2', requisite_id: 'req-num', requisite: { id: 'req-num', name: 'Сумма', type: 'number', config: {} }, is_visible: true, aggregation: 'sum' },
      ],
    }
    mockApi.getTypeRefTables.mockResolvedValue([tableWithAgg])
    mockApi.getRefTable.mockResolvedValue(tableWithAgg)
    mockApi.getRefRecords.mockResolvedValue([
      { id: 'r1', data: { 'req-str': 'A', 'req-num': '10' }, sort_order: 0, is_approved: false, created_at: '', updated_at: '' },
      { id: 'r2', data: { 'req-str': 'B', 'req-num': '20' }, sort_order: 1, is_approved: false, created_at: '', updated_at: '' },
    ])
    mockApi.getRefAggregations.mockResolvedValue({ 'req-num': 30 })
    renderWithRouter('/projects/obj-1?tab=ref-tables')
    await waitFor(() => {
      expect(screen.getByText('Итого')).toBeInTheDocument()
      expect(screen.getByText('30')).toBeInTheDocument()
    })
  })

  it('does not show aggregation row when no aggregations', async () => {
    mockApi.getRefAggregations.mockResolvedValue({})
    renderWithRouter('/projects/obj-1?tab=ref-tables')
    await waitFor(() => {
      expect(screen.getByText('Добавить')).toBeInTheDocument()
    })
    expect(screen.queryByText('Итого')).not.toBeInTheDocument()
  })

  it('shows percentage aggregation with % suffix', async () => {
    const tableWithPct = {
      ...sampleRefTable,
      columns: [
        { id: 'c1', requisite_id: 'req-num', requisite: { id: 'req-num', name: 'Число', type: 'number', config: {} }, is_visible: true, aggregation: 'pct_filled' },
      ],
    }
    mockApi.getTypeRefTables.mockResolvedValue([tableWithPct])
    mockApi.getRefTable.mockResolvedValue(tableWithPct)
    mockApi.getRefRecords.mockResolvedValue([
      { id: 'r1', data: { 'req-num': '10' }, sort_order: 0, is_approved: false, created_at: '', updated_at: '' },
    ])
    mockApi.getRefAggregations.mockResolvedValue({ 'req-num': 100 })
    renderWithRouter('/projects/obj-1?tab=ref-tables')
    await waitFor(() => {
      expect(screen.getByText('100%')).toBeInTheDocument()
    })
  })
})
