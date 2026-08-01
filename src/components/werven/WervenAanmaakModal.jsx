import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabase'

const KLEUREN = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#6366f1'
]

const FASE_KLEUREN = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#6366f1',
  '#84cc16', '#f43f5e', '#0ea5e9', '#a855f7', '#22c55e'
]

const formatEuro = (v) =>
  v != null && v !== ''
    ? new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
    : null

const emptyFase = (kleur) => ({
  _id: Math.random().toString(36).slice(2), // tijdelijk lokaal id
  naam: '',
  omzet: '',
  start_datum: '',
  eind_datum: '',
  kleur: kleur,
})

export const WervenAanmaakModal = ({ werf = null, onClose, onSave }) => {
  const isEdit = !!werf

  const [form, setForm] = useState({
    nummer: werf?.nummer || '',
    naam: werf?.naam || '',
    klant: werf?.klant || '',
    omzet: werf?.omzet || '',
    start_datum: werf?.start_datum || '',
    eind_datum: werf?.eind_datum || '',
    kleur: werf?.kleur || KLEUREN[0],
    opmerkingen: werf?.opmerkingen || '',
    actief: werf?.actief !== false,
  })

  const [fases, setFases] = useState([])
  const [loadingFases, setLoadingFases] = useState(isEdit)
  const [useFases, setUseFases] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('algemeen') // 'algemeen' | 'fases'

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  // Load bestaande fases bij edit
  useEffect(() => {
    if (!isEdit) return
    supabase
      .from('werf_fases')
      .select('*')
      .eq('werf_id', werf.id)
      .order('volgorde')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setFases(data.map(f => ({ ...f, _id: f.id })))
          setUseFases(true)
        }
        setLoadingFases(false)
      })
  }, [isEdit, werf?.id])

  // Fases beheer
  const addFase = () => {
    const kleur = FASE_KLEUREN[fases.length % FASE_KLEUREN.length]
    setFases(f => [...f, emptyFase(kleur)])
  }

  const updateFase = (idx, key, val) => {
    setFases(f => f.map((fase, i) => i === idx ? { ...fase, [key]: val } : fase))
  }

  const removeFase = (idx) => {
    setFases(f => f.filter((_, i) => i !== idx))
  }

  // Totale omzet uit fases
  const totaleFasesOmzet = fases.reduce((sum, f) => sum + (parseFloat(f.omzet) || 0), 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nummer.trim() || !form.naam.trim()) {
      setError('Nummer en naam zijn verplicht.')
      return
    }
    if (useFases && fases.some(f => !f.naam.trim())) {
      setError('Elke fase moet een naam hebben.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      // Omzet = som van fases als fases actief zijn
      const totaalOmzet = useFases && fases.length > 0
        ? totaleFasesOmzet
        : (form.omzet ? parseFloat(form.omzet) : null)

      const payload = {
        nummer: form.nummer.trim(),
        naam: form.naam.trim(),
        klant: form.klant.trim(),
        omzet: totaalOmzet,
        start_datum: form.start_datum || null,
        eind_datum: form.eind_datum || null,
        kleur: form.kleur,
        opmerkingen: form.opmerkingen.trim(),
        actief: form.actief,
      }

      let werfResult
      if (isEdit) {
        const { data, error: err } = await supabase.from('werven').update(payload).eq('id', werf.id).select().single()
        if (err) throw err
        werfResult = data
      } else {
        const { data, error: err } = await supabase.from('werven').insert(payload).select().single()
        if (err) throw err
        werfResult = data
      }

      // Fases opslaan
      if (useFases) {
        // Verwijder alle oude fases voor deze werf
        await supabase.from('werf_fases').delete().eq('werf_id', werfResult.id)

        if (fases.length > 0) {
          const fasesPayload = fases.map((f, idx) => ({
            werf_id: werfResult.id,
            naam: f.naam.trim(),
            omzet: f.omzet ? parseFloat(f.omzet) : null,
            start_datum: f.start_datum || null,
            eind_datum: f.eind_datum || null,
            kleur: f.kleur,
            volgorde: idx,
          }))
          const { error: fasErr } = await supabase.from('werf_fases').insert(fasesPayload)
          if (fasErr) throw fasErr
        }
      } else {
        // Fases uitgeschakeld: verwijder alle bestaande fases
        await supabase.from('werf_fases').delete().eq('werf_id', werfResult.id)
      }

      onSave(werfResult)
      onClose()
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b flex justify-between items-center flex-shrink-0">
          <h2 className="text-lg font-semibold">{isEdit ? 'Werf bewerken' : 'Nieuwe werf aanmaken'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b bg-gray-50 flex-shrink-0">
          {[
            { id: 'algemeen', label: '📋 Algemeen' },
            { id: 'fases', label: `🔀 Fases${fases.length > 0 ? ` (${fases.length})` : ''}` },
          ].map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.id
                  ? 'border-blue-500 text-blue-700 bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="overflow-y-auto flex-1 p-5">

            {/* ── Tab: Algemeen ─────────────────────────────────── */}
            {activeTab === 'algemeen' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Werfnummer *</label>
                    <input
                      type="text"
                      value={form.nummer}
                      onChange={e => set('nummer', e.target.value)}
                      placeholder="bv. W2024-001"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Naam *</label>
                    <input
                      type="text"
                      value={form.naam}
                      onChange={e => set('naam', e.target.value)}
                      placeholder="Naam van de werf"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Klant</label>
                  <input
                    type="text"
                    value={form.klant}
                    onChange={e => set('klant', e.target.value)}
                    placeholder="Naam van de klant"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* Omzet — alleen tonen als geen fases actief */}
                {!useFases && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Omzet (€)</label>
                    <input
                      type="number"
                      value={form.omzet}
                      onChange={e => set('omzet', e.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">
                      Of gebruik het tabblad <strong>Fases</strong> om de omzet per fase in te stellen.
                    </p>
                  </div>
                )}

                {useFases && totaleFasesOmzet > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 flex items-center justify-between">
                    <span className="text-sm text-emerald-700">Totale omzet (som fases)</span>
                    <span className="font-semibold text-emerald-800">{formatEuro(totaleFasesOmzet)}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Startdatum werf</label>
                    <input
                      type="date"
                      value={form.start_datum}
                      onChange={e => set('start_datum', e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Einddatum werf</label>
                    <input
                      type="date"
                      value={form.eind_datum}
                      onChange={e => set('eind_datum', e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Kleur</label>
                  <div className="flex gap-2 flex-wrap">
                    {KLEUREN.map(k => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => set('kleur', k)}
                        className={`w-7 h-7 rounded-full transition-transform ${form.kleur === k ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : 'hover:scale-110'}`}
                        style={{ background: k }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Opmerkingen</label>
                  <textarea
                    value={form.opmerkingen}
                    onChange={e => set('opmerkingen', e.target.value)}
                    rows={2}
                    placeholder="Vrije notities..."
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="actief"
                    checked={form.actief}
                    onChange={e => set('actief', e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="actief" className="text-sm text-gray-700">Werf actief</label>
                </div>
              </div>
            )}

            {/* ── Tab: Fases ────────────────────────────────────── */}
            {activeTab === 'fases' && (
              <div className="space-y-4">
                {/* Toggle fases */}
                <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-blue-800">Werken met fases</p>
                    <p className="text-xs text-blue-600 mt-0.5">Verdeel de omzet over meerdere fases met eigen periodes</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUseFases(v => !v)
                      if (!useFases && fases.length === 0) addFase()
                    }}
                    className={`relative w-11 h-6 rounded-full transition-colors ${useFases ? 'bg-blue-600' : 'bg-gray-300'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${useFases ? 'translate-x-5' : ''}`} />
                  </button>
                </div>

                {useFases && (
                  <>
                    {loadingFases ? (
                      <div className="text-center py-4 text-gray-400 text-sm">Fases laden...</div>
                    ) : (
                      <>
                        {fases.length === 0 && (
                          <div className="text-center py-6 text-gray-400 text-sm">
                            Nog geen fases. Voeg er één toe.
                          </div>
                        )}

                        <div className="space-y-3">
                          {fases.map((fase, idx) => (
                            <div
                              key={fase._id}
                              className="border rounded-xl p-4 space-y-3"
                              style={{ borderLeftWidth: '4px', borderLeftColor: fase.kleur }}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fase {idx + 1}</span>
                                <button
                                  type="button"
                                  onClick={() => removeFase(idx)}
                                  className="text-gray-300 hover:text-red-500 text-sm px-2"
                                >
                                  ✕
                                </button>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2 sm:col-span-1">
                                  <label className="block text-xs text-gray-500 mb-1">Naam fase *</label>
                                  <input
                                    type="text"
                                    value={fase.naam}
                                    onChange={e => updateFase(idx, 'naam', e.target.value)}
                                    placeholder="bv. Ruwbouw, Afwerking..."
                                    className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Omzet (€)</label>
                                  <input
                                    type="number"
                                    value={fase.omzet}
                                    onChange={e => updateFase(idx, 'omzet', e.target.value)}
                                    placeholder="0"
                                    min="0"
                                    step="0.01"
                                    className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Start</label>
                                  <input
                                    type="date"
                                    value={fase.start_datum}
                                    onChange={e => updateFase(idx, 'start_datum', e.target.value)}
                                    className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Einde</label>
                                  <input
                                    type="date"
                                    value={fase.eind_datum}
                                    onChange={e => updateFase(idx, 'eind_datum', e.target.value)}
                                    className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                  />
                                </div>
                              </div>

                              {/* Kleur kiezen */}
                              <div className="flex gap-1.5 flex-wrap">
                                {FASE_KLEUREN.slice(0, 10).map(k => (
                                  <button
                                    key={k}
                                    type="button"
                                    onClick={() => updateFase(idx, 'kleur', k)}
                                    className={`w-5 h-5 rounded-full transition-transform ${fase.kleur === k ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : 'hover:scale-110'}`}
                                    style={{ background: k }}
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={addFase}
                          className="w-full py-2 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
                        >
                          + Fase toevoegen
                        </button>

                        {/* Totaal overzicht */}
                        {fases.length > 0 && (
                          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                            {fases.map((f, i) => (
                              <div key={f._id} className="flex justify-between text-xs">
                                <span className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: f.kleur }}></span>
                                  {f.naam || `Fase ${i + 1}`}
                                </span>
                                <span className="font-medium">{f.omzet ? formatEuro(parseFloat(f.omzet)) : '–'}</span>
                              </div>
                            ))}
                            <div className="flex justify-between text-xs font-semibold text-gray-700 border-t pt-1 mt-1">
                              <span>Totaal</span>
                              <span>{formatEuro(totaleFasesOmzet)}</span>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-5 border-t flex-shrink-0 space-y-3">
            {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
                Annuleren
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Opslaan...' : isEdit ? 'Opslaan' : 'Aanmaken'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
