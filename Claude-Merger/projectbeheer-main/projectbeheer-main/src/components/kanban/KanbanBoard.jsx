import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { orderStatusConfig, kanbanKolommen, orderStatusVolgorde } from '../../config/constants'
import { kanNaarProductie } from '../../utils/calculations'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { KanbanOrderModal } from './KanbanOrderModal'

export const KanbanBoard = ({ projecten }) => {
  const [allOrders, setAllOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [draggedOrder, setDraggedOrder] = useState(null)
  const [dragOverColumn, setDragOverColumn] = useState(null)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [collapsedGroups, setCollapsedGroups] = useState({})

  const toggleGroup = (kolomId, projectId) => {
    const key = `${kolomId}-${projectId}`
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }))
  }

  useEffect(() => {
    const loadAllOrders = async () => {
      try {
        const { data: orders } = await supabase.from('orders').select('*')
        const verborgenProjectIds = projecten.filter(p => p.kanban_verborgen).map(p => p.id)
        const ordersWithProject = (orders || [])
          .filter(o => !verborgenProjectIds.includes(o.project_id))
          .map(o => ({
            ...o,
            project: projecten.find(p => p.id === o.project_id)
          }))
        setAllOrders(ordersWithProject)
      } catch (e) {
        console.error('Fout:', e)
      }
      setLoading(false)
    }
    loadAllOrders()
  }, [projecten])

  const handleOrderUpdate = (updatedOrder) => {
    setAllOrders(allOrders.map(o => o.id === updatedOrder.id ? { ...updatedOrder, project: o.project } : o))
  }

  // Toggle een enkel veld op een order (tekening_klaar, tekening_goedgekeurd, materiaal_besteld, materiaal_binnen)
  const toggleOrderField = async (e, order, field) => {
    e.stopPropagation()
    const newVal = !order[field]
    try {
      await supabase.from('orders').update({ [field]: newVal }).eq('id', order.id)
      setAllOrders(prev => prev.map(o => o.id === order.id ? { ...o, [field]: newVal } : o))
    } catch (err) {
      alert('Fout: ' + err.message)
    }
  }

  // Bulk update een veld voor meerdere orders tegelijk
  const bulkUpdateField = async (e, orderIds, field, value) => {
    e.stopPropagation()
    try {
      await supabase.from('orders').update({ [field]: value }).in('id', orderIds)
      setAllOrders(prev => prev.map(o => orderIds.includes(o.id) ? { ...o, [field]: value } : o))
    } catch (err) {
      alert('Fout: ' + err.message)
    }
  }

  // Map kanban column to default status when dropping
  const getDropStatus = (targetKolom) => {
    switch (targetKolom) {
      case 'offerte': return 'prijsvraag'
      case 'voorbereiding': return 'goedgekeurd'
      case 'productie': return 'in_productie'
      case 'plaatsing': return 'klaar_voor_plaatsing'
      case 'afgerond': return 'opgeleverd'
      default: return 'prijsvraag'
    }
  }

  const handleDragStart = (e, order) => {
    setDraggedOrder(order)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, columnId) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverColumn(columnId)
  }

  const handleDragLeave = () => setDragOverColumn(null)

  const handleDrop = async (e, targetColumn) => {
    e.preventDefault()
    setDragOverColumn(null)
    if (!draggedOrder) return

    const newStatus = getDropStatus(targetColumn)

    // Block moving to productie if not ready
    if (targetColumn === 'productie' && !kanNaarProductie(draggedOrder)) {
      alert('Deze order kan nog niet naar productie: tekening moet goedgekeurd zijn EN materiaal moet binnen zijn.')
      setDraggedOrder(null)
      return
    }

    try {
      await supabase.from('orders').update({ status: newStatus }).eq('id', draggedOrder.id)
      setAllOrders(allOrders.map(o => o.id === draggedOrder.id ? { ...o, status: newStatus } : o))
    } catch (err) {
      alert('Fout bij verplaatsen: ' + err.message)
    }
    setDraggedOrder(null)
  }

  const handleDragEnd = () => {
    setDraggedOrder(null)
    setDragOverColumn(null)
  }

  if (loading) return <LoadingSpinner />

  // Group orders by kanban columns using the new status
  const getOrderKolom = (order) => {
    const status = order.status || 'prijsvraag'
    for (const kolom of kanbanKolommen) {
      if (kolom.statussen.includes(status)) return kolom.id
    }
    return 'offerte'
  }

  const kolomColors = {
    offerte: { bg: 'bg-orange-50', border: 'border-orange-300' },
    voorbereiding: { bg: 'bg-blue-50', border: 'border-blue-300' },
    productie: { bg: 'bg-purple-50', border: 'border-purple-300' },
    plaatsing: { bg: 'bg-cyan-50', border: 'border-cyan-300' },
    afgerond: { bg: 'bg-green-50', border: 'border-green-300' }
  }

  const kolommen = kanbanKolommen.map(k => ({
    ...k,
    ...(kolomColors[k.id] || {}),
    orders: allOrders.filter(o => getOrderKolom(o) === k.id)
  }))

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3" style={{ minWidth: 0 }}>
        {kolommen.map(kolom => (
          <div
            key={kolom.id}
            className={`${kolom.bg} rounded-xl p-3 min-h-64 transition-all flex flex-col ${
              dragOverColumn === kolom.id ? `ring-2 ring-offset-2 ${kolom.border} ring-current` : ''
            }`}
            onDragOver={(e) => handleDragOver(e, kolom.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, kolom.id)}
          >
            <div className="font-semibold text-sm mb-3 pb-2 border-b border-gray-200/50 flex justify-between items-center">
              <span>{kolom.label}</span>
              <span className="text-[10px] font-bold bg-white/70 px-2 py-0.5 rounded-full text-gray-500">{kolom.orders.length}</span>
            </div>
            <div className="space-y-3 flex-1">
              {(() => {
                // Groepeer orders per project
                const perProject = {}
                kolom.orders.forEach(order => {
                  const pId = order.project_id || 'geen'
                  if (!perProject[pId]) perProject[pId] = { project: order.project, orders: [] }
                  perProject[pId].orders.push(order)
                })
                const meerdereProjecten = Object.keys(perProject).length > 1
                return Object.values(perProject).map(groep => {
                  const groepKey = `${kolom.id}-${groep.project?.id || 'geen'}`
                  const isCollapsed = collapsedGroups[groepKey]
                  return (
                  <div key={groep.project?.id || 'geen'}>
                    {meerdereProjecten && (
                      <div
                        className="text-[11px] font-semibold text-gray-500 mb-1.5 flex items-center gap-1 cursor-pointer select-none hover:opacity-80 transition-opacity"
                        style={{ color: groep.project?.kleur || undefined }}
                        onClick={() => toggleGroup(kolom.id, groep.project?.id || 'geen')}
                      >
                        <span className={`text-[9px] transition-transform inline-block ${isCollapsed ? '' : 'rotate-90'}`}>▶</span>
                        {groep.project?.emoji || '📁'} {groep.project?.naam || 'Geen project'}
                        <span className="text-[10px] font-normal text-gray-400">({groep.orders.length})</span>
                      </div>
                    )}
                    {!isCollapsed && kolom.id === 'voorbereiding' && groep.orders.length > 1 && (
                      <div className="flex flex-wrap gap-1 mb-2 ml-0.5">
                        {(() => {
                          const ids = groep.orders.map(o => o.id)
                          const allTekOk = groep.orders.every(o => o.tekening_goedgekeurd)
                          const allMatBesteld = groep.orders.every(o => o.materiaal_besteld)
                          const allMatBinnen = groep.orders.every(o => o.materiaal_binnen)
                          return (
                            <>
                              <button
                                onClick={(e) => bulkUpdateField(e, ids, 'tekening_goedgekeurd', !allTekOk)}
                                className={`text-[9px] px-2 py-1 rounded border transition-colors ${
                                  allTekOk
                                    ? 'bg-green-100 text-green-700 border-green-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300'
                                    : 'bg-white text-gray-500 border-gray-300 hover:bg-green-50 hover:text-green-700 hover:border-green-400'
                                }`}
                                title={allTekOk ? 'Alle tekeningen ongedaan maken' : 'Alle tekeningen goedkeuren'}
                              >
                                📐 Alle tek {allTekOk ? '✓' : '→ ✓'}
                              </button>
                              <button
                                onClick={(e) => bulkUpdateField(e, ids, 'materiaal_besteld', !allMatBesteld)}
                                className={`text-[9px] px-2 py-1 rounded border transition-colors ${
                                  allMatBesteld
                                    ? 'bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300'
                                    : 'bg-white text-gray-500 border-gray-300 hover:bg-yellow-50 hover:text-yellow-700 hover:border-yellow-400'
                                }`}
                                title={allMatBesteld ? 'Alle bestellingen ongedaan maken' : 'Alle materialen als besteld markeren'}
                              >
                                🛒 Alle besteld {allMatBesteld ? '✓' : '→ ✓'}
                              </button>
                              <button
                                onClick={(e) => bulkUpdateField(e, ids, 'materiaal_binnen', !allMatBinnen)}
                                className={`text-[9px] px-2 py-1 rounded border transition-colors ${
                                  allMatBinnen
                                    ? 'bg-green-100 text-green-700 border-green-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300'
                                    : 'bg-white text-gray-500 border-gray-300 hover:bg-green-50 hover:text-green-700 hover:border-green-400'
                                }`}
                                title={allMatBinnen ? 'Alle materiaal-binnen ongedaan maken' : 'Alle materialen als binnen markeren'}
                              >
                                📦 Alle binnen {allMatBinnen ? '✓' : '→ ✓'}
                              </button>
                            </>
                          )
                        })()}
                      </div>
                    )}
                    {!isCollapsed && (
                    <div className="space-y-2">
                      {groep.orders.map(order => {
                        const statusCfg = orderStatusConfig[order.status] || orderStatusConfig.prijsvraag
                        return (
                          <div
                            key={order.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, order)}
                            onDragEnd={handleDragEnd}
                            onClick={() => setSelectedOrder(order)}
                            className={`rounded-lg border p-2 text-sm shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${
                              order.dringend ? 'bg-red-50 border-red-300' : 'bg-white border-gray-200 hover:border-gray-300'
                            } ${draggedOrder?.id === order.id ? 'opacity-40' : ''}`}
                            style={groep.project?.kleur ? { borderLeftColor: groep.project.kleur, borderLeftWidth: '3px' } : {}}
                          >
                            <div className="flex justify-between items-start gap-1">
                              <div className="font-medium text-gray-800 flex items-center gap-1 text-xs leading-tight min-w-0">
                                {order.dringend && <span className="text-red-500 shrink-0">🚨</span>}
                                {order.is_meerwerk && <span className="text-amber-500 shrink-0 text-[10px] font-bold">MW</span>}
                                <span className="truncate">{order.naam}</span>
                              </div>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${statusCfg.kleur}`}>{statusCfg.label}</span>
                            </div>
                            {Object.keys(perProject).length <= 1 && (
                              <div className="text-[10px] text-gray-400 mt-0.5 truncate">{order.project?.emoji} {order.project?.naam}</div>
                            )}
                            {kolom.id === 'voorbereiding' && (
                              <div className="flex items-center gap-1 mt-1 flex-wrap">
                                <button
                                  onClick={(e) => toggleOrderField(e, order, 'tekening_goedgekeurd')}
                                  className={`text-[9px] px-1.5 py-0.5 rounded flex items-center gap-0.5 transition-colors cursor-pointer border ${
                                    order.tekening_goedgekeurd
                                      ? 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200'
                                      : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300'
                                  }`}
                                  title={order.tekening_goedgekeurd ? 'Tekening: goedgekeurd (klik om ongedaan te maken)' : 'Klik om tekening als goedgekeurd te markeren'}
                                >
                                  📐 Tek{order.tekening_goedgekeurd ? ' ✓' : ''}
                                </button>
                                <button
                                  onClick={(e) => toggleOrderField(e, order, 'materiaal_besteld')}
                                  className={`text-[9px] px-1.5 py-0.5 rounded flex items-center gap-0.5 transition-colors cursor-pointer border ${
                                    order.materiaal_besteld
                                      ? 'bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200'
                                      : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-yellow-50 hover:text-yellow-600 hover:border-yellow-300'
                                  }`}
                                  title={order.materiaal_besteld ? 'Materiaal besteld (klik om ongedaan te maken)' : 'Klik om materiaal als besteld te markeren'}
                                >
                                  🛒{order.materiaal_besteld ? ' ✓' : ''}
                                </button>
                                <button
                                  onClick={(e) => toggleOrderField(e, order, 'materiaal_binnen')}
                                  className={`text-[9px] px-1.5 py-0.5 rounded flex items-center gap-0.5 transition-colors cursor-pointer border ${
                                    order.materiaal_binnen
                                      ? 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200'
                                      : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300'
                                  }`}
                                  title={order.materiaal_binnen ? 'Materiaal binnen (klik om ongedaan te maken)' : 'Klik om materiaal als binnen te markeren'}
                                >
                                  📦{order.materiaal_binnen ? ' ✓' : ''}
                                </button>
                              </div>
                            )}
                            {order.begrote_uren > 0 && (
                              <div className="text-[9px] text-gray-400 mt-0.5">⏱ {order.begrote_uren}u begroot</div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    )}
                  </div>
                  )
                })
              })()}
            </div>
          </div>
        ))}
      </div>

      {selectedOrder && (
        <KanbanOrderModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdate={handleOrderUpdate}
        />
      )}
    </>
  )
}
