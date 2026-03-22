import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Plus, Trash2, Pencil, X, Check, ChevronDown, ChevronRight, Lock, Unlock, Folder, Target, CheckSquare } from 'lucide-react'

const TYPES = ['string','number','date','boolean','classifier','html','file','formula','counter','process']

const typeLabels: Record<string, string> = {
  string: 'Строка', number: 'Число', date: 'Дата', boolean: 'Логический',
  classifier: 'Классификатор', html: 'HTML', file: 'Файл', formula: 'Формула',
  counter: 'Счётчик', process: 'Процесс',
}

const typeBadge: Record<string, string> = {
  string: 'badge badge-blue', number: 'badge badge-green',
  date: 'badge badge-purple', boolean: 'badge badge-amber',
  classifier: 'badge badge-pink', html: 'badge badge-orange',
  file: 'badge badge-gray', formula: 'badge badge-cyan',
  counter: 'badge badge-indigo', process: 'badge badge-red',
}

const STRING_FORMATS = [
  { value: 'text', label: 'Текст' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: 'E-mail' },
  { value: 'network_path', label: 'Сетевая папка' },
]

const NUMBER_FORMATS = [
  { value: 'number', label: 'Число' },
  { value: 'money', label: 'Денежный' },
  { value: 'percent', label: 'Проценты' },
]

const kindIcons: Record<string, any> = { directory: Folder, project: Target, task: CheckSquare }

// ─── Project Root Picker (tree with expand/collapse) ────

function ProjectRootPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [tree, setTree] = useState<any[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedName, setSelectedName] = useState<string>('')

  useEffect(() => {
    api.getObjectTree().then(t => setTree(t || [])).catch(() => {})
  }, [])

  // Resolve selected name
  useEffect(() => {
    if (!value || tree.length === 0) { setSelectedName(''); return }
    const find = (nodes: any[]): string => {
      for (const n of nodes) {
        if (n.id === value) return n.name
        if (n.children?.length) { const r = find(n.children); if (r) return r }
      }
      return ''
    }
    setSelectedName(find(tree))
  }, [value, tree])

  const toggleExpand = (id: string) => {
    setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  const renderNode = (node: any, level = 0): React.ReactNode => {
    const hasKids = !!(node.children?.length)
    const isExpanded = expanded.has(node.id)
    const isSelected = node.id === value
    const Icon = kindIcons[node.type_kind] || Folder
    const color = node.type_color || '#3d5af5'

    return (
      <div key={node.id}>
        <div className={`flex items-center gap-1.5 py-1 rounded transition-colors ${
          isSelected ? 'bg-primary-50 ring-1 ring-primary-200' : 'hover:bg-gray-50'
        }`} style={{ paddingLeft: `${level * 16 + 4}px` }}>
          <button type="button" onClick={() => hasKids && toggleExpand(node.id)}
            className="w-4 h-4 flex items-center justify-center flex-shrink-0 text-gray-400">
            {hasKids ? (isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span className="w-3" />}
          </button>
          <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: color + '18', color }}>
            <Icon size={9} />
          </div>
          <button type="button" onClick={() => onChange(isSelected ? '' : node.id)}
            className={`flex-1 text-left text-xs truncate ${
              isSelected ? 'font-semibold text-primary-700' : 'text-gray-700'
            }`}>
            {node.name}
          </button>
        </div>
        {hasKids && isExpanded && node.children.map((c: any) => renderNode(c, level + 1))}
      </div>
    )
  }

  return (
    <div>
      {/* Selected indicator */}
      {value && selectedName && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-primary-50 rounded-lg">
          <span className="text-xs text-primary-700 font-medium flex-1">{selectedName}</span>
          <button type="button" onClick={() => onChange('')}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors">
            <X size={12} />
          </button>
        </div>
      )}
      {/* Tree */}
      <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg py-1">
        {tree.length === 0 ? (
          <span className="text-xs text-gray-400 px-3 py-2 block">Нет проектов</span>
        ) : tree.map(node => renderNode(node))}
      </div>
    </div>
  )
}

// ─── Default configs per type ───────────────────────────

