from pathlib import Path
import re
p = Path('/home/ubuntu/pilotmt5/client/src/pages/Home.tsx')
s = p.read_text()

def replace_once(old, new, label):
    global s
    n = s.count(old)
    if n != 1:
        raise SystemExit(f'{label}: expected 1 match, got {n}')
    s = s.replace(old, new, 1)

replace_once('import type { Session } from "@supabase/supabase-js";\nimport { MT5_API_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/lib/supabase";\n', 'import { useAuth } from "@/_core/hooks/useAuth";\nimport { startLogin } from "@/const";\n', 'imports')
replace_once('type CreatedUserCredential = { username: string; password: string };\n', '', 'credential type')
replace_once('function authEmailForIdentifier(identifier: string) {\n  const normalized = identifier.trim().toLowerCase();\n  return normalized.includes("@") ? normalized : `${normalized}@pilot-mt5.local`;\n}\n\n', '', 'old auth identifier')
replace_once('  const { theme, setTheme } = useTheme();\n  const [session, setSession] = useState<Session | null>(null);\n  const [authLoading, setAuthLoading] = useState(true);\n  const [email, setEmail] = useState("");\n  const [password, setPassword] = useState("");\n  const [authBusy, setAuthBusy] = useState(false);\n  const [authMessage, setAuthMessage] = useState("");\n  const [accessRole, setAccessRole] = useState<AccessRole | null>(null);\n  const [ownerId, setOwnerId] = useState<string | null>(null);\n', '  const { theme, setTheme } = useTheme();\n  const { user, loading: authLoading, logout } = useAuth();\n  const [authMessage, setAuthMessage] = useState("");\n  const [accessRole, setAccessRole] = useState<AccessRole | null>(null);\n  const [ownerId, setOwnerId] = useState<string | null>(null);\n  const [accessLoading, setAccessLoading] = useState(true);\n  const [accessMessage, setAccessMessage] = useState("");\n', 'auth state')
replace_once('  const sessionRefreshRef = useRef<Promise<string | null> | null>(null);\n', '', 'session refresh ref')
replace_once('  const [deletePassword, setDeletePassword] = useState("");\n', '  const [deleteConfirmation, setDeleteConfirmation] = useState("");\n', 'delete confirmation state')
replace_once('  const [newUserName, setNewUserName] = useState("");\n  const [newUserPassword, setNewUserPassword] = useState("");\n', '  const [newUserEmail, setNewUserEmail] = useState("");\n', 'user invite form state')
replace_once('  const [creatingUser, setCreatingUser] = useState(false);\n  const [createdUserCredential, setCreatedUserCredential] = useState<CreatedUserCredential | null>(null);\n', '  const [creatingUser, setCreatingUser] = useState(false);\n', 'created user state')

# Replace Supabase auth subscription and bearer-token request code.
pattern = re.compile(r'  useEffect\(\(\) => \{\n    let active = true;\n    void supabase\.auth\.getSession\(\).*?\n  \}, \[\]\);\n\n  const saveRefreshSettings', re.S)
new = '''  const saveRefreshSettings'''
s, n = pattern.subn(new, s)
if n != 1: raise SystemExit(f'auth effect: expected 1 match, got {n}')

pattern = re.compile(r'  const refreshAccessToken = useCallback\(async \(\) => \{.*?\n  \}, \[refreshAccessToken\]\);\n\n  const loadAccess', re.S)
new = '''  const callApi = useCallback(async (path: string, method = "GET", body?: unknown) => {
    const serializedBody = body === undefined ? undefined : JSON.stringify(body);
    const routeUrl = `/api/mt5${path}`;
    const headers: Record<string, string> = {};
    if (serializedBody !== undefined) headers["Content-Type"] = "application/json";
    const requestHeaderText = Object.entries(headers).map(([key, value]) => `${key}: ${value}\\r\\n`).join("");
    const uploadedBytes = new TextEncoder().encode(`${method} ${routeUrl}\\r\\n${requestHeaderText}\\r\\n${serializedBody ?? ""}`).byteLength;
    const response = await fetch(routeUrl, {
      method,
      credentials: "same-origin",
      headers,
      ...(serializedBody === undefined ? {} : { body: serializedBody }),
    });
    const responseHeaderText = Array.from(response.headers.entries()).map(([key, value]) => `${key}: ${value}\\r\\n`).join("");
    const downloadedBodyBytes = await response.clone().arrayBuffer().then((buffer) => buffer.byteLength).catch(() => 0);
    const downloadedBytes = new TextEncoder().encode(responseHeaderText).byteLength + downloadedBodyBytes;
    networkTraffic.current.push({ at: Date.now(), uploadedBytes, downloadedBytes });
    const result = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401) void logout();
      throw new Error(result?.error ?? `Permintaan gagal (${response.status}).`);
    }
    return result;
  }, [logout]);

  const loadAccess'''
