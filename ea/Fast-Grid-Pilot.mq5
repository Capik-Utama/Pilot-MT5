//+------------------------------------------------------------------+
//|                                                Fast-Grid.mq5     |
//|                                Copyright 2026, Gemini AI Labs    |
//+------------------------------------------------------------------+
#property copyright "Copyright 2026"
#property link      "https://www.mql5.com"
#property version   "1.10"

#include <Trade/Trade.mqh>

enum ENUM_TRADE_MODE { MODE_BELI_JUAL, MODE_BELI_SAJA, MODE_JUAL_SAJA };
enum ENUM_CL_TYPE { CL_NILAI_UANG, CL_PERSEN };
enum ENUM_AFTER_LOGIC { SETELAH_STOP_HARI_INI, SETELAH_LANJUT };
enum ENUM_TS_MODE { MODE_GLOBAL_PER_ARAH, MODE_GLOBAL_SEMUA_ARAH };
enum EN_TIME_OUT_ACT { AKSI_HENTIKAN_MASUK, AKSI_TUTUP_SEMUA };
enum ENUM_DISPLAY_CURRENCY { MATA_USD, MATA_CENT, MATA_IDR };

input group "== Koneksi MT5 Pilot =="
input bool EnablePilotRemote = true;
input string SupabaseFunctionUrl = "https://qqdsultliybypiuvihli.supabase.co/functions/v1/mt5-api";
input string SupabasePublishableKey = "sb_publishable_Kfj9_n9hWcuexbpXuPWGDQ_SiUzDaH2";
input string EAConnectionToken = ""; // Tempel token yang dibuat dashboard. Jangan bagikan.

input group "== Mode Perdagangan =="
input ENUM_TRADE_MODE ModePerdagangan = MODE_BELI_JUAL;
input EN_TIME_OUT_ACT AksiDiLuarWaktu = AKSI_TUTUP_SEMUA;

input group "== Mata Uang Tampilan =="
input ENUM_DISPLAY_CURRENCY MataUangTampilan = MATA_IDR;
input double    KursUSD_IDR        = 17000.0;

input group "== Identitas Arah Perdagangan =="
input int     MagicBeli    = 2864384;
input int     MagicJual   = 2864385;

input group "== Pengaturan Lot & Pengganda =="
input double    LotAwal         = 0.01;
input double    PenggandaLot   = 1.2;
input double    LotMaksimal          = 5.0;
input int       LangkahLayer       = 5;
input int       JarakGrid        = 100;
input int       JarakTrailingPending = 50;

input group "== Pengaman Perdagangan =="

input group "== Penutupan (Stop Loss & Target Harian) =="
input ENUM_CL_TYPE JenisBatasRugi   = CL_NILAI_UANG;
input double    BatasKerugian    = 10000.0;
input double    TargetHarian = 2000.0;
input ENUM_AFTER_LOGIC SetelahTargetTercapai = SETELAH_STOP_HARI_INI;

input group "== Pengaturan Trailing (POIN) =="
input ENUM_TS_MODE ModeTrailing   = MODE_GLOBAL_PER_ARAH;
input int        MulaiTrailingPoin = 150;
input int        KunciProfitPoin    = 50;
input int        LangkahTrailingPoin  = 5;

input group "== Pengaturan Hari & Waktu (Waktu Server) =="
input bool AktifSenin = true;
input int  SeninMulaiJam = 0;
input int  SeninMulaiMenit = 0;
input int  SeninSelesaiJam = 0;
input int  SeninSelesaiMenit = 0;

input bool AktifSelasa = true;
input int  SelasaMulaiJam = 0;
input int  SelasaMulaiMenit = 0;
input int  SelasaSelesaiJam = 0;
input int  SelasaSelesaiMenit = 0;

input bool AktifRabu = true;
input int  RabuMulaiJam = 0;
input int  RabuMulaiMenit = 0;
input int  RabuSelesaiJam = 0;
input int  RabuSelesaiMenit = 0;

input bool AktifKamis = true;
input int  KamisMulaiJam = 0;
input int  KamisMulaiMenit = 0;
input int  KamisSelesaiJam = 0;
input int  KamisSelesaiMenit = 0;

input bool AktifJumat = true;
input int  JumatMulaiJam = 0;
input int  JumatMulaiMenit = 0;
input int  JumatSelesaiJam = 23;
input int  JumatSelesaiMenit = 0;

input bool AktifSabtu = false;
input int  SabtuMulaiJam = 0;
input int  SabtuMulaiMenit = 0;
input int  SabtuSelesaiJam = 0;
input int  SabtuSelesaiMenit = 0;

input bool AktifMinggu = false;
input int  MingguMulaiJam = 0;
input int  MingguMulaiMenit = 0;
input int  MingguSelesaiJam = 0;
input int  MingguSelesaiMenit = 0;

CTrade trade;
double VSL_BuyPrice = 0, VSL_SellPrice = 0;
double MaxCombinedProfitPoints = 0;
double MaxFloatBuy = 0, MaxFloatSell = 0;
double MaxDrawdownBuy = 0, MaxDrawdownSell = 0;
datetime ResetTime = 0, LastDayReset = 0;
bool IsStoppedByTarget = false;

double PendingTrail_BuyPrice = 0;
double PendingTrail_SellPrice = 0;

string UIPrefix = "DG_";
int CurrentCurrencyMode = 0;
double InpUsdToIdr = 18000.0;
bool isAutoTradingActive = false; // Default aman: Manual sampai pemilik memilih Auto.
uint LastPilotTelemetryAt = 0;
uint LastPilotPollAt = 0;
int LastPilotLatencyMs = 0;

bool IsInsideTradingTime();
void CreateDashboard();
void RefreshDashboardUI();
void DeleteTrailingOrders();
void BulkCloseAll();
void BulkCloseDirection(int m);
bool OpenOrder(ENUM_ORDER_TYPE type, double lot, int magic);
void CheckStopLossPerDirection();
bool CheckDailyTarget();
void ApplyGlobalTrailingPoints();
void ManageTrailingVisualLines();
void CheckInitialEntry();
bool CheckDirectionReEntry();
void CheckAndLayer();
bool HasOpenPositions();
double CalculateNextLot(double currentLot, double multiplier);
bool IsCentAccount();
string FormatCurrency(double amount);
void UpdateFloatingStats();
void PilotOnTimer();
void PilotSendTelemetry();
void PilotPollCommands();
int PilotHttp(const string method, const string route, const string body, string &response);
bool PilotAck(const string commandId, const string status, const string message);
string PilotJsonEscape(const string value);
string PilotJsonString(const string json, const string key);
double PilotFloatingProfit();
double PilotDailyProfit();
bool PilotCloseMagic(const int magic, int &closedCount, string &details);

int OnInit() {
   if(!MQLInfoInteger(MQL_TESTER) && AccountInfoInteger(ACCOUNT_TRADE_MODE) != ACCOUNT_TRADE_MODE_DEMO) {
      Print("Fast-Grid Pilot: EA ini dikunci untuk akun DEMO. Inisialisasi dibatalkan.");
      return(INIT_FAILED);
   }
   ResetTime = (datetime)SeriesInfoInteger(_Symbol, PERIOD_D1, SERIES_LASTBAR_DATE);
   LastDayReset = ResetTime;
   trade.LogLevel(LOG_LEVEL_NO);

   if(MataUangTampilan == MATA_CENT) CurrentCurrencyMode = 1;
   else if(MataUangTampilan == MATA_IDR) CurrentCurrencyMode = 2;
   else CurrentCurrencyMode = 0;

   InpUsdToIdr = KursUSD_IDR;

   isAutoTradingActive = false;
   CreateDashboard();
   if(EnablePilotRemote && !MQLInfoInteger(MQL_TESTER)) EventSetTimer(2);
   if(EnablePilotRemote && EAConnectionToken == "")
      Print("Fast-Grid Pilot: tempel EAConnectionToken dari dashboard agar telemetri aktif.");
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason) {
   EventKillTimer();
   ObjectsDeleteAll(0, UIPrefix);
   DeleteTrailingOrders();
   ObjectDelete(0, UIPrefix + "LineBuyTS");
   ObjectDelete(0, UIPrefix + "LineSellTS");
   ObjectDelete(0, UIPrefix + "LinePendingBuy");
   ObjectDelete(0, UIPrefix + "LinePendingSell");
}

bool IsCentAccount() {
   string accCurrency = AccountInfoString(ACCOUNT_CURRENCY);
   string symbol = _Symbol;

   if(StringFind(accCurrency, "USC") >= 0 ||
      StringFind(accCurrency, "Cent") >= 0 ||
      StringFind(accCurrency, "cent") >= 0 ||
      StringFind(symbol, ".sc") >= 0) {
      return true;
   }
   return false;
}

