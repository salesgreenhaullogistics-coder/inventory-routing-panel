import { Bar } from 'react-chartjs-2'

export default function ShelfLifeAnalytics({ data, loading }) {
  if (loading || !data?.buckets) {
    return <div className="h-64 flex items-center justify-center text-gray-400">Loading...</div>
  }

  if (data.buckets.length === 0) {
    return <div className="h-64 flex items-center justify-center text-gray-400">No inventory data</div>
  }

  const colorMap = {
    'Below 60%': '#ef4444',
    '60-70%': '#f59e0b',
    '70-80%': '#eab308',
    '80-90%': '#84cc16',
    '90-100%': '#22c55e',
  }

  const chartData = {
    labels: data.buckets.map(b => b.bucket),
    datasets: [{
      label: 'SKU Count',
      data: data.buckets.map(b => b.count),
      backgroundColor: data.buckets.map(b => colorMap[b.bucket] || '#93c5fd'),
      borderRadius: 4,
    }],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          afterLabel: (ctx) => `Total Qty: ${data.buckets[ctx.dataIndex].total_qty}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: { grid: { color: '#f3f4f6' }, title: { display: true, text: 'Count' } },
    },
  }

  return (
    <div className="h-64">
      <Bar data={chartData} options={options} />
    </div>
  )
}
