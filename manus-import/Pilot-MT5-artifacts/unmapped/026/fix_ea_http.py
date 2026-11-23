from pathlib import Path
import re

path = Path('/home/ubuntu/pilotmt5/ea/Fast-Grid-Pilot.mq5')
text = path.read_text(encoding='utf-8')
pattern = r'int PilotHttp\(const string method, const string route, const string body, string &response\) \{.*?\n\}\n\n(?=string PilotJsonString)'
replacement = r'''int PilotHttp(const string method, const string route, const string body, string &response) {
   if(StringLen(EAConnectionToken) < 40 || PilotApiBaseUrl == "") return -1;
   char data[];
   if(body != "") {
      int copied = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
      if(copied > 0) ArrayResize(data, copied - 1); // Exclude the terminating NUL.
   }
   char result[];
   string resultHeaders;
   string headers = "Content-Type: application/json\\r\\nAuthorization: Bearer " + EAConnectionToken + "\\r\\n";
   string apiBase = PilotApiBaseUrl;
   while(StringLen(apiBase) > 0 && StringGetCharacter(apiBase, StringLen(apiBase) - 1) == 47)
      apiBase = StringSubstr(apiBase, 0, StringLen(apiBase) - 1);
   ResetLastError();
   int code = WebRequest(method, apiBase + route, headers, 3000, data, result, resultHeaders);
   response = CharArrayToString(result, 0, -1, CP_UTF8);
   if(code < 0) {
      int err = GetLastError();
      if(err != 4014) PrintFormat("MT5 Pilot: WebRequest gagal, error=%d. Izinkan domain HTTPS Manus di Options > Expert Advisors.", err);
   }
   return code;
}

'''
updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'Expected to replace one PilotHttp function, got {count}')
path.write_text(updated, encoding='utf-8')
print('Repaired MQL5 HTTP string escaping.')
