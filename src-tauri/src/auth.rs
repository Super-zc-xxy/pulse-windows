pub mod login;
use crate::config::PROVIDERS;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct Credential {
    pub mode: String,
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: String,
    #[serde(default)]
    pub expires_at: u64,
    #[serde(default)]
    pub device_id: String,
    #[serde(default)]
    pub project_id: String,
}
pub fn validate_provider(provider: &str) -> Result<(), String> {
    if !PROVIDERS.iter().any(|(id, _, _)| *id == provider) {
        return Err("Unknown provider".into());
    }
    Ok(())
}
fn entry(provider: &str) -> Result<keyring::Entry, String> {
    validate_provider(provider)?;
    keyring::Entry::new("com.pulse.desktop", provider)
        .map_err(|_| "System credential store unavailable".into())
}
pub fn read(provider: &str) -> Result<Option<Credential>, String> {
    #[cfg(debug_assertions)]
    if std::env::var_os("PULSE_TEST_CONFIG").is_some() {
        return Ok(None);
    }
    match entry(provider)?.get_password() {
        Ok(raw) => serde_json::from_str(&raw)
            .map(Some)
            .map_err(|_| "Stored credential is invalid".into()),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("Cannot read system credential store; unlock it and retry".into()),
    }
}
pub fn write(provider: &str, credential: &Credential) -> Result<(), String> {
    #[cfg(debug_assertions)]
    if std::env::var_os("PULSE_TEST_CONFIG").is_some() {
        return Err("Credential writes disabled in isolated smoke profile".into());
    }
    entry(provider)?
        .set_password(&serde_json::to_string(credential).map_err(|_| "Cannot encode credential")?)
        .map_err(|_| "Cannot save credential to system store".into())
}
pub fn save_key(provider: &str, key: &str) -> Result<(), String> {
    if ["cursor", "antigravity"].contains(&provider) {
        return Err("This provider uses its desktop session".into());
    }
    if key.is_empty() || key.len() > 8192 || key.chars().any(char::is_control) {
        return Err("Invalid API Key".into());
    }
    write(
        provider,
        &Credential {
            mode: "apiKey".into(),
            access_token: key.into(),
            refresh_token: String::new(),
            expires_at: 0,
            device_id: String::new(),
            project_id: String::new(),
        },
    )
}
pub fn delete(provider: &str) -> Result<(), String> {
    #[cfg(debug_assertions)]
    if std::env::var_os("PULSE_TEST_CONFIG").is_some() {
        return Err("Credential writes disabled in isolated smoke profile".into());
    }
    match entry(provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Cannot delete system credential".into()),
    }
}

pub async fn current(app: &tauri::AppHandle, provider: &str) -> Result<Credential, String> {
    use tauri::Manager;
    let old = read(provider)?.ok_or("Configure API Key or log in from Accounts")?;
    if old.mode != "login" || old.expires_at > crate::providers::now() + 60 {
        return Ok(old);
    }
    let fresh = login::refresh(provider, &old).await?;
    let state = app.state::<crate::AppState>();
    let _guard = state
        .attempts
        .lock()
        .map_err(|_| "Login state lock failed")?;
    let current = read(provider)?.ok_or("Account was logged out during refresh")?;
    if current.access_token != old.access_token {
        return Ok(current);
    }
    write(provider, &fresh)?;
    Ok(fresh)
}
