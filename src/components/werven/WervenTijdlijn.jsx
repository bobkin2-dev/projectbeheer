import React, { useMemo, useState } from 'react'
import { supabase } from '../../supabase'

// ─── helpers ────────────────────────────────────────────────────────────────

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

const formatEuro = (v) =>
  new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)

// Bouw een Set van verlof weekKeys vanuit periodes
const buildVerlofSet = (verlofPeriodes) => {
  const set = new Set()
  ;(verlofPeriodes || []).forEach(p => {
    if (!p.start_datum || !p.eind_datum) return
    const cur = getMonday(new Date(p.start_datum))
    const eind = new Date(p.eind_datum)
    while (cur <= eind) {
      set.add(getWeekKey(cur))
      cur.setDate(cur.getDate() + 7)
    }
  })
  return set
}

// Bereken omzetPerWeek voor een item, verlofweken overgeslagen
const berekenOmzetPerWeek = (start_datum, eind_datum, omzet, verlofSet) => {
  if (!start_datum || !eind_datum || !omzet) return {}
  const start = new Date(start_datum)
  const eind = new Date(eind_datum)
  if (eind < start) return {}

  // Verzamel alle werkweken (niet-verlof) in de looptijd
  const werkweken = []
  const cur = getMonday(start)
  while (cur <= eind) {
    const key = getWeekKey(cur)
    if (!verlofSet.has(key)) werkweken.push(key)
    cur.setDate(cur.getDate() + 7)
  }

  if (werkweken.length === 0) return {}
  const perWeek = omzet / werkweken.length
  const result = {}
  werkweken.forEach(key => { result[key] = perWeek })
  return result
}

// ─── Verlof beheer panel ─────────────────────────────────────────────────────

