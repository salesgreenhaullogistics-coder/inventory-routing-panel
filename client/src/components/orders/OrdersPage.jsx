import { useState, useEffect } from 'react'
import DataTable from '../common/DataTable'
import Pagination from '../common/Pagination'
import FilterBar from '../common/FilterBar'
import ExportButton from '../common/ExportButton'
import { getOrders, getOrder, routeOrder, routeAllOrders, createOrderInEasyEcom } from '../../api/client'

const statusColors = {
  pending: 'bg-gray-100 text-gray-600',
  routed: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  failed: 'bg-red-50 text-red-700 border border-red-200',
  split: 'bg-amber-50 text-amber-700 border border-amber-200',
  heavy: 'bg-violet-50 text-violet-700 border border-violet-200',
  created: 'bg-blue-50 text-blue-700 border border-blue-200',
}

const filters = [
  { key: 'dateFrom', label: 'From', type: 'date' },
  { key: 'dateTo', label: 'To', type: 'date' },
  { key: 'sku', label: 'SKU', type: 'text', placeholder: 'Search SKU...' },
  {
    key: 'status', label: 'Status', type: 'select',
    options: [
      { value: 'pending', label: 'Pending' },
      { value: 'routed', label: 'Routed' },
      { value: 'failed', label: 'Failed' },
      { value: 'split', label: 'Split' },
      { value: 'heavy', label: 'Heavy' },
      { value: 'created', label: 'Created' },
    ],
  },
]

