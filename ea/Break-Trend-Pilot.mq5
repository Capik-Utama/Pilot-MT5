//+------------------------------------------------------------------+
//|                                                BreakTrend.mq5|
//|                                Copyright 2026, Gemini AI Labs|
//+------------------------------------------------------------------+
#property copyright "Copyright 2026"
#property link      "https://www.mql5.com"
#property version   "2.10"
#property description "BreakTrend EA with Persistent Virtual Grid, Min Balance Lock & Clean Async Close"
#property strict

#include <Trade\Trade.mqh>

const string PilotApiBaseUrl = "https://personal-database.my.id/api/mt5";

// --- ENUMERATIONS ---
enum ENUM_DISPLAY_CURRENCY { CURR_USD, CURR_USC, CURR_IDR };

// --- STRUCT UNTUK VIRTUAL GRID ---
struct SGridLevel
{
   double price;
   double lot;
   bool   isBuy; // true = BuyStop, false = SellStop
   bool   active;
};

// --- INPUT PARAMETERS ---
input group "== Koneksi MT5 Pilot =="
input bool EnablePilotRemote = true;
input string EAConnectionToken = "";
input group "== Interval Komunikasi MT5 Pilot =="
input int InputPengirimanInfoKePilotMs = 1000;
input int InputPengecekanPerintahPilotMs = 1000;

input group "=== Grid & Order Settings ==="
input int      InpGridDistance    = 500;     // Order Distance (in Points)
input int      InpMaxLevels       = 50;     // Max Grid Levels per side
input double   InpStartLot        = 0.03;   // Starting Lot Size
input double   InpLotMultiplier   = 1.2;    // Martingale Lot Multiplier
input ulong    InpMagicNumber     = 888123; // Magic Number

input group "=== Global Basket Money Management ==="
input double   InpMinBalanceUSD   = 0.0;     // Saldo Minimum (dalam USD/USC, 0 = Disabled)
input double   InpBasketTP_USD    = 2000.0;  // Target TP Global Basket (dalam USD/USC, 0 = Disabled)
input double   InpBasketSL_USD    = 10000.0; // Target SL Global Basket / Max DD (dalam USD/USC, 0 = Disabled)
input double   InpTargetProfitUSD = 2000;    // Target Profit Harian (in USD/USC, 0 = Disabled)

input group "=== Trailing Stop Basket ==="
input bool     InpUseTrailing     = true;   // Aktifkan Trailing Basket
input double   InpTrailingStartUSD= 2.0;    // Mulai Trailing Pada Profit (USD/USC)
input double   InpTrailingStepUSD = 1.0;    // Jarak Step Trailing (USD/USC)

input group "=== Pengaturan Mata Uang Panel ==="
input ENUM_DISPLAY_CURRENCY InpDisplayCurrency = CURR_IDR; // Default mata uang panel
input double    InpUSDIDRRate     = 17000.0; // Kurs USD ke IDR

input group "== Pengaturan Waktu (SERVER TIME) =="
input bool   InpUseTimer      = false;
input int    InpStartHour     = 0;
input int    InpStartMinute   = 5;
input int    InpEndHour       = 23;
input int    InpEndMinute     = 0;

// --- GLOBAL VARIABLES ---
CTrade         trade;
double         maxDrawdownBase   = 0.0; 
double         highWatermarkBase = 0.0;   // Untuk Trailing Stop Basket
uint           globalFillingMode = ORDER_FILLING_FOK; // Mode pengisian otomatis
SGridLevel     gridLevels[];              // Array Virtual Grid internal

// Variabel Panel & State
string UIPrefix = "BT_";
string GridLinePrefix = "BT_Grid_";
int CurrentCurrencyMode = 2; 
double InpUsdToIdr = 18000.0;
bool isAutoTradingActive = true;
bool targetDailyReached = false;
bool hasActivePositionInCycle = false;
bool globalTPReached = false; 

// Runtime values below can be updated by the Pilot command queue without
// changing the immutable MT5 Inputs dialog values.
int    BT_GridDistance = 0;
int    BT_MaxLevels = 0;
double BT_StartLot = 0.0;
double BT_LotMultiplier = 0.0;
double BT_MinBalanceUSD = 0.0;
double BT_BasketTP_USD = 0.0;
double BT_BasketSL_USD = 0.0;
double BT_TargetProfitUSD = 0.0;
bool   BT_UseTrailing = false;
double BT_TrailingStartUSD = 0.0;
double BT_TrailingStepUSD = 0.0;
double BT_USDIDRRate = 0.0;
ulong  BT_MagicNumber = 0;
int PilotTelemetryIntervalMs = 500;
int PilotPollingIntervalMs = 1000;
uint LastPilotTelemetryAt = 0;
uint LastPilotPollAt = 0;
int LastPilotLatencyMs = 0;
bool PilotModeSynced = false;

int lastTradeDay = -1;
datetime resetHistoryTime = 0;

// Forward Declarations
void CreateDashboard();
void RefreshDashboardUI();
void CloseAllAndReset(bool isGlobalTP);
void DeleteAllPendingOrders();
void ClosePositionsByDirection(ENUM_POSITION_TYPE posType);
void PlaceInitialGrid();
int  GetActivePositionCount();
int  GetPendingOrderCount();
double GetTodayClosedProfitInBase();
bool ProcessGlobalTP_SL();
void CheckFillingMode();
void ClosePositionAsync(ulong ticket);
bool IsTradingTime();
bool IsCentAccount();
double GetMinBalanceInBase();
bool IsBalanceSufficient();
bool EnforceMinimumBalanceLock();
string GetStateKeyPrefix();
void SaveGridState();
bool LoadGridState();
void ClearSavedGridState();

void PilotOnTimer();
void PilotSendTelemetry();
void PilotPollCommands();
int PilotHttp(const string method, const string route, const string body, string &response);
bool PilotAck(const string commandId, const string status, const string message);
string PilotJsonEscape(const string value);
string PilotJsonString(const string json, const string key);
double PilotJsonNumber(const string json, const string key, const double fallback);
string PilotJsonObject(const string json, const string key);
string PilotConfigJson();
bool PilotApplyConfig(const string json);
string PilotConfigStateFile();
void PilotSaveConfigState();
void PilotRestoreConfigState();

//+------------------------------------------------------------------+
//| PERSISTENCE VIRTUAL GRID VIA GLOBAL VARIABLES                    |
//+------------------------------------------------------------------+
string GetStateKeyPrefix()
{
   return "BT_" + _Symbol + "_" + IntegerToString((int)BT_MagicNumber) + "_";
}

