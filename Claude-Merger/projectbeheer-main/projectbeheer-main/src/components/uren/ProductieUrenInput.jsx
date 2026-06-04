import React, { useState } from 'react'
import { typeWerkOpties } from '../../config/constants'

// Productie Uren Input Component with type werk
export const ProductieUrenInput = ({ urenLijst = [], onChange, isExpanded, onToggle, medewerkers = [] }) => {
  const [selectedMedewerker, setSelectedMedewerker] = useState(medewerkers[0] || '')
  const [aantalUren, setAantalUren] = useState('')
  const [typeWerk, setTypeWerk] = useState('onderdelen')

  const totaalUren = urenLijst.reduce((sum, entry) => sum + (entry.uren || 0), 0)

  const handleAdd = () => {
    if (aantalUren && parseFloat(aantalUren) > 0) {
      const nieuweEntry = {
        id: Date.now(),
        medewerker: selectedMedewerker,
        uren: parseFloat(aantalUren),
        typeWerk: typeWerk
      }
      onChange([...urenLijst, nieuweEntry])
      setAantalUren('')
    }
  }

  const handleRemove = (id) => {
    onChange(urenLijst.filter(e => e.id !== id))
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
        <span>⏱️ {totaalUren}u</span>
        <button onClick={onToggle} className="text-blue-600 hover:text-blue-800 text-xs">
          {isExpanded ? '▲ Verberg' : '▼ Uren beheren'}
        </button>
      </div>

      {urenLijst.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {urenLijst.map(entry => (
            <span key={entry.id} className="px-2 py-0.5 bg-gray-100 rounded text-xs flex items-center gap-1">
              {entry.medewerker}: {entry.uren}u ({entry.typeWerk})
              {isExpanded && <button onClick={() => handleRemove(entry.id)} className="text-red-500 ml-1">×</button>}
            </span>
          ))}
        </div>
      )}

      {isExpanded && (
        <div className="bg-gray-50 p-3 rounded border space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            <select value={selectedMedewerker} onChange={(e) => setSelectedMedewerker(e.target.value)} className="border rounded px-2 py-1 text-sm">
              {medewerkers.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <input type="number" step="0.5" min="0" placeholder="Uren" value={aantalUren} onChange={(e) => setAantalUren(e.target.value)} className="border rounded px-2 py-1 text-sm w-20" />
            <div className="flex gap-1">
              {typeWerkOpties.map(tw => (
                <button
                  key={tw}
                  onClick={() => setTypeWerk(tw)}
                  className={`px-2 py-1 text-xs rounded ${typeWerk === tw ? 'bg-blue-600 text-white' : 'bg-white border hover:bg-gray-100'}`}
                >
                  {tw}
                </button>
              ))}
            </div>
            <button onClick={handleAdd} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">+</button>
          </div>
        </div>
      )}
    </div>
  )
}
