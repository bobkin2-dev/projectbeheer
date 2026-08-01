import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { eenheden } from '../../config/constants'

// Order Producten Component
export const OrderProducten = ({ orderId }) => {
  const [producten, setProducten] = useState([])
  const [loading, setLoading] = useState(true)
  const [nieuwProduct, setNieuwProduct] = useState({ naam: '', aantal: 1, eenheid: 'stuk' })

  useEffect(() => {
    loadProducten()
  }, [orderId])

  const loadProducten = async () => {
    try {
      const { data } = await supabase.from('order_producten').select('*').eq('order_id', orderId).order('created_at')
      setProducten(data || [])
    } catch (e) {
      console.error('Fout bij laden producten:', e)
    }
    setLoading(false)
  }

  const addProduct = async () => {
    if (!nieuwProduct.naam.trim()) return
    try {
      const { data: created } = await supabase.from('order_producten').insert({
        order_id: orderId,
        naam: nieuwProduct.naam.trim(),
        aantal: parseFloat(nieuwProduct.aantal) || 1,
        eenheid: nieuwProduct.eenheid
      }).select().single()
      if (created) setProducten([...producten, created])
      setNieuwProduct({ naam: '', aantal: 1, eenheid: 'stuk' })
    } catch (e) {
      alert('Fout: ' + e.message)
    }
  }

  const deleteProduct = async (id) => {
    try {
      await supabase.from('order_producten').delete().eq('id', id)
      setProducten(producten.filter(p => p.id !== id))
    } catch (e) {
      alert('Fout: ' + e.message)
    }
  }

  if (loading) return <div className="text-sm text-gray-400">Laden...</div>

  return (
    <div className="mt-3">
      <div className="text-sm font-medium text-gray-700 mb-2">📦 Producten</div>
      {producten.length > 0 && (
        <div className="space-y-1 mb-2">
          {producten.map(p => (
            <div key={p.id} className="flex items-center gap-2 text-sm bg-gray-50 rounded px-2 py-1">
              <span className="flex-1">{p.aantal} {p.eenheid} — {p.naam}</span>
              <button onClick={() => deleteProduct(p.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={nieuwProduct.naam}
          onChange={(e) => setNieuwProduct({ ...nieuwProduct, naam: e.target.value })}
          placeholder="Product naam..."
          className="flex-1 border rounded px-2 py-1 text-sm"
          onKeyDown={(e) => e.key === 'Enter' && addProduct()}
        />
        <input
          type="number"
          value={nieuwProduct.aantal}
          onChange={(e) => setNieuwProduct({ ...nieuwProduct, aantal: e.target.value })}
          className="w-16 border rounded px-2 py-1 text-sm text-right"
          step="0.5"
          min="0"
        />
        <select
          value={nieuwProduct.eenheid}
          onChange={(e) => setNieuwProduct({ ...nieuwProduct, eenheid: e.target.value })}
          className="border rounded px-2 py-1 text-sm"
        >
          {eenheden.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <button onClick={addProduct} className="px-2 py-1 bg-blue-600 text-white rounded text-sm">+</button>
      </div>
    </div>
  )
}
