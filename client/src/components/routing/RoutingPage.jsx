import { useState, useEffect } from 'react'
import DataTable from '../common/DataTable'
import Pagination from '../common/Pagination'
import FilterBar from '../common/FilterBar'
import ExportButton from '../common/ExportButton'
import { getRoutingResults, getSplitOrders } from '../../api/client'

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
    }`}>#{v}</span>
  ) : '-' },
  { key: 'distance_km', label: 'Distance', render: (v) => v ? <span className="text-gray-500">{v.toFixed(0)} km</span> : '-' },
  { key: 'routing_score', label: 'Score', render: (v) => v ? (
    <span className="font-bold text-indigo-600">{v.toFixed(3)}</span>
  ) : '-' },
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
  const [splits, setSplits] = useState([])
  const [filterValues, setFilterValues] = useState({})
  const [loading, setLoading] = useState(true)

  const fetchData = async (params = {}) => {
    setLoading(true)
    try {
      if (tab === 'splits') {
        const result = await getSplitOrders(params)
        setSplits(result.splits || [])
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Routing Results</h2>
          <p className="text-xs text-gray-400 mt-0.5">Multi-factor scoring engine results</p>
        </div>
        <ExportButton type="routing" label="Export" warehouseId={filterValues.warehouseId} />
      </div>

      <div className="flex gap-2">
        {['all', 'splits'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
              tab === t
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm'
                : 'bg-white/60 text-gray-600 hover:bg-white hover:shadow-sm border border-gray-200'
            }`}
          >
            {t === 'all' ? 'All Results' : 'Split Orders'}
          </button>
        ))}
      </div>

      {tab === 'all' && (
        <>
          <FilterBar filters={filters} values={filterValues} onChange={handleFilterChange} />
          <div className="card p-0 overflow-hidden">
            <DataTable columns={columns} data={data.results} loading={loading} />
            <div className="border-t border-gray-50 bg-gray-50/50">
              <Pagination
                page={data.pagination?.page}
                pages={data.pagination?.pages}
                total={data.pagination?.total}
                onPageChange={(p) => fetchData({ page: p })}
              />
            </div>
          </div>
        </>
      )}

      {tab === 'splits' && (
        <div className="card p-0 overflow-hidden">
          <DataTable columns={splitColumns} data={splits} loading={loading} />
        </div>
      )}
    </div>
  )
}
