import { Zap } from 'lucide-react'
import { formatReset, usageColor } from '@/lib/format'
import type { CountdownMode, Metric } from '@/lib/pulse'
import { ProviderIcon } from './ProviderIcon'

const statusText = { ok: '状态健康', warning: '额度偏紧', critical: '极度告急', limited: '已达限额' }

export function DetailCard({ metric, mode, position, onMouseEnter }: { metric: Metric | null; mode: CountdownMode; position: React.CSSProperties; onMouseEnter: () => void }) {
  if (!metric) return null
  const displayPercent = Math.round(mode === 'left' ? 100 - metric.usedPercent : metric.usedPercent)
  return <section className="detail-card" style={position} aria-label={`${metric.name} 配额详情`} onMouseEnter={onMouseEnter}>
    <header className="card-header"><div className="header-left"><span className="provider-avatar"><ProviderIcon name={metric.icon} /></span><div className="header-titles"><strong className="title">{metric.name}</strong><span className="subtitle">{[metric.plan, metric.primaryQuota?.label || '配额监控'].filter(Boolean).join(' · ')}</span></div></div><span className={`status-badge ${metric.status}`}>{statusText[metric.status]}</span></header>
    <div className="card-hero"><div><div className="hero-number" style={{ color: usageColor(metric.usedPercent) }}>{displayPercent}%</div><div className="hero-sublabel">{mode === 'left' ? '剩余可用配额' : '已消耗配额'}</div></div><div className="hero-right"><div className="stat-row"><span className="label">重置倒计时</span><span className="val">{formatReset(metric.primaryQuota?.resetTime)}</span></div><div className="stat-row"><span className="label">{metric.id === 'codex' ? '积分余额' : '估算开销'}</span><span className="val highlight">{metric.id === 'codex' ? (metric.creditsUnlimited ? '不限量' : metric.creditBalance ?? '未提供') : '未提供'}</span></div></div></div>
    <div className="card-divider" /><h2 className="section-title">配额池明细</h2>
    <div className="breakdown-list">{metric.breakdown?.length ? metric.breakdown.map((item) => { const max = item.max ?? 100; const percent = max > 0 ? Math.min(100, Math.round(item.used / max * 100)) : 0; return <div className="pool-row" key={`${item.name}-${item.reset}`}><div className="pool-meta"><span className="pool-name">{item.name}</span><span className="pool-val">{item.unit === '%' ? `${item.used}%` : `${item.used.toLocaleString()} / ${max.toLocaleString()} ${item.unit ?? ''}`}</span></div>{item.desc && <div className="pool-description">{item.desc}</div>}<div className="pool-bar-track"><div className="pool-bar-fill" style={{ width: `${percent}%`, background: usageColor(metric.usedPercent) }} /></div><div className="pool-reset">重置：{formatReset(item.reset)}</div></div> }) : <p className="empty-detail">暂无配额明细</p>}</div>
    <div className="burnrate-banner"><Zap aria-hidden size={14} /><div><div className="burn-title">{metric.burnRate?.estimateText || '消耗速度评估'}</div><div className="burn-eta">{metric.burnRate?.etaToExhaustion || '暂无消耗速度估计'}</div></div></div>
  </section>
}