s, n = pattern.subn(new, s)
if n != 1: raise SystemExit(f'callApi block: expected 1 match, got {n}')

pattern = re.compile(r'  const loadAccess = useCallback\(async \(\) => \{.*?\n  \}, \[callApi, session\]\);', re.S)
new = '''  const loadAccess = useCallback(async () => {
    if (!user) {
      setAccessRole(null);
      setOwnerId(null);
      setAccessMessage("");
      setAccessLoading(false);
      return;
    }
    setAccessLoading(true);
    setAccessMessage("");
    try {
      const result = await callApi("/dashboard/session");
      setAccessRole(result.role as AccessRole);
      setOwnerId(result.ownerId as string);
    } catch (error) {
      setAccessRole(null);
      setOwnerId(null);
      setAccessMessage(error instanceof Error ? error.message : "Hak akses belum diberikan oleh owner.");
    } finally {
      setAccessLoading(false);
    }
  }, [callApi, user]);'''
s, n = pattern.subn(new, s)
if n != 1: raise SystemExit(f'loadAccess block: expected 1 match, got {n}')

replace_once('  const loadAccounts = useCallback(async () => {\n    if (!session) return;\n', '  const loadAccounts = useCallback(async () => {\n    if (!user) return;\n', 'loadAccounts guard')
replace_once('  }, [callApi, session]);\n\n  useEffect(() => {\n    if (!session || !ownerId) { if (!session) setAccounts([]); return; }\n    let debounceTimer: number | undefined;\n    const refresh = () => {\n      window.clearTimeout(debounceTimer);\n      debounceTimer = window.setTimeout(() => void loadAccounts(), 120);\n    };\n    void loadAccounts();\n    const fallbackTimer = window.setInterval(() => void loadAccounts(), refreshSeconds * 1_000);\n    const channel = supabase\n      .channel(`mt5-dashboard:${session.user.id}:${ownerId}`)\n      .on("postgres_changes", { event: "*", schema: "public", table: "mt5_accounts", filter: `owner_id=eq.${ownerId}` }, refresh)\n      .on("postgres_changes", { event: "*", schema: "public", table: "mt5_commands", filter: `owner_id=eq.${ownerId}` }, refresh)\n      .subscribe();\n    return () => {\n      window.clearTimeout(debounceTimer);\n      window.clearInterval(fallbackTimer);\n      void supabase.removeChannel(channel);\n    };\n  }, [loadAccounts, ownerId, refreshSeconds, session]);', '  }, [callApi, user]);\n\n  useEffect(() => {\n    if (!user || !ownerId) { if (!user) setAccounts([]); return; }\n    void loadAccounts();\n    const fallbackTimer = window.setInterval(() => void loadAccounts(), refreshSeconds * 1_000);\n    return () => window.clearInterval(fallbackTimer);\n  }, [loadAccounts, ownerId, refreshSeconds, user]);', 'polling and realtime effect')

pattern = re.compile(r'  const handleAuth = async \(event: FormEvent<HTMLFormElement>\) => \{.*?\n  \};\n\n  const loadActivityLogs', re.S)
new = '''  const handleLogin = () => {
    setAuthMessage("");
    try {
      startLogin();
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Login Manus tidak dapat dimulai.");
    }
  };

  const loadActivityLogs'''
s, n = pattern.subn(new, s)
if n != 1: raise SystemExit(f'handleAuth: expected 1 match, got {n}')
replace_once('  const loadActivityLogs = useCallback(async () => {\n    if (!session) return;\n', '  const loadActivityLogs = useCallback(async () => {\n    if (!user) return;\n', 'activity logs guard')
replace_once('  }, [callApi, session]);\n\n  useEffect(() => { if (activePage === "logs")', '  }, [callApi, user]);\n\n  useEffect(() => { if (activePage === "logs")', 'activity logs deps')
replace_once('    setCreatedUserCredential(null);\n', '', 'clear created credentials')

