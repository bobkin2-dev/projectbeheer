import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { LoadingSpinner } from '../ui/LoadingSpinner'

// Medewerker Beheer
export const MedewerkerBeheer = ({ medewerkers, onRefresh }) => {
  const [alleMedewerkers, setAlleMedewerkers] = useState([])
  const [nieuweNaam, setNieuweNaam] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    const { data } = await supabase.from('medewerkers').select('*').order('naam')
    setAlleMedewerkers(data || [])
    setLoading(false)
  }

  const addMedewerker = async () => {
    if (!nieuweNaam.trim()) return
    try {
      await supabase.from('medewerkers').insert({ naam: nieuweNaam.trim() })
      setNieuweNaam('')
      loadAll()
      onRefresh()
    } catch (e) {
      alert('Fout: ' + e.message)
    }
  }

  const toggleActief = async (id, actief) => {
    try {
      await supabase.from('medewerkers').update({ actief: !actief }).eq('id', id)
      loadAll()
      onRefresh()
    } catch (e) {
      alert('Fout: ' + e.message)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="bg-white rounded-lg border p-4 mb-4">
      <h3 className="font-semibold mb-3">👷 Medewerkers beheren</h3>
      <div className="space-y-2 mb-3">
        {alleMedewerkers.map(m => (
          <div key={m.id} className={`flex items-center justify-between px-3 py-2 rounded ${m.actief ? 'bg-green-50' : 'bg-gray-100 opacity-60'}`}>
            <span className={m.actief ? '' : 'line-through'}>{m.naam}</span>
            <button
              onClick={() => toggleActief(m.id, m.actief)}
              className={`text-xs px-2 py-1 rounded ${m.actief ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
            >
              {m.actief ? 'Deactiveer' : 'Activeer'}
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={nieuweNaam}
          onChange={(e) => setNieuweNaam(e.target.value)}
          placeholder="Nieuwe medewerker..."
          className="flex-1 border rounded px-3 py-2"
          onKeyDown={(e) => e.key === 'Enter' && addMedewerker()}
        />
        <button onClick={addMedewerker} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">+ Toevoegen</button>
      </div>
    </div>
  )
}
