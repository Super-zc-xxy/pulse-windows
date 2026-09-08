import sqlite3
import os

p = os.path.expandvars(r'%USERPROFILE%\.codex\logs_2.sqlite')
if os.path.exists(p):
    conn = sqlite3.connect(f'file:{p}?mode=ro', uri=True)
    c = conn.cursor()
    c.execute('SELECT name FROM sqlite_master WHERE type="table"')
    print('Tables in logs_2.sqlite:', c.fetchall())
