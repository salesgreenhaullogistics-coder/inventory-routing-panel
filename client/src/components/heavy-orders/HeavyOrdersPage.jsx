import { useState, useEffect } from 'react'
import DataTable from '../common/DataTable'
import Pagination from '../common/Pagination'
import FilterBar from '../common/FilterBar'
import ExportButton from '../common/ExportButton'
import { getOrders } from '../../api/client'

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
]

const columns = [
  { key: 'reference_code', label: 'Ref Code', render: (v) => <span className="font-mono text-xs font-medium text-indigo-600">{v || '-'}</span> },
  { key: 'order_date', label: 'Date', render: (v) => v ? new Date(v).toLocaleDateString() : '-' },
  { key: 'customer_name', label: 'Customer' },
  { key: 'marketplace', label: 'Marketplace' },
  { key: 'skus', label: 'SKUs', render: (v) => v ? (
    <span className="font-mono text-xs">{v.split(',').slice(0, 2).join(', ')}{v.split(',').length > 2 ? '...' : ''}</span>
  ) : '-' },
  { key: 'total_weight_kg', label: 'Weight', render: (v) => v ? (
    <span className="inline-flex items-center gap-1">
      <span className="bg-violet-50 text-violet-700 border border-violet-200 px-2.5 py-0.5 rounded-full text-[11px] font-bold">{Number(v).toFixed(1)} kg</span>
    </span>
  ) : '-' },
  { key: 'status', label: 'Status', render: (v) => (
    <span className="bg-violet-50 text-violet-700 border border-violet-200 px-2.5 py-0.5 rounded-full text-[11px] font-semibold">
      {v?.charAt(0).toUpperCase() + v?.slice(1)}
    </span>
  )},
]

export default function HeavyOrdersPage() {
  const [data, setData] = useState({ orders: [], pagination: {} })
  const [filterValues, setFilterValues] = useState({})
  const [loading, setLoading] = useState(true)

  const fetchHeavy = async (params = {}) => {
    setLoading(true)
    try {
      const result = await getOrders({ status: 'heavy', limit: 50, ...filterValues, ...params })
      setData(result)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchHeavy() }, [])

  const handleFilterChange = (f) => {
    setFilterValues(f)
    fetchHeavy({ ...f, page: 1 })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Heavy Orders</h2>
          <p className="text-xs text-gray-400 mt-0.5">Orders exceeding 20 kg total weight</p>
        </div>
        <ExportButton type="heavy-orders" label="Export" warehouseId={filterValues.warehouseId} />
      </div>

      <FilterBar filters={filters} values={filterValues} onChange={handleFilterChange} />

      <div className="card p-0 overflow-hidden">
        <DataTable columns={columns} data={data.orders} loading={loading} />
        <div className="border-t border-gray-50 bg-gray-50/50">
          <Pagination
            page={data.pagination?.page}
            pages={data.pagination?.pages}
            total={data.pagination?.total}
            onPageChange={(p) => fetchHeavy({ page: p })}
          />
        </div>
      </div>

      {data.orders?.length === 0 && !loading && (
        <div className="card text-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-violet-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <p className="text-gray-400 text-sm">No heavy orders detected yet</p>
            <p className="text-gray-300 text-xs">Orders exceeding 20 kg will appear here automatically</p>
          </div>
        </div>
      )}
    </div>
  )
}