string FormatCurrency(double amount) {
   double usdAmount = IsCentAccount() ? (amount / 100.0) : amount;

   if(CurrentCurrencyMode == 1) {
      return StringFormat("%.2f USC", usdAmount * 100.0);
   } else if(CurrentCurrencyMode == 2) {
      return StringFormat("%.0f IDR", usdAmount * InpUsdToIdr);
   } else {
      return StringFormat("%.2f USD", usdAmount);
   }
}

void CreateUIButton(string name, string text, int x, int y, int xSize, int ySize, color bgColor, color txtColor=clrWhite, int fontSize=9) {
   string fullName = UIPrefix + name;
   if(ObjectFind(0, fullName) < 0) {
      ObjectCreate(0, fullName, OBJ_BUTTON, 0, 0, 0);
      ObjectSetInteger(0, fullName, OBJPROP_CORNER, CORNER_RIGHT_UPPER);
      ObjectSetInteger(0, fullName, OBJPROP_XDISTANCE, x);
      ObjectSetInteger(0, fullName, OBJPROP_YDISTANCE, y);
      ObjectSetInteger(0, fullName, OBJPROP_XSIZE, xSize);
      ObjectSetInteger(0, fullName, OBJPROP_YSIZE, ySize);
      ObjectSetString(0, fullName, OBJPROP_TEXT, text);
      ObjectSetInteger(0, fullName, OBJPROP_BGCOLOR, bgColor);
      ObjectSetInteger(0, fullName, OBJPROP_COLOR, txtColor);
      ObjectSetInteger(0, fullName, OBJPROP_FONTSIZE, fontSize);
      ObjectSetString(0, fullName, OBJPROP_FONT, "Arial Bold");
      ObjectSetInteger(0, fullName, OBJPROP_BACK, false);
      ObjectSetInteger(0, fullName, OBJPROP_SELECTABLE, false);
   }
}

void CreateUILabel(string name, string text, int x, int y, color txtColor, int fontSize=10, bool bold=false) {
   string fullName = UIPrefix + name;
   if(ObjectFind(0, fullName) < 0) {
      ObjectCreate(0, fullName, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, fullName, OBJPROP_CORNER, CORNER_RIGHT_UPPER);
      ObjectSetInteger(0, fullName, OBJPROP_XDISTANCE, x);
      ObjectSetInteger(0, fullName, OBJPROP_YDISTANCE, y);
      ObjectSetString(0, fullName, OBJPROP_TEXT, text);
      ObjectSetInteger(0, fullName, OBJPROP_COLOR, txtColor);
      ObjectSetInteger(0, fullName, OBJPROP_FONTSIZE, fontSize);
      ObjectSetString(0, fullName, OBJPROP_FONT, bold ? "Arial Bold" : "Arial");
      ObjectSetInteger(0, fullName, OBJPROP_BACK, false);
      ObjectSetInteger(0, fullName, OBJPROP_SELECTABLE, false);
   }
}

void UpdateCurrencyButtonsUI() {
   ObjectSetInteger(0, UIPrefix + "BtnUsd", OBJPROP_BGCOLOR, (CurrentCurrencyMode == 0 ? clrLime : clrGray));
   ObjectSetInteger(0, UIPrefix + "BtnUsd", OBJPROP_COLOR, (CurrentCurrencyMode == 0 ? clrBlack : clrWhite));

   ObjectSetInteger(0, UIPrefix + "BtnCent", OBJPROP_BGCOLOR, (CurrentCurrencyMode == 1 ? clrLime : clrGray));
   ObjectSetInteger(0, UIPrefix + "BtnCent", OBJPROP_COLOR, (CurrentCurrencyMode == 1 ? clrBlack : clrWhite));

   ObjectSetInteger(0, UIPrefix + "BtnIdr", OBJPROP_BGCOLOR, (CurrentCurrencyMode == 2 ? clrLime : clrGray));
   ObjectSetInteger(0, UIPrefix + "BtnIdr", OBJPROP_COLOR, (CurrentCurrencyMode == 2 ? clrBlack : clrWhite));
}

void CreateDashboard() {
   string bgName = UIPrefix + "BgPanel";

   if(ObjectFind(0, bgName) < 0) {
      ObjectCreate(0, bgName, OBJ_BUTTON, 0, 0, 0);
      ObjectSetInteger(0, bgName, OBJPROP_CORNER, CORNER_RIGHT_UPPER);
      ObjectSetInteger(0, bgName, OBJPROP_XDISTANCE, 250);
      ObjectSetInteger(0, bgName, OBJPROP_YDISTANCE, 15);
      ObjectSetInteger(0, bgName, OBJPROP_XSIZE, 310);
      ObjectSetInteger(0, bgName, OBJPROP_YSIZE, 350);
      ObjectSetInteger(0, bgName, OBJPROP_BGCOLOR, clrBlack);
      ObjectSetInteger(0, bgName, OBJPROP_COLOR, clrDarkGray);
      ObjectSetInteger(0, bgName, OBJPROP_STATE, false);
      ObjectSetInteger(0, bgName, OBJPROP_SELECTABLE, false);
      ObjectSetString(0, bgName, OBJPROP_TEXT, "");
      ObjectSetInteger(0, bgName, OBJPROP_BACK, false);
   }

   CreateUILabel("Header", "*Grid_By_Capik*", 240, 16, clrLime, 22, true);

   CreateUIButton("BtnManual", "MANUAL", 240, 50, 105, 22, (!isAutoTradingActive ? clrLime : clrGray), clrWhite, 11);
   CreateUIButton("BtnAuto", "AUTO", 115, 50, 105, 22, (isAutoTradingActive ? clrLime : clrGray), clrWhite, 11);

   CreateUIButton("BtnSell", "SELL", 240, 76, 105, 25, clrRed, clrWhite, 12);
   CreateUIButton("BtnBuy", "BUY", 115, 76, 105, 25, clrBlue, clrWhite, 12);

   CreateUIButton("BtnCloseSell", "Close Sell", 240, 104, 105, 22, C'150,0,0', clrWhite, 12);
   CreateUIButton("BtnCloseBuy", "Close Buy", 115, 104, 105, 22, C'0,0,150', clrWhite, 12);

   CreateUIButton("BtnCloseAll", "CLOSE ALL", 240, 130, 230, 26, C'0,120,0', clrWhite, 12);

   CreateUIButton("BtnUsd", "USD", 240, 160, 68, 22, clrLime, clrBlack, 12);
   CreateUIButton("BtnIdr", "IDR", 160, 160, 68, 22, clrGray, clrWhite, 12);
   CreateUIButton("BtnCent", "CENT", 80, 160, 68, 22, clrGray, clrWhite, 12);

   CreateUILabel("BasketSLSet", "Basket SL Set: 0", 235, 188, clrYellow, 10, true);
   CreateUILabel("DailyTargetSet", "Daily Target Set: 0", 235, 206, clrLime, 10, true);
   CreateUILabel("MaxFloatBuy", "Max Float Buy: 0", 235, 224, clrLightSkyBlue, 11, true);
   CreateUILabel("MaxFloatSell", "Max Float Sell: 0", 235, 242, clrLightSkyBlue, 11, true);
   CreateUILabel("Running", "Running: 0", 235, 260, clrYellow, 12, true);
   CreateUILabel("Profit", "Profit: 0", 235, 280, clrLime, 16, true);
   CreateUILabel("Status", "Status: ACTIVE", 235, 308, clrWhite, 10, true);

   CreateUIButton("BtnReset", "RESET ALL", 230, 328, 220, 24, clrBlue, clrWhite, 14);

   UpdateCurrencyButtonsUI();
}

