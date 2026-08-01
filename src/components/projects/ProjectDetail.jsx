import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { orderStatusConfig, orderStatusVolgorde, bibCategorieen, eenheden } from '../../config/constants'
import { kanNaarProductie } from '../../utils/calculations'
import { calculateOrderTotals } from '../../utils/calculations'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { OrderItemsBuilder } from '../orders/OrderItemsBuilder'
import { SnelUrenInvoer } from '../uren/SnelUrenInvoer'
import { OrderProducten } from '../orders/OrderProducten'

export const ProjectDetail = ({ project, bibliotheek, sjablonen, medewerkers = [], onBack, onRefresh, onUpdateProject, onDeleteProject }) => {
  const [orders, setOrders] = useState([])
  const [orderItems, setOrderItems] = useState({})
  const [activeTab, setActiveTab] = useState('orders')
  const [expandedOrder, setExpandedOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [nieuwOrderNaam, setNieuwOrderNaam] = useState('')
  const [nieuwOrderMeerwerk, setNieuwOrderMeerwerk] = useState(false)
  const [editingProject, setEditingProject] = useState({ ...project })
  const [editingOrderId, setEditingOrderId] = useState(null)
  const [editingOrderNaam, setEditingOrderNaam] = useState('')
  const [expandedProductieUren, setExpandedProductieUren] = useState({})

  // Load orders
  useEffect(() => {
    const loadOrders = async () => {
      try {
        const { data: ordersData, error } = await supabase.from('orders').select('*').eq('project_id', project.id)
        if (error) throw error
        setOrders(ordersData || [])

        // Load items for all orders
        const itemsMap = {}
        for (const order of (ordersData || [])) {
          const { data: items } = await supabase.from('order_items').select('*').eq('order_id', order.id)
          itemsMap[order.id] = items || []
        }
        setOrderItems(itemsMap)
      } catch (e) {
        console.error('Fout bij laden orders:', e)
      }
      setLoading(false)
    }
    loadOrders()
  }, [project.id])

  const saveProjectDetails = async (overrides = {}) => {
    const toSave = { ...editingProject, ...overrides }
    try {
      await supabase.from('projecten').update({
        project_nummer: toSave.project_nummer,
        naam: toSave.naam,
        klant: toSave.klant,
        architect: toSave.architect,
        telefoon: toSave.telefoon,
        email: toSave.email,
        adres: toSave.adres,
        notities: toSave.notities,
        kleur: toSave.kleur,
        emoji: toSave.emoji,
        kanban_verborgen: toSave.kanban_verborgen || false,
        actief: toSave.actief !== undefined ? toSave.actief : true
      }).eq('id', project.id)
      onUpdateProject(toSave)
    } catch (e) {
      alert('Fout: ' + e.message)
    }
  }

  const addOrder = async () => {
    if (!nieuwOrderNaam.trim()) return
    setSaving(true)
    try {
      const { data: created, error } = await supabase.from('orders').insert({
        project_id: project.id,
        naam: nieuwOrderNaam.trim(),
        status: 'prijsvraag',
        is_meerwerk: nieuwOrderMeerwerk,
        added_from: 'offerte'
      }).select().single()

      if (error) throw error
      setOrders([...orders, created])
      setOrderItems({ ...orderItems, [created.id]: [] })
      setNieuwOrderNaam('')
      setNieuwOrderMeerwerk(false)
    } catch (e) {
      alert('Fout: ' + e.message)
    }
    setSaving(false)
  }

  const updateOrder = async (orderId, updates) => {
    try {
      await supabase.from('orders').update(updates).eq('id', orderId)
      setOrders(orders.map(o => o.id === orderId ? { ...o, ...updates } : o))
    } catch (e) {
      alert('Fout bij updaten: ' + e.message)
    }
  }

  const deleteOrder = async (orderId) => {
    if (!confirm('Weet je zeker dat je deze order wilt verwijderen?')) return
    try {
      await supabase.from('orders').delete().eq('id', orderId)
      setOrders(orders.filter(o => o.id !== orderId))
      const newItems = { ...orderItems }
      delete newItems[orderId]
      setOrderItems(newItems)
    } catch (e) {
      alert('Fout bij verwijderen: ' + e.message)
    }
  }

  const addItemToOrder = async (orderId, bibItem) => {
    const currentItems = orderItems[orderId] || []
    const exists = currentItems.find(i => i.bibliotheek_id === bibItem.id)

    if (exists) {
      await updateOrderItem(orderId, exists.id, 'aantal', exists.aantal + 1)
    } else {
      try {
        const { data: created, error } = await supabase.from('order_items').insert({
          order_id: orderId,
          bibliotheek_id: bibItem.id,
          categorie: bibItem.categorie,
          naam: bibItem.naam,
          eenheid: bibItem.eenheid,
          aantal: 1,
          prijs_per_eenheid: bibItem.prijs
        }).select().single()

        if (error) throw error
        setOrderItems({ ...orderItems, [orderId]: [...currentItems, created] })
      } catch (e) {
        alert('Fout: ' + e.message)
      }
    }
  }

  const updateOrderItem = async (orderId, itemId, field, value) => {
    try {
      await supabase.from('order_items').update({ [field]: value }).eq('id', itemId)
      setOrderItems({
        ...orderItems,
        [orderId]: orderItems[orderId].map(i => i.id === itemId ? { ...i, [field]: value } : i)
      })
    } catch (e) {
      alert('Fout: ' + e.message)
    }
  }

  const removeOrderItem = async (orderId, itemId) => {
    try {
      await supabase.from('order_items').delete().eq('id', itemId)
      setOrderItems({
        ...orderItems,
        [orderId]: orderItems[orderId].filter(i => i.id !== itemId)
      })
    } catch (e) {
      alert('Fout: ' + e.message)
    }
  }

  const applySjabloonToOrder = async (orderId, sjabloon) => {
    const currentItems = [...(orderItems[orderId] || [])]

    for (const sjabItem of sjabloon.items || []) {
      const bibItem = bibliotheek.find(b => b.id === sjabItem.bibliotheek_id)
      if (!bibItem) continue

      const exists = currentItems.find(i => i.bibliotheek_id === bibItem.id)

      if (exists) {
        await updateOrderItem(orderId, exists.id, 'aantal', exists.aantal + sjabItem.aantal)
        exists.aantal += sjabItem.aantal
      } else {
        try {
          const { data: created } = await supabase.from('order_items').insert({
            order_id: orderId,
            bibliotheek_id: bibItem.id,
            categorie: bibItem.categorie,
            naam: bibItem.naam,
            eenheid: bibItem.eenheid,
            aantal: sjabItem.aantal,
            prijs_per_eenheid: bibItem.prijs
          }).select().single()

          if (created) currentItems.push(created)
        } catch (e) {
          console.error('Fout bij toevoegen item:', e)
        }
      }
    }

    // Refresh items
    const { data: items } = await supabase.from('order_items').select('*').eq('order_id', orderId)
    setOrderItems({ ...orderItems, [orderId]: items || [] })
  }

  const totaalProject = orders.reduce((sum, o) => {
    const items = orderItems[o.id] || []
    return sum + calculateOrderTotals(items, o.offerte_korting, o.offerte_korting_type).totaal
  }, 0)

  if (loading) return <LoadingSpinner />

  const tabs = [
    { id: 'orders', label: '📋 Orders' },
    { id: 'voorbereiding', label: '🔧 Voorbereiding' },
    { id: 'productie', label: '🏭 Productie' },
    { id: 'plaatsing', label: '🚚 Plaatsing' }
  ]

  // Helper: orders per fase
  const ordersGoedgekeurd = orders.filter(o => ['goedgekeurd'].includes(o.status))
  const ordersInProductie = orders.filter(o => ['in_productie', 'kwaliteitscontrole'].includes(o.status))
  const ordersVoorPlaatsing = orders.filter(o => ['klaar_voor_plaatsing', 'in_plaatsing', 'geplaatst'].includes(o.status))

  return (
    <div>
      <div className="bg-white rounded-lg border p-4 mb-4">
        <div className="flex justify-between items-start mb-4">
          <button onClick={onBack} className="text-blue-600 hover:text-blue-800">← Terug</button>
          <button
            onClick={() => onDeleteProject(project.id)}
            className="text-red-500 hover:text-red-700 text-sm"
          >
            🗑️ Verwijder project
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Projectnaam</label>
            <input
              type="text"
              value={editingProject.naam || ''}
              onChange={(e) => setEditingProject({ ...editingProject, naam: e.target.value })}
              onBlur={saveProjectDetails}
              className="w-full border rounded px-3 py-2 font-semibold"
              placeholder="Projectnaam..."
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Klant</label>
            <input
              type="text"
              value={editingProject.klant || ''}
              onChange={(e) => setEditingProject({ ...editingProject, klant: e.target.value })}
              onBlur={saveProjectDetails}
              className="w-full border rounded px-3 py-2"
              placeholder="Klantnaam..."
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Projectnummer</label>
            <input
              type="text"
              value={editingProject.project_nummer || ''}
              onChange={(e) => setEditingProject({ ...editingProject, project_nummer: e.target.value })}
              onBlur={saveProjectDetails}
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="PRJ-2024-001"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Kleur</label>
            <div className="flex gap-1 flex-wrap">
              {['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'].map(color => (
                <button
                  key={color}
                  onClick={() => { setEditingProject({ ...editingProject, kleur: color }); saveProjectDetails({ kleur: color }) }}
                  className={`w-8 h-8 rounded-full border-2 ${editingProject.kleur === color ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Emoji</label>
            <div className="flex gap-1 flex-wrap">
              {['🏠', '🏢', '🏗️', '🔧', '⭐', '🎨', '📦', '🚀', '💼', '🛠️', '🏭', '🪑'].map(emoji => (
                <button
                  key={emoji}
                  onClick={() => { setEditingProject({ ...editingProject, emoji: emoji }); saveProjectDetails({ emoji: emoji }) }}
                  className={`w-8 h-8 rounded border text-lg flex items-center justify-center ${editingProject.emoji === emoji ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="text-lg">💰 <strong className="text-green-600">€{totaalProject.toFixed(2)}</strong> • 📦 {orders.length} orders</div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={editingProject.actief !== false}
                onChange={(e) => {
                  setEditingProject({ ...editingProject, actief: e.target.checked })
                  saveProjectDetails({ actief: e.target.checked })
                }}
                className="rounded border-gray-300"
              />
              <span className={editingProject.actief !== false ? 'text-green-600 font-medium' : 'text-gray-400'}>
                {editingProject.actief !== false ? '✅ Actief' : 'Non-actief'}
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={editingProject.kanban_verborgen || false}
                onChange={(e) => {
                  setEditingProject({ ...editingProject, kanban_verborgen: e.target.checked })
                  saveProjectDetails({ kanban_verborgen: e.target.checked })
                }}
                className="rounded border-gray-300"
              />
              Verberg uit kanban bord
            </label>
          </div>
        </div>
      </div>

      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-gray-50 rounded-xl p-4">
        {activeTab === 'orders' && (
          <div className="space-y-4">
            {orders.map(order => {
              const items = orderItems[order.id] || []
              const { totaal } = calculateOrderTotals(items, order.offerte_korting, order.offerte_korting_type)
              const isExpanded = expandedOrder === order.id

              return (
                <div key={order.id} className="bg-white rounded-lg border overflow-hidden">
                  <div className="p-4 cursor-pointer hover:bg-gray-50 flex justify-between items-center" onClick={() => setExpandedOrder(isExpanded ? null : order.id)}>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400">{isExpanded ? '▼' : '▶'}</span>
                      <div>
                        {editingOrderId === order.id ? (
                          <input
                            type="text"
                            value={editingOrderNaam}
                            onChange={(e) => setEditingOrderNaam(e.target.value)}
                            onBlur={() => {
                              if (editingOrderNaam.trim()) {
                                updateOrder(order.id, { naam: editingOrderNaam.trim() })
                              }
                              setEditingOrderId(null)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (editingOrderNaam.trim()) {
                                  updateOrder(order.id, { naam: editingOrderNaam.trim() })
                                }
                                setEditingOrderId(null)
                              }
                              if (e.key === 'Escape') setEditingOrderId(null)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                            className="font-medium border rounded px-2 py-1"
                          />
                        ) : (
                          <h4
                            className="font-medium hover:text-blue-600 cursor-text"
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingOrderId(order.id)
                              setEditingOrderNaam(order.naam)
                            }}
                          >
                            {order.naam}
                          </h4>
                        )}
                        <div className="text-sm text-gray-500">{items.length} items</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-semibold text-green-600">€{totaal.toFixed(2)}</span>
                      {order.is_meerwerk && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium border border-amber-200">Meerwerk</span>}
                      <span className={`px-2 py-1 rounded text-xs font-medium border ${(orderStatusConfig[order.status] || orderStatusConfig.prijsvraag).kleur}`}>
                        {(orderStatusConfig[order.status] || orderStatusConfig.prijsvraag).label}
                      </span>
                      <button onClick={(e) => { e.stopPropagation(); deleteOrder(order.id) }} className="text-red-500 hover:text-red-700">✕</button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t p-4 bg-gray-50">
                      <div className="mb-4 flex flex-wrap gap-4 items-end">
                        <div>
                          <label className="block text-sm font-medium mb-1">Status</label>
                          <select value={order.status || 'prijsvraag'} onChange={(e) => updateOrder(order.id, { status: e.target.value })} className="border rounded-lg px-3 py-2 text-sm">
                            {Object.entries(orderStatusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Begrote uren</label>
                          <input type="number" step="0.5" min="0" value={order.begrote_uren || ''} onChange={(e) => updateOrder(order.id, { begrote_uren: parseFloat(e.target.value) || 0 })} className="border rounded-lg px-3 py-2 text-sm w-24" placeholder="0" />
                        </div>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={order.is_meerwerk || false} onChange={(e) => updateOrder(order.id, { is_meerwerk: e.target.checked })} className="w-4 h-4 rounded text-amber-600" />
                          <span className="text-amber-700 font-medium">Meerwerk</span>
                        </label>
                      </div>

                      <OrderItemsBuilder
                        orderItems={items}
                        bibliotheek={bibliotheek}
                        sjablonen={sjablonen}
                        onAddItem={(bibItem) => addItemToOrder(order.id, bibItem)}
                        onUpdateItem={(itemId, field, value) => updateOrderItem(order.id, itemId, field, value)}
                        onRemoveItem={(itemId) => removeOrderItem(order.id, itemId)}
                        onApplySjabloon={(sjabloon) => applySjabloonToOrder(order.id, sjabloon)}
                        korting={order.offerte_korting}
                        kortingType={order.offerte_korting_type}
                        onUpdateKorting={(field, value) => updateOrder(order.id, { [`offerte_${field}`]: value })}
                      />
                    </div>
                  )}
                </div>
              )
            })}

            <div className="flex gap-2 items-center">
              <input type="text" value={nieuwOrderNaam} onChange={(e) => setNieuwOrderNaam(e.target.value)} placeholder="Nieuwe order naam..." className="flex-1 border rounded-lg px-3 py-2" onKeyDown={(e) => e.key === 'Enter' && addOrder()} />
              <label className="flex items-center gap-1.5 text-xs cursor-pointer whitespace-nowrap">
                <input type="checkbox" checked={nieuwOrderMeerwerk} onChange={(e) => setNieuwOrderMeerwerk(e.target.checked)} className="w-3.5 h-3.5 rounded text-amber-600" />
                <span className="text-amber-700">Meerwerk</span>
              </label>
              <button onClick={addOrder} disabled={saving || !nieuwOrderNaam.trim()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                + Order
              </button>
            </div>
          </div>
        )}

        {activeTab === 'voorbereiding' && (
          <div className="space-y-3">
            {ordersGoedgekeurd.length > 0 && (
              <div className="bg-blue-50 rounded-xl p-3 mb-2 text-sm text-blue-700">
                ℹ️ Vink tekening en materiaal af. Als <strong>beide klaar</strong> zijn, kan de order naar productie.
              </div>
            )}
            {ordersGoedgekeurd.map(order => (
              <div key={order.id} className={`bg-white rounded-xl border-2 p-4 transition-all ${kanNaarProductie(order) ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-800">{order.naam}</h4>
                    {order.is_meerwerk && <span className="text-xs text-amber-600 font-medium">Meerwerk</span>}
                  </div>
                  {kanNaarProductie(order) && (
                    <button onClick={() => updateOrder(order.id, { status: 'in_productie' })} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors shadow-sm">
                      ▶ Start productie
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Tekening track */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs font-medium text-gray-500 mb-2">📐 Tekening</div>
                    <label className="flex items-center gap-2 mb-2 cursor-pointer">
                      <input type="checkbox" checked={order.tekening_klaar || false} onChange={(e) => updateOrder(order.id, { tekening_klaar: e.target.checked })} className="w-5 h-5 rounded text-blue-600" />
                      <span className={`text-sm ${order.tekening_klaar ? 'text-green-700 font-medium' : 'text-gray-600'}`}>Tekening klaar</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={order.tekening_goedgekeurd || false} onChange={(e) => updateOrder(order.id, { tekening_goedgekeurd: e.target.checked })} className="w-5 h-5 rounded text-blue-600" disabled={!order.tekening_klaar} />
                      <span className={`text-sm ${order.tekening_goedgekeurd ? 'text-green-700 font-medium' : 'text-gray-600'}`}>Goedgekeurd door klant</span>
                    </label>
                  </div>

                  {/* Materiaal track */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs font-medium text-gray-500 mb-2">📦 Materiaal</div>
                    <label className="flex items-center gap-2 mb-2 cursor-pointer">
                      <input type="checkbox" checked={order.materiaal_besteld || false} onChange={(e) => updateOrder(order.id, { materiaal_besteld: e.target.checked })} className="w-5 h-5 rounded text-amber-600" />
                      <span className={`text-sm ${order.materiaal_besteld ? 'text-green-700 font-medium' : 'text-gray-600'}`}>Materiaal besteld</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={order.materiaal_binnen || false} onChange={(e) => updateOrder(order.id, { materiaal_binnen: e.target.checked })} className="w-5 h-5 rounded text-amber-600" disabled={!order.materiaal_besteld} />
                      <span className={`text-sm ${order.materiaal_binnen ? 'text-green-700 font-medium' : 'text-gray-600'}`}>Materiaal binnen</span>
                    </label>
                  </div>
                </div>
              </div>
            ))}
            {ordersGoedgekeurd.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <div className="text-3xl mb-2">🔧</div>
                Geen goedgekeurde orders om voor te bereiden
              </div>
            )}
          </div>
        )}

        {activeTab === 'productie' && (
          <div className="space-y-3">
            {ordersInProductie.map(order => (
              <div key={order.id} className="bg-white rounded-xl border p-4">
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-800">{order.naam}</h4>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${(orderStatusConfig[order.status] || {}).kleur || ''}`}>
                      {(orderStatusConfig[order.status] || {}).label}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {order.status === 'in_productie' && (
                      <button onClick={() => updateOrder(order.id, { status: 'kwaliteitscontrole' })} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
                        🔍 Naar controle
                      </button>
                    )}
                    {order.status === 'kwaliteitscontrole' && (
                      <button onClick={() => updateOrder(order.id, { status: 'klaar_voor_plaatsing' })} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
                        ✅ Goedgekeurd — klaar
                      </button>
                    )}
                  </div>
                </div>
                <SnelUrenInvoer orderId={order.id} projectId={project.id} medewerkers={medewerkers} />
                <OrderProducten orderId={order.id} />
              </div>
            ))}
            {ordersInProductie.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <div className="text-3xl mb-2">🏭</div>
                Geen orders in productie
              </div>
            )}
          </div>
        )}

        {activeTab === 'plaatsing' && (
          <div className="space-y-3">
            {ordersVoorPlaatsing.map(order => (
              <div key={order.id} className="bg-white rounded-xl border p-4">
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-800">{order.naam}</h4>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${(orderStatusConfig[order.status] || {}).kleur || ''}`}>
                      {(orderStatusConfig[order.status] || {}).label}
                    </span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <input type="date" value={order.plaatsing_datum || ''} onChange={(e) => updateOrder(order.id, { plaatsing_datum: e.target.value })} className="border rounded-lg px-3 py-1.5 text-sm" />
                    {order.status === 'klaar_voor_plaatsing' && (
                      <button onClick={() => updateOrder(order.id, { status: 'in_plaatsing' })} className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700">
                        🚚 Start plaatsing
                      </button>
                    )}
                    {order.status === 'in_plaatsing' && (
                      <button onClick={() => updateOrder(order.id, { status: 'geplaatst' })} className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700">
                        🏠 Geplaatst
                      </button>
                    )}
                    {order.status === 'geplaatst' && (
                      <button onClick={() => updateOrder(order.id, { status: 'opgeleverd' })} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
                        🎉 Opgeleverd
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {ordersVoorPlaatsing.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <div className="text-3xl mb-2">🚚</div>
                Geen orders klaar voor of in plaatsing
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
