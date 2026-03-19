export default function StatCard({ title, value, subtitle, percentage, color = 'blue', icon, onClick }) {
  const styles = {
    blue: { bg: 'from-blue-500 to-indigo-600', light: 'bg-blue-50 border-blue-100', text: 'text-blue-700', badge: 'bg-blue-200 text-blue-800' },
    green: { bg: 'from-emerald-500 to-teal-600', light: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-700', badge: 'bg-emerald-200 text-emerald-800' },
    red: { bg: 'from-rose-500 to-red-600', light: 'bg-rose-50 border-rose-100', text: 'text-rose-700', badge: 'bg-rose-200 text-rose-800' },
    yellow: { bg: 'from-amber-400 to-orange-500', light: 'bg-amber-50 border-amber-100', text: 'text-amber-700', badge: 'bg-amber-200 text-amber-800' },
    purple: { bg: 'from-violet-500 to-purple-600', light: 'bg-violet-50 border-violet-100', text: 'text-violet-700', badge: 'bg-violet-200 text-violet-800' },
    gray: { bg: 'from-gray-400 to-slate-500', light: 'bg-gray-50 border-gray-100', text: 'text-gray-600', badge: 'bg-gray-200 text-gray-700' },
  }

  const s = styles[color] || styles.blue

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-4 ${s.light} transition-all duration-200 hover:scale-[1.02] ${onClick ? 'cursor-pointer hover:shadow-lg' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-[10px] font-semibold uppercase tracking-wider ${s.text} opacity-70`}>{title}</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className={`text-2xl font-bold ${s.text} ${onClick ? 'underline decoration-dotted underline-offset-4 decoration-1' : ''}`}>{value ?? '-'}</p>
            {percentage && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${s.badge}`}>{percentage}%</span>
            )}
          </div>
          {subtitle && <p className={`text-[10px] mt-0.5 ${s.text} opacity-60`}>{subtitle}</p>}
        </div>
        {icon && (
          <div className={`p-2 rounded-xl bg-gradient-to-br ${s.bg} shadow-sm`}>
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
            </svg>
          </div>
        )}
      </div>
      {/* Decorative circle */}
      <div className={`absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-gradient-to-br ${s.bg} opacity-5`} />
    </div>
  )
}
