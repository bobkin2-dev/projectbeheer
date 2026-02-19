import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import * as XLSX from 'xlsx'

// =====================================================
// CONSTANTEN
// =====================================================
// medewerkers worden nu uit de database geladen (zie App component)
const eenheden = ['stuk', 'plaat', 'meter', 'uur', 'dag', 'm²', 'm³', 'kg', 'set', 'forfait']

const bibCategorieen = [
  { id: 'materialen', label: '📦 Materialen', icon: '📦' },
  { id: 'arbeid', label: '👷 Arbeid', icon: '👷' },
  { id: 'materieel', label: '🚛 Materieel', icon: '🚛' },
  { id: 'onderaanneming', label: '🤝 Onderaanneming', icon: '🤝' }
]

// Nieuw statussysteem — lineaire hoofdstatus + parallelle tracks
const orderStatusConfig = {
  prijsvraag:            { label: '📩 Prijsvraag',            kleur: 'bg-gray-100 text-gray-700 border-gray-300',   fase: 'offerte' },
  geteld:               { label: '🧮 Geteld',                kleur: 'bg-blue-50 text-blue-700 border-blue-200',     fase: 'offerte' },
  offerte_verstuurd:    { label: '📤 Offerte verstuurd',     kleur: 'bg-yellow-100 text-yellow-800 border-yellow-300', fase: 'offerte' },
  goedgekeurd:          { label: '✅ Goedgekeurd',           kleur: 'bg-green-100 text-green-800 border-green-300', fase: 'voorbereiding' },
  in_productie:         { label: '🏭 In productie',          kleur: 'bg-purple-100 text-purple-800 border-purple-300', fase: 'productie' },
  kwaliteitscontrole:   { label: '🔍 Kwaliteitscontrole',   kleur: 'bg-indigo-100 text-indigo-800 border-indigo-300', fase: 'productie' },
  klaar_voor_plaatsing: { label: '📦 Klaar voor plaatsing', kleur: 'bg-cyan-100 text-cyan-800 border-cyan-300',    fase: 'plaatsing' },
  in_plaatsing:         { label: '🚚 In plaatsing',          kleur: 'bg-orange-100 text-orange-800 border-orange-300', fase: 'plaatsing' },
  geplaatst:            { label: '🏠 Geplaatst',             kleur: 'bg-teal-100 text-teal-800 border-teal-300',    fase: 'afronding' },
  opgeleverd:           { label: '🎉 Opgeleverd',            kleur: 'bg-emerald-100 text-emerald-800 border-emerald-300', fase: 'afronding' }
}

const orderStatusVolgorde = ['prijsvraag', 'geteld', 'offerte_verstuurd', 'goedgekeurd', 'in_productie', 'kwaliteitscontrole', 'klaar_voor_plaatsing', 'in_plaatsing', 'geplaatst', 'opgeleverd']

// Kanban kolommen (gegroepeerd)
const kanbanKolommen = [
  { id: 'offerte',       label: '📋 Offerte',       statussen: ['prijsvraag', 'geteld', 'offerte_verstuurd'] },
  { id: 'voorbereiding', label: '🔧 Voorbereiding', statussen: ['goedgekeurd'] },
  { id: 'productie',     label: '🏭 Productie',     statussen: ['in_productie', 'kwaliteitscontrole'] },
  { id: 'plaatsing',     label: '🚚 Plaatsing',     statussen: ['klaar_voor_plaatsing', 'in_plaatsing'] },
  { id: 'afgerond',      label: '✅ Afgerond',       statussen: ['geplaatst', 'opgeleverd'] }
]

// Helper: kan een order naar productie?
const kanNaarProductie = (order) => order.tekening_goedgekeurd && order.materiaal_binnen

// Legacy compat
const offerteStatusConfig = orderStatusConfig
const werkvoorbereidingConfig = { nietGestart: { label: 'Niet gestart', kleur: 'bg-gray-100 text-gray-600' }, klaar: { label: '✓ Klaar', kleur: 'bg-green-100 text-green-800' } }
const productieConfig = { wacht: { label: 'Wacht', kleur: 'bg-gray-100 text-gray-600' }, inProductie: { label: 'In productie', kleur: 'bg-purple-100 text-purple-800' }, klaar: { label: '✓ Klaar', kleur: 'bg-green-100 text-green-800' } }
const plaatsingConfig = { wacht: { label: 'Wacht', kleur: 'bg-gray-100 text-gray-600' }, geplaatst: { label: '✓ Geplaatst', kleur: 'bg-green-100 text-green-800' } }