const VerlofBeheer = ({ verlofPeriodes, onRefresh }) => {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ label: '', start_datum: '', eind_datum: '' })
  const [saving, setSaving] = useState(false)

  const handleAdd = async () => {
    if (!form.start_datum || !form.eind_datum) return
    setSaving(true)
    await supabase.from('verlof_periodes').insert({
      label: form.label || 'Verlof',
      start_datum: form.start_datum,
      eind_datum: form.eind_datum,
    })
    setForm({ label: '', start_datum: '', eind_datum: '' })
    setShowForm(false)
    setSaving(false)
    onRefresh()
  }

  const handleDelete = async (id) => {
    await supabase.from('verlof_periodes').delete().eq('id', id)
    onRefresh()
  }

  const formatPeriode = (p) => {
    const s = new Date(p.start_datum).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })
    const e = new Date(p.eind_datum).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })
    return `${s} → ${e}`
  }

  // Tel weken per periode
  const countWeken = (p) => {
    if (!p.start_datum || !p.eind_datum) return 0
    const ms = new Date(p.eind_datum) - new Date(p.start_datum)
    return Math.max(1, Math.ceil(ms / (7 * 24 * 3600 * 1000)) + 1)
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🏖️</span>
          <h4 className="font-semibold text-sm text-gray-800">Verlofweken</h4>
          <span className="text-xs text-gray-400">— worden overgeslagen bij omzetverdeling</span>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-3 py-1 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-medium"
        >
          + Periode toevoegen
        </button>
      </div>

      {/* Bestaande periodes */}
      <div className="p-3">
        {verlofPeriodes.length === 0 && !showForm && (
          <p className="text-xs text-gray-400 text-center py-2">Geen verlofperiodes ingesteld.</p>
        )}

        <div className="flex flex-wrap gap-2">
          {verlofPeriodes.map(p => (
            <div
              key={p.id}
              className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-xs"
            >
              <span className="font-medium text-amber-800">{p.label}</span>
              <span className="text-amber-600">{formatPeriode(p)}</span>
              <span className="text-amber-400">·</span>
              <span className="text-amber-600">{countWeken(p)}w</span>
              <button
                onClick={() => handleDelete(p.id)}
                className="text-amber-400 hover:text-red-500 ml-1 leading-none"
                title="Verwijderen"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* Toevoeg-formulier */}
        {showForm && (
          <div className="mt-3 flex flex-wrap gap-2 items-end bg-gray-50 rounded-lg p-3 border">
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Label</label>
              <input
                type="text"
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="bv. Zomerverlof"
                className="border rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 outline-none w-36"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Van</label>
              <input
                type="date"
                value={form.start_datum}
                onChange={e => setForm(f => ({ ...f, start_datum: e.target.value }))}
                className="border rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Tot</label>
              <input
                type="date"
                value={form.eind_datum}
                onChange={e => setForm(f => ({ ...f, eind_datum: e.target.value }))}
                className="border rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={saving || !form.start_datum || !form.eind_datum}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '...' : 'Opslaan'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 border rounded-lg text-xs hover:bg-gray-100"
            >
              Annuleren
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Hoofdcomponent ──────────────────────────────────────────────────────────

export const WervenTijdlijn = ({ werven, fases: alleFases = [], verlofPeriodes = [], onVerlofChange }) => {
  const [startDatum, setStartDatum] = useState(() => {
    const nu = getMonday(new Date())
    nu.setDate(nu.getDate() - 7)
    return nu
  })
  const [aantalWeken, setAantalWeken] = useState(16)
  const [showVerlofBeheer, setShowVerlofBeheer] = useState(false)

  // Verlof week-set
  const verlofSet = useMemo(() => buildVerlofSet(verlofPeriodes), [verlofPeriodes])

  // Generate week array
  const weken = useMemo(() => {
    const result = []
    for (let i = 0; i < aantalWeken; i++) {
      const weekDate = new Date(startDatum)
      weekDate.setDate(weekDate.getDate() + i * 7)
      const weekNr = getWeekNumber(weekDate)
      const maand = weekDate.toLocaleDateString('nl-BE', { month: 'short' })
      const weekKey = getWeekKey(weekDate)
      const isHuidigeWeek = getWeekNumber(new Date()) === weekNr && weekDate.getFullYear() === new Date().getFullYear()
      const isVerlof = verlofSet.has(weekKey)
      const weekEind = new Date(weekDate)
      weekEind.setDate(weekEind.getDate() + 6)
      result.push({
        weekNr, maand,
        datum: weekDate.toISOString().split('T')[0],
        eindDatum: weekEind.toISOString().split('T')[0],
        isHuidigeWeek, weekKey, isVerlof,
      })
    }
    return result
  }, [startDatum, aantalWeken, verlofSet])

  // Month groups
  const maandGroepen = useMemo(() => {
    const groups = []
    let huidigeMaand = null
    weken.forEach((week, i) => {
      if (week.maand !== huidigeMaand) {
        groups.push({ maand: week.maand, startIndex: i, count: 1 })
        huidigeMaand = week.maand
      } else {
        groups[groups.length - 1].count++
      }
    })
    return groups
  }, [weken])

  // Verrijkte werfdata
  const werfData = useMemo(() => {
    return (werven || [])
      .filter(w => w.actief !== false)
      .map(werf => {
        const werfFases = alleFases.filter(f => f.werf_id === werf.id)
        const heeftFases = werfFases.length > 0

        let omzetPerWeek = {}
        if (heeftFases) {
          werfFases.forEach(fase => {
            const fo = berekenOmzetPerWeek(fase.start_datum, fase.eind_datum, fase.omzet, verlofSet)
            Object.entries(fo).forEach(([key, val]) => {
              omzetPerWeek[key] = (omzetPerWeek[key] || 0) + val
            })
          })
        } else {
          omzetPerWeek = berekenOmzetPerWeek(werf.start_datum, werf.eind_datum, werf.omzet, verlofSet)
        }

        return { ...werf, fases: werfFases, heeftFases, omzetPerWeek }
      })
  }, [werven, alleFases, verlofSet])

  // Totaal per week
  const totaalOmzetPerWeek = useMemo(() => {
    const agg = {}
    werfData.forEach(w => {
      Object.entries(w.omzetPerWeek || {}).forEach(([key, val]) => {
        agg[key] = (agg[key] || 0) + val
      })
    })
    return agg
  }, [werfData])

  const maxOmzetPerWeek = useMemo(() => {
    const vals = Object.values(totaalOmzetPerWeek)
    return vals.length > 0 ? Math.max(...vals) : 0
  }, [totaalOmzetPerWeek])

  const totaalZichtbaar = useMemo(() =>
    weken.reduce((sum, w) => sum + (totaalOmzetPerWeek[w.weekKey] || 0), 0),
    [weken, totaalOmzetPerWeek]
  )

  const aantalVerlofZichtbaar = weken.filter(w => w.isVerlof).length

  // Navigation
  const prevRange = () => { const d = new Date(startDatum); d.setDate(d.getDate() - 28); setStartDatum(d) }
  const nextRange = () => { const d = new Date(startDatum); d.setDate(d.getDate() + 28); setStartDatum(d) }
  const goToVandaag = () => { const nu = getMonday(new Date()); nu.setDate(nu.getDate() - 7); setStartDatum(nu) }

  // Heatmap kleur (enkel voor niet-verlof weken)
  const heatColor = (val) => {
    if (!val || maxOmzetPerWeek === 0) return { bg: 'bg-gray-50', text: 'text-gray-300', bar: '#e5e7eb' }
    const pct = val / maxOmzetPerWeek
    if (pct < 0.33) return { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: '#6ee7b7' }
    if (pct < 0.60) return { bg: 'bg-yellow-50', text: 'text-yellow-700', bar: '#fcd34d' }
    if (pct < 0.85) return { bg: 'bg-orange-100', text: 'text-orange-700', bar: '#fb923c' }
    return { bg: 'bg-red-100', text: 'text-red-700 font-bold', bar: '#ef4444' }
  }

  const rangeLabel = (() => {
    const s = startDatum.toLocaleDateString('nl-BE', { month: 'long', year: 'numeric' })
    const e = new Date(startDatum); e.setDate(e.getDate() + aantalWeken * 7)
    const eLabel = e.toLocaleDateString('nl-BE', { month: 'long', year: 'numeric' })
    return s === eLabel ? s : `${s} – ${eLabel}`
  })()

  return (
    <div className="space-y-4">

      {/* ── Verlof beheer ────────────────────────────────────────── */}
      {showVerlofBeheer && (
        <VerlofBeheer verlofPeriodes={verlofPeriodes} onRefresh={onVerlofChange} />
      )}

      {/* ── Tijdlijn ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">

        {/* Header */}
        <div className="p-4 border-b flex flex-wrap justify-between items-center gap-3">
          <div>
            <h3 className="font-semibold text-gray-800">Omzet-tijdlijn</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Zichtbaar: <span className="font-medium text-gray-600">{formatEuro(totaalZichtbaar)}</span>
              {aantalVerlofZichtbaar > 0 && (
                <span className="ml-2 text-amber-600">· {aantalVerlofZichtbaar} verlofweek{aantalVerlofZichtbaar > 1 ? 'en' : ''} overgeslagen</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowVerlofBeheer(v => !v)}
              className={`px-3 py-1 text-xs rounded-lg font-medium border transition-colors ${
                showVerlofBeheer
                  ? 'bg-amber-100 text-amber-700 border-amber-300'
                  : 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100'
              }`}
              title="Verlofweken beheren"
            >
              🏖️ Verlof{verlofPeriodes.length > 0 ? ` (${verlofPeriodes.length})` : ''}
            </button>
            <div className="w-px h-5 bg-gray-200"></div>
            <button onClick={prevRange} className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">&#9664;</button>
            <button onClick={goToVandaag} className="px-3 py-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-medium">Vandaag</button>
            <span className="text-sm text-gray-600 min-w-[180px] text-center hidden sm:block">{rangeLabel}</span>
            <button onClick={nextRange} className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">&#9654;</button>
            <select
              value={aantalWeken}
              onChange={e => setAantalWeken(parseInt(e.target.value))}
              className="ml-1 text-xs border rounded-lg px-2 py-1 text-gray-600"
            >
              {[8, 12, 16, 24, 36].map(n => <option key={n} value={n}>{n} w</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div style={{ minWidth: '800px' }}>

            {/* Maand header */}
            <div className="flex border-b bg-gray-50">
              <div className="w-[220px] flex-shrink-0"></div>
              <div className="flex-1 flex">
                {maandGroepen.map((g, i) => (
                  <div key={i} className="text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide py-1 border-l border-gray-200" style={{ flex: g.count }}>
                    {g.maand}
                  </div>
                ))}
              </div>
            </div>

            {/* Week nummers + verlof indicator */}
            <div className="flex border-b bg-gray-50">
              <div className="w-[220px] flex-shrink-0 p-3 text-xs font-semibold text-gray-500">Werf / Fase</div>
              <div className="flex-1 flex">
                {weken.map((week, i) => (
                  <div
                    key={i}
                    className={`flex-1 text-center text-[10px] py-1 border-l border-gray-200 ${
                      week.isVerlof
                        ? 'bg-amber-50 text-amber-500'
                        : week.isHuidigeWeek
                          ? 'bg-red-50 text-red-600 font-bold'
                          : 'text-gray-400'
                    }`}
                    title={week.isVerlof ? 'Verlofweek' : undefined}
                  >
                    {week.isVerlof ? '🏖' : week.weekNr}
                  </div>
                ))}
              </div>
            </div>

            {/* Werf rijen */}
            {werfData.length === 0 && (
              <div className="p-8 text-center text-gray-400 text-sm">Geen actieve werven.</div>
            )}

            {werfData.map(werf => (
              <React.Fragment key={werf.id}>

                {/* Werf header rij */}
                <div className="flex border-b bg-gray-50/80">
                  <div className="w-[220px] flex-shrink-0 p-3 flex items-center gap-2">
                    <div className="w-2.5 h-8 rounded-full flex-shrink-0" style={{ background: werf.kleur || '#6b7280' }}></div>
                    <div className="min-w-0">
                      <div className="font-semibold text-xs truncate text-gray-800">{werf.naam}</div>
                      <div className="text-[10px] text-gray-400 truncate">{werf.klant}</div>
                      {werf.omzet > 0 && (
                        <div className="text-[10px] font-medium text-emerald-600">{formatEuro(werf.omzet)}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 flex">
                    {weken.map((week, i) => {
                      const val = werf.omzetPerWeek?.[week.weekKey] || 0
                      return (
                        <div
                          key={i}
                          title={val > 0 ? `W${week.weekNr}: ${formatEuro(val)}` : week.isVerlof ? 'Verlofweek' : undefined}
                          className={`flex-1 border-l border-gray-100 ${
                            week.isVerlof ? 'bg-amber-50/60' : week.isHuidigeWeek ? 'bg-red-50/20' : ''
                          }`}
                          style={{ minHeight: '36px' }}
                        >
                          {week.isVerlof ? (
                            // Verlof streep patroon
                            <div className="h-full w-full" style={{
                              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(251,191,36,0.15) 3px, rgba(251,191,36,0.15) 6px)'
                            }} />
                          ) : val > 0 ? (
                            <div
                              className="h-full"
                              style={{
                                background: `${werf.kleur || '#6b7280'}${Math.round((val / (maxOmzetPerWeek || 1)) * 180 + 40).toString(16).padStart(2, '0')}`,
                              }}
                            />
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Fase sub-rijen */}
                {werf.heeftFases && werf.fases.map((fase, fi) => {
                  const faseOmzetPerWeek = berekenOmzetPerWeek(fase.start_datum, fase.eind_datum, fase.omzet, verlofSet)
                  const faseStart = fase.start_datum
                  const faseEind = fase.eind_datum
                  const faseKleur = fase.kleur || werf.kleur || '#6b7280'

                  return (
                    <div key={fase.id || fi} className="flex border-b hover:bg-gray-50/30">
                      <div className="w-[220px] flex-shrink-0 px-3 py-2 flex items-center gap-2 pl-8">
                        <div className="w-2 h-6 rounded-full flex-shrink-0" style={{ background: faseKleur }}></div>
                        <div className="min-w-0">
                          <div className="text-xs text-gray-700 truncate">{fase.naam}</div>
                          {fase.omzet > 0 && (
                            <div className="text-[10px] text-gray-400">{formatEuro(fase.omzet)}</div>
                          )}
                        </div>
                      </div>

                      <div className="flex-1 flex">
                        {weken.map((week, i) => {
                          const val = faseOmzetPerWeek[week.weekKey] || 0
                          const inRange = faseStart && faseEind && week.datum >= faseStart && week.datum <= faseEind

                          return (
                            <div
                              key={i}
                              title={val > 0 ? `${fase.naam} · W${week.weekNr}: ${formatEuro(val)}` : week.isVerlof && inRange ? 'Verlofweek (overgeslagen)' : undefined}
                              className={`flex-1 border-l border-gray-100 relative flex items-center justify-center ${
                                week.isVerlof ? 'bg-amber-50/40' : week.isHuidigeWeek ? 'bg-red-50/20' : ''
                              }`}
                              style={{ minHeight: '32px' }}
                            >
                              {week.isVerlof && inRange ? (
                                <div className="absolute inset-x-0.5 inset-y-1 rounded-sm" style={{
                                  backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(251,191,36,0.2) 3px, rgba(251,191,36,0.2) 6px)',
                                  border: `1px dashed ${faseKleur}40`
                                }} />
                              ) : inRange ? (
                                <div
                                  className="absolute inset-x-0.5 inset-y-1 rounded-sm"
                                  style={{
                                    background: val > 0
                                      ? `${faseKleur}${Math.round((val / (maxOmzetPerWeek || 1)) * 160 + 60).toString(16).padStart(2, '0')}`
                                      : `${faseKleur}18`,
                                  }}
                                />
                              ) : null}
                              {val > 0 && (
                                <span className="relative z-10 text-[8px] font-medium text-white/90 px-0.5 leading-none">
                                  {Math.round(val / 1000) > 0 ? `${Math.round(val / 1000)}k` : ''}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}

              </React.Fragment>
            ))}

            {/* Totaal heatmap rij */}
            <div className="flex border-t-2 border-gray-300 bg-gray-50">
              <div className="w-[220px] flex-shrink-0 p-3 flex items-center">
                <span className="text-xs font-semibold text-gray-600">📊 Totaal omzet/week</span>
              </div>
              <div className="flex-1 flex">
                {weken.map((week, i) => {
                  const val = totaalOmzetPerWeek[week.weekKey] || 0
                  const colors = heatColor(val)
                  const pct = maxOmzetPerWeek > 0 ? val / maxOmzetPerWeek : 0

                  if (week.isVerlof) {
                    return (
                      <div
                        key={i}
                        title="Verlofweek"
                        className="flex-1 border-l border-gray-200 flex flex-col items-center justify-center"
                        style={{
                          minHeight: '56px',
                          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(251,191,36,0.12) 4px, rgba(251,191,36,0.12) 8px)',
                          background: '#fffbeb'
                        }}
                      >
                        <span className="text-sm">🏖️</span>
                        <span className="text-[8px] text-amber-500 leading-tight">verlof</span>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={i}
                      title={`Week ${week.weekNr}: ${formatEuro(val)}`}
                      className={`flex-1 border-l border-gray-200 flex flex-col items-center justify-end px-0.5 pb-1 ${colors.bg} ${week.isHuidigeWeek ? 'ring-1 ring-red-300 ring-inset' : ''}`}
                      style={{ minHeight: '56px' }}
                    >
                      <div className="w-full flex items-end justify-center mb-0.5" style={{ height: '28px' }}>
                        {val > 0 && (
                          <div
                            className="w-3/4 rounded-t"
                            style={{ height: `${Math.max(3, pct * 28)}px`, background: colors.bar }}
                          />
                        )}
                      </div>
                      <span className={`text-[8px] leading-tight text-center ${colors.text}`}>
                        {val > 0 ? (val >= 1000 ? `${Math.round(val / 1000)}k` : Math.round(val)) : '–'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

          </div>
        </div>

        {/* Legenda */}
        <div className="px-4 py-3 border-t bg-gray-50 flex flex-wrap items-center gap-4 text-[10px] text-gray-500">
          <span className="font-medium text-gray-600">Drukte:</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200 inline-block"></span> Rustig</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-100 border border-yellow-200 inline-block"></span> Gemiddeld</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-200 border border-orange-300 inline-block"></span> Druk</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 border border-red-300 inline-block"></span> Piek</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-50 border border-amber-200 inline-block" style={{backgroundImage:'repeating-linear-gradient(45deg,transparent,transparent 2px,rgba(251,191,36,0.3) 2px,rgba(251,191,36,0.3) 4px)'}}></span> Verlof</span>
          <span className="flex items-center gap-1 ml-auto"><span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block"></span> Huidige week</span>
        </div>
      </div>
    </div>
  )
}