pattern = re.compile(r'  const createReadOnlyUser = async \(event: FormEvent<HTMLFormElement>\) => \{.*?\n  \};\n\n  const copyTemporaryPassword = async \(\) => \{.*?\n  \};\n\n  const trackBackgroundCommand', re.S)
new = '''  const createReadOnlyUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canWrite || creatingUser) return;
    const invitedEmail = newUserEmail.trim().toLowerCase();
    setCreatingUser(true);
    try {
      await callApi("/dashboard/users", "POST", {
        email: invitedEmail, accessRole: newUserRole,
        accountIds: newUserRole === "staff" ? selectedStaffAccountIds : [],
      });
      setNewUserEmail("");
      setNewUserRole("read_only");
      setSelectedStaffAccountIds([]);
      const refreshed = await callApi("/dashboard/users");
      setManagedUsers(refreshed.users ?? []);
      toast.success(`Akses ${newUserRole === "staff" ? "staff" : "read-only"} diberikan kepada ${invitedEmail}.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Akses pengguna gagal diberikan."); }
    finally { setCreatingUser(false); }
  };

  const revokeManagedUser = async (emailToRevoke: string) => {
    if (!canWrite || !window.confirm(`Cabut akses MT5 Pilot untuk ${emailToRevoke}?`)) return;
    try {
      await callApi(`/dashboard/users/${encodeURIComponent(emailToRevoke)}`, "DELETE");
      setManagedUsers((current) => current.filter((item) => item.email !== emailToRevoke));
      toast.success(`Akses ${emailToRevoke} dicabut.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Akses pengguna gagal dicabut."); }
  };

  const trackBackgroundCommand'''
s, n = pattern.subn(new, s)
if n != 1: raise SystemExit(f'user creation block: expected 1 match, got {n}')

s = s.replace('setDeletePassword("");', 'setDeleteConfirmation("");')
replace_once('    if (!canWrite || !editingAccount || !deletePassword || savingPollInterval) return;\n', '    if (!canWrite || !editingAccount || deleteConfirmation.trim().toUpperCase() !== "HAPUS" || savingPollInterval) return;\n', 'delete guard')
replace_once('      const result = await callApi(`/dashboard/accounts/${accountId}`, "DELETE", { password: deletePassword });\n', '      const result = await callApi(`/dashboard/accounts/${accountId}`, "DELETE", { confirm: "HAPUS" });\n', 'delete payload')

# Replace login and gate rendering.
pattern = re.compile(r'  if \(!session\) return \(.*?\n  \);\n\n  return \(\n    <main className="pilot-dashboard"', re.S)
new = '''  if (!user) return (
    <main className="pilot-auth-page" data-theme={theme}>
      <a className="pilot-brand" href="/"><span className="pilot-brand-mark"><Activity size={19} /></span><span><strong>MT5 <i>PILOT</i></strong><small>PRIVATE EA WORKSPACE</small></span></a>
      <section className="pilot-auth-card">
        <div className="pilot-kicker"><span /> LOGIN AMAN · MANUS OAUTH</div>
        <h1>Masuk ke MT5 Pilot</h1>
        <p>Gunakan akun Manus yang sudah didaftarkan owner. Akses dashboard dibatasi berdasarkan role dan akun.</p>
        {authMessage && <div className="pilot-auth-message" role="status">{authMessage}</div>}
        <button className="pilot-primary-button" type="button" onClick={handleLogin}>Masuk dengan Manus <ArrowUpRight size={16} /></button>
        <div className="pilot-security"><ShieldCheck size={15} /> Tidak ada password aplikasi yang disimpan di dashboard.</div>
      </section>
      <footer className="pilot-auth-footer">MT5 PILOT <span>·</span> KONEKSI AKUN MT5</footer>
    </main>
  );

  if (accessLoading) return <main className="pilot-loading"><Activity size={20} /><span>MEMERIKSA AKSES MT5 PILOT</span></main>;
  if (!accessRole) return (
    <main className="pilot-auth-page" data-theme={theme}>
      <a className="pilot-brand" href="/"><span className="pilot-brand-mark"><Activity size={19} /></span><span><strong>MT5 <i>PILOT</i></strong><small>PRIVATE EA WORKSPACE</small></span></a>
      <section className="pilot-auth-card">
        <div className="pilot-kicker"><span /> AKSES BELUM DIBERIKAN</div>
        <h1>Hubungi owner</h1>
        <p>{accessMessage || "Email akun Manus ini belum terdaftar di MT5 Pilot. Minta owner menambahkan akses untuk email yang sama."}</p>
        <button className="pilot-primary-button" type="button" onClick={() => void logout()}>Keluar <LogOut size={16} /></button>
      </section>
    </main>
  );

  return (
    <main className="pilot-dashboard"'''
s, n = pattern.subn(new, s)
if n != 1: raise SystemExit(f'login render: expected 1 match, got {n}')

