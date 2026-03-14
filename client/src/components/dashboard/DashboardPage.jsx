import { useState, useEffect } from 'react'
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale,
  BarElement, PointElement, LineElement, Title
} from 'chart.js'
import StatCard from '../common/StatCard'
import FilterBar from '../common/FilterBar'
import Pagination from '../common/Pagination'
import RoutingDistributionChart from './RoutingDistributionChart'
import FailureReasonsChart from './FailureReasonsChart'
import WarehouseUtilizationChart from './WarehouseUtilizationChart'
import ShelfLifeAnalytics from './ShelfLifeAnalytics'
import OrderSplitStats from './OrderSplitStats'
import DailyTrendsChart from './DailyTrendsChart'
import InventoryHealthPanel from './InventoryHealthPanel'
import ScoringBreakdownChart from './ScoringBreakdownChart'
import {
  getDashboardStats, getRoutingDistribution, getFailureReasons,
  getWarehouseUtilization, getShelfLife, getSplitStats, getDailyTrends,
  getOrdersByStatus
} from '../../api/client'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title)

const dashboardFilters = [
  { key: 'dateFrom', label: 'From', type: 'date' },
  { key: 'dateTo', label: 'To', type: 'date' },
  { key: 'sku', label: 'SKU', type: 'text', placeholder: 'Search SKU...' },
  {
    key: 'warehouseId', label: 'Warehouse', type: 'select',
    options: [
      { value: '1', label: 'Emiza Bangalore NLM' },
      { value: '2', label: 'Prozo GGN 05' },
      { value: '3', label: 'Emiza Kolkata' },
      { value: '4', label: 'Prozo Bhiwandi D2C' },
    ],
  },
]

const statusColors = {
  pending: 'bg-gray-100 text-gray-600',
  routed: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  failed: 'bg-red-50 text-red-700 border border-red-200',
  split: 'bg-amber-50 text-amber-700 border border-amber-200',
  heavy: 'bg-violet-50 text-violet-700 border border-violet-200',
  created: 'bg-blue-50 text-blue-700 border border-blue-200',
}

const statusTitles = {
  total: 'All Orders',
  routed: 'Routed Orders',
  failed: 'Failed Orders',
  split: 'Split Orders',
  heavy: 'Heavy Orders',
  created: 'Created Orders',
  pending: 'Pending Orders',
}

