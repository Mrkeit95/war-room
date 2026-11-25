// Country allowlist for ad intake.
// Allowed: United States, United Kingdom, all of Europe (EU + Balkans + Eastern +
// Switzerland/Norway/Iceland etc), Philippines.
// Blocked: Africa, South Asia (India, Pakistan, Bangladesh, Sri Lanka, Nepal,
// Afghanistan, Bhutan, Maldives), and anything else not on the allowlist.
//
// Returns { allowed: bool, reason?: string, tag?: string }.

const ALLOWED_COUNTRIES = new Set([
  // Philippines
  'philippines','pilipinas','pinoy','ph',
  // US
  'united states','united states of america','usa','u.s.a','u.s.a.','u.s.','us','america',
  // UK
  'united kingdom','uk','u.k.','great britain','britain','england','scotland','wales','northern ireland','gb',
  // EU 27
  'austria','belgium','bulgaria','croatia','cyprus','czech republic','czechia','czech','denmark',
  'estonia','finland','france','germany','greece','hungary','ireland','italy','latvia','lithuania',
  'luxembourg','malta','netherlands','holland','poland','portugal','romania','slovakia','slovenia',
  'spain','sweden',
  // Non-EU Europe
  'switzerland','norway','iceland','liechtenstein','monaco','andorra','san marino','vatican','vatican city',
  // Balkans
  'serbia','montenegro','bosnia','bosnia and herzegovina','bosnia & herzegovina','herzegovina',
  'north macedonia','macedonia','albania','kosovo',
  // Eastern Europe
  'ukraine','moldova','belarus',
  // Umbrella strings Meta sometimes sends
  'europe','european union','eu',
])

// Country codes (longest first for prefix matching) for the allowlist, used
// only when the explicit country field is missing or says "Other".
const ALLOWED_PHONE_PREFIXES = [
  // 4-digit (none really, but leave slot)
  // 3-digit
  '358','353','351','352','356','357','359','370','371','372','380','373','375',
  '420','421','385','386','387','389','381','382','383','355','354','377','376','423',
  '420',
  // 2-digit
  '30','31','32','33','34','36','39','40','41','43','44','45','46','47','48','49','63',
  // 1-digit
  '1', // US + Canada — accept Canadian collateral; blocking +1 would also lose US
]
// Sort longest first so we don't accidentally match '1' before '18' etc.
ALLOWED_PHONE_PREFIXES.sort((a, b) => b.length - a.length)

const norm = s => (s || '').toString().normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z\s&.]/g,' ').replace(/\s+/g,' ').trim()

export function checkCountry({ country, phone } = {}) {
  const c = norm(country)
  if (c && ALLOWED_COUNTRIES.has(c)) return { allowed: true }

  // Country field may be a phone number (seen in data: "country: 639951960120")
  if (/^\+?\d+$/.test((country || '').replace(/\s/g, ''))) {
    const digits = (country || '').replace(/\D/g, '')
    for (const p of ALLOWED_PHONE_PREFIXES) {
      if (digits.startsWith(p)) return { allowed: true, reason: `phone-in-country-field matched +${p}` }
    }
  }

  // Phone fallback for missing/"Other"/"N/A" country
  const unknown = !c || c === 'other' || c === 'n a' || c === 'na' || c === 'unknown'
  if (unknown) {
    const digits = (phone || '').toString().replace(/\D/g, '').replace(/^0+/, '')
    if (digits) {
      for (const p of ALLOWED_PHONE_PREFIXES) {
        if (digits.startsWith(p)) return { allowed: true, reason: `phone matched +${p} (country was "${country || 'empty'}")` }
      }
      return { allowed: false, reason: `country="${country || 'empty'}", phone +${digits.slice(0, 4)}… not in allowlist`, tag: `BLOCKED (phone +${digits.slice(0, 3)})` }
    }
    return { allowed: false, reason: `country="${country || 'empty'}" and no phone to fall back on`, tag: `BLOCKED (no country, no phone)` }
  }

  // Explicit country but not allowed → block
  return { allowed: false, reason: `country "${country}" not in allowlist`, tag: `BLOCKED (country: ${country})` }
}
