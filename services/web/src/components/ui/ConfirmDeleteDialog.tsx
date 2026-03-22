import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'

interface Props {
  objectId: string
  objectName: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDeleteDialog({ objectId, objectName, onConfirm, onCancel }: Props) {
  const [count, setCount] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.getDescendantsCount(objectId)
      .then(data => setCount(data.count))
      .catch(() => setCount(0))
  }, [objectId])

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await api.deleteObject(objectId)
      onConfirm()
    } catch {
      setDeleting(false)
    }
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onCancel()
  }

  return createPortal(
    <div ref={overlayRef} onClick={handleOverlayClick}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      style={{ animation: 'fadeIn 0.15s ease-out' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        style={{ animation: 'slideUp 0.2s ease-out' }}>
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={20} className="text-red-500" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Удалить объект</h3>
              <p className="text-sm text-gray-500">Это действие нельзя отменить</p>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 mb-3">
            <p className="text-sm text-gray-700 font-medium truncate">{objectName}</p>
          </div>

          {count === null ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 size={14} className="animate-spin" /> Подсчёт дочерних объектов...
            </div>
          ) : count > 0 ? (
            <div className="bg-red-50 border border-red-100 rounded-lg p-3">
              <p className="text-sm text-red-700">
                Будет удалено <strong>{count + 1}</strong> {pluralize(count + 1)} (объект и {count} {pluralize(count, true)})
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              У объекта нет дочерних элементов. Будет удалён только этот объект.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-gray-50 flex items-center justify-end gap-3 border-t border-gray-100">
          <button onClick={onCancel} disabled={deleting} className="btn-secondary btn-sm">
            Отмена
          </button>
          <button onClick={handleDelete} disabled={deleting || count === null} className="btn-danger btn-sm">
            {deleting ? <><Loader2 size={14} className="animate-spin" /> Удаление...</> : 'Удалить'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function pluralize(n: number, children = false): string {
  if (children) {
    const mod = n % 10
    const mod100 = n % 100
    if (mod === 1 && mod100 !== 11) return 'дочерний элемент'
    if (mod >= 2 && mod <= 4 && (mod100 < 12 || mod100 > 14)) return 'дочерних элемента'
    return 'дочерних элементов'
  }
  const mod = n % 10
  const mod100 = n % 100
  if (mod === 1 && mod100 !== 11) return 'объект'
  if (mod >= 2 && mod <= 4 && (mod100 < 12 || mod100 > 14)) return 'объекта'
  return 'объектов'
}