replace_once('onClick={() => void supabase.auth.signOut()}', 'onClick={() => void logout()}', 'logout button')
replace_once('Kunci admin Supabase tidak pernah dikirim ke MT5.', 'Token koneksi hanya dikirim ke EA yang Anda pilih; jangan bagikan token.', 'add EA copy')
replace_once('Saat EA tersambung, AUTO akan dijalankan satu kali dan dapat mulai membuka posisi sesuai konfigurasi risiko. Simpan token dengan aman.', 'Token hanya ditampilkan sekali. Simpan sebelum menutup dialog. Sebelum menghubungkan EA, pastikan akun MT5, konfigurasi risiko, dan mode trading benar.', 'token modal safety')
replace_once('<span>SupabaseFunctionUrl =</span><code>{MT5_API_URL}</code><span>EAConnectionToken = token di atas</span><span>MetaTrader → Tools → Options → Expert Advisors → izinkan WebRequest untuk:</span><code>{SUPABASE_URL}</code>', '<span>PilotApiBaseUrl =</span><code>{typeof window !== "undefined" ? `${window.location.origin}/api/mt5` : "/api/mt5"}</code><span>EAConnectionToken = token di atas</span><span>MetaTrader → Tools → Options → Expert Advisors → izinkan WebRequest untuk:</span><code>{typeof window !== "undefined" ? window.location.origin : "HTTPS URL Manus"}</code>', 'EA setup URL')
replace_once('KONFIGURASI REMOTE · SUPABASE', 'KONFIGURASI REMOTE · MANUS', 'config label')
replace_once('Sandi login {session?.user.email && <span>({session.user.email})</span>}<input type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} placeholder="Masukkan sandi login untuk konfirmasi" />', 'Konfirmasi (ketik HAPUS) {user.email && <span>· {user.email}</span>}<input type="text" autoComplete="off" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} placeholder="HAPUS" />', 'delete confirm UI')
replace_once('disabled={!deletePassword || deletingAccount || savingConfig || savingPollInterval || savingAccountLabel}', 'disabled={deleteConfirmation.trim().toUpperCase() !== "HAPUS" || deletingAccount || savingConfig || savingPollInterval || savingAccountLabel}', 'delete button disable')

# Replace invitation form and credentials display with email-based Manus access.
old = '{createdUserCredential && <div className="pilot-created-credential"><strong>Akun berhasil dibuat</strong><span>Nama pengguna: <b>{createdUserCredential.username}</b></span><span>Password pengguna:</span><code>{createdUserCredential.password}</code><button type="button" className="pilot-cancel" onClick={() => void copyTemporaryPassword()}><Copy size={14} /> Salin kata sandi</button></div>}<form className="pilot-user-create-form" onSubmit={createReadOnlyUser}><label>Nama pengguna<input type="text" autoComplete="off" required minLength={3} maxLength={40} pattern="[A-Za-z0-9._-]+" value={newUserName} onChange={(event) => setNewUserName(event.target.value)} placeholder="contoh: staff01" /></label><label>Password<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} placeholder="Minimal 8 karakter" /></label><label>Role'
new = '<form className="pilot-user-create-form" onSubmit={createReadOnlyUser}><label>Email akun Manus<input type="email" autoComplete="off" required maxLength={320} value={newUserEmail} onChange={(event) => setNewUserEmail(event.target.value)} placeholder="nama@contoh.com" /></label><label>Role'
replace_once(old, new, 'user form fields')
replace_once('Read-only hanya dapat melihat dashboard. Staff dapat menjalankan tombol pada kartu akun yang dipilih, tetapi tidak dapat mengubah parameter EA, pengaturan, atau pengguna.', 'Tambahkan email akun Manus yang akan digunakan pengguna saat login. Read-only hanya dapat melihat; staff hanya dapat menjalankan tombol pada akun yang Anda pilih. Role dan assignment diperiksa di server.', 'user manager explainer')
replace_once('`Buat akun ${newUserRole === "staff" ? "staff" : "read-only"}`', '`Beri akses ${newUserRole === "staff" ? "staff" : "read-only"}`', 'invite CTA')
replace_once('managedUsers.map((managedUser) => <div key={managedUser.user_id}><span>{managedUser.email}<small className="pilot-managed-scope">{managedUser.access_role === "staff" ? `STAFF · ${managedUser.account_labels?.join(", ") || "Tanpa akun"}` : "READ-ONLY · semua akun (lihat saja)"}</small></span><small>{new Date(managedUser.created_at).toLocaleDateString("id-ID")}</small></div>)', 'managedUsers.map((managedUser) => <div key={managedUser.user_id}><span>{managedUser.email}<small className="pilot-managed-scope">{managedUser.access_role === "staff" ? `STAFF · ${managedUser.account_labels?.join(", ") || "Tanpa akun"}` : "READ-ONLY · semua akun (lihat saja)"}</small></span><small>{new Date(managedUser.created_at).toLocaleDateString("id-ID")}</small><button type="button" className="pilot-delete-button" onClick={() => void revokeManagedUser(managedUser.email)}>Cabut akses</button></div>)', 'revoke UI')

# Remove any remaining Supabase session symbols and stale auth labels.
for forbidden in ('supabase', 'session', 'deletePassword', 'newUserName', 'newUserPassword', 'createdUserCredential', 'SUPABASE_', 'MT5_API_URL'):
    if forbidden in s:
        print(f'WARNING: remaining token {forbidden}')
p.write_text(s)
print(f'Updated {p}, {len(s)} bytes')
