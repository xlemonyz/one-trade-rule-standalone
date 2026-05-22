#property strict

input string ApiUrl = "https://afimhpcikalyeamarmlu.supabase.co/functions/v1/mt5-import";
input string ApiKey = "";
input int SyncEverySeconds = 60;
input int DaysBack = 30;

string g_keyPrefix = "";

string EscapeJson(string text)
{
   StringReplace(text, "\\", "\\\\");
   StringReplace(text, "\"", "\\\"");
   StringReplace(text, "\n", "\\n");
   StringReplace(text, "\r", "\\r");
   StringReplace(text, "\t", "\\t");
   return text;
}

string ToIso8601(datetime ts)
{
   string s = TimeToString(ts, TIME_DATE | TIME_SECONDS); // yyyy.mm.dd hh:mm:ss
   StringReplace(s, ".", "-");
   StringReplace(s, " ", "T");
   return s + "Z";
}

long SafeDealTimeMsc(ulong dealTicket)
{
   long tms = (long)HistoryDealGetInteger(dealTicket, DEAL_TIME_MSC);
   if(tms <= 0) return 0;
   return tms;
}

string EpochMsToIsoUtc(long epochMs, bool &ok)
{
   ok = false;
   if(epochMs <= 0) return "";

   datetime ts = (datetime)(epochMs / 1000);
   MqlDateTime dt;
   if(!TimeToStruct(ts, dt)) return "";

   ok = true;
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ", dt.year, dt.mon, dt.day, dt.hour, dt.min, dt.sec);
}

string JsonStringOrNull(string value)
{
   if(StringLen(value) == 0) return "null";
   return "\"" + EscapeJson(value) + "\"";
}

string JsonLongOrNull(long value)
{
   if(value <= 0) return "null";
   return StringFormat("%I64d", value);
}

bool IsSent(string ticket)
{
   string key = g_keyPrefix + ticket;
   return GlobalVariableCheck(key);
}

void MarkSent(string ticket)
{
   string key = g_keyPrefix + ticket;
   GlobalVariableSet(key, (double)TimeCurrent());
}

bool FindOpenDeal(long positionId, datetime closeTime, datetime &openTime, double &openPrice, string &openDirection, long &openTimeMsc)
{
   int total = HistoryDealsTotal();
   datetime bestTime = 0;
   bool found = false;
   openTimeMsc = 0;

   for(int i = 0; i < total; i++)
   {
      ulong dTicket = HistoryDealGetTicket(i);
      if(dTicket == 0) continue;

      long posId = (long)HistoryDealGetInteger(dTicket, DEAL_POSITION_ID);
      if(posId != positionId) continue;

      long entryType = (long)HistoryDealGetInteger(dTicket, DEAL_ENTRY);
      if(entryType != DEAL_ENTRY_IN) continue;

      datetime t = (datetime)HistoryDealGetInteger(dTicket, DEAL_TIME);
      if(t > closeTime) continue;

      if(!found || t < bestTime)
      {
         found = true;
         bestTime = t;
         openTime = t;
         openTimeMsc = SafeDealTimeMsc(dTicket);
         openPrice = HistoryDealGetDouble(dTicket, DEAL_PRICE);
         long dealType = (long)HistoryDealGetInteger(dTicket, DEAL_TYPE);
         openDirection = (dealType == DEAL_TYPE_BUY) ? "BUY" : "SELL";
      }
   }

   return found;
}

bool SendTradeJson(string payload)
{
   char postData[];
   char result[];
   string responseHeaders;
   string headers = "Content-Type: application/json\r\n";

   int payloadLen = StringToCharArray(payload, postData, 0, StringLen(payload), CP_UTF8);
   if(payloadLen <= 0)
      return false;

   ResetLastError();
   int code = WebRequest("POST", ApiUrl, headers, 10000, postData, result, responseHeaders);
   int err = GetLastError();

   if(code == -1)
   {
      Print("MT5 Auto Sync: WebRequest failed. Error=", err, ". Check allowed URL and internet access.");
      return false;
   }

   string body = CharArrayToString(result, 0, -1, CP_UTF8);
   Print("MT5 Auto Sync: HTTP=", code, " Response=", body);

   if(code >= 200 && code < 300)
   {
      if(StringFind(body, "\"status\":\"inserted\"") >= 0 || StringFind(body, "\"status\":\"duplicate\"") >= 0)
         return true;
   }

   return false;
}