void RefreshDashboardUI() {
   if(ObjectFind(0, UIPrefix + "BgPanel") < 0) {
      CreateDashboard();
   }

   UpdateCurrencyButtonsUI();

   string slText = "";
   if(JenisBatasRugi == CL_NILAI_UANG) slText = "Basket SL Set: -" + FormatCurrency(BatasKerugian);
   else slText = StringFormat("Basket SL Set: -%.1f%%", BatasKerugian);

   string dtText = "Daily Target Set: " + FormatCurrency(TargetHarian);

   ObjectSetString(0, UIPrefix + "BasketSLSet", OBJPROP_TEXT, slText);
   ObjectSetString(0, UIPrefix + "DailyTargetSet", OBJPROP_TEXT, dtText);

   // Update current floating statistics and historical peak floating values.
   UpdateFloatingStats();

   double hProf = 0;
   if(HistorySelect(ResetTime, TimeCurrent())) {
      for(int i=HistoryDealsTotal()-1; i>=0; i--) {
         ulong t = HistoryDealGetTicket(i);
         if(t == 0) continue;
         if(HistoryDealGetString(t, DEAL_SYMBOL) != _Symbol) continue;
         int m = (int)HistoryDealGetInteger(t, DEAL_MAGIC);
         if(m != MagicBeli && m != MagicJual) continue;
         hProf += HistoryDealGetDouble(t, DEAL_PROFIT) +
                  HistoryDealGetDouble(t, DEAL_COMMISSION) +
                  HistoryDealGetDouble(t, DEAL_SWAP);
      }
   }

   double runningFloat = 0.0;
   for(int i=PositionsTotal()-1; i>=0; i--) {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      int m = (int)PositionGetInteger(POSITION_MAGIC);
      if(m == MagicBeli || m == MagicJual)
         runningFloat += PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
   }

   ObjectSetString(0, UIPrefix + "MaxFloatBuy", OBJPROP_TEXT,
                   "Max Float Buy: " + FormatCurrency(MaxFloatBuy));
   ObjectSetString(0, UIPrefix + "MaxFloatSell", OBJPROP_TEXT,
                   "Max Float Sell: " + FormatCurrency(MaxFloatSell));
   ObjectSetString(0, UIPrefix + "Running", OBJPROP_TEXT,
                   "Running: " + FormatCurrency(runningFloat));
   ObjectSetInteger(0, UIPrefix + "Running", OBJPROP_COLOR,
                    (runningFloat >= 0 ? clrLime : clrYellow));

   ObjectSetString(0, UIPrefix + "Profit", OBJPROP_TEXT,
                   "Profit: " + FormatCurrency(hProf));
   ObjectSetInteger(0, UIPrefix + "Profit", OBJPROP_COLOR,
                    (hProf >= 0 ? clrLime : clrRed));

   string statusText = "Status: ACTIVE";
   if(IsStoppedByTarget) statusText = "Status: TARGET HIT";
   else if(!IsInsideTradingTime()) statusText = "Status: OUT OF TIME";
   else if(ModeTrailing == MODE_GLOBAL_PER_ARAH && (VSL_BuyPrice > 0 || VSL_SellPrice > 0)) statusText = "Status: TS PER ARAH";
   else if(ModeTrailing == MODE_GLOBAL_SEMUA_ARAH && MaxCombinedProfitPoints > 0) statusText = StringFormat("Status: TS ALL (%.0f Pts)", MaxCombinedProfitPoints);

   ObjectSetString(0, UIPrefix + "Status", OBJPROP_TEXT, statusText);

   ObjectSetInteger(0, UIPrefix + "BtnAuto", OBJPROP_BGCOLOR, (isAutoTradingActive ? clrLime : clrGray));
   ObjectSetInteger(0, UIPrefix + "BtnManual", OBJPROP_BGCOLOR, (!isAutoTradingActive ? clrLime : clrGray));
}

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam) {
   if(id == CHARTEVENT_OBJECT_CLICK) {
      if(sparam == UIPrefix + "BtnReset") {
         // Reset TOTAL state: clear target lock, restart the daily calculation
         // from the moment RESET is pressed, and clear all trailing state.
         IsStoppedByTarget = false;
         ResetTime = TimeCurrent();
         LastDayReset = (datetime)SeriesInfoInteger(_Symbol, PERIOD_D1, SERIES_LASTBAR_DATE);

         MaxFloatBuy = 0;
         MaxFloatSell = 0;
         MaxCombinedProfitPoints = 0;
         VSL_BuyPrice = 0;
         VSL_SellPrice = 0;
         PendingTrail_BuyPrice = 0;
         PendingTrail_SellPrice = 0;

         DeleteTrailingOrders();
         ObjectDelete(0, UIPrefix + "LineBuyTS");
         ObjectDelete(0, UIPrefix + "LineSellTS");
         ObjectDelete(0, UIPrefix + "LinePendingBuy");
         ObjectDelete(0, UIPrefix + "LinePendingSell");

         ObjectSetInteger(0, UIPrefix + "BtnReset", OBJPROP_STATE, false);

         // If AUTO is active and trading time is valid, start a new cycle immediately.
         // The existing entry/layer logic is reused unchanged.
         if(isAutoTradingActive && IsInsideTradingTime()) {
            // Start only the initial basket here. Layering starts on the next tick
            // after the newly opened positions are established.
            CheckInitialEntry();
         }
      }
      else if(sparam == UIPrefix + "BtnCloseAll") {
         BulkCloseAll();
         ObjectSetInteger(0, UIPrefix + "BtnCloseAll", OBJPROP_STATE, false);
      }
      else if(sparam == UIPrefix + "BtnCloseBuy") {
         BulkCloseDirection(MagicBeli);
         ObjectSetInteger(0, UIPrefix + "BtnCloseBuy", OBJPROP_STATE, false);
      }
      else if(sparam == UIPrefix + "BtnCloseSell") {
         BulkCloseDirection(MagicJual);
         ObjectSetInteger(0, UIPrefix + "BtnCloseSell", OBJPROP_STATE, false);
      }
      else if(sparam == UIPrefix + "BtnBuy") {
         OpenOrder(ORDER_TYPE_BUY, LotAwal, MagicBeli);
         ObjectSetInteger(0, UIPrefix + "BtnBuy", OBJPROP_STATE, false);
      }
      else if(sparam == UIPrefix + "BtnSell") {
         OpenOrder(ORDER_TYPE_SELL, LotAwal, MagicJual);
         ObjectSetInteger(0, UIPrefix + "BtnSell", OBJPROP_STATE, false);
      }
      else if(sparam == UIPrefix + "BtnAuto") {
         isAutoTradingActive = true;
         ObjectSetInteger(0, UIPrefix + "BtnAuto", OBJPROP_STATE, false);
      }
      else if(sparam == UIPrefix + "BtnManual") {
         isAutoTradingActive = false;
         ObjectSetInteger(0, UIPrefix + "BtnManual", OBJPROP_STATE, false);
      }
      else if(sparam == UIPrefix + "BtnUsd") {
         CurrentCurrencyMode = 0;
         ObjectSetInteger(0, UIPrefix + "BtnUsd", OBJPROP_STATE, false);
      }
      else if(sparam == UIPrefix + "BtnCent") {
         CurrentCurrencyMode = 1;
         ObjectSetInteger(0, UIPrefix + "BtnCent", OBJPROP_STATE, false);
      }
      else if(sparam == UIPrefix + "BtnIdr") {
         CurrentCurrencyMode = 2;
         ObjectSetInteger(0, UIPrefix + "BtnIdr", OBJPROP_STATE, false);
      }

      RefreshDashboardUI();
   }
}

void OnTimer() {
   PilotOnTimer();
}

void PilotOnTimer() {
   if(!EnablePilotRemote || MQLInfoInteger(MQL_TESTER) || EAConnectionToken == "") return;
   if(AccountInfoInteger(ACCOUNT_TRADE_MODE) != ACCOUNT_TRADE_MODE_DEMO) return;
   uint now = GetTickCount();
   if(now - LastPilotTelemetryAt >= 2500) {
      LastPilotTelemetryAt = now;
      PilotSendTelemetry();
   }
   now = GetTickCount();
   if(now - LastPilotPollAt >= 1500) {
      LastPilotPollAt = now;
      PilotPollCommands();
   }
}

string PilotJsonEscape(const string value) {
   string out = "";
   for(int i = 0; i < StringLen(value); i++) {
      ushort c = (ushort)StringGetCharacter(value, i);
      if(c == 34) out += "\\\"";
      else if(c == 92) out += "\\\\";
      else if(c == 10) out += "\\n";
      else if(c == 13) out += "\\r";
      else if(c == 9) out += "\\t";
      else if(c >= 32) out += ShortToString(c);
   }
   return out;
}

int PilotHttp(const string method, const string route, const string body, string &response) {
   if(StringLen(EAConnectionToken) < 40) return -1;
   char data[];
   if(body != "") {
      int copied = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
      if(copied > 0) ArrayResize(data, copied - 1); // Exclude the terminating NUL.
   }
   char result[];
   string resultHeaders;
   string headers = "Content-Type: application/json\r\napikey: " + SupabasePublishableKey +
                    "\r\nAuthorization: Bearer " + EAConnectionToken + "\r\n";
   ResetLastError();
   int code = WebRequest(method, SupabaseFunctionUrl + "?route=" + route, headers, 3000, data, result, resultHeaders);
   response = CharArrayToString(result, 0, -1, CP_UTF8);
   if(code < 0) {
      int err = GetLastError();
      if(err != 4014) PrintFormat("MT5 Pilot: WebRequest gagal, error=%d. Izinkan URL Supabase di Options > Expert Advisors.", err);
   }
   return code;
}

