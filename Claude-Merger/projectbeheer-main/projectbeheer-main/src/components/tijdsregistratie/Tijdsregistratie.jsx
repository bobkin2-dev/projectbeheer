import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase'
import { typeWerkOpties } from '../../config/constants'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { Toast } from '../ui/Toast'
import { MedewerkerBeheer } from './MedewerkerBeheer'
import { ProjectAanmaakModal } from '../projects/ProjectAanmaakModal'
import { OrderProducten } from '../orders/OrderProducten'
import { buildCalendarDays, getCalendarMonthLabel, getPrevMonth, getNextMonth, getInitialCalendarMonth } from '../../utils/calendar'

export const Tijdsregistratie = ({ projecten: projectenProp, medewerkers, onRefresh }) => {
  const [activeTab, setActiveTab] = useState('invoer') // 'invoer', 'overzicht', 'nacalculatie'
  const [datum, setDatum] = useState(new Date().toISOString().split('T')[0])
  const [selectedMedewerker, setSelectedMedewerker] = useState(null)
  const [regels, setRegels] = useState([])
  const [allOrders, setAllOrders] = useState([])
  const [saving, setSaving] = useState(false)
  const [toastMsg, setToastMsg] = useState(null)
  const [showBeheer, setShowBeheer] = useState(false)
  const [showProjectModal, setShowProjectModal] = useState(false)
  const [projectModalRegelIndex, setProjectModalRegelIndex] = useState(null)
  const [extraProjecten, setExtraProjecten] = useState([]) // lokaal toegevoegde projecten (voor onmiddellijke zichtbaarheid)

  // Merge prop-projecten met lokaal toegevoegde (dedupliceer op id)
  const projecten = [...projectenProp, ...extraProjecten.filter(ep => !projectenProp.find(p => p.id === ep.id))]
  const [nieuwOrderNaam, setNieuwOrderNaam] = useState('')
  const [aanmakenOrder, setAanmakenOrder] = useState(null) // regelIndex
  const [showVerplaatsModal, setShowVerplaatsModal] = useState(false)
  const [verplaatsDatum, setVerplaatsDatum] = useState('')
  // Calendar state
  const [calendarMonth, setCalendarMonth] = useState(getInitialCalendarMonth)
  const [dagenMetUren, setDagenMetUren] = useState({}) // { '2026-02-18': 6.5, ... }
  // Overzicht state
  const [overzichtProject, setOverzichtProject] = useState('')
  const [overzichtOrder, setOverzichtOrder] = useState('')
  const [overzichtData, setOverzichtData] = useState([])
  const [overzichtLoading, setOverzichtLoading] = useState(false)
  // Nacalculatie state
  const [nacalcProject, setNacalcProject] = useState('')
  const [nacalcOrders, setNacalcOrders] = useState([])
  const [nacalcLoading, setNacalcLoading] = useState(false)
  const [nacalcFilter, setNacalcFilter] = useState('alle') // 'alle', 'open', 'klaar'

  // Load all orders
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('orders').select('*')
      setAllOrders(data || [])
    }
    load()
  }, [projecten])

  // Load calendar data: which days have uren for selected medewerker
  useEffect(() => {
    if (!selectedMedewerker) return
    const loadCalendar = async () => {
      const [year, month] = calendarMonth.split('-').map(Number)
      const startDatum = `${year}-${String(month).padStart(2, '0')}-01`
      const endDatum = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`
      const { data } = await supabase.from('uren_registratie')
        .select('datum, uren')
        .eq('medewerker_id', selectedMedewerker.id)
        .gte('datum', startDatum)
        .lte('datum', endDatum)
      const perDag = {}
      ;(data || []).forEach(r => {
        perDag[r.datum] = (perDag[r.datum] || 0) + r.uren
      })
      setDagenMetUren(perDag)
    }
    loadCalendar()
  }, [selectedMedewerker, calendarMonth, regels])

  // Load existing registrations when medewerker or datum changes
  useEffect(() => {
    if (!selectedMedewerker) return
    const load = async () => {
      const { data } = await supabase.from('uren_registratie')
        .select('*')
        .eq('medewerker_id', selectedMedewerker.id)
        .eq('datum', datum)
        .order('created_at')
      if (data && data.length > 0) {
        setRegels(data.map(r => ({
          id: r.id,
          uren: r.uren,
          project_id: r.project_id,
          order_id: r.order_id,
          type_werk: r.type_werk || 'overig',
          notitie: r.notitie || '',
          saved: true
        })))
      } else {
        setRegels([{ uren: '', project_id: '', order_id: '', type_werk: 'overig', notitie: '', saved: false }])
      }
    }
    load()
  }, [selectedMedewerker, datum])

  const addRegel = () => {
    setRegels([...regels, { uren: '', project_id: '', order_id: '', type_werk: 'overig', notitie: '', saved: false }])
  }

  const updateRegel = (index, field, value) => {
    const updated = [...regels]
    updated[index] = { ...updated[index], [field]: value, saved: false }
    if (field === 'project_id') {
      updated[index].order_id = '' // reset order when project changes
    }
    setRegels(updated)
  }

  const removeRegel = async (index) => {
    const regel = regels[index]
    if (regel.id) {
      try {
        await supabase.from('uren_registratie').delete().eq('id', regel.id)
      } catch (e) {
        alert('Fout: ' + e.message)
        return
      }
    }
    setRegels(regels.filter((_, i) => i !== index))
  }

  const saveEnkeleRegel = async (index) => {
    if (!selectedMedewerker) return
    const regel = regels[index]
    if (!regel.uren || !regel.project_id || !regel.order_id) {
      alert('Vul uren, project en order in')
      return
    }
    try {
      const data = {
        medewerker_id: selectedMedewerker.id,
        datum: datum,
        project_id: regel.project_id,
        order_id: regel.order_id,
        type_werk: regel.type_werk,
        uren: parseFloat(regel.uren),
        notitie: regel.notitie || null
      }
      if (regel.id) {
        await supabase.from('uren_registratie').update(data).eq('id', regel.id)
      } else {
        const { data: created } = await supabase.from('uren_registratie').insert(data).select().single()
        if (created) regel.id = created.id
      }
      const updated = [...regels]
      updated[index] = { ...updated[index], saved: true }
      if (index === updated.length - 1) {
        updated.push({ uren: '', project_id: '', order_id: '', type_werk: 'overig', notitie: '', saved: false })
      }
      setRegels(updated)
      setToastMsg('Uren opgeslagen!')
    } catch (e) {
      alert('Fout bij opslaan: ' + e.message)
    }
  }

  const handleSave = async () => {
    if (!selectedMedewerker) return
    setSaving(true)

    try {
      for (const regel of regels) {
        if (!regel.uren || !regel.project_id || !regel.order_id) continue

        const data = {
          medewerker_id: selectedMedewerker.id,
          datum: datum,
          project_id: regel.project_id,
          order_id: regel.order_id,
          type_werk: regel.type_werk,
          uren: parseFloat(regel.uren),
          notitie: regel.notitie || null
        }

        if (regel.id) {
          await supabase.from('uren_registratie').update(data).eq('id', regel.id)
        } else {
          const { data: created } = await supabase.from('uren_registratie').insert(data).select().single()
          if (created) regel.id = created.id
        }
        regel.saved = true
      }

      setRegels([...regels])
      setToastMsg('Uren opgeslagen!')
    } catch (e) {
      alert('Fout bij opslaan: ' + e.message)
    }
    setSaving(false)
  }

  const kopieerVorigeDag = async () => {
    if (!selectedMedewerker) return
    const vorigeDag = new Date(datum)
    vorigeDag.setDate(vorigeDag.getDate() - 1)
    const vorigeDatum = vorigeDag.toISOString().split('T')[0]
    const { data } = await supabase.from('uren_registratie')
      .select('*')
      .eq('medewerker_id', selectedMedewerker.id)
      .eq('datum', vorigeDatum)
    if (!data || data.length === 0) {
      alert('Geen uren gevonden voor ' + vorigeDag.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' }))
      return
    }
    setRegels(data.map(r => ({
      uren: r.uren,
      project_id: r.project_id,
      order_id: r.order_id,
      type_werk: r.type_werk || 'overig',
      notitie: r.notitie || '',
      saved: false
    })))
  }

  const verplaatsUren = async () => {
    if (!selectedMedewerker || !verplaatsDatum) return
    if (verplaatsDatum === datum) { alert('Kies een andere datum dan de huidige'); return }
    const opgeslagenRegels = regels.filter(r => r.id)
    if (opgeslagenRegels.length === 0) { alert('Er zijn geen opgeslagen uren om te verplaatsen'); return }
    const nieuweDatumFormatted = `${verplaatsDatum.split('-')[2]}/${verplaatsDatum.split('-')[1]}/${verplaatsDatum.split('-')[0]}`
    if (!confirm(`Alle ${opgeslagenRegels.length} uren-registraties verplaatsen naar ${nieuweDatumFormatted}?`)) return
    try {
      const ids = opgeslagenRegels.map(r => r.id)
      await supabase.from('uren_registratie').update({ datum: verplaatsDatum }).in('id', ids)
      setShowVerplaatsModal(false)
      setVerplaatsDatum('')
      // Navigeer naar de nieuwe datum om de verplaatste uren te zien
      setDatum(verplaatsDatum)
    } catch (e) {
      alert('Fout bij verplaatsen: ' + e.message)
    }
  }

  const handleProjectCreated = (created) => {
    // Direct lokaal toevoegen zodat het meteen in de dropdown zichtbaar is
    setExtraProjecten(prev => [...prev, created])
    // Modal sluiten
    setShowProjectModal(false)
    // Project_id op de juiste regel zetten (als getriggerd vanuit uren invoer)
    if (projectModalRegelIndex !== null) {
      updateRegel(projectModalRegelIndex, 'project_id', created.id)
      setProjectModalRegelIndex(null)
    }
    // NIET onRefresh() aanroepen! Dat zet loading=true waardoor hele app unmount
    // en alle invoer verloren gaat. Het project is al lokaal beschikbaar via extraProjecten.
  }

  const createInlineOrder = async (regelIndex) => {
    if (!nieuwOrderNaam.trim()) return
    const regel = regels[regelIndex]
    if (!regel.project_id) { alert('Selecteer eerst een project'); return }
    try {
      const { data: created } = await supabase.from('orders').insert({
        project_id: regel.project_id,
        naam: nieuwOrderNaam.trim(),
        added_from: 'tijdsregistratie'
      }).select().single()
      if (created) {
        setAllOrders([...allOrders, created])
        updateRegel(regelIndex, 'order_id', created.id)
      }
      setNieuwOrderNaam('')
      setAanmakenOrder(null)
    } catch (e) {
      alert('Fout: ' + e.message)
    }
  }

  const totaalUren = regels.reduce((sum, r) => sum + (parseFloat(r.uren) || 0), 0)

  const ordersVoorProject = (projectId) => allOrders.filter(o => o.project_id === projectId)

  const loadOverzicht = async () => {
    if (!overzichtProject) return
    setOverzichtLoading(true)
    try {
      let query = supabase.from('uren_registratie').select('*').eq('project_id', overzichtProject).order('datum', { ascending: false })
      if (overzichtOrder) {
        query = query.eq('order_id', overzichtOrder)
      }
      const { data } = await query
      setOverzichtData(data || [])
    } catch (e) {
      console.error('Fout:', e)
    }
    setOverzichtLoading(false)
  }

  useEffect(() => {
    if (activeTab === 'overzicht' && overzichtProject) {
      loadOverzicht()
    }
  }, [overzichtProject, overzichtOrder, activeTab])

  // Nacalculatie: load orders per project with uren count
  const loadNacalculatie = async (projectId) => {
    if (!projectId) return
    setNacalcLoading(true)
    try {
      const { data: orders } = await supabase.from('orders').select('*').eq('project_id', projectId)
      // For each order, get total uren and producten count
      const ordersMetData = await Promise.all((orders || []).map(async (order) => {
        const { data: urenData } = await supabase.from('uren_registratie').select('uren').eq('order_id', order.id)
        const { data: productenData } = await supabase.from('order_producten').select('id').eq('order_id', order.id)
        const totaalUren = (urenData || []).reduce((sum, r) => sum + r.uren, 0)
        return {
          ...order,
          totaal_uren: totaalUren,
          aantal_registraties: (urenData || []).length,
          aantal_producten: (productenData || []).length
        }
      }))
      setNacalcOrders(ordersMetData)
    } catch (e) {
      console.error('Fout:', e)
    }
    setNacalcLoading(false)
  }

  useEffect(() => {
    if (activeTab === 'nacalculatie' && nacalcProject) {
      loadNacalculatie(nacalcProject)
    }
  }, [nacalcProject, activeTab])

  const toggleNacalcStatus = async (orderId, field) => {
    const order = nacalcOrders.find(o => o.id === orderId)
    if (!order) return
    const newValue = !order[field]
    try {
      await supabase.from('orders').update({ [field]: newValue }).eq('id', orderId)
      setNacalcOrders(nacalcOrders.map(o => o.id === orderId ? { ...o, [field]: newValue } : o))
    } catch (e) {
      alert('Fout: ' + e.message)
    }
  }

  // Only show orders that actually have hour registrations
  const nacalcOrdersMetUren = nacalcOrders.filter(o => o.aantal_registraties > 0)

  const nacalcGefilterdeOrders = nacalcOrdersMetUren.filter(o => {
    if (nacalcFilter === 'open') return !o.nacalculatie_klaar
    if (nacalcFilter === 'klaar') return o.nacalculatie_klaar
    return true
  })

  // Group overzicht data
  const overzichtPerMedewerker = {}
  const overzichtPerTypeWerk = {}
  let overzichtTotaal = 0
  overzichtData.forEach(r => {
    const mNaam = medewerkers.find(m => m.id === r.medewerker_id)?.naam || 'Onbekend'
    overzichtPerMedewerker[mNaam] = (overzichtPerMedewerker[mNaam] || 0) + r.uren
    overzichtPerTypeWerk[r.type_werk || 'overig'] = (overzichtPerTypeWerk[r.type_werk || 'overig'] || 0) + r.uren
    overzichtTotaal += r.uren
  })

  // Group by date
  const overzichtPerDatum = {}
  overzichtData.forEach(r => {
    if (!overzichtPerDatum[r.datum]) overzichtPerDatum[r.datum] = []
    overzichtPerDatum[r.datum].push(r)
  })

  // Calendar helper
  const calendarDays = buildCalendarDays(calendarMonth, dagenMetUren, 'uren')

  const calendarMonthLabel = getCalendarMonthLabel(calendarMonth)

  const prevMonth = () => setCalendarMonth(getPrevMonth(calendarMonth))

  const nextMonth = () => setCalendarMonth(getNextMonth(calendarMonth))

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">⏱️ Tijdsregistratie</h2>
          <p className="text-sm text-gray-500 mt-1">Registreer en beheer werkuren per medewerker</p>
        </div>
        <button
          onClick={() => setShowBeheer(!showBeheer)}
          className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200 transition-colors flex items-center gap-2"
        >
          👷 Medewerkers beheren
        </button>
      </div>

      {showBeheer && <MedewerkerBeheer medewerkers={medewerkers} onRefresh={onRefresh} />}

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl">
        {[
          { id: 'invoer', icon: '✏️', label: 'Invoer' },
          { id: 'overzicht', icon: '📊', label: 'Overzicht' },
          { id: 'nacalculatie', icon: '✅', label: 'Nacalculatie' }
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
                onClick={() => document.getElementById('datum-picker-hidden').showPicker()}
                className="border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white hover:bg-gray-50 cursor-pointer flex items-center gap-2"
              >
                📅 {datum ? `${datum.split('-')[2]}/${datum.split('-')[1]}/${datum.split('-')[0]}` : 'Kies datum'}
              </button>
              <input
                id="datum-picker-hidden"
                type="date"
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
                className="absolute inset-0 opacity-0 pointer-events-none"
                tabIndex={-1}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Medewerker</label>
            <select
              value={selectedMedewerker?.id || ''}
              onChange={(e) => {
                const m = medewerkers.find(m => m.id === e.target.value)
                setSelectedMedewerker(m || null)
              }}
              className="border rounded-lg px-3 py-2.5 text-sm min-w-48 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">-- Kies medewerker --</option>
              {medewerkers.map(m => (
                <option key={m.id} value={m.id}>{m.naam}</option>
              ))}
            </select>
          </div>
          {selectedMedewerker && (
            <div className="flex gap-2">
              <button
                onClick={kopieerVorigeDag}
                className="px-4 py-2.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-sm hover:bg-amber-100 transition-colors"
                title="Kopieer de uren van gisteren als template"
              >
                📋 Kopieer gisteren
              </button>
              <button
                onClick={() => { setVerplaatsDatum(''); setShowVerplaatsModal(true) }}
                className="px-4 py-2.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-sm hover:bg-purple-100 transition-colors"
                title="Verplaats alle uren van deze dag naar een andere dag"
              >
                📅 Verplaats dag
              </button>
            </div>
          )}
        </div>
      </div>

      {showVerplaatsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowVerplaatsModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-1">📅 Uren verplaatsen</h3>
            <p className="text-sm text-gray-500 mb-4">
              Verplaats alle {regels.filter(r => r.id).length} opgeslagen uren van <strong>{datum.split('-')[2]}/{datum.split('-')[1]}/{datum.split('-')[0]}</strong> naar een andere dag.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nieuwe datum</label>
              <input
                type="date"
                value={verplaatsDatum}
                onChange={(e) => setVerplaatsDatum(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                autoFocus
              />
              {verplaatsDatum && (
                <p className="text-xs text-gray-400 mt-1">→ {verplaatsDatum.split('-')[2]}/{verplaatsDatum.split('-')[1]}/{verplaatsDatum.split('-')[0]}</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowVerplaatsModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Annuleren</button>
              <button onClick={verplaatsUren} disabled={!verplaatsDatum} className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
                Verplaatsen
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedMedewerker && (
        <div className="bg-white rounded-xl border shadow-sm p-5 mb-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-semibold text-gray-800">{selectedMedewerker.naam}</h3>
              <p className="text-sm text-gray-500">{new Date(datum).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-600">{totaalUren}u</div>
                <div className="text-xs text-gray-400">totaal</div>
              </div>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${
                totaalUren >= 8 ? 'bg-green-100 text-green-600' : totaalUren > 0 ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-400'
              }`}>
                {totaalUren >= 8 ? '✓' : totaalUren > 0 ? '◔' : '○'}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {regels.map((regel, index) => (
              <div key={index} className={`p-3 rounded-xl border-2 transition-colors ${
                regel.saved ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="flex items-center gap-1">
                    <div className="relative">
                      <input
                        type="number"
                        value={regel.uren}
                        onChange={(e) => updateRegel(index, 'uren', e.target.value)}
                        placeholder="0"
                        className="w-20 border rounded-lg px-2 py-2 text-sm text-right font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        step="0.25"
                        min="0"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">u</span>
                    </div>
                    {[{ label: "+15'", val: 0.25 }, { label: "+30'", val: 0.5 }, { label: '+1u', val: 1 }].map(b => (
                      <button key={b.label} onClick={() => updateRegel(index, 'uren', (parseFloat(regel.uren) || 0) + b.val)}
                        className="px-2 py-2 text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                      >{b.label}</button>
                    ))}
                  </div>

                  <select value={regel.project_id} onChange={(e) => { if (e.target.value === '__nieuw__') { setProjectModalRegelIndex(index); setShowProjectModal(true) } else { updateRegel(index, 'project_id', e.target.value) } }} className="border rounded-lg px-2 py-2 text-sm min-w-40 focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">Project...</option>
                    {projecten.map(p => <option key={p.id} value={p.id}>{p.emoji || ''} {p.naam || p.project_nummer}</option>)}
                    <option value="__nieuw__">+ Nieuw project</option>
                  </select>

                  {aanmakenOrder === index ? (
                    <div className="flex gap-1 items-center">
                      <input type="text" value={nieuwOrderNaam} onChange={(e) => setNieuwOrderNaam(e.target.value)} placeholder="Order naam..." className="border rounded-lg px-2 py-2 text-sm w-40" autoFocus onKeyDown={(e) => e.key === 'Enter' && createInlineOrder(index)} />
                      <button onClick={() => createInlineOrder(index)} className="px-2 py-2 bg-green-600 text-white rounded-lg text-sm">✓</button>
                      <button onClick={() => setAanmakenOrder(null)} className="px-2 py-2 bg-gray-300 rounded-lg text-sm">✕</button>
                    </div>
                  ) : (
                    <select value={regel.order_id} onChange={(e) => { if (e.target.value === '__nieuw__') { setAanmakenOrder(index) } else { updateRegel(index, 'order_id', e.target.value) } }} className="border rounded-lg px-2 py-2 text-sm min-w-40 focus:ring-2 focus:ring-blue-500 outline-none" disabled={!regel.project_id}>
                      <option value="">Order...</option>
                      {ordersVoorProject(regel.project_id).map(o => <option key={o.id} value={o.id}>{o.naam}</option>)}
                      <option value="__nieuw__">+ Nieuwe order</option>
                    </select>
                  )}

                  <div className="flex gap-1">
                    {typeWerkOpties.map(tw => (
                      <button key={tw} onClick={() => updateRegel(index, 'type_werk', tw)} className={`px-2.5 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                        regel.type_werk === tw
                          ? tw === 'onderdelen' ? 'bg-blue-600 text-white' : tw === 'monteren' ? 'bg-emerald-600 text-white' : tw === 'inpakken' ? 'bg-amber-500 text-white' : 'bg-gray-600 text-white'
                          : 'bg-white border hover:bg-gray-100'
                      }`}>
                        {tw}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1 ml-auto">
                    {!regel.saved && (
                      <button onClick={() => saveEnkeleRegel(index)} className="px-2 py-2 text-sm bg-blue-50 text-blue-500 border border-blue-200 rounded-lg hover:bg-blue-100 hover:text-blue-700 transition-colors" title="Deze regel opslaan">💾</button>
                    )}
                    <button onClick={() => removeRegel(index)} className="px-2 py-2 text-sm bg-red-50 text-red-400 border border-red-200 rounded-lg hover:bg-red-100 hover:text-red-600 transition-colors">✕</button>
                  </div>
                </div>

                {regel.order_id && <OrderProducten orderId={regel.order_id} />}
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center mt-4 pt-4 border-t">
            <button onClick={addRegel} className="px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
              + Regel toevoegen
            </button>
            <button onClick={handleSave} disabled={saving} className="px-8 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 font-semibold shadow-sm transition-colors">
              {saving ? 'Opslaan...' : '💾 Opslaan'}
            </button>
          </div>
        </div>
      )}

      {/* Kalender */}
      {selectedMedewerker && (
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
                {day.uren > 0 && day.date !== datum && (
                  <div className={`text-[10px] font-medium ${day.uren >= 8 ? 'text-green-600' : 'text-amber-600'}`}>{day.uren}u</div>
                )}
                {day.uren > 0 && day.date === datum && (
                  <div className="text-[10px] font-medium text-blue-200">{day.uren}u</div>
                )}
                {day.uren === 0 && <div className="text-[10px] text-transparent">-</div>}
              </button>
            ) : <div key={i} />)}
          </div>
          <div className="mt-3 pt-3 border-t flex justify-between text-xs text-gray-500">
            <span>Totaal deze maand: <strong className="text-gray-700">{Object.values(dagenMetUren).reduce((s, u) => s + u, 0)}u</strong></span>
            <span>{Object.keys(dagenMetUren).length} dagen gewerkt</span>
          </div>
        </div>
      )}

      {!selectedMedewerker && (
        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border shadow-sm">
          <div className="text-4xl mb-3">👷</div>
          <p className="font-medium">Selecteer een medewerker om uren in te vullen</p>
        </div>
      )}
      </>
      )}

      {activeTab === 'overzicht' && (
        <div>
          <div className="bg-white rounded-xl border shadow-sm p-5 mb-4">
            <div className="flex flex-wrap gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Project</label>
                <select
                  value={overzichtProject}
                  onChange={(e) => { setOverzichtProject(e.target.value); setOverzichtOrder('') }}
                  className="border rounded-lg px-3 py-2.5 text-sm min-w-48 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">-- Kies project --</option>
                  {projecten.map(p => (
                    <option key={p.id} value={p.id}>{p.emoji || ''} {p.naam || p.project_nummer}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Order (optioneel)</label>
                <select
                  value={overzichtOrder}
                  onChange={(e) => setOverzichtOrder(e.target.value)}
                  className="border rounded-lg px-3 py-2.5 text-sm min-w-48 focus:ring-2 focus:ring-blue-500 outline-none"
                  disabled={!overzichtProject}
                >
                  <option value="">Alle orders</option>
                  {ordersVoorProject(overzichtProject).map(o => (
                    <option key={o.id} value={o.id}>{o.naam}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {overzichtLoading && <LoadingSpinner />}

          {!overzichtLoading && overzichtProject && overzichtData.length > 0 && (
            <div className="space-y-4">
              {/* Samenvatting */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200 p-5">
                  <div className="text-xs font-medium text-blue-600 mb-1">Totaal uren</div>
                  <div className="text-4xl font-bold text-blue-700">{overzichtTotaal}u</div>
                  <div className="text-sm text-blue-500 mt-1">{overzichtData.length} registraties</div>
                </div>

                <div className="bg-white rounded-xl border shadow-sm p-5">
                  <div className="text-xs font-medium text-gray-500 mb-3">Per medewerker</div>
                  <div className="space-y-2">
                    {Object.entries(overzichtPerMedewerker).sort((a, b) => b[1] - a[1]).map(([naam, uren]) => (
                      <div key={naam} className="flex justify-between items-center text-sm">
                        <span className="text-gray-700">{naam}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min((uren / overzichtTotaal) * 100, 100)}%` }} />
                          </div>
                          <span className="font-semibold text-gray-700 w-12 text-right">{uren}u</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-xl border shadow-sm p-5">
                  <div className="text-xs font-medium text-gray-500 mb-3">Per type werk</div>
                  <div className="space-y-2">
                    {Object.entries(overzichtPerTypeWerk).sort((a, b) => b[1] - a[1]).map(([type, uren]) => {
                      const color = type === 'onderdelen' ? 'bg-blue-500' : type === 'monteren' ? 'bg-emerald-500' : type === 'inpakken' ? 'bg-amber-500' : 'bg-gray-500'
                      return (
                        <div key={type} className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">{type}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min((uren / overzichtTotaal) * 100, 100)}%` }} />
                            </div>
                            <span className="font-semibold text-gray-700 w-12 text-right">{uren}u</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Detail per datum */}
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="bg-gray-50 px-5 py-3 font-semibold text-sm text-gray-700 border-b">Detail per dag</div>
                <div className="divide-y">
                  {Object.entries(overzichtPerDatum).sort((a, b) => b[0].localeCompare(a[0])).map(([datum, items]) => {
                    const dagTotaal = items.reduce((sum, r) => sum + r.uren, 0)
                    return (
                      <div key={datum} className="px-4 py-3">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-medium text-sm">{new Date(datum).toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          <span className="text-sm font-semibold text-blue-600">{dagTotaal}u</span>
                        </div>
                        <div className="space-y-1">
                          {items.map(r => {
                            const mNaam = medewerkers.find(m => m.id === r.medewerker_id)?.naam || '?'
                            const oNaam = allOrders.find(o => o.id === r.order_id)?.naam || '?'
                            return (
                              <div key={r.id} className="flex items-center gap-2 text-xs text-gray-600">
                                <span className="bg-gray-100 px-2 py-0.5 rounded">{mNaam}</span>
                                <span>{r.uren}u</span>
                                <span className="text-gray-400">—</span>
                                <span>{oNaam}</span>
                                <span className={`px-1.5 py-0.5 rounded text-xs ${
                                  r.type_werk === 'onderdelen' ? 'bg-blue-100 text-blue-700' :
                                  r.type_werk === 'monteren' ? 'bg-green-100 text-green-700' :
                                  r.type_werk === 'inpakken' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>{r.type_werk}</span>
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

          {!overzichtLoading && overzichtProject && overzichtData.length === 0 && (
            <div className="text-center py-16 text-gray-400 bg-white rounded-xl border shadow-sm">
              <div className="text-4xl mb-3">📭</div>
              <p className="font-medium">Geen uren gevonden{overzichtOrder ? ' voor deze order' : ' voor dit project'}</p>
            </div>
          )}

          {!overzichtProject && (
            <div className="text-center py-16 text-gray-400 bg-white rounded-xl border shadow-sm">
              <div className="text-4xl mb-3">📊</div>
              <p className="font-medium">Selecteer een project om het urenoverzicht te bekijken</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'nacalculatie' && (
        <div>
          <div className="bg-white rounded-xl border shadow-sm p-5 mb-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Project</label>
                <select
                  value={nacalcProject}
                  onChange={(e) => setNacalcProject(e.target.value)}
                  className="border rounded-lg px-3 py-2.5 text-sm min-w-48 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">-- Kies project --</option>
                  {projecten.map(p => (
                    <option key={p.id} value={p.id}>{p.emoji || ''} {p.naam || p.project_nummer}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Filter</label>
                <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                  {[
                    { id: 'alle', label: 'Alle' },
                    { id: 'open', label: 'Open' },
                    { id: 'klaar', label: 'Afgevinkt' }
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setNacalcFilter(f.id)}
                      className={`px-3 py-1.5 text-sm rounded-md transition-all ${nacalcFilter === f.id ? 'bg-white text-blue-700 shadow-sm font-medium' : 'text-gray-600 hover:text-gray-800'}`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {nacalcLoading && <LoadingSpinner />}

          {!nacalcLoading && nacalcProject && nacalcGefilterdeOrders.length > 0 && (
            <div className="space-y-4">
              {/* Samenvatting */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200 p-5 text-center">
                  <div className="text-3xl font-bold text-blue-700">{nacalcOrdersMetUren.length}</div>
                  <div className="text-xs font-medium text-blue-600 mt-1">Orders met uren</div>
                </div>
                <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl border border-amber-200 p-5 text-center">
                  <div className="text-3xl font-bold text-amber-700">{nacalcOrdersMetUren.filter(o => o.uren_compleet && !o.nacalculatie_klaar).length}</div>
                  <div className="text-xs font-medium text-amber-600 mt-1">Nog nacalculeren</div>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl border border-green-200 p-5 text-center">
                  <div className="text-3xl font-bold text-green-700">{nacalcOrdersMetUren.filter(o => o.nacalculatie_klaar).length}</div>
                  <div className="text-xs font-medium text-green-600 mt-1">Nagecalculeerd</div>
                </div>
              </div>

              {/* Progress bar */}
              {nacalcOrdersMetUren.length > 0 && (
                <div className="bg-white rounded-xl border shadow-sm p-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-2">
                    <span>Voortgang nacalculatie</span>
                    <span>{Math.round((nacalcOrdersMetUren.filter(o => o.nacalculatie_klaar).length / nacalcOrdersMetUren.length) * 100)}%</span>
                  </div>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all" style={{ width: `${(nacalcOrdersMetUren.filter(o => o.nacalculatie_klaar).length / nacalcOrdersMetUren.length) * 100}%` }} />
                  </div>
                </div>
              )}

              {/* Orders lijst */}
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 border-b">
                      <th className="px-5 py-3">Order</th>
                      <th className="px-5 py-3 text-right">Uren</th>
                      <th className="px-5 py-3 text-right">Producten</th>
                      <th className="px-5 py-3 text-center">Uren compleet</th>
                      <th className="px-5 py-3 text-center">Nagecalculeerd</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {nacalcGefilterdeOrders.map(order => (
                      <tr key={order.id} className={`transition-colors ${
                        order.nacalculatie_klaar ? 'bg-green-50 hover:bg-green-100' : order.uren_compleet ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-50'
                      }`}>
                        <td className="px-5 py-4">
                          <div className="font-medium text-sm text-gray-800">{order.naam || 'Naamloos'}</div>
                          <div className="text-xs text-gray-400">{order.aantal_registraties} registraties</div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="font-bold text-sm text-gray-800">{order.totaal_uren}u</span>
                        </td>
                        <td className="px-5 py-4 text-right text-sm text-gray-600">
                          {order.aantal_producten > 0 ? (
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">{order.aantal_producten}</span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <button
                            onClick={() => toggleNacalcStatus(order.id, 'uren_compleet')}
                            className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center text-sm font-bold transition-all mx-auto ${
                              order.uren_compleet
                                ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                                : 'border-gray-300 hover:border-amber-400 hover:bg-amber-50'
                            }`}
                          >
                            {order.uren_compleet ? '✓' : ''}
                          </button>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <button
                            onClick={() => toggleNacalcStatus(order.id, 'nacalculatie_klaar')}
                            className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center text-sm font-bold transition-all mx-auto ${
                              order.nacalculatie_klaar
                                ? 'bg-green-500 border-green-500 text-white shadow-sm'
                                : 'border-gray-300 hover:border-green-400 hover:bg-green-50'
                            }`}
                          >
                            {order.nacalculatie_klaar ? '✓' : ''}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* KPI: uren per product */}
              {nacalcGefilterdeOrders.some(o => o.aantal_producten > 0 && o.totaal_uren > 0) && (
                <div className="bg-white rounded-xl border shadow-sm p-5">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">📈 Uren per product (KPI)</h4>
                  <div className="space-y-2">
                    {nacalcGefilterdeOrders.filter(o => o.aantal_producten > 0 && o.totaal_uren > 0).map(order => {
                      const urenPerProduct = (order.totaal_uren / order.aantal_producten).toFixed(1)
                      return (
                        <div key={order.id} className="flex items-center gap-3 text-sm">
                          <span className="text-gray-700 w-40 truncate">{order.naam}</span>
                          <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min((order.totaal_uren / Math.max(...nacalcGefilterdeOrders.map(o => o.totaal_uren))) * 100, 100)}%` }} />
                          </div>
                          <span className="font-bold text-indigo-600 w-20 text-right">{urenPerProduct}u/stuk</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {!nacalcLoading && nacalcProject && nacalcGefilterdeOrders.length === 0 && (
            <div className="text-center py-16 text-gray-400 bg-white rounded-xl border shadow-sm">
              <div className="text-4xl mb-3">{nacalcFilter !== 'alle' ? '🔍' : '📭'}</div>
              <p className="font-medium">{nacalcFilter !== 'alle' ? 'Geen orders gevonden met deze filter' : 'Geen orders met uren gevonden voor dit project'}</p>
            </div>
          )}

          {!nacalcProject && (
            <div className="text-center py-16 text-gray-400 bg-white rounded-xl border shadow-sm">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-medium">Selecteer een project om de nacalculatie te beheren</p>
            </div>
          )}
        </div>
      )}
      {showProjectModal && (
        <ProjectAanmaakModal
          onClose={() => { setShowProjectModal(false); setProjectModalRegelIndex(null) }}
          onCreate={handleProjectCreated}
        />
      )}
      {toastMsg && <Toast message={toastMsg} onDone={() => setToastMsg(null)} />}
    </div>
  )
}
