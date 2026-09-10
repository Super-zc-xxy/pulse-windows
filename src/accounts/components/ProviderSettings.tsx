import { useState } from 'react'
import { KeyRound, LogIn, LogOut, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import type { AuthStatus, ProviderCapability, PulseConfig } from '@/lib/pulse'

interface Props {
  provider: ProviderCapability
  auth?: AuthStatus
  config: PulseConfig
  attemptId?: string
  busy: boolean
  onConfigChange: (config: PulseConfig) => void
  onSaveKey: (provider: string, key: string) => Promise<boolean>
  onLogout: (provider: string) => Promise<boolean>
  onLogin: (provider: string) => Promise<boolean>
  onCancelLogin: (attemptId: string) => Promise<boolean>
  onSaveCursorDirectory: (value: string) => Promise<boolean>
}

export function ProviderSettings({ provider, auth, config, attemptId, busy, onConfigChange, onSaveKey, onLogout, onLogin, onCancelLogin, onSaveCursorDirectory }: Props) {
  const [key, setKey] = useState('')
  const [cursorDirectory, setCursorDirectory] = useState(config.cursorDataDir ?? '')
  const enabled = config.providers.find((item) => item.id === provider.id)?.enabled ?? false
  const setEnabled = (checked: boolean) => onConfigChange({ ...config, providers: config.providers.map((item) => item.id === provider.id ? { ...item, enabled: checked } : item) })

  return <div className="provider-content">
    <div className="provider-enable"><div><Label htmlFor={`enabled-${provider.id}`}>启用此数据源</Label><p>关闭后不再采集该平台的额度。</p></div><Switch id={`enabled-${provider.id}`} checked={enabled} onCheckedChange={setEnabled} /></div>
    <div className="auth-state"><Badge className={auth?.configured ? 'status-ready' : 'status-idle'}>{auth?.configured ? '已配置' : '未配置'}</Badge><span>{auth?.message || (auth?.configured ? `凭据模式：${auth.mode ?? '已保存'}` : '尚未保存独立凭据')}</span></div>
    {provider.apiKey && <div className="field"><Label htmlFor={`key-${provider.id}`}>API Key</Label><div className="inline-actions"><Input id={`key-${provider.id}`} type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} placeholder="留空不会修改已保存的 Key" /><Button size="sm" disabled={busy || !key.trim()} onClick={async () => { if (await onSaveKey(provider.id, key.trim())) setKey('') }}><KeyRound aria-hidden />保存 Key</Button></div></div>}
    {provider.id === 'glm' && <div className="field compact-field"><Label htmlFor="glm-region">GLM 站点</Label><NativeSelect id="glm-region" value={config.glmRegion} onChange={(event) => onConfigChange({ ...config, glmRegion: event.target.value as PulseConfig['glmRegion'] })}><option value="cn">BigModel 国内站</option><option value="international">Z.ai 国际站</option></NativeSelect></div>}
    {provider.id === 'cursor' && <div className="field"><Label htmlFor="cursor-data-dir">Cursor 用户数据目录（可选）</Label><div className="inline-actions"><Input id="cursor-data-dir" value={cursorDirectory} onChange={(event) => setCursorDirectory(event.target.value)} placeholder="默认自动检测；自定义目录请输入绝对路径" /><Button variant="outline" size="sm" disabled={busy} onClick={() => onSaveCursorDirectory(cursorDirectory.trim())}>保存目录</Button></div></div>}
    <div className="provider-actions">
      {provider.login && !attemptId && <Button variant="outline" size="sm" disabled={busy} onClick={() => onLogin(provider.id)}><LogIn aria-hidden />登录</Button>}
      {attemptId && <Button variant="outline" size="sm" disabled={busy} onClick={() => onCancelLogin(attemptId)}><X aria-hidden />取消登录</Button>}
      {auth?.configured && <Button variant="ghost" size="sm" disabled={busy} onClick={() => onLogout(provider.id)}><LogOut aria-hidden />清除凭据</Button>}
    </div>
    {provider.loginStatus && <p className="provider-note">{provider.loginStatus}</p>}
  </div>
}
