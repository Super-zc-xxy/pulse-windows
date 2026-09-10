import { useCallback, useEffect, useRef, useState } from 'react'
import { Settings } from 'lucide-react'
import type { AuthStatus, Metric, ProviderCapability, ProviderConfig, PulseConfig } from '@/lib/pulse'
import { pulseApi } from '@/lib/pulse'
import { DetailCard } from './components/DetailCard'
import { ProviderIcon } from './components/ProviderIcon'
import { UsageRing } from './components/UsageRing'

const fallbackConfig: PulseConfig = { dockSide: 'right', autoCollapse: true, collapseDelayMs: 2500, countdownMode: 'left', theme: 'obsidian', refreshIntervalSec: 60, demoMode: false, providers: [], dragOffsetTop: null, dragOffsetSide: null, glmRegion: 'cn', cursorDataDir: null }
const providerIcons: Record<string, string> = { claudeCode: 'claude', codex: 'openai', antigravity: 'antigravity', cursor: 'cursor', kimi: 'kimi' }

export function App() {
  const [config, setConfig] = useState(fallbackConfig)
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [auth, setAuth] = useState<AuthStatus[]>([])
  const [capabilities, setCapabilities] = useState<ProviderCapability[]>([])
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
    void Promise.all([pulseApi.getConfig(), pulseApi.getMetrics(), pulseApi.getAuthStatus(), pulseApi.getProviderCapabilities()]).then(([nextConfig, nextMetrics, nextAuth, nextCapabilities]) => { setConfig(nextConfig); setMetrics(nextMetrics); setAuth(nextAuth); setCapabilities(nextCapabilities) }).catch((reason) => setError(`加载失败：${String(reason)}`))
    const stops = [pulseApi.onMetricsUpdate(setMetrics), pulseApi.onConfigUpdate(setConfig), pulseApi.onAuthUpdate(setAuth), pulseApi.onExpandedUpdate((value) => { setExpandedState(value); if (!value) setActiveId(null) }), pulseApi.onToggleSettings(() => { void pulseApi.openSettings() })]
    const onBlur = () => scheduleCollapse(150)
    window.addEventListener('blur', onBlur)
    collapseTimer.current = setTimeout(() => scheduleCollapse(0), 6000)
    return () => { stops.forEach((stop) => stop()); window.removeEventListener('blur', onBlur); cancelCollapse() }
  }, [cancelCollapse, scheduleCollapse])

  const inspect = (id: string, target: HTMLButtonElement) => {
    cancelCollapse(); setActiveId(id)
    const rect = target.getBoundingClientRect()
    requestAnimationFrame(() => {
      const card = document.querySelector<HTMLElement>('.detail-card')
      if (config.dockSide === 'top') setDetailPosition({ top: 70, left: Math.max(10, Math.min(window.innerWidth - (card?.offsetWidth ?? 290) - 10, rect.left - 130)) })
      else setDetailPosition({ top: Math.max(10, Math.min(window.innerHeight - (card?.offsetHeight ?? 330) - 10, rect.top - 20)) })
    })
  }

  const enabledProviders = config.providers.filter((provider) => provider.enabled)
  const activeMetric = metrics.find((metric) => metric.id === activeId) ?? null
  const activeProvider = enabledProviders.find((provider) => provider.id === activeId) ?? null
  const activeCapability = capabilities.find((provider) => provider.id === activeId)
  const activeConfigured = auth.find((provider) => provider.id === activeId)?.configured ?? false
  const activeNeedsSetup = !activeMetric && !activeConfigured && Boolean(activeCapability?.apiKey || activeCapability?.login)
  return <main id="app" className={`dock-${config.dockSide}${expanded ? '' : ' collapsed'}`} onMouseLeave={(event) => { if (event.clientX <= 0 || event.clientX >= window.innerWidth || event.clientY <= 0 || event.clientY >= window.innerHeight) scheduleCollapse(150) }} onClick={(event) => { if (event.currentTarget === event.target) scheduleCollapse(0) }}>
    {error && <div id="settings-feedback" role="alert">{error}</div>}
    <button id="edge-sliver" type="button" className="edge-sliver" aria-label="展开 Pulse" title="鼠标靠近展开 Pulse" onMouseEnter={expand} onMouseDown={expand} onClick={expand}><span className="sliver-glow" /></button>
    <DetailCard metric={activeMetric} mode={config.countdownMode} position={detailPosition} onMouseEnter={cancelCollapse} />
    {!activeMetric && activeProvider && <SetupCard provider={activeProvider} needsSetup={activeNeedsSetup} position={detailPosition} onMouseEnter={cancelCollapse} onConfigure={() => pulseApi.openSettings(activeProvider.id).catch((reason) => setError(String(reason)))} />}
    <aside id="rail" className="rail-container" aria-label="Pulse 配额监控" onMouseEnter={expand}>
      <div className="rail-header"><div className="brand-pulse-dot" title="Pulse 运行中" /></div>
      <div className="rings-list">{enabledProviders.map((provider) => {
        const metric = metrics.find((item) => item.id === provider.id)
        const capability = capabilities.find((item) => item.id === provider.id)
        const configured = auth.find((item) => item.id === provider.id)?.configured ?? false
        return metric
          ? <UsageRing key={metric.id} metric={metric} mode={config.countdownMode} active={activeId === metric.id} onInspect={(target) => inspect(metric.id, target)} />
          : <MissingRing key={provider.id} provider={provider} active={activeId === provider.id} needsSetup={!configured && Boolean(capability?.apiKey || capability?.login)} onInspect={(target) => inspect(provider.id, target)} />
      })}</div>
      <div className="rail-footer"><button id="btn-settings" type="button" className="btn-icon" title="设置与账号" aria-label="打开设置" onClick={(event) => { event.stopPropagation(); void pulseApi.openSettings().catch((reason) => setError(String(reason))) }}><Settings aria-hidden size={16} /></button></div>
    </aside>
  </main>
}

