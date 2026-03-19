import { useState, useEffect } from 'react'
import { getScoringBreakdown } from '../../api/client'

const FACTORS = [
  { key: 'distance', label: 'Distance', weight: '35%', color: 'bg-blue-500', light: 'bg-blue-100 text-blue-700', desc: 'Proximity to customer pincode. Closer = higher score.', formula: '1 / distance_km (normalized)' },
  { key: 'inventory', label: 'Inventory', weight: '25%', color: 'bg-emerald-500', light: 'bg-emerald-100 text-emerald-700', desc: 'Stock availability for the SKU. More stock = higher score.', formula: 'available_qty / required_qty (capped at 1.0)' },
  { key: 'load', label: 'Load', weight: '15%', color: 'bg-amber-500', light: 'bg-amber-100 text-amber-700', desc: 'Warehouse capacity utilization. Less loaded = higher score.', formula: '1 - (current_load / max_capacity)' },
  { key: 'rto', label: 'RTO', weight: '10%', color: 'bg-red-500', light: 'bg-red-100 text-red-700', desc: 'Return-to-Origin probability by pincode zone. Lower returns = higher score.', formula: '1 - rto_rate' },
  { key: 'speed', label: 'Speed', weight: '10%', color: 'bg-purple-500', light: 'bg-purple-100 text-purple-700', desc: 'Average delivery days. Faster delivery = higher score.', formula: '1 / avg_delivery_days' },
  { key: 'cost', label: 'Cost', weight: '5%', color: 'bg-pink-500', light: 'bg-pink-100 text-pink-700', desc: 'Base shipping cost. Cheaper = higher score.', formula: '1 / base_shipping_cost' },
]

function ScoreCell({ value, maxValue }) {
  const pct = maxValue > 0 ? (value / maxValue * 100) : 0
  const color = pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-500' : pct >= 25 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 bg-gray-200 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-gray-700 w-8 text-right">{(value * 100).toFixed(0)}</span>
    </div>
  )
}

export default function ScoringBreakdownChart() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showFormulas, setShowFormulas] = useState(false)

  useEffect(() => {
    getScoringBreakdown().then(setData).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="animate-pulse h-64 bg-gray-100 rounded-xl" />
  if (!data?.breakdown?.length) return <div className="text-gray-400 text-sm text-center py-8">No routing data yet. Route orders to see scoring analysis.</div>

  return (
    <div className="space-y-4">
      {/* Scoring Formula Card */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">How AI Routing Score is Calculated</p>
          <button onClick={() => setShowFormulas(!showFormulas)} className="text-[10px] text-indigo-500 hover:text-indigo-700 font-medium">
            {showFormulas ? 'Hide formulas' : 'Show formulas'}
          </button>
        </div>
        <p className="text-xs text-indigo-800 font-mono mt-1.5 leading-relaxed">
          Final Score = (Distance x 0.35) + (Inventory x 0.25) + (Load x 0.15) + (RTO x 0.10) + (Speed x 0.10) + (Cost x 0.05)
        </p>
        <p className="text-[10px] text-indigo-500 mt-1">Each factor is normalized 0-100 across warehouses using min-max scaling. Highest total score wins.</p>
      </div>

      {/* 6 Factor Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        {FACTORS.map(f => (
          <div key={f.key} className={`rounded-xl p-2.5 border ${f.light.split(' ')[0]} border-opacity-50`}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-sm ${f.color}`} />
                <span className={`text-xs font-bold ${f.light.split(' ')[1]}`}>{f.label}</span>
              </div>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${f.light}`}>{f.weight}</span>
            </div>
            <p className="text-[10px] text-gray-600 leading-snug">{f.desc}</p>
            {showFormulas && (
              <p className="text-[9px] font-mono text-gray-400 mt-1 bg-white/50 rounded px-1.5 py-0.5">{f.formula}</p>
            )}
          </div>
        ))}
      </div>

      {/* Per-Warehouse Score Matrix */}
      <div>
        <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-2">Warehouse Score Breakdown (Avg per Factor)</p>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 text-[10px] font-bold text-gray-500 uppercase">Warehouse</th>
                <th className="text-center px-2 py-2 text-[10px] font-bold text-gray-500">Orders</th>
                {FACTORS.map(f => (
                  <th key={f.key} className="text-center px-2 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <span className={`w-2 h-2 rounded-sm ${f.color}`} />
                      <span className="text-[9px] font-bold text-gray-500 uppercase">{f.label}</span>
                    </div>
                  </th>
                ))}
                <th className="text-center px-2 py-2 text-[10px] font-bold text-gray-800 uppercase">Final</th>
              </tr>
            </thead>
            <tbody>
              {data.breakdown.map((wh, i) => {
                const finalPct = Math.round((wh.avg_routing_score || 0) * 100)
                const finalColor = finalPct >= 75 ? 'text-emerald-700 bg-emerald-50' : finalPct >= 50 ? 'text-blue-700 bg-blue-50' : finalPct >= 25 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50'
                return (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-3 py-2.5 font-semibold text-gray-800">{wh.warehouse_name}</td>
                    <td className="px-2 py-2.5 text-center text-gray-500">{wh.order_count}</td>
                    <td className="px-2 py-2.5"><ScoreCell value={wh.avg_distance_score || 0} maxValue={1} /></td>
                    <td className="px-2 py-2.5"><ScoreCell value={wh.avg_inventory_score || 0} maxValue={1} /></td>
                    <td className="px-2 py-2.5"><ScoreCell value={wh.avg_load_score || 0} maxValue={1} /></td>
                    <td className="px-2 py-2.5"><ScoreCell value={wh.avg_rto_score || 0} maxValue={1} /></td>
                    <td className="px-2 py-2.5"><ScoreCell value={wh.avg_speed_score || 0} maxValue={1} /></td>
                    <td className="px-2 py-2.5"><ScoreCell value={wh.avg_cost_score || 0} maxValue={1} /></td>
                    <td className="px-2 py-2.5 text-center">
                      <span className={`text-sm font-bold px-2 py-0.5 rounded-lg ${finalColor}`}>{finalPct}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Score Interpretation Guide */}
      <div className="flex items-center justify-center gap-4 text-[10px] text-gray-500 pt-1">
        <span className="flex items-center gap-1"><span className="w-6 h-1.5 rounded bg-emerald-500" /> 75-100: Excellent</span>
        <span className="flex items-center gap-1"><span className="w-6 h-1.5 rounded bg-blue-500" /> 50-74: Good</span>
        <span className="flex items-center gap-1"><span className="w-6 h-1.5 rounded bg-amber-500" /> 25-49: Fair</span>
        <span className="flex items-center gap-1"><span className="w-6 h-1.5 rounded bg-red-500" /> 0-24: Poor</span>
      </div>
    </div>
  )
}
