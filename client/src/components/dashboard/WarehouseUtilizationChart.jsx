import { Bar } from 'react-chartjs-2'

export default function WarehouseUtilizationChart({ data, loading }) {
  if (loading || !data?.utilization) {
    return <div className="h-64 flex items-center justify-center text-gray-400">Loading...</div>
  }

  const chartData = {
    labels: data.utilization.map(u => u.name?.split(' ').slice(0, 2).join(' ') || 'Unknown'),
    datasets: [
      {
        label: 'Orders Fulfilled',
        data: data.utilization.map(u => u.order_count),
        backgroundColor: '#2563eb',
        borderRadius: 4,
      },
      {
        label: 'Available Inventory',
        data: data.utilization.map(u => u.available_inventory),
        backgroundColor: '#93c5fd',
        borderRadius: 4,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true } },
    },
    scales: {
      x: { grid: { display: false } },
      y: { grid: { color: '#f3f4f6' } },
    },
  }

  return (
    <div className="h-64">
      <Bar data={chartData} options={options} />
    </div>
  )
}
