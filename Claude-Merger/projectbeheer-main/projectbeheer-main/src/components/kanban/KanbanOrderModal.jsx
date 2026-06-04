import React, { useState } from 'react'
import { supabase } from '../../supabase'
import { orderStatusConfig } from '../../config/constants'

// Kanban Order Modal
export const KanbanOrderModal = ({ order, onClose, onUpdate }) => {
  const [formData, setFormData] = useState({ ...order })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await supabase.from('orders').update({
        naam: formData.naam,
        status: formData.status || 'prijsvraag',
        dringend: formData.dringend || false,
        is_meerwerk: formData.is_meerwerk || false,
        tekening_klaar: formData.tekening_klaar || false,
        tekening_goedgekeurd: formData.tekening_goedgekeurd || false,
        materiaal_besteld: formData.materiaal_besteld || false,
        materiaal_binnen: formData.materiaal_binnen || false,
        begrote_uren: formData.begrote_uren || 0,
        plaatsing_datum: formData.plaatsing_datum,
        uren_compleet: formData.uren_compleet || false,
        nacalculatie_klaar: formData.nacalculatie_klaar || false,
        notitie: formData.notitie || null
      }).eq('id', order.id)
      onUpdate({ ...order, ...formData })
      onClose()
    } catch (e) {
      alert('Fout bij opslaan: ' + e.message)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b flex justify-between items-center">
          <h3 className="text-lg font-bold text-gray-800">Order bewerken</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Naam</label>
            <input type="text" value={formData.naam || ''} onChange={(e) => setFormData({ ...formData, naam: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Project</label>
            <div className="px-3 py-2 bg-gray-50 rounded-lg text-gray-600 text-sm">{order.project?.emoji} {order.project?.naam || '-'}</div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <select value={formData.status || 'prijsvraag'} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                {Object.entries(orderStatusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Begrote uren</label>
              <input type="number" step="0.5" min="0" value={formData.begrote_uren || ''} onChange={(e) => setFormData({ ...formData, begrote_uren: parseFloat(e.target.value) || 0 })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Voorbereiding tracks */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs font-medium text-gray-500 mb-3">Voorbereiding</div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-xs text-gray-500">📐 Tekening</div>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={formData.tekening_klaar || false} onChange={(e) => setFormData({ ...formData, tekening_klaar: e.target.checked })} className="w-4 h-4 rounded" />
                  Tekening klaar
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={formData.tekening_goedgekeurd || false} onChange={(e) => setFormData({ ...formData, tekening_goedgekeurd: e.target.checked })} className="w-4 h-4 rounded" />
                  Goedgekeurd
                </label>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-gray-500">📦 Materiaal</div>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={formData.materiaal_besteld || false} onChange={(e) => setFormData({ ...formData, materiaal_besteld: e.target.checked })} className="w-4 h-4 rounded" />
                  Besteld
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={formData.materiaal_binnen || false} onChange={(e) => setFormData({ ...formData, materiaal_binnen: e.target.checked })} className="w-4 h-4 rounded" />
                  Binnen
                </label>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Plaatsing datum</label>
            <input type="date" value={formData.plaatsing_datum || ''} onChange={(e) => setFormData({ ...formData, plaatsing_datum: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notitie</label>
            <textarea value={formData.notitie || ''} onChange={(e) => setFormData({ ...formData, notitie: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} placeholder="Opmerkingen..." />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={formData.dringend || false} onChange={(e) => setFormData({ ...formData, dringend: e.target.checked })} className="w-4 h-4 text-red-600 rounded" />
              <span className="text-sm text-red-600 font-medium">🚨 Dringend</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={formData.is_meerwerk || false} onChange={(e) => setFormData({ ...formData, is_meerwerk: e.target.checked })} className="w-4 h-4 text-amber-600 rounded" />
              <span className="text-sm text-amber-700 font-medium">+ Meerwerk</span>
            </label>
          </div>

          <div className="border-t pt-3">
            <div className="text-xs font-medium text-gray-500 mb-2">Nacalculatie</div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={formData.uren_compleet || false} onChange={(e) => setFormData({ ...formData, uren_compleet: e.target.checked })} className="w-4 h-4 rounded text-amber-600" />
                Uren compleet
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={formData.nacalculatie_klaar || false} onChange={(e) => setFormData({ ...formData, nacalculatie_klaar: e.target.checked })} className="w-4 h-4 rounded text-green-600" />
                Nagecalculeerd
              </label>
            </div>
          </div>
        </div>

        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Annuleren</button>
          <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}
