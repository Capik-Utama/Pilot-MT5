from pathlib import Path
import re

source = Path('/tmp/Pilot-MT5/ea/Fast-Grid-Pilot.mq5').read_text(encoding='utf-8')
text = source

def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    text = text.replace(old, new, 1)

text, n = re.subn(
    r'^input string SupabaseFunctionUrl = .*?;\ninput string SupabasePublishableKey = .*?;\n',
    'input string PilotApiBaseUrl = ""; // Salin base URL API dari dashboard MT5 Pilot.\n',
    text,
    count=1,
    flags=re.M,
)
if n != 1:
    raise SystemExit(f'Supabase input block: expected 1 match, got {n}')
replace_once('#property version   "1.10"', '#property version   "1.11"', 'EA version')
replace_once('bool isAutoTradingActive = true; // EA selalu mulai dalam mode AUTO saat chart dimuat.', 'bool isAutoTradingActive = false; // Remote Pilot dimulai MANUAL sampai perintah AUTO eksplisit.', 'safe remote default')
replace_once('   isAutoTradingActive = true;\n   CreateDashboard();', '   isAutoTradingActive = !EnablePilotRemote; // Koneksi Pilot baru selalu dimulai MANUAL.\n   CreateDashboard();', 'OnInit remote default')
replace_once('   if(EnablePilotRemote && EAConnectionToken == "")\n      Print("Fast-Grid Pilot: tempel EAConnectionToken dari dashboard agar telemetri aktif.");', '   if(EnablePilotRemote && (EAConnectionToken == "" || PilotApiBaseUrl == ""))\n      Print("Fast-Grid Pilot: isi PilotApiBaseUrl dan EAConnectionToken dari dashboard agar telemetri aktif.");', 'setup message')
replace_once('   if(!EnablePilotRemote || MQLInfoInteger(MQL_TESTER) || EAConnectionToken == "") return;', '   if(!EnablePilotRemote || MQLInfoInteger(MQL_TESTER) || EAConnectionToken == "" || PilotApiBaseUrl == "") return;', 'remote timer guard')

http_fn = '''int PilotHttp(const string method, const string route, const string body, string &response) {
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
pattern = r'int PilotHttp\(const string method, const string route, const string body, string &response\) \{.*?\n\}\n\n'
text, n = re.subn(pattern, http_fn, text, count=1, flags=re.S)
if n != 1:
    raise SystemExit(f'PilotHttp function: expected 1 match, got {n}')
destination = Path('/home/ubuntu/pilotmt5/ea/Fast-Grid-Pilot.mq5')
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(text, encoding='utf-8')
print(f'Wrote {destination} ({len(text)} bytes)')
