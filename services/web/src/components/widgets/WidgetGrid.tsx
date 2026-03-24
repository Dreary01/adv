import { useEffect, useRef, useState, useCallback } from 'react'
import { Settings, GripVertical, X, Plus, RotateCcw, Check, Shield, Pencil, Cog } from 'lucide-react'
import { useLayoutStore } from '../../lib/layout-store'
import type { LayoutTier } from '../../lib/layout-store'
import { getWidget } from '../../lib/widget-registry'
import { useAuthStore } from '../../lib/store'
import type { PageType, WidgetPlacement, WidgetProps } from '../../lib/widget-types'

import WidgetLibraryPanel from './WidgetLibraryPanel'
import WidgetConfigPanel from './configurable/WidgetConfigPanel'

// Ensure registry is loaded
import '../../lib/widget-registry'

interface WidgetGridProps {
  pageType: PageType
  objectId?: string
  typeId?: string
  obj?: any
  onDeleteNode?: (node: any) => void
  overrides?: Record<string, React.ComponentType<WidgetProps>>
}

export default function WidgetGrid({ pageType, objectId, typeId, obj, onDeleteNode, overrides }: WidgetGridProps) {
  const {
    layout, isEditing, activeTier,
    loadLayout, setEditing, moveWidget, resizeWidget, resizeWidgetHeight, renameWidget, toggleWidgetVisibility, addWidget,
    updateWidgetConfig, resetToGlobal, resetToBuiltin, saveAsAdmin,
  } = useLayoutStore()

  const user = useAuthStore(s => s.user)
  const isAdmin = !!user?.is_admin

  const gridRef = useRef<HTMLDivElement>(null)
  const [dragFrom, setDragFrom] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [showLibrary, setShowLibrary] = useState(false)
  const [configWidgetId, setConfigWidgetId] = useState<string | null>(null)

  useEffect(() => {
    loadLayout(pageType, objectId, typeId)
  }, [pageType, objectId, typeId, loadLayout])

  const handleDragStart = useCallback((widgetId: string, e: React.DragEvent) => {
    setDragFrom(widgetId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', widgetId)
    // Make the drag ghost semi-transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.4'
    }
  }, [])

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = ''
    }
    setDragFrom(null)
    setDragOver(null)
  }, [])

  const handleDragOver = useCallback((widgetId: string, e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(widgetId)
  }, [])

  const handleDrop = useCallback((widgetId: string, e: React.DragEvent) => {
    e.preventDefault()
    const fromId = e.dataTransfer.getData('text/plain')
    if (fromId && fromId !== widgetId) {
      moveWidget(fromId, widgetId)
    }
    setDragFrom(null)
    setDragOver(null)
  }, [moveWidget])

  const handleResize = useCallback((widgetId: string, startX: number, startSpan: number, minSpan: number, maxSpan: number) => {
    const container = gridRef.current
    if (!container) return
    const colWidth = container.getBoundingClientRect().width / 12

    const onPointerMove = (ev: PointerEvent) => {
      const delta = ev.clientX - startX
      const deltaSpan = Math.round(delta / colWidth)
      const newSpan = Math.max(minSpan, Math.min(maxSpan, startSpan + deltaSpan))
      resizeWidget(widgetId, newSpan)
    }

    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
  }, [resizeWidget])

  const handleResizeHeight = useCallback((widgetId: string, startY: number, cellEl: HTMLElement) => {
    const startHeight = cellEl.getBoundingClientRect().height

    const onPointerMove = (ev: PointerEvent) => {
      const delta = ev.clientY - startY
      const newHeight = Math.max(80, Math.round(startHeight + delta))
      resizeWidgetHeight(widgetId, newHeight)
    }

    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
  }, [resizeWidgetHeight])

  const handleResizeCorner = useCallback((
    widgetId: string, startX: number, startY: number,
    startSpan: number, minSpan: number, maxSpan: number, cellEl: HTMLElement,
    cursor: string
  ) => {
    const container = gridRef.current
    if (!container) return
    const colWidth = container.getBoundingClientRect().width / 12
    const startHeight = cellEl.getBoundingClientRect().height

    const onPointerMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      const deltaSpan = Math.round(dx / colWidth)
      const newSpan = Math.max(minSpan, Math.min(maxSpan, startSpan + deltaSpan))
      const newHeight = Math.max(80, Math.round(startHeight + dy))
      resizeWidget(widgetId, newSpan)
      resizeWidgetHeight(widgetId, newHeight)
    }

    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = cursor
    document.body.style.userSelect = 'none'
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
  }, [resizeWidget, resizeWidgetHeight])

  if (!layout) return null

  const visiblePlacements = layout.placements.filter(p => p.visible)
  const hiddenPlacements = layout.placements.filter(p => !p.visible)

  return (
    <div>
      {isEditing && showLibrary && (
        <WidgetLibraryPanel
          placements={layout.placements}
          onAdd={(id, colSpan) => { addWidget(id, colSpan); setShowLibrary(false) }}
          onToggle={toggleWidgetVisibility}
          onClose={() => setShowLibrary(false)}
        />
      )}

      {isEditing && configWidgetId && (() => {
        const p = layout.placements.find(pl => pl.widgetId === configWidgetId)
        return (
          <WidgetConfigPanel
            config={p?.config || null}
            onSave={(cfg) => { updateWidgetConfig(configWidgetId, cfg); setConfigWidgetId(null) }}
            onClose={() => setConfigWidgetId(null)}
          />
        )
      })()}

      {isEditing && (
        <EditToolbar
          activeTier={activeTier}
          hasObjectId={!!objectId}
          hasTypeId={!!typeId}
          isAdmin={isAdmin}
          onShowLibrary={() => setShowLibrary(true)}
          onResetToGlobal={resetToGlobal}
          onResetToBuiltin={resetToBuiltin}
          onSaveAsAdmin={saveAsAdmin}
          onDone={() => setEditing(false)}
        />
      )}

      <div
        ref={gridRef}
        className="widget-grid"
      >
        {visiblePlacements.map(placement => {
          const def = getWidget(placement.widgetId)
          if (!def) return null
          const Component = overrides?.[placement.widgetId] || def.component
          const isOver = dragOver === placement.widgetId && dragFrom !== placement.widgetId

          return (
            <div
              key={placement.widgetId}
              data-widget-id={placement.widgetId}
              className={`widget-cell ${isEditing ? 'widget-cell-editing' : ''} ${isOver ? 'widget-cell-dragover' : ''}`}
              style={{
                gridColumn: `span ${placement.colSpan}`,
                ...(placement.height ? { height: placement.height, overflow: 'auto' } : {}),
              }}
              draggable={isEditing}
              onDragStart={isEditing ? (e) => handleDragStart(placement.widgetId, e) : undefined}
              onDragEnd={isEditing ? handleDragEnd : undefined}
              onDragOver={isEditing ? (e) => handleDragOver(placement.widgetId, e) : undefined}
              onDragLeave={isEditing ? () => setDragOver(null) : undefined}
              onDrop={isEditing ? (e) => handleDrop(placement.widgetId, e) : undefined}
            >
              {isEditing && (
                <>
                  <div className="widget-edit-controls">
                    <div className="widget-drag-handle" title="Перетащить">
                      <GripVertical size={14} />
                    </div>
                    <EditableTitle
                      widgetId={placement.widgetId}
                      currentTitle={placement.title}
                      defaultTitle={def.title}
                      onRename={renameWidget}
                    />
                    <span className="widget-size-label">
                      {placement.colSpan}/12{placement.height ? ` · ${placement.height}px` : ''}
                    </span>
                    {(placement.config || def.id === 'configurable' || placement.widgetId.startsWith('cfg-')) && (
                      <button
                        onClick={() => setConfigWidgetId(placement.widgetId)}
                        className="widget-hide-btn"
                        title="Настроить виджет"
                      >
                        <Cog size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => toggleWidgetVisibility(placement.widgetId)}
                      className="widget-hide-btn"
                      title="Скрыть виджет"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {/* Right resize handle (width) */}
                  <div
                    className="widget-resize-handle-right"
                    onPointerDown={(e) => {
                      e.preventDefault()
                      handleResize(placement.widgetId, e.clientX, placement.colSpan, def.minColSpan, def.maxColSpan)
                    }}
                  >
                    <div className="widget-resize-dots-v" />
                  </div>
                  {/* Bottom resize handle (height) */}
                  <div
                    className="widget-resize-handle-bottom"
                    onPointerDown={(e) => {
                      e.preventDefault()
                      const cell = (e.currentTarget as HTMLElement).parentElement
                      if (cell) handleResizeHeight(placement.widgetId, e.clientY, cell)
                    }}
                    onDoubleClick={() => resizeWidgetHeight(placement.widgetId, null)}
                    title="Потяните для изменения высоты. Двойной клик — авто-высота."
                  >
                    <div className="widget-resize-dots-h" />
                  </div>
                  {/* Corner resize handle (bottom-right) */}
                  <div
                    className="widget-resize-handle-corner-br"
                    onPointerDown={(e) => {
                      e.preventDefault()
                      const cell = (e.currentTarget as HTMLElement).parentElement
                      if (cell) handleResizeCorner(placement.widgetId, e.clientX, e.clientY, placement.colSpan, def.minColSpan, def.maxColSpan, cell, 'nwse-resize')
                    }}
                    onDoubleClick={() => resizeWidgetHeight(placement.widgetId, null)}
                  />
                </>
              )}
              <Component
                obj={obj}
                onDeleteNode={onDeleteNode}
                colSpan={placement.colSpan}
                customTitle={placement.title}
                config={placement.config}
              />
            </div>
          )
        })}
      </div>

      {!isEditing && (
        <div className="flex justify-end mt-3">
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Settings size={12} />
            Настроить виджеты
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Editable Title ──────────────────────────────────────

function EditableTitle({ widgetId, currentTitle, defaultTitle, onRename }: {
  widgetId: string
  currentTitle?: string | null
  defaultTitle: string
  onRename: (id: string, title: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const displayTitle = currentTitle || defaultTitle

  const startEdit = () => {
    setValue(displayTitle)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const commit = () => {
    setEditing(false)
    const trimmed = value.trim()
    if (!trimmed || trimmed === defaultTitle) {
      onRename(widgetId, null) // reset to default
    } else {
      onRename(widgetId, trimmed)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className="widget-title-input"
        autoFocus
      />
    )
  }

  return (
    <button onClick={startEdit} className="widget-title-btn" title="Изменить заголовок">
      <span className="truncate">{displayTitle}</span>
      <Pencil size={10} />
    </button>
  )
}

// ─── Edit Toolbar ─────────────────────────────────────────

function EditToolbar({
  activeTier, hasObjectId, hasTypeId, isAdmin,
  onShowLibrary, onResetToGlobal, onResetToBuiltin, onSaveAsAdmin, onDone,
}: {
  activeTier: LayoutTier
  hasObjectId: boolean
  hasTypeId: boolean
  isAdmin: boolean
  onShowLibrary: () => void
  onResetToGlobal: () => void
  onResetToBuiltin: () => void
  onSaveAsAdmin: (scope: 'all' | 'type' | 'object') => void
  onDone: () => void
}) {
  const [showReset, setShowReset] = useState(false)
  const [showAdminSave, setShowAdminSave] = useState(false)
  const resetRef = useRef<HTMLDivElement>(null)
  const adminRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (resetRef.current && !resetRef.current.contains(e.target as Node)) setShowReset(false)
      if (adminRef.current && !adminRef.current.contains(e.target as Node)) setShowAdminSave(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const tierLabel: Record<LayoutTier, string> = {
    'builtin': 'Встроенная',
    'admin-all': 'Админ (все)',
    'admin-type': 'Админ (тип)',
    'admin-object': 'Админ (объект)',
    'user-global': 'Пользовательская',
    'user-object': 'Для этого объекта',
  }

  return (
    <div className="widget-toolbar flex-wrap">
      <div className="flex items-center gap-2 mr-auto">
        <span className="text-xs font-medium text-primary-700">Настройка виджетов</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-100 text-primary-600 font-medium">
          {tierLabel[activeTier]}
        </span>
      </div>

      <button onClick={onShowLibrary} className="btn-secondary btn-xs">
        <Plus size={13} /> Библиотека
      </button>

      <div ref={resetRef} className="relative">
        <button onClick={() => setShowReset(!showReset)} className="btn-ghost btn-xs">
          <RotateCcw size={13} /> Сбросить
        </button>
        {showReset && (
          <div className="dropdown absolute top-full right-0 mt-1 z-50 min-w-[220px]">
            {hasObjectId && (activeTier === 'user-object') && (
              <button onClick={() => { onResetToGlobal(); setShowReset(false) }} className="dropdown-item">
                Сбросить для этого объекта
              </button>
            )}
            <button onClick={() => { onResetToBuiltin(); setShowReset(false) }} className="dropdown-item">
              Сбросить все мои настройки
            </button>
          </div>
        )}
      </div>

      {/* Admin: apply as default for others */}
      {isAdmin && (
        <div ref={adminRef} className="relative">
          <button onClick={() => setShowAdminSave(!showAdminSave)}
            className="btn-ghost btn-xs text-amber-700 hover:bg-amber-50 border-amber-200">
            <Shield size={13} /> Для всех
          </button>
          {showAdminSave && (
            <div className="dropdown absolute top-full right-0 mt-1 z-50 min-w-[260px]">
              <div className="px-3 py-2 text-[10px] text-gray-400 uppercase font-semibold">
                Применить как умолчание
              </div>
              <button onClick={() => { onSaveAsAdmin('all'); setShowAdminSave(false) }} className="dropdown-item">
                Для всех объектов
              </button>
              {hasTypeId && (
                <button onClick={() => { onSaveAsAdmin('type'); setShowAdminSave(false) }} className="dropdown-item">
                  Для всех объектов этого типа
                </button>
              )}
              {hasObjectId && (
                <button onClick={() => { onSaveAsAdmin('object'); setShowAdminSave(false) }} className="dropdown-item">
                  Только для этого объекта
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <button onClick={onDone} className="btn-primary btn-xs">
        <Check size={13} /> Готово
      </button>
    </div>
  )
}
