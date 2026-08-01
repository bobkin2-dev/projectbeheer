import React, { useState } from 'react'
import { supabase } from '../../supabase'

// Mini-modal: resterende uren van een order snel inplannen
export const PlanningResterend = ({ order, rpiesterendUren, medewerkers, onClose, onGepland }) => {
  const [startDatum, setStartDatum] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  })
  const [eindDatum, setEindDatum] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 21)
    return d.toISOString().split('T')[0]
  })
  const [gebruikFlex, setGebruikFlex] = useState(false)
  const [voorstel, setVoorstel] = useState(null) // array of blokken
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const resterend = rpiesterendUren

  const genereer = async () => {
    setLoading(true)
    try {
      // Load bestaande bezetting
      const { data: bestaandeBlokken } = await supabase
        .from('planning_blokken')
        .select('*')
        .gte('datum', startDatum)
        .lte('datum', eindDatum)

      const bezetting = {}
      ;(bestaandeBlokken || []).forEach(b => {
        const key = `${b.datum}-${b.medewerker_id}`
        bezetting[key] = (bezetting[key] || 0) + b.uren
      })

      const beschikbaar = medewerkers.filter(m => m.actief && (gebruikFlex || !m.is_flex))

      // Bereken optimaal aantal medewerkers per dag
      let werkdagen = 0
      {
        let d = new Date(startDatum + 'T12:00:00')
        const eind = new Date(eindDatum + 'T12:00:00')
        while (d <= eind) {
          const dag = d.getDay()
          if (dag >= 1 && dag <= 5) werkdagen++
          d.setDate(d.getDate() + 1)
        }
      }

      const urenPerDag = werkdagen > 0 ? resterend / werkdagen : resterend
      const urenPerMw = beschikbaar.length > 0 ? (beschikbaar[0].uren_per_dag || 8) : 8
      const mwPerDag = Math.min(Math.ceil(urenPerDag / urenPerMw), beschikbaar.length)

      // Plan blokken
      const blokken = []
      let rest = resterend
      let currentDate = new Date(startDatum + 'T12:00:00')
      const eindDate = new Date(eindDatum + 'T12:00:00')
      let mwStart = 0

      while (rest > 0 && currentDate <= eindDate) {
        const dag = currentDate.getDay()
        if (dag >= 1 && dag <= 5) {
          const datum = currentDate.toISOString().split('T')[0]
          let vandaag = 0

          for (let p = 0; p < beschikbaar.length && vandaag < mwPerDag && rest > 0; p++) {
            const mw = beschikbaar[(mwStart + p) % beschikbaar.length]
            const maxU = mw.uren_per_dag || 8
            const key = `${datum}-${mw.id}`
            const bezet = bezetting[key] || 0
            const vrij = maxU - bezet

            const isMarge = (bestaandeBlokken || []).some(b =>
              b.datum === datum && b.medewerker_id === mw.id && b.is_marge
            )

            if (vrij > 0 && !isMarge) {
              const uren = Math.min(vrij, rest)
              blokken.push({ medewerker_id: mw.id, medewerker_naam: mw.naam, datum, uren })
              bezetting[key] = bezet + uren
              rest -= uren
              vandaag++
            }
          }
          mwStart = (mwStart + vandaag) % beschikbaar.length
        }
        currentDate.setDate(currentDate.getDate() + 1)
      }

      setVoorstel(blokken)
    } catch (e) {
      alert('Fout: ' + e.message)
    }
    setLoading(false)
  }

  const bevestig = async () => {
    if (!voorstel || voorstel.length === 0) return
    setSaving(true)
    try {
      const blokken = voorstel.map(v => ({
        order_id: order.id,
        medewerker_id: v.medewerker_id,
        datum: v.datum,
        uren: v.uren,
        is_spoed: false,
        is_marge: false,
      }))
      const { error } = await supabase.from('planning_blokken').insert(blokken)
      if (error) throw error
      onGepland?.()
      onClose()
    } catch (e) {
      alert('Fout: ' + e.message)
    }
    setSaving(false)
  }

  const totaalVoorstel = voorstel ? voorstel.reduce((s, v) => s + v.uren, 0) : 0

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full" onClick={e => e.stopPropagation()}>

        <div className="p-4 border-b">
          <h3 className="text-base font-bold text-amber-700">⚠️ Resterende uren inplannen</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {order.naam} — <strong>{resterend}u</strong> nog in te plannen
          </p>
        </div>

        <div className="p-4 space-y-3">
          {!voorstel ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Van</label>
                  <input type="date" value={startDatum} onChange={e => setStartDatum(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Tot en met</label>
                  <input type="date" value={eindDatum} onChange={e => setEindDatum(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              <button
                onClick={() => setGebruikFlex(!gebruikFlex)}
                className={`w-full px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  gebruikFlex ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-500'
                }`}
              >
                {gebruikFlex ? '👥 Flex medewerkers: AAN' : '👤 Enkel vaste medewerkers'}
              </button>
            </>
          ) : (
            <>
              <div className="text-sm text-gray-700 mb-2">
                <strong>{totaalVoorstel}u</strong> over <strong>{voorstel.length}</strong> blokken
                {totaalVoorstel < resterend && (
                  <span className="text-amber-600 ml-2">({resterend - totaalVoorstel}u past niet in het bereik)</span>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto border rounded-lg">
                <table className="w-full text-sm">
                  <tbody>
                    {voorstel.map((v, i) => (
                      <tr key={i} className="border-t hover:bg-gray-50">
                        <td className="p-2 text-xs">
                          {new Date(v.datum + 'T12:00:00').toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </td>
                        <td className="p-2 text-xs">{v.medewerker_naam}</td>
                        <td className="p-2 text-xs text-right font-medium">{v.uren}u</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-between">
          {!voorstel ? (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Annuleren</button>
              <button onClick={genereer} disabled={loading}
                className="px-5 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
                {loading ? 'Berekenen...' : `📅 Plan ${resterend}u in`}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setVoorstel(null)} className="px-4 py-2 text-sm text-gray-600">◀ Terug</button>
              <button onClick={bevestig} disabled={saving || voorstel.length === 0}
                className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                {saving ? 'Opslaan...' : `✅ Bevestig (${voorstel.length} blokken)`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
