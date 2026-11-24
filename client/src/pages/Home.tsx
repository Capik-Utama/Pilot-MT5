import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Activity,
  ArrowDown,
  ArrowDownRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  CircleDot,
  ClipboardList,
  Copy,
  Cpu,
  LogOut,
  Menu,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Signal,
  UserRound,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { getSessionAuthorizationHeaders } from "@/const";
import { API_ORIGIN, apiUrl } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/contexts/ThemeContext";

type Action =
  | "auto"
  | "manual"
  | "buy"
  | "sell"
  | "close_buy"
  | "close_sell"
  | "close_all"
  | "reset";
type EaConfigValue = number | boolean | "";
type EaConfig = Record<string, EaConfigValue>;
type Account = {
  id: string;
  label: string;
  broker_account_name: string | null;
  mt5_login: number | null;
  server_name: string | null;
  currency: string;
  token_hint: string;
  is_cent_account: boolean;
  display_currency: DisplayCurrency;
  display_rate: number;
  telemetry_received: boolean;
  balance: number;
  equity: number;
  max_dd_buy: number;
  max_dd_sell: number;
  basket_sl_set: number;
  basket_sl_type: "money" | "percent";
  daily_target_set: number;
  max_float_buy: number;
  max_float_sell: number;
  running_float: number;
  open_positions: number;
  ea_status: string;
  running: boolean;
  ea_mode: "auto" | "manual";
  profit: number;
  floating_profit: number;
  latency_ms: number | null;
  last_seen_at: string | null;
  connection_status: "online" | "offline";
  telemetry_interval_ms: number;
  poll_interval_ms: number;
  ea_config?: EaConfig | null;
  commands: {
    id: string;
    action: Action;
    status: string;
    result_message: string | null;
    created_at: string;
    expires_at: string;
  }[];
};
type CardMetric = Pick<
  Account,
  "id" | "running_float" | "profit" | "telemetry_received"
>;

type ConnectionToken = { label: string; token: string };
type AccessRole = "owner" | "read_only" | "staff";
type ManagedUser = {
  user_id: string;
  email: string;
  access_role: "read_only" | "staff";
  created_at: string;
  account_ids?: string[];
  account_labels?: string[];
};
type BackgroundCommand = {
  accountId: string;
  label: string;
  toastId: string | number;
  lastStatus: string;
  startedAt: number;
};
type ActivityLog = {
  id: string;
  account_id: string;
  account_label: string;
  action: Action | "config";
  status: string;
  result_message: string | null;
  created_at: string;
  completed_at: string | null;
  actor_name: string;
  actor_role: string;
};
type NetworkTrafficSample = {
  at: number;
  uploadedBytes: number;
  downloadedBytes: number;
};
const EMPTY_CARDS_REFRESH_MS = 5_000;
const CARD_METRICS_REFRESH_MS = 500;
const actionLabel: Record<Action, string> = {
  auto: "Auto",
  manual: "Manual",
  buy: "BUY",
  sell: "SELL",
  close_buy: "Close Buy",
  close_sell: "Close Sell",
  close_all: "Close All",
  reset: "Reset All",
};
const defaultEaConfig: EaConfig = {
  ModePerdagangan: 0,
  MataUangTampilan: 2,
  KursUSD_IDR: 18000,
  MagicBeli: 2864384,
  MagicJual: 2864385,
  LotAwal: 0.01,
  PenggandaLot: 1.2,
  LotMaksimal: 12,
  LangkahLayer: 1,
  JarakGrid: 2000,
  JarakTrailingPending: 500,
  JenisBatasRugi: 0,
  BatasKerugian: 30000,
  JedaSetelahSLMenit: 30,
  TargetHarian: 100000,
  SetelahTargetTercapai: 0,
  ModeTrailing: 0,
  MulaiTrailingPoin: 1500,
  KunciProfitPoin: 1000,
  LangkahTrailingPoin: 500,
  MinimumAutoBalanceUSD: 10,
};
const coreConfigFields = [
  [
    "ModePerdagangan",
    "Mode perdagangan",
    "select",
    [
      [0, "Beli + Jual"],
      [1, "Beli saja"],
      [2, "Jual saja"],
    ],
  ],
  [
    "MataUangTampilan",
    "Mata uang tampilan",
    "select",
    [
      [0, "USD"],
      [1, "CENT"],
      [2, "IDR"],
    ],
  ],
  ["KursUSD_IDR", "Kurs USD / IDR", "number"],
  ["MagicBeli", "Magic BUY", "number"],
  ["MagicJual", "Magic SELL", "number"],
  ["LotAwal", "Lot awal", "number"],
  ["PenggandaLot", "Pengganda lot", "number"],
  ["LotMaksimal", "Lot maksimal", "number"],
  ["LangkahLayer", "Langkah layer", "number"],
  ["JarakGrid", "Jarak grid (poin)", "number"],
  ["JarakTrailingPending", "Jarak trailing pending", "number"],
  [
    "JenisBatasRugi",
    "Jenis batas rugi",
    "select",
    [
      [0, "Nilai uang"],
      [1, "Persen"],
    ],
  ],
  ["BatasKerugian", "Batas kerugian", "number"],
  ["JedaSetelahSLMenit", "Jeda setelah SL (menit)", "number"],
  ["TargetHarian", "Target harian", "number"],
  ["MinimumAutoBalanceUSD", "Saldo minimum AUTO (USD; USC ×100)", "number"],
  [
    "SetelahTargetTercapai",
    "Setelah target tercapai",
    "select",
    [
      [0, "Stop hari ini"],
      [1, "Lanjut"],
    ],
  ],
  [
    "ModeTrailing",
    "Mode trailing",
    "select",
    [
      [0, "Per arah"],
      [1, "Semua arah"],
    ],
  ],
  ["MulaiTrailingPoin", "Mulai trailing (poin)", "number"],
  ["KunciProfitPoin", "Kunci profit (poin)", "number"],
  ["LangkahTrailingPoin", "Langkah trailing (poin)", "number"],
] as const;

type DisplayCurrency = "USD" | "CENT" | "IDR";
function finiteNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
function currency(
  value: number,
  accountCurrency: string,
  mode: DisplayCurrency = "USD",
  displayRate = 18000,
  isCentAccount = false
) {
  const centsAccount = isCentAccount || /USC|CENT/i.test(accountCurrency);
  const usdValue = centsAccount ? value / 100 : value;
  if (mode === "CENT")
    return `${new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(usdValue * 100)} USC`;
  if (mode === "IDR")
    return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(usdValue * displayRate)} IDR`;
  return `${new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(usdValue)} USD`;
}
function age(value: string | null) {
  if (!value) return "belum menerima heartbeat";
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(value)) / 1000)
  );
  return seconds < 2
    ? "baru saja"
    : seconds < 60
      ? `${seconds} dtk lalu`
      : `${Math.floor(seconds / 60)} mnt lalu`;
}
function formatNetworkSpeed(bytesPerSecond: number) {
  return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`;
}

function AccountRunningProfit({
  account,
  displayMode,
}: {
  account: Account;
  displayMode: DisplayCurrency;
}) {
  const showMoney = (value: unknown) => {
    if (!account.telemetry_received) return "—";
    const parsed = finiteNumber(value);
    return parsed === null
      ? "INVALID"
      : currency(
          parsed,
          account.currency,
          displayMode,
          account.display_rate,
          account.is_cent_account
        );
  };
  return (
    <div className="pilot-metrics pilot-panel-metrics pilot-card-summary">
      <div
        className={`metric-running ${account.running_float >= 0 ? "positive" : "negative"}`}
      >
        <span>Running</span>
        <strong>{showMoney(account.running_float)}</strong>
      </div>
      <div
        className={`metric-profit ${account.profit >= 0 ? "profit-positive" : "profit-negative"}`}
      >
        <span>Profit</span>
        <strong>{showMoney(account.profit)}</strong>
      </div>
      <div className="metric-status">
        <span>Status</span>
        <strong>
          {account.telemetry_received
            ? account.ea_status || (account.running ? "ACTIVE" : "MANUAL")
            : "MENUNGGU EA"}
        </strong>
      </div>
    </div>
  );
}

