import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock API
const mockUsers = [
  { id: 'u1', email: 'admin@test.com', first_name: 'Admin', last_name: 'User', is_active: true, is_admin: true, created_at: '2024-01-01T00:00:00Z' },
  { id: 'u2', email: 'user@test.com', first_name: 'Regular', last_name: 'User', is_active: true, is_admin: false, created_at: '2024-01-02T00:00:00Z' },
  { id: 'u3', email: 'blocked@test.com', first_name: 'Blocked', last_name: 'User', is_active: false, is_admin: false, created_at: '2024-01-03T00:00:00Z' },
]

describe('Users management', () => {
  it('has correct user structure', () => {
    const admin = mockUsers[0]
    expect(admin.is_admin).toBe(true)
    expect(admin.is_active).toBe(true)
    expect(admin.email).toBe('admin@test.com')
  })

  it('filters active users', () => {
    const active = mockUsers.filter(u => u.is_active)
    expect(active).toHaveLength(2)
    expect(active.map(u => u.id)).toEqual(['u1', 'u2'])
  })

  it('filters admin users', () => {
    const admins = mockUsers.filter(u => u.is_admin)
    expect(admins).toHaveLength(1)
    expect(admins[0].first_name).toBe('Admin')
  })

  it('blocked user is_active=false', () => {
    const blocked = mockUsers.find(u => u.id === 'u3')
    expect(blocked?.is_active).toBe(false)
  })
})

describe('Permissions bitmask', () => {
  const ACTION_READ = 1
  const ACTION_CREATE = 2
  const ACTION_UPDATE = 4
  const ACTION_DELETE = 8

  it('single action', () => {
    expect(ACTION_READ & ACTION_READ).toBe(ACTION_READ)
    expect(ACTION_READ & ACTION_CREATE).toBe(0)
  })

  it('combined actions', () => {
    const readWrite = ACTION_READ | ACTION_UPDATE
    expect(readWrite).toBe(5)
    expect(readWrite & ACTION_READ).toBe(ACTION_READ)
    expect(readWrite & ACTION_UPDATE).toBe(ACTION_UPDATE)
    expect(readWrite & ACTION_DELETE).toBe(0)
  })

  it('all actions = 15', () => {
    const all = ACTION_READ | ACTION_CREATE | ACTION_UPDATE | ACTION_DELETE
    expect(all).toBe(15)
  })

  it('toggle action with XOR', () => {
    let actions = ACTION_READ | ACTION_UPDATE  // 5
    actions = actions ^ ACTION_UPDATE           // toggle off update
    expect(actions).toBe(ACTION_READ)           // 1
    actions = actions ^ ACTION_CREATE           // toggle on create
    expect(actions).toBe(ACTION_READ | ACTION_CREATE) // 3
  })

  it('check if action is set', () => {
    const actions = ACTION_READ | ACTION_CREATE | ACTION_DELETE // 11
    expect((actions & ACTION_READ) !== 0).toBe(true)
    expect((actions & ACTION_CREATE) !== 0).toBe(true)
    expect((actions & ACTION_UPDATE) !== 0).toBe(false)
    expect((actions & ACTION_DELETE) !== 0).toBe(true)
  })
})

describe('Access control logic', () => {
  // Simulate the isAncestorPath function from Go
  function isAncestorPath(ancestor: string, target: string): boolean {
    if (ancestor === target) return true
    return target.startsWith(ancestor + '.')
  }

  it('direct path match', () => {
    expect(isAncestorPath('a_b_c', 'a_b_c')).toBe(true)
  })

  it('ancestor check', () => {
    expect(isAncestorPath('a', 'a.b.c')).toBe(true)
    expect(isAncestorPath('a.b', 'a.b.c')).toBe(true)
  })

  it('not ancestor', () => {
    expect(isAncestorPath('a.b.c', 'a.b')).toBe(false)
    expect(isAncestorPath('a.b', 'a.bc')).toBe(false) // partial match should fail
    expect(isAncestorPath('x', 'a.b.c')).toBe(false)
  })

  it('recursive permission grants access to descendants', () => {
    const perms = [
      { resourceId: 'proj1', path: 'root.proj1', actions: 15, recursive: true },
    ]

    const targetPath = 'root.proj1.task1.subtask1'
    const hasAccess = perms.some(p => p.recursive && isAncestorPath(p.path, targetPath) && (p.actions & 1) !== 0)
    expect(hasAccess).toBe(true)
  })

  it('non-recursive permission does not grant access to descendants', () => {
    const perms = [
      { resourceId: 'proj1', path: 'root.proj1', actions: 15, recursive: false },
    ]

    const targetPath = 'root.proj1.task1'
    const hasAccess = perms.some(p => p.recursive && isAncestorPath(p.path, targetPath))
    expect(hasAccess).toBe(false)
  })
})
