import { useState, useEffect } from 'react'
import DataTable from '../common/DataTable'
import Pagination from '../common/Pagination'
import FilterBar from '../common/FilterBar'
import ExportButton from '../common/ExportButton'
import RoutingFlowPanel from './RoutingFlowPanel'
import SplitOrderDetail from './SplitOrderDetail'
import ScoreIndicator from '../common/ScoreIndicator'
import { getRoutingResults, getSplitOrders, getAttemptStats } from '../../api/client'

const filters = [
  {
    key: 'warehouseId', label: 'Warehouse', type: 'select',
    options: [
      { value: '1', label: 'Emiza Bangalore NLM' },
      { value: '2', label: 'Prozo GGN 05' },
      { value: '3', label: 'Emiza Kolkata' },
      { value: '4', label: 'Prozo Bhiwandi D2C' },
    ],
  },
  {
    key: 'failureReason', label: 'Failure Reason', type: 'select',
    options: [
      { value: 'No Inventory', label: 'No Inventory' },
      { value: 'Low Shelf Life', label: 'Low Shelf Life' },
      { value: 'SKU Not Found', label: 'SKU Not Found' },
      { value: 'Location Mismatch', label: 'Location Mismatch' },
      { value: 'Invalid Pincode', label: 'Invalid Pincode' },
    ],
  },
  {
    key: 'isSplit', label: 'Split', type: 'select',
    options: [
      { value: 'true', label: 'Split Orders' },
      { value: 'false', label: 'Non-Split' },
    ],
  },
]

