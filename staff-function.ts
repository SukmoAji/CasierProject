// Supabase > Edge Functions > Deploy a new function > Via Editor > nama: staff
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // hanya owner yang boleh memanggil
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: u } = await sb.auth.getUser(jwt)
  if (!u?.user) return json({ error: 'Belum login' }, 401)
  const { data: me } = await sb.from('profiles').select('role,active').eq('id', u.user.id).maybeSingle()
  if (me?.role !== 'owner' || !me.active) return json({ error: 'Hanya owner yang boleh' }, 403)

  const { action, name, full_name, branch_id, role, password, id, active } = await req.json()

  if (action === 'create') {
    if (!/^[a-z0-9]{3,20}$/.test(name ?? '')) return json({ error: 'ID login: 3-20 huruf kecil/angka, tanpa spasi' }, 400)
    if ((password ?? '').length < 6) return json({ error: 'Password minimal 6 karakter' }, 400)
    const R = ['staff', 'manager', 'viewer'].includes(role) ? role : 'staff'
    if (R !== 'viewer' && !branch_id) return json({ error: 'Pilih cabang' }, 400)
    const email = `${name}@staff.eyang.id`
    let uid: string
    let fresh = true
    const created = await sb.auth.admin.createUser({ email, password, email_confirm: true })
    if (created.error) {
      if (!/already|registered|exists/i.test(created.error.message)) return json({ error: created.error.message }, 400)
      // akun login lama masih ada di Authentication (mis. profil dihapus manual) -> pulihkan
      const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const old = list?.users.find((x) => x.email === email)
      if (!old) return json({ error: created.error.message }, 400)
      const { data: p } = await sb.from('profiles').select('id').eq('id', old.id).maybeSingle()
      if (p) return json({ error: 'ID login sudah dipakai' }, 400)
      const { error: e3 } = await sb.auth.admin.updateUserById(old.id, { password, ban_duration: 'none', email_confirm: true })
      if (e3) return json({ error: e3.message }, 400)
      uid = old.id
      fresh = false
    } else {
      uid = created.data.user.id
    }
    const { error: e2 } = await sb.from('profiles').insert({ id: uid, name, full_name: (full_name ?? '').trim() || name, role: R, branch_id: R === 'viewer' ? null : branch_id })
    if (e2) { if (fresh) await sb.auth.admin.deleteUser(uid); return json({ error: e2.message }, 400) }
    return json({ ok: true })
  }

  // aksi lain hanya berlaku untuk akun staf
  const { data: t } = await sb.from('profiles').select('role').eq('id', id).maybeSingle()
  if (!t || t.role === 'owner') return json({ error: 'Akun owner tidak bisa diubah' }, 400)

  if (action === 'set_password') {
    if ((password ?? '').length < 6) return json({ error: 'Password minimal 6 karakter' }, 400)
    const { error } = await sb.auth.admin.updateUserById(id, { password })
    return error ? json({ error: error.message }, 400) : json({ ok: true })
  }
  if (action === 'set_active') {
    await sb.from('profiles').update({ active: !!active }).eq('id', id)
    const { error } = await sb.auth.admin.updateUserById(id, { ban_duration: active ? 'none' : '876000h' })
    return error ? json({ error: error.message }, 400) : json({ ok: true })
  }
  if (action === 'set_branch') {
    if (!branch_id) return json({ error: 'Pilih cabang' }, 400)
    const { error } = await sb.from('profiles').update({ branch_id }).eq('id', id)
    return error ? json({ error: error.message }, 400) : json({ ok: true })
  }
  if (action === 'set_role') {
    if (!['staff', 'manager', 'viewer'].includes(role)) return json({ error: 'Peran tidak dikenal' }, 400)
    if (role !== 'viewer' && !branch_id) return json({ error: 'Pilih cabang' }, 400)
    const { error } = await sb.from('profiles').update({ role, branch_id: role === 'viewer' ? null : branch_id }).eq('id', id)
    return error ? json({ error: error.message }, 400) : json({ ok: true })
  }
  if (action === 'set_name') {
    if (!(full_name ?? '').trim()) return json({ error: 'Nama tidak boleh kosong' }, 400)
    const { error } = await sb.from('profiles').update({ full_name: full_name.trim() }).eq('id', id)
    return error ? json({ error: error.message }, 400) : json({ ok: true })
  }
  return json({ error: 'Aksi tidak dikenal' }, 400)
})
