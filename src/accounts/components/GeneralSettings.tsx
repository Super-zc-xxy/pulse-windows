import type { PulseConfig } from '@/lib/pulse'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'

export function GeneralSettings({ config, onChange }: { config: PulseConfig; onChange: (config: PulseConfig) => void }) {
  return <Card><CardHeader><CardTitle>显示与数据</CardTitle><CardDescription>调整悬浮窗的位置和额度呈现方式。</CardDescription></CardHeader><CardContent className="general-grid">
    <div className="field"><Label htmlFor="dock-side">停靠位置</Label><NativeSelect id="dock-side" value={config.dockSide} onChange={(event) => onChange({ ...config, dockSide: event.target.value as PulseConfig['dockSide'] })}><option value="right">右侧</option><option value="left">左侧</option><option value="top">顶部</option></NativeSelect></div>
    <div className="field"><Label htmlFor="countdown-mode">圆环数值</Label><NativeSelect id="countdown-mode" value={config.countdownMode} onChange={(event) => onChange({ ...config, countdownMode: event.target.value as PulseConfig['countdownMode'] })}><option value="left">剩余额度</option><option value="used">已用额度</option></NativeSelect></div>
    <div className="field"><Label htmlFor="demo-mode">数据模式</Label><NativeSelect id="demo-mode" value={String(config.demoMode)} onChange={(event) => onChange({ ...config, demoMode: event.target.value === 'true' })}><option value="false">真实数据</option><option value="true">演示数据</option></NativeSelect></div>
  </CardContent></Card>
}
