import { useState } from 'react'
import { Bar } from 'react-chartjs-2'
import { getFailureReasons } from '../../api/client'
import DataTable from '../common/DataTable'

export default function FailureReasonsChart({ data, loading, filters }) {
  const [drillDown, setDrillDown] = useState(null)
  const [drillDownData, setDrillDownData] = useState([])

  if (loading || !data?.reasons) {
    return <div className="h-64 flex items-center justify-center text-gray-400">Loading...</div>
  }

  if (data.reasons.length === 0) {
    return <div className="h-64 flex items-center justify-center text-gray-400">No failures recorded</div>
  }

  const handleClick = async (_, elements) => {
    if (elements.length === 0) return
    const idx = elements[0].index
    const reason = data.reasons[idx].failure_reason
    setDrillDown(reason)

    try {
      const result = await getFailureReasons({ ...filters, drillDown: reason })
      setDrillDownData(result.details || [])
    } catch (err) {
      console.error('Drill down failed:', err)
    }
  }

  const chartData = {
    labels: data.reasons.map(r => r.failure_reason),
    datasets: [{
      label: 'Count',
      data: data.reasons.map(r => r.count),
      backgroundColor: ['#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4', '#84cc16'],
      borderRadius: 4,
    }],
  }

  const options = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    onClick: handleClick,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.x} orders` } },
    },
    scales: {
      x: { grid: { display: false } },
      y: { grid: { display: false } },
    },
  }

  const drillDownColumns = [
    { key: 'easyecom_order_id', label: 'Order ID' },
    { key: 'marketplace_sku', label: 'SKU' },
    { key: 'order_date', label: 'Date' },
    { key: 'shipping_pincode', label: 'Pincode' },
    { key: 'warehouse_name', label: 'Warehouse' },
  ]

  return (
    <div>
      <div className="h-48">
        <Bar data={chartData} options={options} />
      </div>
      <p className="text-xs text-gray-400 mt-2">Click a bar to drill down</p>

      {drillDown && (
        <div className="mt-4 border-t pt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-sm">Details: {drillDown}</h4>
            <button onClick={() => { setDrillDown(null); setDrillDownData([]) }} className="text-xs text-blue-600 hover:underline">
              Close
            </button>
          </div>
          <DataTable columns={drillDownColumns} data={drillDownData} />
        </div>
      )}
    </div>
  )
}
