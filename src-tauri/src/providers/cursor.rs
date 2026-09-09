use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rusqlite::{types::ValueRef, Connection, OpenFlags};
use serde_json::Value;
use std::path::Path;

fn token(path: &Path) -> Result<String, String> {
    let db = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|_| "Cursor database unavailable; open Cursor and log in")?;
    db.busy_timeout(std::time::Duration::from_secs(1))
        .map_err(|_| "Cannot configure SQLite timeout")?;
    db.query_row(
        "SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'",
        [],
        |row| match row.get_ref(0)? {
            ValueRef::Text(bytes) => {
                String::from_utf8(bytes.to_vec()).map_err(|_| rusqlite::Error::InvalidQuery)
            }
            ValueRef::Blob(bytes) if bytes.len() % 2 == 0 => String::from_utf16(
                &bytes
                    .chunks_exact(2)
                    .map(|b| u16::from_le_bytes([b[0], b[1]]))
                    .collect::<Vec<_>>(),
            )
            .map_err(|_| rusqlite::Error::InvalidQuery),
            _ => Err(rusqlite::Error::InvalidQuery),
        },
    )
    .map_err(|_| "Cursor session missing or unreadable".into())
}
fn cookie(token: &str) -> Result<String, String> {
    if token.len() > 32768
        || !token
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b".-_".contains(&b))
    {
        return Err("Invalid Cursor token".into());
    }
    let parts: Vec<_> = token.split('.').collect();
    if parts.len() != 3 {
        return Err("Invalid Cursor token".into());
    }
    let raw = URL_SAFE_NO_PAD
        .decode(parts[1])
        .map_err(|_| "Invalid Cursor token")?;
    let claims: Value = serde_json::from_slice(&raw).map_err(|_| "Invalid Cursor token")?;
    if claims["exp"].as_u64().ok_or("Missing Cursor expiry")? <= super::now() + 60 {
        return Err("Cursor session expired; log in within Cursor".into());
    }
    let sub = claims["sub"].as_str().ok_or("Missing Cursor account")?;
    let user = sub.rsplit('|').next().ok_or("Missing Cursor account")?;
    if user.is_empty()
        || !user
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_".contains(&b))
    {
        return Err("Invalid Cursor account".into());
    }
    Ok(format!("WorkosCursorSessionToken={user}%3A%3A{token}"))
}
pub async fn fetch(directory: Option<&str>) -> Result<Value, String> {
    if super::isolated_test() {
        return Err("Cursor access disabled in isolated smoke profile".into());
    }
    let root = match directory {
        Some(path) => std::path::PathBuf::from(path),
        None => dirs::config_dir()
            .ok_or("Cannot locate Cursor directory")?
            .join("Cursor"),
    };
    let path = root.join("User/globalStorage/state.vscdb");
    let cookie = tauri::async_runtime::spawn_blocking(move || cookie(&token(&path)?))
        .await
        .map_err(|_| "Cursor reader failed")??;
    super::response(
        super::client()?
            .get("https://cursor.com/api/usage-summary")
            .header("Cookie", cookie),
    )
    .await
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reads_text_and_utf16_from_live_wal() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("state.vscdb");
        let db = Connection::open(&path).unwrap();
        db.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE ItemTable(key TEXT, value);")
            .unwrap();
        db.execute(
            "INSERT INTO ItemTable VALUES ('cursorAuth/accessToken', ?)",
            ["abc"],
        )
        .unwrap();
        assert_eq!(token(&path).unwrap(), "abc");
        let blob: Vec<u8> = "hello".encode_utf16().flat_map(u16::to_le_bytes).collect();
        db.execute("UPDATE ItemTable SET value=?", [blob]).unwrap();
        assert_eq!(token(&path).unwrap(), "hello");
        assert!(cookie("x.e30.x").is_err());
    }
}
