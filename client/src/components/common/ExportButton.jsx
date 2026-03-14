import { useState } from 'react'
import { exportData } from '../../api/client'

export default function ExportButton({ type, label = 'Export', warehouseId, status }) {
  const [exporting, setExporting] = useState(false)

  const handleExport = async (format) => {
    setExporting(true)
    try {
      await exportData(type, format, { warehouseId, status })
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="relative inline-flex">
      <button
        onClick={() => handleExport('csv')}
        disabled={exporting}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-l-lg hover:bg-gray-50 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {exporting ? 'Exporting...' : `${label} CSV`}
      </button>
      <button
        onClick={() => handleExport('xlsx')}
        disabled={exporting}
        className="inline-flex items-center px-3 py-2 text-xs font-medium text-white bg-emerald-600 border border-emerald-600 rounded-r-lg hover:bg-emerald-700 transition-colors"
      >
        Excel
      </button>
    </div>
  )
}
