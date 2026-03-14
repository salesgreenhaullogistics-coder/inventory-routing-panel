import { useState, useEffect } from 'react'
import { Doughnut } from 'react-chartjs-2'
import { getInventoryHealth, getBadInventory } from '../../api/client'

export default function InventoryHealthPanel() {
  const [data, setData] = useState(null)
  const [badData, setBadData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedWh, setExpandedWh] = useState(null)

  useEffect(() => {
    Promise.all([
      getInventoryHealth(),
      getBadInventory(),
    ]).then(([health, bad]) => {
      setData(health)
      setBadData(bad)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="animate-pulse h-64 bg-gray-100 rounded" />
  if (!data) return <div className="text-gray-400 text-sm">No data</div>

  const { summary, warehouseHealth, alerts } = data

  const goodUnits = summary?.healthy_units || 0
  const goodSkus = summary?.healthy_skus || 0

  const healthChart = {
    labels: ['Good Inventory (Available + ≥60% Shelf Life)'],
    datasets: [{
      data: [goodUnits],
      backgroundColor: ['#22c55e'],
      borderWidth: 0,
    }],
  }

  // Group bad inventory slabs by warehouse
  const badByWarehouse = {}
  if (badData?.slabSummary) {
    for (const row of badData.slabSummary) {
      if (!badByWarehouse[row.warehouse_id]) {
        badByWarehouse[row.warehouse_id] = { name: row.warehouse_name, slabs: {} }
      }
      badByWarehouse[row.warehouse_id].slabs[row.slab] = { sku_count: row.sku_count, total_units: row.total_units }
    }
  }

  const slabColors = {
    '0-20%': { bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-500' },
    '20-40%': { bg: 'bg-orange-100', text: 'text-orange-800', dot: 'bg-orange-500' },
    '40-60%': { bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-500' },
  }

  const slabOrder = ['0-20%', '20-40%', '40-60%']

  return (
    <div className="space-y-4">
      {/* Good Inventory Summary */}
      <div className="flex items-center gap-6">
        <div className="w-40 h-40">
          <Doughnut data={healthChart} options={{ plugins: { legend: { display: false } }, cutout: '65%' }} />
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
            <span>Good Inventory: <strong>{goodUnits.toLocaleString()}</strong> units ({goodSkus} SKUs)</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Only units with Status = Available & Shelf Life ≥ 60%
          </div>
        </div>
      </div>

      {/* Warehouse Health Grid - Only good inventory */}
      {warehouseHealth && warehouseHealth.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-gray-500 uppercase mb-2">Warehouse Health</h5>
          <div className="grid grid-cols-2 gap-2">
            {warehouseHealth.map(wh => (
              <div key={wh.warehouse_id} className="p-2 bg-gray-50 rounded-lg text-xs">
                <div className="font-medium truncate">{wh.warehouse_name}</div>
                <div className="flex items-center gap-1 mt-1">
                  <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${
                        (wh.load_pct || 0) >= 90 ? 'bg-red-500' :
                        (wh.load_pct || 0) >= 70 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(wh.load_pct || 0, 100)}%` }}
                    />
                  </div>
                  <span className="text-gray-500">{wh.load_pct || 0}%</span>
                </div>
                <div className="flex justify-between mt-1 text-gray-500">
                  <span>{(wh.total_units || 0).toLocaleString()} units</span>
                  <span>{wh.total_skus || 0} SKUs</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Low Inventory Alerts */}
      {alerts && alerts.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-gray-500 uppercase mb-2">Low Inventory Alerts ({alerts.length})</h5>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {alerts.slice(0, 10).map((a, i) => (
              <div key={i} className={`text-xs px-2 py-1 rounded ${
                a.stock_alert === 'Out of Stock' ? 'bg-red-50 text-red-700' :
                a.stock_alert === 'Critical Low' ? 'bg-orange-50 text-orange-700' :
                'bg-yellow-50 text-yellow-700'
              }`}>
                <span className="font-medium">{a.sku}</span> @ {a.warehouse_name}: {a.quantity} units ({a.stock_alert})
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bad Inventory Table — Always visible */}
      <div className="border-t pt-4 mt-4">
        <h5 className="text-xs font-semibold text-red-600 uppercase mb-3 flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          Bad Inventory — Shelf Life Below 60%
        </h5>

        {/* Overall slab summary */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {slabOrder.map(slab => {
            const c = slabColors[slab]
            const units = badData?.totals ? (slab === '0-20%' ? badData.totals.units_0_20 :
                          slab === '20-40%' ? badData.totals.units_20_40 : badData.totals.units_40_60) : 0
            const skus = badData?.totals ? (slab === '0-20%' ? badData.totals.skus_0_20 :
                         slab === '20-40%' ? badData.totals.skus_20_40 : badData.totals.skus_40_60) : 0
            return (
              <div key={slab} className={`${c.bg} ${c.text} rounded-lg p-2 text-center`}>
                <div className="text-[10px] font-semibold uppercase">{slab}</div>
                <div className="text-lg font-bold">{(units || 0).toLocaleString()}</div>
                <div className="text-[10px]">{skus || 0} SKUs</div>
              </div>
            )
          })}
        </div>

        {/* Warehouse-level breakdown or empty state */}
        {Object.keys(badByWarehouse).length > 0 ? (
          <div className="space-y-2">
            {Object.entries(badByWarehouse).map(([whId, wh]) => {
              const isExpanded = expandedWh === whId
              const whTotalUnits = slabOrder.reduce((sum, s) => sum + (wh.slabs[s]?.total_units || 0), 0)
              const whTotalSkus = slabOrder.reduce((sum, s) => sum + (wh.slabs[s]?.sku_count || 0), 0)

              return (
                <div key={whId} className="bg-gray-50 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedWh(isExpanded ? null : whId)}
                    className="w-full flex items-center justify-between p-2 text-xs hover:bg-gray-100 transition"
                  >
                    <div className="font-medium">{wh.name}</div>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500">{whTotalUnits.toLocaleString()} units · {whTotalSkus} SKUs</span>
                      <svg className={`w-3 h-3 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-2 pb-2">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-500">
                            <th className="text-left py-1 font-medium">Slab</th>
                            <th className="text-right py-1 font-medium">Units</th>
                            <th className="text-right py-1 font-medium">SKUs</th>
                          </tr>
                        </thead>
                        <tbody>
                          {slabOrder.map(slab => {
                            const c = slabColors[slab]
                            const slabData = wh.slabs[slab]
                            if (!slabData) return null
                            return (
                              <tr key={slab}>
                                <td className="py-1">
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${c.bg} ${c.text}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                                    {slab}
                                  </span>
                                </td>
                                <td className="text-right py-1 font-medium">{(slabData.total_units || 0).toLocaleString()}</td>
                                <td className="text-right py-1">{slabData.sku_count || 0}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>

                      {/* Show SKU details for this warehouse */}
                      {badData?.details && (() => {
                        const whDetails = badData.details.filter(d => String(d.warehouse_id) === String(whId))
                        if (whDetails.length === 0) return null
                        return (
                          <div className="mt-2 max-h-40 overflow-y-auto">
                            <table className="w-full text-[11px]">
                              <thead>
                                <tr className="text-gray-400 border-t">
                                  <th className="text-left py-1 font-medium">SKU</th>
                                  <th className="text-right py-1 font-medium">Qty</th>
                                  <th className="text-right py-1 font-medium">Shelf Life</th>
                                  <th className="text-right py-1 font-medium">Slab</th>
                                </tr>
                              </thead>
                              <tbody>
                                {whDetails.map((d, i) => {
                                  const sc = slabColors[d.slab]
                                  return (
                                    <tr key={i} className="border-t border-gray-100">
                                      <td className="py-1 font-mono truncate max-w-[160px]" title={d.sku}>{d.sku}</td>
                                      <td className="text-right py-1">{d.quantity}</td>
                                      <td className="text-right py-1">{d.shelf_life_pct}%</td>
                                      <td className="text-right py-1">
                                        <span className={`px-1 py-0.5 rounded ${sc?.bg} ${sc?.text}`}>{d.slab}</span>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-2 text-green-700 text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">No bad inventory found</span>
            </div>
            <p className="text-xs text-green-600 mt-1">All available inventory has shelf life above 60%</p>
          </div>
        )}

        {/* Total */}
        <div className="mt-2 text-xs text-gray-500 text-right">
          Total bad inventory: <strong className="text-red-600">{(badData?.totals?.total_bad_units || 0).toLocaleString()}</strong> units across <strong>{badData?.totals?.total_bad_skus || 0}</strong> SKUs
        </div>
      </div>
    </div>
  )
}
