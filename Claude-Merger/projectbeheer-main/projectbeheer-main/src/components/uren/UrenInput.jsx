import React, { useState } from 'react'

// Uren Input Component
export const UrenInput = ({ uren = {}, onChange, disabled, medewerkers = [] }) => {
  const [showForm, setShowForm] = useState(false)
  const [selectedMedewerker, setSelectedMedewerker] = useState(medewerkers[0] || '')
  const [aantalUren, setAantalUren] = useState('')
  const totaalUren = Object.values(uren).reduce((sum, u) => sum + u, 0)

  const handleAdd = () => {
    if (aantalUren && parseFloat(aantalUren) > 0) {
      const nieuweUren = { ...uren }
      nieuweUren[selectedMedewerker] = (nieuweUren[selectedMedewerker] || 0) + parseFloat(aantalUren)
      onChange(nieuweUren)
      setAantalUren('')
      setShowForm(false)
    }
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
        <span>⏱️ {totaalUren}u</span>
        {!disabled && <button onClick={() => setShowForm(!showForm)} className="text-blue-600 hover:text-blue-800 text-xs">{showForm ? '✕' : '+ Uren'}</button>}
      </div>
      {Object.entries(uren).length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {Object.entries(uren).map(([m, u]) => <span key={m} className="px-2 py-0.5 bg-gray-100 rounded text-xs">{m}: {u}u</span>)}
        </div>
      )}
      {showForm && !disabled && (
        <div className="flex gap-2 items-center bg-gray-50 p-2 rounded">
          <select value={selectedMedewerker} onChange={(e) => setSelectedMedewerker(e.target.value)} className="border rounded px-2 py-1 text-sm">
            {medewerkers.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <input type="number" step="0.5" min="0" placeholder="Uren" value={aantalUren} onChange={(e) => setAantalUren(e.target.value)} className="border rounded px-2 py-1 text-sm w-20" />
          <button onClick={handleAdd} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">+</button>
        </div>
      )}
    </div>
  )
}
