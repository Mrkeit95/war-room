'use client'

import { useState } from 'react'

type SectionKey = 'general' | 'account' | 'alerts' | 'dashboard' | 'integrations' | 'advanced'

const NAV: { key: SectionKey; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'account', label: 'Account & security' },
  { key: 'alerts', label: 'Alert thresholds' },
  { key: 'dashboard', label: 'Dashboard preferences' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'advanced', label: 'Advanced' },
]

export default function SettingsPage() {
  const [active, setActive] = useState<SectionKey>('general')

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Settings</h1>
        <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>Manage dashboard preferences, integrations, and account</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(item => (
            <div
              key={item.key}
              onClick={() => setActive(item.key)}
              style={{
                padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                fontSize: 13.5,
                color: active === item.key ? 'var(--text)' : 'var(--text-2)',
                background: active === item.key ? 'var(--surface-2)' : 'transparent',
                border: `1px solid ${active === item.key ? 'var(--border)' : 'transparent'}`,
              }}
            >
              {item.label}
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '24px 28px' }}>
          {active === 'general' && (
            <Section title="General" desc="Workspace settings that apply across the dashboard.">
              <Field label="Workspace name" sub="Shown in the sidebar and emails">
                <Input defaultValue="War Room" />
              </Field>
              <Field label="Time zone" sub="Used for dates and morning briefing timing">
                <Select defaultValue="Asia/Bangkok (GMT+7)">
                  <option>Asia/Manila (GMT+8)</option>
                  <option>Asia/Bangkok (GMT+7)</option>
                  <option>Europe/London (GMT+0)</option>
                </Select>
              </Field>
              <Field label="Source mix target (PH share)" sub="Used by the drifting alert">
                <Input defaultValue="25" width={70} suffix="%" />
              </Field>
            </Section>
          )}

          {active === 'account' && (
            <Section title="Account & security" desc="Your sign-in details.">
              <Field label="Email" sub="Used for sign-in and recovery">
                <Input defaultValue="operator@warroom.app" width={320} />
              </Field>
              <Field label="Current password">
                <Input type="password" placeholder="••••••••" />
              </Field>
              <Field label="New password" sub="At least 12 characters">
                <Input type="password" placeholder="Choose new password" />
              </Field>
              <Field label="Confirm new password">
                <Input type="password" placeholder="Re-enter" />
              </Field>
              <FormActions />
            </Section>
          )}

          {active === 'alerts' && (
            <Section title="Alert thresholds" desc="Tune when alerts fire per stage.">
              <Field label="Typeform → Passed" sub="Alert if no movement after">
                <Input defaultValue="3" width={70} suffix="days" />
              </Field>
              <Field label="Pending Interview">
                <Input defaultValue="2" width={70} suffix="days" />
              </Field>
              <Field label="Week 1 Training">
                <Input defaultValue="8" width={70} suffix="days" />
              </Field>
              <Field label="Manager inactivity">
                <Input defaultValue="24" width={70} suffix="hours" />
              </Field>
              <FormActions />
            </Section>
          )}

          {active === 'dashboard' && (
            <Section title="Dashboard preferences" desc="Control what appears and how.">
              <Field label="Default landing view">
                <Select defaultValue="Today">
                  <option>Today</option>
                  <option>This week</option>
                </Select>
              </Field>
              <Field label="Show department cards"><Toggle defaultOn /></Field>
              <Field label="Show source mix tracker"><Toggle defaultOn /></Field>
              <Field label="Auto-archive done items"><Toggle /></Field>
            </Section>
          )}

          {active === 'integrations' && (
            <Section title="Integrations" desc="External system connections.">
              <Field label="Monday.com" sub="Source of all candidate data">
                <Tag tone="warn">Not connected</Tag>
                <Button>Connect</Button>
              </Field>
              <Field label="Sync frequency">
                <Select defaultValue="Every 15 minutes">
                  <option>Every 15 minutes</option>
                  <option>Every hour</option>
                </Select>
              </Field>
              <Field label="Supabase" sub="Database and cache">
                <Tag tone="warn">Not connected</Tag>
                <Button>Connect</Button>
              </Field>
            </Section>
          )}

          {active === 'advanced' && (
            <Section title="Advanced" desc="Destructive actions.">
              <Field label="Export all data"><Button ghost>Export</Button></Field>
              <Field label="Resync everything"><Button ghost>Resync</Button></Field>
              <Field label="Sign out everywhere"><Button danger>Sign out all sessions</Button></Field>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 4 }}>{title}</h3>
      <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 22 }}>{desc}</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  )
}

function Field({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, padding: '14px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{children}</div>
    </div>
  )
}

function Input({ defaultValue, type, placeholder, width, suffix }: { defaultValue?: string; type?: string; placeholder?: string; width?: number; suffix?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        type={type || 'text'}
        defaultValue={defaultValue}
        placeholder={placeholder}
        style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          color: 'var(--text)', padding: '7px 10px',
          borderRadius: 6, fontSize: 13, fontFamily: 'inherit', outline: 'none',
          width: width || 180,
        }}
      />
      {suffix && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{suffix}</span>}
    </div>
  )
}

function Select({ defaultValue, children }: { defaultValue: string; children: React.ReactNode }) {
  return (
    <select defaultValue={defaultValue} style={{
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      color: 'var(--text)', padding: '7px 10px',
      borderRadius: 6, fontSize: 13, fontFamily: 'inherit', outline: 'none',
      minWidth: 200,
    }}>{children}</select>
  )
}

function Toggle({ defaultOn }: { defaultOn?: boolean }) {
  const [on, setOn] = useState(!!defaultOn)
  return (
    <div
      onClick={() => setOn(!on)}
      style={{
        width: 34, height: 20, borderRadius: 10,
        background: on ? 'var(--green)' : 'var(--surface-3)',
        position: 'relative', cursor: 'pointer', transition: 'background 0.15s',
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: on ? 16 : 2,
        width: 16, height: 16, borderRadius: '50%',
        background: 'var(--bg)', transition: 'left 0.15s',
      }} />
    </div>
  )
}

function Button({ children, ghost, danger }: { children: React.ReactNode; ghost?: boolean; danger?: boolean }) {
  const styles: React.CSSProperties = ghost
    ? { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-2)' }
    : danger
    ? { background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--red)' }
    : { background: 'var(--text)', border: '1px solid var(--text)', color: 'var(--bg)' }
  return (
    <button style={{
      padding: '7px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 500,
      fontFamily: 'inherit', cursor: 'pointer', ...styles,
    }}>{children}</button>
  )
}

function Tag({ children, tone }: { children: React.ReactNode; tone: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'ok' ? 'var(--green)' : tone === 'warn' ? 'var(--amber)' : 'var(--red)'
  const bg = tone === 'ok' ? 'rgba(74,222,128,0.10)' : tone === 'warn' ? 'rgba(251,191,36,0.10)' : 'rgba(239,68,68,0.10)'
  return (
    <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 5, background: bg, color }}>
      {children}
    </span>
  )
}

function FormActions() {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
      <Button ghost>Cancel</Button>
      <Button>Save changes</Button>
    </div>
  )
}