const typeWerkOpties = ['onderdelen', 'monteren', 'inpakken', 'lakwerk', 'metaalwerk', 'overig']

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
const UrenInput = ({ uren = {}, onChange, disabled, medewerkers = [] }) => {
  const [showForm, setShowForm] = useState(false)
  const [selectedMedewerker, setSelectedMedewerker] = useState(medewerkers[0] || '')
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
const ProductieUrenInput = ({ urenLijst = [], onChange, isExpanded, onToggle, medewerkers = [] }) => {
  const [selectedMedewerker, setSelectedMedewerker] = useState(medewerkers[0] || '')
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
const ProjectDetail = ({ project, bibliotheek, sjablonen, medewerkers = [], onBack, onRefresh, onUpdateProject, onDeleteProject }) => {
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

  const saveProjectDetails = async () => {
    try {
      await supabase.from('projecten').update({
        project_nummer: editingProject.project_nummer,
        naam: editingProject.naam,
        klant: editingProject.klant,
        architect: editingProject.architect,
        telefoon: editingProject.telefoon,
        email: editingProject.email,
        adres: editingProject.adres,
        notities: editingProject.notities,
        kleur: editingProject.kleur,
        emoji: editingProject.emoji
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
                  onClick={() => { setEditingProject({ ...editingProject, kleur: color }); setTimeout(saveProjectDetails, 100) }}
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
                  onClick={() => { setEditingProject({ ...editingProject, emoji: emoji }); setTimeout(saveProjectDetails, 100) }}
                  className={`w-8 h-8 rounded border text-lg flex items-center justify-center ${editingProject.emoji === emoji ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-2 text-lg">💰 <strong className="text-green-600">€{totaalProject.toFixed(2)}</strong> • 📦 {orders.length} orders</div>
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

// =====================================================
// PROJECT CARD
// =====================================================
const ProjectCard = ({ project, onClick }) => (
  <div
    onClick={onClick}
    className="rounded-lg border p-4 cursor-pointer hover:shadow-md transition-shadow"
    style={{ backgroundColor: project.kleur ? `${project.kleur}15` : 'white', borderColor: project.kleur || '#e5e7eb' }}
  >
    <div className="flex justify-between items-start">
      <div className="text-xs text-gray-500">{project.project_nummer}</div>
      {project.emoji && <span className="text-xl">{project.emoji}</span>}
    </div>
    <h3 className="font-semibold" style={{ color: project.kleur || 'inherit' }}>{project.naam || 'Naamloos'}</h3>
    <div className="text-sm text-gray-600">👤 {project.klant || '-'}</div>
  </div>
)

// =====================================================
// SNEL UREN INVOER (vanuit project)
// =====================================================
const SnelUrenInvoer = ({ orderId, projectId, medewerkers = [] }) => {
  const [open, setOpen] = useState(false)
  const [medewerker, setMedewerker] = useState('')
  const [uren, setUren] = useState('')
  const [typeWerk, setTypeWerk] = useState('onderdelen')
  const [saving, setSaving] = useState(false)
  const [recentToegevoegd, setRecentToegevoegd] = useState(null)

  const handleAdd = async () => {
    if (!medewerker || !uren || parseFloat(uren) <= 0) return
    setSaving(true)
    try {
      await supabase.from('uren_registratie').insert({
        medewerker_id: medewerker,
        datum: new Date().toISOString().split('T')[0],
        project_id: projectId,
        order_id: orderId,
        type_werk: typeWerk,
        uren: parseFloat(uren)
      })
      const mNaam = medewerkers.find(m => m.id === medewerker)?.naam || '?'
      setRecentToegevoegd(`${mNaam}: ${uren}u (${typeWerk})`)
      setUren('')
      setTimeout(() => setRecentToegevoegd(null), 3000)
    } catch (e) {
      alert('Fout: ' + e.message)
    }
    setSaving(false)
  }

  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
        {open ? '▲ Verberg snelle uren' : '⚡ Snel uren toevoegen'}
      </button>
      {recentToegevoegd && (
        <div className="mt-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded animate-pulse">
          ✓ Toegevoegd: {recentToegevoegd}
        </div>
      )}
      {open && (
        <div className="mt-2 bg-blue-50 rounded-lg p-3 border border-blue-200">
          <div className="flex flex-wrap gap-2 items-center">
            <select value={medewerker} onChange={(e) => setMedewerker(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
              <option value="">Medewerker...</option>
              {medewerkers.map(m => <option key={m.id} value={m.id}>{m.naam}</option>)}
            </select>
            <input type="number" value={uren} onChange={(e) => setUren(e.target.value)} placeholder="Uren" step="0.5" min="0" className="w-20 border rounded-lg px-2 py-1.5 text-sm text-right" />
            <div className="flex gap-1">
              {typeWerkOpties.map(tw => (
                <button key={tw} onClick={() => setTypeWerk(tw)} className={`px-2 py-1 text-xs rounded-md ${typeWerk === tw ? 'bg-blue-600 text-white' : 'bg-white border'}`}>{tw}</button>
              ))}
            </div>
            <button onClick={handleAdd} disabled={saving} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50 font-medium">
              {saving ? '...' : '+ Registreer'}
            </button>
          </div>
          <p className="text-[10px] text-blue-500 mt-1">Registreert voor vandaag ({new Date().toLocaleDateString('nl-BE')})</p>
        </div>
      )}
    </div>
  )
}

// =====================================================
// ORDER PRODUCTEN COMPONENT
// =====================================================
const OrderProducten = ({ orderId }) => {
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

// =====================================================
// MEDEWERKER BEHEER
// =====================================================
const MedewerkerBeheer = ({ medewerkers, onRefresh }) => {
  const [alleMedewerkers, setAlleMedewerkers] = useState([])
  const [nieuweNaam, setNieuweNaam] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    const { data } = await supabase.from('medewerkers').select('*').order('naam')
    setAlleMedewerkers(data || [])
    setLoading(false)
  }

  const addMedewerker = async () => {
    if (!nieuweNaam.trim()) return
    try {
      await supabase.from('medewerkers').insert({ naam: nieuweNaam.trim() })
      setNieuweNaam('')
      loadAll()
      onRefresh()
    } catch (e) {
      alert('Fout: ' + e.message)
    }
  }

  const toggleActief = async (id, actief) => {
    try {
      await supabase.from('medewerkers').update({ actief: !actief }).eq('id', id)
      loadAll()
      onRefresh()
    } catch (e) {
      alert('Fout: ' + e.message)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="bg-white rounded-lg border p-4 mb-4">
      <h3 className="font-semibold mb-3">👷 Medewerkers beheren</h3>
      <div className="space-y-2 mb-3">
        {alleMedewerkers.map(m => (
          <div key={m.id} className={`flex items-center justify-between px-3 py-2 rounded ${m.actief ? 'bg-green-50' : 'bg-gray-100 opacity-60'}`}>
            <span className={m.actief ? '' : 'line-through'}>{m.naam}</span>
            <button
              onClick={() => toggleActief(m.id, m.actief)}
              className={`text-xs px-2 py-1 rounded ${m.actief ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
            >
              {m.actief ? 'Deactiveer' : 'Activeer'}
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={nieuweNaam}
          onChange={(e) => setNieuweNaam(e.target.value)}
          placeholder="Nieuwe medewerker..."
          className="flex-1 border rounded px-3 py-2"
          onKeyDown={(e) => e.key === 'Enter' && addMedewerker()}
        />
        <button onClick={addMedewerker} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">+ Toevoegen</button>
      </div>
    </div>
  )
}

// =====================================================
// TIJDSREGISTRATIE
// =====================================================
const Tijdsregistratie = ({ projecten, medewerkers, onRefresh }) => {
  const [activeTab, setActiveTab] = useState('invoer') // 'invoer', 'overzicht', 'nacalculatie'
  const [datum, setDatum] = useState(new Date().toISOString().split('T')[0])
  const [selectedMedewerker, setSelectedMedewerker] = useState(null)
  const [regels, setRegels] = useState([])
  const [allOrders, setAllOrders] = useState([])
  const [saving, setSaving] = useState(false)
  const [showBeheer, setShowBeheer] = useState(false)
  const [showProjectModal, setShowProjectModal] = useState(false)
  const [projectModalRegelIndex, setProjectModalRegelIndex] = useState(null)
  const [nieuwOrderNaam, setNieuwOrderNaam] = useState('')
  const [aanmakenOrder, setAanmakenOrder] = useState(null) // regelIndex
  // Calendar state
  const [calendarMonth, setCalendarMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
  const [dagenMetUren, setDagenMetUren] = useState({}) // { '2026-02-18': 6.5, ... }
  // Overzicht state
  const [overzichtProject, setOverzichtProject] = useState('')
  const [overzichtOrder, setOverzichtOrder] = useState('')
  const [overzichtData, setOverzichtData] = useState([])
  const [overzichtLoading, setOverzichtLoading] = useState(false)
  // Nacalculatie state
  const [nacalcProject, setNacalcProject] = useState('')
  const [nacalcOrders, setNacalcOrders] = useState([])
  const [nacalcLoading, setNacalcLoading] = useState(false)
  const [nacalcFilter, setNacalcFilter] = useState('alle') // 'alle', 'open', 'klaar'

  // Load all orders
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('orders').select('*')
      setAllOrders(data || [])
    }
    load()
  }, [projecten])

  // Load calendar data: which days have uren for selected medewerker
  useEffect(() => {
    if (!selectedMedewerker) return
    const loadCalendar = async () => {
      const [year, month] = calendarMonth.split('-').map(Number)
      const startDatum = `${year}-${String(month).padStart(2, '0')}-01`
      const endDatum = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`
      const { data } = await supabase.from('uren_registratie')
        .select('datum, uren')
        .eq('medewerker_id', selectedMedewerker.id)
        .gte('datum', startDatum)
        .lte('datum', endDatum)
      const perDag = {}
      ;(data || []).forEach(r => {
        perDag[r.datum] = (perDag[r.datum] || 0) + r.uren
      })
      setDagenMetUren(perDag)
    }
    loadCalendar()
  }, [selectedMedewerker, calendarMonth, regels])

  // Load existing registrations when medewerker or datum changes
  useEffect(() => {
    if (!selectedMedewerker) return
    const load = async () => {
      const { data } = await supabase.from('uren_registratie')
        .select('*')
        .eq('medewerker_id', selectedMedewerker.id)
        .eq('datum', datum)
        .order('created_at')
      if (data && data.length > 0) {
        setRegels(data.map(r => ({
          id: r.id,
          uren: r.uren,
          project_id: r.project_id,
          order_id: r.order_id,
          type_werk: r.type_werk || 'onderdelen',
          notitie: r.notitie || '',
          saved: true
        })))
      } else {
        setRegels([{ uren: '', project_id: '', order_id: '', type_werk: 'onderdelen', notitie: '', saved: false }])
      }
    }
    load()
  }, [selectedMedewerker, datum])

  const addRegel = () => {
    setRegels([...regels, { uren: '', project_id: '', order_id: '', type_werk: 'onderdelen', notitie: '', saved: false }])
  }

  const updateRegel = (index, field, value) => {
    const updated = [...regels]
    updated[index] = { ...updated[index], [field]: value, saved: false }
    if (field === 'project_id') {
      updated[index].order_id = '' // reset order when project changes
    }
    setRegels(updated)
  }

  const removeRegel = async (index) => {
    const regel = regels[index]
    if (regel.id) {
      try {
        await supabase.from('uren_registratie').delete().eq('id', regel.id)
      } catch (e) {
        alert('Fout: ' + e.message)
        return
      }
    }
    setRegels(regels.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    if (!selectedMedewerker) return
    setSaving(true)

    try {
      for (const regel of regels) {
        if (!regel.uren || !regel.project_id || !regel.order_id) continue

        const data = {
          medewerker_id: selectedMedewerker.id,
          datum: datum,
          project_id: regel.project_id,
          order_id: regel.order_id,
          type_werk: regel.type_werk,
          uren: parseFloat(regel.uren),
          notitie: regel.notitie || null
        }

        if (regel.id) {
          await supabase.from('uren_registratie').update(data).eq('id', regel.id)
        } else {
          const { data: created } = await supabase.from('uren_registratie').insert(data).select().single()
          if (created) regel.id = created.id
        }
        regel.saved = true
      }

      setRegels([...regels])
      alert('Uren opgeslagen!')
    } catch (e) {
      alert('Fout bij opslaan: ' + e.message)
    }
    setSaving(false)
  }

  const kopieerVorigeDag = async () => {
    if (!selectedMedewerker) return
    const vorigeDag = new Date(datum)
    vorigeDag.setDate(vorigeDag.getDate() - 1)
    const vorigeDatum = vorigeDag.toISOString().split('T')[0]
    const { data } = await supabase.from('uren_registratie')
      .select('*')
      .eq('medewerker_id', selectedMedewerker.id)
      .eq('datum', vorigeDatum)
    if (!data || data.length === 0) {
      alert('Geen uren gevonden voor ' + vorigeDag.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' }))
      return
    }
    setRegels(data.map(r => ({
      uren: r.uren,
      project_id: r.project_id,
      order_id: r.order_id,
      type_werk: r.type_werk || 'onderdelen',
      notitie: r.notitie || '',
      saved: false
    })))
  }

  const handleProjectCreated = (created) => {
    if (projectModalRegelIndex !== null) {
      updateRegel(projectModalRegelIndex, 'project_id', created.id)
    }
    onRefresh()
    setShowProjectModal(false)
    setProjectModalRegelIndex(null)
  }

  const createInlineOrder = async (regelIndex) => {
    if (!nieuwOrderNaam.trim()) return
    const regel = regels[regelIndex]
    if (!regel.project_id) { alert('Selecteer eerst een project'); return }
    try {
      const { data: created } = await supabase.from('orders').insert({
        project_id: regel.project_id,
        naam: nieuwOrderNaam.trim(),
        added_from: 'tijdsregistratie'
      }).select().single()
      if (created) {
        setAllOrders([...allOrders, created])
        updateRegel(regelIndex, 'order_id', created.id)
      }
      setNieuwOrderNaam('')
      setAanmakenOrder(null)
    } catch (e) {
      alert('Fout: ' + e.message)
    }
  }

  const totaalUren = regels.reduce((sum, r) => sum + (parseFloat(r.uren) || 0), 0)

  const ordersVoorProject = (projectId) => allOrders.filter(o => o.project_id === projectId)

  const loadOverzicht = async () => {
    if (!overzichtProject) return
    setOverzichtLoading(true)
    try {
      let query = supabase.from('uren_registratie').select('*').eq('project_id', overzichtProject).order('datum', { ascending: false })
      if (overzichtOrder) {
        query = query.eq('order_id', overzichtOrder)
      }
      const { data } = await query
      setOverzichtData(data || [])
    } catch (e) {
      console.error('Fout:', e)
    }
    setOverzichtLoading(false)
  }

  useEffect(() => {
    if (activeTab === 'overzicht' && overzichtProject) {
      loadOverzicht()
    }
  }, [overzichtProject, overzichtOrder, activeTab])

  // Nacalculatie: load orders per project with uren count
  const loadNacalculatie = async (projectId) => {
    if (!projectId) return
    setNacalcLoading(true)
    try {
      const { data: orders } = await supabase.from('orders').select('*').eq('project_id', projectId)
      // For each order, get total uren and producten count
      const ordersMetData = await Promise.all((orders || []).map(async (order) => {
        const { data: urenData } = await supabase.from('uren_registratie').select('uren').eq('order_id', order.id)
        const { data: productenData } = await supabase.from('order_producten').select('id').eq('order_id', order.id)
        const totaalUren = (urenData || []).reduce((sum, r) => sum + r.uren, 0)
        return {
          ...order,
          totaal_uren: totaalUren,
          aantal_registraties: (urenData || []).length,
          aantal_producten: (productenData || []).length
        }
      }))
      setNacalcOrders(ordersMetData)
    } catch (e) {
      console.error('Fout:', e)
    }
    setNacalcLoading(false)
  }

  useEffect(() => {
    if (activeTab === 'nacalculatie' && nacalcProject) {
      loadNacalculatie(nacalcProject)
    }
  }, [nacalcProject, activeTab])

  const toggleNacalcStatus = async (orderId, field) => {
    const order = nacalcOrders.find(o => o.id === orderId)
    if (!order) return
    const newValue = !order[field]
    try {
      await supabase.from('orders').update({ [field]: newValue }).eq('id', orderId)
      setNacalcOrders(nacalcOrders.map(o => o.id === orderId ? { ...o, [field]: newValue } : o))
    } catch (e) {
      alert('Fout: ' + e.message)
    }
  }

  // Only show orders that actually have hour registrations
  const nacalcOrdersMetUren = nacalcOrders.filter(o => o.aantal_registraties > 0)

  const nacalcGefilterdeOrders = nacalcOrdersMetUren.filter(o => {
    if (nacalcFilter === 'open') return !o.nacalculatie_klaar
    if (nacalcFilter === 'klaar') return o.nacalculatie_klaar
    return true
  })

  // Group overzicht data
  const overzichtPerMedewerker = {}
  const overzichtPerTypeWerk = {}
  let overzichtTotaal = 0
  overzichtData.forEach(r => {
    const mNaam = medewerkers.find(m => m.id === r.medewerker_id)?.naam || 'Onbekend'
    overzichtPerMedewerker[mNaam] = (overzichtPerMedewerker[mNaam] || 0) + r.uren
    overzichtPerTypeWerk[r.type_werk || 'overig'] = (overzichtPerTypeWerk[r.type_werk || 'overig'] || 0) + r.uren
    overzichtTotaal += r.uren
  })

  // Group by date
  const overzichtPerDatum = {}
  overzichtData.forEach(r => {
    if (!overzichtPerDatum[r.datum]) overzichtPerDatum[r.datum] = []
    overzichtPerDatum[r.datum].push(r)
  })

  // Calendar helper
  const calendarDays = (() => {
    const [year, month] = calendarMonth.split('-').map(Number)
    const firstDay = new Date(year, month - 1, 1)
    const lastDay = new Date(year, month, 0)
    const startPad = (firstDay.getDay() + 6) % 7 // Monday=0
    const days = []
    for (let i = 0; i < startPad; i++) days.push(null)
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      days.push({ day: d, date: dateStr, uren: dagenMetUren[dateStr] || 0 })
    }
    return days
  })()

  const calendarMonthLabel = (() => {
    const [year, month] = calendarMonth.split('-').map(Number)
    return new Date(year, month - 1).toLocaleDateString('nl-BE', { month: 'long', year: 'numeric' })
  })()

  const prevMonth = () => {
    const [y, m] = calendarMonth.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const nextMonth = () => {
    const [y, m] = calendarMonth.split('-').map(Number)
    const d = new Date(y, m, 1)
    setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">⏱️ Tijdsregistratie</h2>
          <p className="text-sm text-gray-500 mt-1">Registreer en beheer werkuren per medewerker</p>
        </div>
        <button
          onClick={() => setShowBeheer(!showBeheer)}
          className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200 transition-colors flex items-center gap-2"
        >
          👷 Medewerkers beheren
        </button>
      </div>

      {showBeheer && <MedewerkerBeheer medewerkers={medewerkers} onRefresh={onRefresh} />}

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl">
        {[
          { id: 'invoer', icon: '✏️', label: 'Invoer' },
          { id: 'overzicht', icon: '📊', label: 'Overzicht' },
          { id: 'nacalculatie', icon: '✅', label: 'Nacalculatie' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'invoer' && (
      <>
      <div className="bg-white rounded-xl border shadow-sm p-5 mb-4">
        <div className="flex flex-wrap gap-4 items-end mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Datum</label>
            <input
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              className="border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Medewerker</label>
            <select
              value={selectedMedewerker?.id || ''}
              onChange={(e) => {
                const m = medewerkers.find(m => m.id === e.target.value)
                setSelectedMedewerker(m || null)
              }}
              className="border rounded-lg px-3 py-2.5 text-sm min-w-48 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">-- Kies medewerker --</option>
              {medewerkers.map(m => (
                <option key={m.id} value={m.id}>{m.naam}</option>
              ))}
            </select>
          </div>
          {selectedMedewerker && (
            <button
              onClick={kopieerVorigeDag}
              className="px-4 py-2.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-sm hover:bg-amber-100 transition-colors"
              title="Kopieer de uren van gisteren als template"
            >
              📋 Kopieer gisteren
            </button>
          )}
        </div>
      </div>

      {selectedMedewerker && (
        <div className="bg-white rounded-xl border shadow-sm p-5 mb-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-semibold text-gray-800">{selectedMedewerker.naam}</h3>
              <p className="text-sm text-gray-500">{new Date(datum).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-600">{totaalUren}u</div>
                <div className="text-xs text-gray-400">totaal</div>
              </div>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${
                totaalUren >= 8 ? 'bg-green-100 text-green-600' : totaalUren > 0 ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-400'
              }`}>
                {totaalUren >= 8 ? '✓' : totaalUren > 0 ? '◔' : '○'}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {regels.map((regel, index) => (
              <div key={index} className={`p-3 rounded-xl border-2 transition-colors ${
                regel.saved ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="relative">
                    <input
                      type="number"
                      value={regel.uren}
                      onChange={(e) => updateRegel(index, 'uren', e.target.value)}
                      placeholder="0"
                      className="w-20 border rounded-lg px-2 py-2 text-sm text-right font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      step="0.5"
                      min="0"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">u</span>
                  </div>

                  <select value={regel.project_id} onChange={(e) => { if (e.target.value === '__nieuw__') { setProjectModalRegelIndex(index); setShowProjectModal(true) } else { updateRegel(index, 'project_id', e.target.value) } }} className="border rounded-lg px-2 py-2 text-sm min-w-40 focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">Project...</option>
                    {projecten.map(p => <option key={p.id} value={p.id}>{p.emoji || ''} {p.naam || p.project_nummer}</option>)}
                    <option value="__nieuw__">+ Nieuw project</option>
                  </select>

                  {aanmakenOrder === index ? (
                    <div className="flex gap-1 items-center">
                      <input type="text" value={nieuwOrderNaam} onChange={(e) => setNieuwOrderNaam(e.target.value)} placeholder="Order naam..." className="border rounded-lg px-2 py-2 text-sm w-40" autoFocus onKeyDown={(e) => e.key === 'Enter' && createInlineOrder(index)} />
                      <button onClick={() => createInlineOrder(index)} className="px-2 py-2 bg-green-600 text-white rounded-lg text-sm">✓</button>
                      <button onClick={() => setAanmakenOrder(null)} className="px-2 py-2 bg-gray-300 rounded-lg text-sm">✕</button>
                    </div>
                  ) : (
                    <select value={regel.order_id} onChange={(e) => { if (e.target.value === '__nieuw__') { setAanmakenOrder(index) } else { updateRegel(index, 'order_id', e.target.value) } }} className="border rounded-lg px-2 py-2 text-sm min-w-40 focus:ring-2 focus:ring-blue-500 outline-none" disabled={!regel.project_id}>
                      <option value="">Order...</option>
                      {ordersVoorProject(regel.project_id).map(o => <option key={o.id} value={o.id}>{o.naam}</option>)}
                      <option value="__nieuw__">+ Nieuwe order</option>
                    </select>
                  )}

                  <div className="flex gap-1">
                    {typeWerkOpties.map(tw => (
                      <button key={tw} onClick={() => updateRegel(index, 'type_werk', tw)} className={`px-2.5 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                        regel.type_werk === tw
                          ? tw === 'onderdelen' ? 'bg-blue-600 text-white' : tw === 'monteren' ? 'bg-emerald-600 text-white' : tw === 'inpakken' ? 'bg-amber-500 text-white' : 'bg-gray-600 text-white'
                          : 'bg-white border hover:bg-gray-100'
                      }`}>
                        {tw}
                      </button>
                    ))}
                  </div>

                  <button onClick={() => removeRegel(index)} className="text-red-300 hover:text-red-500 ml-auto transition-colors text-lg">✕</button>
                </div>

                {regel.order_id && <OrderProducten orderId={regel.order_id} />}
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center mt-4 pt-4 border-t">
            <button onClick={addRegel} className="px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
              + Regel toevoegen
            </button>
            <button onClick={handleSave} disabled={saving} className="px-8 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 font-semibold shadow-sm transition-colors">
              {saving ? 'Opslaan...' : '💾 Opslaan'}
            </button>
          </div>
        </div>
      )}

      {/* Kalender */}
      {selectedMedewerker && (
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <div className="flex justify-between items-center mb-4">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">◀</button>
            <h3 className="font-semibold text-gray-700 capitalize">{calendarMonthLabel}</h3>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">▶</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 mb-2">
            {['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map(d => <div key={d} className="py-1 font-medium">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, i) => day ? (
              <button
                key={i}
                onClick={() => setDatum(day.date)}
                className={`p-2 rounded-lg text-sm transition-all relative ${
                  day.date === datum
                    ? 'bg-blue-600 text-white font-bold shadow-sm'
                    : day.date === new Date().toISOString().split('T')[0]
                    ? 'bg-blue-50 text-blue-700 font-medium ring-2 ring-blue-300'
                    : 'hover:bg-gray-100'
                }`}
              >
                <div>{day.day}</div>
                {day.uren > 0 && day.date !== datum && (
                  <div className={`text-[10px] font-medium ${day.uren >= 8 ? 'text-green-600' : 'text-amber-600'}`}>{day.uren}u</div>
                )}
                {day.uren > 0 && day.date === datum && (
                  <div className="text-[10px] font-medium text-blue-200">{day.uren}u</div>
                )}
                {day.uren === 0 && <div className="text-[10px] text-transparent">-</div>}
              </button>
            ) : <div key={i} />)}
          </div>
          <div className="mt-3 pt-3 border-t flex justify-between text-xs text-gray-500">
            <span>Totaal deze maand: <strong className="text-gray-700">{Object.values(dagenMetUren).reduce((s, u) => s + u, 0)}u</strong></span>
            <span>{Object.keys(dagenMetUren).length} dagen gewerkt</span>
          </div>
        </div>
      )}

      {!selectedMedewerker && (
        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border shadow-sm">
          <div className="text-4xl mb-3">👷</div>
          <p className="font-medium">Selecteer een medewerker om uren in te vullen</p>
        </div>
      )}
      </>
      )}

      {activeTab === 'overzicht' && (
        <div>
          <div className="bg-white rounded-xl border shadow-sm p-5 mb-4">
            <div className="flex flex-wrap gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Project</label>
                <select
                  value={overzichtProject}
                  onChange={(e) => { setOverzichtProject(e.target.value); setOverzichtOrder('') }}
                  className="border rounded-lg px-3 py-2.5 text-sm min-w-48 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">-- Kies project --</option>
                  {projecten.map(p => (
                    <option key={p.id} value={p.id}>{p.emoji || ''} {p.naam || p.project_nummer}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Order (optioneel)</label>
                <select
                  value={overzichtOrder}
                  onChange={(e) => setOverzichtOrder(e.target.value)}
                  className="border rounded-lg px-3 py-2.5 text-sm min-w-48 focus:ring-2 focus:ring-blue-500 outline-none"
                  disabled={!overzichtProject}
                >
                  <option value="">Alle orders</option>
                  {ordersVoorProject(overzichtProject).map(o => (
                    <option key={o.id} value={o.id}>{o.naam}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {overzichtLoading && <LoadingSpinner />}

          {!overzichtLoading && overzichtProject && overzichtData.length > 0 && (
            <div className="space-y-4">
              {/* Samenvatting */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200 p-5">
                  <div className="text-xs font-medium text-blue-600 mb-1">Totaal uren</div>
                  <div className="text-4xl font-bold text-blue-700">{overzichtTotaal}u</div>
                  <div className="text-sm text-blue-500 mt-1">{overzichtData.length} registraties</div>
                </div>

                <div className="bg-white rounded-xl border shadow-sm p-5">
                  <div className="text-xs font-medium text-gray-500 mb-3">Per medewerker</div>
                  <div className="space-y-2">
                    {Object.entries(overzichtPerMedewerker).sort((a, b) => b[1] - a[1]).map(([naam, uren]) => (
                      <div key={naam} className="flex justify-between items-center text-sm">
                        <span className="text-gray-700">{naam}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min((uren / overzichtTotaal) * 100, 100)}%` }} />
                          </div>
                          <span className="font-semibold text-gray-700 w-12 text-right">{uren}u</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-xl border shadow-sm p-5">
                  <div className="text-xs font-medium text-gray-500 mb-3">Per type werk</div>
                  <div className="space-y-2">
                    {Object.entries(overzichtPerTypeWerk).sort((a, b) => b[1] - a[1]).map(([type, uren]) => {
                      const color = type === 'onderdelen' ? 'bg-blue-500' : type === 'monteren' ? 'bg-emerald-500' : type === 'inpakken' ? 'bg-amber-500' : 'bg-gray-500'
                      return (
                        <div key={type} className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">{type}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min((uren / overzichtTotaal) * 100, 100)}%` }} />
                            </div>
                            <span className="font-semibold text-gray-700 w-12 text-right">{uren}u</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Detail per datum */}
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="bg-gray-50 px-5 py-3 font-semibold text-sm text-gray-700 border-b">Detail per dag</div>
                <div className="divide-y">
                  {Object.entries(overzichtPerDatum).sort((a, b) => b[0].localeCompare(a[0])).map(([datum, items]) => {
                    const dagTotaal = items.reduce((sum, r) => sum + r.uren, 0)
                    return (
                      <div key={datum} className="px-4 py-3">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-medium text-sm">{new Date(datum).toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          <span className="text-sm font-semibold text-blue-600">{dagTotaal}u</span>
                        </div>
                        <div className="space-y-1">
                          {items.map(r => {
                            const mNaam = medewerkers.find(m => m.id === r.medewerker_id)?.naam || '?'
                            const oNaam = allOrders.find(o => o.id === r.order_id)?.naam || '?'
                            return (
                              <div key={r.id} className="flex items-center gap-2 text-xs text-gray-600">
                                <span className="bg-gray-100 px-2 py-0.5 rounded">{mNaam}</span>
                                <span>{r.uren}u</span>
                                <span className="text-gray-400">—</span>
                                <span>{oNaam}</span>
                                <span className={`px-1.5 py-0.5 rounded text-xs ${
                                  r.type_werk === 'onderdelen' ? 'bg-blue-100 text-blue-700' :
                                  r.type_werk === 'monteren' ? 'bg-green-100 text-green-700' :
                                  r.type_werk === 'inpakken' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>{r.type_werk}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {!overzichtLoading && overzichtProject && overzichtData.length === 0 && (
            <div className="text-center py-16 text-gray-400 bg-white rounded-xl border shadow-sm">
              <div className="text-4xl mb-3">📭</div>
              <p className="font-medium">Geen uren gevonden{overzichtOrder ? ' voor deze order' : ' voor dit project'}</p>
            </div>
          )}

          {!overzichtProject && (
            <div className="text-center py-16 text-gray-400 bg-white rounded-xl border shadow-sm">
              <div className="text-4xl mb-3">📊</div>
              <p className="font-medium">Selecteer een project om het urenoverzicht te bekijken</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'nacalculatie' && (
        <div>
          <div className="bg-white rounded-xl border shadow-sm p-5 mb-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Project</label>
                <select
                  value={nacalcProject}
                  onChange={(e) => setNacalcProject(e.target.value)}
                  className="border rounded-lg px-3 py-2.5 text-sm min-w-48 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">-- Kies project --</option>
                  {projecten.map(p => (
                    <option key={p.id} value={p.id}>{p.emoji || ''} {p.naam || p.project_nummer}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Filter</label>
                <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                  {[
                    { id: 'alle', label: 'Alle' },
                    { id: 'open', label: 'Open' },
                    { id: 'klaar', label: 'Afgevinkt' }
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setNacalcFilter(f.id)}
                      className={`px-3 py-1.5 text-sm rounded-md transition-all ${nacalcFilter === f.id ? 'bg-white text-blue-700 shadow-sm font-medium' : 'text-gray-600 hover:text-gray-800'}`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {nacalcLoading && <LoadingSpinner />}

          {!nacalcLoading && nacalcProject && nacalcGefilterdeOrders.length > 0 && (
            <div className="space-y-4">
              {/* Samenvatting */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200 p-5 text-center">
                  <div className="text-3xl font-bold text-blue-700">{nacalcOrdersMetUren.length}</div>
                  <div className="text-xs font-medium text-blue-600 mt-1">Orders met uren</div>
                </div>
                <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl border border-amber-200 p-5 text-center">
                  <div className="text-3xl font-bold text-amber-700">{nacalcOrdersMetUren.filter(o => o.uren_compleet && !o.nacalculatie_klaar).length}</div>
                  <div className="text-xs font-medium text-amber-600 mt-1">Nog nacalculeren</div>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl border border-green-200 p-5 text-center">
                  <div className="text-3xl font-bold text-green-700">{nacalcOrdersMetUren.filter(o => o.nacalculatie_klaar).length}</div>
                  <div className="text-xs font-medium text-green-600 mt-1">Nagecalculeerd</div>
                </div>
              </div>

              {/* Progress bar */}
              {nacalcOrdersMetUren.length > 0 && (
                <div className="bg-white rounded-xl border shadow-sm p-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-2">
                    <span>Voortgang nacalculatie</span>
                    <span>{Math.round((nacalcOrdersMetUren.filter(o => o.nacalculatie_klaar).length / nacalcOrdersMetUren.length) * 100)}%</span>
                  </div>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all" style={{ width: `${(nacalcOrdersMetUren.filter(o => o.nacalculatie_klaar).length / nacalcOrdersMetUren.length) * 100}%` }} />
                  </div>
                </div>
              )}

              {/* Orders lijst */}
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 border-b">
                      <th className="px-5 py-3">Order</th>
                      <th className="px-5 py-3 text-right">Uren</th>
                      <th className="px-5 py-3 text-right">Producten</th>
                      <th className="px-5 py-3 text-center">Uren compleet</th>
                      <th className="px-5 py-3 text-center">Nagecalculeerd</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {nacalcGefilterdeOrders.map(order => (
                      <tr key={order.id} className={`transition-colors ${
                        order.nacalculatie_klaar ? 'bg-green-50 hover:bg-green-100' : order.uren_compleet ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-50'
                      }`}>
                        <td className="px-5 py-4">
                          <div className="font-medium text-sm text-gray-800">{order.naam || 'Naamloos'}</div>
                          <div className="text-xs text-gray-400">{order.aantal_registraties} registraties</div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="font-bold text-sm text-gray-800">{order.totaal_uren}u</span>
                        </td>
                        <td className="px-5 py-4 text-right text-sm text-gray-600">
                          {order.aantal_producten > 0 ? (
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">{order.aantal_producten}</span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <button
                            onClick={() => toggleNacalcStatus(order.id, 'uren_compleet')}
                            className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center text-sm font-bold transition-all mx-auto ${
                              order.uren_compleet
                                ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                                : 'border-gray-300 hover:border-amber-400 hover:bg-amber-50'
                            }`}
                          >
                            {order.uren_compleet ? '✓' : ''}
                          </button>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <button
                            onClick={() => toggleNacalcStatus(order.id, 'nacalculatie_klaar')}
                            className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center text-sm font-bold transition-all mx-auto ${
                              order.nacalculatie_klaar
                                ? 'bg-green-500 border-green-500 text-white shadow-sm'
                                : 'border-gray-300 hover:border-green-400 hover:bg-green-50'
                            }`}
                          >
                            {order.nacalculatie_klaar ? '✓' : ''}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* KPI: uren per product */}
              {nacalcGefilterdeOrders.some(o => o.aantal_producten > 0 && o.totaal_uren > 0) && (
                <div className="bg-white rounded-xl border shadow-sm p-5">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">📈 Uren per product (KPI)</h4>
                  <div className="space-y-2">
                    {nacalcGefilterdeOrders.filter(o => o.aantal_producten > 0 && o.totaal_uren > 0).map(order => {
                      const urenPerProduct = (order.totaal_uren / order.aantal_producten).toFixed(1)
                      return (
                        <div key={order.id} className="flex items-center gap-3 text-sm">
                          <span className="text-gray-700 w-40 truncate">{order.naam}</span>
                          <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min((order.totaal_uren / Math.max(...nacalcGefilterdeOrders.map(o => o.totaal_uren))) * 100, 100)}%` }} />
                          </div>
                          <span className="font-bold text-indigo-600 w-20 text-right">{urenPerProduct}u/stuk</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {!nacalcLoading && nacalcProject && nacalcGefilterdeOrders.length === 0 && (
            <div className="text-center py-16 text-gray-400 bg-white rounded-xl border shadow-sm">
              <div className="text-4xl mb-3">{nacalcFilter !== 'alle' ? '🔍' : '📭'}</div>
              <p className="font-medium">{nacalcFilter !== 'alle' ? 'Geen orders gevonden met deze filter' : 'Geen orders met uren gevonden voor dit project'}</p>
            </div>
          )}

          {!nacalcProject && (
            <div className="text-center py-16 text-gray-400 bg-white rounded-xl border shadow-sm">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-medium">Selecteer een project om de nacalculatie te beheren</p>
            </div>
          )}
        </div>
      )}
      {showProjectModal && (
        <ProjectAanmaakModal
          onClose={() => { setShowProjectModal(false); setProjectModalRegelIndex(null) }}
          onCreate={handleProjectCreated}
        />
      )}
    </div>
  )
}

// =====================================================
// KANBAN ORDER MODAL
// =====================================================
const KanbanOrderModal = ({ order, onClose, onUpdate }) => {
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

// =====================================================
// PROJECT AANMAAK MODAL
// =====================================================
const ProjectAanmaakModal = ({ onClose, onCreate }) => {
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
              <div className="flex gap-2 items-center">
                <input type="color" value={form.kleur} onChange={e => setForm({...form, kleur: e.target.value})}
                  className="w-10 h-10 rounded cursor-pointer border" />
                <span className="text-xs text-gray-400">{form.kleur}</span>
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

// =====================================================
// KANBAN BOARD
// =====================================================
const KanbanBoard = ({ projecten }) => {
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

// =====================================================
// MAIN APP
// =====================================================
export default function App() {
  const [view, setView] = useState('projecten')
  const [projecten, setProjecten] = useState([])
  const [bibliotheek, setBibliotheek] = useState([])
  const [sjablonen, setSjablonen] = useState([])
  const [medewerkers, setMedewerkers] = useState([])
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

      const { data: medewerkersData } = await supabase.from('medewerkers').select('*').eq('actief', true).order('naam')

      const sjablonenMetItems = (sjablonenData || []).map(s => ({
        ...s,
        items: (sjabloonItems || []).filter(i => i.sjabloon_id === s.id)
      }))

      setProjecten(projectenData || [])
      setBibliotheek(bibliotheekData || [])
      setSjablonen(sjablonenMetItems)
      setMedewerkers(medewerkersData || [])
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

  const [showProjectModal, setShowProjectModal] = useState(false)

  const handleNewProject = (created) => {
    setProjecten([created, ...projecten])
    setSelectedProject(created)
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
        <div className="mx-auto px-6 py-3 flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">🪑 Projectbeheer</h1>
            <nav className="flex flex-wrap gap-1">
              {[
                { id: 'projecten', icon: '📁', label: 'Projecten' },
                { id: 'kanban', icon: '📋', label: 'Kanban' },
                { id: 'tijdsregistratie', icon: '⏱️', label: 'Uren' },
                { id: 'bibliotheek', icon: '📚', label: 'Bibliotheek' },
                { id: 'sjablonen', icon: '📋', label: 'Sjablonen' }
              ].map(v => (
                <button
                  key={v.id}
                  onClick={() => {
                    setView(v.id)
                    if (v.id !== 'projecten') setSelectedProject(null)
                  }}
                  className={`px-3 py-1.5 rounded text-sm ${view === v.id && !selectedProject ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  {v.icon} <span className="hidden sm:inline">{v.label}</span>
                </button>
              ))}
              {selectedProject && (
                <span className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-green-100 text-green-700">
                  🔧 <span className="hidden sm:inline">{selectedProject.naam || selectedProject.project_nummer}</span>
                </span>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <ConnectionStatus isOnline={isOnline} lastSync={lastSync} />
            <button onClick={loadData} className="px-3 py-1.5 bg-gray-200 rounded text-sm hover:bg-gray-300">🔄</button>
          </div>
        </div>
      </header>

      <main className={`mx-auto px-6 py-6 ${view === 'kanban' && !selectedProject ? 'max-w-full' : 'max-w-[1600px]'}`}>
        {selectedProject ? (
          <ProjectDetail
            project={selectedProject}
            bibliotheek={bibliotheek}
            sjablonen={sjablonen}
            medewerkers={medewerkers}
            onBack={() => { setSelectedProject(null); loadData() }}
            onRefresh={loadData}
            onUpdateProject={updateProject}
            onDeleteProject={deleteProject}
          />
        ) : (
          <>
            {view === 'projecten' && (
              <div>
                <button onClick={() => setShowProjectModal(true)} className="mb-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">+ Nieuw Project</button>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {projecten.map(p => <ProjectCard key={p.id} project={p} onClick={() => setSelectedProject(p)} />)}
                </div>
                {projecten.length === 0 && <div className="text-center py-12 text-gray-500">Nog geen projecten. Maak je eerste project aan!</div>}
              </div>
            )}
            {view === 'kanban' && <KanbanBoard projecten={projecten} />}
            {view === 'tijdsregistratie' && <Tijdsregistratie projecten={projecten} medewerkers={medewerkers} onRefresh={loadData} />}
            {view === 'bibliotheek' && <BibliotheekBeheer bibliotheek={bibliotheek} onRefresh={loadData} />}
            {view === 'sjablonen' && <SjablonenBeheer sjablonen={sjablonen} bibliotheek={bibliotheek} onRefresh={loadData} />}
          </>
        )}
      </main>

      {showProjectModal && (
        <ProjectAanmaakModal
          onClose={() => setShowProjectModal(false)}
          onCreate={handleNewProject}
        />
      )}
    </div>
  )
}