string PilotJsonString(const string json, const string key) {
   string needle = "\"" + key + "\"";
   int p = StringFind(json, needle);
   if(p < 0) return "";
   p = StringFind(json, ":", p + StringLen(needle));
   if(p < 0) return "";
   p++;
   while(p < StringLen(json) && (StringGetCharacter(json, p) == 32 || StringGetCharacter(json, p) == 9 || StringGetCharacter(json, p) == 10 || StringGetCharacter(json, p) == 13)) p++;
   if(p >= StringLen(json) || StringGetCharacter(json, p) != 34) return "";
   p++;
   string value = "";
   bool escaped = false;
   for(int i = p; i < StringLen(json); i++) {
      ushort c = (ushort)StringGetCharacter(json, i);
      if(escaped) {
         if(c == 34 || c == 92 || c == 47) value += ShortToString(c);
         else if(c == 110) value += "\n";
         else if(c == 114) value += "\r";
         else if(c == 116) value += "\t";
         escaped = false;
      } else if(c == 92) escaped = true;
      else if(c == 34) return value;
      else value += ShortToString(c);
   }
   return "";
}

bool PilotAck(const string commandId, const string status, const string message) {
   string response = "";
   string body = "{\"status\":\"" + status + "\",\"message\":\"" + PilotJsonEscape(message) + "\"}";
   int code = PilotHttp("POST", "/commands/" + commandId + "/ack", body, response);
   return (code >= 200 && code < 300);
}

double PilotFloatingProfit() {
   double total = 0.0;
   for(int i = PositionsTotal() - 1; i >= 0; i--) {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      int magic = (int)PositionGetInteger(POSITION_MAGIC);
      if(magic == MagicBeli || magic == MagicJual)
         total += PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
   }
   return total;
}

// Match the chart panel's Profit row: closed deals only. Open-position P/L is reported separately as Running.
double PilotDailyProfit() {
   double total = 0.0;
   if(HistorySelect(ResetTime, TimeCurrent())) {
      for(int i = HistoryDealsTotal() - 1; i >= 0; i--) {
         ulong deal = HistoryDealGetTicket(i);
         if(deal == 0 || HistoryDealGetString(deal, DEAL_SYMBOL) != _Symbol) continue;
         int magic = (int)HistoryDealGetInteger(deal, DEAL_MAGIC);
         if(magic == MagicBeli || magic == MagicJual)
            total += HistoryDealGetDouble(deal, DEAL_PROFIT) + HistoryDealGetDouble(deal, DEAL_COMMISSION) + HistoryDealGetDouble(deal, DEAL_SWAP);
      }
   }
   return total;
}

void PilotSendTelemetry() {
   UpdateFloatingStats();
   double floating = PilotFloatingProfit();
   bool demo = (AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_DEMO);
   string mode = isAutoTradingActive ? "auto" : "manual";
   string eaStatus = "ACTIVE";
   if(IsStoppedByTarget) eaStatus = "TARGET HIT";
   else if(!IsInsideTradingTime()) eaStatus = "OUT OF TIME";
   else if(ModeTrailing == MODE_GLOBAL_PER_ARAH && (VSL_BuyPrice > 0 || VSL_SellPrice > 0)) eaStatus = "TS PER ARAH";
   else if(ModeTrailing == MODE_GLOBAL_SEMUA_ARAH && MaxCombinedProfitPoints > 0) eaStatus = StringFormat("TS ALL (%.0f Pts)", MaxCombinedProfitPoints);
   int openPositions = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--) {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      int magic = (int)PositionGetInteger(POSITION_MAGIC);
      if(magic == MagicBeli || magic == MagicJual) openPositions++;
   }
   string body = "{\"accountName\":\"" + PilotJsonEscape(AccountInfoString(ACCOUNT_NAME)) +
      "\",\"login\":" + IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN)) +
      ",\"serverName\":\"" + PilotJsonEscape(AccountInfoString(ACCOUNT_SERVER)) +
      "\",\"balance\":" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) +
      ",\"equity\":" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) +
      ",\"maxDdBuy\":" + DoubleToString(MathAbs(MaxDrawdownBuy), 2) +
      ",\"maxDdSell\":" + DoubleToString(MathAbs(MaxDrawdownSell), 2) +
      ",\"basketSlSet\":" + DoubleToString(BatasKerugian, 2) +
      ",\"basketSlType\":\"" + (JenisBatasRugi == CL_NILAI_UANG ? "money" : "percent") + "\"" +
      ",\"dailyTargetSet\":" + DoubleToString(TargetHarian, 2) +
      ",\"maxFloatBuy\":" + DoubleToString(MaxFloatBuy, 2) +
      ",\"maxFloatSell\":" + DoubleToString(MaxFloatSell, 2) +
      ",\"runningFloat\":" + DoubleToString(floating, 2) +
      ",\"openPositions\":" + IntegerToString(openPositions) +
      ",\"eaStatus\":\"" + PilotJsonEscape(eaStatus) + "\"" +
      ",\"profit\":" + DoubleToString(PilotDailyProfit(), 2) +
      ",\"floatingProfit\":" + DoubleToString(floating, 2) +
      ",\"running\":" + (isAutoTradingActive && !IsStoppedByTarget ? "true" : "false") +
      ",\"isDemo\":" + (demo ? "true" : "false") +
      ",\"eaMode\":\"" + mode + "\",\"currency\":\"" + PilotJsonEscape(AccountInfoString(ACCOUNT_CURRENCY)) +
      "\",\"latencyMs\":" + IntegerToString(LastPilotLatencyMs) + "}";
   string response = "";
   uint started = GetTickCount();
   int code = PilotHttp("POST", "/telemetry", body, response);
   uint elapsed = GetTickCount() - started;
   if(code >= 200 && code < 300) LastPilotLatencyMs = (int)MathMin(elapsed, 60000);
   else if(code >= 400) PrintFormat("MT5 Pilot: telemetri ditolak (HTTP %d).", code);
}

bool PilotCloseMagic(const int magic, int &closedCount, string &details) {
   closedCount = 0;
   int failures = 0;
   trade.SetAsyncMode(false);
   for(int i = PositionsTotal() - 1; i >= 0; i--) {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol || (int)PositionGetInteger(POSITION_MAGIC) != magic) continue;
      bool sent = trade.PositionClose(ticket);
      uint retcode = trade.ResultRetcode();
      if(sent && (retcode == TRADE_RETCODE_DONE || retcode == TRADE_RETCODE_DONE_PARTIAL)) closedCount++;
      else {
         failures++;
         PrintFormat("MT5 Pilot: close ticket %I64u gagal: %u %s", ticket, retcode, trade.ResultRetcodeDescription());
      }
   }
   if(magic == MagicBeli) { VSL_BuyPrice = 0; PendingTrail_BuyPrice = 0; MaxFloatBuy = 0; ObjectDelete(0, UIPrefix + "LineBuyTS"); ObjectDelete(0, UIPrefix + "LinePendingBuy"); }
   if(magic == MagicJual) { VSL_SellPrice = 0; PendingTrail_SellPrice = 0; MaxFloatSell = 0; ObjectDelete(0, UIPrefix + "LineSellTS"); ObjectDelete(0, UIPrefix + "LinePendingSell"); }
   details = StringFormat("Posisi ditutup: %d; gagal: %d. Entry otomatis dinonaktifkan ke Manual.", closedCount, failures);
   return failures == 0;
}

