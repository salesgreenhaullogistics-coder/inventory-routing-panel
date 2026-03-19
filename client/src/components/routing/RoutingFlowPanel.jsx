import { useState, useEffect } from 'react'
import { getRoutingAttempts } from '../../api/client'
import ScoreIndicator from '../common/ScoreIndicator'

const STATUS_STYLES = {
  selected: { bg: 'bg-emerald-100', border: 'border-emerald-400', text: 'text-emerald-800', icon: '✓', iconBg: 'bg-emerald-500' },
  partial: { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-800', icon: '½', iconBg: 'bg-amber-500' },
  rejected: { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-700', icon: '✗', iconBg: 'bg-red-500' },
  manual_override: { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-800', icon: '⚙', iconBg: 'bg-blue-500' },
}

function ScoreBar({ label, value, color }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-gray-500 w-12 text-right">{label}</span>
      <div className="flex-1 bg-gray-200 rounded-full h-1.5 w-16">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(value * 100, 100)}%` }} />
      </div>
      <span className="text-[10px] font-mono text-gray-600 w-8">{(value * 100).toFixed(0)}%</span>
    </div>
  )
}

function AttemptStep({ attempt, isLast }) {
  const style = STATUS_STYLES[attempt.status] || STATUS_STYLES.rejected

  return (
    <div className="flex gap-3">
      {/* Timeline */}
      <div className="flex flex-col items-center">
        <div className={`w-7 h-7 rounded-full ${style.iconBg} flex items-center justify-center text-white text-sm font-bold shadow-sm`}>
          {style.icon}
        </div>
        {!isLast && <div className="w-0.5 flex-1 bg-gray-200 my-1" />}
      </div>

      {/* Content */}
      <div className={`flex-1 ${style.bg} ${style.border} border rounded-xl p-3 mb-2`}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-gray-900">{attempt.warehouse_name || `Warehouse #${attempt.warehouse_id}`}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.bg} ${style.text} border ${style.border}`}>
              {attempt.status === 'selected' ? 'Selected' :
               attempt.status === 'partial' ? 'Partial' :
               attempt.status === 'manual_override' ? 'Manual Override' : 'Rejected'}
            </span>
          </div>
          {attempt.routing_score > 0 && (
            <ScoreIndicator score={attempt.routing_score} compact />
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 mb-2">
          <span>Distance: <strong>{attempt.distance_km?.toFixed(1)} km</strong></span>
          <span>Available: <strong>{attempt.available_qty}</strong></span>
          <span>Required: <strong>{attempt.required_qty}</strong></span>
          {attempt.allocated_qty > 0 && <span>Allocated: <strong className="text-emerald-700">{attempt.allocated_qty}</strong></span>}
          {attempt.rejection_reason && <span className="text-red-600">Reason: <strong>{attempt.rejection_reason}</strong></span>}
        </div>

        {/* Sub-score breakdown */}
        {attempt.routing_score > 0 && (
          <div className="grid grid-cols-5 gap-1">
            <ScoreBar label="Dist" value={attempt.distance_score} color="bg-blue-500" />
            <ScoreBar label="Inv" value={attempt.inventory_score} color="bg-emerald-500" />
            <ScoreBar label="Load" value={attempt.load_score} color="bg-amber-500" />
            <ScoreBar label="Speed" value={attempt.speed_score} color="bg-purple-500" />
            <ScoreBar label="Cost" value={attempt.cost_score} color="bg-pink-500" />
          </div>
        )}
      </div>
    </div>
  )
}

export default function RoutingFlowPanel({ orderId, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!orderId) return
    setLoading(true)
    getRoutingAttempts(orderId)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [orderId])

  if (!orderId) return null

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Routing Decision Flow</h2>
            {data?.order && (
              <p className="text-sm text-gray-500">
                Order: <span className="font-mono text-indigo-700">{data.order.reference_code || data.order.easyecom_order_id}</span>
                {' '} | Pincode: <span className="font-mono">{data.order.shipping_pincode}</span>
                {' '} | Status: <span className={`font-semibold ${data.order.status === 'routed' ? 'text-emerald-600' : data.order.status === 'failed' ? 'text-red-600' : 'text-amber-600'}`}>
                  {data.order.status}
                </span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full" />
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-xl">{error}</div>
          )}

          {data && data.items?.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No routing attempts found. Route this order first.
            </div>
          )}

          {/* Outcome Summary Banner */}
          {data?.order && data.items?.length > 0 && (() => {
            const status = data.order.status
            const selected = data.items.flatMap(i => i.attempts?.filter(a => a.status === 'selected' || a.status === 'partial') || [])
            const totalEvals = data.items.reduce((s, i) => s + (i.totalAttempts || 0), 0)
            const bannerStyles = {
              routed: 'bg-emerald-50 border-emerald-300 text-emerald-800',
              split: 'bg-amber-50 border-amber-300 text-amber-800',
              failed: 'bg-red-50 border-red-300 text-red-800',
              heavy: 'bg-purple-50 border-purple-300 text-purple-800',
            }
            const bannerIcons = { routed: '✓', split: '⚡', failed: '✗', heavy: '⚖' }
            return (
              <div className={`border-2 rounded-xl p-4 mb-5 ${bannerStyles[status] || bannerStyles.failed}`}>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{bannerIcons[status] || '?'}</span>
                  <div>
                    <p className="font-bold text-sm">
                      {status === 'routed' && selected.length > 0 && `Fulfilled by ${selected[0].warehouse_name} — ${selected[0].allocated_qty} units, ${selected[0].distance_km?.toFixed(0)} km`}
                      {status === 'split' && `Split across ${selected.length} warehouses: ${selected.map(s => `${s.warehouse_name} (${s.allocated_qty})`).join(', ')}`}
                      {status === 'failed' && `FAILED — ${totalEvals} warehouses evaluated, all rejected`}
                      {status === 'heavy' && `Flagged Heavy (>20 kg) — manual routing required`}
                      {!['routed','split','failed','heavy'].includes(status) && `Status: ${status}`}
                    </p>
                    <p className="text-xs opacity-75 mt-0.5">
                      {totalEvals} warehouse evaluations across {data.items.length} SKU(s)
                    </p>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Status Legend */}
          {data?.order && (
            <details className="mb-4 bg-gray-50 rounded-xl border border-gray-200">
              <summary className="px-3 py-2 text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 rounded-xl">
                How AI Routing Works
              </summary>
              <div className="px-3 pb-3 pt-1">
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                  <span className="bg-gray-200 px-2 py-0.5 rounded font-medium">Pending</span>
                  <span>→</span>
                  <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-medium">AI Engine</span>
                  <span>→</span>
                  <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">Routed</span>
                  <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded">Split</span>
                  <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded">Failed</span>
                  <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded">Heavy</span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-[10px] text-gray-500">
                  <span><strong>Routed:</strong> Assigned to optimal warehouse</span>
                  <span><strong>Split:</strong> Qty split across multiple warehouses</span>
                  <span><strong>Failed:</strong> No warehouse has inventory</span>
                  <span><strong>Heavy:</strong> &gt;20kg, manual handling needed</span>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Score = Distance(35%) + Inventory(25%) + Load(15%) + RTO(10%) + Speed(10%) + Cost(5%)</p>
              </div>
            </details>
          )}

          {data?.items?.map((item, i) => (
            <div key={item.id} className="mb-6">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200">
                <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-lg">SKU</span>
                <span className="font-mono text-sm font-semibold text-gray-800">{item.marketplace_sku}</span>
                <span className="text-xs text-gray-500">× {item.quantity} units</span>
                <span className="text-xs text-gray-400 ml-auto">{item.totalAttempts} warehouses evaluated</span>
              </div>

              {/* Timeline of attempts */}
              <div className="ml-2">
                {item.attempts.map((attempt, j) => (
                  <AttemptStep key={attempt.id} attempt={attempt} isLast={j === item.attempts.length - 1} />
                ))}
              </div>

              {/* Summary */}
              {item.selectedWarehouse && (
                <div className="ml-12 mt-1 bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-sm">
                  <span className="text-emerald-700 font-medium">
                    → Fulfilled by {item.selectedWarehouse.warehouse_name}: {item.selectedWarehouse.allocated_qty} units
                    {item.selectedWarehouse.status === 'partial' && ' (partial)'}
                  </span>
                </div>
              )}

              {!item.selectedWarehouse && item.attempts.length > 0 && (
                <div className="ml-12 mt-1 bg-red-50 border border-red-200 rounded-lg p-2 text-sm">
                  <span className="text-red-700 font-medium">→ No warehouse could fulfill this SKU</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
