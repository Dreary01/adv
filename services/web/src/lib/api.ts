const API_BASE = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('adv_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 204) return undefined as T;

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json.data;
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ token: string; user: any }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (data: { email: string; password: string; first_name: string; last_name: string }) =>
    request<any>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request<any>('/auth/me'),

  // Object Types
  getObjectTypes: () => request<any[]>('/object-types'),
  getObjectType: (id: string) => request<any>(`/object-types/${id}`),
  createObjectType: (data: any) => request<any>('/object-types', { method: 'POST', body: JSON.stringify(data) }),
  updateObjectType: (id: string, data: any) => request<any>(`/object-types/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteObjectType: (id: string) => request<void>(`/object-types/${id}`, { method: 'DELETE' }),
  setHierarchy: (id: string, childIds: string[]) =>
    request<any>(`/object-types/${id}/hierarchy`, { method: 'PUT', body: JSON.stringify({ child_type_ids: childIds }) }),
  bindRequisite: (typeId: string, data: any) =>
    request<any>(`/object-types/${typeId}/requisites`, { method: 'POST', body: JSON.stringify(data) }),
  unbindRequisite: (typeId: string, reqId: string) =>
    request<void>(`/object-types/${typeId}/requisites/${reqId}`, { method: 'DELETE' }),
  getTypeRefTables: (typeId: string) =>
    request<any[]>(`/object-types/${typeId}/ref-tables`),
  bindTypeRefTable: (typeId: string, refTableId: string) =>
    request<any>(`/object-types/${typeId}/ref-tables`, { method: 'POST', body: JSON.stringify({ ref_table_id: refTableId }) }),
  unbindTypeRefTable: (typeId: string, tableId: string) =>
    request<void>(`/object-types/${typeId}/ref-tables/${tableId}`, { method: 'DELETE' }),

  // Requisites
  getRequisites: () => request<any[]>('/requisites'),
  createRequisite: (data: any) => request<any>('/requisites', { method: 'POST', body: JSON.stringify(data) }),
  updateRequisite: (id: string, data: any) => request<any>(`/requisites/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRequisite: (id: string) => request<void>(`/requisites/${id}`, { method: 'DELETE' }),
  getRequisiteGroups: () => request<any[]>('/requisite-groups'),
  getClassifierValues: (reqId: string) => request<any[]>(`/requisites/${reqId}/values`),
  createClassifierValue: (reqId: string, data: { name: string; parent_id?: string }) =>
    request<any>(`/requisites/${reqId}/values`, { method: 'POST', body: JSON.stringify(data) }),
  updateClassifierValue: (valueId: string, data: any) =>
    request<any>(`/requisites/values/${valueId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteClassifierValue: (valueId: string) =>
    request<void>(`/requisites/values/${valueId}`, { method: 'DELETE' }),
  reorderClassifierValues: (reqId: string, ids: string[]) =>
    request<void>(`/requisites/${reqId}/values/reorder`, { method: 'POST', body: JSON.stringify({ ids }) }),
  createRequisiteGroup: (data: any) => request<any>('/requisite-groups', { method: 'POST', body: JSON.stringify(data) }),

  // Objects
  getObjects: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/objects${qs}`);
  },
  getObjectTree: () => request<any[]>('/objects/tree'),
  getObjectSubtree: (id: string) => request<any[]>(`/objects/${id}/subtree`),
  getObject: (id: string) => request<any>(`/objects/${id}`),
  createObject: (data: any) => request<any>('/objects', { method: 'POST', body: JSON.stringify(data) }),
  updateObject: (id: string, data: any) => request<any>(`/objects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteObject: (id: string) => request<void>(`/objects/${id}`, { method: 'DELETE' }),
  getDescendantsCount: (id: string) => request<{ count: number }>(`/objects/${id}/descendants-count`),
  moveObject: (id: string, data: { parent_id?: string | null; sort_order?: number }) =>
    request<any>(`/objects/${id}/move`, { method: 'PATCH', body: JSON.stringify(data) }),
  reorderObjects: (ids: string[]) =>
    request<void>('/objects/reorder', { method: 'POST', body: JSON.stringify({ ids }) }),

  // Todos
  getTodos: () => request<any[]>('/todos'),
  createTodo: (data: { title: string; due_date?: string; object_id?: string }) =>
    request<any>('/todos', { method: 'POST', body: JSON.stringify(data) }),
  updateTodo: (id: string, data: any) =>
    request<any>(`/todos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleTodo: (id: string) =>
    request<any>(`/todos/${id}/toggle`, { method: 'PATCH' }),
  deleteTodo: (id: string) =>
    request<void>(`/todos/${id}`, { method: 'DELETE' }),

  // News
  getNews: () => request<any[]>('/news'),
  createNews: (data: { title: string; body?: string }) =>
    request<any>('/news', { method: 'POST', body: JSON.stringify(data) }),

  // Dashboard
  getDashboardRequests: () => request<any[]>('/dashboard/requests'),
  getDashboardDirections: () => request<any[]>('/dashboard/directions'),
  getDashboardEvents: () => request<any[]>('/dashboard/events'),

  // Reference Tables
  getRefTables: () => request<any[]>('/ref-tables'),
  getRefTable: (id: string) => request<any>(`/ref-tables/${id}`),
  createRefTable: (data: any) => request<any>('/ref-tables', { method: 'POST', body: JSON.stringify(data) }),
  updateRefTable: (id: string, data: any) => request<any>(`/ref-tables/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRefTable: (id: string) => request<void>(`/ref-tables/${id}`, { method: 'DELETE' }),
  addRefTableColumn: (tableId: string, data: any) =>
    request<any>(`/ref-tables/${tableId}/columns`, { method: 'POST', body: JSON.stringify(data) }),
  updateRefTableColumn: (colId: string, data: any) =>
    request<any>(`/ref-tables/columns/${colId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRefTableColumn: (colId: string) =>
    request<void>(`/ref-tables/columns/${colId}`, { method: 'DELETE' }),

  // Dependencies
  getDependencies: (objectId: string) => request<any[]>(`/objects/${objectId}/dependencies`),
  createDependency: (objectId: string, data: { predecessor_id: string; successor_id: string; type?: string; lag_days?: number }) =>
    request<any>(`/objects/${objectId}/dependencies`, { method: 'POST', body: JSON.stringify(data) }),
  deleteDependency: (depId: string) => request<void>(`/dependencies/${depId}`, { method: 'DELETE' }),

  // Plans
  getPlans: (objectId: string) => request<any[]>(`/objects/${objectId}/plans`),
  upsertOperationalPlan: (objectId: string, data: any) =>
    request<any>(`/objects/${objectId}/plans/operational`, { method: 'PUT', body: JSON.stringify(data) }),
  createBaseline: (objectId: string) =>
    request<any>(`/objects/${objectId}/plans/baseline`, { method: 'POST', body: JSON.stringify({}) }),
  deleteBaseline: (objectId: string) =>
    request<void>(`/objects/${objectId}/plans/baseline`, { method: 'DELETE' }),

  // Reference Records
  getRefRecords: (tableId: string, objectId?: string) => {
    const qs = objectId ? `?object_id=${objectId}` : ''
    return request<any[]>(`/ref-tables/${tableId}/records${qs}`)
  },
  getRefAggregations: (tableId: string, objectId?: string) => {
    const qs = objectId ? `?object_id=${objectId}` : ''
    return request<Record<string, any>>(`/ref-tables/${tableId}/aggregations${qs}`)
  },
  createRefRecord: (tableId: string, data: any) =>
    request<any>(`/ref-tables/${tableId}/records`, { method: 'POST', body: JSON.stringify(data) }),
  updateRefRecord: (recordId: string, data: any) =>
    request<any>(`/ref-records/${recordId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRefRecord: (recordId: string) =>
    request<void>(`/ref-records/${recordId}`, { method: 'DELETE' }),
};
