import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase'
import { WervenAanmaakModal } from './WervenAanmaakModal'
import { WervenTijdlijn } from './WervenTijdlijn'
import { LoadingSpinner } from '../ui/LoadingSpinner'

const formatEuro = (v) =>
  v != null
    ? new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
    : '–'

const formatDatum = (d) =>
  d ? new Date(d).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }) : '–'

const duurLabel = (start, eind) => {
  if (!start || !eind) return null
  const ms = new Date(eind) - new Date(start)
  const weken = Math.round(ms / (7 * 24 * 3600 * 1000))
  if (weken < 1) return '< 1 week'
  if (weken === 1) return '1 week'
  if (weken < 8) return `${weken} weken`
  return `${Math.round(weken / 4)} maanden`
}

export const WervenBeheer = () => {
  const [werven, setWerven] = useState([])
  const [fases, setFases] = useState([])
  const [verlofPeriodes, setVerlofPeriodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [zoek, setZoek] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editWerf, setEditWerf] = useState(null)
  const [tabView, setTabView] = useState('lijst') // 'lijst' | 'tijdlijn'
  const [showNonActief, setShowNonActief] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const loadWerven = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('werven')
        .select('*')
        .order('created_at', { ascending: false })
      if (err) throw err
      setWerven(data || [])

      // Laad ook alle fases
      const { data: fasesData } = await supabase
        .from('werf_fases')
        .select('*')
        .order('volgorde')
      setFases(fasesData || [])

      // Laad verlofperiodes
      const { data: verlofData } = await supabase
        .from('verlof_periodes')
        .select('*')
        .order('start_datum')
      setVerlofPeriodes(verlofData || [])
    } catch (e) {
      if (e.message?.includes('relation') || e.message?.includes('does not exist') || e.code === '42P01') {
        setError('TABEL_ONTBREEKT')
      } else {
        setError(e.message)
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadWerven() }, [loadWerven])

  const handleSave = (werf) => {
    // Herlaad fases na opslaan (fases kunnen gewijzigd zijn)
    supabase.from('werf_fases').select('*').order('volgorde').then(({ data }) => {
      setFases(data || [])
    })
    setWerven(prev => {
      const idx = prev.findIndex(w => w.id === werf.id)
      if (idx !== -1) {
        const updated = [...prev]
        updated[idx] = werf
        return updated
      }
      return [werf, ...prev]
    })
  }

  const handleDelete = async (werf) => {
    try {
      const { error: err } = await supabase.from('werven').delete().eq('id', werf.id)
      if (err) throw err
      setWerven(prev => prev.filter(w => w.id !== werf.id))
      setDeleteConfirm(null)
    } catch (e) {
      alert('Fout bij verwijderen: ' + e.message)
    }
  }

  const toggleActief = async (werf) => {
    try {
      const { data, error: err } = await supabase
        .from('werven')
        .update({ actief: !werf.actief })
        .eq('id', werf.id)
        .select()
        .single()
      if (err) throw err
      handleSave(data)
    } catch (e) {
      alert('Fout: ' + e.message)
    }
  }

  // Filtered
  const zoekLower = zoek.toLowerCase()
  const gefilterd = werven.filter(w => {
    const matchZoek = !zoek ||
      (w.naam || '').toLowerCase().includes(zoekLower) ||
      (w.klant || '').toLowerCase().includes(zoekLower) ||
      (w.nummer || '').toLowerCase().includes(zoekLower)
    const matchActief = showNonActief ? true : w.actief !== false
    return matchZoek && matchActief
  })

  const actief = gefilterd.filter(w => w.actief !== false)
  const nonActief = gefilterd.filter(w => w.actief === false)

  const totaalOmzet = actief.reduce((sum, w) => sum + (w.omzet || 0), 0)

  if (loading) return <LoadingSpinner />

  if (error === 'TABEL_ONTBREEKT') {
    return (
      <div className="max-w-2xl mx-auto mt-12">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <div className="text-3xl mb-3">🏗️</div>
          <h3 className="font-semibold text-amber-800 mb-2">Supabase tabel ontbreekt</h3>
          <p className="text-sm text-amber-700 mb-4">
            De tabel <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono">werven</code> bestaat nog niet in jouw database.
            Voer onderstaand SQL uit in de Supabase Query Editor.
          </p>
          <pre className="bg-white border border-amber-200 rounded-lg p-4 text-left text-xs font-mono text-gray-700 overflow-x-auto whitespace-pre-wrap">
{`create table werven (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  nummer text not null,
  naam text not null,
  klant text,
  omzet numeric,
  start_datum date,
  eind_datum date,
  kleur text default '#3b82f6',
  opmerkingen text,
  actief boolean default true
);`}
          </pre>
          <button
            onClick={loadWerven}
            className="mt-4 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700"
          >
            🔄 Opnieuw proberen
          </button>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-600">
        <p>Fout bij laden: {error}</p>
        <button onClick={loadWerven} className="mt-2 px-4 py-2 bg-red-100 rounded text-sm hover:bg-red-200">Opnieuw</button>
      </div>
    )
  }

  return (
    <div>
      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        {/* Tab toggle */}
        <div className="flex bg-gray-100 p-0.5 rounded-lg">
          {[
            { id: 'lijst', label: '☰ Lijst' },
            { id: 'tijdlijn', label: '📊 Tijdlijn' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTabView(t.id)}
              className={`px-3 py-1.5 text-sm rounded-md transition-all ${
                tabView === t.id ? 'bg-white text-blue-700 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={zoek}
          onChange={e => setZoek(e.target.value)}
          placeholder="🔍 Zoek werf, klant of nummer..."
          className="flex-1 min-w-[200px] border rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />

        <label className="flex items-center gap-1.5 text-sm text-gray-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showNonActief}
            onChange={e => setShowNonActief(e.target.checked)}
            className="rounded"
          />
          Toon inactief
        </label>

        <button
          onClick={() => { setEditWerf(null); setShowModal(true) }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium whitespace-nowrap"
        >
          + Nieuwe werf
        </button>
      </div>

      {/* ── Summary strip ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Actieve werven', value: werven.filter(w => w.actief !== false).length, icon: '🏗️' },
          { label: 'Totale omzet actief', value: formatEuro(totaalOmzet), icon: '💶' },
          { label: 'Met planning', value: werven.filter(w => w.actief !== false && w.start_datum && w.eind_datum).length, icon: '📅' },
          { label: 'Zonder omzet', value: werven.filter(w => w.actief !== false && !w.omzet).length, icon: '⚠️' },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-lg border px-4 py-3 flex items-center gap-3">
            <span className="text-xl">{s.icon}</span>
            <div>
              <div className="font-semibold text-gray-800 text-sm">{s.value}</div>
              <div className="text-[10px] text-gray-400">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tijdlijn view ─────────────────────────────────────────────── */}
      {tabView === 'tijdlijn' && (
        <WervenTijdlijn werven={werven} fases={fases} verlofPeriodes={verlofPeriodes} onVerlofChange={loadWerven} />
      )}

      {/* ── Lijst view ────────────────────────────────────────────────── */}
      {tabView === 'lijst' && (
        <div className="space-y-6">

          {actief.length === 0 && nonActief.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">🏗️</div>
              <p className="text-lg font-medium text-gray-500">Nog geen werven</p>
              <p className="text-sm mt-1">Klik op "Nieuwe werf" om te starten.</p>
            </div>
          )}

          {/* Actieve werven */}
          {actief.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Actief ({actief.length})
              </h3>
              <WerfLijst
                werven={actief}
                fases={fases}
                onEdit={w => { setEditWerf(w); setShowModal(true) }}
                onToggleActief={toggleActief}
                onDelete={w => setDeleteConfirm(w)}
              />
            </>
          )}

          {/* Non-actieve werven */}
          {showNonActief && nonActief.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-4">
                Niet actief ({nonActief.length})
              </h3>
              <WerfLijst
                werven={nonActief}
                fases={fases}
                onEdit={w => { setEditWerf(w); setShowModal(true) }}
                onToggleActief={toggleActief}
                onDelete={w => setDeleteConfirm(w)}
                dimmed
              />
            </>
          )}
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────── */}
      {showModal && (
        <WervenAanmaakModal
          werf={editWerf}
          onClose={() => { setShowModal(false); setEditWerf(null) }}
          onSave={handleSave}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="font-semibold text-gray-800 mb-2">Werf verwijderen?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Weet je zeker dat je <strong>{deleteConfirm.naam}</strong> wilt verwijderen? Dit kan niet ongedaan gemaakt worden.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Annuleren</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">Verwijderen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Subcomponent: Werf lijst tabel ─────────────────────────────────────────

const WerfLijst = ({ werven, fases = [], onEdit, onToggleActief, onDelete, dimmed }) => (
  <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${dimmed ? 'opacity-60' : ''}`}>
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
          <th className="text-left px-4 py-2.5 font-semibold">Kleur</th>
          <th className="text-left px-4 py-2.5 font-semibold">Nummer</th>
          <th className="text-left px-4 py-2.5 font-semibold">Naam</th>
          <th className="text-left px-4 py-2.5 font-semibold hidden sm:table-cell">Klant</th>
          <th className="text-right px-4 py-2.5 font-semibold hidden md:table-cell">Omzet</th>
          <th className="text-left px-4 py-2.5 font-semibold hidden lg:table-cell">Periode</th>
          <th className="text-center px-4 py-2.5 font-semibold hidden lg:table-cell">Duur</th>
          <th className="px-4 py-2.5"></th>
        </tr>
      </thead>
      <tbody>
        {werven.map(werf => {
          const duur = duurLabel(werf.start_datum, werf.eind_datum)
          const werfFases = fases.filter(f => f.werf_id === werf.id)
          return (
            <tr key={werf.id} className="border-b last:border-b-0 hover:bg-gray-50 group">
              {/* Kleurindicator */}
              <td className="px-4 py-3">
                <div
                  className="w-3.5 h-8 rounded-full mx-auto"
                  style={{ background: werf.kleur || '#6b7280' }}
                />
              </td>

              {/* Nummer */}
              <td className="px-4 py-3">
                <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-700">{werf.nummer}</span>
              </td>

              {/* Naam + fases */}
              <td className="px-4 py-3">
                <span className="font-medium text-gray-800">{werf.naam}</span>
                {werfFases.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {werfFases.map((f, i) => (
                      <span
                        key={f.id || i}
                        className="text-[9px] px-1.5 py-0.5 rounded-full text-white font-medium"
                        style={{ background: f.kleur || werf.kleur || '#6b7280' }}
                        title={f.omzet ? `${f.naam}: ${formatEuro(f.omzet)}` : f.naam}
                      >
                        {f.naam}
                      </span>
                    ))}
                  </div>
                )}
                {werf.opmerkingen && (
                  <p className="text-[10px] text-gray-400 truncate max-w-[180px] mt-0.5">{werf.opmerkingen}</p>
                )}
              </td>

              {/* Klant */}
              <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{werf.klant || <span className="text-gray-300">–</span>}</td>

              {/* Omzet */}
              <td className="px-4 py-3 text-right hidden md:table-cell">
                {werf.omzet
                  ? <span className="font-medium text-emerald-700">{formatEuro(werf.omzet)}</span>
                  : <span className="text-gray-300 text-xs">niet ingevoerd</span>
                }
              </td>

              {/* Periode */}
              <td className="px-4 py-3 hidden lg:table-cell">
                {werf.start_datum || werf.eind_datum ? (
                  <span className="text-xs text-gray-500">
                    {formatDatum(werf.start_datum)} → {formatDatum(werf.eind_datum)}
                  </span>
                ) : (
                  <span className="text-gray-300 text-xs">geen datum</span>
                )}
              </td>

              {/* Duur */}
              <td className="px-4 py-3 text-center hidden lg:table-cell">
                {duur ? (
                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{duur}</span>
                ) : (
                  <span className="text-gray-300">–</span>
                )}
              </td>

              {/* Acties */}
              <td className="px-4 py-3">
                <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onEdit(werf)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                    title="Bewerken"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => onToggleActief(werf)}
                    className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
                    title={werf.actief ? 'Deactiveren' : 'Activeren'}
                  >
                    {werf.actief ? '⏸️' : '▶️'}
                  </button>
                  <button
                    onClick={() => onDelete(werf)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    title="Verwijderen"
                  >
                    🗑️
                  </button>
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  </div>
)
