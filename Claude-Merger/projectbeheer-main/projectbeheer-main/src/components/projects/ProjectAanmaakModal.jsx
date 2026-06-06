import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabase'

// Project Aanmaak Modal
export const ProjectAanmaakModal = ({ onClose, onCreate }) => {
  const [form, setForm] = useState({
    project_nummer: '',
    naam: '',
    klant: '',
    architect: '',
    kleur: '#3B82F6',
    emoji: '📁'
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const generateNummer = async () => {
      try {
        const jaar = new Date().getFullYear()
        const { data } = await supabase.from('projecten')
          .select('project_nummer')
          .like('project_nummer', `PRJ-${jaar}-%`)
          .order('project_nummer', { ascending: false })
          .limit(1)
        let volgNr = 1
        if (data && data.length > 0) {
          const match = data[0].project_nummer.match(/PRJ-\d{4}-(\d+)/)
          if (match) volgNr = parseInt(match[1], 10) + 1
        }
        setForm(f => ({ ...f, project_nummer: `PRJ-${jaar}-${volgNr.toString().padStart(3, '0')}` }))
      } catch (e) {
        const jaar = new Date().getFullYear()
        setForm(f => ({ ...f, project_nummer: `PRJ-${jaar}-${Date.now().toString().slice(-4)}` }))
      }
      setLoading(false)
    }
    generateNummer()
  }, [])

  const handleSubmit = async () => {
    if (!form.naam.trim()) { alert('Vul een projectnaam in'); return }
    setLoading(true)
    try {
      const { data: created, error } = await supabase.from('projecten').insert({
        project_nummer: form.project_nummer,
        naam: form.naam.trim(),
        klant: form.klant.trim(),
        architect: form.architect.trim(),
        kleur: form.kleur,
        emoji: form.emoji
      }).select().single()
      if (error) throw error
      onCreate(created)
      onClose()
    } catch (e) {
      alert('Fout bij aanmaken: ' + e.message)
    }
    setLoading(false)
  }

  const emojiOpties = ['📁', '🏗️', '🏠', '🏢', '🏫', '🏪', '🪑', '🚪', '🎨', '🔧', '🔨', '⭐']

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b">
          <h2 className="text-lg font-bold">📁 Nieuw project aanmaken</h2>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Projectnummer</label>
            <input type="text" value={form.project_nummer} onChange={e => setForm({...form, project_nummer: e.target.value})}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Naam <span className="text-red-500">*</span></label>
            <input type="text" value={form.naam} onChange={e => setForm({...form, naam: e.target.value})}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="bv. School Tongeren" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Klant</label>
            <input type="text" value={form.klant} onChange={e => setForm({...form, klant: e.target.value})}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="bv. Architectenbureau X" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Architect</label>
            <input type="text" value={form.architect} onChange={e => setForm({...form, architect: e.target.value})}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="optioneel" />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Kleur</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {['#3B82F6','#8B5CF6','#EC4899','#EF4444','#F59E0B','#10B981','#06B6D4','#6366F1','#F97316','#14B8A6','#A855F7','#84CC16'].map(c => (
                  <button
                    key={c}
                    onClick={() => setForm({...form, kleur: c})}
                    className={`w-7 h-7 rounded-full transition-all ${form.kleur === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-110'}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
              <div className="flex gap-2 items-center">
                <input type="color" value={form.kleur} onChange={e => setForm({...form, kleur: e.target.value})}
                  className="w-8 h-8 rounded cursor-pointer border" />
                <span className="text-[10px] text-gray-400">RGB kiezer</span>
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Icoon</label>
              <div className="flex flex-wrap gap-1">
                {emojiOpties.map(e => (
                  <button key={e} onClick={() => setForm({...form, emoji: e})}
                    className={`text-lg w-8 h-8 rounded transition-colors ${form.emoji === e ? 'bg-blue-100 ring-2 ring-blue-400' : 'hover:bg-gray-100'}`}
                  >{e}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="p-5 border-t bg-gray-50 rounded-b-xl flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg">Annuleren</button>
          <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Bezig...' : '✓ Aanmaken'}
          </button>
        </div>
      </div>
    </div>
  )
}
