import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabase'

// Mini-modal: snel een blok toevoegen door op een vrij slot te klikken
export const PlanningSnelBlok = ({ datum, medewerkerId, medewerkerNaam, urenVrij, projecten, onClose, onToegevoegd }) => {
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [orders, setOrders] = useState([])
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [uren, setUren] = useState(Math.min(urenVrij, 8))
  const [zoek, setZoek] = useState('')
  const [saving, setSaving] = useState(false)

  // Optie: nieuwe order aanmaken
  const [nieuweOrderNaam, setNieuweOrderNaam] = useState('')
  const [nieuweOrderUren, setNieuweOrderUren] = useState('')
  const [modus, setModus] = useState('bestaand') // 'bestaand' of 'nieuw'

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

  const dagLabel = new Date(datum + 'T12:00:00').toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })

  const handleOpslaan = async () => {
    setSaving(true)
    try {
      let orderId = selectedOrderId

      // Nieuwe order aanmaken als nodig
      if (modus === 'nieuw' && nieuweOrderNaam.trim()) {
        if (!selectedProjectId) {
          alert('Selecteer eerst een project')
          setSaving(false)
          return
        }
        const { data: nieuweOrder, error } = await supabase.from('orders').insert({
          project_id: selectedProjectId,
          naam: nieuweOrderNaam.trim(),
          status: 'goedgekeurd',
          begrote_uren: parseFloat(nieuweOrderUren) || parseFloat(uren) || 8,
        }).select().single()
        if (error) throw error
        orderId = nieuweOrder.id
      }

      if (!orderId) {
        alert('Selecteer een order of maak een nieuwe aan')
        setSaving(false)
        return
      }

      // Blok aanmaken
      const { error } = await supabase.from('planning_blokken').insert({
        order_id: orderId,
        medewerker_id: medewerkerId,
        datum: datum,
        uren: parseFloat(uren) || 8,
        is_spoed: false,
        is_marge: false,
      })
      if (error) throw error

      onToegevoegd?.()
      onClose()
    } catch (e) {
      alert('Fout: ' + e.message)
    }
    setSaving(false)
  }

  const gefilterdeProjecten = projecten.filter(p => {
    if (p.actief === false) return false
    if (!zoek) return true
    const z = zoek.toLowerCase()
    return (p.naam || '').toLowerCase().includes(z) ||
           (p.klant || '').toLowerCase().includes(z) ||
           (p.project_nummer || '').toLowerCase().includes(z)
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full" onClick={e => e.stopPropagation()}>

        <div className="p-4 border-b">
          <h3 className="text-base font-bold text-gray-800">+ Blok toevoegen</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {medewerkerNaam} &middot; {dagLabel} &middot; {urenVrij}u vrij
          </p>
        </div>

        <div className="p-4 space-y-3">

          {/* Modus toggle */}
          <div className="flex bg-gray-100 p-0.5 rounded-lg">
            <button
              onClick={() => setModus('bestaand')}
              className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-all ${modus === 'bestaand' ? 'bg-white text-blue-700 shadow-sm font-medium' : 'text-gray-500'}`}
            >
              Bestaande order
            </button>
            <button
              onClick={() => setModus('nieuw')}
              className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-all ${modus === 'nieuw' ? 'bg-white text-green-700 shadow-sm font-medium' : 'text-gray-500'}`}
            >
              + Nieuwe order
            </button>
          </div>

          {/* Project zoeken */}
          <div>
            <input
              type="text"
              value={zoek}
              onChange={(e) => { setZoek(e.target.value); if (selectedProjectId) { setSelectedProjectId(''); setSelectedOrderId('') } }}
              placeholder="🔍 Zoek project..."
              className="w-full border rounded-lg px-3 py-2 text-sm"
              autoFocus
            />
            <div className="mt-1 max-h-32 overflow-y-auto border rounded-lg">
              {gefilterdeProjecten.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedProjectId(p.id); setSelectedOrderId(''); setZoek(p.naam || '') }}
                  className={`w-full text-left px-3 py-1.5 text-sm flex justify-between items-center hover:bg-gray-50 ${selectedProjectId === p.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
                >
                  <span>{p.emoji} {p.naam}</span>
                  {p.klant && <span className="text-[10px] text-gray-400">{p.klant}</span>}
                </button>
              ))}
              {gefilterdeProjecten.length === 0 && <div className="p-2 text-xs text-gray-400 text-center">Geen projecten gevonden</div>}
            </div>
          </div>

          {/* Bestaande order selecteren */}
          {modus === 'bestaand' && selectedProjectId && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Order</label>
              <div className="max-h-32 overflow-y-auto border rounded-lg">
                {orders.map(o => (
                  <button
                    key={o.id}
                    onClick={() => setSelectedOrderId(o.id)}
                    className={`w-full text-left px-3 py-1.5 text-sm flex justify-between hover:bg-gray-50 ${selectedOrderId === o.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
                  >
                    <span>{o.naam}</span>
                    <span className="text-[10px] text-gray-400">{o.begrote_uren || 0}u</span>
                  </button>
                ))}
                {orders.length === 0 && <div className="p-2 text-xs text-gray-400 text-center">Geen orders</div>}
              </div>
            </div>
          )}

          {/* Nieuwe order aanmaken */}
          {modus === 'nieuw' && selectedProjectId && (
            <div className="bg-green-50 rounded-lg border border-green-200 p-3 space-y-2">
              <div>
                <label className="block text-xs text-green-700 mb-0.5">Order naam</label>
                <input
                  type="text"
                  value={nieuweOrderNaam}
                  onChange={(e) => setNieuweOrderNaam(e.target.value)}
                  placeholder="bv. Kasten lokaal 3"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-green-700 mb-0.5">Totaal begrote uren voor deze order</label>
                <input
                  type="number"
                  value={nieuweOrderUren}
                  onChange={(e) => setNieuweOrderUren(e.target.value)}
                  placeholder="bv. 40"
                  step="1"
                  min="1"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}

          {/* Uren voor dit blok */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Uren voor dit blok</label>
            <input
              type="number"
              value={uren}
              onChange={(e) => setUren(e.target.value)}
              step="0.5"
              min="0.5"
              max={urenVrij}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
            <div className="text-[10px] text-gray-400 mt-0.5">Max {urenVrij}u beschikbaar op deze dag</div>
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuleren</button>
          <button
            onClick={handleOpslaan}
            disabled={saving || (!selectedOrderId && (modus !== 'nieuw' || !nieuweOrderNaam.trim())) || !selectedProjectId}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Opslaan...' : '+ Toevoegen'}
          </button>
        </div>
      </div>
    </div>
  )
}
