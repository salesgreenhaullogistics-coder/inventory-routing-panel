import { useState, useEffect } from 'react'
import { Bar } from 'react-chartjs-2'
import { getScoringBreakdown } from '../../api/client'

export default function ScoringBreakdownChart() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getScoringBreakdown().then(setData).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="animate-pulse h-64 bg-gray-100 rounded" />
  if (!data?.breakdown?.length) return <div className="text-gray-400 text-sm">No routing data yet. Route orders first.</div>

  const labels = data.breakdown.map(b => b.warehouse_name.replace('Emiza ', '').replace('Prozo ', ''))
  const chartData = {
    labels,
    datasets: [
      { label: 'Distance (40%)', data: data.breakdown.map(b => b.avg_distance_score), backgroundColor: '#3b82f6', stack: 'scores' },
      { label: 'Inventory (30%)', data: data.breakdown.map(b => b.avg_inventory_score), backgroundColor: '#22c55e', stack: 'scores' },
      { label: 'Load (15%)', data: data.breakdown.map(b => b.avg_load_score), backgroundColor: '#f59e0b', stack: 'scores' },
      { label: 'Speed (10%)', data: data.breakdown.map(b => b.avg_speed_score), backgroundColor: '#8b5cf6', stack: 'scores' },
      { label: 'Cost (5%)', data: data.breakdown.map(b => b.avg_cost_score), backgroundColor: '#ec4899', stack: 'scores' },
    ],
  }

  const options = {
    responsive: true,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } },
    },
    scales: {
      x: { stacked: true },
      y: { stacked: true, max: 1, title: { display: true, text: 'Avg Score', font: { size: 10 } } },
    },
  }

  return (
    <div>
      <Bar data={chartData} options={options} />
      <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-gray-500">
        {data.breakdown.map(b => (
          <div key={b.warehouse_name}>
            <span className="font-medium text-gray-700">{b.warehouse_name.split(' ').slice(-2).join(' ')}</span>: {b.order_count} orders, avg score {b.avg_routing_score}
          </div>
        ))}
      </div>
    </div>
  )
}
