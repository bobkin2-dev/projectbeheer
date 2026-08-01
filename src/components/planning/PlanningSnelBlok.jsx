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
  const [notitie, setNotitie] = useState('')

  // Optie: nieuwe order aanmaken
  const [nieuweOrderNaam, setNieuweOrderNaam] = useState('')
  const [nieuweOrderUren, setNieuweOrderUren] = useState('')
  const [modus, setModus] = useState('vrij') // 'vrij', 'bestaand' of 'nieuw'

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
      let orderId = null

      if (modus === 'vrij') {
        // Vrij blok — geen order nodig, alleen notitie
        if (!notitie.trim()) {
          alert('Vul een korte beschrijving in')
          setSaving(false)
          return
        }
      } else if (modus === 'bestaand') {
        orderId = selectedOrderId
        if (!orderId) {
          alert('Selecteer een order')
          setSaving(false)
          return
        }
      } else if (modus === 'nieuw') {
        if (!selectedProjectId) {
          alert('Selecteer eerst een project')
          setSaving(false)
          return
        }
        if (!nieuweOrderNaam.trim()) {
          alert('Vul een ordernaam in')
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

      // Blok aanmaken
      const { error } = await supabase.from('planning_blokken').insert({
        order_id: orderId,
        medewerker_id: medewerkerId,
        datum: datum,
        uren: parseFloat(uren) || 8,
        is_spoed: false,
        is_marge: false,
        notitie: notitie.trim() || null,
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

  const kanOpslaan = modus === 'vrij'
    ? notitie.trim().length > 0
    : modus === 'bestaand'
      ? !!selectedOrderId
      : (!!selectedProjectId && nieuweOrderNaam.trim().length > 0)

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
              onClick={() => setModus('vrij')}
              className={`flex-1 px-2 py-1.5 text-sm rounded-md transition-all ${modus === 'vrij' ? 'bg-white text-gray-800 shadow-sm font-medium' : 'text-gray-500'}`}
            >
              ✏️ Vrij blok
            </button>
            <button
              onClick={() => setModus('bestaand')}
              className={`flex-1 px-2 py-1.5 text-sm rounded-md transition-all ${modus === 'bestaand' ? 'bg-white text-blue-700 shadow-sm font-medium' : 'text-gray-500'}`}
            >
              📁 Order
            </button>
            <button
              onClick={() => setModus('nieuw')}
              className={`flex-1 px-2 py-1.5 text-sm rounded-md transition-all ${modus === 'nieuw' ? 'bg-white text-green-700 shadow-sm font-medium' : 'text-gray-500'}`}
            >
              + Nieuwe
            </button>
          </div>

          {/* VRIJ BLOK — alleen notitie + uren */}
          {modus === 'vrij' && (
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="text-xs text-gray-500 mb-1">Typ wat er moet gebeuren — je kunt het later aan een project koppelen.</div>
              <input
                type="text"
                value={notitie}
                onChange={(e) => setNotitie(e.target.value)}
                placeholder="bv. kasten monteren, lakwerk afwerken..."
                className="w-full border rounded-lg px-3 py-2.5 text-sm"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && kanOpslaan) handleOpslaan() }}
              />
            </div>
          )}

          {/* BESTAANDE ORDER of NIEUWE ORDER — project zoeken */}
          {(modus === 'bestaand' || modus === 'nieuw') && (
            <>
              <div>
                <input
                  type="text"
                  value={zoek}
                  onChange={(e) => { setZoek(e.target.value); if (selectedProjectId) { setSelectedProjectId(''); setSelectedOrderId('') } }}
                  placeholder="🔍 Zoek project..."
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  autoFocus={modus !== 'vrij'}
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
                    <label className="block text-xs text-green-700 mb-0.5">Totaal begrote uren</label>
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

              {/* Notitie (optioneel bij order-modus) */}
              <input
                type="text"
                value={notitie}
                onChange={(e) => setNotitie(e.target.value)}
                placeholder="Notitie (optioneel)"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </>
          )}

          {/* Uren */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Uren</label>
            <input
              type="number"
              value={uren}
              onChange={(e) => setUren(e.target.value)}
              step="0.5"
              min="0.5"
              max={urenVrij}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuleren</button>
          <button
            onClick={handleOpslaan}
            disabled={saving || !kanOpslaan}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Opslaan...' : '+ Toevoegen'}
          </button>
        </div>
      </div>
    </div>
  )
}
