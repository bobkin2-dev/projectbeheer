import React, { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../supabase'
import { eenheden, bibCategorieen } from '../../config/constants'

// Bibliotheek Beheer
export const BibliotheekBeheer = ({ bibliotheek, leveranciers: propLeveranciers, onRefresh }) => {
  const [activeCategorie, setActiveCategorie] = useState('materialen')
  const [activeLeverancier, setActiveLeverancier] = useState(null)
  const [activeSubcategorie, setActiveSubcategorie] = useState(null)
  const [nieuwItem, setNieuwItem] = useState({
    artikelnummer: '', naam: '', omschrijving: '', eenheid: 'stuk',
    subcategorie: '', catalogusprijs: '', korting: '', eindprijs: '', leverancier: ''
  })
  const [zoek, setZoek] = useState('')
  const [saving, setSaving] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showLeverancierBeheer, setShowLeverancierBeheer] = useState(false)
  const [importData, setImportData] = useState(null)
  const [columnMapping, setColumnMapping] = useState({})
  const [importing, setImporting] = useState(false)
  const [expandedLeveranciers, setExpandedLeveranciers] = useState({})
  const [uitgebreideWeergave, setUitgebreideWeergave] = useState(false)
  const [nieuweLeverancier, setNieuweLeverancier] = useState('')
  const [leveranciers, setLeveranciers] = useState([])
  const [editItem, setEditItem] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [prijsMode, setPrijsMode] = useState('direct')
  const [weergave, setWeergave] = useState('lijst')
  const [editSubcategorie, setEditSubcategorie] = useState(null)
  const [nieuweSubcategorie, setNieuweSubcategorie] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    loadLeveranciers()
  }, [])

  const loadLeveranciers = async () => {
    try {
      const { data } = await supabase.from('leveranciers').select('*').order('naam')
      setLeveranciers(data || [])
    } catch (e) {
      console.error('Fout bij laden leveranciers:', e)
    }
  }

  const items = bibliotheek.filter(i => i.categorie === activeCategorie)

  const materialenLeveranciers = activeCategorie === 'materialen'
    ? [...new Set(items.map(i => i.leverancier).filter(Boolean))].sort()
    : []

  const subcategorieen = activeLeverancier
    ? [...new Set(items.filter(i => i.leverancier === activeLeverancier).map(i => i.subcategorie).filter(Boolean))].sort()
    : []

  const effectieveCategorie = weergave === 'catalogus' ? 'materialen' : activeCategorie
  const effectieveItems = bibliotheek.filter(i => i.categorie === effectieveCategorie)

  const gefilterdeItems = effectieveItems.filter(item => {
    const matchZoek = zoek === '' ||
      item.naam?.toLowerCase().includes(zoek.toLowerCase()) ||
      item.artikelnummer?.toLowerCase().includes(zoek.toLowerCase()) ||
      item.omschrijving?.toLowerCase().includes(zoek.toLowerCase())
    const matchLeverancier = !activeLeverancier || item.leverancier === activeLeverancier
    const matchSubcategorie = !activeSubcategorie || item.subcategorie === activeSubcategorie ||
      (activeSubcategorie === 'Zonder subcategorie' && !item.subcategorie)
    return matchZoek && matchLeverancier && matchSubcategorie
  })

  const addLeverancier = async () => {
    if (!nieuweLeverancier.trim()) return
    try {
      await supabase.from('leveranciers').insert({ naam: nieuweLeverancier.trim() })
      setNieuweLeverancier('')
      loadLeveranciers()
    } catch (e) {
      alert('Fout: ' + e.message)
    }
  }

  const deleteLeverancier = async (id) => {
    if (!confirm('Weet je zeker dat je deze leverancier wilt verwijderen?')) return
    try {
      await supabase.from('leveranciers').delete().eq('id', id)
      loadLeveranciers()
    } catch (e) {
      alert('Fout: ' + e.message)
    }
  }

  const updateLeverancierNaam = async (id, nieuweNaam) => {
    try {
      await supabase.from('leveranciers').update({ naam: nieuweNaam }).eq('id', id)
      loadLeveranciers()
    } catch (e) {
      alert('Fout: ' + e.message)
    }
  }

  const renameSubcategorie = async (oudeNaam, nieuweNaam, leverancier) => {
    if (!nieuweNaam.trim() || oudeNaam === nieuweNaam) return
    try {
      await supabase.from('bibliotheek')
        .update({ subcategorie: nieuweNaam.trim() })
        .eq('subcategorie', oudeNaam)
        .eq('leverancier', leverancier)
      onRefresh()
      setEditSubcategorie(null)
    } catch (e) {
      alert('Fout: ' + e.message)
    }
  }

  const deleteSubcategorie = async (subcategorieNaam, leverancier) => {
    if (!confirm(`Weet je zeker dat je subcategorie "${subcategorieNaam}" wilt verwijderen? De items blijven bestaan maar zonder subcategorie.`)) return
    try {
      await supabase.from('bibliotheek')
        .update({ subcategorie: null })
        .eq('subcategorie', subcategorieNaam)
        .eq('leverancier', leverancier)
      onRefresh()
    } catch (e) {
      alert('Fout: ' + e.message)
    }
  }

  const getLeveranciersOverzicht = () => {
    const overzicht = {}
    bibliotheek.filter(i => i.categorie === 'materialen' && i.leverancier).forEach(item => {
      if (!overzicht[item.leverancier]) {
        overzicht[item.leverancier] = { totaal: 0, subcategorieen: {} }
      }
      overzicht[item.leverancier].totaal++
      const sub = item.subcategorie || 'Zonder subcategorie'
      overzicht[item.leverancier].subcategorieen[sub] = (overzicht[item.leverancier].subcategorieen[sub] || 0) + 1
    })
    return overzicht
  }

  const leveranciersOverzicht = getLeveranciersOverzicht()

  const addItem = async () => {
    if (!nieuwItem.naam) return
    setSaving(true)
    try {
      const catalogusprijs = parseFloat(nieuwItem.catalogusprijs) || 0
      const korting = parseFloat(nieuwItem.korting) || 0
      const eindprijs = nieuwItem.eindprijs ? parseFloat(nieuwItem.eindprijs) : catalogusprijs * (1 - korting / 100)

      await supabase.from('bibliotheek').insert({
        categorie: activeCategorie,
        artikelnummer: nieuwItem.artikelnummer || null,
        naam: nieuwItem.naam,
        omschrijving: nieuwItem.omschrijving || null,
        eenheid: nieuwItem.eenheid,
        subcategorie: nieuwItem.subcategorie || null,
        catalogusprijs: catalogusprijs,
        korting: korting,
        prijs: eindprijs,
        leverancier: nieuwItem.leverancier || null
      })
      setNieuwItem({
        artikelnummer: '', naam: '', omschrijving: '', eenheid: 'stuk',
        subcategorie: '', catalogusprijs: '', korting: '', eindprijs: '', leverancier: ''
      })
      onRefresh()
    } catch (e) {
      alert('Fout bij toevoegen: ' + e.message)
    }
    setSaving(false)
  }

  const updateItem = async (id, field, value) => {
    try {
      let updateData = { [field]: value }

      if (field === 'catalogusprijs' || field === 'korting') {
        const item = bibliotheek.find(i => i.id === id)
        const catalogusprijs = field === 'catalogusprijs' ? parseFloat(value) || 0 : (item?.catalogusprijs || 0)
        const korting = field === 'korting' ? parseFloat(value) || 0 : (item?.korting || 0)
        updateData.prijs = catalogusprijs * (1 - korting / 100)
        updateData[field] = parseFloat(value) || 0
      } else if (field === 'prijs') {
        updateData.prijs = parseFloat(value) || 0
      }

      await supabase.from('bibliotheek').update(updateData).eq('id', id)
      onRefresh()
    } catch (e) {
      alert('Fout bij updaten: ' + e.message)
    }
  }

  const deleteItem = async (id) => {
    try {
      await supabase.from('bibliotheek').delete().eq('id', id)
      onRefresh()
    } catch (e) {
      alert('Fout bij verwijderen: ' + e.message)
    }
  }

  const openEditModal = (item) => {
    setEditItem(item)
    setEditForm({ ...item })
    if (item.catalogusprijs && item.catalogusprijs > 0) {
      setPrijsMode('berekend')
    } else {
      setPrijsMode('direct')
    }
  }

  const saveEditModal = async () => {
    if (!editForm.naam) return
    setSaving(true)
    try {
      let prijs = parseFloat(editForm.prijs) || 0

      if (prijsMode === 'berekend') {
        const catalogusprijs = parseFloat(editForm.catalogusprijs) || 0
        const korting = parseFloat(editForm.korting) || 0
        prijs = catalogusprijs * (1 - korting / 100)
      }

      await supabase.from('bibliotheek').update({
        artikelnummer: editForm.artikelnummer || null,
        naam: editForm.naam,
        omschrijving: editForm.omschrijving || null,
        eenheid: editForm.eenheid,
        subcategorie: editForm.subcategorie || null,
        catalogusprijs: prijsMode === 'berekend' ? (parseFloat(editForm.catalogusprijs) || 0) : 0,
        korting: prijsMode === 'berekend' ? (parseFloat(editForm.korting) || 0) : 0,
        prijs: prijs,
        leverancier: editForm.leverancier || null
      }).eq('id', editItem.id)

      setEditItem(null)
      onRefresh()
    } catch (e) {
      alert('Fout bij opslaan: ' + e.message)
    }
    setSaving(false)
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

        if (jsonData.length < 2) {
          alert('Excel bestand bevat geen data')
          return
        }

        const headers = jsonData[0]
        const rows = jsonData.slice(1).filter(row => row.some(cell => cell !== undefined && cell !== ''))

        const autoMapping = {}
        headers.forEach((header, index) => {
          const h = String(header).toLowerCase()
          if (h.includes('artikelnr') || h.includes('article') || h.includes('artnr')) autoMapping.artikelnummer = index
          else if (h.includes('naam') || h.includes('name') || h.includes('product')) autoMapping.naam = index
          else if (h.includes('omschrijving') || h.includes('description') || h.includes('desc')) autoMapping.omschrijving = index
          else if (h.includes('eenheid') || h.includes('unit')) autoMapping.eenheid = index
          else if (h.includes('categorie') || h.includes('category') || h.includes('groep')) autoMapping.subcategorie = index
          else if (h.includes('catalogus') || h.includes('bruto') || h.includes('lijst')) autoMapping.catalogusprijs = index
          else if (h.includes('korting') || h.includes('discount')) autoMapping.korting = index
          else if (h.includes('eind') || h.includes('netto') || h.includes('prijs') || h.includes('price')) autoMapping.eindprijs = index
        })

        setColumnMapping(autoMapping)
        setImportData({ headers, rows })
        setShowImport(true)
      } catch (err) {
        alert('Fout bij lezen Excel: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const handleImport = async () => {
    if (columnMapping.naam === undefined) {
      alert('Koppel minstens de kolom "Naam"')
      return
    }

    setImporting(true)
    try {
      const parseNum = (val) => {
        if (val === null || val === undefined || val === '') return 0
        return parseFloat(String(val).replace(',', '.').replace(/[^0-9.-]/g, '')) || 0
      }

      const importItems = importData.rows.map(row => {
        const getValue = (key) => columnMapping[key] !== undefined ? row[columnMapping[key]] : null
        const catalogusprijs = parseNum(getValue('catalogusprijs'))
        const korting = parseNum(getValue('korting'))
        const eindprijs = getValue('eindprijs') ? parseNum(getValue('eindprijs')) : catalogusprijs * (1 - korting / 100)

        return {
          categorie: activeCategorie,
          artikelnummer: getValue('artikelnummer') ? String(getValue('artikelnummer')).trim() : null,
          naam: String(getValue('naam') || '').trim(),
          omschrijving: getValue('omschrijving') ? String(getValue('omschrijving')).trim() : null,
          eenheid: getValue('eenheid') || 'stuk',
          subcategorie: getValue('subcategorie') ? String(getValue('subcategorie')).trim() : null,
          catalogusprijs: catalogusprijs,
          korting: korting,
          prijs: eindprijs,
          leverancier: activeLeverancier || null
        }
      }).filter(item => item.naam)

      if (importItems.length === 0) {
        alert('Geen geldige items gevonden')
        setImporting(false)
        return
      }

      const { error } = await supabase.from('bibliotheek').insert(importItems)
      if (error) throw error

      alert(`${importItems.length} items geïmporteerd!`)
      setShowImport(false)
      setImportData(null)
      onRefresh()
    } catch (e) {
      alert('Import fout: ' + e.message)
    }
    setImporting(false)
  }

  const toggleLeverancier = (lev) => {
    if (activeLeverancier === lev) {
      setActiveLeverancier(null)
      setActiveSubcategorie(null)
    } else {
      setActiveLeverancier(lev)
      setActiveSubcategorie(null)
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">📚 Bibliotheek</h2>
        <div className="flex gap-2">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setWeergave('lijst')}
              className={`px-3 py-1 rounded text-sm ${weergave === 'lijst' ? 'bg-white shadow' : ''}`}
            >
              📄 Lijst
            </button>
            <button
              onClick={() => setWeergave('catalogus')}
              className={`px-3 py-1 rounded text-sm ${weergave === 'catalogus' ? 'bg-white shadow' : ''}`}
            >
              📖 Catalogus
            </button>
          </div>
          {weergave === 'lijst' && (
            <button
              onClick={() => setUitgebreideWeergave(!uitgebreideWeergave)}
              className={`px-3 py-1.5 rounded text-sm ${uitgebreideWeergave ? 'bg-blue-100 text-blue-700' : 'bg-gray-100'}`}
            >
              {uitgebreideWeergave ? '📋 Uitgebreid' : '📄 Compact'}
            </button>
          )}
          <button
            onClick={() => setShowLeverancierBeheer(!showLeverancierBeheer)}
            className="px-3 py-1.5 bg-gray-100 rounded text-sm hover:bg-gray-200"
          >
            ⚙️ Beheer
          </button>
        </div>
      </div>

      {/* Leverancier & Subcategorie Beheer Modal */}
      {showLeverancierBeheer && (
        <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-medium">🏢 Leveranciers & Subcategorieën beheren</h4>
            <button onClick={() => setShowLeverancierBeheer(false)} className="text-gray-500">✕</button>
          </div>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={nieuweLeverancier}
              onChange={(e) => setNieuweLeverancier(e.target.value)}
              placeholder="Nieuwe leverancier toevoegen..."
              className="flex-1 border rounded px-3 py-2"
              onKeyDown={(e) => e.key === 'Enter' && addLeverancier()}
            />
            <button onClick={addLeverancier} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">+ Leverancier</button>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {leveranciers.map(lev => {
              const overzicht = leveranciersOverzicht[lev.naam] || { totaal: 0, subcategorieen: {} }
              const subs = Object.entries(overzicht.subcategorieen).sort((a, b) => a[0].localeCompare(b[0]))

              return (
                <div key={lev.id} className="bg-white rounded-lg border p-3">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{lev.naam}</span>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{overzicht.totaal} items</span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          const nieuweNaam = prompt('Nieuwe naam voor leverancier:', lev.naam)
                          if (nieuweNaam && nieuweNaam !== lev.naam) {
                            updateLeverancierNaam(lev.id, nieuweNaam)
                          }
                        }}
                        className="text-blue-500 hover:text-blue-700 text-sm px-2"
                      >✏️</button>
                      <button onClick={() => deleteLeverancier(lev.id)} className="text-red-500 hover:text-red-700 text-sm px-2">🗑️</button>
                    </div>
                  </div>

                  {subs.length > 0 && (
                    <div className="mt-2 pl-4 border-l-2 border-gray-200 space-y-1">
                      <div className="text-xs text-gray-500 mb-1">Subcategorieën:</div>
                      {subs.map(([subNaam, count]) => (
                        <div key={subNaam} className="flex justify-between items-center text-sm py-1 hover:bg-gray-50 rounded px-2 -mx-2">
                          {editSubcategorie === `${lev.naam}-${subNaam}` ? (
                            <input
                              type="text"
                              defaultValue={subNaam === 'Zonder subcategorie' ? '' : subNaam}
                              autoFocus
                              onBlur={(e) => {
                                if (subNaam !== 'Zonder subcategorie') {
                                  renameSubcategorie(subNaam, e.target.value, lev.naam)
                                }
                                setEditSubcategorie(null)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  if (subNaam !== 'Zonder subcategorie') {
                                    renameSubcategorie(subNaam, e.target.value, lev.naam)
                                  }
                                  setEditSubcategorie(null)
                                }
                                if (e.key === 'Escape') setEditSubcategorie(null)
                              }}
                              className="border rounded px-2 py-0.5 text-sm flex-1 mr-2"
                            />
                          ) : (
                            <>
                              <span className={subNaam === 'Zonder subcategorie' ? 'text-gray-400 italic' : ''}>
                                {subNaam}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">{count}</span>
                                {subNaam !== 'Zonder subcategorie' && (
                                  <>
                                    <button
                                      onClick={() => setEditSubcategorie(`${lev.naam}-${subNaam}`)}
                                      className="text-blue-500 hover:text-blue-700 text-xs"
                                    >✏️</button>
                                    <button
                                      onClick={() => deleteSubcategorie(subNaam, lev.naam)}
                                      className="text-red-500 hover:text-red-700 text-xs"
                                    >🗑️</button>
                                  </>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            {leveranciers.length === 0 && <p className="text-gray-500 text-sm text-center py-4">Nog geen leveranciers</p>}
          </div>
        </div>
      )}

      {/* CATALOGUS WEERGAVE */}
      {weergave === 'catalogus' ? (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-4 lg:col-span-3">
            <div className="bg-white rounded-lg border sticky top-20">
              <div className="p-3 border-b bg-gray-50">
                <h3 className="font-medium text-sm">📖 Catalogus - Materialen</h3>
              </div>
              <div className="max-h-[70vh] overflow-y-auto">
                <button
                  onClick={() => { setActiveCategorie('materialen'); setActiveLeverancier(null); setActiveSubcategorie(null) }}
                  className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 ${!activeLeverancier ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
                >
                  <div className="font-medium">Alle materialen</div>
                  <div className="text-xs text-gray-500">{bibliotheek.filter(i => i.categorie === 'materialen').length} items</div>
                </button>

                {Object.entries(leveranciersOverzicht).sort((a, b) => a[0].localeCompare(b[0])).map(([levNaam, data]) => (
                  <div key={levNaam} className="border-b">
                    <button
                      onClick={() => { setActiveLeverancier(levNaam); setActiveSubcategorie(null) }}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 flex justify-between items-center ${activeLeverancier === levNaam && !activeSubcategorie ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
                    >
                      <div>
                        <div className="font-medium">{levNaam}</div>
                        <div className="text-xs text-gray-500">{data.totaal} items</div>
                      </div>
                      <span className="text-gray-400">{activeLeverancier === levNaam ? '▼' : '▶'}</span>
                    </button>

                    {activeLeverancier === levNaam && (
                      <div className="bg-gray-50">
                        {Object.entries(data.subcategorieen).sort((a, b) => a[0].localeCompare(b[0])).map(([subNaam, count]) => (
                          <button
                            key={subNaam}
                            onClick={() => setActiveSubcategorie(subNaam === activeSubcategorie ? null : subNaam)}
                            className={`w-full text-left pl-8 pr-4 py-2 text-sm hover:bg-gray-100 flex justify-between ${activeSubcategorie === subNaam ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-600'}`}
                          >
                            <span className={subNaam === 'Zonder subcategorie' ? 'italic' : ''}>{subNaam}</span>
                            <span className="text-xs text-gray-400">{count}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {Object.keys(leveranciersOverzicht).length === 0 && (
                  <div className="p-4 text-center text-gray-400 text-sm">
                    Nog geen leveranciers met materialen
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="col-span-12 md:col-span-8 lg:col-span-9">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
              <span>Materialen</span>
              {activeLeverancier && (
                <>
                  <span>›</span>
                  <span className="text-gray-700">{activeLeverancier}</span>
                </>
              )}
              {activeSubcategorie && (
                <>
                  <span>›</span>
                  <span className="text-blue-600 font-medium">{activeSubcategorie}</span>
                </>
              )}
              <span className="ml-auto text-gray-400">{gefilterdeItems.length} items</span>
            </div>

            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={zoek}
                onChange={(e) => setZoek(e.target.value)}
                placeholder="🔍 Zoeken in huidige selectie..."
                className="flex-1 border rounded-lg px-3 py-2"
              />
              <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".xlsx,.xls" className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
                📥 Import
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {gefilterdeItems.map(item => (
                <div
                  key={item.id}
                  onClick={() => openEditModal(item)}
                  className="bg-white rounded-lg border p-4 hover:shadow-md cursor-pointer transition-shadow"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      {item.artikelnummer && (
                        <div className="text-xs text-gray-400 font-mono">{item.artikelnummer}</div>
                      )}
                      <div className="font-medium">{item.naam}</div>
                      {item.omschrijving && (
                        <div className="text-sm text-gray-500 line-clamp-2">{item.omschrijving}</div>
                      )}
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-lg font-bold text-green-600">€{(item.prijs || 0).toFixed(2)}</div>
                      <div className="text-xs text-gray-500">per {item.eenheid}</div>
                    </div>
                  </div>
                  {(item.catalogusprijs > 0 || item.subcategorie) && (
                    <div className="flex gap-2 mt-2 pt-2 border-t">
                      {item.catalogusprijs > 0 && (
                        <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                          Cat: €{item.catalogusprijs.toFixed(2)} {item.korting > 0 && `(-${item.korting}%)`}
                        </span>
                      )}
                      {item.subcategorie && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{item.subcategorie}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {gefilterdeItems.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-2">📦</div>
                <p>Geen items gevonden</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* LIJST WEERGAVE */}
          <div className="flex flex-wrap gap-2 mb-4">
            {bibCategorieen.map(cat => (
              <button
                key={cat.id}
                onClick={() => { setActiveCategorie(cat.id); setActiveLeverancier(null); setActiveSubcategorie(null) }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeCategorie === cat.id ? 'bg-blue-600 text-white' : 'bg-white border hover:bg-gray-50'
                }`}
              >
                {cat.label} ({bibliotheek.filter(i => i.categorie === cat.id).length})
              </button>
            ))}
          </div>

          {activeCategorie === 'materialen' && materialenLeveranciers.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <div className="text-xs text-gray-500 mb-2">Leveranciers:</div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setActiveLeverancier(null); setActiveSubcategorie(null) }}
                  className={`px-3 py-1.5 rounded text-sm ${!activeLeverancier ? 'bg-blue-500 text-white' : 'bg-white border hover:bg-gray-100'}`}
                >
                  Alle ({items.length})
                </button>
                {materialenLeveranciers.map(lev => (
                  <button
                    key={lev}
                    onClick={() => toggleLeverancier(lev)}
                    className={`px-3 py-1.5 rounded text-sm ${activeLeverancier === lev ? 'bg-blue-500 text-white' : 'bg-white border hover:bg-gray-100'}`}
                  >
                    {lev} ({items.filter(i => i.leverancier === lev).length})
                  </button>
                ))}
              </div>

              {activeLeverancier && subcategorieen.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <div className="text-xs text-gray-500 mb-2">Subcategorieën:</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setActiveSubcategorie(null)}
                      className={`px-2 py-1 rounded text-xs ${!activeSubcategorie ? 'bg-green-500 text-white' : 'bg-white border'}`}
                    >
                      Alle
                    </button>
                    {subcategorieen.map(sub => (
                      <button
                        key={sub}
                        onClick={() => setActiveSubcategorie(sub)}
                        className={`px-2 py-1 rounded text-xs ${activeSubcategorie === sub ? 'bg-green-500 text-white' : 'bg-white border'}`}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
              placeholder="🔍 Zoeken..."
              className="flex-1 border rounded-lg px-3 py-2"
            />
        <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".xlsx,.xls" className="hidden" />
        <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
          📥 Excel Import
        </button>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden mb-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {uitgebreideWeergave && <th className="text-left p-3 w-28">Artikelnr</th>}
              <th className="text-left p-3">Naam</th>
              {uitgebreideWeergave && <th className="text-left p-3">Omschrijving</th>}
              <th className="text-left p-3 w-20">Eenheid</th>
              {uitgebreideWeergave && <th className="text-left p-3 w-28">Subcategorie</th>}
              {uitgebreideWeergave && <th className="text-right p-3 w-28">Catalogus €</th>}
              {uitgebreideWeergave && <th className="text-right p-3 w-20">Korting %</th>}
              <th className="text-right p-3 w-28">{uitgebreideWeergave ? 'Eindprijs €' : 'Prijs €'}</th>
              {!uitgebreideWeergave && <th className="text-left p-3 w-32">Leverancier</th>}
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {gefilterdeItems.map(item => (
              <tr key={item.id} className="border-t hover:bg-blue-50 cursor-pointer" onClick={() => openEditModal(item)}>
                {uitgebreideWeergave && (
                  <td className="p-2 text-xs text-gray-600">{item.artikelnummer || '-'}</td>
                )}
                <td className="p-2 font-medium">{item.naam}</td>
                {uitgebreideWeergave && (
                  <td className="p-2 text-xs text-gray-500">{item.omschrijving || '-'}</td>
                )}
                <td className="p-2 text-xs">{item.eenheid}</td>
                {uitgebreideWeergave && (
                  <td className="p-2 text-xs">{item.subcategorie || '-'}</td>
                )}
                {uitgebreideWeergave && (
                  <td className="p-2 text-right text-xs">€{(item.catalogusprijs || 0).toFixed(2)}</td>
                )}
                {uitgebreideWeergave && (
                  <td className="p-2 text-right text-xs">{item.korting ? `${item.korting}%` : '-'}</td>
                )}
                <td className="p-2 text-right font-medium">€{(item.prijs || 0).toFixed(2)}</td>
                {!uitgebreideWeergave && (
                  <td className="p-2 text-xs text-gray-600">{item.leverancier || '-'}</td>
                )}
                <td className="p-2" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => deleteItem(item.id)} className="text-red-500 hover:text-red-700">🗑️</button>
                </td>
              </tr>
            ))}
            {gefilterdeItems.length === 0 && (
              <tr><td colSpan={uitgebreideWeergave ? 9 : 5} className="p-8 text-center text-gray-400">Geen items gevonden</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
        <h4 className="font-medium mb-3">+ Nieuw item toevoegen</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
          <input type="text" value={nieuwItem.artikelnummer} onChange={(e) => setNieuwItem({ ...nieuwItem, artikelnummer: e.target.value })} placeholder="Artikelnr" className="border rounded px-2 py-1.5 text-sm" />
          <input type="text" value={nieuwItem.naam} onChange={(e) => setNieuwItem({ ...nieuwItem, naam: e.target.value })} placeholder="Naam *" className="border rounded px-2 py-1.5 text-sm lg:col-span-2" />
          <select value={nieuwItem.eenheid} onChange={(e) => setNieuwItem({ ...nieuwItem, eenheid: e.target.value })} className="border rounded px-2 py-1.5 text-sm">
            {eenheden.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <input type="number" step="0.01" value={nieuwItem.catalogusprijs} onChange={(e) => setNieuwItem({ ...nieuwItem, catalogusprijs: e.target.value })} placeholder="Catalogusprijs" className="border rounded px-2 py-1.5 text-sm" />
          <input type="number" step="0.1" value={nieuwItem.korting} onChange={(e) => setNieuwItem({ ...nieuwItem, korting: e.target.value })} placeholder="Korting %" className="border rounded px-2 py-1.5 text-sm" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <input type="text" value={nieuwItem.omschrijving} onChange={(e) => setNieuwItem({ ...nieuwItem, omschrijving: e.target.value })} placeholder="Omschrijving" className="border rounded px-2 py-1.5 text-sm" />
          <input type="text" value={nieuwItem.subcategorie} onChange={(e) => setNieuwItem({ ...nieuwItem, subcategorie: e.target.value })} placeholder="Subcategorie" className="border rounded px-2 py-1.5 text-sm" />
          <select value={nieuwItem.leverancier} onChange={(e) => setNieuwItem({ ...nieuwItem, leverancier: e.target.value })} className="border rounded px-2 py-1.5 text-sm">
            <option value="">Leverancier...</option>
            {leveranciers.map(l => <option key={l.id} value={l.naam}>{l.naam}</option>)}
          </select>
          <button onClick={addItem} disabled={saving || !nieuwItem.naam} className="bg-blue-600 text-white rounded px-4 py-1.5 text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? '...' : 'Toevoegen'}
          </button>
        </div>
      </div>
        </>
      )}

      {/* Excel Import Modal */}
      {showImport && importData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="text-lg font-semibold">📥 Excel Import</h3>
                <p className="text-sm text-gray-500">
                  Naar: {bibCategorieen.find(c => c.id === activeCategorie)?.label}
                  {activeLeverancier && ` → ${activeLeverancier}`}
                </p>
              </div>
              <button onClick={() => { setShowImport(false); setImportData(null) }} className="text-gray-500 hover:text-gray-700 text-xl">✕</button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              <div className="mb-4">
                <h4 className="font-medium mb-2">Koppel Excel kolommen:</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {[
                    { key: 'artikelnummer', label: 'Artikelnummer' },
                    { key: 'naam', label: 'Naam *' },
                    { key: 'omschrijving', label: 'Omschrijving' },
                    { key: 'eenheid', label: 'Eenheid' },
                    { key: 'subcategorie', label: 'Subcategorie' },
                    { key: 'catalogusprijs', label: 'Catalogusprijs' },
                    { key: 'korting', label: 'Korting %' },
                    { key: 'eindprijs', label: 'Eindprijs' }
                  ].map(field => (
                    <div key={field.key}>
                      <label className="block text-xs text-gray-500 mb-1">{field.label}</label>
                      <select
                        value={columnMapping[field.key] ?? ''}
                        onChange={(e) => setColumnMapping({ ...columnMapping, [field.key]: e.target.value === '' ? undefined : parseInt(e.target.value) })}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      >
                        <option value="">--</option>
                        {importData.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Preview (eerste 5 van {importData.rows.length} rijen):</h4>
                <div className="overflow-x-auto border rounded">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {importData.headers.map((h, i) => (
                          <th key={i} className="px-2 py-1.5 text-left font-medium text-gray-600 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importData.rows.slice(0, 5).map((row, ri) => (
                        <tr key={ri} className="border-t">
                          {importData.headers.map((_, ci) => (
                            <td key={ci} className="px-2 py-1.5 whitespace-nowrap">{row[ci] ?? ''}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
              <button onClick={() => { setShowImport(false); setImportData(null) }} className="px-4 py-2 text-gray-600 hover:text-gray-800">
                Annuleren
              </button>
              <button onClick={handleImport} disabled={importing} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                {importing ? 'Importeren...' : `Importeer ${importData.rows.length} items`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {editItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">✏️ Item bewerken</h3>
              <button onClick={() => setEditItem(null)} className="text-gray-500 hover:text-gray-700 text-xl">✕</button>
            </div>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Artikelnummer</label>
                  <input
                    type="text"
                    value={editForm.artikelnummer || ''}
                    onChange={(e) => setEditForm({ ...editForm, artikelnummer: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="Art.nr"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Naam *</label>
                  <input
                    type="text"
                    value={editForm.naam || ''}
                    onChange={(e) => setEditForm({ ...editForm, naam: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="Naam"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Omschrijving</label>
                <input
                  type="text"
                  value={editForm.omschrijving || ''}
                  onChange={(e) => setEditForm({ ...editForm, omschrijving: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Omschrijving"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Eenheid</label>
                  <select
                    value={editForm.eenheid || 'stuk'}
                    onChange={(e) => setEditForm({ ...editForm, eenheid: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  >
                    {eenheden.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Subcategorie</label>
                  <input
                    type="text"
                    value={editForm.subcategorie || ''}
                    onChange={(e) => setEditForm({ ...editForm, subcategorie: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="Subcategorie"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Leverancier</label>
                  <select
                    value={editForm.leverancier || ''}
                    onChange={(e) => setEditForm({ ...editForm, leverancier: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="">-</option>
                    {leveranciers.map(l => <option key={l.id} value={l.naam}>{l.naam}</option>)}
                  </select>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setPrijsMode('direct')}
                    className={`px-3 py-1.5 rounded text-sm ${prijsMode === 'direct' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
                  >
                    💰 Directe prijs
                  </button>
                  <button
                    onClick={() => setPrijsMode('berekend')}
                    className={`px-3 py-1.5 rounded text-sm ${prijsMode === 'berekend' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
                  >
                    🧮 Catalogusprijs + Korting
                  </button>
                </div>

                {prijsMode === 'direct' ? (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Prijs €</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.prijs || ''}
                      onChange={(e) => setEditForm({ ...editForm, prijs: e.target.value })}
                      className="w-full border rounded px-3 py-2 text-lg font-medium"
                      placeholder="0.00"
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Catalogusprijs €</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.catalogusprijs || ''}
                          onChange={(e) => {
                            const catalogusprijs = parseFloat(e.target.value) || 0
                            const korting = parseFloat(editForm.korting) || 0
                            setEditForm({
                              ...editForm,
                              catalogusprijs: e.target.value,
                              prijs: (catalogusprijs * (1 - korting / 100)).toFixed(2)
                            })
                          }}
                          className="w-full border rounded px-3 py-2"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Korting %</label>
                        <input
                          type="number"
                          step="0.1"
                          value={editForm.korting || ''}
                          onChange={(e) => {
                            const catalogusprijs = parseFloat(editForm.catalogusprijs) || 0
                            const korting = parseFloat(e.target.value) || 0
                            setEditForm({
                              ...editForm,
                              korting: e.target.value,
                              prijs: (catalogusprijs * (1 - korting / 100)).toFixed(2)
                            })
                          }}
                          className="w-full border rounded px-3 py-2"
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3 flex justify-between items-center">
                      <span className="text-gray-600">Berekende eindprijs:</span>
                      <span className="text-xl font-bold text-green-600">
                        €{((parseFloat(editForm.catalogusprijs) || 0) * (1 - (parseFloat(editForm.korting) || 0) / 100)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between p-4 border-t bg-gray-50">
              <button
                onClick={() => { if (confirm('Weet je zeker dat je dit item wilt verwijderen?')) { deleteItem(editItem.id); setEditItem(null) } }}
                className="px-4 py-2 text-red-600 hover:text-red-800"
              >
                🗑️ Verwijderen
              </button>
              <div className="flex gap-2">
                <button onClick={() => setEditItem(null)} className="px-4 py-2 text-gray-600 hover:text-gray-800">
                  Annuleren
                </button>
                <button onClick={saveEditModal} disabled={saving || !editForm.naam} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Opslaan...' : 'Opslaan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
