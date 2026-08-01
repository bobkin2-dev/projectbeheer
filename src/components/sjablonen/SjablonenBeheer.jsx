import React, { useState } from 'react'
import { supabase } from '../../supabase'
import { bibCategorieen } from '../../config/constants'

// Sjablonen Beheer
export const SjablonenBeheer = ({ sjablonen, bibliotheek, onRefresh }) => {
  const [showNieuw, setShowNieuw] = useState(false)
  const [nieuwSjabloon, setNieuwSjabloon] = useState({ naam: '', omschrijving: '', items: [] })
  const [saving, setSaving] = useState(false)

  const getBibItem = (id) => bibliotheek.find(i => i.id === id)

  const calculateSjabloonPrijs = (items) => {
    return items.reduce((sum, item) => {
      const bibItem = getBibItem(item.bibliotheek_id)
      return sum + (bibItem?.prijs || 0) * item.aantal
    }, 0)
  }

  const addItemToNieuw = (bibItem) => {
    const exists = nieuwSjabloon.items.find(i => i.bibliotheek_id === bibItem.id)
    if (exists) {
      setNieuwSjabloon({
        ...nieuwSjabloon,
        items: nieuwSjabloon.items.map(i => i.bibliotheek_id === bibItem.id ? { ...i, aantal: i.aantal + 1 } : i)
      })
    } else {
      setNieuwSjabloon({
        ...nieuwSjabloon,
        items: [...nieuwSjabloon.items, { bibliotheek_id: bibItem.id, aantal: 1 }]
      })
    }
  }

  const saveSjabloon = async () => {
    if (!nieuwSjabloon.naam || nieuwSjabloon.items.length === 0) return
    setSaving(true)
    try {
      const { data: created, error } = await supabase.from('sjablonen').insert({
        naam: nieuwSjabloon.naam,
        omschrijving: nieuwSjabloon.omschrijving
      }).select().single()

      if (error) throw error

      if (created && nieuwSjabloon.items.length > 0) {
        await supabase.from('sjabloon_items').insert(nieuwSjabloon.items.map(item => ({
          sjabloon_id: created.id,
          bibliotheek_id: item.bibliotheek_id,
          aantal: item.aantal
        })))
      }

      setNieuwSjabloon({ naam: '', omschrijving: '', items: [] })
      setShowNieuw(false)
      onRefresh()
    } catch (e) {
      alert('Fout bij opslaan: ' + e.message)
    }
    setSaving(false)
  }

  const deleteSjabloon = async (id) => {
    try {
      await supabase.from('sjablonen').delete().eq('id', id)
      onRefresh()
    } catch (e) {
      alert('Fout bij verwijderen: ' + e.message)
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">📋 Sjablonen</h2>
        <button onClick={() => setShowNieuw(!showNieuw)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          + Nieuw sjabloon
        </button>
      </div>

      {showNieuw && (
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 mb-4">
          <h4 className="font-medium mb-3">Nieuw sjabloon</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <input type="text" value={nieuwSjabloon.naam} onChange={(e) => setNieuwSjabloon({ ...nieuwSjabloon, naam: e.target.value })} placeholder="Naam" className="border rounded px-3 py-2" />
            <input type="text" value={nieuwSjabloon.omschrijving} onChange={(e) => setNieuwSjabloon({ ...nieuwSjabloon, omschrijving: e.target.value })} placeholder="Omschrijving" className="border rounded px-3 py-2" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
            {bibCategorieen.map(cat => (
              <div key={cat.id} className="bg-white rounded border p-2">
                <div className="text-xs font-medium text-gray-500 mb-1">{cat.label}</div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {bibliotheek.filter(i => i.categorie === cat.id).map(item => (
                    <button key={item.id} onClick={() => addItemToNieuw(item)} className="w-full text-left text-xs px-2 py-1 hover:bg-gray-100 rounded truncate">
                      {item.naam}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {nieuwSjabloon.items.length > 0 && (
            <div className="bg-white rounded border p-2 mb-3">
              <div className="text-xs font-medium text-gray-500 mb-2">Items:</div>
              {nieuwSjabloon.items.map(item => {
                const bibItem = getBibItem(item.bibliotheek_id)
                return (
                  <div key={item.bibliotheek_id} className="flex items-center justify-between text-sm py-1">
                    <span>{bibItem?.naam}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={item.aantal}
                        onChange={(e) => setNieuwSjabloon({
                          ...nieuwSjabloon,
                          items: nieuwSjabloon.items.map(i => i.bibliotheek_id === item.bibliotheek_id ? { ...i, aantal: parseFloat(e.target.value) || 0 } : i).filter(i => i.aantal > 0)
                        })}
                        className="w-16 border rounded px-2 py-1 text-right"
                        step="0.5"
                      />
                      <span className="text-gray-500">€{((bibItem?.prijs || 0) * item.aantal).toFixed(2)}</span>
                    </div>
                  </div>
                )
              })}
              <div className="border-t mt-2 pt-2 text-right font-medium">
                Totaal: €{calculateSjabloonPrijs(nieuwSjabloon.items).toFixed(2)}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={saveSjabloon} disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
              {saving ? 'Opslaan...' : 'Opslaan'}
            </button>
            <button onClick={() => { setShowNieuw(false); setNieuwSjabloon({ naam: '', omschrijving: '', items: [] }) }} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">
              Annuleren
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sjablonen.map(sjabloon => (
          <div key={sjabloon.id} className="bg-white rounded-lg border p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h4 className="font-medium">{sjabloon.naam}</h4>
                <p className="text-xs text-gray-500">{sjabloon.omschrijving}</p>
              </div>
              <button onClick={() => deleteSjabloon(sjabloon.id)} className="text-red-500 hover:text-red-700">🗑️</button>
            </div>
            <div className="text-sm space-y-1 mb-2">
              {sjabloon.items?.map(item => {
                const bibItem = getBibItem(item.bibliotheek_id)
                return (
                  <div key={item.id} className="flex justify-between text-gray-600">
                    <span>{item.aantal}x {bibItem?.naam || '?'}</span>
                    <span>€{((bibItem?.prijs || 0) * item.aantal).toFixed(2)}</span>
                  </div>
                )
              })}
            </div>
            <div className="border-t pt-2 text-right font-semibold text-green-600">
              €{calculateSjabloonPrijs(sjabloon.items || []).toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      {sjablonen.length === 0 && <div className="text-center py-8 text-gray-500">Nog geen sjablonen.</div>}
    </div>
  )
}