void SaveGridState()
{
   string prefix = GetStateKeyPrefix();
   int total = ArraySize(gridLevels);

   GlobalVariableSet(prefix + "Count", (double)total);
   GlobalVariableSet(prefix + "MaxDD", maxDrawdownBase);
   GlobalVariableSet(prefix + "HWM", highWatermarkBase);

   for(int i = 0; i < total; i++)
   {
      string idx = IntegerToString(i) + "_";
      GlobalVariableSet(prefix + idx + "Price", gridLevels[i].price);
      GlobalVariableSet(prefix + idx + "Lot", gridLevels[i].lot);
      GlobalVariableSet(prefix + idx + "IsBuy", gridLevels[i].isBuy ? 1.0 : 0.0);
      GlobalVariableSet(prefix + idx + "Active", gridLevels[i].active ? 1.0 : 0.0);
   }
}

bool LoadGridState()
{
   string prefix = GetStateKeyPrefix();
   string countKey = prefix + "Count";
   if(!GlobalVariableCheck(countKey)) return false;

   int total = (int)MathRound(GlobalVariableGet(countKey));
   if(total <= 0) return false;

   ArrayResize(gridLevels, total);
   int activeCount = 0;

   for(int i = 0; i < total; i++)
   {
      string idx = IntegerToString(i) + "_";
      gridLevels[i].price  = GlobalVariableCheck(prefix + idx + "Price")  ? GlobalVariableGet(prefix + idx + "Price")  : 0.0;
      gridLevels[i].lot    = GlobalVariableCheck(prefix + idx + "Lot")    ? GlobalVariableGet(prefix + idx + "Lot")    : BT_StartLot;
      gridLevels[i].isBuy  = GlobalVariableCheck(prefix + idx + "IsBuy")  ? (GlobalVariableGet(prefix + idx + "IsBuy") > 0.5) : true;
      gridLevels[i].active = GlobalVariableCheck(prefix + idx + "Active") ? (GlobalVariableGet(prefix + idx + "Active") > 0.5) : false;

      if(gridLevels[i].active) activeCount++;
   }

   if(GlobalVariableCheck(prefix + "MaxDD")) maxDrawdownBase = GlobalVariableGet(prefix + "MaxDD");
   if(GlobalVariableCheck(prefix + "HWM"))   highWatermarkBase = GlobalVariableGet(prefix + "HWM");

   return (activeCount > 0 || GetActivePositionCount() > 0);
}

void ClearSavedGridState()
{
   string prefix = GetStateKeyPrefix();
   int total = GlobalVariableCheck(prefix + "Count") ? (int)MathRound(GlobalVariableGet(prefix + "Count")) : 0;

   for(int i = 0; i < total; i++)
   {
      string idx = IntegerToString(i) + "_";
      GlobalVariableDel(prefix + idx + "Price");
      GlobalVariableDel(prefix + idx + "Lot");
      GlobalVariableDel(prefix + idx + "IsBuy");
      GlobalVariableDel(prefix + idx + "Active");
   }

   GlobalVariableDel(prefix + "Count");
   GlobalVariableDel(prefix + "MaxDD");
   GlobalVariableDel(prefix + "HWM");
}

//+------------------------------------------------------------------+
//| DETEKSI FILLING MODE BROKER                                      |
//+------------------------------------------------------------------+
void CheckFillingMode()
{
   uint filling = (uint)SymbolInfoInteger(_Symbol, SYMBOL_FILLING_MODE);
   if((filling & SYMBOL_FILLING_FOK) != 0) {
      globalFillingMode = ORDER_FILLING_FOK;
      trade.SetTypeFilling(ORDER_FILLING_FOK);
   }
   else if((filling & SYMBOL_FILLING_IOC) != 0) {
      globalFillingMode = ORDER_FILLING_IOC;
      trade.SetTypeFilling(ORDER_FILLING_IOC);
   }
   else {
      globalFillingMode = ORDER_FILLING_RETURN;
      trade.SetTypeFilling(ORDER_FILLING_RETURN);
   }
}

//+------------------------------------------------------------------+
//| CEK WAKTU TRADING                                                |
//+------------------------------------------------------------------+
bool IsTradingTime()
{
   if(!InpUseTimer) return true; // Bypass jika timer tidak diaktifkan

   int startMinutes = InpStartHour * 60 + InpStartMinute;
   int endMinutes = InpEndHour * 60 + InpEndMinute;
   
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   int currentMinutes = dt.hour * 60 + dt.min;
   
   if (startMinutes < endMinutes) {
       return (currentMinutes >= startMinutes && currentMinutes < endMinutes);
   } else if (startMinutes > endMinutes) {
       return (currentMinutes >= startMinutes || currentMinutes < endMinutes);
   } else {
       return true; // 24 jam jika jam start dan end sama
   }
}

//+------------------------------------------------------------------+
//| DETEKSI AKUN CENT & SALDO MINIMUM                                |
//+------------------------------------------------------------------+
bool IsCentAccount()
{
   string accCurrency = AccountInfoString(ACCOUNT_CURRENCY);
   string symbol = _Symbol;
   
   if(StringFind(accCurrency, "USC") >= 0 || 
      StringFind(accCurrency, "Cent") >= 0 || 
      StringFind(accCurrency, "cent") >= 0 || 
      StringFind(symbol, ".sc") >= 0 ||
      StringFind(symbol, "USC") >= 0) {
      return true;
   }
   return false;
}

double GetMinBalanceInBase()
{
   if(BT_MinBalanceUSD <= 0.0) return 0.0;
   return IsCentAccount() ? (BT_MinBalanceUSD * 100.0) : BT_MinBalanceUSD;
}

bool IsBalanceSufficient()
{
   if(BT_MinBalanceUSD <= 0.0) return true;
   double currentBalance = AccountInfoDouble(ACCOUNT_BALANCE);
   return (currentBalance >= GetMinBalanceInBase());
}

bool EnforceMinimumBalanceLock()
{
   if(!IsBalanceSufficient())
   {
      isAutoTradingActive = false;
      if(GetActivePositionCount() == 0 && GetPendingOrderCount() > 0)
      {
         DeleteAllPendingOrders();
      }
      return true;
   }
   return false;
}

