import { useState, useEffect } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import { getSyncStatus } from '../../api/client'

export default function MainLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null)

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const data = await getSyncStatus()
        if (data.syncHistory?.length > 0) {
          const latest = data.syncHistory[0]
          const date = new Date(latest.completed_at || latest.started_at)
          setSyncStatus(date.toLocaleString())
        }
      } catch {}
    }
    fetchStatus()
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex h-screen" style={{ background: 'linear-gradient(135deg, #f5f7fa 0%, #eef1f5 100%)' }}>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} syncStatus={syncStatus} />
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
