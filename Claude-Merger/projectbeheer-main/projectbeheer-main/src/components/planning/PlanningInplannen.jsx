import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabase'

// Modal: order semi-automatisch inplannen
export const PlanningInplannen = ({ projecten, medewerkers, onClose, onGepland }) => {
  const [stap, setStap] = useState(1) // 1=selecteer order, 2=voorstel bekijken, 3=bevestigd
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [orders, setOrders] = useState([])
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [voorstel, setVoorstel] = useState([]) // array van { medewerker_id, datum, uren }
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [startDatum, setStartDatum] = useState(new Date().toISOString().split('T')[0])
  const [voorkeurMedewerker, setVoorkeurMedewerker] = useState('')

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

  // When order selected, prepare for planning
  useEffect(() => {
    if (!selectedOrderId) { setSelectedOrder(null); return }
    const order = orders.find(o => o.id === selectedOrderId)
    setSelectedOrder(order)
  }, [selectedOrderId, orders])

  // Generate planning voorstel
  const genereerVoorstel = async () => {
    if (!selectedOrder) return
    setLoading(true)

    try {
      const urenTePlannen = selectedOrder.begrote_uren || 0
      if (urenTePlannen <= 0) {
        alert('Deze order heeft geen begrote uren')
        setLoading(false)
        return
      }

      // Load existing blokken from startDatum onwards (4 weeks lookahead)
      const eindDatum = new Date(startDatum)
      eindDatum.setDate(eindDatum.getDate() + 28)

      const { data: bestaandeBlokken } = await supabase
        .from('planning_blokken')
        .select('*')
        .gte('datum', startDatum)
        .lte('datum', eindDatum.toISOString().split('T')[0])

      // Build capacity map: { 'datum-medewerkerId': urenGepland }
      const bezetting = {}
      ;(bestaandeBlokken || []).forEach(b => {
        const key = `${b.datum}-${b.medewerker_id}`
        bezetting[key] = (bezetting[key] || 0) + b.uren
      })

      // Filter medewerkers
      const beschikbareMedewerkers = voorkeurMedewerker
        ? medewerkers.filter(m => m.id === voorkeurMedewerker)
        : medewerkers.filter(m => m.actief)

      // Generate blokken
      const nieuweBlokken = []
      let resterend = urenTePlannen
      let currentDate = new Date(startDatum + 'T12:00:00')

      while (resterend > 0) {
        const dag = currentDate.getDay()

        // Skip zondag
        if (dag !== 0) {
          // Probeer medewerkers
          for (const mw of beschikbareMedewerkers) {
            if (resterend <= 0) break
            const maxUren = mw.uren_per_dag || 8
            const datum = currentDate.toISOString().split('T')[0]
            const key = `${datum}-${mw.id}`
            const gepland = bezetting[key] || 0
            const vrij = maxUren - gepland

            if (vrij > 0) {
              // Check of dit een marge-blok is
              const isMargeDag = (bestaandeBlokken || []).some(b =>
                b.datum === datum && b.medewerker_id === mw.id && b.is_marge
              )
              if (isMargeDag) continue // Skip marge-dagen

              const uren = Math.min(vrij, resterend)
              nieuweBlokken.push({
                medewerker_id: mw.id,
                medewerker_naam: mw.naam,
                datum,
                uren,
              })
              bezetting[key] = gepland + uren
              resterend -= uren

              // Als voorkeur-medewerker, vul hele dag eerst
              if (voorkeurMedewerker) break
            }
          }
        }

        currentDate.setDate(currentDate.getDate() + 1)

        // Safety: max 60 dagen vooruit
        const daysDiff = (currentDate - new Date(startDatum + 'T12:00:00')) / (1000 * 60 * 60 * 24)
        if (daysDiff > 60) break
      }

      setVoorstel(nieuweBlokken)
      setStap(2)
    } catch (e) {
      alert('Fout bij genereren voorstel: ' + e.message)
    }
    setLoading(false)
  }

  // Save voorstel to database
  const bevestigVoorstel = async () => {
    setSaving(true)
    try {
      const blokken = voorstel.map(v => ({
        order_id: selectedOrderId,
        medewerker_id: v.medewerker_id,
        datum: v.datum,
        uren: v.uren,
        is_spoed: false,
        is_marge: false,
      }))

      const { error } = await supabase.from('planning_blokken').insert(blokken)
      if (error) throw error

      // Update order planning_start en planning_eind
      const datums = voorstel.map(v => v.datum).sort()
      await supabase.from('orders').update({
        planning_start: datums[0],
        planning_eind: datums[datums.length - 1],
      }).eq('id', selectedOrderId)

      setStap(3)
      onGepland?.()
    } catch (e) {
      alert('Fout bij opslaan: ' + e.message)
    }
    setSaving(false)
  }

  // Remove blok from voorstel
  const verwijderUitVoorstel = (index) => {
    setVoorstel(prev => prev.filter((_, i) => i !== index))
  }

  const project = projecten.find(p => p.id === selectedProjectId)
  const totaalVoorstel = voorstel.reduce((sum, v) => sum + v.uren, 0)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 border-b flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-gray-800">📅 Order inplannen</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {stap === 1 && 'Selecteer een order om in te plannen'}
              {stap === 2 && 'Bekijk en pas het voorstel aan'}
              {stap === 3 && 'Order is ingepland!'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* STAP 1: Selecteer order */}
          {stap === 1 && (
            <div className="space-y-4">
              {/* Project selectie */}
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

              {/* Order selectie */}
              {selectedProjectId && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Order</label>
                  <div className="space-y-1 max-h-48 overflow-y-auto border rounded-lg">
                    {orders.map(o => (
                      <button
                        key={o.id}
                        onClick={() => setSelectedOrderId(o.id)}
                        className={`w-full text-left px-3 py-2 text-sm flex justify-between items-center hover:bg-gray-50 ${selectedOrderId === o.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
                      >
                        <span>{o.naam} {o.is_meerwerk && <span className="text-[10px] text-amber-600">+meerwerk</span>}</span>
                        <span className="text-xs text-gray-500">{o.begrote_uren || 0}u</span>
                      </button>
                    ))}
                    {orders.length === 0 && <div className="p-3 text-sm text-gray-400 text-center">Geen orders in dit project</div>}
                  </div>
                </div>
              )}

              {/* Opties */}
              {selectedOrder && (
                <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-blue-800">
                      {selectedOrder.naam}
                    </span>
                    <span className="text-sm font-bold text-blue-700">{selectedOrder.begrote_uren || 0}u</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-blue-600 mb-1">Starten vanaf</label>
                      <input
                        type="date"
                        value={startDatum}
                        onChange={(e) => setStartDatum(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-blue-600 mb-1">Voorkeur medewerker</label>
                      <select
                        value={voorkeurMedewerker}
                        onChange={(e) => setVoorkeurMedewerker(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="">Automatisch verdelen</option>
                        {medewerkers.filter(m => m.actief).map(m => (
                          <option key={m.id} value={m.id}>{m.naam} {m.is_flex ? '(flex)' : ''}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STAP 2: Voorstel bekijken */}
          {stap === 2 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-sm font-medium" style={{ color: project?.kleur }}>
                    {project?.emoji} {project?.naam}
                  </span>
                  <span className="text-sm text-gray-500 ml-2">→ {selectedOrder?.naam}</span>
                </div>
                <span className="text-sm font-bold">{totaalVoorstel}u / {selectedOrder?.begrote_uren || 0}u</span>
              </div>

              {totaalVoorstel < (selectedOrder?.begrote_uren || 0) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                  ⚠️ Niet alle uren konden ingepland worden. Er is {(selectedOrder?.begrote_uren || 0) - totaalVoorstel}u niet ingepland (onvoldoende capaciteit in de komende 60 dagen).
                </div>
              )}

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-2 text-xs text-gray-500">Dag</th>
                      <th className="text-left p-2 text-xs text-gray-500">Medewerker</th>
                      <th className="text-right p-2 text-xs text-gray-500">Uren</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {voorstel.map((v, i) => (
                      <tr key={i} className="border-t hover:bg-gray-50">
                        <td className="p-2">
                          {new Date(v.datum + 'T12:00:00').toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </td>
                        <td className="p-2">{v.medewerker_naam}</td>
                        <td className="p-2 text-right font-medium">{v.uren}u</td>
                        <td className="p-2">
                          <button onClick={() => verwijderUitVoorstel(i)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STAP 3: Bevestigd */}
          {stap === 3 && (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">✅</div>
              <h4 className="text-xl font-bold text-gray-800 mb-2">Order ingepland!</h4>
              <p className="text-sm text-gray-500">
                {selectedOrder?.naam} — {totaalVoorstel}u verdeeld over {voorstel.length} blokken
              </p>
              <p className="text-xs text-gray-400 mt-2">
                {voorstel.length > 0 && `${voorstel[0].datum} t/m ${voorstel[voorstel.length - 1].datum}`}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-between">
          {stap === 1 && (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuleren</button>
              <button
                onClick={genereerVoorstel}
                disabled={!selectedOrder || loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Berekenen...' : '📅 Voorstel genereren'}
              </button>
            </>
          )}
          {stap === 2 && (
            <>
              <button onClick={() => setStap(1)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">◀ Terug</button>
              <button
                onClick={bevestigVoorstel}
                disabled={saving || voorstel.length === 0}
                className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? 'Opslaan...' : `✅ Bevestig (${voorstel.length} blokken)`}
              </button>
            </>
          )}
          {stap === 3 && (
            <button onClick={onClose} className="ml-auto px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              Sluiten
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