//+------------------------------------------------------------------+
//| EXPERT INITIALIZATION FUNCTION                                   |
//+------------------------------------------------------------------+
int OnInit()
{

   BT_GridDistance = InpGridDistance;
   BT_MaxLevels = InpMaxLevels;
   BT_StartLot = InpStartLot;
   BT_LotMultiplier = InpLotMultiplier;
   BT_MinBalanceUSD = InpMinBalanceUSD;
   BT_BasketTP_USD = InpBasketTP_USD;
   BT_BasketSL_USD = InpBasketSL_USD;
   BT_TargetProfitUSD = InpTargetProfitUSD;
   BT_UseTrailing = InpUseTrailing;
   BT_TrailingStartUSD = InpTrailingStartUSD;
   BT_TrailingStepUSD = InpTrailingStepUSD;
   BT_USDIDRRate = InpUSDIDRRate;
   BT_MagicNumber = InpMagicNumber;
   trade.SetExpertMagicNumber(BT_MagicNumber);
   CheckFillingMode();
   
   maxDrawdownBase   = 0.0;
   highWatermarkBase = 0.0;
   targetDailyReached = false;
   hasActivePositionInCycle = false;
   globalTPReached = false;
   ArrayFree(gridLevels);
   
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   dt.hour = 0; dt.min = 0; dt.sec = 0;
   resetHistoryTime = StructToTime(dt);
   lastTradeDay = dt.day;
   
   if(InpDisplayCurrency == CURR_USC) CurrentCurrencyMode = 1;
   else if(InpDisplayCurrency == CURR_USD) CurrentCurrencyMode = 0;
   else CurrentCurrencyMode = 2;
   
   InpUsdToIdr = BT_USDIDRRate;
   PilotRestoreConfigState();
   // Break-Trend starts in AUTO after reload; remote commands can still
   // switch it to MANUAL or AUTO afterward.
   isAutoTradingActive = true;
   PilotModeSynced = true;
   if(EnablePilotRemote && !MQLInfoInteger(MQL_TESTER)) EventSetMillisecondTimer(250);
   if(EnablePilotRemote && EAConnectionToken == "") Print("MT5 Pilot: isi EAConnectionToken dan izinkan https://personal-database.my.id di WebRequest.");

   bool restored = LoadGridState();
   if(restored)
   {
      hasActivePositionInCycle = (GetActivePositionCount() > 0);
      Print("BreakTrend EA: Melanjutkan Virtual Grid tersimpan (", GetPendingOrderCount(), " pending orders).");
   }

   EnforceMinimumBalanceLock();
   
   CreateDashboard();
   RefreshDashboardUI();
   Print("BreakTrend EA Initialized Successfully. Filling Mode: ", globalFillingMode);
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| EXPERT DEINITIALIZATION FUNCTION                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   if(reason == REASON_REMOVE)
   {
      ClearSavedGridState();
   }
   else
   {
      SaveGridState();
   }

   ArrayFree(gridLevels);
   ObjectsDeleteAll(0, UIPrefix);
   ObjectsDeleteAll(0, GridLinePrefix);
   ChartRedraw(0);
   Print("BreakTrend EA Deinitialized. Reason: ", reason);
}

double GetTotalPositionsProfitInBase()
{
   double rawProfit = 0.0;
   for (int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if (ticket > 0 && PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == BT_MagicNumber)
      {
         rawProfit += PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP); 
      }
   }
   return rawProfit;
}

//+------------------------------------------------------------------+
//| MENGHITUNG CLOSED PROFIT TANPA FREEZE CHART                      |
//+------------------------------------------------------------------+
double GetClosedProfitInBase()
{
   double closedProfit = 0.0;
   
   datetime startTime = resetHistoryTime;
   if(startTime <= 0)
   {
      MqlDateTime dt;
      TimeToStruct(TimeCurrent(), dt);
      dt.hour = 0; dt.min = 0; dt.sec = 0;
      startTime = StructToTime(dt);
   }
   
   if(!HistorySelect(startTime, TimeCurrent() + 86400)) return 0.0;
   
   int totalDeals = HistoryDealsTotal();
   if(totalDeals <= 0) return 0.0;

   ulong eaPositionIDs[];
   int eaPosCount = 0;
   
   for(int i = 0; i < totalDeals; i++)
   {
      ulong dealTicket = HistoryDealGetTicket(i);
      if(dealTicket > 0)
      {
         if(HistoryDealGetInteger(dealTicket, DEAL_ENTRY) == DEAL_ENTRY_IN)
         {
            if(HistoryDealGetInteger(dealTicket, DEAL_MAGIC) == BT_MagicNumber &&
               HistoryDealGetString(dealTicket, DEAL_SYMBOL) == _Symbol)
            {
               ulong posID = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
               if(posID > 0)
               {
                  ArrayResize(eaPositionIDs, eaPosCount + 1);
                  eaPositionIDs[eaPosCount] = posID;
                  eaPosCount++;
               }
            }
         }
      }
   }
   
   for(int i = 0; i < totalDeals; i++)
   {
      ulong dealTicket = HistoryDealGetTicket(i);
      if(dealTicket > 0)
      {
         string symbol = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
         long entry    = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
         
         if(symbol == _Symbol && (entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_INOUT || entry == DEAL_ENTRY_OUT_BY))
         {
            ulong magic = HistoryDealGetInteger(dealTicket, DEAL_MAGIC);
            ulong posID = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
            
            bool isEADeal = (magic == BT_MagicNumber);
            
            if(!isEADeal && posID > 0)
            {
               for(int k = 0; k < eaPosCount; k++)
               {
                  if(eaPositionIDs[k] == posID)
                  {
                     isEADeal = true;
                     break;
                  }
               }
            }
            
            if(isEADeal)
            {
               closedProfit += HistoryDealGetDouble(dealTicket, DEAL_PROFIT) + 
                               HistoryDealGetDouble(dealTicket, DEAL_SWAP) + 
                               HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
            }
         }
      }
   }
   
   return closedProfit;
}

double GetTodayClosedProfitInBase()
{
   return GetClosedProfitInBase();
}

string FormatWithDot(double val, int digits)
{
   bool isNeg = (val < 0.0);
   double absVal = MathAbs(val);
   string raw = DoubleToString(absVal, digits);

   string intPart = raw;
   string decPart = "";
   int dotPos = StringFind(raw, ".");
   if(dotPos >= 0)
   {
      intPart = StringSubstr(raw, 0, dotPos);
      decPart = StringSubstr(raw, dotPos);
   }

   int len = StringLen(intPart);
   string formattedInt = "";
   int count = 0;
   for(int i = len - 1; i >= 0; i--)
   {
      formattedInt = StringSubstr(intPart, i, 1) + formattedInt;
      count++;
      if(count == 3 && i > 0)
      {
         formattedInt = "." + formattedInt;
         count = 0;
      }
   }

   return (isNeg ? "-" : "") + formattedInt + decPart;
}

string FormatCurrency(double amountBase)
{
   if(CurrentCurrencyMode == 1) 
   {
      double uscVal = IsCentAccount() ? amountBase : (amountBase * 100.0);
      return FormatWithDot(uscVal, 2) + " USC";
   }
   else if(CurrentCurrencyMode == 2) 
   {
      double usdVal = IsCentAccount() ? (amountBase / 100.0) : amountBase;
      return FormatWithDot(usdVal * InpUsdToIdr, 0) + " IDR";
   }
   else 
   {
      double usdVal = IsCentAccount() ? (amountBase / 100.0) : amountBase;
      return FormatWithDot(usdVal, 2) + " USD";
   }
}

