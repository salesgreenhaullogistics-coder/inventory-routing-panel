import { useState } from 'react'

export default function FilterBar({ filters, values, onChange }) {
  const [localValues, setLocalValues] = useState(values || {})

  const handleChange = (key, val) => {
    const next = { ...localValues, [key]: val }
    setLocalValues(next)
    onChange(next)
  }

  const handleClear = () => {
    const empty = {}
    filters.forEach(f => { empty[f.key] = '' })
    setLocalValues(empty)
    onChange(empty)
  }

  return (
    <div className="flex flex-wrap items-end gap-3 p-4 bg-white/60 backdrop-blur-sm rounded-2xl border border-gray-100/80">
      {filters.map(filter => (
        <div key={filter.key} className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{filter.label}</label>
          {filter.type === 'select' ? (
            <select
              value={localValues[filter.key] || ''}
              onChange={e => handleChange(filter.key, e.target.value)}
              className="input-field min-w-[140px]"
            >
              <option value="">All</option>
              {filter.options?.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : filter.type === 'date' ? (
            <input type="date" value={localValues[filter.key] || ''} onChange={e => handleChange(filter.key, e.target.value)} className="input-field" />
          ) : (
            <input type="text" value={localValues[filter.key] || ''} onChange={e => handleChange(filter.key, e.target.value)} placeholder={filter.placeholder || 'Filter...'} className="input-field min-w-[140px]" />
          )}
        </div>
      ))}
      <button onClick={handleClear} className="px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">Clear</button>
    </div>
  )
}
