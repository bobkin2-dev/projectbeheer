import React, { useEffect } from 'react'

// Toast notification (auto-dismiss)
export const Toast = ({ message, onDone }) => {
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
      <div className="bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
        <span>✓</span> {message}
      </div>
    </div>
  )
}
