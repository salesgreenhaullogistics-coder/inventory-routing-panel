import { Doughnut } from 'react-chartjs-2'

export default function OrderSplitStats({ data, loading }) {
  if (loading || !data) {
    return <div className="h-64 flex items-center justify-center text-gray-400">Loading...</div>
  }

  const chartData = {
    labels: ['Non-Split', 'Split'],
    datasets: [{
      data: [data.nonSplitRouted || 0, data.splitOrders || 0],
      backgroundColor: ['#22c55e', '#f59e0b'],
      borderWidth: 2,
      borderColor: '#fff',
    }],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true } },
    },
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <p className="text-xs text-green-600 font-medium">Non-Split</p>
          <p className="text-lg font-bold text-green-700">{data.nonSplitRouted || 0}</p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-3 text-center">
          <p className="text-xs text-yellow-600 font-medium">Split Orders</p>
          <p className="text-lg font-bold text-yellow-700">{data.splitOrders || 0}</p>
        </div>
      </div>
      <div className="h-40">
        <Doughnut data={chartData} options={options} />
      </div>
      <p className="text-xs text-gray-500 text-center mt-2">
        Avg splits per order: {data.avgSplitsPerOrder || 0}
      </p>
    </div>
  )
}
