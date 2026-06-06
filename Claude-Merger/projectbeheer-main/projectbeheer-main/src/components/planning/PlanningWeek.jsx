import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase'
import { PlanningBlok, DropZone } from './PlanningBlok'
import { PlanningSnelBlok } from './PlanningSnelBlok'
import { Toast } from '../ui/Toast'
import { LoadingSpinner } from '../ui/LoadingSpinner'

const getMonday = (date) => {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

const getWeekNumber = (d) => {
  const date = new Date(d)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7)
  const week1 = new Date(date.getFullYear(), 0, 4)
  return 1 + Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
}

export const PlanningWeek = ({ projecten, medewerkers, onOpenInplannen, onOpenSpoed, onMedewerkerVolgorde }) => {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [blokken, setBlokken] = useState([])
  const [orders, setOrders] = useState({})
  const [loading, setLoading] = useState(true)
  const [dragState, setDragState] = useState(null)
  const [toastMsg, setToastMsg] = useState(null)
  const [aantalWeken, setAantalWeken] = useState(3)
  const [snelBlok, setSnelBlok] = useState(null) // { datum, medewerkerId, medewerkerNaam, urenVrij }
  const [geplandPerOrder, setGeplandPerOrder] = useState({}) // { orderId: totaalUrenGepland }

  // Medewerker volgorde aanpassen
  const verplaatsMedewerker = async (mwId, richting) => {
    const idx = medewerkers.findIndex(m => m.id === mwId)
    if (idx < 0) return
    const nieuweIdx = idx + richting
    if (nieuweIdx < 0 || nieuweIdx >= medewerkers.length) return

    // Swap volgorde in DB
    const mwA = medewerkers[idx]
    const mwB = medewerkers[nieuweIdx]
    const volgordeA = mwA.volgorde ?? idx
    const volgordeB = mwB.volgorde ?? nieuweIdx

    try {
      await Promise.all([
        supabase.from('medewerkers').update({ volgorde: volgordeB }).eq('id', mwA.id),
        supabase.from('medewerkers').update({ volgorde: volgordeA }).eq('id', mwB.id),
      ])
      onMedewerkerVolgorde?.() // refresh in parent
      setToastMsg(`${mwA.naam} ${richting < 0 ? '◀' : '▶'} ${mwB.naam}`)
    } catch (e) {
      console.error('Fout bij volgorde:', e)
    }
  }

  // Build array of date strings for the visible range (altijd 7 dagen per week incl. weekend)
  const dagen = []
  for (let i = 0; i < aantalWeken * 7; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    dagen.push(d.toISOString().split('T')[0])
  }

  // Load planning data
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const dagArray = []
      for (let i = 0; i < aantalWeken * 7; i++) {
        const d = new Date(weekStart)
        d.setDate(d.getDate() + i)
        dagArray.push(d.toISOString().split('T')[0])
      }
      const startStr = dagArray[0]
      const eindStr = dagArray[dagArray.length - 1]

      const { data: blokkenData, error: blokkenError } = await supabase
        .from('planning_blokken')
        .select('*')
        .gte('datum', startStr)
        .lte('datum', eindStr)
        .order('volgorde')

      if (blokkenError) {
        console.error('Fout bij laden blokken:', blokkenError)
        setBlokken([])
        setOrders({})
        setLoading(false)
        return
      }

      setBlokken(blokkenData || [])

      // Load related orders
      const orderIds = [...new Set((blokkenData || []).filter(b => b.order_id).map(b => b.order_id))]
      if (orderIds.length > 0) {
        const { data: ordersData, error: ordersError } = await supabase
          .from('orders')
          .select('*, projecten(*)')
          .in('id', orderIds)

        if (!ordersError && ordersData) {
          const ordersMap = {}
          ordersData.forEach(o => { ordersMap[o.id] = o })
          setOrders(ordersMap)

          // Laad totaal geplande uren per order (over ALLE weken)
          const { data: alleBlokkenVoorOrders } = await supabase
            .from('planning_blokken')
            .select('order_id, uren')
            .in('order_id', orderIds)

          const totalen = {}
          ;(alleBlokkenVoorOrders || []).forEach(b => {
            if (b.order_id) totalen[b.order_id] = (totalen[b.order_id] || 0) + (b.uren || 0)
          })
          setGeplandPerOrder(totalen)
        } else {
          setOrders({})
          setGeplandPerOrder({})
        }
      } else {
        setOrders({})
        setGeplandPerOrder({})
      }
    } catch (err) {
      console.error('Onverwachte fout bij laden:', err)
    }
    setLoading(false)
  }, [weekStart, aantalWeken])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Week navigation
  const prevWeek = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - 7)
    setWeekStart(d)
  }

  const nextWeek = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    setWeekStart(d)
  }

  const goToday = () => setWeekStart(getMonday(new Date()))

  // Drag & Drop handlers
  const handleDrop = async (blokId, nieuweMedewerkerId, nieuweDatum) => {
    try {
      const { error } = await supabase
        .from('planning_blokken')
        .update({
          medewerker_id: nieuweMedewerkerId,
          datum: nieuweDatum
        })
        .eq('id', blokId)

      if (error) {
        console.error('Fout bij verplaatsen blok:', error)
        setToastMsg('Fout bij verplaatsen!')
        return
      }

      setBlokken(prev =>
        prev.map(b =>
          b.id === blokId
            ? { ...b, medewerker_id: nieuweMedewerkerId, datum: nieuweDatum }
            : b
        )
      )
      setToastMsg('Blok verplaatst!')
    } catch (err) {
      console.error('Onverwachte fout bij verplaatsen:', err)
    }
  }

  const handleRemove = async (blokId) => {
    try {
      const { error } = await supabase
        .from('planning_blokken')
        .delete()
        .eq('id', blokId)

      if (error) {
        console.error('Fout bij verwijderen blok:', error)
        setToastMsg('Fout bij verwijderen!')
        return
      }

      setBlokken(prev => prev.filter(b => b.id !== blokId))
      setToastMsg('Blok verwijderd')
    } catch (err) {
      console.error('Onverwachte fout bij verwijderen:', err)
    }
  }

  // Labels
  const weekNr = getWeekNumber(weekStart)
  const eindDate = new Date(weekStart)
  eindDate.setDate(eindDate.getDate() + (aantalWeken * 7) - 1)
  const startLabel = new Date(weekStart).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })
  const eindLabel = eindDate.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })

  const dagNamen = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za']

  if (loading) return <LoadingSpinner />

  return (
    <div>
      {/* Controls bar */}
      <div className="bg-white rounded-xl border shadow-sm p-4 mb-4 flex justify-between items-center flex-wrap gap-3">
        {/* Left: week navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={prevWeek}
            className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            &#9664; Vorige
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
          >
            Vandaag
          </button>
          <button
            onClick={nextWeek}
            className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Volgende &#9654;
          </button>
        </div>

        {/* Center: week label */}
        <div className="text-center">
          <span className="text-lg font-bold text-gray-800">Week {weekNr}{aantalWeken > 1 ? `–${getWeekNumber(eindDate)}` : ''}</span>
          <span className="text-gray-400 mx-2">&middot;</span>
          <span className="text-sm text-gray-500">{startLabel} — {eindLabel}</span>
        </div>

        {/* Right: options & actions */}
        <div className="flex items-center gap-3">
          {/* Aantal weken selector */}
          <div className="flex bg-gray-100 p-0.5 rounded-lg">
            {[1, 2, 3].map(n => (
              <button
                key={n}
                onClick={() => setAantalWeken(n)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  aantalWeken === n
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {n}w
              </button>
            ))}
          </div>

          {onOpenSpoed && (
            <button
              onClick={onOpenSpoed}
              className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
            >
              🚨 Spoed
            </button>
          )}
          {onOpenInplannen && (
            <button
              onClick={onOpenInplannen}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              + Inplannen
            </button>
          )}
        </div>
      </div>

      {/* Sticky medewerker header — los van de tabel zodat sticky werkt bij page scroll */}
      <div className="sticky top-0 z-20 bg-gray-50 border border-b-0 rounded-t-xl shadow-sm" style={{ minWidth: '900px' }}>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: '900px', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '100px' }} />
              <col style={{ width: '40px' }} />
              {medewerkers.map(m => (
                <col key={m.id} />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-gray-50">
                <th className="p-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Dag</th>
                <th className="p-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Cap.</th>
                {medewerkers.map((m, mIdx) => (
                  <th key={m.id} className="p-2 text-center border-l">
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                          m.is_flex
                            ? 'border-2 border-dashed border-blue-300 bg-blue-50 text-blue-400'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {m.naam.charAt(0).toUpperCase()}
                      </div>
                      <div className={`text-xs font-semibold ${m.is_flex ? 'text-blue-600' : 'text-gray-700'}`}>
                        {m.naam}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {m.is_flex ? 'Flex · ' : ''}{m.uren_per_dag || 8}u/dag
                      </div>
                      {/* Volgorde knoppen */}
                      <div className="flex gap-0.5">
                        <button
                          onClick={() => verplaatsMedewerker(m.id, -1)}
                          disabled={mIdx === 0}
                          className="px-1.5 py-0.5 text-[10px] rounded bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-default"
                          title="Naar links"
                        >◀</button>
                        <button
                          onClick={() => verplaatsMedewerker(m.id, 1)}
                          disabled={mIdx === medewerkers.length - 1}
                          className="px-1.5 py-0.5 text-[10px] rounded bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-default"
                          title="Naar rechts"
                        >▶</button>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
          </table>
        </div>
      </div>

      {/* Planning grid body */}
      <div className="bg-white border border-t-0 rounded-b-xl">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: '900px', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '100px' }} />
              <col style={{ width: '40px' }} />
              {medewerkers.map(m => (
                <col key={m.id} />
              ))}
            </colgroup>
            <tbody>
              {dagen.map((datum, index) => {
                const dagDate = new Date(datum + 'T12:00:00')
                const isVandaag = datum === new Date().toISOString().split('T')[0]
                const isWeekend = dagDate.getDay() === 0 || dagDate.getDay() === 6
                const isMaandag = dagDate.getDay() === 1
                const dagLabel = dagNamen[dagDate.getDay()]
                const dagNr = dagDate.getDate()
                const dagWeekNr = getWeekNumber(dagDate)

                // Is this the first day of a new week (not the very first row)?
                const isNieuweWeek = isMaandag && index > 0

                // Totals for this day
                const dagBlokken = blokken.filter(b => b.datum === datum)
                const dagTotaal = dagBlokken.reduce((sum, b) => sum + (b.uren || 0), 0)
                const dagMax = medewerkers.reduce((sum, m) => sum + (m.uren_per_dag || 8), 0)

                return (
                  <React.Fragment key={datum}>
                    {/* Week separator */}
                    {isNieuweWeek && (
                      <tr>
                        <td colSpan={2 + medewerkers.length} className="bg-gray-200 h-[2px] p-0"></td>
                      </tr>
                    )}

                    <tr
                      className={`border-b ${
                        isVandaag
                          ? 'bg-red-50/50'
                          : isWeekend
                            ? 'bg-gray-200/60'
                            : 'hover:bg-gray-50/50'
                      }`}
                    >
                      {/* Day label */}
                      <td className="p-2 font-medium">
                        {isMaandag && (
                          <div className="text-[9px] text-blue-600 font-bold uppercase tracking-wider mb-0.5">
                            Wk {dagWeekNr}
                          </div>
                        )}
                        <div className={`text-sm ${
                          isVandaag
                            ? 'text-red-700'
                            : isWeekend
                              ? 'text-gray-500'
                              : 'text-gray-700'
                        }`}>
                          {dagLabel} {dagNr}
                        </div>
                        {isVandaag && (
                          <div className="text-[10px] text-red-500 font-semibold">Vandaag</div>
                        )}
                        {isWeekend && (
                          <div className="text-[10px] text-gray-400">Weekend</div>
                        )}
                      </td>

                      {/* Capacity indicator */}
                      <td className="p-1 text-center text-[10px] text-gray-400 font-mono">
                        {dagTotaal}<span className="text-gray-300">/{dagMax}</span>
                      </td>

                      {/* Cell per medewerker */}
                      {medewerkers.map(medewerker => {
                        const celBlokken = blokken.filter(
                          b => b.medewerker_id === medewerker.id && b.datum === datum
                        )
                        const urenGepland = celBlokken.reduce((sum, b) => sum + (b.uren || 0), 0)
                        const isDragOver =
                          dragState?.overCell?.medewerker_id === medewerker.id &&
                          dragState?.overCell?.datum === datum

                        return (
                          <td
                            key={medewerker.id}
                            className={`p-1.5 border-l align-top ${medewerker.is_flex ? 'bg-blue-50/30' : ''}`}
                            onDragOver={(e) => {
                              e.preventDefault()
                              setDragState(prev => ({
                                ...prev,
                                overCell: { medewerker_id: medewerker.id, datum }
                              }))
                            }}
                            onDragLeave={() => {
                              setDragState(prev => ({ ...prev, overCell: null }))
                            }}
                            onDrop={(e) => {
                              e.preventDefault()
                              const blokId = e.dataTransfer.getData('blokId')
                              if (blokId) handleDrop(blokId, medewerker.id, datum)
                              setDragState(null)
                            }}
                          >
                            <div
                              className={`min-h-[50px] space-y-1 ${
                                isDragOver
                                  ? 'bg-blue-100 rounded-lg ring-2 ring-blue-400 ring-dashed p-1'
                                  : ''
                              }`}
                            >
                              {celBlokken.map(blok => {
                                const order = blok.order_id ? orders[blok.order_id] : null
                                const project =
                                  order?.projecten ||
                                  projecten.find(p => p.id === order?.project_id)

                                return (
                                  <PlanningBlok
                                    key={blok.id}
                                    blok={blok}
                                    project={project}
                                    order={order}
                                    totaalGepland={blok.order_id ? geplandPerOrder[blok.order_id] : null}
                                    onDragStart={() =>
                                      setDragState({ blokId: blok.id, overCell: null })
                                    }
                                    onRemove={handleRemove}
                                    onUpdate={loadData}
                                  />
                                )
                              })}

                              {/* Drop zone for remaining capacity — klik om blok toe te voegen */}
                              <DropZone
                                medewerkerUrenPerDag={medewerker.uren_per_dag || 8}
                                urenGepland={urenGepland}
                                isDragOver={isDragOver}
                                onClick={() => setSnelBlok({
                                  datum,
                                  medewerkerId: medewerker.id,
                                  medewerkerNaam: medewerker.naam,
                                  urenVrij: (medewerker.uren_per_dag || 8) - urenGepland
                                })}
                              />
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {toastMsg && <Toast message={toastMsg} onDone={() => setToastMsg(null)} />}

      {snelBlok && (
        <PlanningSnelBlok
          datum={snelBlok.datum}
          medewerkerId={snelBlok.medewerkerId}
          medewerkerNaam={snelBlok.medewerkerNaam}
          urenVrij={snelBlok.urenVrij}
          projecten={projecten}
          onClose={() => setSnelBlok(null)}
          onToegevoegd={() => { loadData(); setToastMsg('Blok toegevoegd!') }}
        />
      )}
    </div>
  )
}
