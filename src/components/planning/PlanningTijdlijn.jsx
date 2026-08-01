import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase'
import { PlanningCapaciteit } from './PlanningCapaciteit'
import { LoadingSpinner } from '../ui/LoadingSpinner'

const getWeekNumber = (d) => {
  const date = new Date(d)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7)
  const week1 = new Date(date.getFullYear(), 0, 4)
  return 1 + Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
}

const getMonday = (date) => {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

const getWeekKey = (datum) => {
  const d = new Date(datum)
  const year = d.getFullYear()
  const weekNr = getWeekNumber(d)
  return `${year}-W${String(weekNr).padStart(2, '0')}`
}

export const PlanningTijdlijn = ({ projecten, medewerkers }) => {
  const [startDatum, setStartDatum] = useState(() => {
    const nu = getMonday(new Date())
    nu.setDate(nu.getDate() - 14) // 2 weken terug
    return nu
  })
  const [aantalWeken, setAantalWeken] = useState(12)
  const [blokkenPerWeek, setBlokkenPerWeek] = useState({})
  const [allOrders, setAllOrders] = useState([])
  const [werkelijkeUren, setWerkelijkeUren] = useState({})
  const [loading, setLoading] = useState(true)

  // Calculate end date from start + weeks
  const getEindDatum = useCallback(() => {
    const eind = new Date(startDatum)
    eind.setDate(eind.getDate() + aantalWeken * 7)
    return eind
  }, [startDatum, aantalWeken])

  // Generate week columns
  const weken = []
  for (let i = 0; i < aantalWeken; i++) {
    const weekDate = new Date(startDatum)
    weekDate.setDate(weekDate.getDate() + i * 7)
    const weekNr = getWeekNumber(weekDate)
    const maand = weekDate.toLocaleDateString('nl-BE', { month: 'short' })
    const weekKey = getWeekKey(weekDate)
    const isHuidigeWeek = getWeekNumber(new Date()) === weekNr && weekDate.getFullYear() === new Date().getFullYear()
    const urenGepland = blokkenPerWeek[weekKey]?.total || 0
    weken.push({ weekNr, maand, datum: weekDate.toISOString().split('T')[0], isHuidigeWeek, weekKey, urenGepland })
  }

  // Group weeks by month for header row
  const maandGroepen = []
  let huidigeMaand = null
  weken.forEach((week, i) => {
    if (week.maand !== huidigeMaand) {
      maandGroepen.push({ maand: week.maand, startIndex: i, count: 1 })
      huidigeMaand = week.maand
    } else {
      maandGroepen[maandGroepen.length - 1].count++
    }
  })

  // Max capacity per week
  const maxCapaciteitPerWeek = (medewerkers || [])
    .filter(m => m.actief)
    .reduce((sum, m) => sum + (m.uren_per_dag || 8) * 5, 0)

  // Data loading
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const eindDatum = getEindDatum()
      const startStr = startDatum.toISOString().split('T')[0]
      const eindStr = eindDatum.toISOString().split('T')[0]

      // Load planning_blokken in range
      const { data: blokkenData, error: blokkenError } = await supabase
        .from('planning_blokken')
        .select('datum, uren, order_id, orders(project_id)')
        .gte('datum', startStr)
        .lte('datum', eindStr)

      if (blokkenError) {
        console.error('Fout bij laden planning_blokken:', blokkenError)
      }

      // Load actual hours from uren_registratie
      const { data: urenData, error: urenError } = await supabase
        .from('uren_registratie')
        .select('project_id, uren')

      if (urenError) {
        console.error('Fout bij laden uren_registratie:', urenError)
      }

      // Load all orders
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('id, project_id, begrote_uren, naam')

      if (ordersError) {
        console.error('Fout bij laden orders:', ordersError)
      }

      // Aggregate werkelijke uren per project
      const werkelijk = {}
      ;(urenData || []).forEach(r => {
        if (r.project_id) {
          werkelijk[r.project_id] = (werkelijk[r.project_id] || 0) + (r.uren || 0)
        }
      })

      // Aggregate blokken per week
      const perWeek = {}
      ;(blokkenData || []).forEach(b => {
        const weekKey = getWeekKey(b.datum)
        if (!perWeek[weekKey]) {
          perWeek[weekKey] = { total: 0, perProject: {} }
        }
        perWeek[weekKey].total += (b.uren || 0)

        const projectId = b.orders?.project_id
        if (projectId) {
          perWeek[weekKey].perProject[projectId] = (perWeek[weekKey].perProject[projectId] || 0) + (b.uren || 0)
        }
      })

      setBlokkenPerWeek(perWeek)
      setWerkelijkeUren(werkelijk)
      setAllOrders(ordersData || [])
    } catch (err) {
      console.error('Onverwachte fout bij laden tijdlijn:', err)
    }
    setLoading(false)
  }, [startDatum, aantalWeken, getEindDatum])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Navigation
  const prevRange = () => {
    const d = new Date(startDatum)
    d.setDate(d.getDate() - 7 * 4) // 4 weken terug
    setStartDatum(d)
  }

  const nextRange = () => {
    const d = new Date(startDatum)
    d.setDate(d.getDate() + 7 * 4) // 4 weken vooruit
    setStartDatum(d)
  }

  const goToVandaag = () => {
    const nu = getMonday(new Date())
    nu.setDate(nu.getDate() - 14)
    setStartDatum(nu)
  }

  // Range label
  const startMaand = startDatum.toLocaleDateString('nl-BE', { month: 'long', year: 'numeric' })
  const eindMaandDate = new Date(startDatum)
  eindMaandDate.setDate(eindMaandDate.getDate() + aantalWeken * 7)
  const eindMaand = eindMaandDate.toLocaleDateString('nl-BE', { month: 'long', year: 'numeric' })
  const rangeLabel = startMaand === eindMaand ? startMaand : `${startMaand} - ${eindMaand}`

  // Calculate bar position for a project
  const getProjectBar = (project) => {
    const projectOrders = allOrders.filter(o => o.project_id === project.id)
    const totaalUren = projectOrders.reduce((sum, o) => sum + (o.begrote_uren || 0), 0)
    const gedaanUren = werkelijkeUren[project.id] || 0
    const resterendUren = Math.max(0, totaalUren - gedaanUren)
    const werkdagen = Math.ceil(resterendUren / 8)

    // Find first and last week with blokken for this project
    let startWeekIndex = -1
    let eindWeekIndex = -1
    let geplandUren = 0

    weken.forEach((week, i) => {
      const weekData = blokkenPerWeek[week.weekKey]
      if (weekData?.perProject?.[project.id]) {
        geplandUren += weekData.perProject[project.id]
        if (startWeekIndex === -1) startWeekIndex = i
        eindWeekIndex = i
      }
    })

    const heeftBlokken = startWeekIndex !== -1

    // For projects without blokken, suggest a future position
    if (!heeftBlokken) {
      // Find the current week index or the first future week
      const huidigeWeekIndex = weken.findIndex(w => w.isHuidigeWeek)
      const suggestedStart = huidigeWeekIndex !== -1 ? huidigeWeekIndex : Math.max(0, Math.floor(aantalWeken * 0.3))
      const suggestedWidth = Math.min(Math.max(2, Math.ceil(werkdagen / 5)), aantalWeken - suggestedStart)

      return {
        projectOrders,
        totaalUren,
        gedaanUren,
        resterendUren,
        werkdagen,
        geplandUren: 0,
        heeftBlokken: false,
        barLeft: (suggestedStart / aantalWeken) * 100,
        barWidth: (suggestedWidth / aantalWeken) * 100,
        progressPercent: totaalUren > 0 ? Math.min(100, Math.round((gedaanUren / totaalUren) * 100)) : 0
      }
    }

    const barLeft = (startWeekIndex / aantalWeken) * 100
    const barWidth = ((eindWeekIndex - startWeekIndex + 1) / aantalWeken) * 100
    const progressPercent = totaalUren > 0 ? Math.min(100, Math.round((gedaanUren / totaalUren) * 100)) : 0

    return {
      projectOrders,
      totaalUren,
      gedaanUren,
      resterendUren,
      werkdagen,
      geplandUren,
      heeftBlokken: true,
      barLeft,
      barWidth,
      progressPercent
    }
  }

  // Overlap indicator per week: count how many projects have blokken in that week
  const overlapPerWeek = weken.map(week => {
    const weekData = blokkenPerWeek[week.weekKey]
    if (!weekData?.perProject) return 0
    return Object.keys(weekData.perProject).length
  })

  const actieveProjecten = (projecten || []).filter(p => p.actief !== false)

  return (
    <div>
      {loading && <LoadingSpinner />}

      {!loading && (
        <>
          {/* Capacity bars */}
          <PlanningCapaciteit weken={weken} maxCapaciteitPerWeek={maxCapaciteitPerWeek} />

          {/* Timeline Gantt */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            {/* Header with nav */}
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-semibold text-gray-800">Projecttijdlijn</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={prevRange}
                  className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  title="4 weken terug"
                >
                  &#9664;
                </button>
                <button
                  onClick={goToVandaag}
                  className="px-3 py-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-medium transition-colors"
                >
                  Vandaag
                </button>
                <span className="text-sm text-gray-600 min-w-[180px] text-center">{rangeLabel}</span>
                <button
                  onClick={nextRange}
                  className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  title="4 weken vooruit"
                >
                  &#9654;
                </button>
                <select
                  value={aantalWeken}
                  onChange={(e) => setAantalWeken(parseInt(e.target.value))}
                  className="ml-3 text-xs border rounded-lg px-2 py-1 text-gray-600"
                >
                  <option value={8}>8 weken</option>
                  <option value={12}>12 weken</option>
                  <option value={16}>16 weken</option>
                  <option value={24}>24 weken</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <div style={{ minWidth: '900px' }}>

                {/* Month header row */}
                <div className="flex border-b bg-gray-50">
                  <div className="w-[220px] flex-shrink-0"></div>
                  <div className="flex-1 flex">
                    {maandGroepen.map((groep, i) => (
                      <div
                        key={i}
                        className="text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide py-1 border-l border-gray-200"
                        style={{ flex: groep.count }}
                      >
                        {groep.maand}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Week column headers */}
                <div className="flex border-b bg-gray-50">
                  <div className="w-[220px] flex-shrink-0 p-3 text-xs font-semibold text-gray-500">Project</div>
                  <div className="flex-1 flex">
                    {weken.map((week, i) => (
                      <div
                        key={i}
                        className={`flex-1 text-center text-[10px] py-1 border-l border-gray-200 ${
                          week.isHuidigeWeek
                            ? 'bg-red-50 text-red-600 font-bold'
                            : 'text-gray-400'
                        }`}
                      >
                        {week.weekNr}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Current week indicator line */}
                {/* Project rows */}
                {actieveProjecten.length === 0 && (
                  <div className="p-8 text-center text-gray-400 text-sm">
                    Geen actieve projecten gevonden.
                  </div>
                )}

                {actieveProjecten.map(project => {
                  const bar = getProjectBar(project)

                  return (
                    <div key={project.id} className="flex border-b hover:bg-gray-50/50 group/row">
                      {/* Project info */}
                      <div className="w-[220px] flex-shrink-0 p-3 flex items-center gap-3">
                        <div
                          className="w-3 h-10 rounded-full flex-shrink-0"
                          style={{ background: project.kleur || '#6b7280' }}
                        ></div>
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">
                            {project.emoji || ''} {project.naam}
                          </div>
                          <div className="text-[10px] text-gray-500">
                            {bar.projectOrders.length} orders &middot; {bar.totaalUren}u &middot;{' '}
                            <span className="text-green-600 font-medium">{bar.gedaanUren}u gedaan</span>
                          </div>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                              {bar.resterendUren}u resterend
                            </span>
                            <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                              ~{bar.werkdagen} werkdagen
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Timeline bar area */}
                      <div className="flex-1 flex items-center relative px-1">
                        {/* Week grid lines */}
                        {weken.map((week, i) => (
                          <div
                            key={i}
                            className={`absolute top-0 bottom-0 border-l ${
                              week.isHuidigeWeek ? 'border-red-200' : 'border-gray-100'
                            }`}
                            style={{ left: `${(i / aantalWeken) * 100}%` }}
                          ></div>
                        ))}

                        {/* Current week highlight */}
                        {weken.map((week, i) =>
                          week.isHuidigeWeek ? (
                            <div
                              key={`highlight-${i}`}
                              className="absolute top-0 bottom-0 bg-red-50/40"
                              style={{
                                left: `${(i / aantalWeken) * 100}%`,
                                width: `${(1 / aantalWeken) * 100}%`
                              }}
                            ></div>
                          ) : null
                        )}

                        {/* Colored bar */}
                        {bar.heeftBlokken ? (
                          <div
                            className="absolute top-2 bottom-2 rounded-lg flex items-center overflow-hidden cursor-pointer hover:brightness-110 hover:shadow-lg transition-all"
                            style={{
                              left: `${bar.barLeft}%`,
                              width: `${bar.barWidth}%`,
                              background: project.kleur || '#6b7280',
                              minWidth: '40px'
                            }}
                          >
                            {/* Progress overlay (darker = done) */}
                            <div
                              className="absolute top-0 bottom-0 left-0 bg-black/20"
                              style={{ width: `${bar.progressPercent}%` }}
                            ></div>

                            {/* Drag edges */}
                            <div className="absolute top-0 bottom-0 left-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-l-lg"></div>
                            <div className="absolute top-0 bottom-0 right-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-r-lg"></div>

                            {/* Label */}
                            <div className="relative z-[5] px-2 text-[10px] text-white font-medium truncate w-full flex justify-between items-center">
                              <span className="truncate">{project.naam}</span>
                              <span className="bg-white/20 px-1 rounded flex-shrink-0 ml-1">{bar.totaalUren}u</span>
                            </div>
                          </div>
                        ) : (
                          /* Dashed bar for projects without planning_blokken */
                          <div
                            className="absolute top-2 bottom-2 rounded-lg flex items-center overflow-hidden border-2 border-dashed opacity-50 hover:opacity-80 transition-all cursor-pointer"
                            style={{
                              left: `${bar.barLeft}%`,
                              width: `${bar.barWidth}%`,
                              borderColor: project.kleur || '#6b7280',
                              minWidth: '40px'
                            }}
                          >
                            <div className="relative z-[5] px-2 text-[10px] font-medium truncate w-full flex justify-between items-center"
                              style={{ color: project.kleur || '#6b7280' }}
                            >
                              <span className="truncate">{project.naam}</span>
                              <span className="text-[9px] italic">niet ingepland</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Overlap indicator row */}
                <div className="flex border-t-2 border-gray-200 bg-gray-50/50">
                  <div className="w-[220px] flex-shrink-0 p-3 text-xs font-semibold text-gray-500 flex items-center gap-1">
                    Overlap / bezetting
                  </div>
                  <div className="flex-1 flex">
                    {overlapPerWeek.map((count, i) => {
                      const capaciteitPct = maxCapaciteitPerWeek > 0
                        ? Math.round((weken[i].urenGepland / maxCapaciteitPerWeek) * 100)
                        : 0
                      const isOvervol = capaciteitPct > 100
                      const isWaarschuwing = capaciteitPct > 80 && capaciteitPct <= 100

                      let bgClass = 'bg-transparent'
                      let textClass = 'text-gray-300'
                      if (isOvervol) {
                        bgClass = 'bg-red-100'
                        textClass = 'text-red-600 font-bold'
                      } else if (isWaarschuwing) {
                        bgClass = 'bg-amber-50'
                        textClass = 'text-amber-600 font-medium'
                      } else if (count >= 3) {
                        bgClass = 'bg-orange-50'
                        textClass = 'text-orange-500'
                      } else if (count >= 2) {
                        textClass = 'text-gray-500'
                      }

                      return (
                        <div
                          key={i}
                          className={`flex-1 text-center text-[10px] py-2 border-l border-gray-200 ${bgClass} ${textClass}`}
                          title={`${count} project(en) actief, ${capaciteitPct}% bezet`}
                        >
                          {count > 0 ? (
                            <div>
                              <div>{count}p</div>
                              <div className="text-[9px]">{capaciteitPct}%</div>
                            </div>
                          ) : (
                            <span className="text-gray-200">-</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

              </div>
            </div>

            {/* Legend */}
            <div className="px-4 py-3 border-t bg-gray-50 flex items-center gap-4 text-[10px] text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-6 h-3 rounded bg-blue-400 inline-block"></span>
                Ingepland
              </span>
              <span className="flex items-center gap-1">
                <span className="w-6 h-3 rounded border-2 border-dashed border-gray-400 inline-block opacity-50"></span>
                Niet ingepland
              </span>
              <span className="flex items-center gap-1">
                <span className="w-6 h-3 rounded bg-blue-400 inline-block relative overflow-hidden">
                  <span className="absolute inset-0 bg-black/20 w-1/2"></span>
                </span>
                Voortgang (donker = gedaan)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block"></span>
                Huidige week
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
