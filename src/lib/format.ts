export function formatReset(value: string | number | null | undefined, now = Date.now()) {
  if (value === null || value === undefined || value === '') return '未提供'
  const numeric = typeof value === 'number' || /^\d+(\.\d+)?$/.test(value)
  const raw = numeric ? Number(value) : value
  const date = new Date(typeof raw === 'number' && raw < 1e12 ? raw * 1000 : raw)
  if (!Number.isFinite(date.getTime())) return '未提供'
  const minutes = Math.ceil((date.getTime() - now) / 60000)
  if (minutes <= 0) return '等待刷新'
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  return `${days ? `${days}天 ` : ''}${hours ? `${hours}小时 ` : ''}${minutes % 60}分钟`
}

export function usageColor(percent: number) {
  if (percent >= 90) return 'var(--accent-deep-red)'
  if (percent >= 75) return 'var(--accent-red)'
  if (percent >= 50) return 'var(--accent-amber)'
  return 'var(--accent-green)'
}
