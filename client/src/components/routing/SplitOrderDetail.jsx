import { useState, useEffect } from 'react'
import { getSplitOrderDetail, overrideRouting, getOptimalSplit } from '../../api/client'

const WH_COLORS = {
  1: { bg: 'bg-indigo-500', light: 'bg-indigo-100', text: 'text-indigo-700', label: 'Bangalore' },
  2: { bg: 'bg-emerald-500', light: 'bg-emerald-100', text: 'text-emerald-700', label: 'GGN' },
  3: { bg: 'bg-amber-500', light: 'bg-amber-100', text: 'text-amber-700', label: 'Kolkata' },
  4: { bg: 'bg-violet-500', light: 'bg-violet-100', text: 'text-violet-700', label: 'Bhiwandi' },
}

function AllocationBar({ allocations, totalQty }) {
  return (
    <div className="flex rounded-full overflow-hidden h-4 bg-gray-200">
      {allocations.map((a, i) => {
        const pct = totalQty > 0 ? (a.assigned_quantity / totalQty * 100) : 0
        const color = WH_COLORS[a.assigned_warehouse_id]?.bg || 'bg-gray-400'
        return (
          <div key={i} className={`${color} relative group`} style={{ width: `${Math.max(pct, 5)}%` }}>
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity z-10">
              {a.warehouse_name}: {a.assigned_quantity} ({pct.toFixed(0)}%)
            </div>
          </div>
        )
      })}
    </div>
  )
}

function OverrideForm({ allocation, warehouseInventory, onSubmit, onCancel }) {
  const [whId, setWhId] = useState(allocation.assigned_warehouse_id || '')
  const [qty, setQty] = useState(allocation.assigned_quantity || 0)

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2 space-y-2">
      <p className="text-xs font-semibold text-blue-700">Override Allocation</p>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-xs text-gray-600">Warehouse</label>
          <select value={whId} onChange={e => setWhId(parseInt(e.target.value))}
            className="w-full text-sm border rounded-lg px-2 py-1.5 bg-white">
            {warehouseInventory.map(wh => (
              <option key={wh.warehouseId} value={wh.warehouseId}>
                {wh.warehouseName} (avail: {wh.availableQty})
              </option>
            ))}
          </select>
        </div>
        <div className="w-24">
          <label className="text-xs text-gray-600">Qty</label>
          <input type="number" value={qty} onChange={e => setQty(parseInt(e.target.value) || 0)}
            className="w-full text-sm border rounded-lg px-2 py-1.5" min={1} />
        </div>
        <button onClick={() => onSubmit(whId, qty)}
          className="btn-primary text-xs px-3 py-1.5">Apply</button>
        <button onClick={onCancel}
          className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
      </div>
    </div>
  )
}

