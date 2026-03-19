import { useState, useEffect } from 'react'
import { getAIInsights } from '../../api/client'

const TYPE_STYLES = {
  critical: { bg: 'bg-red-50 border-red-200', icon: 'bg-red-500', text: 'text-red-800', badge: 'bg-red-100 text-red-700',
    svg: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z' },
  warning: { bg: 'bg-amber-50 border-amber-200', icon: 'bg-amber-500', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-700',
    svg: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  info: { bg: 'bg-blue-50 border-blue-200', icon: 'bg-blue-500', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-700',
    svg: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
}

export default function AIInsightsPanel() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAIInsights()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return null
  if (!data?.insights?.length) return null

  const criticalCount = data.insights.filter(i => i.type === 'critical').length
  const warningCount = data.insights.filter(i => i.type === 'warning').length

  return (
    <div className="card border-indigo-200 bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-indigo-900">AI Routing Intelligence</h3>
            <p className="text-xs text-indigo-600">Automated analysis of routing performance and inventory health</p>
          </div>
        </div>
        <div className="flex gap-2">
          {criticalCount > 0 && <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-red-100 text-red-700">{criticalCount} Critical</span>}
          {warningCount > 0 && <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-100 text-amber-700">{warningCount} Warning</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {data.insights.map((insight, i) => {
          const s = TYPE_STYLES[insight.type] || TYPE_STYLES.info
          return (
            <div key={i} className={`rounded-xl border p-3 ${s.bg}`}>
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg ${s.icon} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={s.svg} />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-sm font-bold ${s.text}`}>{insight.title}</span>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${s.badge}`}>{insight.metric}</span>
                  </div>
                  <p className="text-xs text-gray-700 leading-relaxed">{insight.description}</p>
                  <p className="text-[10px] text-gray-500 mt-1.5 italic">Recommendation: {insight.recommendation}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-[10px] text-gray-400 mt-3 text-right">
        Analysis generated at {new Date(data.generatedAt).toLocaleString()}
      </p>
    </div>
  )
}
