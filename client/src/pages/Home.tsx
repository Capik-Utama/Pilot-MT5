import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, Check, CircleDot, Copy, Cpu, LogOut, Plus, Radio, RefreshCw, Search, ShieldCheck, Signal, Wallet, Wifi, WifiOff, X, Zap } from "lucide-react";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { MT5_API_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/lib/supabase";

type Action = "auto" | "manual" | "buy" | "sell" | "close_buy" | "close_sell" | "close_all" | "reset";
type Account = {
  id: string; label: string; broker_account_name: string | null; mt5_login: number | null;
  server_name: string | null; currency: string; token_hint: string; is_demo: boolean;
  is_cent_account: boolean; display_currency: DisplayCurrency; display_rate: number;
  telemetry_received: boolean; balance: number; equity: number; max_dd_buy: number; max_dd_sell: number;
  basket_sl_set: number; basket_sl_type: "money" | "percent"; daily_target_set: number; max_float_buy: number; max_float_sell: number;
  running_float: number; open_positions: number; ea_status: string;
  running: boolean; ea_mode: "auto" | "manual"; profit: number; floating_profit: number;
  latency_ms: number | null; last_seen_at: string | null; connection_status: "online" | "offline";
  commands: { id: string; action: Action; status: string; result_message: string | null; created_at: string }[];
};

type ConnectionToken = { label: string; token: string };
const actionLabel: Record<Action, string> = { auto: "Auto", manual: "Manual", buy: "BUY", sell: "SELL", close_buy: "Close Buy", close_sell: "Close Sell", close_all: "Close All", reset: "Reset All" };

type DisplayCurrency = "USD" | "CENT" | "IDR";
function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
function currency(value: number, accountCurrency: string, mode: DisplayCurrency = "USD", displayRate = 17000, isCentAccount = false) {
  const centsAccount = isCentAccount || /USC|CENT/i.test(accountCurrency);
  const usdValue = centsAccount ? value / 100 : value;
  if (mode === "CENT") return `${new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(usdValue * 100)} USC`;
  if (mode === "IDR") return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(usdValue * displayRate)} IDR`;
  return `${new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(usdValue)} USD`;
}
function age(value: string | null) {
  if (!value) return "belum menerima heartbeat";
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000));
  return seconds < 2 ? "baru saja" : seconds < 60 ? `${seconds} dtk lalu` : `${Math.floor(seconds / 60)} mnt lalu`;
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
  const [currencyModes, setCurrencyModes] = useState<Record<string, DisplayCurrency>>({});
  const [accountSearch, setAccountSearch] = useState("");
  const [connectionFilter, setConnectionFilter] = useState<"all" | "online" | "offline">("all");

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
  const filteredAccounts = useMemo(() => {
    const query = accountSearch.trim().toLocaleLowerCase();
    return accounts.filter((account) => {
      const searchable = [account.label, account.broker_account_name, account.server_name, account.mt5_login?.toString()]
        .filter(Boolean).join(" ").toLocaleLowerCase();
      const matchesSearch = !query || searchable.includes(query);
      const matchesConnection = connectionFilter === "all" || account.connection_status === connectionFilter;
      return matchesSearch && matchesConnection;
    });
  }, [accounts, accountSearch, connectionFilter]);

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
    if (account.connection_status !== "online") { toast.error("EA harus online untuk menerima perintah."); return; }
    if (action.startsWith("close_") && !window.confirm(`Kirim ${actionLabel[action]} ke EA “${account.label}”? Perintah akan menutup posisi Fast-Grid pada simbol chart ini.`)) return;
    if ((action === "buy" || action === "sell") && !window.confirm(`Kirim order ${actionLabel[action]} manual ke ${account.label} (${account.broker_account_name ?? "akun MT5"})? EA akan menggunakan lot awal yang dikonfigurasi di MT5.`)) return;
    if (action === "reset" && !window.confirm(`Reset semua status target, statistik harian, dan trailing EA untuk ${account.label}? Jika Auto aktif dan waktu trading valid, EA dapat langsung membuka basket baru.`)) return;
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
      <footer className="pilot-auth-footer">MT5 PILOT <span>·</span> KONEKSI AKUN MT5</footer>
    </main>
  );

  return (
    <main className="pilot-dashboard">
      <header className="pilot-topbar">
        <a className="pilot-brand" href="/"><span className="pilot-brand-mark"><Activity size={19} /></span><span><strong>MT5 <i>PILOT</i></strong><small>PRIVATE EA WORKSPACE</small></span></a>
        <div className="pilot-top-actions"><div className="pilot-header-controls"><label className="pilot-header-search pilot-search-box"><Search size={13} aria-hidden="true" /><input type="search" value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} placeholder="Cari panel EA…" aria-label="Cari akun EA" /></label><select className="pilot-filter-select" value={connectionFilter} onChange={(event) => setConnectionFilter(event.target.value as "all" | "online" | "offline")} aria-label="Filter status koneksi"><option value="all">Semua</option><option value="online">Online</option><option value="offline">Offline</option></select><div className="pilot-header-status"><span className={onlineCount ? "is-live" : "is-waiting"} /><strong>{onlineCount}/{accounts.length} EA ONLINE</strong></div><button className="pilot-icon-button pilot-header-refresh" title="Segarkan sekarang" aria-label="Segarkan sekarang" onClick={() => void loadAccounts()}><RefreshCw size={13} className={loadingAccounts ? "pilot-spin" : ""} /></button><button className="pilot-add-button pilot-header-add" onClick={() => setShowAdd(true)}><Plus size={15} /> Tambah EA</button></div><div className="pilot-user-actions"><span className="pilot-owner-pill"><ShieldCheck size={14} /> LOGIN TERVERIFIKASI</span><button className="pilot-icon-button" title="Keluar" aria-label="Keluar" onClick={() => void supabase.auth.signOut()}><LogOut size={16} /></button></div></div>
      </header>

      <section className="pilot-main">
        {accounts.length === 0 && !loadingAccounts ? (
          <section className="pilot-empty"><div className="pilot-empty-icon"><Radio size={24} /></div><div className="pilot-kicker">BELUM ADA KONEKSI</div><h2>Hubungkan EA Fast-Grid</h2><p>Buat token koneksi untuk akun MT5. Setelah token dimasukkan ke EA dan WebRequest diizinkan di MT5, saldo, equity, drawdown, profit, dan status EA akan muncul di sini.</p><small>Belum ada data akun yang dikirim atau disimulasikan.</small></section>
        ) : null}

        <div className="pilot-account-list">
          {filteredAccounts.map((account) => {
            const online = account.connection_status === "online";
            const active = account.commands.find((command) => ["queued", "delivered", "accepted"].includes(command.status));
            const disabled = !online || !account.telemetry_received || Boolean(active) || busyAction !== null;
            const displayMode = currencyModes[account.id] ?? account.display_currency ?? "USD";
            const showMoney = (value: unknown) => {
              if (!account.telemetry_received) return "—";
              const parsed = finiteNumber(value);
              return parsed === null ? "INVALID" : currency(parsed, account.currency, displayMode, account.display_rate, account.is_cent_account);
            };
            const basketSlValue = finiteNumber(account.basket_sl_set);
            const basketSlDisplay = !account.telemetry_received ? "Basket SL Set: —" : account.basket_sl_type === "percent"
              ? basketSlValue === null ? "INVALID" : `-${basketSlValue.toFixed(1)}%`
              : `-${showMoney(account.basket_sl_set)}`;
            return <div className="pilot-account-shell" key={account.id}><div className="pilot-account-identity">{account.label} · {account.broker_account_name || "Menunggu nama akun dari EA"}{account.mt5_login ? ` · #${account.mt5_login}` : ""}{account.server_name ? ` · ${account.server_name}` : ""}</div><article className="pilot-account-card">
              <div className="pilot-account-header"><div className="pilot-account-title"><span className={`pilot-led ${online ? "online" : "offline"}`} /><div><h3>*Grid_By_Capik*</h3></div></div><div className={`pilot-connection ${online ? "online" : "offline"}`}>{online ? <Wifi size={13} /> : <WifiOff size={13} />}{online ? "ONLINE" : "OFFLINE"}</div></div>
              <div className="pilot-panel-buttons">
                <div className="pilot-button-row"><button className={`mode ${account.ea_mode === "manual" ? "selected" : ""}`} disabled={disabled} onClick={() => void sendAction(account, "manual")}>MANUAL</button><button className={`mode ${account.ea_mode === "auto" ? "selected" : ""}`} disabled={disabled} onClick={() => void sendAction(account, "auto")}>AUTO</button></div>
                <div className="pilot-button-row"><button className="trade-sell" disabled={disabled} onClick={() => void sendAction(account, "sell")}>SELL</button><button className="trade-buy" disabled={disabled} onClick={() => void sendAction(account, "buy")}>BUY</button></div>
                <div className="pilot-button-row"><button className="close-sell" disabled={disabled} onClick={() => void sendAction(account, "close_sell")}>Close Sell</button><button className="close-buy" disabled={disabled} onClick={() => void sendAction(account, "close_buy")}>Close Buy</button></div>
                <button className="close-all" disabled={disabled} onClick={() => void sendAction(account, "close_all")}>CLOSE ALL</button>
                <div className="pilot-currency-row" aria-label="Mata uang tampilan">{(["USD", "IDR", "CENT"] as const).map((mode) => <button key={mode} className={displayMode === mode ? "selected" : ""} onClick={() => setCurrencyModes((current) => ({ ...current, [account.id]: mode }))}>{mode}</button>)}</div>
              </div>
              <div className="pilot-metrics pilot-panel-metrics">
                <div className="metric-sl"><span>Basket SL Set</span><strong>{basketSlDisplay}</strong></div>
                <div className="metric-target"><span>Daily Target Set</span><strong>{account.telemetry_received ? showMoney(account.daily_target_set) : "—"}</strong></div>
                <div className="metric-float-buy"><span>Max Float Buy</span><strong>{showMoney(account.max_float_buy)}</strong></div>
                <div className="metric-float-sell"><span>Max Float Sell</span><strong>{showMoney(account.max_float_sell)}</strong></div>
                <div className="metric-running"><span>Running</span><strong>{showMoney(account.running_float)}</strong></div>
                <div className={`metric-profit ${account.profit >= 0 ? "profit-positive" : "profit-negative"}`}><span>Profit</span><strong>{showMoney(account.profit)}</strong></div>
                <div className="metric-status"><span>Status</span><strong>{account.telemetry_received ? account.ea_status || (account.running ? "ACTIVE" : "MANUAL") : "MENUNGGU EA"}</strong></div>
              </div>
              <div className="pilot-reset-row"><button className="reset-all" disabled={disabled} onClick={() => void sendAction(account, "reset")}>RESET ALL</button></div>
              <footer className="pilot-account-footer"><span>Token EA •••• {account.token_hint}</span><span>{account.is_demo ? "Akun demo" : "Akun real"}</span></footer>
            </article></div>;
          })}
        </div>
        {accounts.length > 0 && filteredAccounts.length === 0 && <div className="pilot-search-empty"><span>Tidak ada panel EA yang cocok dengan pencarian atau filter.</span><button onClick={() => { setAccountSearch(""); setConnectionFilter("all"); }}>Hapus filter</button></div>}
        <section className="pilot-info"><ShieldCheck size={16} /><p>Mode Manual menghentikan pembukaan posisi otomatis; pengaman SL/trailing EA tetap berjalan. Perintah tutup hanya memproses posisi Fast-Grid pada simbol chart EA ini. Pastikan pengaturan risiko sesuai sebelum mengirim perintah.</p></section>
      </section>

      {showAdd && <div className="pilot-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAdd(false); }}><section className="pilot-modal" role="dialog" aria-modal="true" aria-labelledby="pilot-create-title"><button className="pilot-modal-x" aria-label="Tutup" onClick={() => setShowAdd(false)}><X size={18} /></button><div className="pilot-kicker">KONEKSI BARU</div><h2 id="pilot-create-title">Buat token EA</h2><p>Nama ini membantu membedakan akun di dashboard. Token hanya ditampilkan sekali; jangan bagikan token EA.</p><form onSubmit={createAccount}><label>Label koneksi<input required maxLength={80} value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Contoh: Fast-Grid MT5 01" /></label><div className="pilot-info compact"><ShieldCheck size={14} /><span>Kunci admin Supabase tidak pernah dikirim ke MT5.</span></div><div className="pilot-modal-actions"><button type="button" className="pilot-cancel" onClick={() => setShowAdd(false)}>Batal</button><button className="pilot-add-button" disabled={busyAction === "create"}>{busyAction === "create" ? "Membuat…" : "Buat token"}</button></div></form></section></div>}

      {tokenModal && <div className="pilot-modal-backdrop"><section className="pilot-modal" role="dialog" aria-modal="true" aria-labelledby="pilot-token-title"><div className="pilot-success"><Check size={19} /></div><div className="pilot-kicker">KONEKSI DIBUAT</div><h2 id="pilot-token-title">Masukkan token ini ke EA</h2><p>Token untuk <b>{tokenModal.label}</b> hanya ditampilkan sekali. Simpan dengan aman; jika hilang, buat koneksi baru.</p><div className="pilot-token-box"><code>{tokenModal.token}</code><button aria-label="Salin token" onClick={() => void copyToken()}>{copied ? <Check size={16} /> : <Copy size={16} />}</button></div><div className="pilot-setup"><strong>Pengaturan Fast-Grid</strong><span>SupabaseFunctionUrl =</span><code>{MT5_API_URL}</code><span>EAConnectionToken = token di atas</span><span>MetaTrader → Tools → Options → Expert Advisors → izinkan WebRequest untuk:</span><code>{SUPABASE_URL}</code></div><div className="pilot-modal-actions"><button className="pilot-cancel" onClick={() => void copyToken()}>{copied ? "Token disalin" : "Salin token"}</button><button className="pilot-add-button" onClick={() => setTokenModal(null)}>Saya sudah simpan</button></div></section></div>}
    </main>
  );
}