export default function DashboardPage() {
  const [stats, setStats] = useState({})
  const [distribution, setDistribution] = useState(null)
  const [failures, setFailures] = useState(null)
  const [utilization, setUtilization] = useState(null)
  const [shelfLife, setShelfLife] = useState(null)
  const [splitStats, setSplitStats] = useState(null)
  const [trends, setTrends] = useState(null)
  const [filters, setFilters] = useState({})
  const [loading, setLoading] = useState(true)

  // Detail modal state
  const [detailModal, setDetailModal] = useState(null)
  const [detailData, setDetailData] = useState({ orders: [], pagination: {} })
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchAll = async (filterParams = {}) => {
    setLoading(true)
    try {
      const [s, d, f, u, sl, sp, t] = await Promise.all([
        getDashboardStats(),
        getRoutingDistribution(filterParams),
        getFailureReasons(filterParams),
        getWarehouseUtilization(),
        getShelfLife(),
        getSplitStats(),
        getDailyTrends(filterParams),
      ])
      setStats(s)
      setDistribution(d)
      setFailures(f)
      setUtilization(u)
      setShelfLife(sl)
      setSplitStats(sp)
      setTrends(t)
    } catch (err) {
      console.error('Dashboard fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters)
    const cleaned = Object.fromEntries(Object.entries(newFilters).filter(([, v]) => v))
    fetchAll(cleaned)
  }

  const openDetailModal = async (status) => {
    const title = statusTitles[status] || status
    setDetailModal({ status, title })
    setDetailLoading(true)
    try {
      const result = await getOrdersByStatus({ status, page: 1, limit: 50 })
      setDetailData(result)
    } catch (err) {
      console.error(err)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleDetailPageChange = async (page) => {
    if (!detailModal) return
    setDetailLoading(true)
    try {
      const result = await getOrdersByStatus({ status: detailModal.status, page, limit: 50 })
      setDetailData(result)
    } catch (err) {
      console.error(err)
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>
      </div>

      <FilterBar filters={dashboardFilters} values={filters} onChange={handleFilterChange} />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-7 gap-4">
        <StatCard title="Total Orders" value={stats.total} color="blue"
          icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          onClick={() => openDetailModal('total')} />
        <StatCard title="Routed" value={stats.routed} color="green"
          icon="M5 13l4 4L19 7"
          onClick={() => openDetailModal('routed')} />
        <StatCard title="Failed" value={stats.failed} color="red"
          icon="M6 18L18 6M6 6l12 12"
          onClick={() => openDetailModal('failed')} />
        <StatCard title="Split Orders" value={stats.split} color="yellow"
          icon="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
          onClick={() => openDetailModal('split')} />
        <StatCard title="Heavy" value={stats.heavy} color="purple"
          icon="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          onClick={() => openDetailModal('heavy')} />
        <StatCard title="Created" value={stats.created} color="blue"
          icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          onClick={() => openDetailModal('created')} />
        <StatCard title="Pending" value={stats.pending} color="gray"
          icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          onClick={() => openDetailModal('pending')} />
      </div>

      {/* Inventory Health Summary Bar */}
      {stats.inventoryHealth && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-900 text-sm">Good Inventory Overview</h3>
            <span className="text-xs text-gray-500">Available + Shelf Life ≥ 60%</span>
          </div>
          <div className="flex rounded-full h-4 overflow-hidden bg-gray-200">
            {stats.inventoryHealth.healthyUnits > 0 && (
              <div className="bg-green-500 transition-all w-full" title={`Good Inventory: ${stats.inventoryHealth.healthyUnits}`} />
            )}
          </div>
          <div className="flex gap-4 mt-2 text-xs text-gray-600">
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-full" /> Good Inventory: {(stats.inventoryHealth.healthyUnits || 0).toLocaleString()} units ({stats.inventoryHealth.healthySkus || 0} SKUs)</span>
          </div>
        </div>
      )}

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Order Routing Distribution</h3>
          <RoutingDistributionChart data={distribution} loading={loading} />
        </div>
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Failure Reasons</h3>
          <FailureReasonsChart data={failures} loading={loading} filters={filters} />
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Warehouse Utilization</h3>
          <WarehouseUtilizationChart data={utilization} loading={loading} />
        </div>
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Inventory Shelf Life</h3>
          <ShelfLifeAnalytics data={shelfLife} loading={loading} />
        </div>
      </div>

      {/* Charts Row 3: Scoring & Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Warehouse Scoring Breakdown</h3>
          <ScoringBreakdownChart />
        </div>
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Inventory Health Engine</h3>
          <InventoryHealthPanel />
        </div>
      </div>

      {/* Charts Row 4 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Order Split Statistics</h3>
          <OrderSplitStats data={splitStats} loading={loading} />
        </div>
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Daily Processing Trends</h3>
          <DailyTrendsChart data={trends} loading={loading} />
        </div>
      </div>

      {/* Order Detail Modal */}
      {detailModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDetailModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl flex items-center justify-between z-10">
              <div>
                <h3 className="text-base font-bold text-gray-900">{detailModal.title}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {detailData.pagination?.total || 0} order{(detailData.pagination?.total || 0) !== 1 ? 's' : ''} found
                </p>
              </div>
              <button onClick={() => setDetailModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {detailLoading ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-10 bg-gradient-to-r from-gray-100 to-gray-200 rounded-xl w-full" />
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-8 bg-gray-50 rounded-lg w-full" style={{ opacity: 1 - i * 0.15 }} />
                  ))}
                </div>
              ) : detailData.orders?.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p className="text-gray-400 text-sm">No orders in this category</p>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50">
                            {['Ref Code', 'Date', 'Customer', 'Marketplace', 'Pincode', 'SKUs', 'Warehouse', 'Status'].map(h => (
                              <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {detailData.orders.map(order => (
                            <tr key={order.id} className="border-t border-gray-50 hover:bg-indigo-50/30 transition-colors">
                              <td className="px-3 py-2.5 font-mono text-xs font-medium text-indigo-600 whitespace-nowrap">{order.reference_code || order.easyecom_order_id}</td>
                              <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{order.order_date ? new Date(order.order_date).toLocaleDateString() : '-'}</td>
                              <td className="px-3 py-2.5 text-xs text-gray-700">{order.customer_name || '-'}</td>
                              <td className="px-3 py-2.5 text-xs text-gray-600">{order.marketplace || '-'}</td>
                              <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{order.shipping_pincode || '-'}</td>
                              <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[200px] truncate" title={order.skus}>
                                {order.skus ? order.skus.split(',').slice(0, 2).join(', ') + (order.skus.split(',').length > 2 ? '...' : '') : '-'}
                              </td>
                              <td className="px-3 py-2.5 text-xs text-gray-700 whitespace-nowrap">{order.assigned_warehouse || '-'}</td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${statusColors[order.status] || 'bg-gray-100 text-gray-600'}`}>
                                  {order.status?.charAt(0).toUpperCase() + order.status?.slice(1)}
                                </span>
                                {order.failure_reasons && (
                                  <span className="ml-1 text-[10px] text-red-500" title={order.failure_reasons}>
                                    ({order.failure_reasons.split(',')[0]})
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Pagination */}
                  {detailData.pagination?.pages > 1 && (
                    <div className="mt-4 border-t border-gray-50 pt-3">
                      <Pagination
                        page={detailData.pagination.page}
                        pages={detailData.pagination.pages}
                        total={detailData.pagination.total}
                        onPageChange={handleDetailPageChange}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
