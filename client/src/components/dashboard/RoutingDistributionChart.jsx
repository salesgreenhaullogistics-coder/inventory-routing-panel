import { Doughnut } from 'react-chartjs-2'

export default function RoutingDistributionChart({ data, loading }) {
  if (loading || !data?.distribution) {
    return <div className="h-64 flex items-center justify-center text-gray-400">Loading...</div>
  }

  if (data.distribution.length === 0) {
    return <div className="h-64 flex items-center justify-center text-gray-400">No routing data yet</div>
  }

  const chartData = {
    labels: data.distribution.map(d => d.label),
    datasets: [{
      data: data.distribution.map(d => d.count),
      backgroundColor: ['#2563eb', '#7c3aed', '#f59e0b', '#ef4444'],
      borderWidth: 2,
      borderColor: '#fff',
    }],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true } },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const item = data.distribution[ctx.dataIndex]
            return `${item.label}: ${item.count} (${item.percentage}%)`
          },
        },
      },
    },
  }

  return (
    <div className="h-64">
      <Doughnut data={chartData} options={options} />
    </div>
  )
}