const columns = [
  { key: 'reference_code', label: 'Ref Code', render: (v) => <span className="font-mono text-xs font-medium text-indigo-600">{v || '-'}</span> },
  { key: 'order_date', label: 'Date', render: (v) => v ? new Date(v).toLocaleDateString() : '-' },
  { key: 'shipping_pincode', label: 'Pincode' },
  { key: 'marketplace', label: 'Marketplace' },
  { key: 'customer_name', label: 'Customer' },
  { key: 'skus', label: 'SKUs', render: (v) => v ? v.split(',').slice(0, 2).join(', ') + (v.split(',').length > 2 ? '...' : '') : '-' },
  {
    key: 'status', label: 'Status',
    render: (v) => (
      <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${statusColors[v] || 'bg-gray-100'}`}>
        {v?.charAt(0).toUpperCase() + v?.slice(1)}
      </span>
    ),
  },
]

export default function OrdersPage() {
  const [data, setData] = useState({ orders: [], pagination: {} })
  const [filterValues, setFilterValues] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [routing, setRouting] = useState(false)
  const [creating, setCreating] = useState(false)

  const fetchOrders = async (params = {}) => {
    setLoading(true)
    try {
      const result = await getOrders({ ...filterValues, ...params })
      setData(result)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchOrders() }, [])

  const handleFilterChange = (f) => {
    setFilterValues(f)
    fetchOrders({ ...f, page: 1 })
  }

  const handleRowClick = async (row) => {
    try {
      const detail = await getOrder(row.id)
      setSelectedOrder(detail)
    } catch (err) { console.error(err) }
  }

  const handleRouteAll = async () => {
    setRouting(true)
    try {
      const result = await routeAllOrders()
      alert(`Routing complete: ${result.routed} routed, ${result.failed} failed, ${result.split} split`)
      fetchOrders()
    } catch (err) { alert('Routing failed: ' + err.message) }
    finally { setRouting(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Orders</h2>
          <p className="text-xs text-gray-400 mt-0.5">Manage and route your orders</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleRouteAll} disabled={routing} className="btn-success text-xs">
            {routing ? 'Routing...' : 'Route All Pending'}
          </button>
          <ExportButton type="orders" label="Export" />
        </div>
      </div>

      <FilterBar filters={filters} values={filterValues} onChange={handleFilterChange} />

      <div className="card p-0 overflow-hidden">
        <DataTable columns={columns} data={data.orders} loading={loading} onRowClick={handleRowClick} />
        <div className="border-t border-gray-50 bg-gray-50/50">
          <Pagination
            page={data.pagination?.page}
            pages={data.pagination?.pages}
            total={data.pagination?.total}
            onPageChange={(p) => fetchOrders({ page: p })}
          />
        </div>
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedOrder(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900">Order Details</h3>
                <p className="text-xs text-gray-400 font-mono">{selectedOrder.order.reference_code || selectedOrder.order.easyecom_order_id}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColors[selectedOrder.order.status]}`}>
                  {selectedOrder.order.status?.charAt(0).toUpperCase() + selectedOrder.order.status?.slice(1)}
                </span>
                <button onClick={() => setSelectedOrder(null)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Order Info Grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Date', selectedOrder.order.order_date],
                  ['Pincode', selectedOrder.order.shipping_pincode],
                  ['Marketplace', selectedOrder.order.marketplace],
                  ['Customer', selectedOrder.order.customer_name],
                ].map(([label, val]) => (
                  <div key={label} className="bg-gray-50 rounded-xl px-3 py-2">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase">{label}</p>
                    <p className="text-sm font-medium text-gray-700 mt-0.5">{val || '-'}</p>
                  </div>
                ))}
              </div>

              {/* Items */}
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Line Items</h4>
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50"><th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase">SKU</th><th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase">Qty</th><th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase">Weight</th></tr></thead>
                    <tbody>
                      {selectedOrder.items.map(item => (
                        <tr key={item.id} className="border-t border-gray-50">
                          <td className="px-3 py-2 font-mono text-xs">{item.marketplace_sku}</td>
                          <td className="px-3 py-2">{item.quantity}</td>
                          <td className="px-3 py-2 text-gray-500">{item.weight_per_unit_kg} kg</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Routing Results */}
              {selectedOrder.routing.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Routing — Multi-Factor Scoring</h4>
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50">
                            {['Warehouse','Qty','Score','Dist','Inv','Load','Spd','Cost','Status'].map(h => (
                              <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedOrder.routing.map(r => (
                            <tr key={r.id} className="border-t border-gray-50">
                              <td className="px-3 py-2 text-xs font-medium">{r.warehouse_name || '-'}</td>
                              <td className="px-3 py-2">{r.assigned_quantity}</td>
                              <td className="px-3 py-2 font-bold text-indigo-600">{r.routing_score ? r.routing_score.toFixed(3) : '-'}</td>
                              <td className="px-3 py-2 text-xs text-gray-500">{r.distance_score ? r.distance_score.toFixed(2) : '-'}</td>
                              <td className="px-3 py-2 text-xs text-gray-500">{r.inventory_score ? r.inventory_score.toFixed(2) : '-'}</td>
                              <td className="px-3 py-2 text-xs text-gray-500">{r.load_score ? r.load_score.toFixed(2) : '-'}</td>
                              <td className="px-3 py-2 text-xs text-gray-500">{r.speed_score ? r.speed_score.toFixed(2) : '-'}</td>
                              <td className="px-3 py-2 text-xs text-gray-500">{r.cost_score ? r.cost_score.toFixed(2) : '-'}</td>
                              <td className="px-3 py-2">
                                {r.failure_reason ? (
                                  <span className="text-red-600 text-xs font-medium bg-red-50 px-2 py-0.5 rounded-full">{r.failure_reason}</span>
                                ) : r.is_split ? (
                                  <span className="text-amber-600 text-xs font-medium bg-amber-50 px-2 py-0.5 rounded-full">Split</span>
                                ) : (
                                  <span className="text-emerald-600 text-xs font-medium bg-emerald-50 px-2 py-0.5 rounded-full">Assigned</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="bg-gray-50 px-3 py-1.5">
                      <p className="text-[10px] text-gray-400">Score = Distance(40%) + Inventory(30%) + Load(15%) + Speed(10%) + Cost(5%)</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                {(selectedOrder.order.status === 'routed' || selectedOrder.order.status === 'split') && (
                  <button
                    onClick={async () => {
                      setCreating(true)
                      try {
                        await createOrderInEasyEcom(selectedOrder.order.id)
                        alert('Order created in EasyEcom!')
                        const detail = await getOrder(selectedOrder.order.id)
                        setSelectedOrder(detail)
                        fetchOrders()
                      } catch (err) { alert('Failed: ' + err.message) }
                      finally { setCreating(false) }
                    }}
                    disabled={creating}
                    className="btn-success text-xs"
                  >
                    {creating ? 'Creating...' : 'Create in EasyEcom'}
                  </button>
                )}
                <button
                  onClick={async () => {
                    await routeOrder(selectedOrder.order.id)
                    const detail = await getOrder(selectedOrder.order.id)
                    setSelectedOrder(detail)
                    fetchOrders()
                  }}
                  className="btn-primary text-xs"
                >
                  Re-Route
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
