import React, { useState } from 'react'
import { supabase } from '../../supabase'

export const PlanningBlok = ({ blok, project, order, totaalGepland, onDragStart, onRemove, onUpdate, onPlanResterend, onKopieer, compact = false }) => {
  const [editing, setEditing] = useState(false)
  const [notitieInput, setNotitieInput] = useState(blok.notitie || '')
  const [expanded, setExpanded] = useState(false)

  const begroteUren = order?.begrote_uren || 0
  const gepland = totaalGepland ?? 0
  const isOnvolledig = order && begroteUren > 0 && gepland < begroteUren
  const isVolledig = order && begroteUren > 0 && gepland >= begroteUren
  const progressPct = begroteUren > 0 ? Math.min(Math.round((gepland / begroteUren) * 100), 100) : 0
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

  const handleClick = (e) => {
    // Niet expanden als we aan het editen/draggen zijn
    if (editing) return
    e.stopPropagation()
    setExpanded(!expanded)
  }

  return (
    <div
      draggable={!expanded}
      onDragStart={(e) => {
        if (expanded) { e.preventDefault(); return }
        e.dataTransfer.setData('blokId', blok.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart?.(blok)
      }}
      onClick={handleClick}
      className={`rounded-lg text-white text-xs font-medium transition-all relative group ${
        expanded
          ? 'p-3 shadow-xl z-20 ring-2 ring-white/50'
          : 'p-2 cursor-grab active:cursor-grabbing active:opacity-80 hover:scale-[1.03] hover:shadow-lg hover:z-10'
      } ${isSpoed ? 'ring-2 ring-red-400 ring-offset-1' : ''} ${isVrij ? 'border-2 border-dashed border-gray-400' : ''}`}
      style={{ background: kleur, borderLeft: isSpoed ? '4px solid #dc2626' : isVrij ? undefined : `4px solid ${kleur}` }}
      data-blok-id={blok.id}
    >
      {/* Drag handle (alleen als niet expanded) */}
      {!expanded && (
        <span className="absolute top-1 right-1 text-white/0 group-hover:text-white/60 transition-opacity cursor-grab text-[10px]">⠿</span>
      )}

      {/* Header: project + uren */}
      <div className="flex justify-between items-start pr-4">
        <span className={expanded ? 'font-semibold text-sm' : 'truncate'}>
          {isSpoed && '🚨 '}
          {isVrij ? (blok.notitie || 'Vrij blok') : (project?.naam || 'Geen project')}
        </span>
        <span className="bg-white/20 px-1.5 rounded text-[10px] flex-shrink-0 ml-1">{blok.uren}u</span>
      </div>

      {/* Order naam */}
      {!isVrij && order && (
        <div className={`opacity-80 mt-0.5 ${expanded ? 'text-xs' : 'text-[10px] truncate'}`}>
          {order.naam}
        </div>
      )}

      {isVrij && (
        <div className="text-[10px] opacity-60 mt-0.5">nog toe te wijzen</div>
      )}

      {/* Voortgangsbalk */}
      {!isVrij && order && begroteUren > 0 && (
        <div className="mt-1.5">
          <div className="bg-white/20 rounded-full h-1.5 w-full">
            <div
              className={`h-1.5 rounded-full transition-all ${isOnvolledig ? 'bg-amber-300' : 'bg-white'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className={`text-[9px] mt-0.5 flex justify-between items-center ${isOnvolledig ? 'text-amber-200 font-medium' : 'opacity-60'}`}>
            <span>{gepland}/{begroteUren}u</span>
            {/* Kopieer knop — alleen als niet volledig gepland */}
            {isOnvolledig && onKopieer && !expanded && (
              <button
                onClick={(e) => { e.stopPropagation(); onKopieer(blok) }}
                className="bg-white/25 text-white px-1.5 py-0.5 rounded text-[8px] font-bold hover:bg-white/40 transition-colors"
                title="Kopieer dit blok naar een vrij slot"
              >
                +📋
              </button>
            )}
          </div>
        </div>
      )}

      {/* EXPANDED: extra details */}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-white/20 space-y-2">
          {/* Project info */}
          {!isVrij && project && (
            <div className="text-[11px] opacity-80">
              <span className="opacity-60">Project:</span> {project.emoji} {project.naam}
              {project.klant && <span className="opacity-60"> — {project.klant}</span>}
            </div>
          )}

          {/* Voortgang detail */}
          {!isVrij && order && begroteUren > 0 && (
            <div className="text-[11px]">
              <span className="opacity-60">Ingepland:</span> {gepland}u van {begroteUren}u ({progressPct}%)
              {isOnvolledig && <span className="text-amber-300 ml-1">— nog {begroteUren - gepland}u</span>}
            </div>
          )}

          {/* Notitie bewerken */}
          <div>
            <div className="text-[10px] opacity-50 mb-0.5">Notitie:</div>
            <input
              type="text"
              value={notitieInput}
              onChange={(e) => setNotitieInput(e.target.value)}
              onBlur={async () => {
                if (notitieInput !== (blok.notitie || '')) {
                  await supabase.from('planning_blokken').update({ notitie: notitieInput || null }).eq('id', blok.id)
                  onUpdate?.()
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.target.blur()
                if (e.key === 'Escape') { setNotitieInput(blok.notitie || ''); }
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="notitie toevoegen..."
              className="w-full px-2 py-1 text-[11px] rounded bg-white/20 text-white placeholder-white/40 outline-none border border-white/30 focus:border-white/60"
            />
          </div>

          {/* Actieknoppen */}
          <div className="flex gap-1.5 flex-wrap">
            {isOnvolledig && onPlanResterend && (
              <button
                onClick={(e) => { e.stopPropagation(); onPlanResterend(order, begroteUren - gepland) }}
                className="bg-amber-400 text-amber-900 px-2 py-1 rounded text-[10px] font-bold hover:bg-amber-300 transition-colors"
              >
                +{begroteUren - gepland}u plannen
              </button>
            )}
            {isOnvolledig && onKopieer && (
              <button
                onClick={(e) => { e.stopPropagation(); onKopieer(blok) }}
                className="bg-white/25 text-white px-2 py-1 rounded text-[10px] font-medium hover:bg-white/40 transition-colors"
              >
                📋 Kopieer blok
              </button>
            )}
            {onRemove && (
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(blok.id) }}
                className="bg-red-500/40 text-white px-2 py-1 rounded text-[10px] font-medium hover:bg-red-500/60 transition-colors"
              >
                🗑️ Verwijder
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(false) }}
              className="bg-white/15 text-white px-2 py-1 rounded text-[10px] hover:bg-white/25 transition-colors ml-auto"
            >
              ▲ Inklappen
            </button>
          </div>
        </div>
      )}

      {/* Compact notitie (als niet expanded) */}
      {!expanded && !compact && !editing && !isVrij && blok.notitie && (
        <div className="text-[10px] mt-0.5 truncate opacity-70 italic">{blok.notitie}</div>
      )}

      {/* Compact notitie edit (als niet expanded) */}
      {!expanded && !compact && editing && (
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

      {/* Remove knop bij hover (alleen als niet expanded) */}
      {!expanded && onRemove && (
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
