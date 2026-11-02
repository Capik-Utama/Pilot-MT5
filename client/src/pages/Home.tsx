import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Check, CircleDot, Copy, Cpu, LogOut, Plus, Radio, RefreshCw, ShieldCheck, Signal, Wallet, Wifi, WifiOff, X, Zap } from "lucide-react";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { MT5_API_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/lib/supabase";

type Action = "auto" | "manual" | "close_buy" | "close_sell" | "close_all";
type Account = {
  id: string; label: string; broker_account_name: string | null; mt5_login: number | null;
  server_name: string | null; currency: string; token_hint: string; is_demo: boolean;
  telemetry_received: boolean; balance: number; equity: number; max_dd_buy: number; max_dd_sell: number;
  running: boolean; ea_mode: "auto" | "manual"; profit: number; floating_profit: number;
  latency_ms: number | null; last_seen_at: string | null; connection_status: "online" | "offline";
  commands: { id: string; action: Action; status: string; result_message: string | null; created_at: string }[];
};

type ConnectionToken = { label: string; token: string };
const actionLabel: Record<Action, string> = { auto: "Auto", manual: "Manual", close_buy: "Close Buy", close_sell: "Close Sell", close_all: "Close All" };

function currency(value: number, code: string) {
  try { return new Intl.NumberFormat("id-ID", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(value); }
  catch { return `${code} ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value)}`; }
}
function age(value: string | null) {
  if (!value) return "belum menerima heartbeat";
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000));
  return seconds < 2 ? "baru saja" : seconds < 60 ? `${seconds} dtk lalu` : `${Math.floor(seconds / 60)} mnt lalu`;
}
function statusLabel(status: string) {
  return ({ queued: "Dalam antrean", delivered: "Dikirim ke EA", accepted: "Diterima EA", succeeded: "Berhasil", failed: "Gagal", expired: "Kedaluwarsa" } as Record<string, string>)[status] ?? status;
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [register, setRegister] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [tokenModal, setTokenModal] = useState<ConnectionToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => { if (active) { setSession(data.session); setAuthLoading(false); } });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  const callApi = useCallback(async (path: string, method = "GET", body?: unknown) => {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error("Sesi login berakhir. Silakan masuk kembali.");
    const response = await fetch(`${MT5_API_URL}?route=${encodeURIComponent(path)}`, {
      method,
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error ?? `Permintaan gagal (${response.status}).`);
    return result;
  }, []);

  const loadAccounts = useCallback(async () => {
    if (!session) return;
    setLoadingAccounts(true);
    try {
      const result = await callApi("/dashboard/accounts");
      setAccounts(result.accounts ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Data akun tidak dapat dimuat.");
    } finally { setLoadingAccounts(false); }
  }, [callApi, session]);

  useEffect(() => {
    if (!session) { setAccounts([]); return; }
    void loadAccounts();
    const timer = window.setInterval(() => void loadAccounts(), 2500);
    return () => window.clearInterval(timer);
  }, [loadAccounts, session]);

  const onlineCount = useMemo(() => accounts.filter((account) => account.connection_status === "online").length, [accounts]);

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setAuthBusy(true); setAuthMessage("");
    try {
      if (register) {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        if (!data.session) setAuthMessage("Pendaftaran diterima. Periksa email untuk mengonfirmasi akun, lalu masuk.");
        else setAuthMessage("Akun berhasil dibuat.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (error) { setAuthMessage(error instanceof Error ? error.message : "Autentikasi gagal."); }
    finally { setAuthBusy(false); }
  };

  const createAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusyAction("create");
    try {
      const result = await callApi("/dashboard/accounts", "POST", { label: accountName.trim() });
      setShowAdd(false); setAccountName(""); setTokenModal({ label: result.account.label, token: result.token });
      await loadAccounts();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Akun koneksi gagal dibuat."); }
    finally { setBusyAction(null); }
  };

  const sendAction = async (account: Account, action: Action) => {
    if (!account.is_demo) { toast.error("Kontrol web hanya tersedia untuk akun demo."); return; }
    if (account.connection_status !== "online") { toast.error("EA harus online untuk menerima perintah."); return; }
    if (action.startsWith("close_") && !window.confirm(`Kirim ${actionLabel[action]} ke EA “${account.label}” pada akun demo? Perintah akan menutup posisi Fast-Grid pada simbol chart ini.`)) return;
    setBusyAction(`${account.id}:${action}`);
    try {
      await callApi(`/dashboard/accounts/${account.id}/commands`, "POST", { action });
      toast.success(`${actionLabel[action]} masuk antrean. Tunggu konfirmasi dari EA.`);
      await loadAccounts();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Perintah tidak dapat dikirim."); }
    finally { setBusyAction(null); }
  };

  const copyToken = async () => {
    if (!tokenModal) return;
    try { await navigator.clipboard.writeText(tokenModal.token); setCopied(true); toast.success("Token disalin."); }
    catch { toast.error("Clipboard tidak tersedia. Salin token secara manual."); }
  };

  if (authLoading) return <main className="pilot-loading"><Activity size={20} /><span>MENYIAPKAN MT5 PILOT</span></main>;

  if (!session) return (
    <main className="pilot-auth-page">
      <a className="pilot-brand" href="/"><span className="pilot-brand-mark"><Activity size={19} /></span><span><strong>MT5 <i>PILOT</i></strong><small>PRIVATE EA WORKSPACE</small></span></a>
      <section className="pilot-auth-card">
        <div className="pilot-kicker"><span /> AKSES PEMILIK · SUPABASE AUTH</div>
        <h1>{register ? "Buat akun privat" : "Masuk ke MT5 Pilot"}</h1>
        <p>Data akun dan perintah hanya dapat diakses oleh sesi Supabase pemilik akun ini.</p>
        <form onSubmit={handleAuth}>
          <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@email.com" /></label>
          <label>Kata sandi<input type="password" autoComplete={register ? "new-password" : "current-password"} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimal 8 karakter" /></label>
          {authMessage && <div className="pilot-auth-message" role="status">{authMessage}</div>}
          <button className="pilot-primary-button" disabled={authBusy}>{authBusy ? "Memproses…" : register ? "Daftar" : "Masuk"}<ArrowUpRight size={16} /></button>
        </form>
        <button className="pilot-auth-switch" onClick={() => { setRegister(!register); setAuthMessage(""); }}>{register ? "Sudah punya akun? Masuk" : "Belum ada akun? Buat akun"}</button>
        <div className="pilot-security"><ShieldCheck size={15} /> Token service-role tidak dikirim ke browser.</div>
      </section>
      <footer className="pilot-auth-footer">MT5 PILOT <span>·</span> KONEKSI AKUN DEMO SAJA</footer>
    </main>
  );

  return (
    <main className="pilot-dashboard">
      <header className="pilot-topbar">
        <a className="pilot-brand" href="/"><span className="pilot-brand-mark"><Activity size={19} /></span><span><strong>MT5 <i>PILOT</i></strong><small>PRIVATE EA WORKSPACE</small></span></a>
        <div className="pilot-top-actions"><span className="pilot-owner-pill"><ShieldCheck size={14} /> LOGIN TERVERIFIKASI</span><button className="pilot-icon-button" title="Keluar" aria-label="Keluar" onClick={() => void supabase.auth.signOut()}><LogOut size={16} /></button></div>
      </header>

      <section className="pilot-main">
        <div className="pilot-heading">
          <div><div className="pilot-kicker"><span /> RUANG KENDALI EA DEMO</div><h1>Ringkasan <em>akun</em></h1><p>Telemetri Fast-Grid dan antrean kontrol. Nilai berasal langsung dari EA.</p></div>
          <div className="pilot-live-status"><span className={onlineCount ? "is-live" : "is-waiting"} /><div><strong>{onlineCount} / {accounts.length} EA ONLINE</strong><small>Segarkan otomatis · 2,5 detik</small></div></div>
        </div>

        <div className="pilot-toolbar"><div><span className="pilot-kicker">KONEKSI MT5</span><h2>Akun EA <b>{String(accounts.length).padStart(2, "0")}</b></h2></div><div className="pilot-toolbar-actions"><button className="pilot-icon-button" title="Segarkan sekarang" onClick={() => void loadAccounts()}><RefreshCw size={15} className={loadingAccounts ? "pilot-spin" : ""} /></button><button className="pilot-add-button" onClick={() => setShowAdd(true)}><Plus size={16} /> Tambah koneksi</button></div></div>

        {accounts.length === 0 && !loadingAccounts ? (
          <section className="pilot-empty"><div className="pilot-empty-icon"><Radio size={24} /></div><div className="pilot-kicker">BELUM ADA KONEKSI</div><h2>Hubungkan EA Fast-Grid</h2><p>Buat token koneksi untuk akun demo. Setelah token dimasukkan ke EA dan WebRequest diizinkan di MT5, saldo, equity, drawdown, profit, dan status EA akan muncul di sini.</p><button className="pilot-add-button" onClick={() => setShowAdd(true)}><Plus size={16} /> Buat token demo</button><small>Belum ada data akun yang dikirim atau disimulasikan.</small></section>
        ) : null}

        <div className="pilot-account-list">
          {accounts.map((account) => {
            const online = account.connection_status === "online";
            const active = account.commands.find((command) => ["queued", "delivered", "accepted"].includes(command.status));
            const disabled = !online || !account.telemetry_received || !account.is_demo || Boolean(active) || busyAction !== null;
            return <article className="pilot-account-card" key={account.id}>
              <div className="pilot-account-header"><div className="pilot-account-title"><span className={`pilot-led ${online ? "online" : "offline"}`} /><div><h3>{account.label}</h3><p>{account.broker_account_name || "Menunggu nama akun dari EA"}{account.mt5_login ? ` · #${account.mt5_login}` : ""}{account.server_name ? ` · ${account.server_name}` : ""}</p></div></div><div className={`pilot-connection ${online ? "online" : "offline"}`}>{online ? <Wifi size={13} /> : <WifiOff size={13} />}{online ? "ONLINE" : "OFFLINE"}</div></div>
              <div className="pilot-account-tags"><span className={account.is_demo ? "demo" : "live"}><ShieldCheck size={12} />{account.is_demo ? "AKUN DEMO" : "AKUN LIVE · KONTROL TERKUNCI"}</span><span className="pilot-mode"><Cpu size={12} /> MODE {account.ea_mode.toUpperCase()}</span><span className="pilot-running"><span className={account.running ? "run" : "stop"} />{account.running ? "RUNNING" : "STOPPED / MANUAL"}</span><span><Signal size={12} />{online && account.latency_ms !== null ? `${account.latency_ms} ms` : "RTT —"}</span><span><CircleDot size={12} />{age(account.last_seen_at)}</span></div>
              <div className="pilot-metrics">
                <div><span><Wallet size={13} /> SALDO</span><strong>{account.telemetry_received ? currency(Number(account.balance), account.currency) : "—"}</strong></div>
                <div><span><Activity size={13} /> EQUITY</span><strong>{account.telemetry_received ? currency(Number(account.equity), account.currency) : "—"}</strong></div>
                <div className="dd-buy"><span><ArrowDownRight size={13} /> MAX DD BUY</span><strong>{account.telemetry_received ? currency(Math.abs(Number(account.max_dd_buy)), account.currency) : "—"}</strong></div>
                <div className="dd-sell"><span><ArrowUpRight size={13} /> MAX DD SELL</span><strong>{account.telemetry_received ? currency(Math.abs(Number(account.max_dd_sell)), account.currency) : "—"}</strong></div>
                <div className="profit"><span><Zap size={13} /> PROFIT HARI INI</span><strong>{account.telemetry_received ? currency(Number(account.profit), account.currency) : "—"}</strong><small>floating {account.telemetry_received ? currency(Number(account.floating_profit), account.currency) : "—"}</small></div>
              </div>
              <div className="pilot-control-box"><div className="pilot-control-title"><span><Radio size={13} /> KONTROL EA</span><span className={active ? "pending" : "ready"}>{active ? statusLabel(active.status) : online ? "SIAP" : "MENUNGGU EA"}</span></div><div className="pilot-controls"><button className={`mode ${account.ea_mode === "manual" ? "selected" : ""}`} disabled={disabled} onClick={() => void sendAction(account, "manual")}>Manual</button><button className={`mode ${account.ea_mode === "auto" ? "selected" : ""}`} disabled={disabled} onClick={() => void sendAction(account, "auto")}>Auto</button><span className="divider" /><button className="close" disabled={disabled} onClick={() => void sendAction(account, "close_buy")}>Close Buy</button><button className="close" disabled={disabled} onClick={() => void sendAction(account, "close_sell")}>Close Sell</button><button className="close-all" disabled={disabled} onClick={() => void sendAction(account, "close_all")}>Close All</button></div>{!account.is_demo && <small className="pilot-lock-note"><AlertTriangle size={13} /> Kontrol hanya tersedia untuk akun demo.</small>}</div>
              {account.commands.length > 0 && <div className="pilot-command-history"><span>PERINTAH TERAKHIR</span>{account.commands.slice(0, 3).map((command) => <div key={command.id}><b>{actionLabel[command.action] ?? command.action}</b><span className={`status-${command.status}`}>{statusLabel(command.status)}</span><small>{command.result_message ?? new Date(command.created_at).toLocaleTimeString("id-ID")}</small></div>)}</div>}
              <footer className="pilot-account-footer"><span>Token EA •••• {account.token_hint}</span><span>{account.is_demo ? "Akun demo" : "Read-only"}</span></footer>
            </article>;
          })}
        </div>
        <section className="pilot-info"><ShieldCheck size={16} /><p>Mode Manual menghentikan pembukaan posisi otomatis; pengaman SL/trailing EA tetap berjalan. Perintah tutup hanya memproses posisi Fast-Grid pada simbol chart EA ini. Uji di demo terlebih dahulu.</p></section>
      </section>

      {showAdd && <div className="pilot-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAdd(false); }}><section className="pilot-modal" role="dialog" aria-modal="true" aria-labelledby="pilot-create-title"><button className="pilot-modal-x" aria-label="Tutup" onClick={() => setShowAdd(false)}><X size={18} /></button><div className="pilot-kicker">KONEKSI BARU · DEMO SAJA</div><h2 id="pilot-create-title">Buat token EA</h2><p>Nama ini membantu membedakan akun di dashboard. Token hanya ditampilkan sekali; jangan bagikan token EA.</p><form onSubmit={createAccount}><label>Label koneksi<input required maxLength={80} value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Contoh: Fast-Grid Demo 01" /></label><div className="pilot-info compact"><ShieldCheck size={14} /><span>Kunci admin Supabase tidak pernah dikirim ke MT5.</span></div><div className="pilot-modal-actions"><button type="button" className="pilot-cancel" onClick={() => setShowAdd(false)}>Batal</button><button className="pilot-add-button" disabled={busyAction === "create"}>{busyAction === "create" ? "Membuat…" : "Buat token"}</button></div></form></section></div>}

      {tokenModal && <div className="pilot-modal-backdrop"><section className="pilot-modal" role="dialog" aria-modal="true" aria-labelledby="pilot-token-title"><div className="pilot-success"><Check size={19} /></div><div className="pilot-kicker">KONEKSI DIBUAT</div><h2 id="pilot-token-title">Masukkan token ini ke EA</h2><p>Token untuk <b>{tokenModal.label}</b> hanya ditampilkan sekali. Simpan dengan aman; jika hilang, buat koneksi baru.</p><div className="pilot-token-box"><code>{tokenModal.token}</code><button aria-label="Salin token" onClick={() => void copyToken()}>{copied ? <Check size={16} /> : <Copy size={16} />}</button></div><div className="pilot-setup"><strong>Pengaturan Fast-Grid</strong><span>SupabaseFunctionUrl =</span><code>{MT5_API_URL}</code><span>EAConnectionToken = token di atas</span><span>MetaTrader → Tools → Options → Expert Advisors → izinkan WebRequest untuk:</span><code>{SUPABASE_URL}</code></div><div className="pilot-modal-actions"><button className="pilot-cancel" onClick={() => void copyToken()}>{copied ? "Token disalin" : "Salin token"}</button><button className="pilot-add-button" onClick={() => setTokenModal(null)}>Saya sudah simpan</button></div></section></div>}
    </main>
  );
}
