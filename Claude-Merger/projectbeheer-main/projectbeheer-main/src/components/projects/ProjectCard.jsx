import React from 'react'

export const ProjectCard = ({ project, onClick }) => (
  <div
    onClick={onClick}
    className={`rounded-lg border p-4 cursor-pointer hover:shadow-md transition-shadow ${project.actief === false ? 'opacity-60' : ''}`}
    style={{ backgroundColor: project.kleur ? `${project.kleur}15` : 'white', borderColor: project.kleur || '#e5e7eb' }}
  >
    <div className="flex justify-between items-start">
      <div className="text-xs text-gray-500">{project.project_nummer}</div>
      {project.emoji && <span className="text-xl">{project.emoji}</span>}
    </div>
    <h3 className="font-semibold" style={{ color: project.kleur || 'inherit' }}>{project.naam || 'Naamloos'}</h3>
    <div className="text-sm text-gray-600">👤 {project.klant || '-'}</div>
  </div>
)
