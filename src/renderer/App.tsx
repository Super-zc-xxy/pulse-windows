import { useCallback, useEffect, useRef, useState } from 'react'
import { Settings } from 'lucide-react'
import type { Metric, PulseConfig } from '@/lib/pulse'
import { pulseApi } from '@/lib/pulse'
import { DetailCard } from './components/DetailCard'
import { UsageRing } from './components/UsageRing'

const fallbackConfig: PulseConfig = { dockSide: 'right', autoCollapse: true, collapseDelayMs: 2500, countdownMode: 'left', theme: 'obsidian', refreshIntervalSec: 60, demoMode: false, providers: [], dragOffsetTop: null, dragOffsetSide: null, glmRegion: 'cn', cursorDataDir: null }

export function App() {
  const [config, setConfig] = useState(fallbackConfig)
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [expanded, setExpandedState] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detailPosition, setDetailPosition] = useState<React.CSSProperties>({})
  const [error, setError] = useState('')
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const collapseDelay = useRef(config.collapseDelayMs)
  collapseDelay.current = config.collapseDelayMs

  const cancelCollapse = useCallback(() => { if (collapseTimer.current) clearTimeout(collapseTimer.current); collapseTimer.current = null }, [])
  const expand = useCallback(() => { cancelCollapse(); setExpandedState(true); void pulseApi.setExpanded(true).catch((reason) => setError(String(reason))) }, [cancelCollapse])
  const scheduleCollapse = useCallback((delay = collapseDelay.current) => { cancelCollapse(); collapseTimer.current = setTimeout(() => { setActiveId(null); setExpandedState(false); void pulseApi.setExpanded(false).catch((reason) => setError(String(reason))) }, delay) }, [cancelCollapse])

  useEffect(() => {
    void Promise.all([pulseApi.getConfig(), pulseApi.getMetrics()]).then(([nextConfig, nextMetrics]) => { setConfig(nextConfig); setMetrics(nextMetrics) }).catch((reason) => setError(`加载失败：${String(reason)}`))
    const stops = [pulseApi.onMetricsUpdate(setMetrics), pulseApi.onConfigUpdate(setConfig), pulseApi.onExpandedUpdate((value) => { setExpandedState(value); if (!value) setActiveId(null) }), pulseApi.onToggleSettings(() => { void pulseApi.openSettings() })]
    const onBlur = () => scheduleCollapse(150)
    window.addEventListener('blur', onBlur)
    collapseTimer.current = setTimeout(() => scheduleCollapse(0), 6000)
    return () => { stops.forEach((stop) => stop()); window.removeEventListener('blur', onBlur); cancelCollapse() }
  }, [cancelCollapse, scheduleCollapse])

  const inspect = (metric: Metric, target: HTMLButtonElement) => {
    cancelCollapse(); setActiveId(metric.id)
    const rect = target.getBoundingClientRect()
    requestAnimationFrame(() => {
      const card = document.querySelector<HTMLElement>('.detail-card')
      if (config.dockSide === 'top') setDetailPosition({ top: 70, left: Math.max(10, Math.min(window.innerWidth - (card?.offsetWidth ?? 290) - 10, rect.left - 130)) })
      else setDetailPosition({ top: Math.max(10, Math.min(window.innerHeight - (card?.offsetHeight ?? 330) - 10, rect.top - 20)) })
    })
  }

  const activeMetric = metrics.find((metric) => metric.id === activeId) ?? null
  return <main id="app" className={`dock-${config.dockSide}${expanded ? '' : ' collapsed'}`} onMouseLeave={(event) => { if (event.clientX <= 0 || event.clientX >= window.innerWidth || event.clientY <= 0 || event.clientY >= window.innerHeight) scheduleCollapse(150) }} onClick={(event) => { if (event.currentTarget === event.target) scheduleCollapse(0) }}>
    {error && <div id="settings-feedback" role="alert">{error}</div>}
    <button id="edge-sliver" type="button" className="edge-sliver" aria-label="展开 Pulse" title="鼠标靠近展开 Pulse" onMouseEnter={expand} onMouseDown={expand} onClick={expand}><span className="sliver-glow" /></button>
    <DetailCard metric={activeMetric} mode={config.countdownMode} position={detailPosition} onMouseEnter={cancelCollapse} />
    <aside id="rail" className="rail-container" aria-label="Pulse 配额监控" onMouseEnter={expand}>
      <div className="rail-header"><div className="brand-pulse-dot" title="Pulse 运行中" /></div>
      <div className="rings-list">{metrics.map((metric) => <UsageRing key={metric.id} metric={metric} mode={config.countdownMode} active={activeId === metric.id} onInspect={(target) => inspect(metric, target)} />)}</div>
      <div className="rail-footer"><button id="btn-settings" type="button" className="btn-icon" title="设置与账号" aria-label="打开设置" onClick={(event) => { event.stopPropagation(); void pulseApi.openSettings().catch((reason) => setError(String(reason))) }}><Settings aria-hidden size={16} /></button></div>
    </aside>
  </main>
}