//+------------------------------------------------------------------+
//| EVALUASI BASKET TP/SL & TRAILING                                 |
//+------------------------------------------------------------------+
bool ProcessGlobalTP_SL()
{
   double totalFloatingProfit = GetTotalPositionsProfitInBase();

   if(GetActivePositionCount() == 0)
   {
      highWatermarkBase = 0.0;
      return false;
   }

   if (BT_UseTrailing && BT_TrailingStartUSD > 0 && BT_TrailingStepUSD > 0)
   {
      if (totalFloatingProfit >= BT_TrailingStartUSD)
      {
         if (totalFloatingProfit > highWatermarkBase)
         {
            highWatermarkBase = totalFloatingProfit;
         }
         
         if (highWatermarkBase - totalFloatingProfit >= BT_TrailingStepUSD)
         {
            globalTPReached = true;
            CloseAllAndReset(true);
            return true;
         }
      }
   }

   if (BT_BasketTP_USD > 0 && totalFloatingProfit >= BT_BasketTP_USD)
   {
      globalTPReached = true;
      CloseAllAndReset(true);
      return true;
   }

   if (BT_BasketSL_USD > 0 && totalFloatingProfit <= -MathAbs(BT_BasketSL_USD))
   {
      globalTPReached = false;
      CloseAllAndReset(false);
      return true;
   }

   return false;
}

void OnTimer()
{
   PilotOnTimer();
}

//+------------------------------------------------------------------+
//| EXPERT TICK FUNCTION                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   PilotOnTimer();
   MqlDateTime dtCurrent;
   TimeToStruct(TimeCurrent(), dtCurrent);
   if (dtCurrent.day != lastTradeDay)
   {
      lastTradeDay = dtCurrent.day;
      targetDailyReached = false;
      dtCurrent.hour = 0; dtCurrent.min = 0; dtCurrent.sec = 0;
      resetHistoryTime = StructToTime(dtCurrent);
   }

   EnforceMinimumBalanceLock();

   double currentProfitBase = GetTotalPositionsProfitInBase();
   double todayTotalProfitBase = GetTodayClosedProfitInBase() + currentProfitBase;
   int totalActivePositions = GetActivePositionCount();
   int totalPendingOrders   = GetPendingOrderCount();

   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   
   // Pengecekan pemicu Virtual Grid Internal
   if(ask > 0 && bid > 0)
   {
      int totalLevels = ArraySize(gridLevels);
      for(int i = 0; i < totalLevels; i++)
      {
         if(!gridLevels[i].active) continue;

         if(gridLevels[i].isBuy && ask >= gridLevels[i].price)
         {
            if(trade.Buy(gridLevels[i].lot, _Symbol, ask, 0, 0, "BreakTrend Buy"))
            {
               gridLevels[i].active = false;
               hasActivePositionInCycle = true;
               SaveGridState();
            }
            break;
         }
         else if(!gridLevels[i].isBuy && bid <= gridLevels[i].price)
         {
            if(trade.Sell(gridLevels[i].lot, _Symbol, bid, 0, 0, "BreakTrend Sell"))
            {
               gridLevels[i].active = false;
               hasActivePositionInCycle = true;
               SaveGridState();
            }
            break;
         }
      }
   }

   totalActivePositions = GetActivePositionCount(); 

   if (totalActivePositions > 0)
   {
      hasActivePositionInCycle = true;
      if (ProcessGlobalTP_SL())
      {
         RefreshDashboardUI();
         return;
      }
   }

   if (totalActivePositions == 0 && totalPendingOrders == 0)
   {
      hasActivePositionInCycle = false;
      highWatermarkBase = 0.0;
   }

   if (totalActivePositions > 0)
   {
      // Rekam DD Maksimal Sepanjang Waktu
      if (currentProfitBase < maxDrawdownBase)
      {
         maxDrawdownBase = currentProfitBase;
         SaveGridState();
      }

      if (BT_TargetProfitUSD > 0 && todayTotalProfitBase >= BT_TargetProfitUSD)
      {
         targetDailyReached = true;
         globalTPReached = true;
         CloseAllAndReset(true); 
         RefreshDashboardUI();
         return;
      }
   }

   if (isAutoTradingActive && !targetDailyReached && IsTradingTime() && IsBalanceSufficient())
   {
      totalPendingOrders = GetPendingOrderCount();
      if (totalActivePositions == 0 && totalPendingOrders == 0)
      {
         PlaceInitialGrid();
      }
   }

   RefreshDashboardUI();
}

//+------------------------------------------------------------------+
//| FUNGSI ASYNC BULK CLOSE (SERENTAK)                               |
//+------------------------------------------------------------------+
void ClosePositionAsync(ulong ticket)
{
   if(ticket == 0) return;
   
   MqlTradeRequest request;
   MqlTradeResult  result;
   ZeroMemory(request);
   ZeroMemory(result);
   
   request.action       = TRADE_ACTION_DEAL;
   request.position     = ticket;
   request.symbol       = PositionGetString(POSITION_SYMBOL);
   request.volume       = PositionGetDouble(POSITION_VOLUME);
   request.deviation    = 50;
   request.magic        = BT_MagicNumber;
   request.type_filling = (ENUM_ORDER_TYPE_FILLING)globalFillingMode;
   
   long posType = PositionGetInteger(POSITION_TYPE);
   if(posType == POSITION_TYPE_BUY)
   {
      request.type  = ORDER_TYPE_SELL;
      request.price = SymbolInfoDouble(request.symbol, SYMBOL_BID);
   }
   else if(posType == POSITION_TYPE_SELL)
   {
      request.type  = ORDER_TYPE_BUY;
      request.price = SymbolInfoDouble(request.symbol, SYMBOL_ASK);
   }
   
   bool sent = OrderSendAsync(request, result);
}

void CloseAllAndReset(bool isGlobalTP)
{
   int totalPos = PositionsTotal();
   
   for (int i = totalPos - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if (ticket > 0 && PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == BT_MagicNumber)
      {
         ClosePositionAsync(ticket);
      }
   }

   DeleteAllPendingOrders();

   hasActivePositionInCycle = false;
   highWatermarkBase = 0.0;
   
   if (isGlobalTP && isAutoTradingActive && !targetDailyReached && IsBalanceSufficient())
   {
      if (IsTradingTime()) {
         PlaceInitialGrid();
      }
      globalTPReached = false;
   }
}

