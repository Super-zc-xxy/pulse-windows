import type { CountdownMode, Metric } from '@/lib/pulse'
import { usageColor } from '@/lib/format'
import { ProviderIcon } from './ProviderIcon'

export function UsageRing({ metric, mode, active, onInspect }: { metric: Metric; mode: CountdownMode; active: boolean; onInspect: (element: HTMLButtonElement) => void }) {
  const percent = Math.max(0, Math.min(100, mode === 'left' ? 100 - metric.usedPercent : metric.usedPercent))
  const circumference = 113.1
  return <button type="button" className={`ring-item${active ? ' active' : ''}`} aria-label={`查看 ${metric.name} 配额`} onMouseEnter={(event) => onInspect(event.currentTarget)} onFocus={(event) => onInspect(event.currentTarget)}>
    <svg className="gauge-svg" viewBox="0 0 44 44" aria-hidden><circle className="gauge-track" cx="22" cy="22" r="18" /><circle className="gauge-progress" cx="22" cy="22" r="18" stroke={usageColor(metric.usedPercent)} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - percent / 100)} /></svg>
    {metric.isGenerating && <span className="revolving-dot" />}
    <span className="ring-center"><span className="ring-icon"><ProviderIcon name={metric.icon} /></span></span>
  </button>
}
