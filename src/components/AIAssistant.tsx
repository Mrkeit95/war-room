'use client'

import { useEffect, useRef, useState } from 'react'

type Msg = { role: 'user' | 'assistant'; content: string }

const QUICK_PROMPTS = [
  { label: 'Morning briefing', text: 'Give me a full morning briefing — pipeline, what changed in the last 24h, alerts, and anything I should act on today.' },
  { label: 'Find someone', text: 'Where is ' },
  { label: 'Who is at risk?', text: 'Which candidates are at risk right now and what stage are they in?' },
  { label: 'Board performance', text: 'How are the revenue boards doing this month — running, goal, % to goal, and which is strongest/weakest?' },
  { label: 'Top performers', text: 'Who are the top performers right now — both top-tier candidates and top revenue pages?' },
  { label: 'Stale candidates', text: 'Which candidates have been stuck in a stage too long and need to move?' },
  { label: 'Manager load', text: 'How are the PH section managers loaded? Anyone overloaded or with weak candidates?' },
  { label: "What's new?", text: 'What changed in the last 24 hours — new candidates, stage moves, anything notable?' },
]

const INITIAL_MSG: Msg = {
  role: 'assistant',
  content: "Hi Keit — I'm wired to the live War Room state. I know every candidate, stage, manager, alert, revenue board, and page, plus the org structure and rotation rules.\n\nAsk me anything: \"where is [name]\", \"who's at risk in PH\", \"how is Board 2 doing\", \"what changed since yesterday\", etc.",
}

export default function AIAssistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([INITIAL_MSG])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  async function send(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    const next: Msg[] = [...messages, { role: 'user', content: msg }]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.slice(-12) }),
      })
      const data = await res.json()
      setMessages([...next, { role: 'assistant', content: data.reply || 'No response.' }])
    } catch (e) {
      setMessages([...next, { role: 'assistant', content: `Connection error: ${(e as Error).message}` }])
    }
    setLoading(false)
  }

  function reset() {
    setMessages([INITIAL_MSG])
    setInput('')
  }

  function handleQuickPrompt(p: typeof QUICK_PROMPTS[number]) {
    if (p.text.endsWith(' ')) {
      setInput(p.text)
      inputRef.current?.focus()
    } else {
      send(p.text)
    }
  }

  if (!open) return null

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)',
          zIndex: 90,
        }}
      />
      <aside
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 460, maxWidth: '100vw',
          background: 'var(--canvas)',
          borderLeft: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          zIndex: 100,
          boxShadow: '-12px 0 32px rgba(0,0,0,0.4)',
          fontFamily: 'inherit',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: 'rgba(74,222,128,0.12)',
              border: '1px solid rgba(74,222,128,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/>
                <line x1="10" y1="22" x2="14" y2="22"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>War Room AI</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
                Live · Supabase · Monday · Sheets
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={reset}
              title="New conversation"
              style={{
                width: 28, height: 28, borderRadius: 6,
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--text-3)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'inherit',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9"/>
                <path d="M3 4v5h5"/>
              </svg>
            </button>
            <button
              onClick={onClose}
              title="Close"
              style={{
                width: 28, height: 28, borderRadius: 6,
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--text-3)', cursor: 'pointer',
                fontSize: 14, fontFamily: 'inherit',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role} content={m.content} />
          ))}
          {loading && <TypingBubble />}
          <div ref={bottomRef} />
        </div>

        {/* Quick Prompts (only on first turn) */}
        {messages.length <= 1 && (
          <div style={{ padding: '0 18px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 4 }}>
              Quick actions
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {QUICK_PROMPTS.map(p => (
                <button
                  key={p.label}
                  onClick={() => handleQuickPrompt(p)}
                  style={{
                    fontSize: 11, padding: '5px 10px', borderRadius: 6,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    color: 'var(--text-2)', cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div style={{ padding: 14, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Ask anything about the War Room…"
              disabled={loading}
              style={{
                flex: 1,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                padding: '9px 12px', borderRadius: 8,
                fontSize: 13, fontFamily: 'inherit', outline: 'none',
              }}
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              style={{
                width: 36, height: 36, borderRadius: 8,
                background: input.trim() && !loading ? 'var(--green)' : 'var(--surface)',
                border: '1px solid ' + (input.trim() && !loading ? 'var(--green)' : 'var(--border)'),
                color: input.trim() && !loading ? 'var(--bg)' : 'var(--text-3)',
                cursor: loading ? 'wait' : input.trim() ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'inherit',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

function Bubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const isUser = role === 'user'
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '88%',
          background: isUser ? 'var(--surface-2)' : 'var(--surface)',
          border: '1px solid var(--border)',
          color: isUser ? 'var(--text)' : 'var(--text-2)',
          padding: '9px 12px', borderRadius: 10,
          fontSize: 12.5, lineHeight: 1.55,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}
        dangerouslySetInnerHTML={{ __html: formatMessage(content) }}
      />
    </div>
  )
}

function TypingBubble() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        padding: '10px 14px', borderRadius: 10,
        display: 'flex', gap: 4, alignItems: 'center',
      }}>
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
        <span style={{ fontSize: 11, color: 'var(--text-4)', marginLeft: 6 }}>Pulling live data…</span>
        <style jsx>{`
          @keyframes ai-bounce { 0%,80%,100% { transform: translateY(0); opacity: 0.4 } 40% { transform: translateY(-4px); opacity: 1 } }
        `}</style>
      </div>
    </div>
  )
}

function Dot({ delay }: { delay: number }) {
  return (
    <span style={{
      width: 5, height: 5, borderRadius: '50%', background: 'var(--green)',
      display: 'inline-block',
      animation: `ai-bounce 1s infinite ${delay}ms`,
    }} />
  )
}

// Minimal formatting: **bold**, $123 highlighted green, bullets, and line breaks.
function formatMessage(raw: string): string {
  const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
  return esc(raw)
    .split('\n')
    .map(line => {
      let l = line
      l = l.replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text)">$1</strong>')
      l = l.replace(/`([^`]+)`/g, '<code style="font-family:ui-monospace,monospace;font-size:11.5px;background:var(--surface-2);padding:1px 5px;border-radius:4px">$1</code>')
      l = l.replace(/(\$[0-9][\d,]*(?:\.\d+)?)/g, '<span style="color:var(--green);font-weight:600">$1</span>')
      if (/^[-•*]\s/.test(l)) {
        return `<div style="display:flex;gap:6px;margin:2px 0"><span style="color:var(--green)">•</span><span>${l.slice(2)}</span></div>`
      }
      if (l.trim() === '') return '<div style="height:6px"></div>'
      return `<div>${l}</div>`
    })
    .join('')
}
