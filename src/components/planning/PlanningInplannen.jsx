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
  const [eindDatum, setEindDatum] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 28)
    return d.toISOString().split('T')[0]
  })
  const [projectZoek, setProjectZoek] = useState('')
  const [voorkeurMedewerker, setVoorkeurMedewerker] = useState('')
  const [toonWeekend, setToonWeekend] = useState(false)
  const [gebruikFlex, setGebruikFlex] = useState(false)
  const [bezettingMap, setBezettingMap] = useState({})
  const [bestaande, setBestaande] = useState([])
  const [vroegsteEind, setVroegsteEind] = useState(null) // berekende vroegst mogelijke einddatum

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

  // Calculate werkdagen in range
  const berekenWerkdagen = () => {
    let count = 0
    const d = new Date(startDatum + 'T12:00:00')
    const eind = new Date(eindDatum + 'T12:00:00')
    while (d <= eind) {
      const dag = d.getDay()
      if (toonWeekend || (dag !== 0 && dag !== 6)) count++
      else if (dag === 6 && !toonWeekend) count++ // za altijd meetellen? nee, alleen als checkbox
      d.setDate(d.getDate() + 1)
    }
    return count
  }

  // Bereken vroegst mogelijke einddatum
  useEffect(() => {
    if (!selectedOrder || !(selectedOrder.begrote_uren > 0)) { setVroegsteEind(null); return }

    const berekenVroegste = async () => {
      const uren = selectedOrder.begrote_uren
      const beschikbaar = voorkeurMedewerker
        ? medewerkers.filter(m => m.id === voorkeurMedewerker)
        : medewerkers.filter(m => m.actief && (gebruikFlex || !m.is_flex))
      if (beschikbaar.length === 0) { setVroegsteEind(null); return }

      // Laad bezetting
      const zoekEind = new Date(startDatum)
      zoekEind.setDate(zoekEind.getDate() + 90)
      const { data: bestaandeBlokken } = await supabase
        .from('planning_blokken')
        .select('datum, medewerker_id, uren, is_marge')
        .gte('datum', startDatum)
        .lte('datum', zoekEind.toISOString().split('T')[0])

      const bezetting = {}
      ;(bestaandeBlokken || []).forEach(b => {
        const key = `${b.datum}-${b.medewerker_id}`
        bezetting[key] = (bezetting[key] || 0) + b.uren
      })

      let rest = uren
      let currentDate = new Date(startDatum + 'T12:00:00')
      let laatsteDatum = startDatum

      while (rest > 0) {
        const dag = currentDate.getDay()
        const isWerkdag = dag >= 1 && dag <= 5
        const isWeekend = dag === 0 || dag === 6
        const planbaar = isWerkdag || (isWeekend && toonWeekend)

        if (planbaar) {
          const datum = currentDate.toISOString().split('T')[0]
          for (const mw of beschikbaar) {
            if (rest <= 0) break
            const maxU = mw.uren_per_dag || 8
            const key = `${datum}-${mw.id}`
            const bezet = bezetting[key] || 0
            const vrij = maxU - bezet
            const isMarge = (bestaandeBlokken || []).some(b =>
              b.datum === datum && b.medewerker_id === mw.id && b.is_marge
            )
            if (vrij > 0 && !isMarge) {
              const u = Math.min(vrij, rest)
              bezetting[key] = bezet + u
              rest -= u
              laatsteDatum = datum
            }
          }
        }

        currentDate.setDate(currentDate.getDate() + 1)
        if ((currentDate - new Date(startDatum + 'T12:00:00')) / 86400000 > 90) break
      }

      setVroegsteEind(rest <= 0 ? laatsteDatum : null)
    }

    berekenVroegste()
  }, [selectedOrder, startDatum, voorkeurMedewerker, gebruikFlex, toonWeekend, medewerkers])

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

      // Load existing blokken within the date range
      const { data: bestaandeBlokken } = await supabase
        .from('planning_blokken')
        .select('*')
        .gte('datum', startDatum)
        .lte('datum', eindDatum)

      // Build capacity map: { 'datum-medewerkerId': urenGepland }
      const bezetting = {}
      ;(bestaandeBlokken || []).forEach(b => {
        const key = `${b.datum}-${b.medewerker_id}`
        bezetting[key] = (bezetting[key] || 0) + b.uren
      })

      // Filter medewerkers (flex alleen als toggle aan staat)
      const beschikbareMedewerkers = voorkeurMedewerker
        ? medewerkers.filter(m => m.id === voorkeurMedewerker)
        : medewerkers.filter(m => m.actief && (gebruikFlex || !m.is_flex))

      // Stap 1: Tel beschikbare werkdagen in het bereik
      let werkdagen = 0
      {
        let d = new Date(startDatum + 'T12:00:00')
        const eind = new Date(eindDatum + 'T12:00:00')
        while (d <= eind) {
          const dag = d.getDay()
          const isWerkdag = dag >= 1 && dag <= 5
          const isWeekend = dag === 0 || dag === 6
          if (isWerkdag || (isWeekend && toonWeekend)) werkdagen++
          d.setDate(d.getDate() + 1)
        }
      }

      // Stap 2: Bereken hoeveel medewerkers per dag nodig zijn
      // bv. 100u / 9 werkdagen = 11.1u per dag → 2 medewerkers van 8u
      const urenPerDag = werkdagen > 0 ? urenTePlannen / werkdagen : urenTePlannen
      const urenPerMedewerker = beschikbareMedewerkers.length > 0
        ? (beschikbareMedewerkers[0].uren_per_dag || 8)
        : 8
      const medewerkersPerDag = Math.min(
        Math.ceil(urenPerDag / urenPerMedewerker),
        beschikbareMedewerkers.length
      )

      // Stap 3: Plan blokken — per dag max `medewerkersPerDag` toewijzen
      const nieuweBlokken = []
      let resterend = urenTePlannen
      let currentDate = new Date(startDatum + 'T12:00:00')
      const eindDate = new Date(eindDatum + 'T12:00:00')
      let mwStartIndex = 0 // round-robin startpunt per dag

      while (resterend > 0 && currentDate <= eindDate) {
        const dag = currentDate.getDay()
        const isWerkdag = dag >= 1 && dag <= 5
        const isWeekend = dag === 0 || dag === 6
        const planDezeDag = isWerkdag || (isWeekend && toonWeekend)

        if (planDezeDag) {
          const datum = currentDate.toISOString().split('T')[0]
          let blokkenVandaag = 0

          // Wijs medewerkers toe voor deze dag (round-robin)
          for (let poging = 0; poging < beschikbareMedewerkers.length && blokkenVandaag < medewerkersPerDag && resterend > 0; poging++) {
            const mw = beschikbareMedewerkers[(mwStartIndex + poging) % beschikbareMedewerkers.length]
            const maxUren = mw.uren_per_dag || 8
            const key = `${datum}-${mw.id}`
            const bezet = bezetting[key] || 0
            const vrij = maxUren - bezet

            const isMargeDag = (bestaandeBlokken || []).some(b =>
              b.datum === datum && b.medewerker_id === mw.id && b.is_marge
            )

            if (vrij > 0 && !isMargeDag) {
              const uren = Math.min(vrij, resterend)
              nieuweBlokken.push({
                medewerker_id: mw.id,
                medewerker_naam: mw.naam,
                datum,
                uren,
              })
              bezetting[key] = bezet + uren
              resterend -= uren
              blokkenVandaag++
            }
          }

          mwStartIndex = (mwStartIndex + blokkenVandaag) % beschikbareMedewerkers.length
        }

        currentDate.setDate(currentDate.getDate() + 1)
      }

      setVoorstel(nieuweBlokken)
      setBezettingMap(bezetting)
      setBestaande(bestaandeBlokken || [])
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

  // Verwijder blok en herplan naar eerstvolgende vrij slot
  const verwijderUitVoorstel = (index) => {
    const verwijderd = voorstel[index]
    const resterendeBlokken = voorstel.filter((_, i) => i !== index)

    // Geef capaciteit terug
    const bezetting = { ...bezettingMap }
    const oudeKey = `${verwijderd.datum}-${verwijderd.medewerker_id}`
    bezetting[oudeKey] = Math.max(0, (bezetting[oudeKey] || 0) - verwijderd.uren)

    // Beschikbare medewerkers
    const beschikbareMedewerkers = voorkeurMedewerker
      ? medewerkers.filter(m => m.id === voorkeurMedewerker)
      : medewerkers.filter(m => m.actief && (gebruikFlex || !m.is_flex))

    // Zoek eerstvolgende vrije slot over alle medewerkers
    let resterend = verwijderd.uren
    let currentDate = new Date(startDatum + 'T12:00:00')
    const maxDate = new Date(eindDatum + 'T12:00:00')
    maxDate.setDate(maxDate.getDate() + 30)

    const extraBlokken = []

    while (resterend > 0 && currentDate <= maxDate) {
      const dag = currentDate.getDay()
      const isWerkdag = dag >= 1 && dag <= 5
      const isWeekend = dag === 0 || dag === 6
      const planDezeDag = isWerkdag || (isWeekend && toonWeekend)

      if (planDezeDag) {
        for (const mw of beschikbareMedewerkers) {
          if (resterend <= 0) break
          const maxUren = mw.uren_per_dag || 8
          const datum = currentDate.toISOString().split('T')[0]
          const key = `${datum}-${mw.id}`
          const bezet = bezetting[key] || 0
          const vrij = maxUren - bezet

          const isMargeDag = bestaande.some(b =>
            b.datum === datum && b.medewerker_id === mw.id && b.is_marge
          )
          const alInVoorstel = resterendeBlokken.some(b => b.datum === datum && b.medewerker_id === mw.id)

          if (vrij > 0 && !isMargeDag && !alInVoorstel) {
            const uren = Math.min(vrij, resterend)
            extraBlokken.push({
              medewerker_id: mw.id,
              medewerker_naam: mw.naam,
              datum,
              uren,
            })
            bezetting[key] = bezet + uren
            resterend -= uren
          }
        }
      }

      currentDate.setDate(currentDate.getDate() + 1)
    }

    setVoorstel([...resterendeBlokken, ...extraBlokken].sort((a, b) => a.datum.localeCompare(b.datum)))
    setBezettingMap(bezetting)
  }

  const project = projecten.find(p => p.id === selectedProjectId)
  const totaalVoorstel = voorstel.reduce((sum, v) => sum + v.uren, 0)
  const resterendNaVoorstel = (selectedOrder?.begrote_uren || 0) - totaalVoorstel

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 border-b flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-gray-800">📅 Order inplannen</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {stap === 1 && 'Selecteer een order en kies het bereik'}
              {stap === 2 && 'Bekijk en pas het voorstel aan'}
              {stap === 3 && 'Order is ingepland!'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* STAP 1: Selecteer order + bereik */}
          {stap === 1 && (
            <div className="space-y-4">
              {/* Project selectie met zoekbalk */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Project</label>
                <input
                  type="text"
                  value={projectZoek}
                  onChange={(e) => { setProjectZoek(e.target.value); if (selectedProjectId) { setSelectedProjectId(''); setSelectedOrderId('') } }}
                  placeholder="🔍 Zoek project..."
                  className="w-full border rounded-lg px-3 py-2.5 text-sm mb-1"
                  autoFocus
                />
                <div className="space-y-0.5 max-h-48 overflow-y-auto border rounded-lg">
                  {projecten
                    .filter(p => p.actief !== false)
                    .filter(p => {
                      if (!projectZoek) return true
                      const zoek = projectZoek.toLowerCase()
                      return (p.naam || '').toLowerCase().includes(zoek) ||
                             (p.klant || '').toLowerCase().includes(zoek) ||
                             (p.project_nummer || '').toLowerCase().includes(zoek)
                    })
                    .map(p => (
                      <button
                        key={p.id}
                        onClick={() => { setSelectedProjectId(p.id); setSelectedOrderId(''); setProjectZoek(p.naam || '') }}
                        className={`w-full text-left px-3 py-2 text-sm flex justify-between items-center hover:bg-gray-50 ${selectedProjectId === p.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
                      >
                        <span>{p.emoji} {p.naam}</span>
                        {p.klant && <span className="text-xs text-gray-400">{p.klant}</span>}
                      </button>
                    ))
                  }
                  {projecten.filter(p => p.actief !== false).filter(p => {
                    if (!projectZoek) return true
                    const zoek = projectZoek.toLowerCase()
                    return (p.naam || '').toLowerCase().includes(zoek) || (p.klant || '').toLowerCase().includes(zoek) || (p.project_nummer || '').toLowerCase().includes(zoek)
                  }).length === 0 && (
                    <div className="p-3 text-sm text-gray-400 text-center">Geen projecten gevonden</div>
                  )}
                </div>
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

              {/* Bereik + opties */}
              {selectedOrder && (
                <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-blue-800">
                      {selectedOrder.naam}
                    </span>
                    <span className="text-sm font-bold text-blue-700">{selectedOrder.begrote_uren || 0}u te plannen</span>
                  </div>

                  {/* Datumbereik */}
                  <div>
                    <label className="block text-xs text-blue-600 mb-1 font-medium">📅 Bereik: inplannen tussen</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">Van</label>
                        <input
                          type="date"
                          value={startDatum}
                          onChange={(e) => setStartDatum(e.target.value)}
                          className="w-full border rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">Tot en met</label>
                        <input
                          type="date"
                          value={eindDatum}
                          onChange={(e) => setEindDatum(e.target.value)}
                          className="w-full border rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                    </div>

                    {/* Vroegst mogelijke einddatum suggestie */}
                    {vroegsteEind && (
                      <div className="col-span-2 flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-blue-500">Vroegst klaar:</span>
                        <button
                          type="button"
                          onClick={() => setEindDatum(vroegsteEind)}
                          className="text-[10px] font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 px-2 py-0.5 rounded transition-colors"
                        >
                          {new Date(vroegsteEind + 'T12:00:00').toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' })}
                          {eindDatum !== vroegsteEind && ' ← klik om over te nemen'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs text-blue-600 mb-1">Voorkeur medewerker</label>
                    <select
                      value={voorkeurMedewerker}
                      onChange={(e) => setVoorkeurMedewerker(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">Automatisch verdelen</option>
                      {medewerkers.filter(m => m.actief && (gebruikFlex || !m.is_flex)).map(m => (
                        <option key={m.id} value={m.id}>{m.naam} {m.is_flex ? '(flex)' : ''}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setGebruikFlex(!gebruikFlex)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        gebruikFlex
                          ? 'bg-blue-100 border-blue-300 text-blue-700'
                          : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      {gebruikFlex ? '👥 Flex medewerkers: AAN' : '👤 Enkel vaste medewerkers'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setToonWeekend(!toonWeekend)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        toonWeekend
                          ? 'bg-amber-100 border-amber-300 text-amber-700'
                          : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      {toonWeekend ? '📅 Weekend: AAN' : '📅 Enkel werkdagen'}
                    </button>
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

              {/* Waarschuwing als niet alles past */}
              {resterendNaVoorstel > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                  <div className="flex items-start gap-2">
                    <span className="text-lg">⚠️</span>
                    <div>
                      <p className="font-medium">Niet alle uren passen in het bereik!</p>
                      <p className="text-xs mt-1">
                        <strong>{resterendNaVoorstel}u</strong> kon niet ingepland worden tussen {new Date(startDatum + 'T12:00:00').toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })} en {new Date(eindDatum + 'T12:00:00').toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })}.
                      </p>
                      <p className="text-xs mt-1 text-amber-600">Je kunt:</p>
                      <ul className="text-xs mt-1 ml-4 list-disc space-y-0.5">
                        <li>Het bereik verlengen (einddatum later zetten)</li>
                        <li>Weekend inplannen aanzetten</li>
                        <li>Nu bevestigen en de rest later apart inplannen</li>
                      </ul>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => setStap(1)}
                          className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg text-xs font-medium hover:bg-amber-200"
                        >
                          ◀ Bereik aanpassen
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {voorstel.length > 0 && (
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
              )}

              {voorstel.length === 0 && (
                <div className="text-center py-8 text-gray-400 border-2 border-dashed rounded-lg">
                  <div className="text-3xl mb-2">😕</div>
                  <p className="font-medium">Geen capaciteit beschikbaar in dit bereik</p>
                  <p className="text-xs mt-1">Probeer het bereik te verlengen of weekend aan te zetten.</p>
                  <button
                    onClick={() => setStap(1)}
                    className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                  >
                    ◀ Bereik aanpassen
                  </button>
                </div>
              )}
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
              {resterendNaVoorstel > 0 && (
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700 inline-block">
                  ⚠️ Let op: {resterendNaVoorstel}u is nog niet ingepland. Plan deze later apart in.
                </div>
              )}
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
                {saving ? 'Opslaan...' : `✅ Bevestig (${voorstel.length} blokken${resterendNaVoorstel > 0 ? `, ${resterendNaVoorstel}u resterend` : ''})`}
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
