import sqlite3
import os
import json
import base64
import urllib.request
import urllib.parse
import sys

def get_cursor_usage():
    db_path = os.path.expandvars(r'%APPDATA%\Cursor\User\globalStorage\state.vscdb')
    if not os.path.exists(db_path):
        return {"error": "db_not_found"}

    try:
        # SQLite read-only connection
        uri = f"file:{urllib.request.pathname2url(db_path)}?mode=ro"
        conn = sqlite3.connect(uri, uri=True)
        c = conn.cursor()
        
        # Read accessToken and cached email
        c.execute("SELECT key, value FROM ItemTable WHERE key IN ('cursorAuth/accessToken', 'cursorAuth/cachedEmail')")
        data_map = dict(c.fetchall())
        conn.close()

        raw_token = data_map.get('cursorAuth/accessToken')
        email = data_map.get('cursorAuth/cachedEmail', 'Cursor User')
        if not raw_token:
            return {"error": "no_access_token"}

        if isinstance(raw_token, bytes):
            token = raw_token.decode('utf-16le', errors='ignore').strip('\x00')
        else:
            token = str(raw_token).strip('\x00')

        parts = token.split('.')
        if len(parts) < 2:
            return {"error": "invalid_jwt"}

        payload_b64 = parts[1] + '=' * (-len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        sub = payload.get('sub', '')
        account = sub.split('|')[-1] if '|' in sub else sub

        # Build cookie: WorkosCursorSessionToken={account}%3A%3A{token}
        cookie = f"WorkosCursorSessionToken={urllib.parse.quote(account)}%3A%3A{token}"

        req = urllib.request.Request("https://cursor.com/api/usage-summary", headers={
            "Cookie": cookie,
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        })

        with urllib.request.urlopen(req, timeout=8) as resp:
            body = resp.read().decode('utf-8')
            parsed = json.loads(body)
            parsed["email"] = email
            return parsed

    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    result = get_cursor_usage()
    print(json.dumps(result))
