import { useState, useEffect } from 'react'
import DataTable from '../common/DataTable'
import Pagination from '../common/Pagination'
import FilterBar from '../common/FilterBar'
import ExportButton from '../common/ExportButton'
import { getInventory } from '../../api/client'

const filters = [
  { key: 'sku', label: 'SKU', type: 'text', placeholder: 'Search SKU...' },
  { key: 'company', label: 'Company', type: 'text', placeholder: 'Company name...' },
  {
    key: 'warehouseId', label: 'Warehouse', type: 'select',
    options: [
      { value: '1', label: 'Emiza Bangalore NLM' },
      { value: '2', label: 'Prozo GGN 05' },
      { value: '3', label: 'Emiza Kolkata' },
      { value: '4', label: 'Prozo Bhiwandi D2C' },
    ],
  },
  { key: 'minShelfLife', label: 'Min Shelf Life %', type: 'text', placeholder: 'e.g. 60' },
]

function shelfLifeBadge(pct) {
  if (pct == null) return <span className="text-gray-300">—</span>
  if (pct < 30) return (
    <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 border border-red-200 px-2.5 py-0.5 rounded-full text-[11px] font-semibold">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      {pct.toFixed(0)}%
    </span>
  )
  if (pct < 60) return (
    <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full text-[11px] font-semibold">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      {pct.toFixed(0)}%
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[11px] font-semibold">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      {pct.toFixed(0)}%
    </span>
  )
}

const columns = [
  { key: 'sku', label: 'SKU', render: (v) => <span className="font-mono text-xs font-medium text-indigo-600">{v}</span> },
  { key: 'company_name', label: 'Company' },
  { key: 'warehouse_display_name', label: 'Warehouse', render: (v) => v || <span className="text-gray-300">Unassigned</span> },
  { key: 'quantity', label: 'Qty', render: (v) => <span className="font-semibold">{v}</span> },
  { key: 'status', label: 'Status', render: (v) => (
    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
      v === 'Available' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200'
    }`}>
      {v}
    </span>
  )},
  { key: 'shelf_life_pct', label: 'Shelf Life', render: (v) => shelfLifeBadge(v) },
]

export default function InventoryPage() {
  const [data, setData] = useState({ inventory: [], pagination: {} })
  const [filterValues, setFilterValues] = useState({})
  const [loading, setLoading] = useState(true)

  const fetchInventory = async (params = {}) => {
    setLoading(true)
    try {
      const result = await getInventory({ ...filterValues, ...params })
      setData(result)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchInventory() }, [])

  const handleFilterChange = (f) => {
    setFilterValues(f)
    fetchInventory({ ...f, page: 1 })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Inventory</h2>
          <p className="text-xs text-gray-400 mt-0.5">Real-time stock levels across warehouses</p>
        </div>
        <ExportButton type="orders" label="Export" warehouseId={filterValues.warehouseId} />
      </div>

      <FilterBar filters={filters} values={filterValues} onChange={handleFilterChange} />

      <div className="card p-0 overflow-hidden">
        <DataTable columns={columns} data={data.inventory} loading={loading} />
        <div className="border-t border-gray-50 bg-gray-50/50">
          <Pagination
            page={data.pagination?.page}
            pages={data.pagination?.pages}
            total={data.pagination?.total}
            onPageChange={(p) => fetchInventory({ page: p })}
          />
        </div>
      </div>
    </div>
  )
}