void PilotPollCommands() {
   string response = "";
   int code = PilotHttp("GET", "/commands/next", "", response);
   if(code == 204 || code == 200 && response == "") return;
   if(code != 200) {
      if(code >= 400) PrintFormat("MT5 Pilot: polling perintah gagal (HTTP %d).", code);
      return;
   }
   string commandId = PilotJsonString(response, "commandId");
   string action = PilotJsonString(response, "action");
   if(commandId == "" || action == "") return;

   string dedupeKey = "MTP_" + IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN)) + "_" + commandId;
   if(GlobalVariableCheck(dedupeKey)) {
      PilotAck(commandId, "failed", "Perintah duplikat ditahan setelah restart EA; periksa posisi akun secara manual sebelum mengirim ulang.");
      return;
   }
   if(!PilotAck(commandId, "accepted", "Perintah diterima EA demo.")) return;
   GlobalVariableSet(dedupeKey, (double)TimeCurrent()); // Persist before any trading action to prevent accidental replay.

   string result = "";
   bool success = false;
   if(action == "manual") {
      isAutoTradingActive = false;
      success = true;
      result = "Mode Manual aktif. Entry baru berhenti; pengaman SL/trailing tetap berjalan.";
   } else if(action == "auto") {
      if(AccountInfoInteger(ACCOUNT_TRADE_MODE) != ACCOUNT_TRADE_MODE_DEMO) {
         isAutoTradingActive = false;
         result = "Auto ditolak: EA hanya mengizinkan akun demo.";
      } else {
         isAutoTradingActive = true;
         success = true;
         result = "Mode Auto aktif pada akun demo.";
      }
   } else if(action == "buy" || action == "sell") {
      if(AccountInfoInteger(ACCOUNT_TRADE_MODE) != ACCOUNT_TRADE_MODE_DEMO) {
         result = "Order manual ditolak: EA hanya mengizinkan akun demo.";
      } else {
         bool isBuy = action == "buy";
         success = OpenOrder(isBuy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, LotAwal, isBuy ? MagicBeli : MagicJual);
         result = success ? StringFormat("Order %s dikirim dengan lot awal %.2f.", isBuy ? "BUY" : "SELL", LotAwal) : "Order ditolak broker; periksa log MT5.";
      }
   } else if(action == "reset") {
      if(AccountInfoInteger(ACCOUNT_TRADE_MODE) != ACCOUNT_TRADE_MODE_DEMO) {
         result = "Reset ditolak: EA hanya mengizinkan akun demo.";
      } else {
         IsStoppedByTarget = false;
         ResetTime = TimeCurrent();
         LastDayReset = (datetime)SeriesInfoInteger(_Symbol, PERIOD_D1, SERIES_LASTBAR_DATE);
         MaxFloatBuy = 0;
         MaxFloatSell = 0;
         MaxCombinedProfitPoints = 0;
         VSL_BuyPrice = 0;
         VSL_SellPrice = 0;
         PendingTrail_BuyPrice = 0;
         PendingTrail_SellPrice = 0;
         DeleteTrailingOrders();
         ObjectDelete(0, UIPrefix + "LineBuyTS");
         ObjectDelete(0, UIPrefix + "LineSellTS");
         ObjectDelete(0, UIPrefix + "LinePendingBuy");
         ObjectDelete(0, UIPrefix + "LinePendingSell");
         if(isAutoTradingActive && IsInsideTradingTime()) CheckInitialEntry();
         success = true;
         result = "Statistik harian dan state trailing direset.";
      }
   } else if(action == "close_buy" || action == "close_sell" || action == "close_all") {
      if(AccountInfoInteger(ACCOUNT_TRADE_MODE) != ACCOUNT_TRADE_MODE_DEMO) {
         result = "Perintah tutup ditolak: EA hanya mengizinkan akun demo.";
      } else {
         isAutoTradingActive = false;
         int closedBuy = 0, closedSell = 0;
         string detailBuy = "", detailSell = "";
         if(action == "close_buy") success = PilotCloseMagic(MagicBeli, closedBuy, result);
         else if(action == "close_sell") success = PilotCloseMagic(MagicJual, closedSell, result);
         else {
            bool buyOk = PilotCloseMagic(MagicBeli, closedBuy, detailBuy);
            bool sellOk = PilotCloseMagic(MagicJual, closedSell, detailSell);
            success = buyOk && sellOk;
            result = StringFormat("BUY ditutup %d posisi; SELL ditutup %d posisi. %s", closedBuy, closedSell, success ? "" : "Sebagian penutupan gagal.");
            DeleteTrailingOrders();
         }
      }
   } else {
      result = "Aksi tidak dikenal; tidak ada order dikirim.";
   }
   RefreshDashboardUI();
   PilotAck(commandId, success ? "succeeded" : "failed", result);
   Print("MT5 Pilot: ", result);
}

void OnTick() {
   datetime currentDay = (datetime)SeriesInfoInteger(_Symbol, PERIOD_D1, SERIES_LASTBAR_DATE);

   if(currentDay > LastDayReset) {
      ResetTime = currentDay; LastDayReset = currentDay;
      IsStoppedByTarget = false; MaxFloatBuy = 0; MaxFloatSell = 0; MaxCombinedProfitPoints = 0;
   }

   if(!IsStoppedByTarget && CheckDailyTarget()) {
      IsStoppedByTarget = true;
      BulkCloseAll();
   }

   if(IsStoppedByTarget) {
      if(HasOpenPositions()) {
         BulkCloseAll();
      }
      DeleteTrailingOrders();
      RefreshDashboardUI();
      if(SetelahTargetTercapai == SETELAH_STOP_HARI_INI) return;
   }

   CheckStopLossPerDirection();

   bool isInsideTime = IsInsideTradingTime();

   if(!isInsideTime) {
      if(AksiDiLuarWaktu == AKSI_TUTUP_SEMUA) {
         if(HasOpenPositions()) {
            BulkCloseAll();
            RefreshDashboardUI();
            DeleteTrailingOrders();
            return;
         }
      }
   }

   if(isInsideTime && !IsStoppedByTarget && isAutoTradingActive) {
      // Start a completely new basket when there are no positions.
      if(!HasOpenPositions()) {
         CheckInitialEntry();
      }
      else {
         // IMPORTANT: manage each direction independently. If BUY has
         // closed while SELL remains open (or vice versa), immediately
         // re-enter the closed direction instead of waiting for the whole
         // basket to become empty.
         bool reentered = CheckDirectionReEntry();

         // Do not layer on the same tick that a closed direction is
         // re-entered. The fresh position must get a full grid cycle first.
         if(!reentered)
            CheckAndLayer();
      }
   }

   ApplyGlobalTrailingPoints();
   RefreshDashboardUI();
   ManageTrailingVisualLines();
}

bool HasOpenPositions() {
   for(int i=PositionsTotal()-1; i>=0; i--) {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionSelectByTicket(ticket) && PositionGetString(POSITION_SYMBOL) == _Symbol) {
         int m = (int)PositionGetInteger(POSITION_MAGIC);
         if(m == MagicBeli || m == MagicJual) return true;
      }
   }
   return false;
}

// Re-entry is handled per direction. If one side of a BUY+SELL cycle
// has been completely closed while the other side is still running,
// immediately start a new cycle for the closed direction.
bool CheckDirectionReEntry() {
   int buyCount = 0;
   int sellCount = 0;
   bool reentered = false;

   for(int i=PositionsTotal()-1; i>=0; i--) {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;

      int magic = (int)PositionGetInteger(POSITION_MAGIC);
      if(magic == MagicBeli)
         buyCount++;
      else if(magic == MagicJual)
         sellCount++;
   }

   // BUY side was closed: re-enter BUY immediately when BUY is enabled.
   if((ModePerdagangan == MODE_BELI_JUAL || ModePerdagangan == MODE_BELI_SAJA) && buyCount == 0) {
      OpenOrder(ORDER_TYPE_BUY, LotAwal, MagicBeli);
      reentered = true;
   }

   // SELL side was closed: re-enter SELL immediately when SELL is enabled.
   if((ModePerdagangan == MODE_BELI_JUAL || ModePerdagangan == MODE_JUAL_SAJA) && sellCount == 0) {
      OpenOrder(ORDER_TYPE_SELL, LotAwal, MagicJual);
      reentered = true;
   }

   return reentered;
}

double CalculateNextLot(double currentLot, double multiplier) {
   double volStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double targetLot = currentLot * multiplier;

   if(volStep > 0.0) {
      targetLot = MathFloor(targetLot / volStep + 0.5) * volStep;
      if(multiplier > 1.0 && targetLot <= currentLot)
         targetLot = currentLot + volStep;
   }

   if(targetLot > LotMaksimal)
      targetLot = LotMaksimal;

   return NormalizeDouble(targetLot, 2);
}

void CheckInitialEntry() {
   if(HasOpenPositions()) return;

   if(ModePerdagangan == MODE_BELI_JUAL || ModePerdagangan == MODE_BELI_SAJA)
      OpenOrder(ORDER_TYPE_BUY, LotAwal, MagicBeli);

   if(ModePerdagangan == MODE_BELI_JUAL || ModePerdagangan == MODE_JUAL_SAJA)
      OpenOrder(ORDER_TYPE_SELL, LotAwal, MagicJual);
}

