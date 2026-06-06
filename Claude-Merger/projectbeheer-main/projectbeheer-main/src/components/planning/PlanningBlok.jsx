import React, { useState } from 'react'
import { supabase } from '../../supabase'

export const PlanningBlok = ({ blok, project, order, onDragStart, onRemove, onUpdate, compact = false }) => {
  const [editing, setEditing] = useState(false)
  const [notitieInput, setNotitieInput] = useState(blok.notitie || '')
  const isVrij = !blok.order_id && !blok.is_marge
  const kleur = isVrij ? '#6b7280' : (project?.kleur || '#6b7280')
  const isMarge = blok.is_marge
  const isSpoed = blok.is_spoed

  if (isMarge) {
    return (
      <div
        className="rounded-lg p-2 border-2 border-dashed border-gray-300 text-gray-400 text-xs text-center"
        style={{ background: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.04) 4px, rgba(0,0,0,0.04) 8px)' }}
        data-blok-id={blok.id}
        data-is-marge="true"
      >
        <div>📐 Marge</div>
        <div className="text-[10px]">{blok.uren}u buffer</div>
      </div>
    )
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('blokId', blok.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart?.(blok)
      }}
      className={`rounded-lg p-2 text-white text-xs font-medium cursor-grab active:cursor-grabbing active:opacity-80 transition-all hover:scale-[1.03] hover:shadow-lg hover:z-10 relative group ${isSpoed ? 'ring-2 ring-red-400 ring-offset-1' : ''} ${isVrij ? 'border-2 border-dashed border-gray-400' : ''}`}
      style={{ background: kleur, borderLeft: isSpoed ? '4px solid #dc2626' : isVrij ? undefined : `4px solid ${kleur}` }}
      data-blok-id={blok.id}
    >
      {/* Drag handle */}
      <span className="absolute top-1 right-1 text-white/0 group-hover:text-white/60 transition-opacity cursor-grab text-[10px]">⠿</span>

      <div className="flex justify-between items-start pr-4">
        <span className="truncate">
          {isSpoed && '🚨 '}
          {isVrij ? (blok.notitie || 'Vrij blok') : (project?.naam || 'Geen project')}
        </span>
        <span className="bg-white/20 px-1 rounded text-[10px] flex-shrink-0 ml-1">{blok.uren}u</span>
      </div>

      {!compact && !isVrij && order && (
        <div className="text-[10px] opacity-80 mt-0.5 truncate">
          {order.naam}
        </div>
      )}

      {isVrij && (
        <div className="text-[10px] opacity-60 mt-0.5">nog toe te wijzen</div>
      )}

      {/* Notitie: klik om te bewerken */}
      {!compact && !editing && (
        <div
          onClick={(e) => { e.stopPropagation(); setEditing(true) }}
          className={`text-[10px] mt-0.5 truncate cursor-text ${blok.notitie ? 'opacity-70 italic' : 'opacity-0 group-hover:opacity-40'}`}
        >
          {blok.notitie || '+ notitie'}
        </div>
      )}

      {editing && (
        <input
          type="text"
          value={notitieInput}
          onChange={(e) => setNotitieInput(e.target.value)}
          onBlur={async () => {
            setEditing(false)
            if (notitieInput !== (blok.notitie || '')) {
              await supabase.from('planning_blokken').update({ notitie: notitieInput || null }).eq('id', blok.id)
              onUpdate?.()
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.target.blur()
            if (e.key === 'Escape') { setNotitieInput(blok.notitie || ''); setEditing(false) }
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          autoFocus
          placeholder="notitie..."
          className="w-full mt-0.5 px-1 py-0.5 text-[10px] rounded bg-white/20 text-white placeholder-white/50 outline-none border border-white/30 focus:border-white/60"
        />
      )}

      {/* Remove knop (bij hover) */}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(blok.id) }}
          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
        >
          ✕
        </button>
      )}
    </div>
  )
}

// Lege drop-zone cell
export const DropZone = ({ medewerkerUrenPerDag, urenGepland, onDragOver, onDrop, onDragLeave, isDragOver, onClick }) => {
  const urenVrij = medewerkerUrenPerDag - urenGepland

  if (urenVrij <= 0) return null

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onDragOver?.() }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      className={`rounded-lg p-1.5 text-[10px] text-center border border-dashed transition-all cursor-pointer ${
        isDragOver
          ? 'border-blue-400 bg-blue-100 text-blue-600'
          : 'border-gray-200 bg-gray-50 text-gray-400 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-500'
      }`}
    >
      {isDragOver ? '⬇️ Loslaten' : `${urenVrij}u vrij`}
    </div>
  )
}