void DeleteAllPendingOrders()
{
   ArrayFree(gridLevels);
   ClearSavedGridState();
   ObjectsDeleteAll(0, GridLinePrefix);
   ChartRedraw(0);
}

void ClosePositionsByDirection(ENUM_POSITION_TYPE posType)
{
   int totalPos = PositionsTotal();
   
   for (int i = totalPos - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if (ticket > 0 && PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == BT_MagicNumber)
      {
         if(PositionGetInteger(POSITION_TYPE) == posType)
         {
            ClosePositionAsync(ticket);
         }
      }
   }
}

//+------------------------------------------------------------------+
//| GRID PLACEMENT (INTERNAL MEMORY GRID)                            |
//+------------------------------------------------------------------+
void PlaceInitialGrid()
{
   if(!IsBalanceSufficient()) return;
   if(GetActivePositionCount() > 0 || GetPendingOrderCount() > 0) return;

   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   
   if(ask <= 0 || bid <= 0) return;

   double minLot  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double lotStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);

   ArrayResize(gridLevels, BT_MaxLevels * 2);
   int index = 0;

   for (int i = 1; i <= BT_MaxLevels; i++)
   {
      double buyStopPrice  = NormalizeDouble(ask + (i * BT_GridDistance * point), _Digits);
      double sellStopPrice = NormalizeDouble(bid - (i * BT_GridDistance * point), _Digits);
      
      double currentLot = BT_StartLot * MathPow(BT_LotMultiplier, i - 1);
      
      if(currentLot < minLot) currentLot = minLot;
      if(currentLot > maxLot) currentLot = maxLot;
      
      if(lotStep > 0)
      {
         currentLot = NormalizeDouble(MathRound(currentLot / lotStep) * lotStep, 2);
      }
      else
      {
         currentLot = NormalizeDouble(currentLot, 2);
      }

      // Virtual Buy Stop Level
      gridLevels[index].price  = buyStopPrice;
      gridLevels[index].lot    = currentLot;
      gridLevels[index].isBuy  = true;
      gridLevels[index].active = true;
      index++;

      // Virtual Sell Stop Level
      gridLevels[index].price  = sellStopPrice;
      gridLevels[index].lot    = currentLot;
      gridLevels[index].isBuy  = false;
      gridLevels[index].active = true;
      index++;
   }

   hasActivePositionInCycle = false;
   highWatermarkBase = 0.0;
   SaveGridState();
   ChartRedraw(0);
}

