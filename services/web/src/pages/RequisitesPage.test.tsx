import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import RequisitesPage from './RequisitesPage'

vi.mock('../lib/api', () => ({
  api: {
    getRequisites: vi.fn(),
    getRequisiteGroups: vi.fn(),
    createRequisite: vi.fn(),
    createRequisiteGroup: vi.fn(),
    updateRequisite: vi.fn(),
    deleteRequisite: vi.fn(),
  },
}))

import { api } from '../lib/api'
const mockApi = api as any

const sampleReqs = [
  { id: '1', name: 'Бюджет', type: 'number', description: 'Бюджет проекта', is_unique: false, group_name: 'Финансы', group_id: 'g1', config: { decimal_places: 2 } },
  { id: '2', name: 'Код', type: 'string', description: '', is_unique: true, group_name: null, group_id: null, config: { max_length: 100, format: 'text' } },
]

const sampleGroups = [
  { id: 'g1', name: 'Финансы' },
  { id: 'g2', name: 'Контакты' },
]

function renderPage() {
  return render(<MemoryRouter><RequisitesPage /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.getRequisites.mockResolvedValue(sampleReqs)
  mockApi.getRequisiteGroups.mockResolvedValue(sampleGroups)
  mockApi.createRequisite.mockResolvedValue({ id: '3' })
  mockApi.createRequisiteGroup.mockResolvedValue({ id: 'g3' })
  mockApi.updateRequisite.mockResolvedValue({})
  mockApi.deleteRequisite.mockResolvedValue(undefined)
})

describe('RequisitesPage', () => {
  it('renders requisite list', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Бюджет')).toBeInTheDocument()
      expect(screen.getByText('Код')).toBeInTheDocument()
    })
  })

  it('shows type badges with labels', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Число')).toBeInTheDocument()
      expect(screen.getByText('Строка')).toBeInTheDocument()
    })
  })

  it('shows group name', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Финансы')).toBeInTheDocument()
    })
  })

  it('shows unique badge', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Да')).toBeInTheDocument()
    })
  })

  it('shows config summary for string type', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('макс. 100')).toBeInTheDocument()
    })
  })

  it('shows config summary for number type', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('2 зн.')).toBeInTheDocument()
    })
  })

  it('opens create form on button click', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Бюджет'))
    await userEvent.click(screen.getByText('Создать'))
    expect(screen.getByText('Новый реквизит')).toBeInTheDocument()
  })

  it('create form shows string config by default', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Бюджет'))
    await userEvent.click(screen.getByText('Создать'))
    expect(screen.getByText(/Свойства типа «Строка»/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('2000')).toBeInTheDocument() // default max_length
  })

  it('create form switches config panel on type change', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Бюджет'))
    await userEvent.click(screen.getByText('Создать'))

    // Change type to "number"
    const typeSelects = screen.getAllByRole('combobox')
    const typeSelect = typeSelects.find(s => (s as HTMLSelectElement).value === 'string')!
    await userEvent.selectOptions(typeSelect, 'number')

    expect(screen.getByText(/Свойства типа «Число»/)).toBeInTheDocument()
  })

  it('opens edit form on row click', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Бюджет'))
    await userEvent.click(screen.getByText('Бюджет'))
    expect(screen.getByText(/Редактирование: Бюджет/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('Бюджет')).toBeInTheDocument()
  })

  it('saves edited requisite with config', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Код'))
    await userEvent.click(screen.getByText('Код'))
    // Change the name
    const nameInput = screen.getByDisplayValue('Код')
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Код проекта')
    await userEvent.click(screen.getByText('Сохранить'))
    await waitFor(() => {
      expect(mockApi.updateRequisite).toHaveBeenCalledWith('2', expect.objectContaining({
        name: 'Код проекта',
        config: expect.objectContaining({ max_length: 100 }),
      }))
    })
  })

  it('shows group selector with existing groups', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Бюджет'))
    await userEvent.click(screen.getByText('Создать'))
    // Group dropdown should have options
    const groupSelect = screen.getAllByRole('combobox').find(
      s => Array.from((s as HTMLSelectElement).options).some(o => o.text === 'Контакты')
    )
    expect(groupSelect).toBeDefined()
    expect((groupSelect as HTMLSelectElement).options.length).toBeGreaterThanOrEqual(3) // "— Без группы —" + 2 groups
  })

  it('deletes requisite', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Бюджет'))
    const deleteButtons = screen.getAllByTitle('Удалить')
    await userEvent.click(deleteButtons[0])
    await waitFor(() => {
      expect(mockApi.deleteRequisite).toHaveBeenCalledWith('1')
    })
  })
})