void CheckAndLayer() {
   // Trailing-pending grid logic:
   // JarakGrid is the full grid distance and JarakTrailingPending is the
   // retracement distance. The pending mechanism starts at
   // (JarakGrid - JarakTrailingPending).
   // Example BUY: Distance=500, Trailing=50 -> pending line appears at
   // 450 points from the anchor. If price continues to 1000 points away,
   // the line follows at 950 points. When price retraces to that line,
   // a BUY is opened. The SELL side is the mirror image.
   if(JarakGrid <= 0) {
      PendingTrail_BuyPrice = 0;
      PendingTrail_SellPrice = 0;
      return;
   }

   // Trailing-pending is valid only when the trailing distance is smaller
   // than the full grid distance. Otherwise use the normal grid entry.
   bool useTrailingPending = (JarakTrailingPending > 0 &&
                              JarakTrailingPending < JarakGrid);

   int bC=0, sC=0;
   double lbp=0, lsp=0;
   double lLotBuy=LotAwal, lLotSell=LotAwal;

   for(int i=PositionsTotal()-1; i>=0; i--) {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionSelectByTicket(ticket) && PositionGetString(POSITION_SYMBOL) == _Symbol) {
         int m = (int)PositionGetInteger(POSITION_MAGIC);
         double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);

         if(m == MagicBeli) {
            // BUY grid anchor = lowest BUY open price.
            if(lbp == 0 || openPrice < lbp) {
               lbp = openPrice;
               lLotBuy = PositionGetDouble(POSITION_VOLUME);
            }
            bC++;
         }
         else if(m == MagicJual) {
            // SELL grid anchor = highest SELL open price.
            if(lsp == 0 || openPrice > lsp) {
               lsp = openPrice;
               lLotSell = PositionGetDouble(POSITION_VOLUME);
            }
            sC++;
         }
      }
   }

   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   int layerStep = MathMax(1, LangkahLayer);

   // ================================================================
   // BUY SIDE
   // ================================================================
   if(bC > 0) {
      // A pending BUY already exists. Keep following the new low and
      // never move the pending level backwards. The order is triggered
      // when price retraces upward to the pending level.
      if(JarakTrailingPending > 0 && PendingTrail_BuyPrice > 0) {
         double calculatedTrail = ask + JarakTrailingPending * _Point;

         // Price continues lower -> move the pending BUY lower as well.
         if(calculatedTrail < PendingTrail_BuyPrice)
            PendingTrail_BuyPrice = calculatedTrail;

         // Price retraces upward and touches the pending level -> entry.
         if(ask >= PendingTrail_BuyPrice) {
            double nL = (bC % layerStep == 0)
                        ? CalculateNextLot(lLotBuy, PenggandaLot)
                        : lLotBuy;
            OpenOrder(ORDER_TYPE_BUY, nL, MagicBeli);
            PendingTrail_BuyPrice = 0;
         }
      }
      // No pending BUY yet: activate when price reaches the effective
      // trigger = JarakGrid - JarakTrailingPending. The first pending
      // level is exactly that distance from the anchor. After activation,
      // it follows the lowest price by JarakTrailingPending points.
      else if(useTrailingPending &&
              ask <= (lbp - (JarakGrid - JarakTrailingPending) * _Point)) {
         double firstPending = lbp - (JarakGrid - JarakTrailingPending) * _Point;
         double trailingPending = ask + JarakTrailingPending * _Point;

         // If price moved farther than the trigger in a single tick, keep
         // the pending line at the proper trailing distance from that low.
         PendingTrail_BuyPrice = MathMin(firstPending, trailingPending);
      }
      // Traditional grid mode when trailing-pending is disabled.
      else if(!useTrailingPending &&
              ask <= (lbp - JarakGrid * _Point)) {
         double nL = (bC % layerStep == 0)
                     ? CalculateNextLot(lLotBuy, PenggandaLot)
                     : lLotBuy;
         OpenOrder(ORDER_TYPE_BUY, nL, MagicBeli);
      }
   }
   else {
      PendingTrail_BuyPrice = 0;
   }

   // ================================================================
   // SELL SIDE
   // ================================================================
   if(sC > 0) {
      // A pending SELL already exists. Keep following the new high and
      // never move the pending level backwards. The order is triggered
      // when price retraces downward to the pending level.
      if(JarakTrailingPending > 0 && PendingTrail_SellPrice > 0) {
         double calculatedTrail = bid - JarakTrailingPending * _Point;

         // Price continues higher -> move the pending SELL higher too.
         if(calculatedTrail > PendingTrail_SellPrice)
            PendingTrail_SellPrice = calculatedTrail;

         // Price retraces downward and touches the pending level -> entry.
         if(bid <= PendingTrail_SellPrice) {
            double nL = (sC % layerStep == 0)
                        ? CalculateNextLot(lLotSell, PenggandaLot)
                        : lLotSell;
            OpenOrder(ORDER_TYPE_SELL, nL, MagicJual);
            PendingTrail_SellPrice = 0;
         }
      }
      // No pending SELL yet: activate when price reaches the effective
      // trigger = JarakGrid - JarakTrailingPending. The first pending
      // level is exactly that distance from the anchor. After activation,
      // it follows the highest price by JarakTrailingPending points.
      else if(useTrailingPending &&
              bid >= (lsp + (JarakGrid - JarakTrailingPending) * _Point)) {
         double firstPending = lsp + (JarakGrid - JarakTrailingPending) * _Point;
         double trailingPending = bid - JarakTrailingPending * _Point;

         // If price moved farther than the trigger in a single tick, keep
         // the pending line at the proper trailing distance from that high.
         PendingTrail_SellPrice = MathMax(firstPending, trailingPending);
      }
      // Traditional grid mode when trailing-pending is disabled.
      else if(!useTrailingPending &&
              bid >= (lsp + JarakGrid * _Point)) {
         double nL = (sC % layerStep == 0)
                     ? CalculateNextLot(lLotSell, PenggandaLot)
                     : lLotSell;
         OpenOrder(ORDER_TYPE_SELL, nL, MagicJual);
      }
   }
   else {
      PendingTrail_SellPrice = 0;
   }
}

void BulkCloseAll() {
   trade.SetAsyncMode(true);

   for(int i=PositionsTotal()-1; i>=0; i--) {
      ulong ticket = PositionGetTicket(i);
      if(PositionSelectByTicket(ticket) && PositionGetString(POSITION_SYMBOL) == _Symbol) {
         int m = (int)PositionGetInteger(POSITION_MAGIC);
         if(m == MagicBeli || m == MagicJual) {
            trade.PositionClose(ticket);
         }
      }
   }

   trade.SetAsyncMode(false);
   Sleep(10);

   VSL_BuyPrice = 0;
   VSL_SellPrice = 0;
   PendingTrail_BuyPrice = 0;
   PendingTrail_SellPrice = 0;
   MaxCombinedProfitPoints = 0;

   ObjectDelete(0, UIPrefix + "LineBuyTS");
   ObjectDelete(0, UIPrefix + "LineSellTS");
   ObjectDelete(0, UIPrefix + "LinePendingBuy");
   ObjectDelete(0, UIPrefix + "LinePendingSell");

   DeleteTrailingOrders();
}

void BulkCloseDirection(int m) {
   trade.SetAsyncMode(true);

   for(int i=PositionsTotal()-1; i>=0; i--) {
      ulong ticket = PositionGetTicket(i);
      if(PositionSelectByTicket(ticket) && PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == m) {
         trade.PositionClose(ticket);
      }
   }

   trade.SetAsyncMode(false);
   Sleep(10);

   if(m == MagicBeli) {
      VSL_BuyPrice = 0;
      PendingTrail_BuyPrice = 0;
      ObjectDelete(0, UIPrefix + "LineBuyTS");
      ObjectDelete(0, UIPrefix + "LinePendingBuy");
   }
   if(m == MagicJual) {
      VSL_SellPrice = 0;
      PendingTrail_SellPrice = 0;
      ObjectDelete(0, UIPrefix + "LineSellTS");
      ObjectDelete(0, UIPrefix + "LinePendingSell");
   }
   DeleteTrailingOrders();
}

bool OpenOrder(ENUM_ORDER_TYPE type, double lot, int magic) {
   double p = (type == ORDER_TYPE_BUY) ? SymbolInfoDouble(_Symbol, SYMBOL_ASK) : SymbolInfoDouble(_Symbol, SYMBOL_BID);

   lot = NormalizeDouble(MathMax(SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN), MathMin(LotMaksimal, MathMin(SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX), lot))), 2);

   trade.SetExpertMagicNumber(magic);
   bool sent = trade.PositionOpen(_Symbol, type, lot, p, 0, 0);
   if(!sent) {
      PrintFormat("Fast-Grid: order failed. type=%d magic=%d retcode=%d (%s)",
                  (int)type, magic, trade.ResultRetcode(), trade.ResultRetcodeDescription());
      return false;
   }
   return trade.ResultRetcode() == TRADE_RETCODE_DONE || trade.ResultRetcode() == TRADE_RETCODE_PLACED;
}

void UpdateFloatingStats() {
   double currentBuyFloat = 0.0;
   double currentSellFloat = 0.0;
   bool hasBuy = false;
   bool hasSell = false;

   for(int i=PositionsTotal()-1; i>=0; i--) {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;

      int m = (int)PositionGetInteger(POSITION_MAGIC);
      double fp = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);

      if(m == MagicBeli) {
         currentBuyFloat += fp;
         hasBuy = true;
      }
      else if(m == MagicJual) {
         currentSellFloat += fp;
         hasSell = true;
      }
   }

   // Max Float is the highest absolute floating value reached during the
   // current cycle. The sign follows the current floating direction.
   if(hasBuy) {
      if(MathAbs(currentBuyFloat) > MathAbs(MaxFloatBuy))
         MaxFloatBuy = currentBuyFloat;
      if(currentBuyFloat < MaxDrawdownBuy) MaxDrawdownBuy = currentBuyFloat;
   }
   if(hasSell) {
      if(MathAbs(currentSellFloat) > MathAbs(MaxFloatSell))
         MaxFloatSell = currentSellFloat;
      if(currentSellFloat < MaxDrawdownSell) MaxDrawdownSell = currentSellFloat;
   }
}

