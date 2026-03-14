import { Routes, Route } from 'react-router-dom'
import MainLayout from './components/layout/MainLayout'
import DashboardPage from './components/dashboard/DashboardPage'
import OrdersPage from './components/orders/OrdersPage'
import InventoryPage from './components/inventory/InventoryPage'
import RoutingPage from './components/routing/RoutingPage'
import ErrorReportPage from './components/errors/ErrorReportPage'
import HeavyOrdersPage from './components/heavy-orders/HeavyOrdersPage'

export default function App() {
  return (
    <MainLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/routing" element={<RoutingPage />} />
        <Route path="/errors" element={<ErrorReportPage />} />
        <Route path="/heavy-orders" element={<HeavyOrdersPage />} />
      </Routes>
    </MainLayout>
  )
}
