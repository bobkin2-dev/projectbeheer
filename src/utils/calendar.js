// =====================================================
// SHARED CALENDAR HELPERS
// =====================================================

export const getInitialCalendarMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const buildCalendarDays = (calendarMonth, dataPerDay = {}, valueKey = 'value') => {
  const [year, month] = calendarMonth.split('-').map(Number)
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const startPad = (firstDay.getDay() + 6) % 7 // Monday=0
  const days = []
  for (let i = 0; i < startPad; i++) days.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    days.push({ day: d, date: dateStr, [valueKey]: dataPerDay[dateStr] || 0 })
  }
  return days
}

export const getCalendarMonthLabel = (calendarMonth) => {
  const [year, month] = calendarMonth.split('-').map(Number)
  return new Date(year, month - 1).toLocaleDateString('nl-BE', { month: 'long', year: 'numeric' })
}

export const getPrevMonth = (calendarMonth) => {
  const [y, m] = calendarMonth.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const getNextMonth = (calendarMonth) => {
  const [y, m] = calendarMonth.split('-').map(Number)
  const d = new Date(y, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