void CheckStopLossPerDirection() {
   double pB = 0, pS = 0;

   for(int i=PositionsTotal()-1; i>=0; i--) {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!PositionSelectByTicket(ticket) || PositionGetString(POSITION_SYMBOL) != _Symbol) continue;

      int m = (int)PositionGetInteger(POSITION_MAGIC);
      double profit = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
      if(m == MagicBeli) pB += profit;
      else if(m == MagicJual) pS += profit;
   }

   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double stopAmount = (JenisBatasRugi == CL_NILAI_UANG) ? BatasKerugian : (balance * BatasKerugian / 100.0);

   if(pB <= -stopAmount && pB != 0) {
      BulkCloseDirection(MagicBeli);
      MaxFloatBuy = 0;
   }
   if(pS <= -stopAmount && pS != 0) {
      BulkCloseDirection(MagicJual);
      MaxFloatSell = 0;
   }
}

bool CheckDailyTarget() {
   // Target harian dihitung dari HASIL BERSIH hari berjalan:
   // profit/realisasi yang sudah ditutup + floating profit/loss posisi yang masih terbuka.
   // Dengan demikian, target tidak dianggap tercapai ketika total hasil hari ini
   // masih minus hanya karena sebelumnya ada profit yang sudah direalisasi.

   double realizedProfit = 0.0;

   if(HistorySelect(ResetTime, TimeCurrent())) {
      for(int i=HistoryDealsTotal()-1; i>=0; i--) {
         ulong t = HistoryDealGetTicket(i);
         if(t == 0) continue;
         if(HistoryDealGetString(t, DEAL_SYMBOL) != _Symbol) continue;

         int m = (int)HistoryDealGetInteger(t, DEAL_MAGIC);
         if(m == MagicBeli || m == MagicJual) {
            realizedProfit += HistoryDealGetDouble(t, DEAL_PROFIT) +
                              HistoryDealGetDouble(t, DEAL_COMMISSION) +
                              HistoryDealGetDouble(t, DEAL_SWAP);
         }
      }
   }

   double floatingProfit = 0.0;

   for(int i=PositionsTotal()-1; i>=0; i--) {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;

      int m = (int)PositionGetInteger(POSITION_MAGIC);
      if(m == MagicBeli || m == MagicJual) {
         floatingProfit += PositionGetDouble(POSITION_PROFIT) +
                           PositionGetDouble(POSITION_SWAP);
      }
   }

   double dailyNetProfit = realizedProfit + floatingProfit;

   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double targetAmount = (JenisBatasRugi == CL_NILAI_UANG)
                         ? TargetHarian
                         : (balance * TargetHarian / 100.0);

   // Target hanya boleh aktif jika HASIL BERSIH hari ini benar-benar
   // sudah mencapai target. Posisi floating minus ikut mengurangi hasil.
   return (dailyNetProfit >= targetAmount);
}

void ApplyGlobalTrailingPoints() {
   double bL=0, bO=0, sL=0, sO=0;
   for(int i=PositionsTotal()-1; i>=0; i--) {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionSelectByTicket(ticket) && PositionGetString(POSITION_SYMBOL) == _Symbol) {
         int m = (int)PositionGetInteger(POSITION_MAGIC);
         double vol = PositionGetDouble(POSITION_VOLUME);
         double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
         if(m == MagicBeli) {
            bL += vol;
            bO += openPrice * vol;
         }
         else if(m == MagicJual) {
            sL += vol;
            sO += openPrice * vol;
         }
      }
   }
   if(ModeTrailing == MODE_GLOBAL_PER_ARAH) {
      if(bL > 0) {
         double avgPrice = bO / bL;
         double curPrice = SymbolInfoDouble(_Symbol, SYMBOL_BID);
         if(curPrice > avgPrice + MulaiTrailingPoin * _Point) {
            double newSL = curPrice - LangkahTrailingPoin * _Point;
            double lockSL = avgPrice + KunciProfitPoin * _Point;
            if(newSL > VSL_BuyPrice) VSL_BuyPrice = MathMax(newSL, lockSL);
         }
         if(VSL_BuyPrice > 0 && curPrice <= VSL_BuyPrice) {
            BulkCloseDirection(MagicBeli);
            VSL_BuyPrice = 0;
         }
      } else {
         VSL_BuyPrice = 0;
         ObjectDelete(0, UIPrefix + "LineBuyTS");
      }

      if(sL > 0) {
         double avgPrice = sO / sL;
         double curPrice = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
         if(curPrice < avgPrice - MulaiTrailingPoin * _Point) {
            double newSL = curPrice + LangkahTrailingPoin * _Point;
            double lockSL = avgPrice - KunciProfitPoin * _Point;
            if(VSL_SellPrice == 0 || newSL < VSL_SellPrice) VSL_SellPrice = MathMin(newSL, lockSL);
         }
         if(VSL_SellPrice > 0 && curPrice >= VSL_SellPrice) {
            BulkCloseDirection(MagicJual);
            VSL_SellPrice = 0;
         }
      } else {
         VSL_SellPrice = 0;
         ObjectDelete(0, UIPrefix + "LineSellTS");
      }
   }
   else if(ModeTrailing == MODE_GLOBAL_SEMUA_ARAH) {
      double totalLot = bL + sL;
      if(totalLot > 0) {
         double avgBuy  = (bL > 0) ? (bO / bL) : 0;
         double avgSell = (sL > 0) ? (sO / sL) : 0;
         double bid     = SymbolInfoDouble(_Symbol, SYMBOL_BID);
         double ask     = SymbolInfoDouble(_Symbol, SYMBOL_ASK);

         double buyPoints  = (bL > 0) ? ((bid - avgBuy) / _Point) * bL : 0;
         double sellPoints = (sL > 0) ? ((avgSell - ask) / _Point) * sL : 0;
         double combinedPoints = (buyPoints + sellPoints) / totalLot;

         if(combinedPoints >= MulaiTrailingPoin) {
            if(MaxCombinedProfitPoints == 0 || combinedPoints > MaxCombinedProfitPoints) {
               MaxCombinedProfitPoints = combinedPoints;
            }
         }

         if(MaxCombinedProfitPoints > 0) {
            double targetStopPoints = MathMax((double)KunciProfitPoin, MaxCombinedProfitPoints - LangkahTrailingPoin);
            if(combinedPoints <= targetStopPoints) {
               BulkCloseAll();
               MaxCombinedProfitPoints = 0;
            }
         }
      } else {
         MaxCombinedProfitPoints = 0;
      }
   }
}

