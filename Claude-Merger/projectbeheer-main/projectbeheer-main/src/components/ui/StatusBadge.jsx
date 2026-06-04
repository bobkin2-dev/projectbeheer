import React from 'react'

export const StatusBadge = ({ config, status }) => {
  const cfg = config[status]
  if (!cfg) return null
  return <span className={`px-2 py-1 rounded text-xs font-medium border ${cfg.kleur}`}>{cfg.label}</span>
}
