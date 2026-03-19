import { useState, useEffect } from 'react'
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale,
  BarElement, PointElement, LineElement, Title
} from 'chart.js'
import StatCard from '../common/StatCard'
import FilterBar from '../common/FilterBar'
import Pagination from '../common/Pagination'
import FailureReasonsChart from './FailureReasonsChart'
import DailyTrendsChart from './DailyTrendsChart'
import InventoryHealthPanel from './InventoryHealthPanel'
import ScoringBreakdownChart from './ScoringBreakdownChart'
import UnfulfillableAlerts from './UnfulfillableAlerts'
import AIInsightsPanel from './AIInsightsPanel'
import MisrouteRatePanel from './MisrouteRatePanel'
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
    setDetailModal({ status, title: statusTitles[status] || status })
    setDetailLoading(true)
    try {
      const result = await getOrdersByStatus({ status, page: 1, limit: 50 })
      setDetailData(result)
    } catch (err) { console.error(err) }
    finally { setDetailLoading(false) }
  }

  const handleDetailPageChange = async (page) => {
    if (!detailModal) return
    setDetailLoading(true)
    try {
      const result = await getOrdersByStatus({ status: detailModal.status, page, limit: 50 })
      setDetailData(result)
    } catch (err) { console.error(err) }
    finally { setDetailLoading(false) }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">AI Command Center</h2>
          <p className="text-xs text-gray-400">Intelligent routing analytics and inventory intelligence</p>
        </div>
      </div>

      <FilterBar filters={dashboardFilters} values={filters} onChange={handleFilterChange} />

      {/* === SECTION 1: Key Metrics (5 core cards — removed redundant Created/Pending) === */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Total Orders" value={stats.total} color="blue"
          subtitle="Shopify + Anveshan OTS"
          icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          onClick={() => openDetailModal('total')} />
        <StatCard title="Successfully Routed" value={stats.routed} color="green"
          percentage={stats.routedPct} subtitle={`${stats.successRate || 0}% fulfillment rate`}
          icon="M5 13l4 4L19 7"
          onClick={() => openDetailModal('routed')} />
        <StatCard title="Failed" value={stats.failed} color="red"
          percentage={stats.failedPct} subtitle="No inventory available"
          icon="M6 18L18 6M6 6l12 12"
          onClick={() => openDetailModal('failed')} />
        <StatCard title="Split" value={stats.split} color="yellow"
          percentage={stats.splitPct} subtitle="Across multiple warehouses"
          icon="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
          onClick={() => openDetailModal('split')} />
        <StatCard title="Heavy (>20kg)" value={stats.heavy} color="purple"
          percentage={stats.heavyPct} subtitle="Manual handling required"
          icon="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          onClick={() => openDetailModal('heavy')} />
      </div>

      {/* Pending/Created mini-badges */}
      {(stats.pending > 0 || stats.created > 0) && (
        <div className="flex gap-3 text-xs">
          {stats.pending > 0 && (
            <span className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-gray-200 transition-colors"
              onClick={() => openDetailModal('pending')}>
              {stats.pending} orders pending routing
            </span>
          )}
          {stats.created > 0 && (
            <span className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors"
              onClick={() => openDetailModal('created')}>
              {stats.created} orders created (awaiting sync)
            </span>
          )}
        </div>
      )}

      {/* === SECTION 2: AI Intelligence === */}
      <AIInsightsPanel />

      {/* === SECTION 3: Mis-Route Analysis (NEW — key table) === */}
      <MisrouteRatePanel />

      {/* === SECTION 4: Alerts === */}
      <UnfulfillableAlerts />

      {/* === SECTION 5: Warehouse Performance & Failure Analysis (side by side) === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Warehouse Performance Summary */}
        {utilization?.utilization && (
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Warehouse Performance</h3>
              <span className="text-[10px] text-gray-400">{utilization.utilization.length} locations</span>
            </div>
            <div className="space-y-3">
              {utilization.utilization.map((wh, i) => {
                const loadPct = wh.load_pct || 0
                const loadColor = loadPct >= 90 ? 'bg-red-500' : loadPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                const loadTextColor = loadPct >= 90 ? 'text-red-700' : loadPct >= 70 ? 'text-amber-700' : 'text-emerald-700'
                return (
                  <div key={i} className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-semibold text-gray-800">{wh.name}</span>
                      <span className={`text-xs font-bold ${loadTextColor}`}>{loadPct}% load</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
                      <div className={`h-1.5 rounded-full ${loadColor} transition-all`} style={{ width: `${loadPct}%` }} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div className="text-center">
                        <p className="font-bold text-gray-800">{wh.order_count}</p>
                        <p className="text-gray-500">Orders</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-gray-800">{(wh.total_units || 0).toLocaleString()}</p>
                        <p className="text-gray-500">Units Assigned</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-gray-800">{(wh.available_inventory || 0).toLocaleString()}</p>
                        <p className="text-gray-500">Available Stock</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Failure Analysis */}
        <div className="card">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">Failure Analysis</h3>
          <FailureReasonsChart data={failures} loading={loading} filters={filters} />
        </div>
      </div>

      {/* === SECTION 6: AI Scoring + Trends (side by side) === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">AI Scoring Engine</h3>
          <ScoringBreakdownChart />
        </div>
        <div className="card">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">Daily Processing Trends</h3>
          <DailyTrendsChart data={trends} loading={loading} />
        </div>
      </div>

      {/* === SECTION 7: Inventory Intelligence === */}
      <div className="card">
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">Inventory Intelligence</h3>
        <InventoryHealthPanel />
      </div>

      {/* === Order Detail Modal === */}
      {detailModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDetailModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
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
