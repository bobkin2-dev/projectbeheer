import React from 'react'
import { supabase } from '../../supabase'

export const ProjectCard = ({ project, onClick, onToggleActief }) => {
  const isActief = project.actief !== false

  const handleToggle = async (e) => {
    e.stopPropagation()
    try {
      await supabase.from('projecten').update({ actief: !isActief }).eq('id', project.id)
      onToggleActief?.()
    } catch (err) {
      alert('Fout: ' + err.message)
    }
  }

  return (
    <div
      onClick={onClick}
      className={`rounded-lg border p-4 cursor-pointer hover:shadow-md transition-shadow flex flex-col ${!isActief ? 'opacity-60' : ''}`}
      style={{ backgroundColor: project.kleur ? `${project.kleur}15` : 'white', borderColor: project.kleur || '#e5e7eb' }}
    >
      <div className="flex justify-between items-start">
        <div className="text-xs text-gray-500">{project.project_nummer}</div>
        {project.emoji && <span className="text-xl">{project.emoji}</span>}
      </div>
      <h3 className="font-semibold" style={{ color: project.kleur || 'inherit' }}>{project.naam || 'Naamloos'}</h3>
      <div className="text-sm text-gray-600">👤 {project.klant || '-'}</div>

      {/* Actief toggle — rechtsonder */}
      <div className="flex justify-end mt-2 pt-1">
        <button
          onClick={handleToggle}
          className="flex items-center gap-1.5 group"
          title={isActief ? 'Zet op non-actief' : 'Zet op actief'}
        >
          <span className={`text-[10px] ${isActief ? 'text-green-600' : 'text-gray-400'}`}>
            {isActief ? 'actief' : 'non-actief'}
          </span>
          <div className={`w-8 h-4 rounded-full transition-colors relative ${isActief ? 'bg-green-500' : 'bg-gray-300'}`}>
            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${isActief ? 'left-4' : 'left-0.5'}`} />
          </div>
        </button>
      </div>
    </div>
  )
}