export default function SplitOrderDetail({ orderId, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [alternatives, setAlternatives] = useState(null)
  const [loadingAlt, setLoadingAlt] = useState(false)
  const [overrideItem, setOverrideItem] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!orderId) return
    setLoading(true)
    getSplitOrderDetail(orderId)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [orderId])

  const loadAlternatives = () => {
    setLoadingAlt(true)
    getOptimalSplit(orderId)
      .then(setAlternatives)
      .catch(console.error)
      .finally(() => setLoadingAlt(false))
  }

  const handleOverride = async (resultId, newWhId, newQty, whInventory) => {
    try {
      await overrideRouting({ routingResultId: resultId, newWarehouseId: newWhId, newQuantity: newQty })
      setOverrideItem(null)
      // Refresh data
      const updated = await getSplitOrderDetail(orderId)
      setData(updated)
    } catch (e) {
      alert(`Override failed: ${e.message}`)
    }
  }

  if (!orderId) return null

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Split Order Detail</h2>
            {data?.order && (
              <p className="text-sm text-gray-500">
                Order: <span className="font-mono text-indigo-700">{data.order.reference_code || data.order.easyecom_order_id}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadAlternatives} disabled={loadingAlt}
              className="btn-secondary text-xs px-3 py-1.5">
              {loadingAlt ? 'Loading...' : 'Suggest Alternatives'}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl">
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)] space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full" />
            </div>
          )}

          {error && <div className="bg-red-50 text-red-700 p-4 rounded-xl">{error}</div>}

          {/* SKU-wise breakdown */}
          {data?.items?.map((item, i) => (
            <div key={i} className="card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-lg">SKU</span>
                  <span className="font-mono text-sm font-semibold">{item.marketplace_sku}</span>
                  <span className="text-xs text-gray-500">× {item.quantity} units</span>
                </div>
              </div>

              {/* Allocation bar */}
              {item.allocations.length > 0 && (
                <div className="mb-3">
                  <AllocationBar allocations={item.allocations} totalQty={item.quantity} />
                  <div className="flex gap-3 mt-2">
                    {item.allocations.map((a, j) => {
                      const c = WH_COLORS[a.assigned_warehouse_id] || { light: 'bg-gray-100', text: 'text-gray-700' }
                      return (
                        <div key={j} className="flex items-center gap-1">
                          <div className={`w-3 h-3 rounded-full ${c.bg || 'bg-gray-400'}`} />
                          <span className={`text-xs ${c.text}`}>{a.warehouse_name}: {a.assigned_quantity}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Allocation table */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase border-b">
                    <th className="text-left py-2">Warehouse</th>
                    <th className="text-right py-2">Allocated</th>
                    <th className="text-right py-2">Distance</th>
                    <th className="text-right py-2">Score</th>
                    <th className="text-right py-2">Available</th>
                    <th className="text-center py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {item.allocations.map((a, j) => {
                    const whInv = item.warehouseInventory?.find(w => w.warehouseId === a.assigned_warehouse_id)
                    return (
                      <tr key={j} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 font-medium">{a.warehouse_name}</td>
                        <td className="py-2 text-right font-bold">{a.assigned_quantity}</td>
                        <td className="py-2 text-right text-gray-500">{a.distance_km?.toFixed(1)} km</td>
                        <td className="py-2 text-right font-mono text-indigo-700">{(a.routing_score * 100).toFixed(1)}</td>
                        <td className="py-2 text-right text-gray-500">{whInv?.availableQty || '-'}</td>
                        <td className="py-2 text-center">
                          <button onClick={() => setOverrideItem({ resultId: a.id, itemIndex: i, allocIndex: j })}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium">Override</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Override form */}
              {overrideItem?.itemIndex === i && item.allocations[overrideItem.allocIndex] && (
                <OverrideForm
                  allocation={item.allocations[overrideItem.allocIndex]}
                  warehouseInventory={item.warehouseInventory || []}
                  onSubmit={(whId, qty) => handleOverride(
                    item.allocations[overrideItem.allocIndex].id, whId, qty, item.warehouseInventory
                  )}
                  onCancel={() => setOverrideItem(null)}
                />
              )}

              {/* Failures - prominent red banner */}
              {item.failures?.length > 0 && (
                <div className="mt-3 bg-red-50 border-2 border-red-200 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <span className="text-sm font-bold text-red-700">Unfulfilled Quantity</span>
                  </div>
                  {item.failures.map((f, j) => (
                    <p key={j} className="text-xs text-red-600 ml-6">{f.failure_reason}: <strong>{f.assigned_quantity} units</strong> could not be allocated</p>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Alternative strategies */}
          {alternatives?.alternatives?.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Suggested Alternative Strategies</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {alternatives.alternatives.map((alt, i) => (
                  <div key={i} className="card border-2 border-dashed border-indigo-200 hover:border-indigo-400 transition-colors">
                    <h4 className="text-sm font-bold text-indigo-700 mb-1">{alt.strategy}</h4>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-500 mb-2">
                      <span>Splits: <strong className="text-gray-700">{alt.totalSplits}</strong></span>
                      {alt.totalDistance > 0 && <span>Distance: <strong className="text-gray-700">{alt.totalDistance} km</strong></span>}
                      {alt.estimatedCost > 0 && <span>Cost: <strong className="text-gray-700">Rs.{alt.estimatedCost}</strong></span>}
                      {alt.estimatedDays > 0 && <span>Delivery: <strong className="text-gray-700">{alt.estimatedDays} days</strong></span>}
                      {alt.fulfillmentRate && <span>Fulfillment: <strong className={parseFloat(alt.fulfillmentRate) >= 100 ? 'text-emerald-700' : 'text-red-700'}>{alt.fulfillmentRate}%</strong></span>}
                    </div>
                    {alt.items.map((item, j) => (
                      <div key={j} className="mb-1">
                        <p className="text-xs font-mono text-gray-600">{item.sku}:</p>
                        <div className="ml-2 space-y-0.5">
                          {item.allocations.map((a, k) => (
                            <p key={k} className="text-xs text-gray-700">
                              {a.warehouseName}: <strong>{a.allocatedQty}</strong>
                              <span className="text-gray-400 ml-1">(score: {(a.score * 100).toFixed(0)})</span>
                            </p>
                          ))}
                          {item.unfulfilled > 0 && (
                            <p className="text-xs text-red-500">{item.unfulfilled} unfulfilled</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
