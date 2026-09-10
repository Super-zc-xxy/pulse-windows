export type DockSide = 'left' | 'right' | 'top'
export type CountdownMode = 'left' | 'used'

export interface ProviderConfig { id: string; name: string; enabled: boolean }
export interface PulseConfig {
  dockSide: DockSide
  autoCollapse: boolean
  collapseDelayMs: number
  countdownMode: CountdownMode
  theme: string
  refreshIntervalSec: number
  demoMode: boolean
  providers: ProviderConfig[]
  dragOffsetTop: number | null
  dragOffsetSide: number | null
  glmRegion: 'cn' | 'international'
  cursorDataDir: string | null
}

export interface Breakdown {
  name: string
  used: number
  max?: number
  unit?: string
  desc?: string
  reset?: string | number | null
}

export interface Metric {
  id: string
  name: string
  icon: string
  usedPercent: number
  isGenerating?: boolean
  status: 'ok' | 'warning' | 'critical' | 'limited'
  primaryQuota?: { label?: string; resetTime?: string | number | null }
  plan?: string | null
  creditBalance?: string | null
  creditsUnlimited?: boolean | null
  breakdown?: Breakdown[]
  burnRate?: { estimateText?: string; etaToExhaustion?: string }
}

export interface ProviderCapability {
  id: string
  name: string
  apiKey: boolean
  login: boolean
  loginStatus?: string
}

export interface AuthStatus { id: string; configured: boolean; mode?: string; message?: string }
export interface LoginAttempt { attemptId: string; message: string }
export interface LoginEvent { attemptId: string; status: string; message: string }

export interface PulseApi {
  getMetrics(): Promise<Metric[]>
  getConfig(): Promise<PulseConfig>
  saveConfig(config: PulseConfig): Promise<PulseConfig>
  setExpanded(expanded: boolean): Promise<boolean>
  setWindowHeight(height: number): Promise<void>
  openSettings(provider?: string): Promise<void>
  getSettingsTarget(): Promise<string | null>
  quitApp(): Promise<void>
  onMetricsUpdate(callback: (metrics: Metric[]) => void): () => void
  onConfigUpdate(callback: (config: PulseConfig) => void): () => void
  onExpandedUpdate(callback: (expanded: boolean) => void): () => void
  onToggleSettings(callback: () => void): () => void
  onFocusProvider(callback: (provider: string) => void): () => void
  getProviderCapabilities(): Promise<ProviderCapability[]>
  getAuthStatus(): Promise<AuthStatus[]>
  getProviderStatus(): Promise<unknown[]>
  saveApiKey(provider: string, key: string): Promise<void>
  startLogin(provider: string): Promise<LoginAttempt>
  cancelLogin(attemptId: string): Promise<void>
  logout(provider: string): Promise<void>
  onAuthUpdate(callback: (statuses: AuthStatus[]) => void): () => void
  onLoginUpdate(callback: (event: LoginEvent) => void): () => void
}

declare global { interface Window { pulseAPI: PulseApi } }

export const pulseApi = window.pulseAPI
