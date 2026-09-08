import subprocess
import re
import urllib.request
import ssl
import json
import os

CACHE_FILE = os.path.join(os.path.dirname(__file__), '.ag_cache.json')

def get_cached_connection():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            pass
    return None

def save_cached_connection(info):
    try:
        with open(CACHE_FILE, 'w') as f:
            json.dump(info, f)
    except Exception:
        pass

def try_query(port, csrf_token):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    url = f"https://127.0.0.1:{port}/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary"
    req = urllib.request.Request(url, data=b'{}', headers={
        'x-codeium-csrf-token': csrf_token,
        'Content-Type': 'application/json'
    })
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=2.5) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception:
        return None

def get_antigravity_quota():
    # 1. Try cached connection first for instant sub-second response
    cached = get_cached_connection()
    if cached and 'port' in cached and 'csrf_token' in cached:
        res = try_query(cached['port'], cached['csrf_token'])
        if res:
            return res

    # 2. Re-discover if cache missed
    try:
        ps_cmd = 'Get-CimInstance Win32_Process -Filter "name LIKE \'%language_server%\'" | Select-Object ProcessId, CommandLine | ConvertTo-Json'
        res = subprocess.run(['powershell', '-NoProfile', '-Command', ps_cmd], capture_output=True, text=True, timeout=5)
        if not res.stdout.strip():
            return {"error": "not_running"}

        procs = json.loads(res.stdout)
        if isinstance(procs, dict):
            procs = [procs]

        target_proc = next((p for p in procs if 'antigravity' in (p.get('CommandLine') or '')), None)
        if not target_proc:
            return {"error": "antigravity_not_found"}

        pid = target_proc['ProcessId']
        cmdline = target_proc['CommandLine']

        m = re.search(r'--csrf_token\s+([\w-]+)', cmdline)
        if not m:
            return {"error": "no_csrf_token"}
        csrf_token = m.group(1)

        port_cmd = f'Get-NetTCPConnection -OwningProcess {pid} -State Listen | Select-Object -ExpandProperty LocalPort | ConvertTo-Json'
        port_res = subprocess.run(['powershell', '-NoProfile', '-Command', port_cmd], capture_output=True, text=True, timeout=4)
        ports = []
        try:
            p_data = json.loads(port_res.stdout)
            if isinstance(p_data, list):
                ports = p_data
            elif isinstance(p_data, int):
                ports = [p_data]
        except Exception:
            pass

        if not ports:
            ports = [62106, 62107, 62105]

        for port in ports:
            data = try_query(port, csrf_token)
            if data:
                save_cached_connection({'port': port, 'csrf_token': csrf_token})
                return data

        return {"error": "rpc_failed"}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    out = get_antigravity_quota()
    print(json.dumps(out))
