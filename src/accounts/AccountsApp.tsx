import { useEffect, useState } from 'react'
import { RefreshCw, Save } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { pulseApi, type AuthStatus, type ProviderCapability, type PulseConfig } from '@/lib/pulse'
import { GeneralSettings } from './components/GeneralSettings'
import { ProviderSettings } from './components/ProviderSettings'

export function AccountsApp() {
  const [config, setConfig] = useState<PulseConfig | null>(null)
  const [capabilities, setCapabilities] = useState<ProviderCapability[]>([])
  const [auth, setAuth] = useState<AuthStatus[]>([])
  const [attempts, setAttempts] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const [nextConfig, nextCapabilities, nextAuth] = await Promise.all([
      pulseApi.getConfig(),
      pulseApi.getProviderCapabilities(),
      pulseApi.getAuthStatus(),
    ])
    setConfig(nextConfig)
    setCapabilities(nextCapabilities)
    setAuth(nextAuth)
  }

  const action = async (work: () => Promise<void>, success?: string) => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await work()
      await load()
      if (success) setMessage(success)
      return true
    } catch (reason) {
      setError(String(reason))
      return false
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load().catch((reason) => setError(`加载失败：${String(reason)}`))
    const stopAuth = pulseApi.onAuthUpdate(setAuth)
    const stopLogin = pulseApi.onLoginUpdate((event) => {
      setMessage(event.message)
      if (event.status === 'pending') return
      setAttempts((current) => Object.fromEntries(
        Object.entries(current).filter(([, id]) => id !== event.attemptId),
      ))
      void load().catch((reason) => setError(String(reason)))
    })
    return () => {
      stopAuth()
      stopLogin()
    }
  }, [])

  if (!config) {
    return <main className="settings-shell">
      <Card><CardContent className="loading-state" aria-busy={!error}>
        {error ? <><p role="alert">{error}</p><Button variant="outline" onClick={() => {
          setError('')
          void load().catch((reason) => setError(`加载失败：${String(reason)}`))
        }}>重试</Button></> : '正在加载设置…'}
      </CardContent></Card>
    </main>
  }

  return <main className="settings-shell">
    <header className="page-header">
      <div><h1>Pulse 设置</h1><p>管理悬浮窗显示方式和各平台凭据。</p></div>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => action(load)}>
        <RefreshCw aria-hidden className={busy ? 'spin' : ''} />刷新
      </Button>
    </header>
    {(message || error) && <div className={error ? 'feedback error' : 'feedback'} role={error ? 'alert' : 'status'} aria-live="polite">
      {error || message}
    </div>}
    <GeneralSettings config={config} onChange={setConfig} />
    <div className="section-heading">
      <div><h2>平台设置</h2><p>按需展开平台，配置启用状态、凭据与登录方式。</p></div>
      <Button id="save-settings" disabled={busy} onClick={() => action(async () => {
        setConfig(await pulseApi.saveConfig(config))
      }, '设置已保存')}><Save aria-hidden />{busy ? '保存中…' : '保存设置'}</Button>
    </div>
    <Card><CardContent className="provider-list">
      {capabilities.length === 0 ? <p className="loading-state">没有可配置的平台</p> : (
        <Accordion type="multiple" defaultValue={[capabilities[0]?.id]}>
          {capabilities.map((provider) => {
            const state = auth.find((item) => item.id === provider.id)
            return <AccordionItem key={provider.id} value={provider.id}>
              <AccordionTrigger><span className="provider-trigger">
                <span>{provider.name}</span>
                <Badge className={state?.configured ? 'status-ready' : 'status-idle'}>{state?.configured ? '已配置' : '未配置'}</Badge>
              </span></AccordionTrigger>
              <AccordionContent><ProviderSettings
                provider={provider}
                auth={state}
                config={config}
                attemptId={attempts[provider.id]}
                busy={busy}
                onConfigChange={setConfig}
                onSaveKey={(id, key) => action(() => pulseApi.saveApiKey(id, key), 'API Key 已保存')}
                onLogout={(id) => action(() => pulseApi.logout(id), '凭据已清除')}
                onLogin={(id) => action(async () => {
                  const attempt = await pulseApi.startLogin(id)
                  setAttempts((current) => ({ ...current, [id]: attempt.attemptId }))
                  setMessage(attempt.message)
                })}
                onCancelLogin={(id) => action(async () => {
                  await pulseApi.cancelLogin(id)
                  setAttempts((current) => Object.fromEntries(
                    Object.entries(current).filter(([, value]) => value !== id),
                  ))
                }, '登录已取消')}
                onSaveCursorDirectory={(value) => action(async () => {
                  setConfig(await pulseApi.saveConfig({ ...config, cursorDataDir: value || null }))
                }, 'Cursor 目录已保存')}
              /></AccordionContent>
            </AccordionItem>
          })}
        </Accordion>
      )}
    </CardContent></Card>
  </main>
}
