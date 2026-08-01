import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabase'

// Modal: spoedorder toevoegen — zoekt automatisch marge-slots
export const PlanningSpoed = ({ projecten, medewerkers, onClose, onGepland }) => {
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [orders, setOrders] = useState([])
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [uren, setUren] = useState('')
  const [notitie, setNotitie] = useState('')
  const [voorkeurMedewerker, setVoorkeurMedewerker] = useState('')
  const [saving, setSaving] = useState(false)
  const [resultaat, setResultaat] = useState(null) // { datum, medewerker_naam, methode }

  // Load orders for selected project
  useEffect(() => {
    if (!selectedProjectId) { setOrders([]); return }
    const load = async () => {
      const { data } = await supabase.from('orders')
        .select('*')
        .eq('project_id', selectedProjectId)
        .order('naam')
      setOrders(data || [])
    }
    load()
  }, [selectedProjectId])

  const handleInplannen = async () => {
    if (!selectedOrderId || !uren || parseFloat(uren) <= 0) {
      alert('Selecteer een order en vul uren in')
      return
    }

    setSaving(true)
    try {
      const spoedUren = parseFloat(uren)
      const vandaag = new Date().toISOString().split('T')[0]

      // Zoek marge-blokken deze week en volgende week
      const zoekEind = new Date()
      zoekEind.setDate(zoekEind.getDate() + 14)

      const { data: margeBlokken } = await supabase
        .from('planning_blokken')
        .select('*')
        .eq('is_marge', true)
        .gte('datum', vandaag)
        .lte('datum', zoekEind.toISOString().split('T')[0])
        .order('datum')

      // Filter op voorkeur medewerker
      const beschikbareMarges = voorkeurMedewerker
        ? (margeBlokken || []).filter(m => m.medewerker_id === voorkeurMedewerker)
        : (margeBlokken || [])

      let methode = ''
      let geplaatst = false

      // Strategie 1: Vervang marge-blok
      if (beschikbareMarges.length > 0) {
        const marge = beschikbareMarges[0]

        if (marge.uren >= spoedUren) {
          // Marge is groot genoeg — vervang of splits
          await supabase.from('planning_blokken').delete().eq('id', marge.id)

          // Voeg spoedblok toe
          await supabase.from('planning_blokken').insert({
            order_id: selectedOrderId,
            medewerker_id: marge.medewerker_id,
            datum: marge.datum,
            uren: spoedUren,
            is_spoed: true,
            notitie: notitie || 'Spoedorder',
          })

          // Als marge groter was, maak resterende marge
          const restMarge = marge.uren - spoedUren
          if (restMarge > 0) {
            await supabase.from('planning_blokken').insert({
              medewerker_id: marge.medewerker_id,
              datum: marge.datum,
              uren: restMarge,
              is_marge: true,
            })
          }

          const mw = medewerkers.find(m => m.id === marge.medewerker_id)
          setResultaat({
            datum: marge.datum,
            medewerker_naam: mw?.naam || '?',
            methode: 'Marge-slot gebruikt'
          })
          methode = 'marge'
          geplaatst = true
        }
      }

      // Strategie 2: Zoek eerste vrije slot (genoeg ruimte)
      if (!geplaatst) {
        const { data: bestaande } = await supabase
          .from('planning_blokken')
          .select('*')
          .gte('datum', vandaag)
          .lte('datum', zoekEind.toISOString().split('T')[0])

        const doelMedewerkers = voorkeurMedewerker
          ? medewerkers.filter(m => m.id === voorkeurMedewerker)
          : medewerkers.filter(m => m.actief)

        let currentDate = new Date(vandaag + 'T12:00:00')

        for (let d = 0; d < 14 && !geplaatst; d++) {
          if (currentDate.getDay() === 0) { currentDate.setDate(currentDate.getDate() + 1); continue }

          const datum = currentDate.toISOString().split('T')[0]

          for (const mw of doelMedewerkers) {
            const mwBlokken = (bestaande || []).filter(b => b.datum === datum && b.medewerker_id === mw.id)
            const gepland = mwBlokken.reduce((sum, b) => sum + (b.uren || 0), 0)
            const vrij = (mw.uren_per_dag || 8) - gepland

            if (vrij >= spoedUren) {
              await supabase.from('planning_blokken').insert({
                order_id: selectedOrderId,
                medewerker_id: mw.id,
                datum,
                uren: spoedUren,
                is_spoed: true,
                notitie: notitie || 'Spoedorder',
              })

              setResultaat({
                datum,
                medewerker_naam: mw.naam,
                methode: 'Vrij slot gevonden'
              })
              geplaatst = true
              break
            }
          }

          currentDate.setDate(currentDate.getDate() + 1)
        }
      }

      // Strategie 3: Forceer op vandaag bij eerste medewerker (overbelasting)
      if (!geplaatst) {
        const mw = voorkeurMedewerker
          ? medewerkers.find(m => m.id === voorkeurMedewerker)
          : medewerkers.find(m => m.actief)

        if (mw) {
          await supabase.from('planning_blokken').insert({
            order_id: selectedOrderId,
            medewerker_id: mw.id,
            datum: vandaag,
            uren: spoedUren,
            is_spoed: true,
            notitie: notitie || 'Spoedorder (overbelasting!)',
          })

          setResultaat({
            datum: vandaag,
            medewerker_naam: mw.naam,
            methode: '⚠️ Overbelasting — geen vrij slot gevonden'
          })
          geplaatst = true
        }
      }

      // Update order als spoed
      await supabase.from('orders').update({ is_spoed: true }).eq('id', selectedOrderId)

      onGepland?.()
    } catch (e) {
      alert('Fout: ' + e.message)
    }
    setSaving(false)
  }

  const project = projecten.find(p => p.id === selectedProjectId)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full" onClick={e => e.stopPropagation()}>

        <div className="p-5 border-b">
          <h3 className="text-lg font-bold text-red-700">🚨 Spoedorder inplannen</h3>
          <p className="text-sm text-gray-500 mt-0.5">Zoekt automatisch het eerste beschikbare slot</p>
        </div>

        <div className="p-5 space-y-4">
          {!resultaat ? (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Project</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => { setSelectedProjectId(e.target.value); setSelectedOrderId('') }}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm"
                >
                  <option value="">Kies project...</option>
                  {projecten.filter(p => p.actief !== false).map(p => (
                    <option key={p.id} value={p.id}>{p.emoji} {p.naam}</option>
                  ))}
                </select>
              </div>

              {selectedProjectId && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Order</label>
                  <select
                    value={selectedOrderId}
                    onChange={(e) => setSelectedOrderId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm"
                  >
                    <option value="">Kies order...</option>
                    {orders.map(o => (
                      <option key={o.id} value={o.id}>{o.naam} ({o.begrote_uren || 0}u)</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Uren nodig</label>
                  <input
                    type="number"
                    value={uren}
                    onChange={(e) => setUren(e.target.value)}
                    placeholder="bv. 6"
                    step="0.5"
                    min="0.5"
                    className="w-full border rounded-lg px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Voorkeur medewerker</label>
                  <select
                    value={voorkeurMedewerker}
                    onChange={(e) => setVoorkeurMedewerker(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm"
                  >
                    <option value="">Automatisch</option>
                    {medewerkers.filter(m => m.actief).map(m => (
                      <option key={m.id} value={m.id}>{m.naam}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Notitie</label>
                <input
                  type="text"
                  value={notitie}
                  onChange={(e) => setNotitie(e.target.value)}
                  placeholder="Wat is er dringend?"
                  className="w-full border rounded-lg px-3 py-2.5 text-sm"
                />
              </div>

              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-xs text-amber-800">
                <p className="font-medium mb-1">Automatische strategie:</p>
                <ol className="list-decimal ml-4 space-y-0.5">
                  <li>Zoek eerste beschikbare marge-slot</li>
                  <li>Als geen marge vrij: zoek eerste dag met genoeg vrije uren</li>
                  <li>Noodgeval: plan op vandaag (met overbelasting-waarschuwing)</li>
                </ol>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">✅</div>
              <h4 className="text-lg font-bold text-gray-800 mb-2">Spoedorder ingepland!</h4>
              <div className="bg-green-50 rounded-lg border border-green-200 p-4 text-left space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Datum:</span>
                  <span className="font-medium">
                    {new Date(resultaat.datum + 'T12:00:00').toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Medewerker:</span>
                  <span className="font-medium">{resultaat.medewerker_naam}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Uren:</span>
                  <span className="font-medium">{uren}u</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Methode:</span>
                  <span className={`font-medium ${resultaat.methode.includes('Overbelasting') ? 'text-red-600' : 'text-green-600'}`}>
                    {resultaat.methode}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
          {!resultaat ? (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuleren</button>
              <button
                onClick={handleInplannen}
                disabled={saving || !selectedOrderId || !uren}
                className="px-6 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? 'Inplannen...' : '🚨 Nu inplannen'}
              </button>
            </>
          ) : (
            <button onClick={onClose} className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              Sluiten
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
