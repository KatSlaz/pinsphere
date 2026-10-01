import { useDraggable, useDroppable, useDragOperation } from '@dnd-kit/react'
import { RestrictToVerticalAxis } from '@dnd-kit/abstract/modifiers'
import { Feedback } from '@dnd-kit/dom'

export default function OrderableRow({ id, parentId = null, index, name, fixed = false, className, onClick, children }) {
  const type = parentId === null ? 'parent-maps' : `submaps:${parentId}`
  const data = { itemId: id, parentId, index }
  const { ref: dragRef, handleRef, isDragSource } = useDraggable({
    id: `${type}:${id}`, type, data, disabled: fixed,
    modifiers: [RestrictToVerticalAxis],
    plugins: [Feedback.configure({ dropAnimation: null })],
  })
  const { ref: dropRef, isDropTarget } = useDroppable({ id: `${type}:${id}`, accept: type, data, disabled: fixed })
  const { source } = useDragOperation()
  const highlighted = isDropTarget && !isDragSource
  const dropBefore = source?.data.index > index
  return (
    <div
      ref={element => { dragRef(element); dropRef(element) }}
      className={`${className} orderable-row${highlighted ? ` order-drop-target${dropBefore ? ' order-drop-before' : ''}` : ''}`}
      onClick={onClick}
    >
      {!fixed && <button
        ref={handleRef}
        type="button"
        className="order-drag-handle"
        aria-label={`Reorder ${name}`}
        title="Drag to reorder. Keyboard: Space, arrow keys, Space; Escape to cancel."
        onClick={event => event.stopPropagation()}
      >⠿</button>}
      {children}
    </div>
  )
}
