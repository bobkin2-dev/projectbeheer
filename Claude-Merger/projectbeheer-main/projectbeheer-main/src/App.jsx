import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import * as XLSX from 'xlsx'

// =====================================================
// CONSTANTEN
// =====================================================
const medewerkers = ['Pavel', 'Ruben', 'Jos', 'Jurgen', 'Dinko', 'Niels']
const eenheden = ['stuk', 'plaat', 'meter', 'uur', 'dag', 'm²', 'm³', 'kg', 'set', 'forfait']

const bibCategorieen = [
  { id: 'materialen', label: '📦 Materialen', icon: '📦' },
  { id: 'arbeid', label: '👷 Arbeid', icon: '👷' },
  { id: 'materieel', label: '🚛 Materieel', icon: '🚛' },
  { id: 'onderaanneming', label: '🤝 Onderaanneming', icon: '🤝' }
]

const offerteStatusConfig = {
  nogOpstellen: { label: '⚠️ Nog opstellen', kleur: 'bg-red-100 text-red-800 border-red-300' },
  concept: { label: 'Concept', kleur: 'bg-gray-100 text-gray-800 border-gray-300' },
  verzonden: { label: 'Verzonden', kleur: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  goedgekeurd: { label: '✓ Goedgekeurd', kleur: 'bg-green-100 text-green-800 border-green-300' },
  afgekeurd: { label: '✗ Afgekeurd', kleur: 'bg-red-100 text-red-800 border-red-300' }
}

const werkvoorbereidingConfig = {
  nietGestart: { label: 'Niet gestart', kleur: 'bg-gray-100 text-gray-600' },
  tekeningBezig: { label: 'Tekening bezig', kleur: 'bg-blue-100 text-blue-800' },
  tekeningKlaar: { label: 'Tekening klaar', kleur: 'bg-blue-200 text-blue-800' },
  materialenBesteld: { label: 'Materialen besteld', kleur: 'bg-yellow-100 text-yellow-800' },
  materialenBinnen: { label: 'Materialen binnen', kleur: 'bg-orange-100 text-orange-800' },
  klaar: { label: '✓ Klaar', kleur: 'bg-green-100 text-green-800' }
}

const productieConfig = {
  wacht: { label: 'Wacht', kleur: 'bg-gray-100 text-gray-600' },
  inProductie: { label: 'In productie', kleur: 'bg-purple-100 text-purple-800' },
  klaar: { label: '✓ Klaar', kleur: 'bg-green-100 text-green-800' }
}

const typeWerkOpties = ['onderdelen', 'monteren', 'inpakken', 'overig']

const plaatsingConfig = {
  wacht: { label: 'Wacht', kleur: 'bg-gray-100 text-gray-600' },
  ingepland: { label: 'Ingepland', kleur: 'bg-blue-100 text-blue-800' },
  bezig: { label: 'Bezig', kleur: 'bg-purple-100 text-purple-800' },
  geplaatst: { label: '✓ Geplaatst', kleur: 'bg-green-100 text-green-800' }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================
const calculateOrderTotals = (items, korting = 0, kortingType = 'procent') => {
  const subtotaal = items.reduce((sum, item) => sum + (item.aantal * item.prijs_per_eenheid), 0)
  let kortingBedrag = kortingType === 'procent' ? subtotaal * (korting / 100) : korting
  const totaal = subtotaal - kortingBedrag
  return { subtotaal, korting: kortingBedrag, totaal }
}

// =====================================================
// COMPONENTS
// =====================================================
const StatusBadge = ({ config, status }) => {
  const cfg = config[status]
  if (!cfg) return null
  return <span className={`px-2 py-1 rounded text-xs font-medium border ${cfg.kleur}`}>{cfg.label}</span>
}

const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    <span className="ml-2 text-gray-600">Laden...</span>
  </div>
)

const ConnectionStatus = ({ isOnline, lastSync }) => (
  <div className={`flex items-center gap-2 text-xs ${isOnline ? 'text-green-600' : 'text-red-600'}`}>
    <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
    {isOnline ? 'Online' : 'Offline'}
    {lastSync && <span className="text-gray-400">({new Date(lastSync).toLocaleTimeString('nl-BE')})</span>}
  </div>
)

// Uren Input Component
const UrenInput = ({ uren = {}, onChange, disabled }) => {
  const [showForm, setShowForm] = useState(false)
  const [selectedMedewerker, setSelectedMedewerker] = useState(medewerkers[0])
  const [aantalUren, setAantalUren] = useState('')
  const totaalUren = Object.values(uren).reduce((sum, u) => sum + u, 0)

  const handleAdd = () => {
    if (aantalUren && parseFloat(aantalUren) > 0) {
      const nieuweUren = { ...uren }
      nieuweUren[selectedMedewerker] = (nieuweUren[selectedMedewerker] || 0) + parseFloat(aantalUren)
      onChange(nieuweUren)
      setAantalUren('')
      setShowForm(false)
    }
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
        <span>⏱️ {totaalUren}u</span>
        {!disabled && <button onClick={() => setShowForm(!showForm)} className="text-blue-600 hover:text-blue-800 text-xs">{showForm ? '✕' : '+ Uren'}</button>}
      </div>
      {Object.entries(uren).length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {Object.entries(uren).map(([m, u]) => <span key={m} className="px-2 py-0.5 bg-gray-100 rounded text-xs">{m}: {u}u</span>)}
        </div>
      )}
      {showForm && !disabled && (
        <div className="flex gap-2 items-center bg-gray-50 p-2 rounded">
          <select value={selectedMedewerker} onChange={(e) => setSelectedMedewerker(e.target.value)} className="border rounded px-2 py-1 text-sm">
            {medewerkers.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <input type="number" step="0.5" min="0" placeholder="Uren" value={aantalUren} onChange={(e) => setAantalUren(e.target.value)} className="border rounded px-2 py-1 text-sm w-20" />
          <button onClick={handleAdd} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">+</button>
        </div>
      )}
    </div>
  )
}

// Productie Uren Input Component with type werk
const ProductieUrenInput = ({ urenLijst = [], onChange, isExpanded, onToggle }) => {
  const [selectedMedewerker, setSelectedMedewerker] = useState(medewerkers[0])
  const [aantalUren, setAantalUren] = useState('')
  const [typeWerk, setTypeWerk] = useState('onderdelen')

  const totaalUren = urenLijst.reduce((sum, entry) => sum + (entry.uren || 0), 0)

  const handleAdd = () => {
    if (aantalUren && parseFloat(aantalUren) > 0) {
      const nieuweEntry = {
        id: Date.now(),
        medewerker: selectedMedewerker,
        uren: parseFloat(aantalUren),
        typeWerk: typeWerk
      }
      onChange([...urenLijst, nieuweEntry])
      setAantalUren('')
    }
  }

  const handleRemove = (id) => {
    onChange(urenLijst.filter(e => e.id !== id))
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
        <span>⏱️ {totaalUren}u</span>
        <button onClick={onToggle} className="text-blue-600 hover:text-blue-800 text-xs">
          {isExpanded ? '▲ Verberg' : '▼ Uren beheren'}
        </button>
      </div>

      {urenLijst.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {urenLijst.map(entry => (
            <span key={entry.id} className="px-2 py-0.5 bg-gray-100 rounded text-xs flex items-center gap-1">
              {entry.medewerker}: {entry.uren}u ({entry.typeWerk})
              {isExpanded && <button onClick={() => handleRemove(entry.id)} className="text-red-500 ml-1">×</button>}
            </span>
          ))}
        </div>
      )}

      {isExpanded && (
        <div className="bg-gray-50 p-3 rounded border space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            <select value={selectedMedewerker} onChange={(e) => setSelectedMedewerker(e.target.value)} className="border rounded px-2 py-1 text-sm">
              {medewerkers.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <input type="number" step="0.5" min="0" placeholder="Uren" value={aantalUren} onChange={(e) => setAantalUren(e.target.value)} className="border rounded px-2 py-1 text-sm w-20" />
            <div className="flex gap-1">
              {typeWerkOpties.map(tw => (
                <button
                  key={tw}
                  onClick={() => setTypeWerk(tw)}
                  className={`px-2 py-1 text-xs rounded ${typeWerk === tw ? 'bg-blue-600 text-white' : 'bg-white border hover:bg-gray-100'}`}
                >
                  {tw}
                </button>
              ))}
            </div>
            <button onClick={handleAdd} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">+</button>
          </div>
        </div>
      )}
    </div>
  )
}

// =====================================================
// BIBLIOTHEEK BEHEER
// =====================================================
const BibliotheekBeheer = ({ bibliotheek, leveranciers: propLeveranciers, onRefresh }) => {
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
  const [editItem, setEditItem] = useState(null) // Item being edited in modal
  const [editForm, setEditForm] = useState({})
  const [prijsMode, setPrijsMode] = useState('direct') // 'direct' of 'berekend'
  const [weergave, setWeergave] = useState('lijst') // 'lijst' of 'catalogus'
  const [editSubcategorie, setEditSubcategorie] = useState(null) // For editing subcategory name
  const [nieuweSubcategorie, setNieuweSubcategorie] = useState('')
  const fileInputRef = useRef(null)

  // Load leveranciers from Supabase
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

  // Get unique leveranciers for materialen
  const materialenLeveranciers = activeCategorie === 'materialen'
    ? [...new Set(items.map(i => i.leverancier).filter(Boolean))].sort()
    : []

  // Get subcategorieën for selected leverancier
  const subcategorieen = activeLeverancier
    ? [...new Set(items.filter(i => i.leverancier === activeLeverancier).map(i => i.subcategorie).filter(Boolean))].sort()
    : []

  // In catalogus mode, altijd materialen tonen
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

  // Leverancier CRUD
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

  // Subcategorie functies
  const renameSubcategorie = async (oudeNaam, nieuweNaam, leverancier) => {
    if (!nieuweNaam.trim() || oudeNaam === nieuweNaam) return
    try {
      // Update all items with this subcategorie
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

  // Get all leveranciers with their subcategories and item counts
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

      // Als catalogusprijs of korting wijzigt, bereken eindprijs opnieuw
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

  // Open edit modal
  const openEditModal = (item) => {
    setEditItem(item)
    setEditForm({ ...item })
    // Determine price mode based on existing data
    if (item.catalogusprijs && item.catalogusprijs > 0) {
      setPrijsMode('berekend')
    } else {
      setPrijsMode('direct')
    }
  }

  // Save edit modal
  const saveEditModal = async () => {
    if (!editForm.naam) return
    setSaving(true)
    try {
      let prijs = parseFloat(editForm.prijs) || 0

      // If using calculated mode, recalculate price
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

  // Excel Import Functions
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

        // Auto-mapping
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
          {/* Weergave toggle */}
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

          {/* Nieuwe leverancier */}
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

          {/* Leveranciers met subcategorieën */}
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
          {/* Linker paneel - Leveranciers & Subcategorieën */}
          <div className="col-span-12 md:col-span-4 lg:col-span-3">
            <div className="bg-white rounded-lg border sticky top-20">
              <div className="p-3 border-b bg-gray-50">
                <h3 className="font-medium text-sm">📖 Catalogus - Materialen</h3>
              </div>
              <div className="max-h-[70vh] overflow-y-auto">
                {/* Alle items optie */}
                <button
                  onClick={() => { setActiveCategorie('materialen'); setActiveLeverancier(null); setActiveSubcategorie(null) }}
                  className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 ${!activeLeverancier ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
                >
                  <div className="font-medium">Alle materialen</div>
                  <div className="text-xs text-gray-500">{bibliotheek.filter(i => i.categorie === 'materialen').length} items</div>
                </button>

                {/* Leveranciers */}
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

                    {/* Subcategorieën (alleen tonen als leverancier actief is) */}
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

          {/* Rechter paneel - Items */}
          <div className="col-span-12 md:col-span-8 lg:col-span-9">
            {/* Breadcrumb */}
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

            {/* Zoeken */}
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

            {/* Items grid */}
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
          {/* Hoofdcategorieën */}
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

          {/* Leverancier subcategorieën (alleen bij Materialen) */}
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

              {/* Subcategorieën binnen leverancier */}
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

          {/* Zoeken en Import */}
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

      {/* Items tabel */}
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

      {/* Nieuw item formulier */}
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
              {/* Artikelnummer & Naam */}
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

              {/* Omschrijving */}
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

              {/* Eenheid, Subcategorie, Leverancier */}
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

              {/* Prijs invoer mode */}
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

// =====================================================
// SJABLONEN BEHEER
// =====================================================
const SjablonenBeheer = ({ sjablonen, bibliotheek, onRefresh }) => {
  const [showNieuw, setShowNieuw] = useState(false)
  const [nieuwSjabloon, setNieuwSjabloon] = useState({ naam: '', omschrijving: '', items: [] })
  const [saving, setSaving] = useState(false)

  const getBibItem = (id) => bibliotheek.find(i => i.id === id)

  const calculateSjabloonPrijs = (items) => {
    return items.reduce((sum, item) => {
      const bibItem = getBibItem(item.bibliotheek_id)
      return sum + (bibItem?.prijs || 0) * item.aantal
    }, 0)
  }

  const addItemToNieuw = (bibItem) => {
    const exists = nieuwSjabloon.items.find(i => i.bibliotheek_id === bibItem.id)
    if (exists) {
      setNieuwSjabloon({
        ...nieuwSjabloon,
        items: nieuwSjabloon.items.map(i => i.bibliotheek_id === bibItem.id ? { ...i, aantal: i.aantal + 1 } : i)
      })
    } else {
      setNieuwSjabloon({
        ...nieuwSjabloon,
        items: [...nieuwSjabloon.items, { bibliotheek_id: bibItem.id, aantal: 1 }]
      })
    }
  }

  const saveSjabloon = async () => {
    if (!nieuwSjabloon.naam || nieuwSjabloon.items.length === 0) return
    setSaving(true)
    try {
      const { data: created, error } = await supabase.from('sjablonen').insert({
        naam: nieuwSjabloon.naam,
        omschrijving: nieuwSjabloon.omschrijving
      }).select().single()
      
      if (error) throw error
      
      if (created && nieuwSjabloon.items.length > 0) {
        await supabase.from('sjabloon_items').insert(nieuwSjabloon.items.map(item => ({
          sjabloon_id: created.id,
          bibliotheek_id: item.bibliotheek_id,
          aantal: item.aantal
        })))
      }
      
      setNieuwSjabloon({ naam: '', omschrijving: '', items: [] })
      setShowNieuw(false)
      onRefresh()
    } catch (e) {
      alert('Fout bij opslaan: ' + e.message)
    }
    setSaving(false)
  }

  const deleteSjabloon = async (id) => {
    try {
      await supabase.from('sjablonen').delete().eq('id', id)
      onRefresh()
    } catch (e) {
      alert('Fout bij verwijderen: ' + e.message)
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">📋 Sjablonen</h2>
        <button onClick={() => setShowNieuw(!showNieuw)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          + Nieuw sjabloon
        </button>
      </div>

      {showNieuw && (
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 mb-4">
          <h4 className="font-medium mb-3">Nieuw sjabloon</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <input type="text" value={nieuwSjabloon.naam} onChange={(e) => setNieuwSjabloon({ ...nieuwSjabloon, naam: e.target.value })} placeholder="Naam" className="border rounded px-3 py-2" />
            <input type="text" value={nieuwSjabloon.omschrijving} onChange={(e) => setNieuwSjabloon({ ...nieuwSjabloon, omschrijving: e.target.value })} placeholder="Omschrijving" className="border rounded px-3 py-2" />
          </div>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
            {bibCategorieen.map(cat => (
              <div key={cat.id} className="bg-white rounded border p-2">
                <div className="text-xs font-medium text-gray-500 mb-1">{cat.label}</div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {bibliotheek.filter(i => i.categorie === cat.id).map(item => (
                    <button key={item.id} onClick={() => addItemToNieuw(item)} className="w-full text-left text-xs px-2 py-1 hover:bg-gray-100 rounded truncate">
                      {item.naam}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {nieuwSjabloon.items.length > 0 && (
            <div className="bg-white rounded border p-2 mb-3">
              <div className="text-xs font-medium text-gray-500 mb-2">Items:</div>
              {nieuwSjabloon.items.map(item => {
                const bibItem = getBibItem(item.bibliotheek_id)
                return (
                  <div key={item.bibliotheek_id} className="flex items-center justify-between text-sm py-1">
                    <span>{bibItem?.naam}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={item.aantal}
                        onChange={(e) => setNieuwSjabloon({
                          ...nieuwSjabloon,
                          items: nieuwSjabloon.items.map(i => i.bibliotheek_id === item.bibliotheek_id ? { ...i, aantal: parseFloat(e.target.value) || 0 } : i).filter(i => i.aantal > 0)
                        })}
                        className="w-16 border rounded px-2 py-1 text-right"
                        step="0.5"
                      />
                      <span className="text-gray-500">€{((bibItem?.prijs || 0) * item.aantal).toFixed(2)}</span>
                    </div>
                  </div>
                )
              })}
              <div className="border-t mt-2 pt-2 text-right font-medium">
                Totaal: €{calculateSjabloonPrijs(nieuwSjabloon.items).toFixed(2)}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={saveSjabloon} disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
              {saving ? 'Opslaan...' : 'Opslaan'}
            </button>
            <button onClick={() => { setShowNieuw(false); setNieuwSjabloon({ naam: '', omschrijving: '', items: [] }) }} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">
              Annuleren
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sjablonen.map(sjabloon => (
          <div key={sjabloon.id} className="bg-white rounded-lg border p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h4 className="font-medium">{sjabloon.naam}</h4>
                <p className="text-xs text-gray-500">{sjabloon.omschrijving}</p>
              </div>
              <button onClick={() => deleteSjabloon(sjabloon.id)} className="text-red-500 hover:text-red-700">🗑️</button>
            </div>
            <div className="text-sm space-y-1 mb-2">
              {sjabloon.items?.map(item => {
                const bibItem = getBibItem(item.bibliotheek_id)
                return (
                  <div key={item.id} className="flex justify-between text-gray-600">
                    <span>{item.aantal}x {bibItem?.naam || '?'}</span>
                    <span>€{((bibItem?.prijs || 0) * item.aantal).toFixed(2)}</span>
                  </div>
                )
              })}
            </div>
            <div className="border-t pt-2 text-right font-semibold text-green-600">
              €{calculateSjabloonPrijs(sjabloon.items || []).toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      {sjablonen.length === 0 && <div className="text-center py-8 text-gray-500">Nog geen sjablonen.</div>}
    </div>
  )
}

// =====================================================
// ORDER ITEMS BUILDER
// =====================================================
const OrderItemsBuilder = ({ orderItems, bibliotheek, sjablonen, onAddItem, onUpdateItem, onRemoveItem, onApplySjabloon, korting, kortingType, onUpdateKorting }) => {
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

// =====================================================
// PROJECT DETAIL
// =====================================================
const ProjectDetail = ({ project, bibliotheek, sjablonen, onBack, onRefresh, onUpdateProject, onDeleteProject }) => {
  const [orders, setOrders] = useState([])
  const [orderItems, setOrderItems] = useState({})
  const [activeTab, setActiveTab] = useState('offerte')
  const [expandedOrder, setExpandedOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [nieuwOrderNaam, setNieuwOrderNaam] = useState('')
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

  const saveProjectDetails = async () => {
    try {
      await supabase.from('projecten').update({
        naam: editingProject.naam,
        klant: editingProject.klant,
        architect: editingProject.architect,
        telefoon: editingProject.telefoon,
        email: editingProject.email,
        adres: editingProject.adres,
        notities: editingProject.notities
      }).eq('id', project.id)
      onUpdateProject(editingProject)
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
        added_from: 'offerte'
      }).select().single()
      
      if (error) throw error
      setOrders([...orders, created])
      setOrderItems({ ...orderItems, [created.id]: [] })
      setNieuwOrderNaam('')
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
    { id: 'offerte', label: '📋 Offerte' },
    { id: 'werkvoorbereiding', label: '🔧 Werkvoorb.' },
    { id: 'productie', label: '🏭 Productie' },
    { id: 'plaatsing', label: '🚚 Plaatsing' }
  ]

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
        
        <div className="text-xs text-gray-500 mb-2">{project.project_nummer}</div>
        <div className="mt-2 text-lg">💰 <strong className="text-green-600">€{totaalProject.toFixed(2)}</strong> • 📦 {orders.length} orders</div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 rounded-lg text-sm font-medium ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-white border hover:bg-gray-50'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-gray-50 rounded-lg p-4">
        {activeTab === 'offerte' && (
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
                      <StatusBadge config={offerteStatusConfig} status={order.offerte_status} />
                      <button onClick={(e) => { e.stopPropagation(); deleteOrder(order.id) }} className="text-red-500 hover:text-red-700">✕</button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t p-4 bg-gray-50">
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-1">Status</label>
                        <select value={order.offerte_status} onChange={(e) => updateOrder(order.id, { offerte_status: e.target.value })} className="border rounded px-3 py-2">
                          {Object.entries(offerteStatusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
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

            <div className="flex gap-2">
              <input type="text" value={nieuwOrderNaam} onChange={(e) => setNieuwOrderNaam(e.target.value)} placeholder="Nieuwe order naam..." className="flex-1 border rounded px-3 py-2" onKeyDown={(e) => e.key === 'Enter' && addOrder()} />
              <button onClick={addOrder} disabled={saving || !nieuwOrderNaam.trim()} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                + Order
              </button>
            </div>
          </div>
        )}

        {activeTab === 'werkvoorbereiding' && (
          <div className="space-y-4">
            {orders.filter(o => o.offerte_status === 'goedgekeurd').map(order => (
              <div key={order.id} className="bg-white rounded-lg border p-4">
                <div className="flex justify-between items-center mb-3">
                  {editingOrderId === order.id ? (
                    <input
                      type="text"
                      value={editingOrderNaam}
                      onChange={(e) => setEditingOrderNaam(e.target.value)}
                      onBlur={() => {
                        if (editingOrderNaam.trim()) updateOrder(order.id, { naam: editingOrderNaam.trim() })
                        setEditingOrderId(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (editingOrderNaam.trim()) updateOrder(order.id, { naam: editingOrderNaam.trim() })
                          setEditingOrderId(null)
                        }
                        if (e.key === 'Escape') setEditingOrderId(null)
                      }}
                      autoFocus
                      className="font-medium border rounded px-2 py-1"
                    />
                  ) : (
                    <h4
                      className="font-medium hover:text-blue-600 cursor-text"
                      onClick={() => { setEditingOrderId(order.id); setEditingOrderNaam(order.naam) }}
                    >
                      {order.naam}
                    </h4>
                  )}
                  <StatusBadge config={werkvoorbereidingConfig} status={order.werkvoorbereiding_status} />
                </div>
                <select value={order.werkvoorbereiding_status} onChange={(e) => updateOrder(order.id, { werkvoorbereiding_status: e.target.value })} className="border rounded px-3 py-2">
                  {Object.entries(werkvoorbereidingConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            ))}
            {orders.filter(o => o.offerte_status === 'goedgekeurd').length === 0 && (
              <div className="text-center py-8 text-gray-400">Geen orders met goedgekeurde offerte.</div>
            )}
          </div>
        )}

        {activeTab === 'productie' && (
          <div className="space-y-4">
            {orders.filter(o => o.offerte_status === 'goedgekeurd').map(order => (
              <div key={order.id} className="bg-white rounded-lg border p-4">
                <div className="flex justify-between items-center mb-3">
                  {editingOrderId === order.id ? (
                    <input
                      type="text"
                      value={editingOrderNaam}
                      onChange={(e) => setEditingOrderNaam(e.target.value)}
                      onBlur={() => {
                        if (editingOrderNaam.trim()) updateOrder(order.id, { naam: editingOrderNaam.trim() })
                        setEditingOrderId(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (editingOrderNaam.trim()) updateOrder(order.id, { naam: editingOrderNaam.trim() })
                          setEditingOrderId(null)
                        }
                        if (e.key === 'Escape') setEditingOrderId(null)
                      }}
                      autoFocus
                      className="font-medium border rounded px-2 py-1"
                    />
                  ) : (
                    <h4
                      className="font-medium hover:text-blue-600 cursor-text"
                      onClick={() => { setEditingOrderId(order.id); setEditingOrderNaam(order.naam) }}
                    >
                      {order.naam}
                    </h4>
                  )}
                  <StatusBadge config={productieConfig} status={order.productie_status} />
                </div>
                <select value={order.productie_status} onChange={(e) => updateOrder(order.id, { productie_status: e.target.value })} className="border rounded px-3 py-2 mb-2">
                  {Object.entries(productieConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <ProductieUrenInput
                  urenLijst={order.productie_uren_lijst || []}
                  onChange={(u) => updateOrder(order.id, { productie_uren_lijst: u })}
                  isExpanded={expandedProductieUren[order.id] || false}
                  onToggle={() => setExpandedProductieUren({ ...expandedProductieUren, [order.id]: !expandedProductieUren[order.id] })}
                />
              </div>
            ))}
            {orders.filter(o => o.offerte_status === 'goedgekeurd').length === 0 && (
              <div className="text-center py-8 text-gray-400">Geen orders met goedgekeurde offerte.</div>
            )}
          </div>
        )}

        {activeTab === 'plaatsing' && (
          <div className="space-y-4">
            {orders.filter(o => o.productie_status === 'klaar').map(order => (
              <div key={order.id} className="bg-white rounded-lg border p-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium">{order.naam}</h4>
                  <StatusBadge config={plaatsingConfig} status={order.plaatsing_status} />
                </div>
                <div className="flex flex-wrap gap-4 mb-2">
                  <select value={order.plaatsing_status} onChange={(e) => updateOrder(order.id, { plaatsing_status: e.target.value })} className="border rounded px-3 py-2">
                    {Object.entries(plaatsingConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <input type="date" value={order.plaatsing_datum || ''} onChange={(e) => updateOrder(order.id, { plaatsing_datum: e.target.value })} className="border rounded px-3 py-2" />
                </div>
                <UrenInput uren={order.plaatsing_uren || {}} onChange={(u) => updateOrder(order.id, { plaatsing_uren: u })} />
              </div>
            ))}
            {orders.filter(o => o.productie_status === 'klaar').length === 0 && (
              <div className="text-center py-8 text-gray-400">Geen orders klaar voor plaatsing.</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// =====================================================
// PROJECT CARD
// =====================================================
const ProjectCard = ({ project, onClick }) => (
  <div onClick={onClick} className="bg-white rounded-lg border p-4 cursor-pointer hover:shadow-md transition-shadow">
    <div className="text-xs text-gray-500">{project.project_nummer}</div>
    <h3 className="font-semibold">{project.naam || 'Naamloos'}</h3>
    <div className="text-sm text-gray-600">👤 {project.klant || '-'}</div>
  </div>
)

// =====================================================
// KANBAN BOARD
// =====================================================
const KanbanBoard = ({ projecten }) => {
  const [allOrders, setAllOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [draggedOrder, setDraggedOrder] = useState(null)
  const [dragOverColumn, setDragOverColumn] = useState(null)

  useEffect(() => {
    const loadAllOrders = async () => {
      try {
        const { data: orders } = await supabase.from('orders').select('*')
        const ordersWithProject = (orders || []).map(o => ({
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

  // Status updates based on target column
  const getStatusUpdates = (targetColumn) => {
    switch (targetColumn) {
      case 'offerte':
        return {
          offerte_status: 'concept',
          werkvoorbereiding_status: 'nietGestart',
          productie_status: 'wacht',
          plaatsing_status: 'wacht'
        }
      case 'werkvoorbereiding':
        return {
          offerte_status: 'goedgekeurd',
          werkvoorbereiding_status: 'nietGestart',
          productie_status: 'wacht',
          plaatsing_status: 'wacht'
        }
      case 'productie':
        return {
          offerte_status: 'goedgekeurd',
          werkvoorbereiding_status: 'klaar',
          productie_status: 'wacht',
          plaatsing_status: 'wacht'
        }
      case 'plaatsing':
        return {
          offerte_status: 'goedgekeurd',
          werkvoorbereiding_status: 'klaar',
          productie_status: 'klaar',
          plaatsing_status: 'wacht'
        }
      case 'afgerond':
        return {
          offerte_status: 'goedgekeurd',
          werkvoorbereiding_status: 'klaar',
          productie_status: 'klaar',
          plaatsing_status: 'geplaatst'
        }
      default:
        return {}
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

  const handleDragLeave = () => {
    setDragOverColumn(null)
  }

  const handleDrop = async (e, targetColumn) => {
    e.preventDefault()
    setDragOverColumn(null)

    if (!draggedOrder) return

    const updates = getStatusUpdates(targetColumn)

    try {
      await supabase.from('orders').update(updates).eq('id', draggedOrder.id)

      // Update local state
      setAllOrders(allOrders.map(o =>
        o.id === draggedOrder.id ? { ...o, ...updates } : o
      ))
    } catch (err) {
      console.error('Fout bij updaten:', err)
      alert('Fout bij verplaatsen: ' + err.message)
    }

    setDraggedOrder(null)
  }

  const handleDragEnd = () => {
    setDraggedOrder(null)
    setDragOverColumn(null)
  }

  if (loading) return <LoadingSpinner />

  const kolommen = [
    { id: 'offerte', titel: '📋 Offerte', color: 'bg-orange-50', borderColor: 'border-orange-300', orders: allOrders.filter(o => o.offerte_status !== 'goedgekeurd' && o.offerte_status !== 'afgekeurd') },
    { id: 'werkvoorbereiding', titel: '🔧 Werkvoorb.', color: 'bg-blue-50', borderColor: 'border-blue-300', orders: allOrders.filter(o => o.offerte_status === 'goedgekeurd' && o.werkvoorbereiding_status !== 'klaar') },
    { id: 'productie', titel: '🏭 Productie', color: 'bg-purple-50', borderColor: 'border-purple-300', orders: allOrders.filter(o => o.werkvoorbereiding_status === 'klaar' && o.productie_status !== 'klaar') },
    { id: 'plaatsing', titel: '🚚 Plaatsing', color: 'bg-indigo-50', borderColor: 'border-indigo-300', orders: allOrders.filter(o => o.productie_status === 'klaar' && o.plaatsing_status !== 'geplaatst') },
    { id: 'afgerond', titel: '✅ Afgerond', color: 'bg-green-50', borderColor: 'border-green-300', orders: allOrders.filter(o => o.plaatsing_status === 'geplaatst') }
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {kolommen.map(kolom => (
        <div
          key={kolom.id}
          className={`${kolom.color} rounded-lg p-3 min-h-64 transition-all ${
            dragOverColumn === kolom.id ? `ring-2 ring-offset-2 ${kolom.borderColor} ring-current` : ''
          }`}
          onDragOver={(e) => handleDragOver(e, kolom.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, kolom.id)}
        >
          <div className="font-medium text-sm mb-3 pb-2 border-b">{kolom.titel} ({kolom.orders.length})</div>
          <div className="space-y-2">
            {kolom.orders.map(order => (
              <div
                key={order.id}
                draggable
                onDragStart={(e) => handleDragStart(e, order)}
                onDragEnd={handleDragEnd}
                className={`bg-white rounded border p-2 text-sm shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${
                  draggedOrder?.id === order.id ? 'opacity-50' : ''
                }`}
              >
                <div className="font-medium">{order.naam}</div>
                <div className="text-xs text-gray-500">{order.project?.naam}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// =====================================================
// MAIN APP
// =====================================================
export default function App() {
  const [view, setView] = useState('projecten')
  const [projecten, setProjecten] = useState([])
  const [bibliotheek, setBibliotheek] = useState([])
  const [sjablonen, setSjablonen] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(false)
  const [lastSync, setLastSync] = useState(null)
  const [error, setError] = useState(null)

  // Load all data
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      console.log('Loading data from Supabase...')
      
      const { data: projectenData, error: pErr } = await supabase.from('projecten').select('*').order('created_at', { ascending: false })
      if (pErr) throw pErr
      console.log('Projecten loaded:', projectenData?.length)
      
      const { data: bibliotheekData, error: bErr } = await supabase.from('bibliotheek').select('*').order('naam')
      if (bErr) throw bErr
      console.log('Bibliotheek loaded:', bibliotheekData?.length)
      
      const { data: sjablonenData, error: sErr } = await supabase.from('sjablonen').select('*').order('naam')
      if (sErr) throw sErr
      console.log('Sjablonen loaded:', sjablonenData?.length)

      const { data: sjabloonItems } = await supabase.from('sjabloon_items').select('*')
      
      const sjablonenMetItems = (sjablonenData || []).map(s => ({
        ...s,
        items: (sjabloonItems || []).filter(i => i.sjabloon_id === s.id)
      }))

      setProjecten(projectenData || [])
      setBibliotheek(bibliotheekData || [])
      setSjablonen(sjablonenMetItems)
      setIsOnline(true)
      setLastSync(new Date().toISOString())
      console.log('All data loaded successfully!')
    } catch (e) {
      console.error('Fout bij laden:', e)
      setIsOnline(false)
      setError(e.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const createProject = async () => {
    const nummer = `PRJ-${new Date().getFullYear()}-${(projecten.length + 1).toString().padStart(3, '0')}`
    try {
      const { data: created, error } = await supabase.from('projecten').insert({
        project_nummer: nummer,
        naam: '',
        klant: ''
      }).select().single()
      
      if (error) throw error
      setProjecten([created, ...projecten])
      setSelectedProject(created)
    } catch (e) {
      alert('Fout bij aanmaken: ' + e.message)
    }
  }

  const updateProject = (updatedProject) => {
    setProjecten(projecten.map(p => p.id === updatedProject.id ? updatedProject : p))
    setSelectedProject(updatedProject)
  }

  const deleteProject = async (projectId) => {
    if (!confirm('Weet je zeker dat je dit project wilt verwijderen? Alle orders worden ook verwijderd.')) return
    try {
      await supabase.from('projecten').delete().eq('id', projectId)
      setProjecten(projecten.filter(p => p.id !== projectId))
      setSelectedProject(null)
    } catch (e) {
      alert('Fout bij verwijderen: ' + e.message)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verbinden met database...</p>
          {error && (
            <div className="mt-4 p-4 bg-red-100 border border-red-300 rounded-lg text-red-700 max-w-md">
              <p className="font-medium">Fout bij verbinden:</p>
              <p className="text-sm mt-1">{error}</p>
              <button onClick={() => { setError(null); loadData() }} className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm">
                Opnieuw proberen
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">🪑 Projectbeheer</h1>
            {!selectedProject && (
              <nav className="flex flex-wrap gap-1">
                {['projecten', 'kanban', 'bibliotheek', 'sjablonen'].map(v => (
                  <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded text-sm ${view === v ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                    {v === 'projecten' ? '📁' : v === 'kanban' ? '📋' : v === 'bibliotheek' ? '📚' : '📋'} <span className="hidden sm:inline">{v.charAt(0).toUpperCase() + v.slice(1)}</span>
                  </button>
                ))}
              </nav>
            )}
          </div>
          <div className="flex items-center gap-4">
            <ConnectionStatus isOnline={isOnline} lastSync={lastSync} />
            <button onClick={loadData} className="px-3 py-1.5 bg-gray-200 rounded text-sm hover:bg-gray-300">🔄</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {selectedProject ? (
          <ProjectDetail
            project={selectedProject}
            bibliotheek={bibliotheek}
            sjablonen={sjablonen}
            onBack={() => { setSelectedProject(null); loadData() }}
            onRefresh={loadData}
            onUpdateProject={updateProject}
            onDeleteProject={deleteProject}
          />
        ) : (
          <>
            {view === 'projecten' && (
              <div>
                <button onClick={createProject} className="mb-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">+ Nieuw Project</button>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {projecten.map(p => <ProjectCard key={p.id} project={p} onClick={() => setSelectedProject(p)} />)}
                </div>
                {projecten.length === 0 && <div className="text-center py-12 text-gray-500">Nog geen projecten. Maak je eerste project aan!</div>}
              </div>
            )}
            {view === 'kanban' && <KanbanBoard projecten={projecten} />}
            {view === 'bibliotheek' && <BibliotheekBeheer bibliotheek={bibliotheek} onRefresh={loadData} />}
            {view === 'sjablonen' && <SjablonenBeheer sjablonen={sjablonen} bibliotheek={bibliotheek} onRefresh={loadData} />}
          </>
        )}
      </main>
    </div>
  )
}
