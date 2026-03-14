import { Line } from 'react-chartjs-2'

export default function DailyTrendsChart({ data, loading }) {
  if (loading || !data?.trends) {
    return <div className="h-64 flex items-center justify-center text-gray-400">Loading...</div>
  }

  if (data.trends.length === 0) {
    return <div className="h-64 flex items-center justify-center text-gray-400">No trend data</div>
  }

  const chartData = {
    labels: data.trends.map(t => {
      const d = new Date(t.date)
      return `${d.getDate()}/${d.getMonth() + 1}`
    }),
    datasets: [
      {
        label: 'Total',
        data: data.trends.map(t => t.total),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        fill: true,
        tension: 0.3,
      },
      {
        label: 'Routed',
        data: data.trends.map(t => t.routed),
        borderColor: '#22c55e',
        borderDash: [5, 5],
        tension: 0.3,
      },
      {
        label: 'Failed',
        data: data.trends.map(t => t.failed),
        borderColor: '#ef4444',
        borderDash: [5, 5],
        tension: 0.3,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true } },
    },
    scales: {
      x: { grid: { display: false } },
      y: { grid: { color: '#f3f4f6' }, beginAtZero: true },
    },
  }

  return (
    <div className="h-64">
      <Line data={chartData} options={options} />
    </div>
  )
}
