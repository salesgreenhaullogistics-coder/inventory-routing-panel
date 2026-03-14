import { useState, useEffect } from 'react'
import DataTable from '../common/DataTable'
import Pagination from '../common/Pagination'
import ExportButton from '../common/ExportButton'
import { getPincodeErrors, getRoutingResults } from '../../api/client'

const pincodeColumns = [
  { key: 'reference_code', label: 'Ref Code', render: (v) => <span className="font-mono text-xs font-medium text-indigo-600">{v || '-'}</span> },
  { key: 'order_date', label: 'Date', render: (v) => v ? new Date(v).toLocaleDateString() : '-' },
  { key: 'customer_name', label: 'Customer' },
  { key: 'marketplace', label: 'Marketplace' },
  { key: 'shipping_pincode', label: 'Pincode', render: (v) => <span className="font-mono text-xs">{v}</span> },
  { key: 'error_type', label: 'Error Type', render: (v) => (
    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
      v === 'MISSING' ? 'bg-red-50 text-red-700 border-red-200' :
      v === 'INVALID' ? 'bg-orange-50 text-orange-700 border-orange-200' :
      'bg-amber-50 text-amber-700 border-amber-200'
    }`}>{v}</span>
  )},
  { key: 'suggested_correction', label: 'Suggested', render: (v) => v || <span className="text-gray-300">—</span> },
]

const failureColumns = [
  { key: 'reference_code', label: 'Ref Code', render: (v) => <span className="font-mono text-xs font-medium text-indigo-600">{v || '-'}</span> },
  { key: 'marketplace_sku', label: 'SKU', render: (v) => <span className="font-mono text-xs">{v}</span> },
  { key: 'assigned_quantity', label: 'Qty' },
  { key: 'warehouse_name', label: 'Warehouse', render: (v) => v || <span className="text-gray-300">—</span> },
  { key: 'failure_reason', label: 'Reason', render: (v) => (
    <span className="bg-red-50 text-red-700 border border-red-200 px-2.5 py-0.5 rounded-full text-[11px] font-semibold">{v}</span>
  )},
]

export default function ErrorReportPage() {
  const [tab, setTab] = useState('pincode')
  const [pincodeData, setPincodeData] = useState({ errors: [], pagination: {} })
  const [failureData, setFailureData] = useState({ results: [], pagination: {} })
  const [loading, setLoading] = useState(true)

  const fetchPincodeErrors = async (page = 1) => {
    setLoading(true)
    try {
      const result = await getPincodeErrors({ page })
      setPincodeData(result)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchFailures = async (page = 1) => {
    setLoading(true)
    try {
      const result = await getRoutingResults({ failureReason: 'all', page })
      const failedResults = (result.results || []).filter(r => r.failure_reason)
      setFailureData({ results: failedResults, pagination: result.pagination })
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'pincode') fetchPincodeErrors()
    else fetchFailures()
  }, [tab])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Error Reports</h2>
          <p className="text-xs text-gray-400 mt-0.5">Pincode issues and routing failures</p>
        </div>
        <ExportButton type={tab === 'pincode' ? 'errors' : 'failed-orders'} label="Export" />
      </div>

      <div className="flex gap-2">
        {[
          { id: 'pincode', label: 'Pincode Errors' },
          { id: 'routing', label: 'Routing Failures' },
        ].map(t => (
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

      {tab === 'pincode' && (
        <div className="card p-0 overflow-hidden">
          <DataTable columns={pincodeColumns} data={pincodeData.errors} loading={loading} />
          <div className="border-t border-gray-50 bg-gray-50/50">
            <Pagination
              page={pincodeData.pagination?.page}
              pages={pincodeData.pagination?.pages}
              total={pincodeData.pagination?.total}
              onPageChange={fetchPincodeErrors}
            />
          </div>
        </div>
      )}

      {tab === 'routing' && (
        <div className="card p-0 overflow-hidden">
          <DataTable columns={failureColumns} data={failureData.results} loading={loading} />
          <div className="border-t border-gray-50 bg-gray-50/50">
            <Pagination
              page={failureData.pagination?.page}
              pages={failureData.pagination?.pages}
              total={failureData.pagination?.total}
              onPageChange={fetchFailures}
            />
          </div>
        </div>
      )}
    </div>
  )
}
