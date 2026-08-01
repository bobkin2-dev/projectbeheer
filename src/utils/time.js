// =====================================================
// TIME CALCULATION HELPERS
// =====================================================

export const calcMinuten = (start, stop) => {
  if (!start || !stop) return null
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = stop.split(':').map(Number)
  return (eh * 60 + em) - (sh * 60 + sm)
}

export const formatMinuten = (min) => {
  if (min === null || min === undefined || min < 0) return '-'
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}u${m > 0 ? String(m).padStart(2, '0') : ''}` : `${m}min`
}