//+------------------------------------------------------------------+
//| PANEL GUI CREATION & REFRESH                                     |
//+------------------------------------------------------------------+
void CreateUIButton(string name, string text, int x, int y, int xSize, int ySize, color bgColor, color txtColor=clrWhite, int fontSize=9)
{
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

void CreateUILabel(string name, string text, int x, int y, color txtColor, int fontSize=10, bool bold=false)
{
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

void UpdateCurrencyButtonsUI()
{
   ObjectSetInteger(0, UIPrefix + "BtnUsd", OBJPROP_BGCOLOR, (CurrentCurrencyMode == 0 ? clrLime : clrGray));
   ObjectSetInteger(0, UIPrefix + "BtnUsd", OBJPROP_COLOR, (CurrentCurrencyMode == 0 ? clrBlack : clrWhite));

   ObjectSetInteger(0, UIPrefix + "BtnIdr", OBJPROP_BGCOLOR, (CurrentCurrencyMode == 2 ? clrLime : clrGray));
   ObjectSetInteger(0, UIPrefix + "BtnIdr", OBJPROP_COLOR, (CurrentCurrencyMode == 2 ? clrBlack : clrWhite));

   ObjectSetInteger(0, UIPrefix + "BtnCent", OBJPROP_BGCOLOR, (CurrentCurrencyMode == 1 ? clrLime : clrGray));
   ObjectSetInteger(0, UIPrefix + "BtnCent", OBJPROP_COLOR, (CurrentCurrencyMode == 1 ? clrBlack : clrWhite));
}

void CreateDashboard()
{
   string bgName = UIPrefix + "BgPanel";
   
   if(ObjectFind(0, bgName) < 0) {
      ObjectCreate(0, bgName, OBJ_BUTTON, 0, 0, 0);
      ObjectSetInteger(0, bgName, OBJPROP_CORNER, CORNER_RIGHT_UPPER);
      ObjectSetInteger(0, bgName, OBJPROP_XDISTANCE, 250); 
      ObjectSetInteger(0, bgName, OBJPROP_YDISTANCE, 15);  
      ObjectSetInteger(0, bgName, OBJPROP_XSIZE, 310);     
      ObjectSetInteger(0, bgName, OBJPROP_YSIZE, 368);     
      ObjectSetInteger(0, bgName, OBJPROP_BGCOLOR, clrBlack); 
      ObjectSetInteger(0, bgName, OBJPROP_COLOR, clrDarkGray); 
      ObjectSetInteger(0, bgName, OBJPROP_STATE, false);
      ObjectSetInteger(0, bgName, OBJPROP_SELECTABLE, false);
      ObjectSetString(0, bgName, OBJPROP_TEXT, ""); 
      ObjectSetInteger(0, bgName, OBJPROP_BACK, false); 
   }

   CreateUILabel("Header", "*Trend_By_Capik*", 240, 16, clrLime, 20, true);

   CreateUIButton("BtnManual", "MANUAL", 240, 50, 105, 22, (!isAutoTradingActive ? clrGray : clrGray), clrWhite, 11);
   CreateUIButton("BtnAuto", "AUTO", 115, 50, 105, 22, (isAutoTradingActive ? clrLime : clrGray), clrWhite, 11);

   CreateUIButton("BtnClosePending", "CLOSE PENDING", 240, 76, 105, 25, clrRed, clrWhite, 10);
   CreateUIButton("BtnPlaceGrid", "PLACE GRID", 115, 76, 105, 25, clrBlue, clrWhite, 10);

   CreateUIButton("BtnCloseSell", "Close Sell", 240, 104, 105, 22, C'128,0,0', clrWhite, 12);
   CreateUIButton("BtnCloseBuy", "Close Buy", 115, 104, 105, 22, C'0,0,128', clrWhite, 12);

   CreateUIButton("BtnCloseAll", "CLOSE ALL", 240, 130, 230, 26, C'0,115,0', clrWhite, 12);

   CreateUIButton("BtnUsd", "USD", 240, 160, 68, 22, clrGray, clrWhite, 12);
   CreateUIButton("BtnIdr", "IDR", 160, 160, 68, 22, clrLime, clrWhite, 12);
   CreateUIButton("BtnCent", "CENT", 80, 160, 68, 22, clrGray, clrWhite, 12);

   CreateUILabel("MinBalance", "Saldo Minimal: 0", 235, 188, clrDodgerBlue, 10, true);
   CreateUILabel("BasketSLSet", "Basket SL: 0", 235, 206, clrYellow, 10, true);
   CreateUILabel("TargetProfitSet", "Basket TP: 0", 235, 224, clrLime, 10, true);
   
   CreateUILabel("MaxFloatDD", "Max Float/DD: 0", 235, 242, clrLightSkyBlue, 11, true);
   
   CreateUILabel("PendingOrders", "Pending Orders: 0", 235, 260, clrDodgerBlue, 11, true);
   CreateUILabel("Running", "Running: 0", 235, 278, clrYellow, 12, true);
   CreateUILabel("Profit", "Profit: 0", 235, 298, clrRed, 16, true);
   CreateUILabel("Status", "Status: ACTIVE", 235, 326, clrWhite, 10, true);

   CreateUIButton("BtnReset", "RESET & RESTART GRID", 230, 346, 220, 24, clrBlue, clrWhite, 12);

   UpdateCurrencyButtonsUI();
}

void RefreshDashboardUI()
{
   if(ObjectFind(0, UIPrefix + "BgPanel") < 0) CreateDashboard();

   EnforceMinimumBalanceLock();
   UpdateCurrencyButtonsUI();

   string minBalText = "Saldo Minimal: " + (BT_MinBalanceUSD > 0 ? FormatCurrency(GetMinBalanceInBase()) : "DISABLED");
   string slText = "Basket SL: " + (BT_BasketSL_USD > 0 ? FormatCurrency(BT_BasketSL_USD) : "DISABLED");
   string tpText = "Basket TP: " + (BT_BasketTP_USD > 0 ? FormatCurrency(BT_BasketTP_USD) : "DISABLED");

   ObjectSetString(0, UIPrefix + "MinBalance", OBJPROP_TEXT, minBalText);
   ObjectSetInteger(0, UIPrefix + "MinBalance", OBJPROP_COLOR, clrDodgerBlue);

   ObjectSetString(0, UIPrefix + "BasketSLSet", OBJPROP_TEXT, slText);
   ObjectSetInteger(0, UIPrefix + "BasketSLSet", OBJPROP_COLOR, clrYellow);

   ObjectSetString(0, UIPrefix + "TargetProfitSet", OBJPROP_TEXT, tpText);
   ObjectSetInteger(0, UIPrefix + "TargetProfitSet", OBJPROP_COLOR, clrLime);

   ObjectSetString(0, UIPrefix + "MaxFloatDD", OBJPROP_TEXT, "Max Float/DD: " + FormatCurrency(maxDrawdownBase));
   ObjectSetInteger(0, UIPrefix + "MaxFloatDD", OBJPROP_COLOR, clrLightSkyBlue);

   int totalPendingOrders = GetPendingOrderCount();
   ObjectSetString(0, UIPrefix + "PendingOrders", OBJPROP_TEXT, "Pending Orders: " + IntegerToString(totalPendingOrders));
   ObjectSetInteger(0, UIPrefix + "PendingOrders", OBJPROP_COLOR, clrDodgerBlue);

   double curProfBase = GetTotalPositionsProfitInBase();
   ObjectSetString(0, UIPrefix + "Running", OBJPROP_TEXT, "Running: " + FormatCurrency(curProfBase));
   ObjectSetInteger(0, UIPrefix + "Running", OBJPROP_COLOR, clrYellow);

   double closedProfBase = GetClosedProfitInBase();
   ObjectSetString(0, UIPrefix + "Profit", OBJPROP_TEXT, "Profit: " + FormatCurrency(closedProfBase));
   ObjectSetInteger(0, UIPrefix + "Profit", OBJPROP_COLOR, (closedProfBase >= 0 ? clrLime : clrRed));

   string statusText = "Status: ACTIVE";
   if(!IsBalanceSufficient()) statusText = "Status: LOCKED (MIN BALANCE)";
   else if(!isAutoTradingActive) statusText = "Status: MANUAL / PAUSED";
   else if(targetDailyReached) statusText = "Status: DAILY TARGET REACHED";

   ObjectSetString(0, UIPrefix + "Status", OBJPROP_TEXT, statusText);
   ObjectSetInteger(0, UIPrefix + "Status", OBJPROP_COLOR, clrWhite);

   ObjectSetInteger(0, UIPrefix + "BtnAuto", OBJPROP_BGCOLOR, (isAutoTradingActive ? clrLime : clrGray));
   ObjectSetInteger(0, UIPrefix + "BtnManual", OBJPROP_BGCOLOR, (!isAutoTradingActive ? clrLime : clrGray));

   ChartRedraw(0);
}

//+------------------------------------------------------------------+
//| EVENT HANDLER PANEL INTERACTION                                  |
//+------------------------------------------------------------------+
void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
{
   if(id == CHARTEVENT_OBJECT_CLICK) {
      if(sparam == UIPrefix + "BtnReset") {
         targetDailyReached = false;
         resetHistoryTime = TimeCurrent();
         maxDrawdownBase = 0.0;
         CloseAllAndReset(true);
      }
      else if(sparam == UIPrefix + "BtnCloseAll") {
         targetDailyReached = false;
         CloseAllAndReset(true); 
      }
      else if(sparam == UIPrefix + "BtnCloseBuy") ClosePositionsByDirection(POSITION_TYPE_BUY);
      else if(sparam == UIPrefix + "BtnCloseSell") ClosePositionsByDirection(POSITION_TYPE_SELL);
      else if(sparam == UIPrefix + "BtnClosePending") DeleteAllPendingOrders();
      else if(sparam == UIPrefix + "BtnPlaceGrid") {
         if(IsBalanceSufficient() && GetPendingOrderCount() == 0 && GetActivePositionCount() == 0) {
            targetDailyReached = false;
            PlaceInitialGrid();
         } else if(!IsBalanceSufficient()) {
            isAutoTradingActive = false;
            Print("Saldo di bawah batas minimum. Mode tetap MANUAL.");
         }
      }
      else if(sparam == UIPrefix + "BtnAuto") {
         if(IsBalanceSufficient()) {
            isAutoTradingActive = true;
         } else {
            isAutoTradingActive = false;
            Print("Tombol AUTO dikunci: Saldo akun kurang dari batas minimum (", DoubleToString(BT_MinBalanceUSD, 2), " USD/USC).");
         }
      }
      else if(sparam == UIPrefix + "BtnManual") isAutoTradingActive = false;
      else if(sparam == UIPrefix + "BtnUsd") CurrentCurrencyMode = 0;
      else if(sparam == UIPrefix + "BtnCent") CurrentCurrencyMode = 1;
      else if(sparam == UIPrefix + "BtnIdr") CurrentCurrencyMode = 2;
      
      ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
      RefreshDashboardUI();
   }
}



//+------------------------------------------------------------------+
//| MT5 PILOT COMMUNICATION                                          |
//+------------------------------------------------------------------+
int PilotHttp(const string method, const string route, const string body, string &response)
{
   if(StringLen(EAConnectionToken) < 40) return -1;
   char data[]; char result[]; string resultHeaders;
   if(body != "") { int copied=StringToCharArray(body,data,0,WHOLE_ARRAY,CP_UTF8); if(copied>0) ArrayResize(data,copied-1); }
   string headers="Content-Type: application/json\r\nAuthorization: Bearer "+EAConnectionToken+"\r\n";
   string base=PilotApiBaseUrl;
   while(StringLen(base)>0 && StringGetCharacter(base,StringLen(base)-1)==47) base=StringSubstr(base,0,StringLen(base)-1);
   ResetLastError();
   int code=WebRequest(method,base+route,headers,3000,data,result,resultHeaders);
   response=CharArrayToString(result,0,-1,CP_UTF8);
   if(code<0 && GetLastError()!=4014) PrintFormat("MT5 Pilot: WebRequest gagal, error=%d.",GetLastError());
   return code;
}
string PilotJsonEscape(const string value)
{
   string out=""; for(int i=0;i<StringLen(value);i++){ ushort c=(ushort)StringGetCharacter(value,i); if(c==34)out+="\\\""; else if(c==92)out+="\\\\"; else if(c==10)out+="\\n"; else if(c==13)out+="\\r"; else if(c==9)out+="\\t"; else if(c>=32)out+=ShortToString(c); } return out;
}
string PilotJsonString(const string json,const string key)
{
   string n="\""+key+"\""; int p=StringFind(json,n); if(p<0)return ""; p=StringFind(json,":",p+StringLen(n)); if(p<0)return ""; p++; while(p<StringLen(json)&&(StringGetCharacter(json,p)==32||StringGetCharacter(json,p)==9))p++; if(p>=StringLen(json)||StringGetCharacter(json,p)!=34)return ""; p++; string v=""; bool esc=false; for(int i=p;i<StringLen(json);i++){ushort c=(ushort)StringGetCharacter(json,i); if(esc){if(c==34||c==92||c==47)v+=ShortToString(c); else if(c==110)v+="\n"; else if(c==114)v+="\r"; else if(c==116)v+="\t"; esc=false;} else if(c==92)esc=true; else if(c==34)return v; else v+=ShortToString(c);} return "";
}
double PilotJsonNumber(const string json,const string key,const double fallback)
{
   string n="\""+key+"\""; int p=StringFind(json,n); if(p<0)return fallback; p=StringFind(json,":",p+StringLen(n)); if(p<0)return fallback; p++; while(p<StringLen(json)&&(StringGetCharacter(json,p)==32||StringGetCharacter(json,p)==9))p++; int e=StringFind(json,",",p); if(e<0)e=StringFind(json,"}",p); if(e<0)return fallback; return StringToDouble(StringSubstr(json,p,e-p));
}
string PilotJsonObject(const string json,const string key)
{
   string n="\""+key+"\""; int p=StringFind(json,n); if(p<0)return ""; p=StringFind(json,"{",p+StringLen(n)); if(p<0)return ""; int e=StringFind(json,"}",p); if(e<0)return ""; return StringSubstr(json,p,e-p+1);
}
string PilotConfigJson()
{
   return "{\"ModePerdagangan\":0,\"MataUangTampilan\":"+IntegerToString(CurrentCurrencyMode)+
      ",\"KursUSD_IDR\":"+DoubleToString(BT_USDIDRRate,8)+",\"MagicBeli\":"+IntegerToString((int)BT_MagicNumber)+
      ",\"MagicJual\":"+IntegerToString((int)BT_MagicNumber)+",\"LotAwal\":"+DoubleToString(BT_StartLot,8)+
      ",\"PenggandaLot\":"+DoubleToString(BT_LotMultiplier,8)+",\"LotMaksimal\":1000,\"LangkahLayer\":1,\"JarakGrid\":"+IntegerToString(BT_GridDistance)+
      ",\"JarakTrailingPending\":0,\"JenisBatasRugi\":0,\"BatasKerugian\":"+DoubleToString(BT_BasketSL_USD,8)+
      ",\"JedaSetelahSLMenit\":0,\"TargetHarian\":"+DoubleToString(BT_TargetProfitUSD,8)+
      ",\"SetelahTargetTercapai\":0,\"ModeTrailing\":"+(BT_UseTrailing?"1":"0")+
      ",\"MulaiTrailingPoin\":0,\"KunciProfitPoin\":0,\"LangkahTrailingPoin\":0,\"MinimumAutoBalanceUSD\":"+DoubleToString(MathMax(BT_MinBalanceUSD,0.01),2)+"}";
}
string PilotConfigStateFile()
{
   string suffix=StringSubstr(EAConnectionToken,MathMax(0,StringLen(EAConnectionToken)-8));
   if(suffix=="") suffix="LOCAL";
   return "BreakTrendPilot_"+IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN))+"_"+suffix+".json";
}
void PilotSaveConfigState()
{
   if(!EnablePilotRemote||EAConnectionToken==""||MQLInfoInteger(MQL_TESTER))return;
   int handle=FileOpen(PilotConfigStateFile(),FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_COMMON);
   if(handle==INVALID_HANDLE)return;
   FileWriteString(handle,PilotConfigJson()); FileFlush(handle); FileClose(handle);
}
void PilotRestoreConfigState()
{
   if(!EnablePilotRemote||EAConnectionToken==""||MQLInfoInteger(MQL_TESTER))return;
   int handle=FileOpen(PilotConfigStateFile(),FILE_READ|FILE_TXT|FILE_ANSI|FILE_COMMON);
   if(handle==INVALID_HANDLE)return;
   string state=FileReadString(handle); FileClose(handle);
   if(state!="")PilotApplyConfig(state);
}
bool PilotApplyConfig(const string json)
{
   BT_StartLot=PilotJsonNumber(json,"LotAwal",BT_StartLot);
   BT_LotMultiplier=PilotJsonNumber(json,"PenggandaLot",BT_LotMultiplier);
   BT_GridDistance=(int)PilotJsonNumber(json,"JarakGrid",BT_GridDistance);
   BT_BasketSL_USD=PilotJsonNumber(json,"BatasKerugian",BT_BasketSL_USD);
   BT_TargetProfitUSD=PilotJsonNumber(json,"TargetHarian",BT_TargetProfitUSD);
   BT_MinBalanceUSD=PilotJsonNumber(json,"MinimumAutoBalanceUSD",BT_MinBalanceUSD);
   BT_USDIDRRate=PilotJsonNumber(json,"KursUSD_IDR",BT_USDIDRRate);
   BT_UseTrailing=PilotJsonNumber(json,"ModeTrailing",BT_UseTrailing?1:0)>0.5;
   int currency=(int)PilotJsonNumber(json,"MataUangTampilan",CurrentCurrencyMode);
   CurrentCurrencyMode=(currency>=0&&currency<=2)?currency:CurrentCurrencyMode;
   InpUsdToIdr=BT_USDIDRRate;
   if(BT_GridDistance<0||BT_StartLot<=0||BT_LotMultiplier<=0||BT_BasketSL_USD<0||BT_TargetProfitUSD<0||BT_MinBalanceUSD<0) return false;
   EnforceMinimumBalanceLock(); PilotSaveConfigState(); RefreshDashboardUI(); return true;
}
bool PilotAck(const string commandId,const string status,const string message)
{
   string response=""; string body="{\"status\":\""+status+"\",\"message\":\""+PilotJsonEscape(message)+"\"}";
   int code=PilotHttp("POST","/commands/"+commandId+"/ack",body,response); return code>=200&&code<300;
}
void PilotSendTelemetry()
{
   double floating=GetTotalPositionsProfitInBase(); string mode=isAutoTradingActive?"auto":"manual";
   string status=!IsBalanceSufficient()?"AUTO BLOCKED":(isAutoTradingActive?"ACTIVE":"MANUAL");
   string body="{\"accountName\":\""+PilotJsonEscape(AccountInfoString(ACCOUNT_NAME))+"\",\"login\":"+IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN))+
      ",\"serverName\":\""+PilotJsonEscape(AccountInfoString(ACCOUNT_SERVER))+"\",\"balance\":"+DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE),2)+
      ",\"equity\":"+DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY),2)+",\"maxDdBuy\":"+DoubleToString(MathAbs(maxDrawdownBase),2)+
      ",\"maxDdSell\":0,\"basketSlSet\":"+DoubleToString(BT_BasketSL_USD,2)+",\"basketSlType\":\"money\",\"dailyTargetSet\":"+DoubleToString(BT_TargetProfitUSD,2)+
      ",\"maxFloatBuy\":0,\"maxFloatSell\":0,\"runningFloat\":"+DoubleToString(floating,2)+",\"openPositions\":"+IntegerToString(GetActivePositionCount())+
      ",\"eaStatus\":\""+status+"\",\"profit\":"+DoubleToString(GetTodayClosedProfitInBase(),2)+",\"floatingProfit\":"+DoubleToString(floating,2)+
      ",\"running\":"+(isAutoTradingActive?"true":"false")+",\"isCentAccount\":"+(IsCentAccount()?"true":"false")+
      ",\"displayCurrency\":\""+(CurrentCurrencyMode==1?"CENT":CurrentCurrencyMode==2?"IDR":"USD")+"\",\"displayRate\":"+DoubleToString(BT_USDIDRRate,2)+
      ",\"eaMode\":\""+mode+"\",\"currency\":\""+PilotJsonEscape(AccountInfoString(ACCOUNT_CURRENCY))+"\",\"latencyMs\":"+IntegerToString(LastPilotLatencyMs)+
      ",\"eaConfig\":"+PilotConfigJson()+"}";
   string response=""; uint started=GetTickCount(); int code=PilotHttp("POST","/telemetry",body,response); LastPilotLatencyMs=(int)MathMin(GetTickCount()-started,(uint)60000); if(code>=400)PrintFormat("MT5 Pilot: telemetri ditolak (HTTP %d).",code);
}
void PilotPollCommands()
{
   string response=""; int code=PilotHttp("POST","/commands/next","{\"telemetryIntervalMs\":1000,\"pollIntervalMs\":1000}",response); if(code!=200)return;
   string commandId=PilotJsonString(response,"commandId"), action=PilotJsonString(response,"action"), payload=PilotJsonObject(response,"payload");
   if(!PilotModeSynced){ string serverMode=PilotJsonString(response,"eaMode"); if(serverMode=="auto")isAutoTradingActive=true; else if(serverMode=="manual")isAutoTradingActive=false; PilotModeSynced=true; }
   if(commandId==""||action=="")return; if(!PilotAck(commandId,"accepted","Perintah diterima EA."))return;
   bool success=true; string result="";
   if(action=="config"){success=payload!=""&&PilotApplyConfig(payload);result=success?"Konfigurasi remote diterapkan.":"Payload konfigurasi tidak valid.";}
   else if(action=="auto"){isAutoTradingActive=IsBalanceSufficient();success=isAutoTradingActive;result=success?"Mode Auto aktif.":"Mode Auto ditolak: saldo minimum tidak terpenuhi.";}
   else if(action=="manual"){isAutoTradingActive=false;result="Mode Manual aktif.";}
   else if(action=="close_all"){CloseAllAndReset(false);result="Semua posisi dan grid ditutup.";}
   else if(action=="close_buy"){ClosePositionsByDirection(POSITION_TYPE_BUY);result="Posisi BUY ditutup.";}
   else if(action=="close_sell"){ClosePositionsByDirection(POSITION_TYPE_SELL);result="Posisi SELL ditutup.";}
   else if(action=="reset"){targetDailyReached=false;resetHistoryTime=TimeCurrent();maxDrawdownBase=0;CloseAllAndReset(true);result="State harian dan grid direset.";}
   else {success=false;result="Aksi tidak didukung Break-Trend.";}
   RefreshDashboardUI(); PilotAck(commandId,success?"succeeded":"failed",result); Print("MT5 Pilot: ",result);
}
void PilotOnTimer()
{
   if(!EnablePilotRemote||MQLInfoInteger(MQL_TESTER)||EAConnectionToken=="")return; uint now=GetTickCount();
   if(!PilotModeSynced&&now-LastPilotPollAt>=(uint)PilotPollingIntervalMs){LastPilotPollAt=now;PilotPollCommands();}
   if(now-LastPilotTelemetryAt>=(uint)PilotTelemetryIntervalMs){LastPilotTelemetryAt=now;PilotSendTelemetry();}
   if(now-LastPilotPollAt>=(uint)PilotPollingIntervalMs){LastPilotPollAt=now;PilotPollCommands();}
}

//+------------------------------------------------------------------+
//| COUNT UTILITIES                                                  |
//+------------------------------------------------------------------+
int GetActivePositionCount()
{
   int count = 0;
   for (int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if (ticket > 0 && PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == BT_MagicNumber) count++;
   }
   return count;
}

int GetPendingOrderCount()
{
   int count = 0;
   int total = ArraySize(gridLevels);
   for(int i = 0; i < total; i++)
   {
      if(gridLevels[i].active) count++;
   }
   return count;
}