void ManageTrailingVisualLines() {
   if(IsStoppedByTarget) {
      DeleteTrailingOrders();
      ObjectDelete(0, UIPrefix + "LineBuyTS");
      ObjectDelete(0, UIPrefix + "LineSellTS");
      ObjectDelete(0, UIPrefix + "LinePendingBuy");
      ObjectDelete(0, UIPrefix + "LinePendingSell");
      return;
   }

   double bL=0, sL=0;
   for(int i=PositionsTotal()-1; i>=0; i--) {
      if(PositionSelectByTicket(PositionGetTicket(i)) && PositionGetString(POSITION_SYMBOL) == _Symbol) {
         int m = (int)PositionGetInteger(POSITION_MAGIC);
         if(m == MagicBeli)  bL += PositionGetDouble(POSITION_VOLUME);
         if(m == MagicJual) sL += PositionGetDouble(POSITION_VOLUME);
      }
   }

   string lineBuyName  = UIPrefix + "LineBuyTS";
   string lineSellName = UIPrefix + "LineSellTS";
   string linePendBuy  = UIPrefix + "LinePendingBuy";
   string linePendSell = UIPrefix + "LinePendingSell";

   if(bL > 0 && PendingTrail_BuyPrice > 0) {
      if(ObjectFind(0, linePendBuy) < 0) {
         ObjectCreate(0, linePendBuy, OBJ_HLINE, 0, 0, PendingTrail_BuyPrice);
         ObjectSetInteger(0, linePendBuy, OBJPROP_COLOR, clrDodgerBlue);
         ObjectSetInteger(0, linePendBuy, OBJPROP_STYLE, STYLE_DASH);
         ObjectSetInteger(0, linePendBuy, OBJPROP_WIDTH, 1);
         ObjectSetString(0, linePendBuy, OBJPROP_TEXT, "Trailing Pending Buy");
         ObjectSetInteger(0, linePendBuy, OBJPROP_SELECTABLE, false);
      } else {
         ObjectSetDouble(0, linePendBuy, OBJPROP_PRICE, PendingTrail_BuyPrice);
      }
   } else {
      ObjectDelete(0, linePendBuy);
   }

   if(sL > 0 && PendingTrail_SellPrice > 0) {
      if(ObjectFind(0, linePendSell) < 0) {
         ObjectCreate(0, linePendSell, OBJ_HLINE, 0, 0, PendingTrail_SellPrice);
         ObjectSetInteger(0, linePendSell, OBJPROP_COLOR, clrOrangeRed);
         ObjectSetInteger(0, linePendSell, OBJPROP_STYLE, STYLE_DASH);
         ObjectSetInteger(0, linePendSell, OBJPROP_WIDTH, 1);
         ObjectSetString(0, linePendSell, OBJPROP_TEXT, "Trailing Pending Sell");
         ObjectSetInteger(0, linePendSell, OBJPROP_SELECTABLE, false);
      } else {
         ObjectSetDouble(0, linePendSell, OBJPROP_PRICE, PendingTrail_SellPrice);
      }
   } else {
      ObjectDelete(0, linePendSell);
   }

   if(ModeTrailing == MODE_GLOBAL_PER_ARAH) {
      if(bL > 0 && VSL_BuyPrice > 0) {
         if(ObjectFind(0, lineBuyName) < 0) {
            ObjectCreate(0, lineBuyName, OBJ_HLINE, 0, 0, VSL_BuyPrice);
            ObjectSetInteger(0, lineBuyName, OBJPROP_COLOR, clrLime);
            ObjectSetInteger(0, lineBuyName, OBJPROP_STYLE, STYLE_SOLID);
            ObjectSetInteger(0, lineBuyName, OBJPROP_WIDTH, 2);
            ObjectSetString(0, lineBuyName, OBJPROP_TEXT, "Trailing Buy Level");
            ObjectSetInteger(0, lineBuyName, OBJPROP_SELECTABLE, false);
         } else {
            ObjectSetDouble(0, lineBuyName, OBJPROP_PRICE, VSL_BuyPrice);
         }
      } else {
         VSL_BuyPrice = 0;
         ObjectDelete(0, lineBuyName);
      }

      if(sL > 0 && VSL_SellPrice > 0) {
         if(ObjectFind(0, lineSellName) < 0) {
            ObjectCreate(0, lineSellName, OBJ_HLINE, 0, 0, VSL_SellPrice);
            ObjectSetInteger(0, lineSellName, OBJPROP_COLOR, clrRed);
            ObjectSetInteger(0, lineSellName, OBJPROP_STYLE, STYLE_SOLID);
            ObjectSetInteger(0, lineSellName, OBJPROP_WIDTH, 2);
            ObjectSetString(0, lineSellName, OBJPROP_TEXT, "Trailing Sell Level");
            ObjectSetInteger(0, lineSellName, OBJPROP_SELECTABLE, false);
         } else {
            ObjectSetDouble(0, lineSellName, OBJPROP_PRICE, VSL_SellPrice);
         }
      } else {
         VSL_SellPrice = 0;
         ObjectDelete(0, lineSellName);
      }
   }
   else if(ModeTrailing == MODE_GLOBAL_SEMUA_ARAH) {
      double bO=0, sO=0;
      for(int i=PositionsTotal()-1; i>=0; i--) {
         if(PositionSelectByTicket(PositionGetTicket(i)) && PositionGetString(POSITION_SYMBOL) == _Symbol) {
            int m = (int)PositionGetInteger(POSITION_MAGIC);
            if(m == MagicBeli)  bO += PositionGetDouble(POSITION_PRICE_OPEN) * PositionGetDouble(POSITION_VOLUME);
            if(m == MagicJual) sO += PositionGetDouble(POSITION_PRICE_OPEN) * PositionGetDouble(POSITION_VOLUME);
         }
      }

      if((bL + sL > 0) && MaxCombinedProfitPoints > 0) {
         double targetStopPts = MathMax((double)KunciProfitPoin, MaxCombinedProfitPoints - LangkahTrailingPoin);

         if(bL > 0 && sL == 0) {
            double avgBuy = bO / bL;
            double vslPrice = avgBuy + targetStopPts * _Point;
            if(ObjectFind(0, lineBuyName) < 0) {
               ObjectCreate(0, lineBuyName, OBJ_HLINE, 0, 0, vslPrice);
               ObjectSetInteger(0, lineBuyName, OBJPROP_COLOR, clrLime);
               ObjectSetInteger(0, lineBuyName, OBJPROP_STYLE, STYLE_SOLID);
               ObjectSetInteger(0, lineBuyName, OBJPROP_WIDTH, 2);
               ObjectSetString(0, lineBuyName, OBJPROP_TEXT, "Trailing All (Buy) Level");
               ObjectSetInteger(0, lineBuyName, OBJPROP_SELECTABLE, false);
            } else {
               ObjectSetDouble(0, lineBuyName, OBJPROP_PRICE, vslPrice);
            }
            ObjectDelete(0, lineSellName);
         }
         else if(sL > 0 && bL == 0) {
            double avgSell = sO / sL;
            double vslPrice = avgSell - targetStopPts * _Point;
            if(ObjectFind(0, lineSellName) < 0) {
               ObjectCreate(0, lineSellName, OBJ_HLINE, 0, 0, vslPrice);
               ObjectSetInteger(0, lineSellName, OBJPROP_COLOR, clrRed);
               ObjectSetInteger(0, lineSellName, OBJPROP_STYLE, STYLE_SOLID);
               ObjectSetInteger(0, lineSellName, OBJPROP_WIDTH, 2);
               ObjectSetString(0, lineSellName, OBJPROP_TEXT, "Trailing All (Sell) Level");
               ObjectSetInteger(0, lineSellName, OBJPROP_SELECTABLE, false);
            } else {
               ObjectSetDouble(0, lineSellName, OBJPROP_PRICE, vslPrice);
            }
            ObjectDelete(0, lineBuyName);
         }
         else {
            ObjectDelete(0, lineBuyName);
            ObjectDelete(0, lineSellName);
         }
      } else {
         ObjectDelete(0, lineBuyName);
         ObjectDelete(0, lineSellName);
      }
   }

   // Force the pending/trailing lines to refresh immediately on the chart.
   ChartRedraw();
}

void DeleteTrailingOrders() {
   for(int i=OrdersTotal()-1; i>=0; i--) {
      ulong ticket = OrderGetTicket(i);
      if(OrderSelect(ticket) && OrderGetString(ORDER_SYMBOL) == _Symbol) {
         string comment = OrderGetString(ORDER_COMMENT);
         if(comment == "TS Trigger Buy" || comment == "TS Trigger Sell") {
            trade.OrderDelete(ticket);
         }
      }
   }
}

bool IsInsideTradingTime() {
   MqlDateTime dt;
   TimeCurrent(dt);

   bool dayEnabled = false;
   int startHour = 0, startMinute = 0, endHour = 0, endMinute = 0;

   switch(dt.day_of_week) {
      case 1:
         dayEnabled = AktifSenin;
         startHour = SeninMulaiJam; startMinute = SeninMulaiMenit;
         endHour = SeninSelesaiJam; endMinute = SeninSelesaiMenit;
         break;
      case 2:
         dayEnabled = AktifSelasa;
         startHour = SelasaMulaiJam; startMinute = SelasaMulaiMenit;
         endHour = SelasaSelesaiJam; endMinute = SelasaSelesaiMenit;
         break;
      case 3:
         dayEnabled = AktifRabu;
         startHour = RabuMulaiJam; startMinute = RabuMulaiMenit;
         endHour = RabuSelesaiJam; endMinute = RabuSelesaiMenit;
         break;
      case 4:
         dayEnabled = AktifKamis;
         startHour = KamisMulaiJam; startMinute = KamisMulaiMenit;
         endHour = KamisSelesaiJam; endMinute = KamisSelesaiMenit;
         break;
      case 5:
         dayEnabled = AktifJumat;
         startHour = JumatMulaiJam; startMinute = JumatMulaiMenit;
         endHour = JumatSelesaiJam; endMinute = JumatSelesaiMenit;
         break;
      case 6:
         dayEnabled = AktifSabtu;
         startHour = SabtuMulaiJam; startMinute = SabtuMulaiMenit;
         endHour = SabtuSelesaiJam; endMinute = SabtuSelesaiMenit;
         break;
      case 0:
         dayEnabled = AktifMinggu;
         startHour = MingguMulaiJam; startMinute = MingguMulaiMenit;
         endHour = MingguSelesaiJam; endMinute = MingguSelesaiMenit;
         break;
   }

   if(!dayEnabled) return false;

   int currentTotalMinutes = (dt.hour * 60) + dt.min;
   int startTotalMinutes = (startHour * 60) + startMinute;
   int endTotalMinutes = (endHour * 60) + endMinute;

   if(startTotalMinutes == endTotalMinutes)
      return true;

   if(startTotalMinutes < endTotalMinutes)
      return (currentTotalMinutes >= startTotalMinutes &&
              currentTotalMinutes < endTotalMinutes);

   return (currentTotalMinutes >= startTotalMinutes ||
           currentTotalMinutes < endTotalMinutes);
}