void SyncClosedDeals()
{
   if(StringLen(ApiKey) == 0)
   {
      Print("MT5 Auto Sync: ApiKey is empty.");
      return;
   }

   datetime toTime = TimeCurrent();
   datetime fromTime = toTime - (DaysBack * 86400);

   if(!HistorySelect(fromTime, toTime))
   {
      Print("MT5 Auto Sync: HistorySelect failed.");
      return;
   }

   string accountNumber = (string)AccountInfoInteger(ACCOUNT_LOGIN);
   string brokerServer = AccountInfoString(ACCOUNT_SERVER);
   int total = HistoryDealsTotal();

   for(int i = 0; i < total; i++)
   {
      ulong dealTicket = HistoryDealGetTicket(i);
      if(dealTicket == 0) continue;

      string ticket = (string)dealTicket;
      if(IsSent(ticket)) continue;

      long entryType = (long)HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
      if(entryType != DEAL_ENTRY_OUT) continue; // closed deals only

      long dealType = (long)HistoryDealGetInteger(dealTicket, DEAL_TYPE);
      if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL) continue; // skip balance/deposit/credit

      string symbol = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
      if(StringLen(symbol) == 0) continue;

      datetime closeTime = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
      long closeEpochMs = SafeDealTimeMsc(dealTicket);
      if(closeEpochMs <= 0)
      {
         Print("MT5 Payload v2 ERROR: invalid closeEpochMs, skipping trade. ticket=", ticket, " accountNumber=", accountNumber);
         continue;
      }

      bool closeUtcOk = false;
      string closeTimeUtc = EpochMsToIsoUtc(closeEpochMs, closeUtcOk);
      if(!closeUtcOk || StringLen(closeTimeUtc) == 0)
      {
         Print("MT5 Payload v2 ERROR: failed to derive closeTimeUtc from closeEpochMs, skipping trade. ticket=", ticket, " closeEpochMs=", closeEpochMs);
         continue;
      }

      double closePrice = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
      double lotSize = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
      double profit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
      double commission = HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
      double swap = HistoryDealGetDouble(dealTicket, DEAL_SWAP);
      string comment = HistoryDealGetString(dealTicket, DEAL_COMMENT);
      long positionId = (long)HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);

      datetime openTime = closeTime;
      double entryPrice = closePrice;
      string direction = (dealType == DEAL_TYPE_BUY) ? "BUY" : "SELL";
      long openEpochMs = 0;
      string openTimeUtc = "";

      datetime foundOpenTime;
      double foundEntryPrice;
      string foundDirection;
      long foundOpenTimeMsc = 0;
      if(FindOpenDeal(positionId, closeTime, foundOpenTime, foundEntryPrice, foundDirection, foundOpenTimeMsc))
      {
         openTime = foundOpenTime;
         entryPrice = foundEntryPrice;
         direction = foundDirection;
         openEpochMs = foundOpenTimeMsc;

         bool openUtcOk = false;
         openTimeUtc = EpochMsToIsoUtc(openEpochMs, openUtcOk);
         if(!openUtcOk)
         {
            openEpochMs = 0;
            openTimeUtc = "";
            Print("MT5 Payload v2 WARN: open deal found but openEpochMs/openTimeUtc invalid. Sending null open explicit fields. ticket=", ticket);
         }
      }
      else
      {
         Print("MT5 Payload v2 WARN: matched open deal not found. Sending null open explicit fields. ticket=", ticket);
      }

      Print("[MT5 Payload v2]");
      Print("ticket=", ticket);
      Print("accountNumber=", accountNumber);
      Print("brokerServer=", brokerServer);
      Print("openTime=", ToIso8601(openTime));
      Print("closeTime=", ToIso8601(closeTime));
      Print("openTimeUtc=", (StringLen(openTimeUtc) == 0 ? "null" : openTimeUtc));
      Print("closeTimeUtc=", closeTimeUtc);
      Print("openEpochMs=", (openEpochMs > 0 ? StringFormat("%I64d", openEpochMs) : "null"));
      Print("closeEpochMs=", StringFormat("%I64d", closeEpochMs));

      string payload = "{"
         "\"apiKey\":\"" + EscapeJson(ApiKey) + "\","
         "\"accountNumber\":\"" + EscapeJson(accountNumber) + "\","
         "\"brokerServer\":\"" + EscapeJson(brokerServer) + "\","
         "\"ticket\":\"" + EscapeJson(ticket) + "\","
         "\"symbol\":\"" + EscapeJson(symbol) + "\","
         "\"direction\":\"" + EscapeJson(direction) + "\","
         "\"openTime\":\"" + EscapeJson(ToIso8601(openTime)) + "\","
         "\"closeTime\":\"" + EscapeJson(ToIso8601(closeTime)) + "\","
         "\"openTimeUtc\":" + JsonStringOrNull(openTimeUtc) + ","
         "\"closeTimeUtc\":" + JsonStringOrNull(closeTimeUtc) + ","
         "\"openEpochMs\":" + JsonLongOrNull(openEpochMs) + ","
         "\"closeEpochMs\":" + JsonLongOrNull(closeEpochMs) + ","
         "\"entryPrice\":" + DoubleToString(entryPrice, 8) + ","
         "\"closePrice\":" + DoubleToString(closePrice, 8) + ","
         "\"lotSize\":" + DoubleToString(lotSize, 2) + ","
         "\"profit\":" + DoubleToString(profit, 2) + ","
         "\"commission\":" + DoubleToString(commission, 2) + ","
         "\"swap\":" + DoubleToString(swap, 2) + ","
         "\"comment\":\"" + EscapeJson(comment) + "\""
      "}";

      if(SendTradeJson(payload))
      {
         MarkSent(ticket);
      }
   }
}

int OnInit()
{
   g_keyPrefix = "MT5SYNC_" + (string)AccountInfoInteger(ACCOUNT_LOGIN) + "_";
   EventSetTimer(MathMax(5, SyncEverySeconds));

   Print("MT5 Auto Sync initialized.");
   Print("Remember: MT5 -> Tools -> Options -> Expert Advisors -> Allow WebRequest for: ", ApiUrl);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
}

void OnTimer()
{
   SyncClosedDeals();
}
