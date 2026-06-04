import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { chauffeurs } from '../../config/constants'
import { calcMinuten, formatMinuten } from '../../utils/time'
import { buildCalendarDays, getCalendarMonthLabel, getPrevMonth, getNextMonth, getInitialCalendarMonth } from '../../utils/calendar'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { Toast } from '../ui/Toast'

// Transport Registratie
export const TransportRegistratie = ({ projecten }) => {
  const [activeTab, setActiveTab] = useState('invoer')
  const [datum, setDatum] = useState(new Date().toISOString().split('T')[0])
  const [selectedChauffeur, setSelectedChauffeur] = useState(null)
  const [regels, setRegels] = useState([])
  const [saving, setSaving] = useState(false)
  const [toastMsg, setToastMsg] = useState(null)

  // Overzicht state
  const [overzichtPeriode, setOverzichtPeriode] = useState('week')
  const [overzichtChauffeur, setOverzichtChauffeur] = useState('')
  const [overzichtData, setOverzichtData] = useState([])
  const [overzichtLoading, setOverzichtLoading] = useState(false)

  // Calendar state
  const [calendarMonth, setCalendarMonth] = useState(getInitialCalendarMonth)
  const [dagenMetRitten, setDagenMetRitten] = useState({})

  // Load calendar data
  useEffect(() => {
    if (!selectedChauffeur) return
    const loadCalendar = async () => {
      const [year, month] = calendarMonth.split('-').map(Number)
      const startDatum = `${year}-${String(month).padStart(2, '0')}-01`
      const endDatum = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`
      const { data } = await supabase.from('leveringen')
        .select('datum')
        .eq('chauffeur', selectedChauffeur)
        .gte('datum', startDatum)
        .lte('datum', endDatum)
      const perDag = {}
      ;(data || []).forEach(r => {
        perDag[r.datum] = (perDag[r.datum] || 0) + 1
      })
      setDagenMetRitten(perDag)
    }
    loadCalendar()
  }, [selectedChauffeur, calendarMonth, regels])

  // Load existing registrations when chauffeur or datum changes
  useEffect(() => {
    if (!selectedChauffeur) return
    const load = async () => {
      const { data } = await supabase.from('leveringen')
        .select('*')
        .eq('chauffeur', selectedChauffeur)
        .eq('datum', datum)
        .order('created_at')
      if (data && data.length > 0) {
        setRegels(data.map(r => ({
          id: r.id,
          bestemming: r.bestemming || 'werf',
          project_id: r.project_id || '',
          werf_naam: r.werf_naam || '',
          tijd_start_rijden: r.tijd_start_rijden || '',
          tijd_stop_rijden: r.tijd_stop_rijden || '',
          tijd_klaar_lossen: r.tijd_klaar_lossen || '',
          notitie: r.notitie || '',
          saved: true
        })))
      } else {
        setRegels([{ bestemming: 'werf', project_id: '', werf_naam: '', tijd_start_rijden: '', tijd_stop_rijden: '', tijd_klaar_lossen: '', notitie: '', saved: false }])
      }
    }
    load()
  }, [selectedChauffeur, datum])

  const addRegel = () => {
    setRegels([...regels, { bestemming: 'werf', project_id: '', werf_naam: '', tijd_start_rijden: '', tijd_stop_rijden: '', tijd_klaar_lossen: '', notitie: '', saved: false }])
  }

  const updateRegel = (index, field, value) => {
    const updated = [...regels]
    updated[index] = { ...updated[index], [field]: value, saved: false }
    setRegels(updated)
  }

  const removeRegel = async (index) => {
    const regel = regels[index]
    if (regel.id) {
      try {
        await supabase.from('leveringen').delete().eq('id', regel.id)
      } catch (e) {
        alert('Fout: ' + e.message)
        return
      }
    }
    const remaining = regels.filter((_, i) => i !== index)
    setRegels(remaining.length > 0 ? remaining : [{ bestemming: 'werf', project_id: '', werf_naam: '', tijd_start_rijden: '', tijd_stop_rijden: '', tijd_klaar_lossen: '', notitie: '', saved: false }])
  }

  const saveEnkeleRegel = async (index) => {
    if (!selectedChauffeur) return
    const regel = regels[index]
    if (!regel.tijd_start_rijden || !regel.tijd_stop_rijden) {
      alert('Vul minstens start- en stoptijd rijden in')
      return
    }
    try {
      const data = {
        chauffeur: selectedChauffeur,
        datum: datum,
        bestemming: regel.bestemming,
        project_id: regel.project_id || null,
        werf_naam: regel.werf_naam || null,
        tijd_start_rijden: regel.tijd_start_rijden,
        tijd_stop_rijden: regel.tijd_stop_rijden,
        tijd_klaar_lossen: regel.tijd_klaar_lossen || null,
        notitie: regel.notitie || null
      }
      if (regel.id) {
        await supabase.from('leveringen').update(data).eq('id', regel.id)
      } else {
        const { data: created } = await supabase.from('leveringen').insert(data).select().single()
        if (created) regel.id = created.id
      }
      const updated = [...regels]
      updated[index] = { ...updated[index], saved: true }
      setRegels(updated)
      setToastMsg('Rit opgeslagen!')
    } catch (e) {
      alert('Fout bij opslaan: ' + e.message)
    }
  }

  const handleSaveAll = async () => {
    if (!selectedChauffeur) return
    setSaving(true)
    try {
      for (const regel of regels) {
        if (!regel.tijd_start_rijden || !regel.tijd_stop_rijden) continue
        const data = {
          chauffeur: selectedChauffeur,
          datum: datum,
          bestemming: regel.bestemming,
          project_id: regel.project_id || null,
          werf_naam: regel.werf_naam || null,
          tijd_start_rijden: regel.tijd_start_rijden,
          tijd_stop_rijden: regel.tijd_stop_rijden,
          tijd_klaar_lossen: regel.tijd_klaar_lossen || null,
          notitie: regel.notitie || null
        }
        if (regel.id) {
          await supabase.from('leveringen').update(data).eq('id', regel.id)
        } else {
          const { data: created } = await supabase.from('leveringen').insert(data).select().single()
          if (created) regel.id = created.id
        }
        regel.saved = true
      }
      setRegels([...regels])
      setToastMsg('Alle ritten opgeslagen!')
    } catch (e) {
      alert('Fout bij opslaan: ' + e.message)
    }
    setSaving(false)
  }

  // Overzicht laden
  const loadOverzicht = async () => {
    setOverzichtLoading(true)
    try {
      let query = supabase.from('leveringen').select('*').order('datum', { ascending: false })
      if (overzichtChauffeur) {
        query = query.eq('chauffeur', overzichtChauffeur)
      }
      if (overzichtPeriode === 'week') {
        const d = new Date()
        d.setDate(d.getDate() - 7)
        query = query.gte('datum', d.toISOString().split('T')[0])
      } else if (overzichtPeriode === 'maand') {
        const d = new Date()
        d.setDate(d.getDate() - 30)
        query = query.gte('datum', d.toISOString().split('T')[0])
      }
      const { data } = await query
      setOverzichtData(data || [])
    } catch (e) {
      console.error('Fout:', e)
    }
    setOverzichtLoading(false)
  }

  useEffect(() => {
    if (activeTab === 'overzicht') loadOverzicht()
  }, [activeTab, overzichtChauffeur, overzichtPeriode])

  // Overzicht berekeningen
  const overzichtStats = (() => {
    let totaalRitten = overzichtData.length
    let totaalRijMinuten = 0
    let totaalLosMinuten = 0
    let perChauffeur = {}
    let perBestemming = { werf: 0, tongeren: 0 }
    overzichtData.forEach(r => {
      const rijMin = calcMinuten(r.tijd_start_rijden, r.tijd_stop_rijden)
      const losMin = calcMinuten(r.tijd_stop_rijden, r.tijd_klaar_lossen)
      if (rijMin > 0) totaalRijMinuten += rijMin
      if (losMin > 0) totaalLosMinuten += losMin
      perChauffeur[r.chauffeur] = (perChauffeur[r.chauffeur] || 0) + 1
      perBestemming[r.bestemming] = (perBestemming[r.bestemming] || 0) + 1
    })
    return { totaalRitten, totaalRijMinuten, totaalLosMinuten, perChauffeur, perBestemming }
  })()

  // Group overzicht per datum
  const overzichtPerDatum = {}
  overzichtData.forEach(r => {
    if (!overzichtPerDatum[r.datum]) overzichtPerDatum[r.datum] = []
    overzichtPerDatum[r.datum].push(r)
  })

  // Calendar helpers (using shared utilities)
  const calendarDays = buildCalendarDays(calendarMonth, dagenMetRitten, 'ritten')
  const calendarMonthLabel = getCalendarMonthLabel(calendarMonth)
  const prevMonth = () => setCalendarMonth(getPrevMonth(calendarMonth))
  const nextMonth = () => setCalendarMonth(getNextMonth(calendarMonth))

  // Totalen voor de dag
  const dagTotaalRijMinuten = regels.reduce((sum, r) => {
    const min = calcMinuten(r.tijd_start_rijden, r.tijd_stop_rijden)
    return sum + (min > 0 ? min : 0)
  }, 0)
  const dagTotaalLosMinuten = regels.reduce((sum, r) => {
    const min = calcMinuten(r.tijd_stop_rijden, r.tijd_klaar_lossen)
    return sum + (min > 0 ? min : 0)
  }, 0)

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">🚚 Transport & Leveringen</h2>
          <p className="text-sm text-gray-500 mt-1">Registreer ritten en leveringen per chauffeur</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl">
        {[
          { id: 'invoer', icon: '✏️', label: 'Invoer' },
          { id: 'overzicht', icon: '📊', label: 'Overzicht' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'invoer' && (
      <>
      <div className="bg-white rounded-xl border shadow-sm p-5 mb-4">
        <div className="flex flex-wrap gap-4 items-end mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Datum</label>
            <div className="relative">
              <button
                onClick={() => document.getElementById('transport-datum-picker').showPicker()}
                className="border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white hover:bg-gray-50 cursor-pointer flex items-center gap-2"
              >
                📅 {datum ? `${datum.split('-')[2]}/${datum.split('-')[1]}/${datum.split('-')[0]}` : 'Kies datum'}
              </button>
              <input
                id="transport-datum-picker"
                type="date"
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
                tabIndex={-1}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Chauffeur</label>
            <div className="flex gap-2">
              {chauffeurs.map(c => (
                <button
                  key={c}
                  onClick={() => setSelectedChauffeur(c)}
                  className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                    selectedChauffeur === c
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  🚗 {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {selectedChauffeur && (
        <div className="bg-white rounded-xl border shadow-sm p-5 mb-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-semibold text-gray-800">🚗 {selectedChauffeur}</h3>
              <p className="text-sm text-gray-500">{new Date(datum).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm font-bold text-blue-600">🛣️ {formatMinuten(dagTotaalRijMinuten)}</div>
                <div className="text-xs text-gray-400">rijtijd</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-amber-600">📦 {formatMinuten(dagTotaalLosMinuten)}</div>
                <div className="text-xs text-gray-400">lostijd</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-gray-700">{regels.filter(r => r.tijd_start_rijden).length}</div>
                <div className="text-xs text-gray-400">ritten</div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {regels.map((regel, index) => {
              const rijMinuten = calcMinuten(regel.tijd_start_rijden, regel.tijd_stop_rijden)
              const losMinuten = calcMinuten(regel.tijd_stop_rijden, regel.tijd_klaar_lossen)
              return (
                <div key={index} className={`p-3 rounded-xl border-2 transition-colors ${
                  regel.saved ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex flex-wrap gap-2 items-center mb-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() => updateRegel(index, 'bestemming', 'werf')}
                        className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors border ${
                          regel.bestemming === 'werf'
                            ? 'bg-orange-500 text-white border-orange-500'
                            : 'bg-white text-gray-600 border-gray-300 hover:bg-orange-50'
                        }`}
                      >🏗️ Werf</button>
                      <button
                        onClick={() => updateRegel(index, 'bestemming', 'tongeren')}
                        className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors border ${
                          regel.bestemming === 'tongeren'
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-white text-gray-600 border-gray-300 hover:bg-blue-50'
                        }`}
                      >🏠 Tongeren</button>
                    </div>

                    <select
                      value={regel.project_id}
                      onChange={(e) => updateRegel(index, 'project_id', e.target.value)}
                      className="border rounded-lg px-2 py-2 text-sm min-w-36 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">Project (opt.)...</option>
                      {projecten.map(p => <option key={p.id} value={p.id}>{p.emoji || ''} {p.naam || p.project_nummer}</option>)}
                    </select>

                    {regel.bestemming === 'werf' && (
                      <input
                        type="text"
                        value={regel.werf_naam}
                        onChange={(e) => updateRegel(index, 'werf_naam', e.target.value)}
                        placeholder="Werf naam..."
                        className="border rounded-lg px-2 py-2 text-sm w-36 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    )}

                    <div className="flex items-center gap-1 ml-auto">
                      {!regel.saved && (
                        <button onClick={() => saveEnkeleRegel(index)} className="px-2 py-2 text-sm bg-blue-50 text-blue-500 border border-blue-200 rounded-lg hover:bg-blue-100 hover:text-blue-700 transition-colors" title="Deze rit opslaan">💾</button>
                      )}
                      <button onClick={() => removeRegel(index)} className="px-2 py-2 text-sm bg-red-50 text-red-400 border border-red-200 rounded-lg hover:bg-red-100 hover:text-red-600 transition-colors">✕</button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 items-center">
                    <div>
                      <label className="block text-[10px] font-medium text-gray-400 mb-0.5">Start rijden</label>
                      <input
                        type="time"
                        value={regel.tijd_start_rijden}
                        onChange={(e) => updateRegel(index, 'tijd_start_rijden', e.target.value)}
                        className="border rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-gray-400 mb-0.5">Stop rijden</label>
                      <input
                        type="time"
                        value={regel.tijd_stop_rijden}
                        onChange={(e) => updateRegel(index, 'tijd_stop_rijden', e.target.value)}
                        className="border rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-gray-400 mb-0.5">Klaar lossen</label>
                      <input
                        type="time"
                        value={regel.tijd_klaar_lossen}
                        onChange={(e) => updateRegel(index, 'tijd_klaar_lossen', e.target.value)}
                        className="border rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>

                    {rijMinuten !== null && rijMinuten >= 0 && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5">
                        <div className="text-[10px] text-blue-500">Rijtijd</div>
                        <div className="text-sm font-bold text-blue-700">{formatMinuten(rijMinuten)}</div>
                      </div>
                    )}
                    {losMinuten !== null && losMinuten >= 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                        <div className="text-[10px] text-amber-500">Lostijd</div>
                        <div className="text-sm font-bold text-amber-700">{formatMinuten(losMinuten)}</div>
                      </div>
                    )}
                    {rijMinuten !== null && rijMinuten >= 0 && losMinuten !== null && losMinuten >= 0 && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
                        <div className="text-[10px] text-gray-500">Totaal</div>
                        <div className="text-sm font-bold text-gray-700">{formatMinuten(rijMinuten + losMinuten)}</div>
                      </div>
                    )}

                    <input
                      type="text"
                      value={regel.notitie}
                      onChange={(e) => updateRegel(index, 'notitie', e.target.value)}
                      placeholder="Notitie..."
                      className="border rounded-lg px-2 py-2 text-sm flex-1 min-w-32 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex justify-between items-center mt-4 pt-4 border-t">
            <button onClick={addRegel} className="px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
              + Rit toevoegen
            </button>
            <button onClick={handleSaveAll} disabled={saving} className="px-8 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 font-semibold shadow-sm transition-colors">
              {saving ? 'Opslaan...' : '💾 Alles opslaan'}
            </button>
          </div>
        </div>
      )}

      {/* Kalender */}
      {selectedChauffeur && (
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <div className="flex justify-between items-center mb-4">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">◀</button>
            <h3 className="font-semibold text-gray-700 capitalize">{calendarMonthLabel}</h3>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">▶</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 mb-2">
            {['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map(d => <div key={d} className="py-1 font-medium">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, i) => day ? (
              <button
                key={i}
                onClick={() => setDatum(day.date)}
                className={`p-2 rounded-lg text-sm transition-all relative ${
                  day.date === datum
                    ? 'bg-blue-600 text-white font-bold shadow-sm'
                    : day.date === new Date().toISOString().split('T')[0]
                    ? 'bg-blue-50 text-blue-700 font-medium ring-2 ring-blue-300'
                    : 'hover:bg-gray-100'
                }`}
              >
                <div>{day.day}</div>
                {day.ritten > 0 && day.date !== datum && (
                  <div className="text-[10px] font-medium text-orange-600">{day.ritten}x</div>
                )}
                {day.ritten > 0 && day.date === datum && (
                  <div className="text-[10px] font-medium text-blue-200">{day.ritten}x</div>
                )}
                {day.ritten === 0 && <div className="text-[10px] text-transparent">-</div>}
              </button>
            ) : <div key={i} />)}
          </div>
          <div className="mt-3 pt-3 border-t flex justify-between text-xs text-gray-500">
            <span>Totaal deze maand: <strong className="text-gray-700">{Object.values(dagenMetRitten).reduce((s, n) => s + n, 0)} ritten</strong></span>
            <span>{Object.keys(dagenMetRitten).length} dagen gereden</span>
          </div>
        </div>
      )}

      {!selectedChauffeur && (
        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border shadow-sm">
          <div className="text-4xl mb-3">🚗</div>
          <p className="font-medium">Selecteer een chauffeur om ritten in te vullen</p>
        </div>
      )}
      </>
      )}

      {activeTab === 'overzicht' && (
        <div>
          <div className="bg-white rounded-xl border shadow-sm p-5 mb-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Chauffeur</label>
                <select
                  value={overzichtChauffeur}
                  onChange={(e) => setOverzichtChauffeur(e.target.value)}
                  className="border rounded-lg px-3 py-2.5 text-sm min-w-40 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">Alle chauffeurs</option>
                  {chauffeurs.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Periode</label>
                <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                  {[
                    { id: 'week', label: '7 dagen' },
                    { id: 'maand', label: '30 dagen' },
                    { id: 'alles', label: 'Alles' }
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setOverzichtPeriode(f.id)}
                      className={`px-3 py-1.5 text-sm rounded-md transition-all ${overzichtPeriode === f.id ? 'bg-white text-blue-700 shadow-sm font-medium' : 'text-gray-600 hover:text-gray-800'}`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {overzichtLoading && <LoadingSpinner />}

          {!overzichtLoading && overzichtData.length > 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200 p-5 text-center">
                  <div className="text-3xl font-bold text-blue-700">{overzichtStats.totaalRitten}</div>
                  <div className="text-xs font-medium text-blue-600 mt-1">Totaal ritten</div>
                </div>
                <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl border border-indigo-200 p-5 text-center">
                  <div className="text-3xl font-bold text-indigo-700">{formatMinuten(overzichtStats.totaalRijMinuten)}</div>
                  <div className="text-xs font-medium text-indigo-600 mt-1">Totaal rijtijd</div>
                </div>
                <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl border border-amber-200 p-5 text-center">
                  <div className="text-3xl font-bold text-amber-700">{formatMinuten(overzichtStats.totaalLosMinuten)}</div>
                  <div className="text-xs font-medium text-amber-600 mt-1">Totaal lostijd</div>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl border border-green-200 p-5 text-center">
                  <div className="text-3xl font-bold text-green-700">{formatMinuten(overzichtStats.totaalRijMinuten + overzichtStats.totaalLosMinuten)}</div>
                  <div className="text-xs font-medium text-green-600 mt-1">Totale tijd</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border shadow-sm p-5">
                  <div className="text-xs font-medium text-gray-500 mb-3">Per chauffeur</div>
                  <div className="space-y-2">
                    {Object.entries(overzichtStats.perChauffeur).sort((a, b) => b[1] - a[1]).map(([naam, aantal]) => (
                      <div key={naam} className="flex justify-between items-center text-sm">
                        <span className="text-gray-700">🚗 {naam}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min((aantal / overzichtStats.totaalRitten) * 100, 100)}%` }} />
                          </div>
                          <span className="font-semibold text-gray-700 w-16 text-right">{aantal} ritten</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white rounded-xl border shadow-sm p-5">
                  <div className="text-xs font-medium text-gray-500 mb-3">Per bestemming</div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-700">🏗️ Werf</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-orange-500 rounded-full" style={{ width: `${overzichtStats.totaalRitten > 0 ? Math.min((overzichtStats.perBestemming.werf / overzichtStats.totaalRitten) * 100, 100) : 0}%` }} />
                        </div>
                        <span className="font-semibold text-gray-700 w-16 text-right">{overzichtStats.perBestemming.werf || 0}</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-700">🏠 Tongeren</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${overzichtStats.totaalRitten > 0 ? Math.min((overzichtStats.perBestemming.tongeren / overzichtStats.totaalRitten) * 100, 100) : 0}%` }} />
                        </div>
                        <span className="font-semibold text-gray-700 w-16 text-right">{overzichtStats.perBestemming.tongeren || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="bg-gray-50 px-5 py-3 font-semibold text-sm text-gray-700 border-b">Detail per dag</div>
                <div className="divide-y">
                  {Object.entries(overzichtPerDatum).sort((a, b) => b[0].localeCompare(a[0])).map(([dag, items]) => {
                    const dagRijMin = items.reduce((s, r) => { const m = calcMinuten(r.tijd_start_rijden, r.tijd_stop_rijden); return s + (m > 0 ? m : 0) }, 0)
                    const dagLosMin = items.reduce((s, r) => { const m = calcMinuten(r.tijd_stop_rijden, r.tijd_klaar_lossen); return s + (m > 0 ? m : 0) }, 0)
                    return (
                      <div key={dag} className="px-4 py-3">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-medium text-sm">{new Date(dag).toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          <div className="flex gap-3 text-xs">
                            <span className="text-blue-600 font-semibold">🛣️ {formatMinuten(dagRijMin)}</span>
                            <span className="text-amber-600 font-semibold">📦 {formatMinuten(dagLosMin)}</span>
                            <span className="text-gray-500">{items.length} ritten</span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          {items.map(r => {
                            const pNaam = projecten.find(p => p.id === r.project_id)
                            const rijMin = calcMinuten(r.tijd_start_rijden, r.tijd_stop_rijden)
                            return (
                              <div key={r.id} className="flex items-center gap-2 text-xs text-gray-600">
                                <span className="bg-gray-100 px-2 py-0.5 rounded">{r.chauffeur}</span>
                                <span className={`px-1.5 py-0.5 rounded text-xs ${r.bestemming === 'werf' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                                  {r.bestemming === 'werf' ? '🏗️ Werf' : '🏠 Tongeren'}
                                </span>
                                {r.werf_naam && <span className="text-gray-500">{r.werf_naam}</span>}
                                {pNaam && <span className="text-gray-400">{pNaam.emoji} {pNaam.naam}</span>}
                                <span className="text-gray-400">—</span>
                                <span>{r.tijd_start_rijden?.slice(0,5)} → {r.tijd_stop_rijden?.slice(0,5)}</span>
                                {r.tijd_klaar_lossen && <span>→ {r.tijd_klaar_lossen.slice(0,5)}</span>}
                                {rijMin > 0 && <span className="text-blue-500 font-medium">{formatMinuten(rijMin)}</span>}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {!overzichtLoading && overzichtData.length === 0 && (
            <div className="text-center py-16 text-gray-400 bg-white rounded-xl border shadow-sm">
              <div className="text-4xl mb-3">📭</div>
              <p className="font-medium">Geen ritten gevonden voor deze periode</p>
            </div>
          )}
        </div>
      )}

      {toastMsg && <Toast message={toastMsg} onDone={() => setToastMsg(null)} />}
    </div>
  )
}