function MissingRing({ provider, active, needsSetup, onInspect }: { provider: ProviderConfig; active: boolean; needsSetup: boolean; onInspect: (element: HTMLButtonElement) => void }) {
  const label = needsSetup ? `${provider.name} 尚未配置鉴权` : `${provider.name} 暂时无法获取额度`
  return <button type="button" className={`ring-item missing-ring${active ? ' active' : ''}`} aria-label={label} title={label} onClick={(event) => onInspect(event.currentTarget)} onMouseEnter={(event) => onInspect(event.currentTarget)} onFocus={(event) => onInspect(event.currentTarget)}>
    <span className="missing-track" aria-hidden />
    <span className="ring-center"><span className="ring-icon"><ProviderIcon name={providerIcons[provider.id] ?? provider.id} /></span></span>
    <span className={needsSetup ? 'setup-dot' : 'unavailable-dot'} aria-hidden />
  </button>
}

function SetupCard({ provider, needsSetup, position, onMouseEnter, onConfigure }: { provider: ProviderConfig; needsSetup: boolean; position: React.CSSProperties; onMouseEnter: () => void; onConfigure: () => void }) {
  return <section className="detail-card setup-card" style={position} aria-label={`${provider.name} 状态`} onMouseEnter={onMouseEnter}>
    <header className="card-header"><div className="header-left"><span className="provider-avatar"><ProviderIcon name={providerIcons[provider.id] ?? provider.id} /></span><div className="header-titles"><strong className="title">{provider.name}</strong><span className="subtitle">{needsSetup ? '尚未配置鉴权' : '额度暂不可用'}</span></div></div></header>
    <p>{needsSetup ? '此平台已在设置中开启，完成鉴权后即可读取额度。' : '此平台已开启，但当前没有可显示的额度，请检查桌面客户端或稍后重试。'}</p>
    <button type="button" onClick={onConfigure}>{needsSetup ? '去配置' : '查看设置'}</button>
  </section>
}