const columns = [
  { key: 'reference_code', label: 'Ref Code', render: (v) => <span className="font-mono text-xs font-medium text-indigo-600">{v || '-'}</span> },
  { key: 'marketplace_sku', label: 'SKU', render: (v) => <span className="font-mono text-xs">{v}</span> },
  { key: 'assigned_quantity', label: 'Qty', render: (v) => <span className="font-semibold">{v}</span> },
  { key: 'warehouse_name', label: 'Warehouse', render: (v) => v || <span className="text-gray-300">—</span> },
  { key: 'warehouse_rank', label: 'Rank', render: (v) => v > 0 ? (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
      v === 1 ? 'bg-emerald-100 text-emerald-700' : v === 2 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
    }`} title="Ranked by AI composite score: Distance(35%) + Inventory(25%) + Load(15%) + RTO(10%) + Speed(10%) + Cost(5%)">#{v}</span>
  ) : '-' },
  { key: 'distance_km', label: 'Distance', render: (v) => v ? <span className="text-gray-500">{v.toFixed(0)} km</span> : '-' },
  { key: 'routing_score', label: 'AI Score', render: (v) => v ? <ScoreIndicator score={v} compact /> : '-' },
  { key: 'is_split', label: 'Split', render: (v) => v ? (
    <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full text-[11px] font-semibold">Split</span>
  ) : <span className="text-gray-300 text-xs">—</span> },
  { key: 'failure_reason', label: 'Status', render: (v) => v ? (
    <span className="bg-red-50 text-red-700 border border-red-200 px-2.5 py-0.5 rounded-full text-[11px] font-semibold">{v}</span>
  ) : (
    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[11px] font-semibold">Assigned</span>
  )},
]

export default function RoutingPage() {
  const [tab, setTab] = useState('all')
  const [data, setData] = useState({ results: [], pagination: {} })
  const [splits, setSplits] = useState({ splits: [], pagination: {} })
  const [attemptStats, setAttemptStats] = useState(null)
  const [filterValues, setFilterValues] = useState({})
  const [loading, setLoading] = useState(true)
  const [flowOrderId, setFlowOrderId] = useState(null)
  const [splitOrderId, setSplitOrderId] = useState(null)

  const fetchData = async (params = {}) => {
    setLoading(true)
    try {
      if (tab === 'splits') {
        const result = await getSplitOrders(params)
        setSplits(result)
      } else if (tab === 'flow') {
        const stats = await getAttemptStats()
        setAttemptStats(stats)
      } else {
        const result = await getRoutingResults({ ...filterValues, ...params })
        setData(result)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [tab])

  const handleFilterChange = (f) => {
    setFilterValues(f)
    fetchData({ ...f, page: 1 })
  }

  const handleRowClick = (row) => {
    if (tab === 'all') {
      setFlowOrderId(row.order_id)
    } else if (tab === 'splits') {
      setSplitOrderId(row.order_id)
    }
  }

  const splitColumns = [
    { key: 'reference_code', label: 'Ref Code', render: (v) => <span className="font-mono text-xs font-medium text-indigo-600">{v || '-'}</span> },
    { key: 'marketplace_sku', label: 'SKU', render: (v) => <span className="font-mono text-xs">{v}</span> },
    { key: 'split_count', label: 'Warehouses', render: (v) => (
      <span className="inline-flex items-center gap-1">
        <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs font-bold">{v}</span>
        <span className="text-gray-400 text-xs">locations</span>
      </span>
    ) },
    { key: 'total_allocated', label: 'Total Qty', render: (v) => <span className="font-semibold">{v}</span> },
    { key: 'allocations', label: 'Allocation Details', render: (v) => <span className="text-xs text-gray-500">{v}</span> },
  ]

  const tabs = [
    { id: 'all', label: 'All Results' },
    { id: 'splits', label: 'Split Orders' },
    { id: 'flow', label: 'Decision Flow' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Routing Engine</h2>
          <p className="text-xs text-gray-400 mt-0.5">AI-powered multi-factor scoring & decision tracking</p>
        </div>
        <ExportButton type="routing" label="Export" warehouseId={filterValues.warehouseId} />
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
              tab === t.id
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm'
                : 'bg-white/60 text-gray-600 hover:bg-white hover:shadow-sm border border-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* All Results Tab */}
      {tab === 'all' && (
        <>
          <FilterBar filters={filters} values={filterValues} onChange={handleFilterChange} />
          <div className="card p-0 overflow-hidden">
            <DataTable columns={columns} data={data.results} loading={loading} onRowClick={handleRowClick} />
            <div className="border-t border-gray-50 bg-gray-50/50">
              <Pagination
                page={data.pagination?.page}
                pages={data.pagination?.pages}
                total={data.pagination?.total}
                onPageChange={(p) => fetchData({ page: p })}
              />
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center">Click any row to see the full routing decision flow</p>
        </>
      )}

      {/* Split Orders Tab */}
      {tab === 'splits' && (
        <>
          <div className="card p-0 overflow-hidden">
            <DataTable columns={splitColumns} data={splits.splits || []} loading={loading} onRowClick={handleRowClick} />
            {splits.pagination?.pages > 1 && (
              <div className="border-t border-gray-50 bg-gray-50/50">
                <Pagination
                  page={splits.pagination?.page}
                  pages={splits.pagination?.pages}
                  total={splits.pagination?.total}
                  onPageChange={(p) => fetchData({ page: p })}
                />
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400 text-center">Click any row to see split details and override allocations</p>
        </>
      )}

      {/* Decision Flow Tab */}
      {tab === 'flow' && (
        <div className="space-y-4">
          {loading ? (
            <div className="card flex items-center justify-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full" />
            </div>
          ) : attemptStats ? (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="card text-center">
                  <p className="text-2xl font-bold text-indigo-700">{attemptStats.totalAttempts}</p>
                  <p className="text-xs text-gray-500 mt-1">Total Evaluations</p>
                  <p className="text-[10px] text-gray-400">{attemptStats.totalOrders} orders x ~{attemptStats.avgAttemptsPerItem} warehouses</p>
                </div>
                <div className="card text-center">
                  <p className="text-2xl font-bold text-emerald-700">{attemptStats.totalOrders}</p>
                  <p className="text-xs text-gray-500 mt-1">Orders Processed</p>
                  <p className="text-[10px] text-gray-400">Through AI routing engine</p>
                </div>
                <div className="card text-center">
                  <p className="text-2xl font-bold text-purple-700">{attemptStats.avgAttemptsPerItem}</p>
                  <p className="text-xs text-gray-500 mt-1">Avg Evaluations/Item</p>
                  <p className="text-[10px] text-gray-400">Out of 4 possible warehouses</p>
                </div>
                <div className="card text-center">
                  {(() => {
                    const sel = attemptStats.statusBreakdown?.find(s => s.status === 'selected')?.count || 0
                    const pct = attemptStats.totalAttempts > 0 ? (sel / attemptStats.totalAttempts * 100).toFixed(1) : 0
                    return <>
                      <p className="text-2xl font-bold text-amber-700">{sel}</p>
                      <p className="text-xs text-gray-500 mt-1">Successful Selections</p>
                      <p className="text-[10px] text-gray-400">{pct}% selection rate</p>
                    </>
                  })()}
                </div>
              </div>

              {/* Warehouse selection rates */}
              <div className="card">
                <h3 className="text-sm font-bold text-gray-700 mb-3">Warehouse Selection Rate</h3>
                <div className="space-y-3">
                  {attemptStats.warehouseSelectionRate?.map((wh, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-gray-800">{wh.warehouse_name}</span>
                        <span className="text-gray-500">{wh.selected_count}/{wh.total_evaluations} ({wh.selection_rate}%)</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all"
                          style={{ width: `${wh.selection_rate}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rejection reasons */}
              <div className="card">
                <h3 className="text-sm font-bold text-gray-700 mb-3">Top Rejection Reasons</h3>
                <div className="space-y-2">
                  {attemptStats.rejectionReasons?.map((r, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-gray-700">{r.rejection_reason}</span>
                      <span className="bg-red-100 text-red-700 px-2.5 py-0.5 rounded-full text-xs font-bold">{r.count}</span>
                    </div>
                  ))}
                  {(!attemptStats.rejectionReasons || attemptStats.rejectionReasons.length === 0) && (
                    <p className="text-sm text-gray-400 text-center py-4">No rejection data yet. Route orders first.</p>
                  )}
                </div>
              </div>

              {/* Status breakdown */}
              <div className="card">
                <h3 className="text-sm font-bold text-gray-700 mb-3">Attempt Status Distribution</h3>
                <div className="flex flex-wrap gap-3">
                  {attemptStats.statusBreakdown?.map((s, i) => {
                    const colors = {
                      selected: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                      rejected: 'bg-red-100 text-red-700 border-red-200',
                      partial: 'bg-amber-100 text-amber-700 border-amber-200',
                      manual_override: 'bg-blue-100 text-blue-700 border-blue-200',
                    }
                    return (
                      <div key={i} className={`px-4 py-2 rounded-xl border ${colors[s.status] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                        <span className="text-lg font-bold">{s.count}</span>
                        <span className="text-xs ml-1.5 capitalize">{s.status}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="card text-center py-12 text-gray-500">
              No routing attempt data available. Route some orders first.
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {flowOrderId && (
        <RoutingFlowPanel orderId={flowOrderId} onClose={() => setFlowOrderId(null)} />
      )}
      {splitOrderId && (
        <SplitOrderDetail orderId={splitOrderId} onClose={() => setSplitOrderId(null)} />
      )}
    </div>
  )
}
