pub mod auth;
pub mod config;
pub mod desktop;
pub mod providers;
use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

pub struct Snapshot {
    pub data: Vec<Value>,
    pub revision: u64,
    pub at: std::time::Instant,
}
pub struct AppState {
    pub store: Mutex<config::Store>,
    pub geometry: Mutex<(bool, f64)>,
    pub metrics: tokio::sync::Mutex<Option<Snapshot>>,
    pub revision: std::sync::atomic::AtomicU64,
    pub refresh: tokio::sync::Mutex<()>,
    pub attempts: Mutex<auth::login::Attempts>,
    pub dragging: std::sync::atomic::AtomicBool,
    pub move_sequence: std::sync::atomic::AtomicU64,
}
async fn refresh(app: &tauri::AppHandle) -> Result<Vec<Value>, String> {
    let state = app.state::<AppState>();
    let _guard = state.refresh.lock().await;
    let revision = state.revision.load(std::sync::atomic::Ordering::Relaxed);
    if let Some(cache) = state.metrics.lock().await.as_ref() {
        if cache.revision == revision && cache.at.elapsed().as_secs() < 10 {
            return Ok(cache.data.clone());
        }
    }
    let (data, revision) = loop {
        let revision = state.revision.load(std::sync::atomic::Ordering::Relaxed);
        let cfg = state
            .store
            .lock()
            .map_err(|_| "Configuration lock failed")?
            .config
            .clone();
        let data = providers::collect(app, &cfg).await;
        let current = state
            .store
            .lock()
            .map_err(|_| "Configuration lock failed")?
            .config
            .clone();
        if revision == state.revision.load(std::sync::atomic::Ordering::Relaxed)
            && serde_json::to_value(&cfg).ok() == serde_json::to_value(&current).ok()
        {
            break (data, revision);
        }
    };
    *state.metrics.lock().await = Some(Snapshot {
        data: data.clone(),
        revision,
        at: std::time::Instant::now(),
    });
    app.emit("metrics-update", providers::project(&data))
        .map_err(|_| "Cannot emit metrics")?;
    Ok(data)
}
#[tauri::command]
async fn get_metrics(app: tauri::AppHandle) -> Result<Vec<Value>, String> {
    Ok(providers::project(&refresh(&app).await?))
}
#[tauri::command]
async fn get_provider_status(app: tauri::AppHandle) -> Result<Vec<Value>, String> {
    refresh(&app).await
}
#[tauri::command]
fn get_config(state: tauri::State<AppState>) -> Result<config::Config, String> {
    Ok(state
        .store
        .lock()
        .map_err(|_| "Configuration lock failed")?
        .config
        .clone())
}
#[tauri::command]
async fn save_config(app: tauri::AppHandle, mut cfg: Value) -> Result<config::Config, String> {
    let keys = cfg
        .as_object_mut()
        .ok_or("Expected configuration object")?
        .remove("apiKeys");
    let parsed: config::Config =
        serde_json::from_value(cfg).map_err(|_| "Invalid configuration fields")?;
    parsed.validate()?;
    if let Some(keys) = keys {
        let keys = keys.as_object().ok_or("Invalid API Key fields")?;
        for (id, value) in keys {
            auth::validate_provider(id)?;
            let key = value.as_str().ok_or("Invalid API Key value")?;
            if !key.is_empty() {
                save_api_key(app.clone(), id.clone(), key.into())?;
            }
        }
    }
    app.state::<AppState>()
        .store
        .lock()
        .map_err(|_| "Configuration lock failed")?
        .save(parsed.clone())?;
    app.state::<AppState>()
        .revision
        .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    if let Err(error) = desktop::position(&app) {
        eprintln!("Pulse desktop placement: {error}");
    }
    app.emit("config-update", &parsed)
        .map_err(|_| "Cannot emit configuration")?;
    // Saving preferences must not wait for unrelated provider network requests.
    tauri::async_runtime::spawn(async move {
        if let Err(error) = refresh(&app).await {
            eprintln!("Pulse refresh after saving: {error}");
        }
    });
    Ok(parsed)
}
#[tauri::command]
fn set_expanded(app: tauri::AppHandle, expanded: bool) -> Result<bool, String> {
    let expanded = expanded
        || !app
            .state::<AppState>()
            .store
            .lock()
            .map_err(|_| "Configuration lock failed")?
            .config
            .auto_collapse;
    desktop::set_expanded(&app, expanded)?;
    Ok(expanded)
}
#[tauri::command]
fn set_window_height(app: tauri::AppHandle, height: f64) -> Result<(), String> {
    if !height.is_finite() || !(100.0..=4000.0).contains(&height) {
        return Err("Invalid window length".into());
    }
    app.state::<AppState>()
        .geometry
        .lock()
        .map_err(|_| "Window lock failed")?
        .1 = height;
    desktop::position(&app)
}
#[tauri::command]
fn open_settings(app: tauri::AppHandle) -> Result<(), String> {
    desktop::settings(&app)
}
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}
#[tauri::command]
fn start_drag(app: tauri::AppHandle) -> Result<(), String> {
    app.state::<AppState>()
        .dragging
        .store(true, std::sync::atomic::Ordering::Relaxed);
    app.get_webview_window("main")
        .ok_or("Monitor unavailable")?
        .start_dragging()
        .map_err(|_| "Cannot start dragging".into())
}
#[tauri::command]
fn get_provider_capabilities() -> Vec<Value> {
    provider_capabilities()
}
fn provider_capabilities() -> Vec<Value> {
    config::PROVIDERS.iter().map(|(id,name,_)|json!({"id":id,"name":name,"apiKey":!["cursor","antigravity"].contains(id),
        "login":(["codex","claudeCode","kimi","antigravity"].contains(id)),"loginStatus":if *id=="cursor" {"使用已登录的桌面客户端"} else if *id=="antigravity" {"Google OAuth 登录；运行中的 Antigravity 桌面会话仍可作为数据回退"} else if ["glm","deepseek"].contains(id) {"登录协议待验证，尚未实现"} else {"系统浏览器登录 · 尚待真实账户验收"}})).collect()
}
#[tauri::command]
fn get_auth_status() -> Vec<Value> {
    config::PROVIDERS
        .iter()
        .map(|(id, _, _)| match auth::read(id) {
            Ok(Some(c)) => json!({"id":id,"configured":true,"mode":c.mode}),
            Ok(None) => json!({"id":id,"configured":false}),
            Err(e) => json!({"id":id,"configured":false,"message":e}),
        })
        .collect()
}
#[tauri::command]
fn save_api_key(app: tauri::AppHandle, provider: String, key: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut attempts = state
        .attempts
        .lock()
        .map_err(|_| "Login state lock failed")?;
    if let Some((_, tx)) = attempts.remove(&provider) {
        let _ = tx.send(());
    }
    auth::save_key(&provider, &key)?;
    state
        .revision
        .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    app.emit("auth-update", get_auth_status())
        .map_err(|_| "Cannot emit auth status".into())
}
#[tauri::command]
fn logout(app: tauri::AppHandle, provider: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut attempts = state
        .attempts
        .lock()
        .map_err(|_| "Login state lock failed")?;
    if let Some((_, tx)) = attempts.remove(&provider) {
        let _ = tx.send(());
    }
    auth::delete(&provider)?;
    state
        .revision
        .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    app.emit("auth-update", get_auth_status())
        .map_err(|_| "Cannot emit auth status".into())
}
#[tauri::command]
async fn start_login(app: tauri::AppHandle, provider: String) -> Result<Value, String> {
    auth::login::start(app, provider).await
}
#[tauri::command]
fn cancel_login(state: tauri::State<AppState>, attempt_id: String) -> Result<(), String> {
    auth::login::cancel(
        &mut *state
            .attempts
            .lock()
            .map_err(|_| "Login state lock failed")?,
        &attempt_id,
    )
}

