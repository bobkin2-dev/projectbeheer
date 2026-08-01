import React from 'react'

// Capaciteitsbalk — toont per week hoeveel % ingepland is
export const PlanningCapaciteit = ({ weken, maxCapaciteitPerWeek, waarschuwingPercentage = 80 }) => {
  // weken = [{ weekNr, label, urenGepland }]

  return (
    <div className="bg-white rounded-xl border shadow-sm p-5 mb-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-gray-800">📊 Weekcapaciteit</h3>
        <div className="flex gap-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-gradient-to-t from-emerald-300 to-emerald-500"></span> Ruimte</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-gradient-to-t from-amber-300 to-amber-500"></span> &gt;{waarschuwingPercentage}%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-gradient-to-t from-red-300 to-red-500"></span> Overvol</span>
        </div>
      </div>

      <div className="flex gap-1">
        {weken.map((week, i) => {
          const percentage = maxCapaciteitPerWeek > 0 ? Math.round((week.urenGepland / maxCapaciteitPerWeek) * 100) : 0
          const hoogte = Math.min(percentage, 100)
          const isVandaag = week.isHuidigeWeek
          const isOver = percentage > 100
          const isWaarschuwing = percentage > waarschuwingPercentage && percentage <= 100

          let barClass = 'bg-gradient-to-t from-emerald-300 to-emerald-500'
          if (isOver) barClass = 'bg-gradient-to-t from-red-400 to-red-600'
          else if (isWaarschuwing) barClass = 'bg-gradient-to-t from-amber-300 to-amber-500'

          return (
            <div key={i} className="flex-1 text-center">
              <div className="text-[10px] text-gray-400 mb-1">
                {isVandaag ? <span className="text-red-600 font-bold">Wk {week.weekNr} ◄</span> : `Wk ${week.weekNr}`}
              </div>
              <div className={`relative h-14 bg-gray-100 rounded overflow-hidden ${isVandaag ? 'ring-2 ring-red-300' : ''} ${isOver ? 'ring-2 ring-red-400' : ''}`}>
                <div className={`absolute bottom-0 left-0 right-0 rounded ${barClass}`} style={{ height: `${hoogte}%` }}></div>
                {isOver && (
                  <div className="absolute top-0 left-0 right-0 bg-red-500/20 animate-pulse" style={{ height: `${Math.min(percentage - 100, 30)}%` }}></div>
                )}
                <div className={`absolute inset-0 flex items-center justify-center text-[10px] font-bold ${isOver ? 'text-white' : 'text-gray-700'}`}>
                  {percentage}%
                </div>
              </div>
              <div className={`text-[10px] mt-0.5 ${isOver ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                {week.urenGepland}u
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 mt-3 pt-3 border-t text-[10px] text-gray-400">
        <span>Max capaciteit/week:</span>
        <span className="text-xs font-bold text-gray-700">{maxCapaciteitPerWeek}u</span>
      </div>
    </div>
  )
}
