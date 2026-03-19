import { useState, useEffect } from 'react'
import { getUnfulfillableAlerts } from '../../api/client'

export default function UnfulfillableAlerts() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    getUnfulfillableAlerts()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return null
  if (!data || data.totalUnfulfillable === 0) return null

  return (
    <div className="card border-red-200 bg-gradient-to-r from-red-50 to-orange-50">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-red-800">Unfulfillable Orders</h3>
            <p className="text-sm text-red-600">Orders that cannot be fulfilled — action required</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-3xl font-bold text-red-700">{data.totalUnfulfillable}</span>
          <p className="text-xs text-red-500">orders affected</p>
        </div>
      </div>

      {/* Reason breakdown */}
      <div className="space-y-2 mb-4">
        {data.byReason.map((reason, i) => (
          <div key={i} className="bg-white/70 rounded-xl p-3 border border-red-100">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${
                  reason.failure_reason?.includes('SKU') ? 'bg-orange-500' :
                  reason.failure_reason?.includes('SHELF') ? 'bg-yellow-500' :
                  reason.failure_reason?.includes('PINCODE') ? 'bg-purple-500' : 'bg-red-500'
                }`} />
                <span className="text-sm font-semibold text-gray-800">{reason.failure_reason}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-red-700">{reason.order_count} orders</span>
                <span className="text-xs text-gray-500">{reason.sku_count} SKUs</span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded === i ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            {expanded === i && (
              <div className="mt-2 pt-2 border-t border-red-100">
                <p className="text-xs text-gray-600 mb-1">Affected SKUs:</p>
                <div className="flex flex-wrap gap-1">
                  {reason.affected_skus?.split(',').slice(0, 10).map((sku, j) => (
                    <span key={j} className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-mono">
                      {sku.trim()}
                    </span>
                  ))}
                  {(reason.affected_skus?.split(',').length || 0) > 10 && (
                    <span className="text-xs text-gray-500">+{reason.affected_skus.split(',').length - 10} more</span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Recent unfulfillable orders */}
      {data.recentOrders.length > 0 && (
        <div className="bg-white/50 rounded-xl p-3 border border-red-100">
          <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Recent Unfulfillable Orders</p>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {data.recentOrders.slice(0, 8).map((order, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-gray-100 last:border-0">
                <span className="font-mono text-indigo-700">{order.reference_code || order.easyecom_order_id}</span>
                <span className="text-gray-500">{order.skus?.split(',').slice(0, 2).join(', ')}</span>
                <span className="text-red-600 font-medium">{order.reasons}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
