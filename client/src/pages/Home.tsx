import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Clock3,
  Copy,
  Cpu,
  LogOut,
  Plus,
  Radio,
  RefreshCw,
  ShieldCheck,
  Signal,
  Terminal,
  Wallet,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

type CommandAction = "auto" | "manual" | "close_buy" | "close_sell" | "close_all";
const actionLabels: Record<CommandAction, string> = {
  auto: "Auto",
  manual: "Manual",
  close_buy: "Close Buy",
  close_sell: "Close Sell",
  close_all: "Close All",
};

function formatCurrency(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value)}`;
  }
}

function formatAge(ageMs: number | null) {
  if (ageMs === null) return "belum ada heartbeat";
  if (ageMs < 1_000) return "baru saja";
  if (ageMs < 60_000) return `${(ageMs / 1_000).toFixed(1)} dtk lalu`;
  return `${Math.floor(ageMs / 60_000)} mnt lalu`;
}

function commandStatus(status: string) {
  switch (status) {
    case "queued": return "Dalam antrean";
    case "delivered": return "Dikirim ke EA";
    case "accepted": return "Diterima EA";
    case "succeeded": return "Berhasil";
    case "failed": return "Gagal";
    case "expired": return "Kedaluwarsa";
    default: return status;
  }
}

export default function Home() {
  const auth = useAuth();
  const access = trpc.mt5.access.useQuery(undefined, { refetchInterval: 10_000, retry: false });
  const isOwner = Boolean(access.data?.isOwner);
  const accounts = trpc.mt5.listAccounts.useQuery(undefined, {
    enabled: auth.isAuthenticated && isOwner,
    refetchInterval: 1_500,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const utils = trpc.useUtils();
  const createAccount = trpc.mt5.createAccount.useMutation({
    onSuccess: result => {
      setNewToken({ label: result.label, token: result.token });
      setShowAdd(false);
      setForm({ label: "", mt5Login: "", serverName: "", currency: "USD" });
      void utils.mt5.listAccounts.invalidate();
      toast.success("Akun koneksi dibuat. Salin token sekarang.");
    },
    onError: error => toast.error(error.message),
  });
  const queueCommand = trpc.mt5.command.useMutation({
    onSuccess: result => {
      void utils.mt5.listAccounts.invalidate();
      toast.success(`${actionLabels[result.action as CommandAction]} ditambahkan ke antrean EA.`);
    },
    onError: error => toast.error(error.message),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [newToken, setNewToken] = useState<{ label: string; token: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ label: "", mt5Login: "", serverName: "", currency: "USD" });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const accountList = accounts.data ?? [];
  const totals = useMemo(() => {
    const reportingAccounts = accountList.filter(item => item.telemetryReceived);
    const currencies = [...new Set(reportingAccounts.map(item => item.currency))];
    return {
      ...reportingAccounts.reduce((acc, item) => ({
        balance: acc.balance + item.balance,
        equity: acc.equity + item.equity,
        online: acc.online + (item.connectionStatus === "online" ? 1 : 0),
      }), { balance: 0, equity: 0, online: 0 }),
      currency: currencies.length === 1 ? currencies[0] : null,
    };
  }, [accountList]);

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_800);
      toast.success(`${label} disalin.`);
    } catch {
      toast.error("Clipboard tidak tersedia. Silakan salin teks secara manual.");
    }
  };

  const execute = (accountId: string, action: CommandAction) => {
    if (action.startsWith("close_") && !window.confirm(`Kirim perintah ${actionLabels[action]} ke akun ini? EA akan mencoba menutup posisi sesuai jenis yang dipilih.`)) return;
    queueCommand.mutate({ accountId, action });
  };

  if (auth.loading || access.isLoading) {
    return <main className="boot-screen"><div className="boot-mark"><Activity size={18} /></div><span>MENYIAPKAN TERMINAL</span></main>;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Activity size={18} strokeWidth={2.5} /></div>
          <div><div className="brand-name">MT5 <span>PILOT</span></div><div className="brand-caption">PRIVATE EA CONTROL</div></div>
        </div>
        <div className="topbar-right">
          <span className="secure-pill"><ShieldCheck size={13} /> {auth.isAuthenticated && isOwner ? "PEMILIK TERVERIFIKASI" : "AKSES TERBATAS"}</span>
          {auth.isAuthenticated && <button className="icon-button logout" title="Keluar" onClick={() => void auth.logout()}><LogOut size={16} /></button>}
        </div>
      </header>

      <main className="workspace">
        <section className="page-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> RUANG KENDALI PRIBADI</div>
            <h1>Ringkasan <span>Akun</span></h1>
            <p className="heading-sub">Pantau kondisi EA dan kirim instruksi per akun.</p>
          </div>
          <div className="system-status">
            <span className="pulse-dot" />
            <div><strong>{auth.isAuthenticated && isOwner ? `${totals.online} / ${accountList.length} ONLINE` : "MENUNGGU AKSES"}</strong><small>Sinkronisasi dashboard · 1,5 dtk</small></div>
          </div>
        </section>

        {!auth.isAuthenticated ? (
          <section className="access-card login-card">
            <div className="access-icon"><ShieldCheck size={21} /></div>
            <div className="access-copy"><h2>Masuk ke terminal privat</h2><p>Login dengan akun Manus pemilik untuk melihat akun dan mengirim kontrol ke EA.</p></div>
            <Button className="primary-action" onClick={() => startLogin()}>Login pemilik <Zap size={15} /></Button>
          </section>
        ) : !access.data?.ownerConfigured ? (
          <section className="access-card setup-card">
            <div className="access-icon warning-icon"><AlertTriangle size={21} /></div>
            <div className="access-copy"><div className="eyebrow">AKSES TERKUNCI</div><h2>Tetapkan identitas pemilik</h2><p>Dashboard menolak akses kontrol sampai <code>OWNER_OPEN_ID</code> diatur. ID di bawah adalah identitas sesi Anda; masukkan sebagai environment variable proyek agar hanya akun ini yang dapat membuka kontrol.</p>
              {auth.user?.openId && <div className="owner-id-row"><code>{auth.user.openId}</code><button className="copy-small" onClick={() => void copyText(auth.user!.openId, "ID pemilik")}>{copied ? <Check size={14} /> : <Copy size={14} />} Salin ID</button></div>}
              <small className="security-note">Jangan jadikan proyek publik. Tetapkan visibilitas proyek ke owner-only sebelum penggunaan.</small>
            </div>
          </section>
        ) : !isOwner ? (
          <section className="access-card"><div className="access-icon warning-icon"><ShieldCheck size={21} /></div><div className="access-copy"><h2>Akses ditolak</h2><p>Sesi ini bukan identitas pemilik yang dikonfigurasi. Tidak ada data akun atau kontrol yang dibuka.</p></div></section>
        ) : (
          <>
            <section className="summary-strip">
              <div className="summary-item"><span className="summary-icon"><Wallet size={17} /></span><div><small>TOTAL SALDO</small><strong>{totals.currency ? formatCurrency(totals.balance, totals.currency) : accountList.length ? "Per akun" : "—"}</strong></div></div>
              <div className="summary-separator" />
              <div className="summary-item"><span className="summary-icon cyan"><Activity size={17} /></span><div><small>TOTAL EQUITY</small><strong>{totals.currency ? formatCurrency(totals.equity, totals.currency) : accountList.length ? "Per akun" : "—"}</strong></div></div>
              <div className="summary-separator" />
              <div className="summary-item"><span className="summary-icon green"><Wifi size={17} /></span><div><small>EA TERHUBUNG</small><strong>{totals.online}<em> / {accountList.length} akun</em></strong></div></div>
              <div className="summary-end"><span className={`live-indicator ${totals.online === 0 ? "waiting-feed" : ""}`}><span /> {totals.online > 0 ? "LIVE FEED" : "MENUNGGU EA"}</span></div>
            </section>

            <div className="section-heading">
              <div><div className="eyebrow">PORTOFOLIO TERHUBUNG</div><h2>Akun MT5 <span className="count-badge">{accountList.length.toString().padStart(2, "0")}</span></h2></div>
              <div className="section-actions"><button className="icon-button refresh-button" title="Segarkan" onClick={() => void accounts.refetch()}><RefreshCw size={15} className={accounts.isFetching ? "spin" : ""} /></button><Button className="add-button" onClick={() => setShowAdd(true)}><Plus size={16} /> Tambah akun</Button></div>
            </div>

            {accounts.isError && <div className="notice error-notice"><AlertTriangle size={15} /> Data akun tidak dapat dimuat. Periksa koneksi database lalu coba lagi.</div>}

            {!accounts.isError && accountList.length === 0 && (
              <section className="empty-state">
                <div className="empty-graphic"><div className="empty-ring ring-one" /><div className="empty-ring ring-two" /><div className="empty-core"><Radio size={25} /></div></div>
                <div className="eyebrow">BELUM ADA KONEKSI</div><h3>Hubungkan EA pertama Anda</h3><p>Buat akun koneksi untuk mendapatkan token EA. Saldo dan status akan muncul setelah EA mengirim heartbeat pertamanya.</p>
                <Button className="add-button" onClick={() => setShowAdd(true)}><Plus size={16} /> Buat koneksi EA</Button>
                <div className="empty-foot"><span><span className="tiny-dot" /> Menunggu EA</span><span>Data aktual saja · tanpa simulasi</span></div>
              </section>
            )}

            <div className="account-stack">
              {accountList.map(account => {
                const activeCommand = account.commands.find(command => ["queued", "delivered", "accepted"].includes(command.status));
                const online = account.connectionStatus === "online";
                const hasData = account.telemetryReceived;
                const lastSeenAge = account.lastSeenAt ? Math.max(0, now - new Date(account.lastSeenAt).getTime()) : null;
                return (
                  <article className={`account-card ${online ? "is-online" : "is-offline"}`} key={account.id}>
                    <div className="account-topline"><div className="account-id"><span className={`connection-led ${online ? "led-online" : "led-offline"}`} /><div><h3>{account.label}</h3><p>{account.mt5Login ? `#${account.mt5Login}` : "Login belum diisi"}{account.serverName ? ` · ${account.serverName}` : ""}</p></div></div>
                      <div className={`status-chip ${online ? "status-online" : "status-offline"}`}>{online ? <><Wifi size={13} /> TERHUBUNG</> : <><WifiOff size={13} /> OFFLINE</>}</div>
                    </div>
                    <div className="metric-grid">
                      <div className="metric-cell"><span><Wallet size={13} /> SALDO</span><strong>{hasData ? formatCurrency(account.balance, account.currency) : "—"}</strong></div>
                      <div className="metric-cell"><span><Activity size={13} /> EQUITY</span><strong>{hasData ? formatCurrency(account.equity, account.currency) : "—"}</strong></div>
                      <div className="metric-cell dd-buy"><span><ArrowDownToLine size={13} /> MAX DD BUY</span><strong>{hasData ? account.maxDdBuyPct.toFixed(2) : "—"}{hasData && <small>%</small>}</strong></div>
                      <div className="metric-cell dd-sell"><span><ArrowUpFromLine size={13} /> MAX DD SELL</span><strong>{hasData ? account.maxDdSellPct.toFixed(2) : "—"}{hasData && <small>%</small>}</strong></div>
                    </div>
                    <div className="account-meta">
                      <span className={`running-label ${online && hasData && account.running ? "running" : "stopped"}`}><span className="running-dot" />{online && hasData ? (account.running ? "RUNNING" : "STOPPED") : "STATUS TIDAK TERSEDIA"}</span>
                      <span className="mode-label"><Cpu size={13} /> MODE <b>{online ? account.eaMode.toUpperCase() : "—"}</b></span>
                      <span className="latency-label"><Signal size={13} /> {online && hasData && account.latencyMs !== null ? `${account.latencyMs} ms RTT` : online ? "RTT —" : "LINK TERPUTUS"}</span>
                      <span className={`update-label ${!online ? "stale" : ""}`}><Clock3 size={13} /> {formatAge(lastSeenAge)}</span>
                    </div>
                    <div className="command-panel">
                      <div className="command-title"><span><Terminal size={13} /> KONTROL EA</span>{activeCommand ? <span className="pending-pill"><span /> {commandStatus(activeCommand.status)}</span> : <span className="ready-pill">SIAP</span>}</div>
                      <div className="control-row">
                        <Button className={`mode-button ${online && hasData && account.eaMode === "auto" ? "mode-active" : ""}`} disabled={!online || !hasData || Boolean(activeCommand) || queueCommand.isPending} onClick={() => execute(account.id, "auto")}>Auto</Button>
                        <Button className={`mode-button ${online && hasData && account.eaMode === "manual" ? "mode-active" : ""}`} disabled={!online || !hasData || Boolean(activeCommand) || queueCommand.isPending} onClick={() => execute(account.id, "manual")}>Manual</Button>
                        <span className="control-divider" />
                        <Button className="close-button" disabled={!online || !hasData || Boolean(activeCommand) || queueCommand.isPending} onClick={() => execute(account.id, "close_buy")}>Close Buy</Button>
                        <Button className="close-button" disabled={!online || !hasData || Boolean(activeCommand) || queueCommand.isPending} onClick={() => execute(account.id, "close_sell")}>Close Sell</Button>
                        <Button className="close-all-button" disabled={!online || !hasData || Boolean(activeCommand) || queueCommand.isPending} onClick={() => execute(account.id, "close_all")}>Close All</Button>
                      </div>
                    </div>
                    <div className="account-footer"><span><span className="footer-dot" /> Token •••• {account.tokenHint}</span><span>EA update {formatAge(lastSeenAge)}</span></div>
                    {account.commands.length > 0 && <div className="command-history"><span className="history-label">PERINTAH TERAKHIR · JEJAK STATUS</span>{account.commands.slice(0, 3).map(command => <div className="history-entry" key={command.id}><div className="history-row"><span>{actionLabels[command.action as CommandAction] ?? command.action}</span><span className={`history-status status-${command.status}`}>{commandStatus(command.status)}</span><time>{new Date(command.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></div><div className="event-trail">{command.events.slice(-4).map((event, index) => <span key={`${command.id}-${event.status}-${index}`} title={event.message ?? undefined}><i className={`event-dot status-${event.status}`} />{commandStatus(event.status)} <time>{new Date(event.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></span>)}</div></div>)}</div>}
                  </article>
                );
              })}
            </div>
          </>
        )}

        <section className="integration-note"><div className="note-icon"><Signal size={15} /></div><div><strong>Koneksi EA langsung ke server</strong><p>EA mengirim telemetry dan mengambil perintah secara periodik. Tombol menampilkan antrean dan hasil dari EA; aplikasi tidak mengklaim order berhasil sebelum EA mengonfirmasikannya.</p></div><span className="note-pulse" /></section>
        <footer className="page-footer"><span><Terminal size={13} /> MT5 PILOT <i>·</i> PRIVATE CONTROL PLANE</span><span>ENKRIPSI TOKEN EA <b>AKTIF</b></span></footer>
      </main>

      {showAdd && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowAdd(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="add-account-title"><button className="modal-close" aria-label="Tutup" onClick={() => setShowAdd(false)}><X size={17} /></button><div className="eyebrow">KONFIGURASI KONEKSI</div><h2 id="add-account-title">Tambah akun MT5</h2><p className="modal-description">Buat kredensial koneksi untuk satu EA. Kata sandi broker tidak diperlukan dan jangan dimasukkan.</p><form onSubmit={event => { event.preventDefault(); createAccount.mutate({ label: form.label.trim(), mt5Login: form.mt5Login.trim() || undefined, serverName: form.serverName.trim() || undefined, currency: form.currency.trim().toUpperCase() || "USD" }); }}>
        <label>Nama akun <input required maxLength={80} placeholder="Contoh: Live 01" value={form.label} onChange={event => setForm({ ...form, label: event.target.value })} /></label>
        <div className="form-row"><label>Login MT5 <span>opsional</span><input maxLength={32} placeholder="Nomor akun" value={form.mt5Login} onChange={event => setForm({ ...form, mt5Login: event.target.value })} /></label><label>Mata uang <input maxLength={8} placeholder="USD" value={form.currency} onChange={event => setForm({ ...form, currency: event.target.value })} /></label></div>
        <label>Nama server broker <span>opsional</span><input maxLength={96} placeholder="Contoh: Broker-Live" value={form.serverName} onChange={event => setForm({ ...form, serverName: event.target.value })} /></label>
        <div className="modal-security"><ShieldCheck size={15} /><span>Token dibuat acak, disimpan sebagai hash, dan hanya ditampilkan sekali setelah akun dibuat.</span></div>
        <div className="modal-actions"><Button type="button" className="cancel-button" onClick={() => setShowAdd(false)}>Batal</Button><Button type="submit" className="add-button" disabled={createAccount.isPending}>{createAccount.isPending ? <RefreshCw size={15} className="spin" /> : <Plus size={15} />} Buat token EA</Button></div>
      </form></section></div>}

      {newToken && <div className="modal-backdrop"><section className="modal-card token-modal" role="dialog" aria-modal="true" aria-labelledby="token-title"><div className="token-success"><Check size={19} /></div><div className="eyebrow">KONEKSI DIBUAT</div><h2 id="token-title">Simpan token EA</h2><p className="modal-description">Token untuk <strong>{newToken.label}</strong> hanya tampil sekarang. Salin dan simpan di konfigurasi EA Anda. Jangan bagikan ke siapa pun.</p><div className="token-box"><code>{newToken.token}</code><button aria-label="Salin token" onClick={() => void copyText(newToken.token, "Token EA")}>{copied ? <Check size={16} /> : <Copy size={16} />}</button></div><div className="modal-endpoint"><span>ENDPOINT TELEMETRY</span><code>{window.location.origin}/api/mt5/telemetry</code><button onClick={() => void copyText(`${window.location.origin}/api/mt5/telemetry`, "URL telemetry")}>{copied ? <Check size={14} /> : <Copy size={14} />}</button></div><div className="modal-security"><AlertTriangle size={15} /><span>Dashboard hanya menyimpan hash. Jika token hilang, buat koneksi baru; token lama tidak dapat dilihat lagi.</span></div><div className="modal-actions full"><Button className="add-button" onClick={() => setNewToken(null)}>Selesai</Button></div></section></div>}
    </div>
  );
}
