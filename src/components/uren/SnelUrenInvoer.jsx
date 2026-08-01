import React, { useState } from 'react'
import { supabase } from '../../supabase'
import { typeWerkOpties } from '../../config/constants'

// Snel Uren Invoer (vanuit project)
export const SnelUrenInvoer = ({ orderId, projectId, medewerkers = [] }) => {
  const [open, setOpen] = useState(false)
  const [medewerker, setMedewerker] = useState('')
  const [uren, setUren] = useState('')
  const [typeWerk, setTypeWerk] = useState('onderdelen')
  const [saving, setSaving] = useState(false)
  const [recentToegevoegd, setRecentToegevoegd] = useState(null)

  const handleAdd = async () => {
    if (!medewerker || !uren || parseFloat(uren) <= 0) return
    setSaving(true)
    try {
      await supabase.from('uren_registratie').insert({
        medewerker_id: medewerker,
        datum: new Date().toISOString().split('T')[0],
        project_id: projectId,
        order_id: orderId,
        type_werk: typeWerk,
        uren: parseFloat(uren)
      })
      const mNaam = medewerkers.find(m => m.id === medewerker)?.naam || '?'
      setRecentToegevoegd(`${mNaam}: ${uren}u (${typeWerk})`)
      setUren('')
      setTimeout(() => setRecentToegevoegd(null), 3000)
    } catch (e) {
      alert('Fout: ' + e.message)
    }
    setSaving(false)
  }

  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
        {open ? '▲ Verberg snelle uren' : '⚡ Snel uren toevoegen'}
      </button>
      {recentToegevoegd && (
        <div className="mt-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded animate-pulse">
          ✓ Toegevoegd: {recentToegevoegd}
        </div>
      )}
      {open && (
        <div className="mt-2 bg-blue-50 rounded-lg p-3 border border-blue-200">
          <div className="flex flex-wrap gap-2 items-center">
            <select value={medewerker} onChange={(e) => setMedewerker(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
              <option value="">Medewerker...</option>
              {medewerkers.map(m => <option key={m.id} value={m.id}>{m.naam}</option>)}
            </select>
            <input type="number" value={uren} onChange={(e) => setUren(e.target.value)} placeholder="Uren" step="0.5" min="0" className="w-20 border rounded-lg px-2 py-1.5 text-sm text-right" />
            <div className="flex gap-1">
              {typeWerkOpties.map(tw => (
                <button key={tw} onClick={() => setTypeWerk(tw)} className={`px-2 py-1 text-xs rounded-md ${typeWerk === tw ? 'bg-blue-600 text-white' : 'bg-white border'}`}>{tw}</button>
              ))}
            </div>
            <button onClick={handleAdd} disabled={saving} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50 font-medium">
              {saving ? '...' : '+ Registreer'}
            </button>
          </div>
          <p className="text-[10px] text-blue-500 mt-1">Registreert voor vandaag ({new Date().toLocaleDateString('nl-BE')})</p>
        </div>
      )}
    </div>
  )
}