function AccountTelemetry({
  account,
  displayMode,
}: {
  account: Account;
  displayMode: DisplayCurrency;
}) {
  const showMoney = (value: unknown) => {
    if (!account.telemetry_received) return "—";
    const parsed = finiteNumber(value);
    return parsed === null
      ? "INVALID"
      : currency(
          parsed,
          account.currency,
          displayMode,
          account.display_rate,
          account.is_cent_account
        );
  };
  const basketSlValue = finiteNumber(account.basket_sl_set);
  const basketSlDisplay = !account.telemetry_received
    ? "Basket SL Set: —"
    : account.basket_sl_type === "percent"
      ? basketSlValue === null
        ? "INVALID"
        : `-${basketSlValue.toFixed(1)}%`
      : `-${showMoney(account.basket_sl_set)}`;
  return (
    <>
      <div className="pilot-metrics pilot-panel-metrics pilot-config-telemetry">
        <div className="metric-sl">
          <span>Basket SL Set</span>
          <strong>{basketSlDisplay}</strong>
        </div>
        <div className="metric-target">
          <span>Daily Target Set</span>
          <strong>
            {account.telemetry_received
              ? showMoney(account.daily_target_set)
              : "—"}
          </strong>
        </div>
        <div className="metric-float-buy">
          <span>Max Float Buy</span>
          <strong>{showMoney(account.max_float_buy)}</strong>
        </div>
        <div className="metric-float-sell">
          <span>Max Float Sell</span>
          <strong>{showMoney(account.max_float_sell)}</strong>
        </div>
        <div
          className={`metric-running ${account.running_float >= 0 ? "positive" : "negative"}`}
        >
          <span>Running</span>
          <strong>{showMoney(account.running_float)}</strong>
        </div>
        <div
          className={`metric-profit ${account.profit >= 0 ? "profit-positive" : "profit-negative"}`}
        >
          <span>Profit</span>
          <strong>{showMoney(account.profit)}</strong>
        </div>
        <div className="metric-status">
          <span>Status</span>
          <strong>
            {account.telemetry_received
              ? account.ea_status || (account.running ? "ACTIVE" : "MANUAL")
              : "MENUNGGU EA"}
          </strong>
        </div>
      </div>
      <footer className="pilot-account-footer pilot-config-footer">
        <span>Token EA •••• {account.token_hint}</span>
      </footer>
    </>
  );
}
export default function Home() {
  const { theme, setTheme } = useTheme();
  const { user, loading: authLoading, logout, refresh } = useAuth();
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginPending, setLoginPending] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [accessRole, setAccessRole] = useState<AccessRole | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessMessage, setAccessMessage] = useState("");
  const accessCheckUserRef = useRef<string | null | undefined>(undefined);
  const [refreshSeconds, setRefreshSeconds] = useState(() => {
    const stored = Number(localStorage.getItem("pilot-refresh-seconds"));
    return Number.isInteger(stored) && stored >= 1 && stored <= 60 ? stored : 5;
  });
  const [refreshDraftSeconds, setRefreshDraftSeconds] = useState<number | "">(
    () => {
      const stored = Number(localStorage.getItem("pilot-refresh-seconds"));
      return Number.isInteger(stored) && stored >= 1 && stored <= 60
        ? stored
        : 5;
    }
  );
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const metricsRequestInFlight = useRef(false);
  const networkTraffic = useRef<NetworkTrafficSample[]>([]);
  const [networkRates, setNetworkRates] = useState({
    uploadedBytesPerSecond: 0,
    downloadedBytesPerSecond: 0,
  });
  const [accountName, setAccountName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [tokenModal, setTokenModal] = useState<ConnectionToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [busyAccountIds, setBusyAccountIds] = useState<Set<string>>(
    () => new Set()
  );
  const backgroundCommands = useRef(new Map<string, BackgroundCommand>());
  const [currencyModes, setCurrencyModes] = useState<
    Record<string, DisplayCurrency>
  >({});
  const [accountSearch, setAccountSearch] = useState("");
  const [connectionFilter, setConnectionFilter] = useState<
    "all" | "online" | "offline"
  >("all");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePage, setActivePage] = useState<"dashboard" | "logs">(
    "dashboard"
  );
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editingAccountLabel, setEditingAccountLabel] = useState("");
  const [editingConfig, setEditingConfig] = useState<EaConfig>(defaultEaConfig);
  const [savingConfig, setSavingConfig] = useState(false);
  const [editingTelemetryIntervalMs, setEditingTelemetryIntervalMs] = useState(500);
  const [editingPollIntervalMs, setEditingPollIntervalMs] = useState(1000);
  const [savingPollInterval, setSavingPollInterval] = useState(false);
  const [savingAccountLabel, setSavingAccountLabel] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  useEffect(() => {
    if (!editingAccount) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !savingConfig &&
        !savingPollInterval &&
        !savingAccountLabel &&
        !deletingAccount
      ) {
        event.preventDefault();
        setEditingAccount(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    editingAccount,
    savingConfig,
    savingPollInterval,
    savingAccountLabel,
    deletingAccount,
  ]);
  const [showUserManager, setShowUserManager] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [profileEmail, setProfileEmail] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profilePassword, setProfilePassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<"read_only" | "staff">(
    "read_only"
  );
  const [selectedStaffAccountIds, setSelectedStaffAccountIds] = useState<
    string[]
  >([]);
  const [creatingUser, setCreatingUser] = useState(false);

  useEffect(() => {
    const updateRates = () => {
      const now = Date.now();
      const windowStart = now - 5_000;
      const recent = networkTraffic.current.filter(
        sample => sample.at >= windowStart
      );
      networkTraffic.current = recent;
      setNetworkRates({
        uploadedBytesPerSecond:
          recent.reduce((sum, sample) => sum + sample.uploadedBytes, 0) / 5,
        downloadedBytesPerSecond:
          recent.reduce((sum, sample) => sum + sample.downloadedBytes, 0) / 5,
      });
    };
    const timer = window.setInterval(updateRates, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const saveRefreshSettings = () => {
    if (refreshDraftSeconds === "") {
      toast.error("Isi delay refresh atau gunakan nilai sebelumnya.");
      return;
    }
    const value = Math.max(
      1,
      Math.min(
        60,
        Number.isInteger(refreshDraftSeconds) ? refreshDraftSeconds : 5
      )
    );
    setRefreshDraftSeconds(value);
    setRefreshSeconds(value);
    localStorage.setItem("pilot-refresh-seconds", String(value));
    toast.success(`Refresh detail disimpan: ${value} detik.`);
  };

  const callApi = useCallback(
    async (
      path: string,
      method = "GET",
      body?: unknown,
      timeoutMs?: number
    ) => {
      const serializedBody =
        body === undefined ? undefined : JSON.stringify(body);
      const routeUrl = apiUrl(`/api/mt5${path}`);
      const headers: Record<string, string> = await getSessionAuthorizationHeaders();
      if (serializedBody !== undefined)
        headers["Content-Type"] = "application/json";
      const requestHeaderText = Object.entries(headers)
        .map(
          ([key, value]) => `${key}: ${value}
`
        )
        .join("");
      const uploadedBytes = new TextEncoder().encode(`${method} ${routeUrl}
${requestHeaderText}
${serializedBody ?? ""}`).byteLength;
      const controller = timeoutMs ? new AbortController() : null;
      const timeoutId = controller
        ? window.setTimeout(() => controller.abort(), timeoutMs)
        : null;
      try {
        const response = await fetch(routeUrl, {
          method,
          headers,
          ...(serializedBody === undefined ? {} : { body: serializedBody }),
          ...(controller ? { signal: controller.signal } : {}),
        });
        const responseHeaderText = Array.from(response.headers.entries())
          .map(
            ([key, value]) => `${key}: ${value}
`
          )
          .join("");
        const downloadedBodyBytes = await response
          .clone()
          .arrayBuffer()
          .then(buffer => buffer.byteLength)
          .catch(() => 0);
        const downloadedBytes =
          new TextEncoder().encode(responseHeaderText).byteLength +
          downloadedBodyBytes;
        networkTraffic.current.push({
          at: Date.now(),
          uploadedBytes,
          downloadedBytes,
        });
        const result =
          response.status === 204
            ? null
            : await response.json().catch(() => null);
        if (!response.ok) {
          if (response.status === 401) void logout();
          throw new Error(
            result?.error ?? `Permintaan gagal (${response.status}).`
          );
        }
        return result;
      } catch (error) {
        if (controller?.signal.aborted) {
          const seconds = Math.round((timeoutMs ?? 0) / 1000);
          throw new Error(
            `Server tidak merespons dalam ${seconds} detik. Periksa koneksi internet, lalu coba lagi.`
          );
        }
        throw error;
      } finally {
        if (timeoutId !== null) window.clearTimeout(timeoutId);
      }
    },
    [logout]
  );

  const loadAccess = useCallback(async () => {
    if (!user) {
      setAccessRole(null);
      setAccessMessage("");
      setAccessLoading(false);
      setAccounts([]);
      return;
    }
    setAccessLoading(true);
    setAccessMessage("");
    setAccessRole(null);
    try {
      const result = await callApi(
        "/dashboard/session",
        "GET",
        undefined,
        15000
      );
      setAccessRole(result.role as AccessRole);
    } catch (error) {
      setAccessRole(null);
      setAccounts([]);
      setAccessMessage(
        error instanceof Error
          ? error.message
          : "Hak akses belum diberikan oleh owner."
      );
    } finally {
      setAccessLoading(false);
    }
  }, [callApi, user]);

  useEffect(() => {
    const openId = user?.openId ?? null;
    if (accessCheckUserRef.current === openId) return;
    accessCheckUserRef.current = openId;
    void loadAccess();
  }, [loadAccess, user?.openId]);

  const loadAccounts = useCallback(async () => {
    if (!user) return;
    setLoadingAccounts(true);
    try {
      const result = await callApi("/dashboard/accounts");
      setAccounts(result.accounts ?? []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Data akun tidak dapat dimuat."
      );
    } finally {
      setLoadingAccounts(false);
    }
  }, [callApi, user]);

  const hasTelemetryCards = accounts.some(
    account => account.telemetry_received
  );
  const metricsRefreshIntervalMs = hasTelemetryCards
    ? Math.max(
        CARD_METRICS_REFRESH_MS,
        Math.min(
          ...accounts
            .filter(account => account.telemetry_received)
            .map(account => account.telemetry_interval_ms ?? 500)
        )
      )
    : CARD_METRICS_REFRESH_MS;
  const accountRefreshIntervalMs =
    accounts.length === 0 || !hasTelemetryCards
      ? EMPTY_CARDS_REFRESH_MS
      : refreshSeconds * 1_000;

  useEffect(() => {
    if (!user || !accessRole) {
      if (!user) setAccounts([]);
      return;
    }
    void loadAccounts();
    const fallbackTimer = window.setInterval(
      () => void loadAccounts(),
      accountRefreshIntervalMs
    );
    return () => window.clearInterval(fallbackTimer);
  }, [accessRole, accountRefreshIntervalMs, loadAccounts, user]);

  const loadCardMetrics = useCallback(async () => {
    if (!user || metricsRequestInFlight.current) return;
    metricsRequestInFlight.current = true;
    try {
      const result = await callApi(
        "/dashboard/metrics",
        "GET",
        undefined,
        10_000
      );
      const metrics = new Map<string, CardMetric>();
      for (const item of (result.metrics ?? []) as unknown[]) {
        if (!item || typeof item !== "object") continue;
        const metric = item as Partial<CardMetric>;
        const runningFloat = finiteNumber(metric.running_float);
        const profit = finiteNumber(metric.profit);
        if (
          typeof metric.id !== "string" ||
          typeof metric.telemetry_received !== "boolean" ||
          runningFloat === null ||
          profit === null
        )
          continue;
        metrics.set(metric.id, {
          id: metric.id,
          running_float: runningFloat,
          profit,
          telemetry_received: metric.telemetry_received,
        });
      }
      setAccounts(current => {
        let changed = false;
        const next = current.map(account => {
          const metric = metrics.get(account.id);
          if (!metric) return account;
          if (
            account.running_float === metric.running_float &&
            account.profit === metric.profit &&
            account.telemetry_received === metric.telemetry_received
          )
            return account;
          changed = true;
          return {
            ...account,
            running_float: metric.running_float,
            profit: metric.profit,
            telemetry_received: metric.telemetry_received,
          };
        });
        return changed ? next : current;
      });
    } catch {
      // Retry on the next tick without producing a toast every second.
    } finally {
      metricsRequestInFlight.current = false;
    }
  }, [callApi, user]);

  useEffect(() => {
    if (!user || !accessRole || !hasTelemetryCards) return;
    void loadCardMetrics();
    const metricsTimer = window.setInterval(
      () => void loadCardMetrics(),
      metricsRefreshIntervalMs
    );
    return () => window.clearInterval(metricsTimer);
  }, [accessRole, hasTelemetryCards, loadCardMetrics, metricsRefreshIntervalMs, user]);

  useEffect(() => {
    if (!backgroundCommands.current.size) return;
    for (const [commandId, pending] of backgroundCommands.current) {
      const command = accounts
        .find(account => account.id === pending.accountId)
        ?.commands.find(item => item.id === commandId);
      if (!command) {
        if (Date.now() - pending.startedAt > 65_000) {
          toast.error(
            `${pending.label}: belum ada konfirmasi hasil dari EA. Periksa koneksi dan status di MT5.`,
            { id: pending.toastId, duration: 8000 }
          );
          backgroundCommands.current.delete(commandId);
        }
        continue;
      }
      if (
        ["queued", "delivered", "accepted"].includes(command.status) &&
        Date.parse(command.expires_at) <= Date.now()
      ) {
        toast.error(
          `${pending.label}: EA belum memberi hasil sebelum batas waktu. Periksa status di MT5.`,
          { id: pending.toastId, duration: 8000 }
        );
        backgroundCommands.current.delete(commandId);
        continue;
      }
      if (command.status === "delivered" || command.status === "accepted") {
        if (pending.lastStatus !== command.status) {
          pending.lastStatus = command.status;
          toast.loading(`${pending.label}: diterima EA, sedang diproses…`, {
            id: pending.toastId,
            duration: Number.POSITIVE_INFINITY,
          });
        }
        continue;
      }
      if (command.status === "succeeded") {
        const detail = command.result_message?.trim();
        toast.success(
          `${pending.label} berhasil${detail ? ` — ${detail}` : "."}`,
          { id: pending.toastId, duration: 6000 }
        );
        backgroundCommands.current.delete(commandId);
      } else if (command.status === "failed") {
        const detail = command.result_message?.trim();
        toast.error(`${pending.label} gagal${detail ? `: ${detail}` : "."}`, {
          id: pending.toastId,
          duration: 8000,
        });
        backgroundCommands.current.delete(commandId);
      } else if (command.status === "expired") {
        toast.error(
          `${pending.label} kedaluwarsa: EA tidak mengonfirmasi perintah.`,
          { id: pending.toastId, duration: 8000 }
        );
        backgroundCommands.current.delete(commandId);
      }
    }
  }, [accounts]);

  const canWrite = accessRole === "owner";
  const canUseCardActions = accessRole === "owner" || accessRole === "staff";

  const onlineCount = useMemo(
    () =>
      accounts.filter(account => account.connection_status === "online").length,
    [accounts]
  );
  const averagePingMs = useMemo(() => {
    const values = accounts
      .filter(
        account =>
          account.connection_status === "online" &&
          account.telemetry_received &&
          account.latency_ms !== null &&
          Number.isFinite(account.latency_ms)
      )
      .map(account => account.latency_ms as number);
    return values.length
      ? Math.round(
          values.reduce((total, value) => total + value, 0) / values.length
        )
      : null;
  }, [accounts]);
  const filteredAccounts = useMemo(() => {
    const query = accountSearch.trim().toLocaleLowerCase();
    return accounts.filter(account => {
      const searchable = [
        account.label,
        account.broker_account_name,
        account.server_name,
        account.mt5_login?.toString(),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      const matchesSearch = !query || searchable.includes(query);
      const matchesConnection =
        connectionFilter === "all" ||
        account.connection_status === connectionFilter;
      return matchesSearch && matchesConnection;
    });
  }, [accounts, accountSearch, connectionFilter]);

  const loadActivityLogs = useCallback(async () => {
    if (!user) return;
    setLoadingLogs(true);
    try {
      const result = await callApi("/dashboard/logs");
      setActivityLogs(result.logs ?? []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Log aktivitas gagal dimuat."
      );
    } finally {
      setLoadingLogs(false);
    }
  }, [callApi, user]);

  useEffect(() => {
    if (activePage === "logs") void loadActivityLogs();
  }, [activePage, loadActivityLogs]);

  const openUserManager = async () => {
    if (!canWrite) return;
    setShowUserManager(true);
    setLoadingUsers(true);
    try {
      const result = await callApi("/dashboard/users");
      setManagedUsers(result.users ?? []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Daftar pengguna gagal dimuat."
      );
    } finally {
      setLoadingUsers(false);
    }
  };
  const openProfileEditor = () => {
    if (!user) return;
    setProfileEmail(user.email);
    setProfileName(user.name === user.email ? "" : user.name);
    setProfilePassword("");
    setShowProfileEditor(true);
  };
  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !user || savingProfile) return;
    const name = profileName.trim();
    const email = profileEmail.trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      toast.error("Email login tidak valid.");
      return;
    }
    if (name.length < 1 || name.length > 200) {
      toast.error("Nama harus diisi, maksimal 200 karakter.");
      return;
    }
    if (profilePassword && profilePassword.length < 8) {
      toast.error("Kata sandi baru minimal 8 karakter.");
      return;
    }
    setSavingProfile(true);
    try {
      const updates: {
        email?: string;
        data: { name: string };
        password?: string;
      } = {
        data: { name },
      };
      if (email !== user.email.toLowerCase()) updates.email = email;
      if (profilePassword) updates.password = profilePassword;
      const { error } = await supabase.auth.updateUser(updates);
      if (error) throw error;
      const profileResponse = await fetch(apiUrl("/api/mt5/dashboard/profile"), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(await getSessionAuthorizationHeaders()),
        },
      });
      if (!profileResponse.ok) {
        const payload = (await profileResponse.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || "Profil aplikasi belum tersinkron.");
      }
      await refresh();
      setProfilePassword("");
      setShowProfileEditor(false);
      toast.success(
        profilePassword
          ? "Profil dan kata sandi berhasil diperbarui."
          : "Profil berhasil diperbarui."
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Profil tidak dapat diperbarui."
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const createReadOnlyUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canWrite || creatingUser) return;
    const invitedEmail = newUserEmail.trim().toLowerCase();
    setCreatingUser(true);
    try {
      await callApi("/dashboard/users", "POST", {
        email: invitedEmail,
        accessRole: newUserRole,
        accountIds: newUserRole === "staff" ? selectedStaffAccountIds : [],
      });
      setNewUserEmail("");
      setNewUserRole("read_only");
      setSelectedStaffAccountIds([]);
      const refreshed = await callApi("/dashboard/users");
      setManagedUsers(refreshed.users ?? []);
      toast.success(
        `Undangan Supabase untuk ${invitedEmail} berhasil dikirim.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Akses pengguna gagal diberikan."
      );
    } finally {
      setCreatingUser(false);
    }
  };

  const revokeManagedUser = async (emailToRevoke: string) => {
    if (
      !canWrite ||
      !window.confirm(`Cabut akses MT5 Pilot untuk ${emailToRevoke}?`)
    )
      return;
    try {
      await callApi(
        `/dashboard/users/${encodeURIComponent(emailToRevoke)}`,
        "DELETE"
      );
      setManagedUsers(current =>
        current.filter(item => item.email !== emailToRevoke)
      );
      toast.success(`Akses ${emailToRevoke} dicabut.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Akses pengguna gagal dicabut."
      );
    }
  };

  const trackBackgroundCommand = (
    accountId: string,
    commandId: string,
    label: string
  ) => {
    const toastId = toast.loading(`${label}: dikirim, menunggu EA…`, {
      duration: Number.POSITIVE_INFINITY,
    });
    backgroundCommands.current.set(commandId, {
      accountId,
      label,
      toastId,
      lastStatus: "queued",
      startedAt: Date.now(),
    });
  };

  const createAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyAction("create");
    try {
      if (!canWrite)
        throw new Error("Akun read-only tidak dapat membuat koneksi EA.");
      const result = await callApi("/dashboard/accounts", "POST", {
        label: accountName.trim(),
      });
      setShowAdd(false);
      setAccountName("");
      setTokenModal({ label: result.account.label, token: result.token });
      await loadAccounts();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Akun koneksi gagal dibuat."
      );
    } finally {
      setBusyAction(null);
    }
  };

  const sendAction = async (account: Account, action: Action) => {
    if (!canUseCardActions) {
      toast.error("Role ini tidak dapat mengirim perintah EA.");
      return;
    }
    if (account.connection_status !== "online") {
      toast.error("EA harus online untuk menerima perintah.");
      return;
    }
    setBusyAccountIds(current => new Set(current).add(account.id));
    try {
      const result = await callApi(
        `/dashboard/accounts/${account.id}/commands`,
        "POST",
        { action }
      );
      if (!result.command?.id)
        throw new Error(
          "Perintah tersimpan, tetapi ID pemantauan tidak diterima."
        );
      trackBackgroundCommand(
        account.id,
        result.command.id,
        `Perintah ${actionLabel[action]}`
      );
      await loadAccounts();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Perintah tidak dapat dikirim."
      );
    } finally {
      setBusyAccountIds(current => {
        const next = new Set(current);
        next.delete(account.id);
        return next;
      });
    }
  };

  const openConfigEditor = (account: Account) => {
    if (!canWrite) return;
    setEditingAccount(account);
    setEditingAccountLabel(account.label);
    setEditingTelemetryIntervalMs(account.telemetry_interval_ms ?? 500);
    setEditingPollIntervalMs(account.poll_interval_ms ?? 1000);
    setDeleteConfirmation("");
    const savedConfig = account.ea_config ?? {};
    setEditingConfig(
      Object.fromEntries(
        Object.entries(defaultEaConfig).map(([key, defaultValue]) => [
          key,
          savedConfig[key] ?? defaultValue,
        ])
      ) as EaConfig
    );
  };

  const saveConfig = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canWrite) {
      toast.error("Akun read-only tidak dapat mengubah parameter EA.");
      return;
    }
    if (!editingAccount || savingPollInterval) return;
    if (Object.values(editingConfig).some(value => value === "")) {
      toast.error(
        "Parameter yang dikosongkan belum dapat dikirim. Isi nilainya kembali sebelum menyimpan."
      );
      return;
    }
    setSavingConfig(true);
    try {
      const accountId = editingAccount.id;
      const result = await callApi(
        `/dashboard/accounts/${accountId}/config`,
        "POST",
        { config: editingConfig }
      );
      if (!result.command?.id)
        throw new Error(
          "Konfigurasi tersimpan, tetapi ID pemantauan tidak diterima."
        );
      trackBackgroundCommand(
        accountId,
        result.command.id,
        "Simpan parameter EA"
      );
      setEditingAccount(null);
      await loadAccounts();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Konfigurasi EA gagal disimpan."
      );
    } finally {
      setSavingConfig(false);
    }
  };

  const savePollingInterval = async () => {
    if (!canWrite || !editingAccount || savingPollInterval || savingConfig)
      return;
    if (![500, 1000, 2000].includes(editingTelemetryIntervalMs)) {
      toast.error("Pilih interval telemetry yang tersedia.");
      return;
    }
    if (![500, 1000, 2000].includes(editingPollIntervalMs)) {
      toast.error("Pilih interval polling yang tersedia.");
      return;
    }
    setSavingPollInterval(true);
    try {
      const accountId = editingAccount.id;
      await callApi(`/dashboard/accounts/${accountId}/polling`, "PATCH", {
        telemetryIntervalMs: editingTelemetryIntervalMs,
        pollIntervalMs: editingPollIntervalMs,
      });
      setAccounts(current =>
        current.map(account =>
          account.id === accountId
            ? {
                ...account,
                telemetry_interval_ms: editingTelemetryIntervalMs,
                poll_interval_ms: editingPollIntervalMs,
              }
            : account
        )
      );
      setEditingAccount(current =>
        current?.id === accountId
          ? {
              ...current,
              telemetry_interval_ms: editingTelemetryIntervalMs,
              poll_interval_ms: editingPollIntervalMs,
            }
          : current
      );
      toast.success(
        `Interval disimpan: telemetry ${editingTelemetryIntervalMs} ms, perintah ${editingPollIntervalMs} ms. EA menerapkannya saat polling berikutnya.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Interval polling gagal disimpan."
      );
    } finally {
      setSavingPollInterval(false);
    }
  };

  const saveAccountLabel = async () => {
    if (!canWrite || !editingAccount || savingPollInterval) return;
    const label = editingAccountLabel.trim();
    if (!label || label.length > 80) {
      toast.error("Nama kartu harus berisi 1–80 karakter.");
      return;
    }
    setSavingAccountLabel(true);
    try {
      const result = await callApi(
        `/dashboard/accounts/${editingAccount.id}`,
        "PATCH",
        { label }
      );
      setEditingAccount(current =>
        current ? { ...current, label: result.account.label } : current
      );
      setEditingAccountLabel(result.account.label);
      toast.success("Nama kartu berhasil diperbarui.");
      void loadAccounts();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Nama kartu gagal diperbarui."
      );
    } finally {
      setSavingAccountLabel(false);
    }
  };

  const deleteAccountFromPilot = async () => {
    if (
      !canWrite ||
      !editingAccount ||
      deleteConfirmation.trim().toUpperCase() !== "HAPUS" ||
      savingPollInterval
    )
      return;
    setDeletingAccount(true);
    try {
      const accountId = editingAccount.id;
      const result = await callApi(
        `/dashboard/accounts/${accountId}`,
        "DELETE",
        { confirm: "HAPUS" }
      );
      setAccounts(current =>
        current.filter(account => account.id !== accountId)
      );
      for (const [commandId, pending] of backgroundCommands.current) {
        if (pending.accountId === accountId) {
          toast.error(
            `${pending.label} dibatalkan karena kartu EA dihapus dari Pilot.`,
            { id: pending.toastId, duration: 8000 }
          );
          backgroundCommands.current.delete(commandId);
        }
      }
      setEditingAccount(null);
      setDeleteConfirmation("");
      toast.success(
        result?.message ??
          "EA dihapus dari Pilot. EA di terminal MT5 tidak dihentikan."
      );
    } catch (error) {
      setDeleteConfirmation("");
      toast.error(
        error instanceof Error
          ? error.message
          : "EA tidak dapat dihapus dari Pilot."
      );
    } finally {
      setDeletingAccount(false);
    }
  };

  const copyToken = async () => {
    if (!tokenModal) return;
    try {
      await navigator.clipboard.writeText(tokenModal.token);
      setCopied(true);
      toast.success("Token disalin.");
    } catch {
      toast.error("Clipboard tidak tersedia. Salin token secara manual.");
    }
  };

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loginPending) return;
    setLoginPending(true);
    setLoginError("");
    try {
      if (!supabase) throw new Error("Layanan login belum dikonfigurasi.");
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      if (error) throw new Error("Email atau kata sandi tidak valid.");
      setLoginPassword("");
      await refresh();
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : "Email atau kata sandi tidak valid."
      );
    } finally {
      setLoginPending(false);
    }
  };

  if (authLoading)
    return (
      <main className="pilot-loading">
        <Activity size={20} />
        <span>MENYIAPKAN MT5 PILOT</span>
      </main>
    );

  if (!user)
    return (
      <main className="pilot-auth-page" data-theme={theme}>
        <a className="pilot-brand" href="/">
          <span className="pilot-brand-mark">
            <Activity size={19} />
          </span>
          <span>
            <strong>
              MT5 <i>PILOT</i>
            </strong>
            <small>PRIVATE EA WORKSPACE</small>
          </span>
        </a>
        <section className="pilot-auth-card">
          <div className="pilot-kicker">
            <span /> LOGIN AMAN · SUPABASE
          </div>
          <h1>Masuk ke MT5 Pilot</h1>
          <p>
            Masuk menggunakan akun Supabase Auth yang telah diundang owner.
            Akses dashboard dibatasi berdasarkan role dan akun.
          </p>
          <form className="pilot-auth-form" onSubmit={submitLogin}>
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                required
                maxLength={320}
                value={loginEmail}
                onChange={event => setLoginEmail(event.target.value)}
                placeholder="nama@contoh.com"
              />
            </label>
            <label>
              Kata sandi
              <input
                type="password"
                autoComplete="current-password"
                required
                value={loginPassword}
                onChange={event => setLoginPassword(event.target.value)}
                placeholder="Masukkan kata sandi"
              />
            </label>
            {loginError && <p className="pilot-auth-error" role="alert">{loginError}</p>}
            <button className="pilot-auth-submit" disabled={loginPending || !supabase}>
              {loginPending ? "Memeriksa akses…" : "Masuk"}
            </button>
          </form>
          <div className="pilot-security">
            <ShieldCheck size={15} /> Kredensial diverifikasi oleh Supabase Auth;
            aplikasi tidak menyimpan password.
          </div>
        </section>
        <footer className="pilot-auth-footer">
          MT5 PILOT <span>·</span> KONEKSI AKUN MT5
        </footer>
      </main>
    );

  if (accessLoading)
    return (
      <main className="pilot-loading">
        <Activity size={20} />
        <span>MEMERIKSA AKSES MT5 PILOT</span>
      </main>
    );
  if (!accessRole)
    return (
      <main className="pilot-auth-page" data-theme={theme}>
        <a className="pilot-brand" href="/">
          <span className="pilot-brand-mark">
            <Activity size={19} />
          </span>
          <span>
            <strong>
              MT5 <i>PILOT</i>
            </strong>
            <small>PRIVATE EA WORKSPACE</small>
          </span>
        </a>
        <section className="pilot-auth-card">
          <div className="pilot-kicker">
            <span /> AKSES BELUM DIBERIKAN
          </div>
          <h1>Hubungi owner</h1>
          <p>
            {accessMessage ||
              "Email ini belum terdaftar di MT5 Pilot. Minta owner menambahkan akses untuk email yang sama."}
          </p>
          <div className="pilot-auth-actions">
            <button
              className="pilot-primary-button"
              type="button"
              onClick={() => void loadAccess()}
              disabled={accessLoading}
            >
              Coba lagi <RefreshCw size={16} />
            </button>
            <button
              className="pilot-secondary-button"
              type="button"
              onClick={() => void logout()}
            >
              Keluar <LogOut size={16} />
            </button>
          </div>
        </section>
      </main>
    );

  return (
    <main className="pilot-dashboard" data-theme={theme}>
      <header className="pilot-topbar">
        <a className="pilot-brand" href="/">
          <span className="pilot-brand-mark">
            <Activity size={19} />
          </span>
          <span>
            <strong>
              MT5 <i>PILOT</i>
            </strong>
            <small>PRIVATE EA WORKSPACE</small>
          </span>
        </a>
        <div className="pilot-topbar-tools">
          <div
            className="pilot-link-status"
            title="Estimasi byte header dan payload request/respons Pilot API selama 5 detik terakhir. Ping adalah rata-rata RTT heartbeat dari EA yang online."
            aria-label={`Kecepatan komunikasi Pilot dan EA: unggah ${formatNetworkSpeed(networkRates.uploadedBytesPerSecond)}, unduh ${formatNetworkSpeed(networkRates.downloadedBytesPerSecond)}; ping rata-rata ${averagePingMs === null ? "belum tersedia" : `${averagePingMs} milidetik`}`}
          >
            <div className="pilot-link-speed">
              <span className="pilot-link-title">KECEPATAN PILOT ↔ EA</span>
              <div className="pilot-link-rates">
                <span className="pilot-link-rate pilot-link-upload">
                  <ArrowUp size={12} aria-hidden="true" />
                  {formatNetworkSpeed(networkRates.uploadedBytesPerSecond)}
                </span>
                <span className="pilot-link-rate pilot-link-download">
                  <ArrowDown size={12} aria-hidden="true" />
                  {formatNetworkSpeed(networkRates.downloadedBytesPerSecond)}
                </span>
              </div>
            </div>
            <span className="pilot-link-divider" aria-hidden="true" />
            <div className="pilot-link-ping">
              <Signal size={15} aria-hidden="true" />
              <span>
                <small>PING AVG</small>
                <strong>
                  {averagePingMs === null ? "—" : `${averagePingMs} ms`}
                </strong>
              </span>
            </div>
          </div>
          <button
            className="pilot-menu-button pilot-icon-button"
            title="Buka menu"
            aria-label="Buka menu"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={19} />
          </button>
        </div>
      </header>
      {sidebarOpen && (
        <button
          className="pilot-sidebar-backdrop"
          aria-label="Tutup menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`pilot-sidebar ${sidebarOpen ? "open" : ""}`}
        aria-hidden={!sidebarOpen}
      >
        <div className="pilot-sidebar-head">
          <div>
            <span className="pilot-kicker">
              <span /> MENU PANEL
            </span>
            <strong>MT5 PILOT</strong>
          </div>
          <button
            className="pilot-icon-button"
            title="Tutup menu"
            aria-label="Tutup menu"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={17} />
          </button>
        </div>
        <div className="pilot-sidebar-status">
          <span className={onlineCount ? "is-live" : "is-waiting"} />
          <strong>
            {onlineCount}/{accounts.length} EA ONLINE
          </strong>
          <button
            className="pilot-icon-button"
            title="Segarkan sekarang"
            aria-label="Segarkan sekarang"
            onClick={() => void loadAccounts()}
          >
            <RefreshCw
              size={14}
              className={loadingAccounts ? "pilot-spin" : ""}
            />
          </button>
        </div>
        <div className="pilot-sidebar-section">
          <label className="pilot-search-box pilot-sidebar-search">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              value={accountSearch}
              onChange={event => setAccountSearch(event.target.value)}
              placeholder="Cari panel EA…"
              aria-label="Cari akun EA"
            />
          </label>
          <select
            className="pilot-filter-select pilot-sidebar-filter"
            value={connectionFilter}
            onChange={event =>
              setConnectionFilter(
                event.target.value as "all" | "online" | "offline"
              )
            }
            aria-label="Filter status koneksi"
          >
            <option value="all">Semua</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
          {canWrite && (
            <button
              className="pilot-add-button pilot-sidebar-add"
              onClick={() => {
                setShowAdd(true);
                setSidebarOpen(false);
              }}
            >
              <Plus size={15} /> Tambah EA
            </button>
          )}
        </div>
        <button
          type="button"
          className="pilot-add-button pilot-sidebar-add"
          onClick={() => {
            setActivePage("logs");
            setSidebarOpen(false);
          }}
        >
          <ClipboardList size={15} /> Log aktivitas
        </button>
        {accessRole !== "staff" && (
          <div className="pilot-sidebar-section pilot-settings-section">
            <span className="pilot-kicker">PREFERENSI</span>
            <label className="pilot-sidebar-setting">
              <span>Refresh detail (detik)</span>
              <input
                type="number"
                min={1}
                max={60}
                step={1}
                value={refreshDraftSeconds}
                onChange={event => {
                  if (event.target.value === "") {
                    setRefreshDraftSeconds("");
                    return;
                  }
                  const value = Number(event.target.value);
                  if (Number.isInteger(value) && value >= 1 && value <= 60)
                    setRefreshDraftSeconds(value);
                }}
                onBlur={() =>
                  setRefreshDraftSeconds(value =>
                    value === "" ? "" : Math.max(1, Math.min(60, value))
                  )
                }
              />
            </label>
            <button
              type="button"
              className="pilot-add-button pilot-sidebar-add"
              onClick={saveRefreshSettings}
            >
              Simpan
            </button>
            <p className="pilot-sidebar-hint">
              Kartu kosong: 5 detik. EA mengirim telemetry dan Running &amp;
              Profit diperbarui dengan target 500 ms.
            </p>
            <label className="pilot-sidebar-setting">
              <span>Tema</span>
              <select
                value={theme}
                onChange={event => setTheme(event.target.value as typeof theme)}
              >
                <option value="dark">Gelap (default)</option>
                <option value="light">Terang</option>
                <option value="blue-black">Biru hitam</option>
                <option value="blue-white">Biru putih</option>
              </select>
            </label>
            <button
              className="pilot-add-button pilot-sidebar-add"
              disabled={!canWrite}
              title={
                canWrite
                  ? "Kelola pengguna"
                  : "Hanya owner yang dapat mengelola pengguna"
              }
              onClick={() => void openUserManager()}
            >
              <Users size={15} /> Kelola pengguna
            </button>
          </div>
        )}
        <button
          type="button"
          className="pilot-add-button pilot-sidebar-add"
          onClick={openProfileEditor}
        >
          <UserRound size={15} /> Edit akun saya
        </button>
        <div className="pilot-sidebar-account">
          <span className="pilot-owner-pill">
            <ShieldCheck size={14} />{" "}
            {accessRole === "read_only"
              ? "AKSES READ ONLY"
              : accessRole === "staff"
                ? "AKSES STAFF"
                : accessRole === "owner"
                  ? "AKSES OWNER"
                  : "MEMERIKSA AKSES"}
          </span>
          <button
            className="pilot-sidebar-logout"
            onClick={() => void logout()}
          >
            <LogOut size={15} /> Keluar
          </button>
        </div>
      </aside>
      <section className="pilot-main">
        {activePage === "logs" ? (
          <section className="pilot-log-page">
            <div className="pilot-page-heading">
              <div>
                <span className="pilot-kicker">
                  <span /> AUDIT AKTIVITAS
                </span>
                <h1>Log aktivitas</h1>
                <p>
                  Riwayat perintah yang dikirim dari Pilot dan pengguna
                  terdaftar ke EA.
                </p>
              </div>
              <button
                type="button"
                className="pilot-icon-button"
                title="Muat ulang log"
                aria-label="Muat ulang log"
                onClick={() => void loadActivityLogs()}
              >
                <RefreshCw
                  size={15}
                  className={loadingLogs ? "pilot-spin" : ""}
                />
              </button>
            </div>
            {loadingLogs && !activityLogs.length ? (
              <div className="pilot-log-empty">Memuat log aktivitas…</div>
            ) : activityLogs.length ? (
              <div className="pilot-log-list">
                {activityLogs.map(log => {
                  const date = new Date(log.created_at);
                  const action =
                    log.action === "config"
                      ? "Edit parameter EA"
                      : actionLabel[log.action];
                  const role =
                    log.actor_role === "staff"
                      ? "staff"
                      : log.actor_role === "read_only"
                        ? "read-only"
                        : log.actor_role === "operator"
                          ? "pengguna"
                          : "owner";
                  return (
                    <article className="pilot-log-entry" key={log.id}>
                      <div className="pilot-log-icon">
                        <ClipboardList size={15} />
                      </div>
                      <div className="pilot-log-content">
                        <strong>
                          {action} oleh{" "}
                          {log.actor_role === "operator"
                            ? role
                            : `${role} ${log.actor_name}`}
                        </strong>
                        <span>
                          {log.account_label} ·{" "}
                          {date.toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "long",
                            year: "numeric",
                          })}
                          ,{" "}
                          {date.toLocaleTimeString("id-ID", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {log.result_message && (
                          <small>{log.result_message}</small>
                        )}
                      </div>
                      <b className={`pilot-log-status status-${log.status}`}>
                        {log.status}
                      </b>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="pilot-log-empty">Belum ada aktivitas.</div>
            )}
          </section>
        ) : (
          <>
            {accounts.length === 0 && !loadingAccounts ? (
              <section className="pilot-empty">
                <div className="pilot-empty-icon">
                  <Radio size={24} />
                </div>
                <div className="pilot-kicker">BELUM ADA KONEKSI</div>
                <h2>Hubungkan EA_by_Capik</h2>
                <p>
                  Buat token koneksi untuk akun MT5. Setelah token dimasukkan ke
                  EA dan WebRequest diizinkan di MT5, saldo, equity, drawdown,
                  profit, dan status EA akan muncul di sini.
                </p>
                <small>
                  Belum ada data akun yang dikirim atau disimulasikan.
                </small>
              </section>
            ) : null}

            <div className="pilot-account-list">
              {filteredAccounts.map(account => {
                const online = account.connection_status === "online";
                const disabled =
                  !canUseCardActions ||
                  !online ||
                  !account.telemetry_received ||
                  busyAccountIds.has(account.id);
                const displayMode =
                  currencyModes[account.id] ??
                  account.display_currency ??
                  "USD";
                return (
                  <div className="pilot-account-shell" key={account.id}>
                    <div className="pilot-account-identity">
                      <span
                        className={`pilot-identity-led ${online ? "online" : "offline"}`}
                        aria-label={online ? "Online" : "Offline"}
                      />
                      <span>
                        {account.label} -{" "}
                        {account.broker_account_name ||
                          "Menunggu nama akun dari EA"}
                      </span>
                    </div>
                    <article className="pilot-account-card">
                      <div className="pilot-account-header">
                        {canWrite ? (
                          <button
                            type="button"
                            className="pilot-account-title pilot-edit-title"
                            onClick={() => openConfigEditor(account)}
                            title="Edit seluruh parameter EA"
                          >
                            <span>
                              <h3>*Grid_By_Capik*</h3>
                            </span>
                          </button>
                        ) : (
                          <div className="pilot-account-title pilot-edit-title pilot-staff-card-title">
                            <span>
                              <h3>*Grid_By_Capik*</h3>
                            </span>
                          </div>
                        )}
                      </div>
                      {!canUseCardActions && (
                        <div className="pilot-readonly-note">
                          AKSES READ ONLY · tombol aksi dinonaktifkan
                        </div>
                      )}
                      <div className="pilot-panel-buttons">
                        <div className="pilot-button-row">
                          <button
                            className={`mode ${account.ea_mode === "manual" ? "selected" : ""}`}
                            disabled={disabled}
                            onClick={() => void sendAction(account, "manual")}
                          >
                            MANUAL
                          </button>
                          <button
                            className={`mode ${account.ea_mode === "auto" ? "selected" : ""}`}
                            disabled={disabled}
                            onClick={() => void sendAction(account, "auto")}
                          >
                            AUTO
                          </button>
                        </div>
                        <div className="pilot-button-row">
                          <button
                            className="trade-sell"
                            disabled={disabled}
                            onClick={() => void sendAction(account, "sell")}
                          >
                            SELL
                          </button>
                          <button
                            className="trade-buy"
                            disabled={disabled}
                            onClick={() => void sendAction(account, "buy")}
                          >
                            BUY
                          </button>
                        </div>
                        <div className="pilot-button-row">
                          <button
                            className="close-sell"
                            disabled={disabled}
                            onClick={() =>
                              void sendAction(account, "close_sell")
                            }
                          >
                            CLOSE
                          </button>
                          <button
                            className="close-buy"
                            disabled={disabled}
                            onClick={() =>
                              void sendAction(account, "close_buy")
                            }
                          >
                            CLOSE
                          </button>
                        </div>
                        <button
                          className="close-all"
                          disabled={disabled}
                          onClick={() => void sendAction(account, "close_all")}
                        >
                          CLOSE ALL
                        </button>
                        <div
                          className="pilot-currency-row"
                          aria-label="Mata uang tampilan"
                        >
                          {(["USD", "IDR", "CENT"] as const).map(mode => (
                            <button
                              key={mode}
                              className={displayMode === mode ? "selected" : ""}
                              onClick={() =>
                                setCurrencyModes(current => ({
                                  ...current,
                                  [account.id]: mode,
                                }))
                              }
                            >
                              {mode}
                            </button>
                          ))}
                        </div>
                      </div>
                      <AccountRunningProfit
                        account={account}
                        displayMode={displayMode}
                      />
                      <div className="pilot-reset-row">
                        <button
                          className="reset-all"
                          disabled={disabled}
                          onClick={() => void sendAction(account, "reset")}
                        >
                          RESET ALL
                        </button>
                      </div>
                    </article>
                  </div>
                );
              })}
            </div>
            {accounts.length > 0 && filteredAccounts.length === 0 && (
              <div className="pilot-search-empty">
                <span>
                  Tidak ada panel EA yang cocok dengan pencarian atau filter.
                </span>
                <button
                  onClick={() => {
                    setAccountSearch("");
                    setConnectionFilter("all");
                  }}
                >
                  Hapus filter
                </button>
              </div>
            )}
            <footer className="pilot-copyright">
              © 2026 MT5 PILOT by CapikBinGozel - PRIVATE EA WORKSPACE
            </footer>
          </>
        )}
      </section>

      {showAdd && (
        <div
          className="pilot-modal-backdrop"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setShowAdd(false);
          }}
        >
          <section
            className="pilot-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pilot-create-title"
          >
            <button
              className="pilot-modal-x"
              aria-label="Tutup"
              onClick={() => setShowAdd(false)}
            >
              <X size={18} />
            </button>
            <div className="pilot-kicker">KONEKSI BARU</div>
            <h2 id="pilot-create-title">Buat token EA</h2>
            <p>
              Nama ini membantu membedakan akun di dashboard. Token hanya
              ditampilkan sekali; jangan bagikan token EA.
            </p>
            <form onSubmit={createAccount}>
              <label>
                Label koneksi
                <input
                  required
                  maxLength={80}
                  value={accountName}
                  onChange={event => setAccountName(event.target.value)}
                  placeholder="Contoh: Fast-Grid MT5 01"
                />
              </label>
              <div className="pilot-info compact">
                <ShieldCheck size={14} />
                <span>
                  EA baru dimulai dalam mode MANUAL. AUTO hanya aktif setelah
                  perintah eksplisit dari dashboard. Jangan hubungkan akun live
                  sebelum memeriksa URL, token, konfigurasi risiko, dan akun
                  MT5.
                </span>
              </div>
              <div className="pilot-modal-actions">
                <button
                  type="button"
                  className="pilot-cancel"
                  onClick={() => setShowAdd(false)}
                >
                  Batal
                </button>
                <button
                  className="pilot-add-button"
                  disabled={busyAction === "create"}
                >
                  {busyAction === "create" ? "Membuat…" : "Buat token"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {tokenModal && (
        <div className="pilot-modal-backdrop">
          <section
            className="pilot-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pilot-token-title"
          >
            <div className="pilot-success">
              <Check size={19} />
            </div>
            <div className="pilot-kicker">KONEKSI DIBUAT</div>
            <h2 id="pilot-token-title">Masukkan token ini ke EA</h2>
            <p>
              Token untuk <b>{tokenModal.label}</b> hanya ditampilkan sekali.
              Simpan sebelum menutup dialog. Koneksi baru dimulai MANUAL.
              Sebelum menghubungkan EA, pastikan akun MT5, konfigurasi risiko,
              dan mode trading benar.
            </p>
            <div className="pilot-token-box">
              <code>{tokenModal.token}</code>
              <button aria-label="Salin token" onClick={() => void copyToken()}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <div className="pilot-setup">
              <strong>Pengaturan Fast-Grid</strong>
              <span>PilotApiBaseUrl =</span>
              <code>
                {typeof window !== "undefined"
                  ? apiUrl("/api/mt5")
                  : "/api/mt5"}
              </code>
              <span>EAConnectionToken = token di atas</span>
              <span>
                MetaTrader → Tools → Options → Expert Advisors → izinkan
                WebRequest untuk:
              </span>
              <code>
                {typeof window !== "undefined"
                  ? API_ORIGIN
                  : "HTTPS API URL"}
              </code>
            </div>
            <div className="pilot-modal-actions">
              <button className="pilot-cancel" onClick={() => void copyToken()}>
                {copied ? "Token disalin" : "Salin token"}
              </button>
              <button
                className="pilot-add-button"
                onClick={() => setTokenModal(null)}
              >
                Saya sudah simpan
              </button>
            </div>
          </section>
        </div>
      )}
      {editingAccount && (
        <div
          className="pilot-modal-backdrop"
          onMouseDown={event => {
            if (
              event.target === event.currentTarget &&
              !savingConfig &&
              !savingPollInterval &&
              !savingAccountLabel &&
              !deletingAccount
            )
              setEditingAccount(null);
          }}
        >
          <section
            className="pilot-modal pilot-config-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pilot-config-title"
          >
            <button
              type="button"
              className="pilot-modal-x"
              aria-label="Tutup editor"
              disabled={
                savingConfig ||
                savingPollInterval ||
                savingAccountLabel ||
                deletingAccount
              }
              onClick={() => setEditingAccount(null)}
            >
              <X size={18} />
            </button>
            <div className="pilot-kicker">KONFIGURASI REMOTE · PILOT</div>
            <h2 id="pilot-config-title">Edit parameter EA</h2>
            <div className="pilot-card-name-editor">
              <label>
                Nama kartu EA
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={editingAccountLabel}
                  onChange={event => setEditingAccountLabel(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === "Enter") event.preventDefault();
                  }}
                />
              </label>
              <button
                type="button"
                className="pilot-cancel"
                disabled={
                  savingAccountLabel ||
                  savingConfig ||
                  savingPollInterval ||
                  deletingAccount ||
                  !editingAccountLabel.trim() ||
                  editingAccountLabel.trim() === editingAccount.label
                }
                onClick={() => void saveAccountLabel()}
              >
                {savingAccountLabel ? "Menyimpan…" : "Simpan nama kartu"}
              </button>
            </div>
            <div
              className="pilot-config-account"
              aria-label="Informasi akun MT5"
            >
              <span>
                <strong>Login MT5</strong>
                {editingAccount.mt5_login ?? "Belum diterima dari EA"}
              </span>
              <span>
                <strong>Server</strong>
                {editingAccount.server_name || "Belum diterima dari EA"}
              </span>
            </div>
            <AccountTelemetry
              account={editingAccount}
              displayMode={
                currencyModes[editingAccount.id] ??
                editingAccount.display_currency ??
                "USD"
              }
            />
            <div className="pilot-polling-control">
              <div>
                <strong>Pengiriman informasi ke Pilot</strong>
                <p>
                  Seberapa sering EA mengirim telemetry. Default 500 ms; lebih
                  cepat berarti lebih banyak request.
                </p>
              </div>
              <div className="pilot-polling-row">
                <select
                  aria-label="Interval pengiriman informasi ke Pilot"
                  value={editingTelemetryIntervalMs}
                  onChange={event =>
                    setEditingTelemetryIntervalMs(Number(event.target.value))
                  }
                  disabled={savingPollInterval || savingConfig}
                >
                  <option value={500}>Cepat · 500 ms (default)</option>
                  <option value={1000}>Normal · 1 detik</option>
                  <option value={2000}>Hemat · 2 detik</option>
                </select>
              </div>
              <div>
                <strong>Pengecekan perintah dari Pilot</strong>
                <p>
                  Seberapa sering EA memeriksa tombol atau perubahan parameter.
                  Default 1000 ms.
                </p>
              </div>
              <div className="pilot-polling-row">
                <select
                  aria-label="Interval pengecekan perintah dari Pilot"
                  value={editingPollIntervalMs}
                  onChange={event =>
                    setEditingPollIntervalMs(Number(event.target.value))
                  }
                  disabled={savingPollInterval || savingConfig}
                >
                  <option value={2000}>Hemat · 2 detik</option>
                  <option value={1000}>Normal · 1 detik (default)</option>
                  <option value={500}>Cepat · 500 ms</option>
                </select>
                <button
                  type="button"
                  className="pilot-cancel"
                  disabled={
                    savingPollInterval ||
                    savingConfig ||
                    (editingPollIntervalMs ===
                      (editingAccount.poll_interval_ms ?? 1000) &&
                      editingTelemetryIntervalMs ===
                        (editingAccount.telemetry_interval_ms ?? 500))
                  }
                  onClick={() => void savePollingInterval()}
                >
                  {savingPollInterval ? "Menyimpan…" : "Simpan interval"}
                </button>
              </div>
            </div>
            <p>
              Perubahan parameter dikirim ke EA melalui antrean aman. EA harus
              online untuk menerima konfigurasi.
            </p>
            <form onSubmit={saveConfig}>
              <div className="pilot-config-grid">
                {coreConfigFields.map(([key, label, kind, options]) => (
                  <label key={key}>
                    {label}
                    {kind === "select" ? (
                      <select
                        value={Number(editingConfig[key])}
                        onChange={event =>
                          setEditingConfig(current => ({
                            ...current,
                            [key]: Number(event.target.value),
                          }))
                        }
                      >
                        {options?.map(([value, optionLabel]) => (
                          <option key={value} value={value}>
                            {optionLabel}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="number"
                        step="any"
                        required
                        value={
                          editingConfig[key] === ""
                            ? ""
                            : Number(editingConfig[key])
                        }
                        onChange={event =>
                          setEditingConfig(current => ({
                            ...current,
                            [key]:
                              event.target.value === ""
                                ? ""
                                : Number(event.target.value),
                          }))
                        }
                      />
                    )}
                  </label>
                ))}
              </div>
              <div className="pilot-modal-actions">
                <button
                  type="button"
                  className="pilot-cancel"
                  disabled={
                    savingConfig ||
                    savingPollInterval ||
                    savingAccountLabel ||
                    deletingAccount
                  }
                  onClick={() => setEditingAccount(null)}
                >
                  Batal
                </button>
                <button
                  className="pilot-add-button"
                  disabled={
                    !canWrite ||
                    savingConfig ||
                    savingPollInterval ||
                    savingAccountLabel ||
                    deletingAccount ||
                    !editingAccount.connection_status ||
                    editingAccount.connection_status === "offline"
                  }
                >
                  {savingConfig ? "Mengirim…" : "Simpan & kirim ke EA"}
                </button>
              </div>
            </form>
            <div className="pilot-delete-zone">
              <strong>Hapus EA dari Pilot</strong>
              <p>
                EA tetap berjalan di terminal MT5, tetapi koneksi, telemetri,
                dan kontrol remote Pilot untuk akun ini akan dicabut.
              </p>
              <label>
                Konfirmasi (ketik HAPUS){" "}
                {user.email && <span>· {user.email}</span>}
                <input
                  type="text"
                  autoComplete="off"
                  value={deleteConfirmation}
                  onChange={event => setDeleteConfirmation(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === "Enter") event.preventDefault();
                  }}
                  placeholder="HAPUS"
                />
              </label>
              <button
                type="button"
                className="pilot-delete-button"
                disabled={
                  deleteConfirmation.trim().toUpperCase() !== "HAPUS" ||
                  deletingAccount ||
                  savingConfig ||
                  savingPollInterval ||
                  savingAccountLabel
                }
                onClick={() => void deleteAccountFromPilot()}
              >
                {deletingAccount ? "Menghapus…" : "Hapus EA dari Pilot"}
              </button>
            </div>
          </section>
        </div>
      )}
      {showProfileEditor && (
        <div
          className="pilot-modal-backdrop"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !savingProfile)
              setShowProfileEditor(false);
          }}
        >
          <section
            className="pilot-modal pilot-user-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pilot-profile-title"
          >
            <button
              type="button"
              className="pilot-modal-x"
              aria-label="Tutup edit akun"
              disabled={savingProfile}
              onClick={() => setShowProfileEditor(false)}
            >
              <X size={18} />
            </button>
            <div className="pilot-kicker">AKUN SAYA · SUPABASE AUTH</div>
            <h2 id="pilot-profile-title">Edit akun saya</h2>
            <p>
              Nama, email, dan kata sandi diperbarui melalui Supabase Auth.
              Jika konfirmasi email aktif, alamat baru mulai digunakan setelah
              tautan konfirmasi dibuka.
            </p>
            <form className="pilot-profile-form" onSubmit={saveProfile}>
              <label>
                Email login
                <input
                  type="email"
                  autoComplete="username"
                  required
                  maxLength={320}
                  value={profileEmail}
                  onChange={event => setProfileEmail(event.target.value)}
                />
              </label>
              <label>
                Nama tampilan
                <input
                  type="text"
                  autoComplete="name"
                  required
                  maxLength={200}
                  value={profileName}
                  onChange={event => setProfileName(event.target.value)}
                  placeholder="Nama Anda"
                />
              </label>
              <label>
                Kata sandi baru
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={profilePassword}
                  onChange={event => setProfilePassword(event.target.value)}
                  placeholder="Kosongkan jika tidak ingin mengganti"
                />
              </label>
              <p className="pilot-sidebar-hint">
                Minimal 8 karakter. Kosongkan kolom password untuk mengubah
                nama saja.
              </p>
              <div className="pilot-modal-actions">
                <button
                  type="button"
                  className="pilot-cancel"
                  disabled={savingProfile}
                  onClick={() => setShowProfileEditor(false)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="pilot-add-button"
                  disabled={savingProfile || !profileName.trim()}
                >
                  {savingProfile ? "Menyimpan…" : "Simpan perubahan"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {showUserManager && (
        <div
          className="pilot-modal-backdrop"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setShowUserManager(false);
          }}
        >
          <section
            className="pilot-modal pilot-user-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pilot-users-title"
          >
            <button
              type="button"
              className="pilot-modal-x"
              aria-label="Tutup pengaturan pengguna"
              onClick={() => setShowUserManager(false)}
            >
              <X size={18} />
            </button>
            <div className="pilot-kicker">AKSES · OWNER ONLY</div>
            <h2 id="pilot-users-title">Kelola pengguna</h2>
            <p>
              Undang alamat email melalui Supabase Auth. Pengguna mengatur kata
              sandi melalui tautan undangan; Read-only hanya dapat melihat,
              sedangkan staff hanya dapat menjalankan tombol pada akun yang
              Anda pilih. Role dan assignment diperiksa di server.
            </p>
            <form
              className="pilot-user-create-form"
              onSubmit={createReadOnlyUser}
            >
              <label>
                Email akun
                <input
                  type="email"
                  autoComplete="off"
                  required
                  maxLength={320}
                  value={newUserEmail}
                  onChange={event => setNewUserEmail(event.target.value)}
                  placeholder="nama@contoh.com"
                />
              </label>
              <label>
                Role
                <select
                  value={newUserRole}
                  onChange={event =>
                    setNewUserRole(event.target.value as "read_only" | "staff")
                  }
                >
                  <option value="read_only">Read-only</option>
                  <option value="staff">Staff</option>
                </select>
              </label>
              {newUserRole === "staff" && (
                <fieldset className="pilot-staff-account-picker">
                  <legend>Akun yang boleh diakses</legend>
                  {accounts.length ? (
                    accounts.map((account, index) => (
                      <label key={account.id}>
                        <input
                          type="checkbox"
                          checked={selectedStaffAccountIds.includes(account.id)}
                          onChange={event =>
                            setSelectedStaffAccountIds(current =>
                              event.target.checked
                                ? [...current, account.id]
                                : current.filter(id => id !== account.id)
                            )
                          }
                        />
                        <span>
                          {account.label}
                          {account.broker_account_name
                            ? ` - ${account.broker_account_name}`
                            : ` · Akun ${index + 1}`}
                        </span>
                      </label>
                    ))
                  ) : (
                    <span className="pilot-sidebar-hint">
                      Belum ada akun tersedia untuk dipilih.
                    </span>
                  )}
                </fieldset>
              )}
              <button
                className="pilot-add-button"
                disabled={
                  creatingUser ||
                  !canWrite ||
                  (newUserRole === "staff" &&
                    selectedStaffAccountIds.length === 0)
                }
              >
                {creatingUser
                  ? "Membuat akun…"
                  : `Beri akses ${newUserRole === "staff" ? "staff" : "read-only"}`}
              </button>
            </form>
            <div className="pilot-managed-users">
              <strong>Pengguna terdaftar</strong>
              {loadingUsers ? (
                <span>Memuat…</span>
              ) : managedUsers.length ? (
                managedUsers.map(managedUser => (
                  <div key={managedUser.user_id}>
                    <span>
                      {managedUser.email}
                      <small className="pilot-managed-scope">
                        {managedUser.access_role === "staff"
                          ? `STAFF · ${managedUser.account_labels?.join(", ") || "Tanpa akun"}`
                          : "READ-ONLY · semua akun (lihat saja)"}
                      </small>
                    </span>
                    <small>
                      {new Date(managedUser.created_at).toLocaleDateString(
                        "id-ID"
                      )}
                    </small>
                    <button
                      type="button"
                      className="pilot-delete-button"
                      onClick={() => void revokeManagedUser(managedUser.email)}
                    >
                      Cabut akses
                    </button>
                  </div>
                ))
              ) : (
                <span>Belum ada pengguna.</span>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
