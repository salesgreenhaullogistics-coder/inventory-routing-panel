import { useState, useEffect } from 'react'
import { getMisrouteRate, getMisrouteDrilldown } from '../../api/client'
import Pagination from '../common/Pagination'

function ClickableNum({ value, label, color = 'text-gray-800', onClick }) {
  return (
    <span
      className={`font-bold ${color} ${onClick ? 'cursor-pointer underline decoration-dotted underline-offset-2 hover:opacity-70 transition-opacity' : ''}`}
      onClick={onClick}
      title={onClick ? `Click to view ${label} orders` : undefined}
    >
      {value}
    </span>
  )
}

function DrilldownModal({ title, type, warehouseId, onClose }) {
  const [data, setData] = useState({ orders: [], pagination: {} })
  const [loading, setLoading] = useState(true)

  const fetchPage = (page = 1) => {
    setLoading(true)
    getMisrouteDrilldown({ type, warehouseId, page, limit: 30 })
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchPage() }, [type, warehouseId])

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h3 className="text-sm font-bold text-gray-900">{title}</h3>
            <p className="text-xs text-gray-400">{data.pagination?.total || 0} orders found</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[calc(85vh-80px)]">
          {loading ? (
            <div className="animate-pulse space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-gray-50 rounded" />)}</div>
          ) : data.orders?.length === 0 ? (
            <p className="text-center text-gray-400 py-8">No orders found</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase text-[10px]">Ref Code</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase text-[10px]">Date</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase text-[10px]">Pincode</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase text-[10px]">SKUs</th>
                      {data.orders[0]?.warehouse_name && <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase text-[10px]">Warehouse</th>}
                      {data.orders[0]?.distance_km !== undefined && <th className="text-right px-3 py-2 font-semibold text-gray-500 uppercase text-[10px]">Distance</th>}
                      {data.orders[0]?.rejection_reason && <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase text-[10px]">Reason</th>}
                      {data.orders[0]?.failure_reasons && <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase text-[10px]">Failure</th>}
                      {data.orders[0]?.attempt_status && <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase text-[10px]">Status</th>}
                      {data.orders[0]?.fallback_rank && <th className="text-center px-3 py-2 font-semibold text-gray-500 uppercase text-[10px]">Rank</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map((o, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-indigo-50/30">
                        <td className="px-3 py-2 font-mono font-medium text-indigo-600">{o.reference_code || o.easyecom_order_id}</td>
                        <td className="px-3 py-2 text-gray-500">{o.order_date ? new Date(o.order_date).toLocaleDateString() : '-'}</td>
                        <td className="px-3 py-2 font-mono text-gray-500">{o.shipping_pincode}</td>
                        <td className="px-3 py-2 text-gray-600 max-w-[160px] truncate" title={o.skus}>{o.skus?.split(',').slice(0, 2).join(', ') || '-'}</td>
                        {o.warehouse_name !== undefined && <td className="px-3 py-2 text-gray-700">{o.warehouse_name}</td>}
                        {o.distance_km !== undefined && <td className="px-3 py-2 text-right text-gray-500">{o.distance_km?.toFixed(0)} km</td>}
                        {o.rejection_reason !== undefined && <td className="px-3 py-2"><span className="text-red-600 bg-red-50 px-1.5 py-0.5 rounded text-[10px]">{o.rejection_reason}</span></td>}
                        {o.failure_reasons !== undefined && <td className="px-3 py-2"><span className="text-red-600 text-[10px]">{o.failure_reasons}</span></td>}
                        {o.attempt_status !== undefined && <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${o.attempt_status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>{o.attempt_status}</span></td>}
                        {o.fallback_rank !== undefined && <td className="px-3 py-2 text-center"><span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px] font-bold">#{o.fallback_rank}</span></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.pagination?.pages > 1 && (
                <div className="mt-3">
                  <Pagination page={data.pagination.page} pages={data.pagination.pages} total={data.pagination.total} onPageChange={fetchPage} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function MisrouteRatePanel() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [drilldown, setDrilldown] = useState(null)

  useEffect(() => {
    getMisrouteRate()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="card animate-pulse h-64 bg-gray-50" />
  if (!data?.summary) return null

  const s = data.summary
  const hasAttemptData = s.idealRouted > 0 || s.fallbackRouted > 0 || s.failedNoInventory > 0

  // If no attempt data, show a simplified view from routing_results
  if (!hasAttemptData && s.routedWithoutAttempts > 0) {
    return (
      <div className="card">
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-2">Mis-Route Analysis</h3>
        <p className="text-xs text-gray-500">Route orders with "Route All" to generate detailed attempt-level analysis.</p>
        <p className="text-xs text-gray-400 mt-1">{s.routedWithoutAttempts} orders routed without detailed attempt tracking.</p>
      </div>
    )
  }

  if (!hasAttemptData) return null

  const openDrilldown = (title, type, warehouseId) => {
    setDrilldown({ title, type, warehouseId })
  }

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Mis-Route Analysis</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">Comparing ideal (nearest) warehouse vs actual fulfillment location</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-800">{s.misrouteRate}%</p>
          <p className="text-[10px] text-gray-500">Mis-route Rate</p>
        </div>
      </div>

      {/* 4-Column Summary Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
          <p className="text-[10px] font-semibold text-blue-600 uppercase mb-1">Total Evaluated</p>
          <p className="text-xl font-bold text-blue-800">{s.totalProcessed}</p>
          <p className="text-[10px] text-blue-500">unique orders</p>
        </div>
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-3 text-center cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all active:scale-[0.98]"
          onClick={() => openDrilldown('Ideally Routed Orders (Nearest Warehouse)', 'ideal')}>
          <p className="text-[10px] font-semibold text-emerald-600 uppercase mb-1">Ideal Routing</p>
          <p className="text-xl font-bold text-emerald-800 underline decoration-dotted underline-offset-2">{s.idealRouted}</p>
          <p className="text-[10px] text-emerald-500">{s.idealPct}% of total</p>
          <p className="text-[9px] text-emerald-400 mt-1">Click to view orders →</p>
        </div>
        <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-3 text-center cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all active:scale-[0.98]"
          onClick={() => openDrilldown('Fallback Routed Orders (Non-Ideal Warehouse)', 'fallback')}>
          <p className="text-[10px] font-semibold text-amber-600 uppercase mb-1">Fallback Routing</p>
          <p className="text-xl font-bold text-amber-800 underline decoration-dotted underline-offset-2">{s.fallbackRouted}</p>
          <p className="text-[10px] text-amber-500">{s.fallbackPct}% — nearest unavailable</p>
          <p className="text-[9px] text-amber-400 mt-1">Click to view orders →</p>
        </div>
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 text-center cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all active:scale-[0.98]"
          onClick={() => openDrilldown('Failed Orders (No Inventory Anywhere)', 'failed')}>
          <p className="text-[10px] font-semibold text-red-600 uppercase mb-1">Failed (No Stock)</p>
          <p className="text-xl font-bold text-red-800 underline decoration-dotted underline-offset-2">{s.failedNoInventory}</p>
          <p className="text-[10px] text-red-500">{s.failedPct}% — all warehouses empty</p>
          <p className="text-[9px] text-red-400 mt-1">Click to view orders →</p>
        </div>
      </div>

      {/* Flow Bar: Ideal → Fallback → Failed */}
      <div className="mb-5">
        <div className="flex rounded-xl overflow-hidden h-6">
          {s.idealRouted > 0 && (
            <div className="bg-emerald-500 flex items-center justify-center cursor-pointer hover:brightness-110 transition-all"
              style={{ width: `${Math.max(parseFloat(s.idealPct), 3)}%` }}
              onClick={() => openDrilldown('Ideally Routed Orders', 'ideal')}>
              <span className="text-white text-[10px] font-bold">{s.idealPct}%</span>
            </div>
          )}
          {s.fallbackRouted > 0 && (
            <div className="bg-amber-500 flex items-center justify-center cursor-pointer hover:brightness-110 transition-all"
              style={{ width: `${Math.max(parseFloat(s.fallbackPct), 3)}%` }}
              onClick={() => openDrilldown('Fallback Routed Orders', 'fallback')}>
              <span className="text-white text-[10px] font-bold">{s.fallbackPct}%</span>
            </div>
          )}
          {s.failedNoInventory > 0 && (
            <div className="bg-red-500 flex items-center justify-center cursor-pointer hover:brightness-110 transition-all"
              style={{ width: `${Math.max(parseFloat(s.failedPct), 3)}%` }}
              onClick={() => openDrilldown('Failed Orders', 'failed')}>
              <span className="text-white text-[10px] font-bold">{s.failedPct}%</span>
            </div>
          )}
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500" /> Ideal (nearest selected)</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-500" /> Fallback (nearest rejected)</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-500" /> Failed (no stock anywhere)</span>
        </div>
      </div>

      {/* Per-Warehouse Breakdown Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Warehouse</th>
              <th className="text-center py-2 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Should Have<br/>Received</th>
              <th className="text-center py-2 text-[10px] font-bold text-blue-600 uppercase tracking-wider">Actually<br/>Received</th>
              <th className="text-center py-2 text-[10px] font-bold text-red-600 uppercase tracking-wider">Missed<br/>(No Stock)</th>
              <th className="text-center py-2 text-[10px] font-bold text-amber-600 uppercase tracking-wider">Gained from<br/>Fallback</th>
              <th className="text-left py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Top Rejection</th>
            </tr>
          </thead>
          <tbody>
            {data.byWarehouse.map((wh, i) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/50">
                <td className="py-2.5">
                  <span className="font-semibold text-gray-800 text-xs">{wh.warehouse_name}</span>
                </td>
                <td className="py-2.5 text-center">
                  <ClickableNum value={wh.should_have_received} label="should-have-received"
                    color="text-emerald-700"
                    onClick={() => openDrilldown(`${wh.warehouse_name} — Should Have Received (Nearest)`, 'warehouse_should', wh.warehouse_id)} />
                </td>
                <td className="py-2.5 text-center">
                  <ClickableNum value={wh.actually_received} label="actually-received"
                    color="text-blue-700"
                    onClick={() => openDrilldown(`${wh.warehouse_name} — Actually Received`, 'warehouse_actual', wh.warehouse_id)} />
                </td>
                <td className="py-2.5 text-center">
                  <ClickableNum value={wh.missed_due_to_inventory} label="missed"
                    color={wh.missed_due_to_inventory > 0 ? 'text-red-700' : 'text-gray-400'}
                    onClick={wh.missed_due_to_inventory > 0 ? () => openDrilldown(`${wh.warehouse_name} — Missed Due to Inventory`, 'warehouse_missed', wh.warehouse_id) : undefined} />
                </td>
                <td className="py-2.5 text-center">
                  <span className={`font-bold ${wh.gained_from_fallback > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                    {wh.gained_from_fallback > 0 ? `+${wh.gained_from_fallback}` : '0'}
                  </span>
                </td>
                <td className="py-2.5">
                  {wh.top_rejection_reason ? (
                    <span className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-lg">{wh.top_rejection_reason}</span>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Rejection Breakdown */}
      {data.rejectionBreakdown?.length > 0 && (
        <div className="mt-4 bg-gray-50 rounded-xl p-3">
          <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-2">Why Ideal Routing Failed — Rejection Breakdown</p>
          <div className="space-y-1.5">
            {data.rejectionBreakdown.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-1.5 border border-gray-100">
                <span className="text-gray-700 font-medium">{r.reason}</span>
                <span className="flex items-center gap-4 text-gray-500">
                  <span><strong className="text-gray-800">{r.unique_orders}</strong> orders</span>
                  <span>{r.total_rejections} rejections</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drilldown Modal */}
      {drilldown && (
        <DrilldownModal
          title={drilldown.title}
          type={drilldown.type}
          warehouseId={drilldown.warehouseId}
          onClose={() => setDrilldown(null)}
        />
      )}
    </div>
  )
}
