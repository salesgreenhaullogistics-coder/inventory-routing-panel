const BANDS = [
  { min: 75, label: 'Excellent', color: 'emerald', bg: 'bg-emerald-100', text: 'text-emerald-700', bar: 'bg-emerald-500' },
  { min: 50, label: 'Good', color: 'blue', bg: 'bg-blue-100', text: 'text-blue-700', bar: 'bg-blue-500' },
  { min: 25, label: 'Fair', color: 'amber', bg: 'bg-amber-100', text: 'text-amber-700', bar: 'bg-amber-500' },
  { min: 0, label: 'Poor', color: 'red', bg: 'bg-red-100', text: 'text-red-700', bar: 'bg-red-500' },
]

function getBand(score) {
  const pct = Math.round((score || 0) * 100)
  const band = BANDS.find(b => pct >= b.min) || BANDS[BANDS.length - 1]
  return { ...band, pct }
}

export default function ScoreIndicator({ score, compact = false }) {
  if (!score && score !== 0) return <span className="text-gray-300">—</span>

  const { pct, label, bg, text, bar } = getBand(score)

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold ${bg} ${text}`}>
        {pct}
        <span className="text-[9px] font-medium opacity-75">{label}</span>
      </span>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-sm font-bold ${text}`}>{pct}</span>
          <span className={`text-[10px] font-semibold ${text} opacity-70`}>{label}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1.5 mt-0.5">
          <div className={`h-1.5 rounded-full ${bar} transition-all`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}

export { getBand }
