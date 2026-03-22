import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from './api'

// Mock fetch globally
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

function mockResponse(data: any, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve({ data }),
  }
}

function mockErrorResponse(error: string, status = 400) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ error }),
  }
}

function mock204() {
  return { ok: true, status: 204, json: () => Promise.reject() }
}

beforeEach(() => {
  mockFetch.mockReset()
  localStorage.clear()
})

describe('api client', () => {
  describe('request headers', () => {
    it('sends Content-Type header', async () => {
      mockFetch.mockResolvedValue(mockResponse({ token: 'abc', user: {} }))
      await api.login('a@b.c', '123')
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }))
    })

    it('sends Authorization header when token exists', async () => {
      localStorage.setItem('adv_token', 'my-token')
      mockFetch.mockResolvedValue(mockResponse({}))
      await api.me()
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer my-token' }),
      }))
    })

    it('does not send Authorization when no token', async () => {
      mockFetch.mockResolvedValue(mockResponse({ token: 't', user: {} }))
      await api.login('a@b.c', '123')
      const headers = mockFetch.mock.calls[0][1].headers
      expect(headers.Authorization).toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValue(mockErrorResponse('bad request', 400))
      await expect(api.me()).rejects.toThrow('bad request')
    })

    it('handles 204 No Content', async () => {
      mockFetch.mockResolvedValue(mock204())
      const result = await api.deleteObject('123')
      expect(result).toBeUndefined()
    })
  })

  describe('auth', () => {
    it('login sends email and password', async () => {
      mockFetch.mockResolvedValue(mockResponse({ token: 'tok', user: { id: '1' } }))
      const result = await api.login('admin@test.com', 'pass')
      expect(result).toEqual({ token: 'tok', user: { id: '1' } })
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body).toEqual({ email: 'admin@test.com', password: 'pass' })
    })

    it('register sends user data', async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: '1' }))
      await api.register({ email: 'a@b.c', password: '123', first_name: 'A', last_name: 'B' })
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.first_name).toBe('A')
    })
  })

  describe('object types', () => {
    it('getObjectTypes calls GET /object-types', async () => {
      mockFetch.mockResolvedValue(mockResponse([]))
      await api.getObjectTypes()
      expect(mockFetch.mock.calls[0][0]).toBe('/api/object-types')
    })

    it('createObjectType sends POST', async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: '1' }))
      await api.createObjectType({ name: 'Test', kind: 'task' })
      expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })

    it('updateObjectType sends PUT', async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: '1' }))
      await api.updateObjectType('1', { name: 'Updated' })
      expect(mockFetch).toHaveBeenCalledWith('/api/object-types/1', expect.objectContaining({ method: 'PUT' }))
    })

    it('deleteObjectType sends DELETE', async () => {
      mockFetch.mockResolvedValue(mock204())
      await api.deleteObjectType('1')
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })

    it('setHierarchy sends child_type_ids', async () => {
      mockFetch.mockResolvedValue(mockResponse({}))
      await api.setHierarchy('1', ['2', '3'])
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.child_type_ids).toEqual(['2', '3'])
    })

    it('bindRequisite sends POST to type requisites', async () => {
      mockFetch.mockResolvedValue(mockResponse({}))
      await api.bindRequisite('type1', { requisite_id: 'req1', is_required: true })
      expect(mockFetch).toHaveBeenCalledWith('/api/object-types/type1/requisites', expect.any(Object))
    })

    it('unbindRequisite sends DELETE', async () => {
      mockFetch.mockResolvedValue(mock204())
      await api.unbindRequisite('type1', 'req1')
      expect(mockFetch).toHaveBeenCalledWith('/api/object-types/type1/requisites/req1', expect.objectContaining({ method: 'DELETE' }))
    })
  })

  describe('objects', () => {
    it('getObjects with filters builds query string', async () => {
      mockFetch.mockResolvedValue(mockResponse([]))
      await api.getObjects({ parent_id: 'root', status: 'in_progress' })
      expect(mockFetch.mock.calls[0][0]).toContain('parent_id=root')
      expect(mockFetch.mock.calls[0][0]).toContain('status=in_progress')
    })

    it('getObjects without filters has no query string', async () => {
      mockFetch.mockResolvedValue(mockResponse([]))
      await api.getObjects()
      expect(mockFetch.mock.calls[0][0]).toBe('/api/objects')
    })

    it('getObjectTree calls /objects/tree', async () => {
      mockFetch.mockResolvedValue(mockResponse([]))
      await api.getObjectTree()
      expect(mockFetch.mock.calls[0][0]).toBe('/api/objects/tree')
    })

    it('getObjectSubtree calls /objects/:id/subtree', async () => {
      mockFetch.mockResolvedValue(mockResponse([]))
      await api.getObjectSubtree('abc')
      expect(mockFetch.mock.calls[0][0]).toBe('/api/objects/abc/subtree')
    })

    it('createObject sends POST', async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: '1' }))
      await api.createObject({ name: 'Test', type_id: 't1', status: 'not_started' })
      expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })

    it('moveObject sends PATCH', async () => {
      mockFetch.mockResolvedValue(mockResponse({}))
      await api.moveObject('1', { parent_id: '2', sort_order: 0 })
      expect(mockFetch).toHaveBeenCalledWith('/api/objects/1/move', expect.objectContaining({ method: 'PATCH' }))
    })

    it('reorderObjects sends POST with ids', async () => {
      mockFetch.mockResolvedValue(mock204())
      await api.reorderObjects(['a', 'b', 'c'])
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.ids).toEqual(['a', 'b', 'c'])
    })

    it('getDescendantsCount calls correct endpoint', async () => {
      mockFetch.mockResolvedValue(mockResponse({ count: 5 }))
      const result = await api.getDescendantsCount('obj-1')
      expect(mockFetch.mock.calls[0][0]).toBe('/api/objects/obj-1/descendants-count')
      expect(result.count).toBe(5)
    })

    it('deleteObject cascades on server (sends DELETE)', async () => {
      mockFetch.mockResolvedValue(mock204())
      await api.deleteObject('obj-1')
      expect(mockFetch).toHaveBeenCalledWith('/api/objects/obj-1', expect.objectContaining({ method: 'DELETE' }))
    })
  })

  describe('dependencies', () => {
    it('getDependencies calls correct endpoint', async () => {
      mockFetch.mockResolvedValue(mockResponse([]))
      await api.getDependencies('obj-1')
      expect(mockFetch.mock.calls[0][0]).toBe('/api/objects/obj-1/dependencies')
    })

    it('createDependency sends POST', async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: 'd1' }))
      await api.createDependency('obj-1', { predecessor_id: 'a', successor_id: 'b', type: 'fs' })
      expect(mockFetch.mock.calls[0][1].method).toBe('POST')
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.predecessor_id).toBe('a')
      expect(body.type).toBe('fs')
    })

    it('deleteDependency sends DELETE', async () => {
      mockFetch.mockResolvedValue(mock204())
      await api.deleteDependency('d1')
      expect(mockFetch.mock.calls[0][0]).toBe('/api/dependencies/d1')
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
  })

  describe('plans', () => {
    it('getPlans calls correct endpoint', async () => {
      mockFetch.mockResolvedValue(mockResponse([]))
      await api.getPlans('obj-1')
      expect(mockFetch.mock.calls[0][0]).toBe('/api/objects/obj-1/plans')
    })

    it('upsertOperationalPlan sends PUT', async () => {
      mockFetch.mockResolvedValue(mockResponse({}))
      await api.upsertOperationalPlan('obj-1', { start_date: '2026-04-01', end_date: '2026-04-10' })
      expect(mockFetch).toHaveBeenCalledWith('/api/objects/obj-1/plans/operational', expect.objectContaining({ method: 'PUT' }))
    })

    it('createBaseline sends POST', async () => {
      mockFetch.mockResolvedValue(mockResponse({}))
      await api.createBaseline('obj-1')
      expect(mockFetch.mock.calls[0][1].method).toBe('POST')
      expect(mockFetch.mock.calls[0][0]).toBe('/api/objects/obj-1/plans/baseline')
    })

    it('deleteBaseline sends DELETE', async () => {
      mockFetch.mockResolvedValue(mock204())
      await api.deleteBaseline('obj-1')
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
  })

  describe('requisites', () => {
    it('getRequisites calls GET', async () => {
      mockFetch.mockResolvedValue(mockResponse([]))
      await api.getRequisites()
      expect(mockFetch.mock.calls[0][0]).toBe('/api/requisites')
    })

    it('createRequisite sends POST', async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: '1' }))
      await api.createRequisite({ name: 'R', type: 'string', config: {} })
      expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })

    it('deleteRequisite sends DELETE', async () => {
      mockFetch.mockResolvedValue(mock204())
      await api.deleteRequisite('1')
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
  })

  describe('classifier values', () => {
    it('getClassifierValues calls correct endpoint', async () => {
      mockFetch.mockResolvedValue(mockResponse([]))
      await api.getClassifierValues('req-1')
      expect(mockFetch.mock.calls[0][0]).toBe('/api/requisites/req-1/values')
    })

    it('createClassifierValue sends POST with name', async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: 'v1' }))
      await api.createClassifierValue('req-1', { name: 'Value A' })
      expect(mockFetch.mock.calls[0][0]).toBe('/api/requisites/req-1/values')
      expect(mockFetch.mock.calls[0][1].method).toBe('POST')
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.name).toBe('Value A')
    })

    it('updateClassifierValue sends PUT', async () => {
      mockFetch.mockResolvedValue(mockResponse({}))
      await api.updateClassifierValue('v1', { name: 'Updated', is_locked: true })
      expect(mockFetch).toHaveBeenCalledWith('/api/requisites/values/v1', expect.objectContaining({ method: 'PUT' }))
    })

    it('deleteClassifierValue sends DELETE', async () => {
      mockFetch.mockResolvedValue(mock204())
      await api.deleteClassifierValue('v1')
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })

    it('reorderClassifierValues sends POST with ids', async () => {
      mockFetch.mockResolvedValue(mock204())
      await api.reorderClassifierValues('req-1', ['v1', 'v2', 'v3'])
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.ids).toEqual(['v1', 'v2', 'v3'])
    })
  })

  describe('ref records', () => {
    it('getRefRecords calls correct endpoint', async () => {
      mockFetch.mockResolvedValue(mockResponse([]))
      await api.getRefRecords('t1', 'obj1')
      expect(mockFetch.mock.calls[0][0]).toBe('/api/ref-tables/t1/records?object_id=obj1')
    })

    it('getRefRecords without objectId', async () => {
      mockFetch.mockResolvedValue(mockResponse([]))
      await api.getRefRecords('t1')
      expect(mockFetch.mock.calls[0][0]).toBe('/api/ref-tables/t1/records')
    })

    it('createRefRecord sends POST', async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: 'r1' }))
      await api.createRefRecord('t1', { object_id: 'o1', data: { field: 'value' } })
      expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })

    it('updateRefRecord sends PUT', async () => {
      mockFetch.mockResolvedValue(mockResponse({}))
      await api.updateRefRecord('r1', { data: { field: 'updated' } })
      expect(mockFetch).toHaveBeenCalledWith('/api/ref-records/r1', expect.objectContaining({ method: 'PUT' }))
    })

    it('deleteRefRecord sends DELETE', async () => {
      mockFetch.mockResolvedValue(mock204())
      await api.deleteRefRecord('r1')
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
  })

  describe('todos', () => {
    it('createTodo sends title', async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: '1' }))
      await api.createTodo({ title: 'Do thing' })
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.title).toBe('Do thing')
    })

    it('toggleTodo sends PATCH', async () => {
      mockFetch.mockResolvedValue(mockResponse({}))
      await api.toggleTodo('1')
      expect(mockFetch).toHaveBeenCalledWith('/api/todos/1/toggle', expect.objectContaining({ method: 'PATCH' }))
    })

    it('deleteTodo sends DELETE', async () => {
      mockFetch.mockResolvedValue(mock204())
      await api.deleteTodo('1')
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
  })

  describe('news', () => {
    it('getNews calls GET', async () => {
      mockFetch.mockResolvedValue(mockResponse([]))
      await api.getNews()
      expect(mockFetch.mock.calls[0][0]).toBe('/api/news')
    })

    it('createNews sends title and body', async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: '1' }))
      await api.createNews({ title: 'Breaking', body: 'Details' })
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.title).toBe('Breaking')
      expect(body.body).toBe('Details')
    })
  })

  describe('dashboard', () => {
    it('getDashboardRequests calls correct endpoint', async () => {
      mockFetch.mockResolvedValue(mockResponse([]))
      await api.getDashboardRequests()
      expect(mockFetch.mock.calls[0][0]).toBe('/api/dashboard/requests')
    })

    it('getDashboardDirections calls correct endpoint', async () => {
      mockFetch.mockResolvedValue(mockResponse([]))
      await api.getDashboardDirections()
      expect(mockFetch.mock.calls[0][0]).toBe('/api/dashboard/directions')
    })

    it('getDashboardEvents calls correct endpoint', async () => {
      mockFetch.mockResolvedValue(mockResponse([]))
      await api.getDashboardEvents()
      expect(mockFetch.mock.calls[0][0]).toBe('/api/dashboard/events')
    })
  })

  describe('ref tables', () => {
    it('createRefTable sends POST', async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: '1' }))
      await api.createRefTable({ name: 'Table', structure: 'flat', input_mode: 'inline' })
      expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })

    it('addRefTableColumn sends POST to columns', async () => {
      mockFetch.mockResolvedValue(mockResponse({}))
      await api.addRefTableColumn('t1', { requisite_id: 'r1', sort_order: 1 })
      expect(mockFetch).toHaveBeenCalledWith('/api/ref-tables/t1/columns', expect.any(Object))
    })
  })
})
