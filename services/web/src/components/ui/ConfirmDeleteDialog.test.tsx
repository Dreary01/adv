import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConfirmDeleteDialog from './ConfirmDeleteDialog'

// Mock api
vi.mock('../../lib/api', () => ({
  api: {
    getDescendantsCount: vi.fn(),
    deleteObject: vi.fn(),
  },
}))

import { api } from '../../lib/api'
const mockApi = api as any

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ConfirmDeleteDialog', () => {
  it('shows object name', async () => {
    mockApi.getDescendantsCount.mockResolvedValue({ count: 0 })
    render(
      <ConfirmDeleteDialog objectId="1" objectName="Test Object" onConfirm={() => {}} onCancel={() => {}} />
    )
    expect(screen.getByText('Test Object')).toBeInTheDocument()
  })

  it('shows loading state while fetching count', () => {
    mockApi.getDescendantsCount.mockReturnValue(new Promise(() => {})) // never resolves
    render(
      <ConfirmDeleteDialog objectId="1" objectName="Test" onConfirm={() => {}} onCancel={() => {}} />
    )
    expect(screen.getByText(/Подсчёт/)).toBeInTheDocument()
  })

  it('shows no children message when count is 0', async () => {
    mockApi.getDescendantsCount.mockResolvedValue({ count: 0 })
    render(
      <ConfirmDeleteDialog objectId="1" objectName="Test" onConfirm={() => {}} onCancel={() => {}} />
    )
    await waitFor(() => {
      expect(screen.getByText(/нет дочерних/i)).toBeInTheDocument()
    })
  })

  it('shows children count warning when count > 0', async () => {
    mockApi.getDescendantsCount.mockResolvedValue({ count: 5 })
    render(
      <ConfirmDeleteDialog objectId="1" objectName="Test" onConfirm={() => {}} onCancel={() => {}} />
    )
    await waitFor(() => {
      expect(screen.getByText(/6/)).toBeInTheDocument() // 5 children + 1 self
    })
  })

  it('calls onCancel when cancel button clicked', async () => {
    mockApi.getDescendantsCount.mockResolvedValue({ count: 0 })
    const onCancel = vi.fn()
    render(
      <ConfirmDeleteDialog objectId="1" objectName="Test" onConfirm={() => {}} onCancel={onCancel} />
    )
    await waitFor(() => screen.getByText('Отмена'))
    await userEvent.click(screen.getByText('Отмена'))
    expect(onCancel).toHaveBeenCalled()
  })

  it('calls deleteObject and onConfirm when delete button clicked', async () => {
    mockApi.getDescendantsCount.mockResolvedValue({ count: 0 })
    mockApi.deleteObject.mockResolvedValue(undefined)
    const onConfirm = vi.fn()
    render(
      <ConfirmDeleteDialog objectId="obj-1" objectName="Test" onConfirm={onConfirm} onCancel={() => {}} />
    )
    await waitFor(() => screen.getByText('Удалить'))
    await userEvent.click(screen.getByText('Удалить'))
    await waitFor(() => {
      expect(mockApi.deleteObject).toHaveBeenCalledWith('obj-1')
      expect(onConfirm).toHaveBeenCalled()
    })
  })

  it('fetches descendants count for the given objectId', async () => {
    mockApi.getDescendantsCount.mockResolvedValue({ count: 3 })
    render(
      <ConfirmDeleteDialog objectId="abc-123" objectName="Test" onConfirm={() => {}} onCancel={() => {}} />
    )
    expect(mockApi.getDescendantsCount).toHaveBeenCalledWith('abc-123')
  })
})
