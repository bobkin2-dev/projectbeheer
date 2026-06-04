// =====================================================
// CONSTANTEN
// =====================================================

export const eenheden = ['stuk', 'plaat', 'meter', 'uur', 'dag', 'm²', 'm³', 'kg', 'set', 'forfait']

export const bibCategorieen = [
  { id: 'materialen', label: '📦 Materialen', icon: '📦' },
  { id: 'arbeid', label: '👷 Arbeid', icon: '👷' },
  { id: 'materieel', label: '🚛 Materieel', icon: '🚛' },
  { id: 'onderaanneming', label: '🤝 Onderaanneming', icon: '🤝' }
]

// Nieuw statussysteem — lineaire hoofdstatus + parallelle tracks
export const orderStatusConfig = {
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

export const orderStatusVolgorde = ['prijsvraag', 'geteld', 'offerte_verstuurd', 'goedgekeurd', 'in_productie', 'kwaliteitscontrole', 'klaar_voor_plaatsing', 'in_plaatsing', 'geplaatst', 'opgeleverd']

// Kanban kolommen (gegroepeerd)
export const kanbanKolommen = [
  { id: 'offerte',       label: '📋 Offerte',       statussen: ['prijsvraag', 'geteld', 'offerte_verstuurd'] },
  { id: 'voorbereiding', label: '🔧 Voorbereiding', statussen: ['goedgekeurd'] },
  { id: 'productie',     label: '🏭 Productie',     statussen: ['in_productie', 'kwaliteitscontrole'] },
  { id: 'plaatsing',     label: '🚚 Plaatsing',     statussen: ['klaar_voor_plaatsing', 'in_plaatsing'] },
  { id: 'afgerond',      label: '✅ Afgerond',       statussen: ['geplaatst', 'opgeleverd'] }
]

export const typeWerkOpties = ['onderdelen', 'monteren', 'inpakken', 'lakwerk', 'metaalwerk', 'overig']

export const chauffeurs = ['Alex', 'Kurt']

// Legacy compat
export const offerteStatusConfig = orderStatusConfig
export const werkvoorbereidingConfig = { nietGestart: { label: 'Niet gestart', kleur: 'bg-gray-100 text-gray-600' }, klaar: { label: '✓ Klaar', kleur: 'bg-green-100 text-green-800' } }
export const productieConfig = { wacht: { label: 'Wacht', kleur: 'bg-gray-100 text-gray-600' }, inProductie: { label: 'In productie', kleur: 'bg-purple-100 text-purple-800' }, klaar: { label: '✓ Klaar', kleur: 'bg-green-100 text-green-800' } }
export const plaatsingConfig = { wacht: { label: 'Wacht', kleur: 'bg-gray-100 text-gray-600' }, geplaatst: { label: '✓ Geplaatst', kleur: 'bg-green-100 text-green-800' } }
