// =====================================================
// HELPER FUNCTIONS
// =====================================================

export const calculateOrderTotals = (items, korting = 0, kortingType = 'procent') => {
  const subtotaal = items.reduce((sum, item) => sum + (item.aantal * item.prijs_per_eenheid), 0)
  let kortingBedrag = kortingType === 'procent' ? subtotaal * (korting / 100) : korting
  const totaal = subtotaal - kortingBedrag
  return { subtotaal, korting: kortingBedrag, totaal }
}

// Helper: kan een order naar productie?
export const kanNaarProductie = (order) => order.tekening_goedgekeurd && order.materiaal_binnen