function defaultConfig(type: string): Record<string, any> {
  switch (type) {
    case 'string':
      return { min_length: null, max_length: 2000, format: 'text' }
    case 'number':
      return { digits_before: 10, decimal_places: 0, min_value: null, max_value: null, format: 'number' }
    case 'date':
      return { include_time: false }
    case 'html':
      return { min_length: null }
    case 'classifier':
      return { multiple: false, hierarchical: false, allow_node_select: false, base_object_type: 'none', root_project_id: null }
    case 'file':
      return { multiple: false }
    case 'formula':
      return { elements: [], linked_ref_table_id: null }
    case 'counter':
      return {
        next_value: 1, format: '###',
        show_year: false, show_month: false, date_position: 'suffix',
        reset_yearly: false, reset_monthly: false, allow_manual_edit: false,
      }
    case 'process':
      return { transition_roles: ['manager', 'executor'] }
    case 'boolean':
      return {}
    default:
      return {}
  }
}

// ─── Type-specific config panel ─────────────────────────

function TypeConfigPanel({ type, config, onChange, allRequisites }: {
  type: string; config: Record<string, any>; onChange: (c: Record<string, any>) => void; allRequisites?: any[]
}) {
  const set = (key: string, value: any) => onChange({ ...config, [key]: value })

  if (type === 'string') {
    return (
      <div className="border-t border-gray-100 pt-3 mt-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Свойства типа «Строка»
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Минимальная длина</label>
            <input type="number" min="0"
              value={config.min_length ?? ''}
              onChange={e => set('min_length', e.target.value ? Number(e.target.value) : null)}
              className="input" placeholder="Не задана" />
          </div>
          <div>
            <label className="label">Максимальная длина *</label>
            <input type="number" min="1"
              value={config.max_length ?? 2000}
              onChange={e => set('max_length', e.target.value ? Number(e.target.value) : 2000)}
              className="input" />
          </div>
          <div>
            <label className="label">Формат *</label>
            <select value={config.format || 'text'}
              onChange={e => set('format', e.target.value)}
              className="select">
              {STRING_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
        </div>
      </div>
    )
  }

  if (type === 'number') {
    const handleFormatChange = (fmt: string) => {
      const updates: Record<string, any> = { format: fmt }
      // Денежный формат → фиксируем 2 знака после запятой
      if (fmt === 'money') updates.decimal_places = 2
      onChange({ ...config, ...updates })
    }

    return (
      <div className="border-t border-gray-100 pt-3 mt-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Свойства типа «Число»
        </h4>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Число цифр до запятой *</label>
            <input type="number" min="1" max="30"
              value={config.digits_before ?? 10}
              onChange={e => set('digits_before', Number(e.target.value) || 10)}
              className="input" />
          </div>
          <div>
            <label className="label">Число цифр после запятой *</label>
            <input type="number" min="0" max="10"
              value={config.decimal_places ?? 0}
              onChange={e => set('decimal_places', Number(e.target.value))}
              className="input"
              disabled={config.format === 'money'} />
            {config.format === 'money' && (
              <p className="text-xs text-gray-400 mt-1">Фиксировано 2 для денежного формата</p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="label">Формат отображения *</label>
            <select value={config.format || 'number'}
              onChange={e => handleFormatChange(e.target.value)}
              className="select">
              {NUMBER_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Минимальное значение</label>
            <input type="number"
              value={config.min_value ?? ''}
              onChange={e => set('min_value', e.target.value ? Number(e.target.value) : null)}
              className="input" placeholder="—" />
          </div>
          <div>
            <label className="label">Максимальное значение</label>
            <input type="number"
              value={config.max_value ?? ''}
              onChange={e => set('max_value', e.target.value ? Number(e.target.value) : null)}
              className="input" placeholder="—" />
          </div>
        </div>
        <p className="text-xs text-gray-400">
          {config.format === 'money'
            ? 'Денежный формат: хранится с фиксированной точностью (decimal), отображается с разделителями разрядов.'
            : config.format === 'percent'
            ? 'Проценты: значение отображается со знаком %. Хранится как число (0–100).'
            : 'Числовое значение. Используется в расчётах и OLAP-анализе.'
          }
        </p>
      </div>
    )
  }

  if (type === 'date') {
    return (
      <div className="border-t border-gray-100 pt-3 mt-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Свойства типа «Дата»
        </h4>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={config.include_time || false}
            onChange={e => set('include_time', e.target.checked)}
            className="checkbox" />
          <span className="text-sm text-gray-700">Включить время</span>
        </label>
      </div>
    )
  }

  if (type === 'html') {
    return (
      <div className="border-t border-gray-100 pt-3 mt-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Свойства типа «HTML»
        </h4>
        <div className="max-w-xs">
          <label className="label">Минимальная длина (без пробелов)</label>
          <input type="number" min="0"
            value={config.min_length ?? ''}
            onChange={e => set('min_length', e.target.value ? Number(e.target.value) : null)}
            className="input" placeholder="Не задана" />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Поле с поддержкой HTML-разметки и форматирования текста.
          При использовании в карточке объекта отображается rich-text редактор.
        </p>
      </div>
    )
  }

  if (type === 'file') {
    return (
      <div className="border-t border-gray-100 pt-3 mt-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Свойства типа «Файл»
        </h4>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={config.multiple || false}
            onChange={e => set('multiple', e.target.checked)}
            className="checkbox" />
          <span className="text-sm text-gray-700">Разрешить выбор нескольких файлов</span>
        </label>
        <p className="text-xs text-gray-400 mt-2">
          Прикреплённые файлы сохраняются как документы объекта.
        </p>
      </div>
    )
  }

  if (type === 'classifier') {
    const BASE_OBJECT_TYPES = [
      { value: 'none', label: 'Нет (стандартный)' },
      { value: 'project', label: 'Проект' },
      { value: 'document', label: 'Документ' },
      { value: 'discussion', label: 'Дискуссия' },
      { value: 'user', label: 'Пользователь' },
      { value: 'status', label: 'Статус объекта' },
    ]

    return (
      <div className="border-t border-gray-100 pt-3 mt-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Свойства типа «Классификатор»
        </h4>
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={config.multiple || false}
              onChange={e => set('multiple', e.target.checked)}
              className="checkbox" />
            <span className="text-sm text-gray-700">Разрешить выбор нескольких значений</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={config.hierarchical || false}
              onChange={e => set('hierarchical', e.target.checked)}
              className="checkbox" />
            <span className="text-sm text-gray-700">Иерархический</span>
          </label>
          {config.hierarchical && (
            <label className="flex items-center gap-2 cursor-pointer ml-6">
              <input type="checkbox" checked={config.allow_node_select || false}
                onChange={e => set('allow_node_select', e.target.checked)}
                className="checkbox" />
              <span className="text-sm text-gray-700">Разрешить выбор узловых значений</span>
            </label>
          )}
          <div className="max-w-sm">
            <label className="label">Тип базового объекта</label>
            <select value={config.base_object_type || 'none'}
              onChange={e => set('base_object_type', e.target.value)}
              className="select">
              {BASE_OBJECT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
        {config.base_object_type === 'none' && (
          <p className="text-xs text-gray-400 mt-3">
            Значения задаются вручную после сохранения реквизита (блок «Значения» ниже).
          </p>
        )}
        {config.base_object_type === 'project' && (
          <div className="mt-3">
            <label className="label">Корневой проект для иерархии</label>
            <ProjectRootPicker
              value={config.root_project_id || ''}
              onChange={id => set('root_project_id', id || null)}
            />
            <p className="text-xs text-gray-400 mt-1.5">
              {config.root_project_id
                ? 'Значения классификатора — дочерние объекты выбранного проекта.'
                : 'Не выбран — будут доступны все проекты из дерева.'}
            </p>
          </div>
        )}
      </div>
    )
  }

  if (type === 'process') {
    const ROLES = [
      { value: 'manager', label: 'Руководитель' },
      { value: 'executor', label: 'Исполнитель' },
    ]

    const roles = config.transition_roles || ['manager', 'executor']
    const toggleRole = (role: string) => {
      const next = roles.includes(role) ? roles.filter((r: string) => r !== role) : [...roles, role]
      onChange({ ...config, transition_roles: next })
    }

    return (
      <div className="border-t border-gray-100 pt-3 mt-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Свойства типа «Процесс»
        </h4>
        <div className="space-y-3">
          <div>
            <label className="label">Кто может переводить между этапами</label>
            <div className="flex gap-4">
              {ROLES.map(r => (
                <label key={r.value} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={roles.includes(r.value)}
                    onChange={() => toggleRole(r.value)}
                    className="checkbox" />
                  <span className="text-sm text-gray-700">{r.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Этапы процесса задаются как значения после сохранения (блок «Этапы» ниже).
          На карточке объекта отображается горизонтальная шкала с возможностью перехода между этапами.
        </p>
      </div>
    )
  }

  if (type === 'formula') {
    const elements: any[] = config.elements || []
    const numericReqs = (allRequisites || []).filter((r: any) => r.type === 'number')

    const push = (el: any) => onChange({ ...config, elements: [...elements, el] })
    const removeAt = (idx: number) => onChange({ ...config, elements: elements.filter((_: any, i: number) => i !== idx) })
    const clear = () => onChange({ ...config, elements: [] })

    const addRequisite = (reqId: string) => {
      const r = (allRequisites || []).find((r: any) => r.id === reqId)
      if (r) push({ type: 'requisite', value: r.id, label: r.name })
    }
    const addOperator = (op: string) => push({ type: 'operator', value: op })
    const addParen = (p: string) => push({ type: 'paren', value: p })
    const addConstant = () => push({ type: 'constant', value: '' })

    const updateConstant = (idx: number, val: string) => {
      const next = elements.map((el: any, i: number) => i === idx ? { ...el, value: val } : el)
      onChange({ ...config, elements: next })
    }

    // Render formula bar preview
    const renderPreview = () => elements.map((el: any, idx: number) => {
      if (el.type === 'operator') return (
        <span key={idx} className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-primary-600">{el.value}</span>
      )
      if (el.type === 'paren') return (
        <span key={idx} className="inline-flex items-center justify-center w-4 h-6 text-sm font-bold text-gray-500">{el.value}</span>
      )
      if (el.type === 'constant') return (
        <span key={idx} className="inline-flex items-center">
          <input type="number" value={el.value}
            onChange={e => updateConstant(idx, e.target.value)}
            className="w-16 h-6 px-1.5 text-xs text-center bg-amber-50 border border-amber-200 rounded font-mono text-amber-800
                       focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
            placeholder="0" />
        </span>
      )
      // requisite
      return (
        <span key={idx} className="inline-flex items-center gap-1 h-6 px-2 bg-primary-50 border border-primary-200 rounded text-xs font-medium text-primary-700 whitespace-nowrap">
          {el.label || '?'}
        </span>
      )
    })

    return (
      <div className="border-t border-gray-100 pt-3 mt-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Конструктор формулы
        </h4>

        {/* Formula bar — shows the assembled formula */}
        <div className="mb-3 rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="flex items-center gap-1 px-3 py-2 min-h-[40px] flex-wrap"
            style={{ fontFamily: 'var(--font-mono, monospace)' }}>
            {elements.length === 0 ? (
              <span className="text-sm text-gray-300 italic">Формула пуста — добавьте элементы ниже</span>
            ) : (
              <>
                {renderPreview()}
                {/* Delete last element */}
                <button type="button" onClick={() => removeAt(elements.length - 1)}
                  className="ml-1 p-0.5 text-gray-300 hover:text-red-500 transition-colors" title="Удалить последний">
                  <X size={14} />
                </button>
              </>
            )}
          </div>
          {elements.length > 1 && (
            <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <span className="text-[10px] text-gray-400 font-mono">
                = {elements.map((el: any) => {
                  if (el.type === 'operator' || el.type === 'paren') return el.value
                  if (el.type === 'constant') return el.value || '0'
                  return el.label || '?'
                }).join(' ')}
              </span>
              <button type="button" onClick={clear} className="text-[10px] text-gray-400 hover:text-red-500 transition-colors">
                очистить
              </button>
            </div>
          )}
        </div>

        {/* Toolbar — buttons to add elements */}
        <div className="flex flex-wrap items-start gap-3">
          {/* Requisite picker */}
          <div className="flex-1 min-w-[180px]">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Реквизит</label>
            <select
              value=""
              onChange={e => { if (e.target.value) addRequisite(e.target.value) }}
              className="select select-sm w-full">
              <option value="">+ выбрать реквизит</option>
              {numericReqs.map((r: any) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
              {numericReqs.length === 0 && (
                <option disabled>Нет числовых реквизитов</option>
              )}
            </select>
          </div>

          {/* Operators */}
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Операторы</label>
            <div className="flex gap-1">
              {['+', '−', '×', '÷'].map((label, i) => {
                const ops = ['+', '-', '*', '/']
                return (
                  <button key={label} type="button" onClick={() => addOperator(ops[i])}
                    className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-primary-50 hover:text-primary-600
                               text-sm font-bold text-gray-600 transition-colors flex items-center justify-center">
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Parens + Constant */}
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Прочее</label>
            <div className="flex gap-1">
              <button type="button" onClick={() => addParen('(')}
                className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-bold text-gray-500 transition-colors flex items-center justify-center">(</button>
              <button type="button" onClick={() => addParen(')')}
                className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-bold text-gray-500 transition-colors flex items-center justify-center">)</button>
              <button type="button" onClick={addConstant}
                className="h-8 px-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200
                           text-xs font-semibold text-amber-700 transition-colors flex items-center gap-1">
                123
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (type === 'counter') {
    // Build preview
    const fmt = config.format || '###'
    const nextVal = config.next_value ?? 1
    const digits = (fmt.match(/#/g) || []).length || 1
    const numPart = String(nextVal).padStart(digits, '0')
    const replaced = fmt.replace(/#+/, numPart)
    const now = new Date()
    const yearStr = String(now.getFullYear())
    const monthStr = String(now.getMonth() + 1).padStart(2, '0')
    let datePart = ''
    if (config.show_year && config.show_month) datePart = `${monthStr}.${yearStr}`
    else if (config.show_year) datePart = yearStr
    else if (config.show_month) datePart = monthStr
    let preview = replaced
    if (datePart) {
      preview = config.date_position === 'prefix' ? `${datePart}.${replaced}` : `${replaced}.${datePart}`
    }

    return (
      <div className="border-t border-gray-100 pt-3 mt-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Свойства типа «Счётчик»
        </h4>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Следующее значение *</label>
            <input type="number" min="1"
              value={config.next_value ?? 1}
              onChange={e => set('next_value', Number(e.target.value) || 1)}
              className="input" />
          </div>
          <div>
            <label className="label">Формат * (# = цифра)</label>
            <div className="flex gap-2 items-center">
              <input value={config.format || '###'}
                onChange={e => set('format', e.target.value)}
                className="input flex-1" placeholder="###" />
              <span className="text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 whitespace-nowrap">
                {preview}
              </span>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <label className="label">Опции даты</label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={config.show_year || false}
                onChange={e => set('show_year', e.target.checked)}
                className="checkbox" />
              <span className="text-sm text-gray-700">Показывать год в формате ГГГГ</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={config.show_month || false}
                onChange={e => set('show_month', e.target.checked)}
                className="checkbox" />
              <span className="text-sm text-gray-700">Показывать месяц в формате ММ</span>
            </label>
            {(config.show_year || config.show_month) && (
              <div className="ml-6">
                <select value={config.date_position || 'suffix'}
                  onChange={e => set('date_position', e.target.value)}
                  className="select-sm w-32">
                  <option value="prefix">Префикс</option>
                  <option value="suffix">Суффикс</option>
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={config.reset_yearly || false}
              onChange={e => set('reset_yearly', e.target.checked)}
              className="checkbox" />
            <span className="text-sm text-gray-700">Обнулять в начале года</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={config.reset_monthly || false}
              onChange={e => set('reset_monthly', e.target.checked)}
              className="checkbox" />
            <span className="text-sm text-gray-700">Обнулять в начале месяца</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={config.allow_manual_edit || false}
              onChange={e => set('allow_manual_edit', e.target.checked)}
              className="checkbox" />
            <span className="text-sm text-gray-700">Разрешить ручное редактирование</span>
          </label>
        </div>
      </div>
    )
  }

  return null
}

// ─── Classifier Values Editor ───────────────────────────

function ClassifierValuesEditor({ requisiteId, label }: { requisiteId: string; label?: string }) {
  const [values, setValues] = useState<any[]>([])
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    api.getClassifierValues(requisiteId).then(setValues).catch(() => setValues([])).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [requisiteId])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    await api.createClassifierValue(requisiteId, { name: newName.trim() })
    setNewName('')
    load()
  }

  const handleRename = async (id: string) => {
    if (!editName.trim()) return
    await api.updateClassifierValue(id, { name: editName.trim() })
    setEditingId(null)
    load()
  }

  const handleLock = async (v: any) => {
    await api.updateClassifierValue(v.id, { is_locked: !v.is_locked })
    load()
  }

  const handleDelete = async (id: string) => {
    await api.deleteClassifierValue(id)
    load()
  }

  // Flatten tree for display
  const flatList: { item: any; level: number }[] = []
  const flatten = (items: any[], level = 0) => {
    for (const item of items) {
      flatList.push({ item, level })
      if (item.children?.length) flatten(item.children, level + 1)
    }
  }
  flatten(values)

  return (
    <div className="card mt-4">
      <div className="card-header">
        <h3 className="card-header-title">{label || 'Значения классификатора'}</h3>
        <span className="badge badge-gray">{flatList.length}</span>
      </div>

      {/* Add form */}
      <form onSubmit={handleAdd} className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
        <input value={newName} onChange={e => setNewName(e.target.value)}
          className="input input-sm flex-1 max-w-xs" placeholder="Новое значение..." />
        <button type="submit" className="btn-primary btn-xs">Добавить</button>
      </form>

      {/* Values list */}
      {loading ? (
        <div className="p-4 text-sm text-gray-400 text-center">Загрузка...</div>
      ) : flatList.length === 0 ? (
        <div className="empty-state py-6">
          <p className="empty-state-text">Нет значений</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {flatList.map(({ item, level }) => (
            <div key={item.id}
              className={`flex items-center gap-2 px-4 py-2 group hover:bg-gray-50/70 transition-colors ${
                item.is_locked ? 'opacity-50' : ''
              }`}
              style={{ paddingLeft: `${level * 20 + 16}px` }}>
              {level > 0 && <span className="text-xs text-gray-300 mr-1">&gt;</span>}

              {editingId === item.id ? (
                <>
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    className="input input-sm flex-1" autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleRename(item.id); if (e.key === 'Escape') setEditingId(null) }} />
                  <button onClick={() => handleRename(item.id)} className="btn-success btn-xs p-1"><Check size={12} /></button>
                  <button onClick={() => setEditingId(null)} className="btn-secondary btn-xs p-1"><X size={12} /></button>
                </>
              ) : (
                <>
                  <span className={`flex-1 text-sm ${item.is_locked ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                    {item.name}
                  </span>
                  <button onClick={() => { setEditingId(item.id); setEditName(item.name) }}
                    className="icon-btn reveal-on-hover p-1" title="Переименовать">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => handleLock(item)}
                    className={`text-xs px-1.5 py-0.5 rounded reveal-on-hover transition-colors ${
                      item.is_locked ? 'text-amber-600 bg-amber-50' : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'
                    }`} title={item.is_locked ? 'Разблокировать' : 'Заблокировать'}>
                    {item.is_locked ? 'Разблок.' : 'Заблок.'}
                  </button>
                  <button onClick={() => handleDelete(item.id)}
                    className="icon-btn-danger reveal-on-hover p-1" title="Удалить">
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Requisite Form (create/edit) ───────────────────────

function RequisiteForm({ initial, groups, allRequisites, onSave, onCancel, title }: {
  initial: { name: string; type: string; description: string; is_unique: boolean; group_id: string; config: Record<string, any> }
  groups: any[]; allRequisites?: any[]
  onSave: (data: any) => void
  onCancel: () => void
  title: string
}) {
  const [form, setForm] = useState(initial)
  const [newGroup, setNewGroup] = useState('')

  const handleTypeChange = (type: string) => {
    setForm({ ...form, type, config: defaultConfig(type) })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data: any = { ...form }
    if (newGroup.trim()) {
      data.new_group = newGroup.trim()
    }
    onSave(data)
  }

  return (
    <form onSubmit={handleSubmit} className="card mb-6" style={{ animation: 'slideDown 0.25s ease-out' }}>
      <div className="card-body space-y-4">
        <h3 className="form-section-title">{title}</h3>

        {/* Row 1: Name + Type */}
        <div className="form-grid">
          <div>
            <label className="label">Название *</label>
            <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
              className="input" required autoFocus />
          </div>
          <div>
            <label className="label">Тип реквизита</label>
            <select value={form.type} onChange={e => handleTypeChange(e.target.value)}
              className="select">
              {TYPES.map(t => <option key={t} value={t}>{typeLabels[t] || t}</option>)}
            </select>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="label">Описание</label>
          <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
            className="textarea" rows={2} placeholder="Необязательно" />
        </div>

        {/* Group */}
        <div className="form-grid">
          <div>
            <label className="label">Группа реквизитов</label>
            <select value={form.group_id} onChange={e => setForm({...form, group_id: e.target.value})}
              className="select">
              <option value="">— Без группы —</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Или создать новую</label>
            <input value={newGroup} onChange={e => setNewGroup(e.target.value)}
              className="input" placeholder="Название новой группы" />
          </div>
        </div>

        {/* Unique */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.is_unique}
            onChange={e => setForm({...form, is_unique: e.target.checked})}
            className="checkbox" />
          <span className="text-sm text-gray-700">Значение уникально</span>
        </label>

        {/* Type-specific config */}
        <TypeConfigPanel
          type={form.type}
          config={form.config}
          onChange={config => setForm({...form, config})}
          allRequisites={allRequisites}
        />

        <div className="form-actions">
          <button type="submit" className="btn-primary btn-sm">Сохранить</button>
          <button type="button" onClick={onCancel} className="btn-secondary btn-sm">Отмена</button>
        </div>
      </div>
    </form>
  )
}

// ─── Config summary for list view ───────────────────────

function ConfigSummary({ type, config }: { type: string; config: any }) {
  if (!config || typeof config !== 'object') return null

  if (type === 'string') {
    const parts: string[] = []
    if (config.max_length && config.max_length !== 2000) parts.push(`макс. ${config.max_length}`)
    if (config.min_length) parts.push(`мин. ${config.min_length}`)
    if (config.format && config.format !== 'text') {
      const label = STRING_FORMATS.find(f => f.value === config.format)?.label
      if (label) parts.push(label)
    }
    if (parts.length === 0) return null
    return <span className="text-[10px] text-gray-400">{parts.join(' · ')}</span>
  }

  if (type === 'number') {
    const parts: string[] = []
    const fmtLabel = NUMBER_FORMATS.find(f => f.value === config.format)?.label
    if (fmtLabel && config.format !== 'number') parts.push(fmtLabel)
    if (config.digits_before && config.digits_before !== 10) parts.push(`${config.digits_before}.${config.decimal_places || 0}`)
    else if (config.decimal_places > 0) parts.push(`${config.decimal_places} зн.`)
    if (config.min_value != null) parts.push(`от ${config.min_value}`)
    if (config.max_value != null) parts.push(`до ${config.max_value}`)
    if (parts.length === 0) return null
    return <span className="text-[10px] text-gray-400">{parts.join(' · ')}</span>
  }

  if (type === 'date' && config.include_time) {
    return <span className="text-[10px] text-gray-400">с временем</span>
  }

  if (type === 'html') {
    if (config.min_length) return <span className="text-[10px] text-gray-400">мин. {config.min_length} симв.</span>
    return <span className="text-[10px] text-gray-400">rich-text</span>
  }

  if (type === 'file') {
    return <span className="text-[10px] text-gray-400">{config.multiple ? 'несколько файлов' : 'файл'}</span>
  }

  if (type === 'classifier') {
    const parts: string[] = []
    if (config.multiple) parts.push('множеств.')
    if (config.hierarchical) parts.push('иерарх.')
    if (config.base_object_type && config.base_object_type !== 'none') parts.push(`база: ${config.base_object_type}`)
    if (parts.length === 0) return <span className="text-[10px] text-gray-400">список</span>
    return <span className="text-[10px] text-gray-400">{parts.join(' · ')}</span>
  }

  if (type === 'process') {
    return <span className="text-[10px] text-gray-400">шкала этапов</span>
  }

  if (type === 'formula') {
    const els = config.elements || []
    if (els.length === 0) return <span className="text-[10px] text-gray-400">формула</span>
    const expr = els.map((el: any) => {
      if (el.type === 'operator' || el.type === 'paren') return el.value
      if (el.type === 'constant') return el.value || '0'
      return el.label || '?'
    }).join(' ')
    return <span className="text-[10px] text-gray-400 font-mono truncate max-w-[140px] inline-block">{expr}</span>
  }

  if (type === 'counter') {
    const parts: string[] = []
    if (config.format && config.format !== '###') parts.push(config.format)
    if (config.show_year || config.show_month) parts.push('с датой')
    if (config.reset_yearly) parts.push('сброс/год')
    if (parts.length === 0) return <span className="text-[10px] text-gray-400">авто-номер</span>
    return <span className="text-[10px] text-gray-400">{parts.join(' · ')}</span>
  }

  return null
}

// ─── Main Page ──────────────────────────────────────────

export default function RequisitesPage() {
  const [reqs, setReqs] = useState<any[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = () => {
    api.getRequisites().then(setReqs).catch(() => {})
    api.getRequisiteGroups().then(setGroups).catch(() => setGroups([]))
  }
  useEffect(() => { load() }, [])

  const handleCreate = async (data: any) => {
    // If new group requested, create it first
    let groupId = data.group_id
    if (data.new_group) {
      try {
        const g = await api.createRequisiteGroup({ name: data.new_group })
        groupId = g.id
      } catch {}
    }
    await api.createRequisite({
      name: data.name, type: data.type, description: data.description,
      is_unique: data.is_unique, group_id: groupId || undefined,
      config: data.config || {},
    })
    setShowCreate(false)
    load()
  }

  const handleUpdate = async (data: any) => {
    if (!editingId) return
    let groupId = data.group_id
    if (data.new_group) {
      try {
        const g = await api.createRequisiteGroup({ name: data.new_group })
        groupId = g.id
      } catch {}
    }
    await api.updateRequisite(editingId, {
      name: data.name, type: data.type, description: data.description,
      is_unique: data.is_unique, group_id: groupId || undefined,
      config: data.config || {},
    })
    setEditingId(null)
    load()
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await api.deleteRequisite(id)
    load()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Реквизиты</h1>
          <p className="page-subtitle">Настраиваемые поля объектов</p>
        </div>
        <button onClick={() => { setShowCreate(!showCreate); setEditingId(null) }} className="btn-primary">
          <Plus size={16} /> Создать
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <RequisiteForm
          title="Новый реквизит"
          groups={groups}
          allRequisites={reqs}
          initial={{ name: '', type: 'string', description: '', is_unique: false, group_id: '', config: defaultConfig('string') }}
          onSave={handleCreate}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Edit form */}
      {editingId && (() => {
        const r = reqs.find(r => r.id === editingId)
        if (!r) return null
        return (
          <>
            <RequisiteForm
              key={editingId}
              title={`Редактирование: ${r.name}`}
              groups={groups}
              allRequisites={reqs}
              initial={{
                name: r.name || '', type: r.type || 'string',
                description: r.description || '', is_unique: r.is_unique || false,
                group_id: r.group_id || '',
                config: r.config && typeof r.config === 'object' && Object.keys(r.config).length > 0
                  ? r.config
                  : defaultConfig(r.type || 'string'),
              }}
              onSave={handleUpdate}
              onCancel={() => setEditingId(null)}
            />
            {(r.type === 'classifier' || r.type === 'process') && (
              <ClassifierValuesEditor requisiteId={r.id} label={r.type === 'process' ? 'Этапы процесса' : undefined} />
            )}
          </>
        )
      })()}

      {/* List */}
      <div className="card">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50/70 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          <span className="w-24">Тип</span>
          <span className="flex-1">Название</span>
          <span className="w-32 hidden sm:block">Группа</span>
          <span className="w-36 hidden md:block">Настройки</span>
          <span className="w-20 text-center">Уникальный</span>
          <span className="w-16" />
        </div>

        <div className="divide-y divide-gray-50">
          {reqs.map(r => (
            <div key={r.id}
              className={`flex items-center gap-3 px-4 py-3 group transition-colors cursor-pointer ${
                editingId === r.id ? 'bg-primary-50/30' : 'hover:bg-gray-50/70'
              }`}
              onClick={() => { setEditingId(r.id); setShowCreate(false) }}>
              <span className={`${typeBadge[r.type] || 'badge badge-gray'} w-24 justify-center`}>
                {typeLabels[r.type] || r.type}
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-900">{r.name}</span>
                {r.description && <p className="text-xs text-gray-400 truncate">{r.description}</p>}
              </div>
              <span className="w-32 text-xs text-gray-400 truncate hidden sm:block">
                {r.group_name || '—'}
              </span>
              <span className="w-36 hidden md:block">
                <ConfigSummary type={r.type} config={r.config} />
              </span>
              <span className="w-20 text-center">
                {r.is_unique && <span className="badge badge-amber">Да</span>}
              </span>
              <div className="flex gap-1 w-16 justify-end">
                <button onClick={(e) => { e.stopPropagation(); setEditingId(r.id); setShowCreate(false) }}
                  className="icon-btn reveal-on-hover p-1" title="Редактировать">
                  <Pencil size={13} />
                </button>
                <button onClick={(e) => handleDelete(e, r.id)}
                  className="icon-btn-danger reveal-on-hover p-1" title="Удалить">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
          {reqs.length === 0 && (
            <div className="empty-state">
              <p className="empty-state-text">Нет реквизитов</p>
              <p className="empty-state-hint">Создайте первый реквизит</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
