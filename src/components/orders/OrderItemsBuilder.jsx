import React, { useState } from 'react'
import { bibCategorieen } from '../../config/constants'
import { calculateOrderTotals } from '../../utils/calculations'

// Order Items Builder
export const OrderItemsBuilder = ({ orderItems, bibliotheek, sjablonen, onAddItem, onUpdateItem, onRemoveItem, onApplySjabloon, korting, kortingType, onUpdateKorting }) => {
  const [showBib, setShowBib] = useState(false)
  const [showSjablonen, setShowSjablonen] = useState(false)
  const [activeCategorie, setActiveCategorie] = useState('materialen')
  const [zoek, setZoek] = useState('')

  const gefilterdeItems = bibliotheek.filter(item =>
    item.categorie === activeCategorie && item.naam.toLowerCase().includes(zoek.toLowerCase())
  )

  const { subtotaal, korting: kortingBedrag, totaal } = calculateOrderTotals(orderItems, korting, kortingType)

  const itemsPerCategorie = bibCategorieen.reduce((acc, cat) => {
    acc[cat.id] = orderItems.filter(i => i.categorie === cat.id)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={() => { setShowBib(!showBib); setShowSjablonen(false) }} className={`px-4 py-2 rounded-lg text-sm font-medium ${showBib ? 'bg-blue-600 text-white' : 'bg-white border hover:bg-gray-50'}`}>
          📦 Uit bibliotheek
        </button>
        <button onClick={() => { setShowSjablonen(!showSjablonen); setShowBib(false) }} className={`px-4 py-2 rounded-lg text-sm font-medium ${showSjablonen ? 'bg-green-600 text-white' : 'bg-white border hover:bg-gray-50'}`}>
          📋 Sjabloon
        </button>
      </div>

      {showBib && (
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
          <div className="flex flex-wrap gap-2 mb-3">
            {bibCategorieen.map(cat => (
              <button key={cat.id} onClick={() => setActiveCategorie(cat.id)} className={`px-3 py-1 rounded text-sm ${activeCategorie === cat.id ? 'bg-blue-600 text-white' : 'bg-white'}`}>
                {cat.icon}
              </button>
            ))}
          </div>
          <input type="text" value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="🔍 Zoeken..." className="w-full border rounded px-3 py-2 mb-3" />
          <div className="max-h-48 overflow-y-auto bg-white rounded border">
            {gefilterdeItems.map(item => (
              <button key={item.id} onClick={() => onAddItem(item)} className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0 flex justify-between">
                <span>{item.naam}</span>
                <span className="text-gray-500">€{item.prijs}/{item.eenheid}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showSjablonen && (
        <div className="bg-green-50 rounded-lg border border-green-200 p-4">
          <h4 className="font-medium mb-3">Sjabloon toepassen</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sjablonen.map(sjabloon => (
              <button key={sjabloon.id} onClick={() => { onApplySjabloon(sjabloon); setShowSjablonen(false) }} className="text-left p-3 bg-white rounded border hover:border-green-400">
                <div className="font-medium">{sjabloon.naam}</div>
                <div className="text-xs text-gray-500">{sjabloon.omschrijving}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {orderItems.length > 0 ? (
        <div className="space-y-4">
          {bibCategorieen.map(cat => {
            const catItems = itemsPerCategorie[cat.id]
            if (!catItems || catItems.length === 0) return null
            const catTotaal = catItems.reduce((sum, i) => sum + i.aantal * i.prijs_per_eenheid, 0)

            return (
              <div key={cat.id} className="bg-white rounded-lg border overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 flex justify-between">
                  <span className="font-medium">{cat.label}</span>
                  <span>€{catTotaal.toFixed(2)}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {catItems.map(item => (
                        <tr key={item.id} className="border-t">
                          <td className="p-2">{item.naam}</td>
                          <td className="p-2 w-20">
                            <input type="number" value={item.aantal} onChange={(e) => onUpdateItem(item.id, 'aantal', parseFloat(e.target.value) || 0)} className="w-full border rounded px-2 py-1 text-right" step="0.5" />
                          </td>
                          <td className="p-2 w-16 text-center text-gray-500">{item.eenheid}</td>
                          <td className="p-2 w-24">
                            <input type="number" value={item.prijs_per_eenheid} onChange={(e) => onUpdateItem(item.id, 'prijs_per_eenheid', parseFloat(e.target.value) || 0)} className="w-full border rounded px-2 py-1 text-right" step="0.01" />
                          </td>
                          <td className="p-2 w-24 text-right font-medium">€{(item.aantal * item.prijs_per_eenheid).toFixed(2)}</td>
                          <td className="p-2 w-10"><button onClick={() => onRemoveItem(item.id)} className="text-red-500">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

          <div className="bg-gray-50 rounded-lg border p-4">
            <div className="flex justify-between mb-2">
              <span>Subtotaal:</span>
              <span>€{subtotaal.toFixed(2)}</span>
            </div>
            <div className="flex flex-wrap justify-between items-center mb-2 gap-2">
              <span>Korting:</span>
              <div className="flex items-center gap-2">
                <input type="number" value={korting || ''} onChange={(e) => onUpdateKorting('korting', parseFloat(e.target.value) || 0)} className="w-20 border rounded px-2 py-1 text-right" step="0.01" />
                <select value={kortingType} onChange={(e) => onUpdateKorting('kortingType', e.target.value)} className="border rounded px-2 py-1">
                  <option value="procent">%</option>
                  <option value="bedrag">€</option>
                </select>
                <span className="text-gray-500">(-€{kortingBedrag.toFixed(2)})</span>
              </div>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2">
              <span>Totaal:</span>
              <span className="text-green-600">€{totaal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-400 border-2 border-dashed rounded-lg">
          Nog geen items. Voeg items toe uit de bibliotheek of pas een sjabloon toe.
        </div>
      )}
    </div>
  )
}
