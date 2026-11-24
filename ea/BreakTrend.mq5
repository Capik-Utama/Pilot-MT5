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

//+------------------------------------------------------------------+
//| PERSISTENCE VIRTUAL GRID VIA GLOBAL VARIABLES                    |
//+------------------------------------------------------------------+
string GetStateKeyPrefix()
{
   return "BT_" + _Symbol + "_" + IntegerToString((int)InpMagicNumber) + "_";
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
      gridLevels[i].lot    = GlobalVariableCheck(prefix + idx + "Lot")    ? GlobalVariableGet(prefix + idx + "Lot")    : InpStartLot;
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
   if(InpMinBalanceUSD <= 0.0) return 0.0;
   return IsCentAccount() ? (InpMinBalanceUSD * 100.0) : InpMinBalanceUSD;
}

bool IsBalanceSufficient()
{
   if(InpMinBalanceUSD <= 0.0) return true;
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
   trade.SetExpertMagicNumber(InpMagicNumber);
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
   
   InpUsdToIdr = InpUSDIDRRate;
   isAutoTradingActive = true;

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
      if (ticket > 0 && PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == InpMagicNumber)
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
            if(HistoryDealGetInteger(dealTicket, DEAL_MAGIC) == InpMagicNumber &&
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
            
            bool isEADeal = (magic == InpMagicNumber);
            
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

string FormatCurrency(double amountBase)
{
   if(CurrentCurrencyMode == 1) 
   {
      double uscVal = IsCentAccount() ? amountBase : (amountBase * 100.0);
      return StringFormat("%.2f USC", uscVal);
   }
   else if(CurrentCurrencyMode == 2) 
   {
      double usdVal = IsCentAccount() ? (amountBase / 100.0) : amountBase;
      return StringFormat("%.0f IDR", usdVal * InpUsdToIdr);
   }
   else 
   {
      double usdVal = IsCentAccount() ? (amountBase / 100.0) : amountBase;
      return StringFormat("%.2f USD", usdVal);
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

   if (InpUseTrailing && InpTrailingStartUSD > 0 && InpTrailingStepUSD > 0)
   {
      if (totalFloatingProfit >= InpTrailingStartUSD)
      {
         if (totalFloatingProfit > highWatermarkBase)
         {
            highWatermarkBase = totalFloatingProfit;
         }
         
         if (highWatermarkBase - totalFloatingProfit >= InpTrailingStepUSD)
         {
            globalTPReached = true;
            CloseAllAndReset(true);
            return true;
         }
      }
   }

   if (InpBasketTP_USD > 0 && totalFloatingProfit >= InpBasketTP_USD)
   {
      globalTPReached = true;
      CloseAllAndReset(true);
      return true;
   }

   if (InpBasketSL_USD > 0 && totalFloatingProfit <= -MathAbs(InpBasketSL_USD))
   {
      globalTPReached = false;
      CloseAllAndReset(false);
      return true;
   }

   return false;
}

//+------------------------------------------------------------------+
//| EXPERT TICK FUNCTION                                             |
//+------------------------------------------------------------------+
void OnTick()
{
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

      if (InpTargetProfitUSD > 0 && todayTotalProfitBase >= InpTargetProfitUSD)
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
   request.magic        = InpMagicNumber;
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
      if (ticket > 0 && PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == InpMagicNumber)
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
      if (ticket > 0 && PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == InpMagicNumber)
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

   ArrayResize(gridLevels, InpMaxLevels * 2);
   int index = 0;

   for (int i = 1; i <= InpMaxLevels; i++)
   {
      double buyStopPrice  = NormalizeDouble(ask + (i * InpGridDistance * point), _Digits);
      double sellStopPrice = NormalizeDouble(bid - (i * InpGridDistance * point), _Digits);
      
      double currentLot = InpStartLot * MathPow(InpLotMultiplier, i - 1);
      
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

   string minBalText = "Saldo Minimal: " + (InpMinBalanceUSD > 0 ? FormatCurrency(GetMinBalanceInBase()) : "DISABLED");
   string slText = "Basket SL: " + (InpBasketSL_USD > 0 ? FormatCurrency(InpBasketSL_USD) : "DISABLED");
   string tpText = "Basket TP: " + (InpBasketTP_USD > 0 ? FormatCurrency(InpBasketTP_USD) : "DISABLED");

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
            Print("Tombol AUTO dikunci: Saldo akun kurang dari batas minimum (", DoubleToString(InpMinBalanceUSD, 2), " USD/USC).");
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
//| COUNT UTILITIES                                                  |
//+------------------------------------------------------------------+
int GetActivePositionCount()
{
   int count = 0;
   for (int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if (ticket > 0 && PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == InpMagicNumber) count++;
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
