// Detect obviously fake / test submissions by name + email.
// Phone intentionally NOT checked — real users can have repetitive digits.
//
// Returns { isJunk: true, reason } on hit, else { isJunk: false }.

const NAME_SUFFIXES = new Set(['jr','sr','ii','iii','iv','jr.','sr.'])

const KEYROW_RX = /^(asd|asdf|asdfg|asdfgh|asdfghj|qwe|qwer|qwert|qwerty|zxc|zxcv|zxcvb|abc|abcd|abcde|aaa+|bbb+|ccc+|ddd+|eee+|fff+|ggg+|hhh+|iii+|jjj+|kkk+|lll+|mmm+|nnn+|ooo+|ppp+|qqq+|rrr+|sss+|ttt+|uuu+|vvv+|www+|xxx+|yyy+|zzz+|test|testing|tester|hello|hi|hey|dummy|sample|example|foo|bar|baz|lol|haha|hehe|wtf|idk)$/i

const normToken = t => (t || '').toLowerCase().replace(/[.,'"]/g, '')

function distinctChars(s) {
  const set = new Set()
  for (const ch of s.replace(/[\s.\-_+]/g, '')) set.add(ch)
  return set.size
}

export function checkJunk({ name, email } = {}) {
  const n = (name || '').trim()
  if (!n) return { isJunk: true, reason: 'empty name' }

  const tokens = n.split(/\s+/)
  if (tokens.length < 2) return { isJunk: true, reason: 'single-token name' }

  for (const t of tokens) {
    const tn = normToken(t)
    if (!tn) continue
    if (tn.length < 2 && !NAME_SUFFIXES.has(tn)) {
      return { isJunk: true, reason: `single-char name token "${t}"` }
    }
    if (KEYROW_RX.test(tn)) {
      return { isJunk: true, reason: `keyboard-row name token "${t}"` }
    }
  }

  // Two consecutive identical tokens of ≤2 chars ("xy xy", "qq qq"). Longer
  // repeats like "Jun Jun" or "Jing Jing" are real Filipino nicknames so they
  // pass; the long garbage ("aa aa", "dd dd", "haha haha") still fails via the
  // all-one-char and keyboard-row rules below.
  const lower = tokens.map(normToken)
  for (let i = 0; i < lower.length - 1; i++) {
    if (lower[i] && lower[i] === lower[i+1] && lower[i].length <= 2) {
      return { isJunk: true, reason: `repeated 2-char token "${tokens[i]}"` }
    }
  }

  // Name all one character after spaces removed ("aaaa", "ddddd")
  const squashed = n.replace(/\s+/g, '')
  if (squashed.length > 1 && /^(.)\1+$/i.test(squashed)) {
    return { isJunk: true, reason: `all-one-char name "${n}"` }
  }

  // Email checks (only if an email was supplied)
  const e = (email || '').trim().toLowerCase()
  if (e) {
    const at = e.indexOf('@')
    if (at < 1 || at === e.length - 1) return { isJunk: true, reason: `malformed email "${email}"` }
    const local = e.slice(0, at)
    if (local.length < 3) return { isJunk: true, reason: `email local too short "${local}"` }
    if (distinctChars(local) <= 2) return { isJunk: true, reason: `email local has ≤2 distinct chars "${local}"` }
    if (KEYROW_RX.test(local)) return { isJunk: true, reason: `keyboard-row email "${local}"` }
  }

  return { isJunk: false }
}
