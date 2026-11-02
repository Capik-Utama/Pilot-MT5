import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Activity,
  CircleDot,
  LockKeyhole,
  Radio,
  ShieldCheck,
  Waves,
} from "lucide-react";

const upcomingFeatures = [
  {
    number: "01",
    icon: Activity,
    title: "Pantau akun MT5",
    description: "Ringkasan akun dan informasi trading akan disiapkan setelah fondasi beranda selesai.",
    status: "DIRANCANG",
  },
  {
    number: "02",
    icon: Radio,
    title: "Status koneksi EA",
    description: "Status koneksi akan ditampilkan berdasarkan data aktual dari EA, bukan data contoh.",
    status: "DIRANCANG",
  },
  {
    number: "03",
    icon: LockKeyhole,
    title: "Kontrol yang aman",
    description: "Fitur kontrol akan dikembangkan bertahap dengan akses privat dan konfirmasi yang jelas.",
    status: "DIRANCANG",
  },
];

export default function Home() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <a className="landing-brand" href="#beranda" aria-label="MT5 Pilot, beranda">
          <span className="landing-brand-mark"><Activity size={19} strokeWidth={2.2} /></span>
          <span className="landing-brand-copy">
            <strong>MT5 <i>PILOT</i></strong>
            <small>PRIVATE EA WORKSPACE</small>
          </span>
        </a>
        <nav className="landing-nav" aria-label="Navigasi utama">
          <a href="#tentang">Tentang</a>
          <a href="#rencana">Rencana fitur</a>
          <a className="landing-nav-cta" href="#rencana">Lihat tahap berikutnya <ArrowUpRight size={15} /></a>
        </nav>
      </header>

      <section className="landing-hero landing-container" id="beranda">
        <div className="landing-hero-copy">
          <div className="landing-eyebrow"><span className="landing-eyebrow-line" /> TAHAP 01 <span className="landing-eyebrow-divider">/</span> BERANDA
          </div>
          <h1>Trading lebih terarah.<br /><span>Dimulai dari fondasi.</span></h1>
          <p className="landing-intro">
            MT5 Pilot sedang dibangun sebagai ruang kerja pribadi untuk EA MetaTrader 5.
            Untuk saat ini, nikmati berandanya dulu—fitur akan hadir sedikit demi sedikit.
          </p>
          <div className="landing-actions">
            <a className="landing-primary-button" href="#rencana">Jelajahi rencana <ArrowRight size={16} /></a>
            <a className="landing-secondary-link" href="#tentang">Tentang proyek <ArrowDownRight size={15} /></a>
          </div>
          <div className="landing-assurance"><ShieldCheck size={15} /><span>Dirancang privat. Tidak ada data akun simulasi.</span></div>
        </div>

        <div className="landing-visual" aria-label="Pratinjau tahap awal MT5 Pilot">
          <div className="landing-visual-grid" />
          <div className="visual-orbit orbit-outer" />
          <div className="visual-orbit orbit-inner" />
          <div className="visual-signal signal-one" />
          <div className="visual-signal signal-two" />
          <svg className="visual-wave" viewBox="0 0 520 190" fill="none" aria-hidden="true">
            <path d="M2 122H91L117 121L137 110L156 132L178 78L195 147L217 104L237 114H299L318 106L337 113H387L408 67L429 150L449 101L468 119H518" stroke="url(#wave-gradient)" strokeWidth="2" />
            <path d="M2 122H91L117 121L137 110L156 132L178 78L195 147L217 104L237 114H299L318 106L337 113H387L408 67L429 150L449 101L468 119H518V190H2V122Z" fill="url(#fill-gradient)" />
            <defs>
              <linearGradient id="wave-gradient" x1="2" y1="112" x2="518" y2="112" gradientUnits="userSpaceOnUse">
                <stop stopColor="#2dd4bf" stopOpacity=".1" />
                <stop offset=".52" stopColor="#2dd4bf" />
                <stop offset="1" stopColor="#71e1dc" stopOpacity=".18" />
              </linearGradient>
              <linearGradient id="fill-gradient" x1="260" y1="67" x2="260" y2="190" gradientUnits="userSpaceOnUse">
                <stop stopColor="#2dd4bf" stopOpacity=".12" />
                <stop offset="1" stopColor="#2dd4bf" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
          <div className="visual-card">
            <div className="visual-card-top"><span className="visual-card-label"><Waves size={14} /> MT5 / PILOT</span><span className="visual-live"><i /> TAHAP AWAL</span></div>
            <div className="visual-card-title">Satu langkah pada satu waktu.</div>
            <div className="visual-card-subtitle">Ruang kerja EA pribadi Anda sedang disiapkan.</div>
            <div className="visual-divider" />
            <div className="visual-progress-label"><span>BERANDA</span><span>AKTIF</span></div>
            <div className="visual-progress"><span /></div>
            <div className="visual-card-footer"><CircleDot size={13} /> FITUR LAIN MENYUSUL BERTAHAP</div>
          </div>
          <div className="visual-index">MP—01 <span>FOUNDATION</span></div>
          <div className="visual-decoration visual-decoration-a">01</div>
          <div className="visual-decoration visual-decoration-b">MT5</div>
        </div>
      </section>

      <section className="landing-about landing-container" id="tentang">
        <div className="landing-section-label"><span>01</span><span className="landing-section-rule" /> TENTANG MT5 PILOT</div>
        <div className="landing-about-content">
          <h2>Tempat untuk membangun<br />pengalaman EA yang <em>lebih jelas.</em></h2>
          <p>Proyek ini dimulai dari beranda sederhana. Setelah ini, kita bisa mengembangkan pemantauan akun, status koneksi, dan kontrol EA satu per satu—dengan fokus pada informasi yang nyata dan akses yang aman.</p>
        </div>
      </section>

      <section className="landing-roadmap landing-container" id="rencana">
        <div className="landing-roadmap-heading">
          <div>
            <div className="landing-section-label"><span>02</span><span className="landing-section-rule" /> LANGKAH BERIKUTNYA</div>
            <h2>Beranda dulu.<br /><span>Fitur menyusul.</span></h2>
          </div>
          <p>Belum ada koneksi atau kontrol trading di halaman ini. Inilah gambaran fitur yang bisa kita bangun bersama nanti.</p>
        </div>
        <div className="landing-feature-grid">
          {upcomingFeatures.map(({ number, icon: Icon, title, description, status }) => (
            <article className="landing-feature-card" key={number}>
              <div className="landing-feature-top"><span>{number}</span><Icon size={18} /></div>
              <h3>{title}</h3>
              <p>{description}</p>
              <div className="landing-feature-status"><span />{status}</div>
            </article>
          ))}
        </div>
      </section>

      <footer className="landing-footer landing-container">
        <a className="landing-footer-brand" href="#beranda"><Activity size={15} /> MT5 <i>PILOT</i></a>
        <span>SEBUAH PROYEK YANG DIBANGUN BERTAHAP</span>
        <a className="landing-back-top" href="#beranda">Kembali ke atas <ArrowUpRight size={14} /></a>
      </footer>
    </main>
  );
}
