import React from 'react'

export const ConnectionStatus = ({ isOnline, lastSync }) => (
  <div className={`flex items-center gap-2 text-xs ${isOnline ? 'text-green-600' : 'text-red-600'}`}>
    <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
    {isOnline ? 'Online' : 'Offline'}
    {lastSync && <span className="text-gray-400">({new Date(lastSync).toLocaleTimeString('nl-BE')})</span>}
  </div>
)
