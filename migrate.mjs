const MON = process.env.MONDAY_API_TOKEN
const PH  = process.env.MONDAY_BOARD_ID_PH
const HP  = 18431281189
async function M(q, tries=3) {
  for (let i=0;i<tries;i++) { try { return await (await fetch('https://api.monday.com/v2', { method:'POST', headers:{'Authorization':MON,'Content-Type':'application/json','API-Version':'2024-10'}, body: JSON.stringify({query:q}) })).json() } catch(e) { if (i===tries-1) throw e; await new Promise(x=>setTimeout(x,1500*(i+1))) } }
}
async function full(boardId, gid) {
  const rows=[]; let cursor=null
  while (true) {
    const q = cursor ? `{ next_items_page(limit:500, cursor:"${cursor}") { cursor items { id name } } }` : `{ boards(ids:[${boardId}]) { groups(ids:["${gid}"]) { items_page(limit:500) { cursor items { id name } } } } }`
    const r = await M(q)
    const page = cursor?r.data?.next_items_page:r.data?.boards?.[0]?.groups?.[0]?.items_page
    rows.push(...(page?.items??[])); cursor=page?.cursor; if (!cursor) break
  }
  return rows
}

async function migrateGroup(label, sourceGid, targetGid) {
  console.log(`\n═══ ${label} ═══`)
  const items = await full(PH, sourceGid)
  console.log(`  ${items.length} items to migrate`)
  let ok=0, failed=0
  for (const it of items) {
    const r = await M(`mutation { move_item_to_board(item_id: ${it.id}, board_id: ${HP}, group_id: "${targetGid}") { id } }`)
    if (r.errors) { console.log(`  ✗ ${it.name} (${it.id}): ${JSON.stringify(r.errors)}`); failed++ }
    else ok++
    if ((ok + failed) % 50 === 0) console.log(`    … ${ok + failed}/${items.length} done (${ok} ok, ${failed} failed)`)
    await new Promise(x=>setTimeout(x,100))
  }
  console.log(`  ✓ ${ok} migrated, ✗ ${failed} failed`)
  return { ok, failed }
}

const G_OFF = 'new_group_mkmfp0tz'
const G_BL  = 'group_mknjjdjm'

const t0 = Date.now()
const off = await migrateGroup('OFFBOARDED', G_OFF, G_OFF)
const bl  = await migrateGroup('BLACKLISTED', G_BL, G_BL)
console.log(`\n═══ MIGRATION COMPLETE (${((Date.now()-t0)/1000).toFixed(1)}s) ═══`)
console.log(`  OFFBOARDED:  ${off.ok} migrated, ${off.failed} failed`)
console.log(`  BLACKLISTED: ${bl.ok} migrated, ${bl.failed} failed`)
console.log(`  TOTAL:       ${off.ok + bl.ok} migrated`)