fn initialize_store(app: &tauri::AppHandle) -> Result<config::Store, String> {
    #[cfg(debug_assertions)]
    if let Some(path) = std::env::var_os("PULSE_TEST_CONFIG") {
        return config::Store::load(std::path::PathBuf::from(path));
    }
    let path = app
        .path()
        .app_config_dir()
        .map_err(|_| "Cannot locate configuration directory")?
        .join("config.json");
    let import = !path.exists();
    let mut store = config::Store::load(path)?;
    if import {
        let old = dirs::home_dir()
            .ok_or("Cannot locate home directory")?
            .join(".pulse-win/config.json");
        if old.exists() {
            let value: Value = serde_json::from_slice(
                &std::fs::read(old).map_err(|_| "Cannot read legacy configuration")?,
            )
            .map_err(|_| "Invalid legacy configuration; original preserved")?;
            let (cfg, keys) = config::decode_legacy(value)?;
            for (id, key) in keys {
                if !key.is_empty() && auth::read(&id)?.is_none() {
                    auth::save_key(&id, &key)?;
                }
            }
            store.save(cfg)?;
        } else {
            store.save(config::Config::default())?;
        }
    }
    Ok(store)
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Err(e) = open_settings(app.clone()) {
                eprintln!("{e}");
            }
        }))
        .invoke_handler(tauri::generate_handler![
            get_metrics,
            get_provider_status,
            get_config,
            save_config,
            set_expanded,
            set_window_height,
            open_settings,
            quit_app,
            start_drag,
            get_provider_capabilities,
            get_auth_status,
            save_api_key,
            logout,
            start_login,
            cancel_login
        ])
        .setup(|app| {
            let store = initialize_store(app.handle()).map_err(std::io::Error::other)?;
            app.manage(AppState {
                store: Mutex::new(store),
                geometry: Mutex::new((true, 680.0)),
                metrics: tokio::sync::Mutex::new(None),
                revision: std::sync::atomic::AtomicU64::new(0),
                refresh: tokio::sync::Mutex::new(()),
                attempts: Mutex::new(std::collections::HashMap::new()),
                dragging: std::sync::atomic::AtomicBool::new(false),
                move_sequence: std::sync::atomic::AtomicU64::new(0),
            });
            tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("Pulse")
            .inner_size(380.0, 680.0)
            .decorations(false)
            .resizable(false)
            .transparent(true)
            .shadow(false)
            .always_on_top(true)
            .accept_first_mouse(true)
            .skip_taskbar(true)
            .build()?;
            if let Err(error) = desktop::position(app.handle()) {
                eprintln!("Pulse desktop placement: {error}");
            }
            desktop::watch(app.handle())?;
            desktop::tray(app.handle())?;
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    let seconds = handle
                        .state::<AppState>()
                        .store
                        .lock()
                        .map(|s| s.config.refresh_interval_sec)
                        .unwrap_or(60);
                    tokio::time::sleep(std::time::Duration::from_secs(seconds)).await;
                    if let Err(e) = refresh(&handle).await {
                        eprintln!("Pulse refresh: {e}");
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Pulse desktop initialization failed");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn antigravity_exposes_browser_login_without_api_key_input() {
        let capabilities = provider_capabilities();
        let antigravity = capabilities
            .iter()
            .find(|provider| provider["id"] == "antigravity")
            .unwrap();
        assert_eq!(antigravity["login"], true);
        assert_eq!(antigravity["apiKey"], false);
    }
}
