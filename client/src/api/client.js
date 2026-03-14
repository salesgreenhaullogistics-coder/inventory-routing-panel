import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

api.interceptors.response.use(
  response => response.data,
  error => {
    const message = error.response?.data?.error || error.message || 'Network error'
    console.error('API Error:', message)
    return Promise.reject(new Error(message))
  }
)

// Sync
export const syncOrders = (startDate, endDate) =>
  api.post('/sync/orders', null, { params: { startDate, endDate } })
export const syncInventory = () => api.post('/sync/inventory')
export const getSyncStatus = () => api.get('/sync/status')

// Orders
export const getOrders = (params) => api.get('/orders', { params })
export const getOrder = (id) => api.get(`/orders/${id}`)
export const routeOrder = (id) => api.post(`/orders/${id}/route`)
export const routeAllOrders = () => api.post('/orders/route-all')

// Create Order in EasyEcom (manual only)
export const createOrderInEasyEcom = (orderId) => api.post(`/create-order/${orderId}`)
export const bulkCreateOrders = (orderIds) => api.post('/create-order', { orderIds })

// Inventory
export const getInventory = (params) => api.get('/inventory', { params })
export const getInventorySummary = () => api.get('/inventory/summary')

// Routing
export const getRoutingResults = (params) => api.get('/routing/results', { params })
export const getSplitOrders = (params) => api.get('/routing/splits', { params })

// Dashboard
export const getDashboardStats = () => api.get('/dashboard/stats')
export const getRoutingDistribution = (params) => api.get('/dashboard/routing-distribution', { params })
export const getFailureReasons = (params) => api.get('/dashboard/failure-reasons', { params })
export const getWarehouseUtilization = () => api.get('/dashboard/warehouse-utilization')
export const getShelfLife = () => api.get('/dashboard/shelf-life')
export const getSplitStats = () => api.get('/dashboard/split-stats')
export const getDailyTrends = (params) => api.get('/dashboard/daily-trends', { params })
export const getInventoryHealth = () => api.get('/dashboard/inventory-health')
export const getWarehouseAlerts = () => api.get('/dashboard/warehouse-alerts')
export const getScoringBreakdown = () => api.get('/dashboard/scoring-breakdown')
export const getOrdersByStatus = (params) => api.get('/dashboard/orders-by-status', { params })
export const getBadInventory = () => api.get('/dashboard/bad-inventory')

// Pincodes
export const validatePincode = (pincode) => api.get(`/pincodes/validate/${pincode}`)
export const getPincodeErrors = (params) => api.get('/pincodes/errors', { params })

// Exports (with optional location/status filters)
export const exportData = async (type, format = 'csv', filters = {}) => {
  const params = { format }
  if (filters.warehouseId) params.warehouseId = filters.warehouseId
  if (filters.status) params.status = filters.status
  const response = await axios.get(`/api/exports/${type}`, {
    params,
    responseType: 'blob',
  })
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', `${type}.${format}`)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
