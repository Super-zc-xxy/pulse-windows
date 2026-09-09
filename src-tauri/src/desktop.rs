use crate::{config::Config, AppState};
use tauri::{Emitter, Manager};

fn contains_point(
    position: tauri::PhysicalPosition<i32>,
    size: tauri::PhysicalSize<u32>,
    cursor: tauri::PhysicalPosition<f64>,
) -> bool {
    cursor.x >= position.x as f64
        && cursor.x < (position.x as f64 + size.width as f64)
        && cursor.y >= position.y as f64
        && cursor.y < (position.y as f64 + size.height as f64)
}

pub fn bounds(cfg: &Config, expanded: bool, length: f64, area: [f64; 4]) -> [f64; 4] {
    let [x, y, w, h] = area;
    let top = cfg.dock_side == "top";
    let width = if top {
        length
    } else if expanded {
        380.0
    } else {
        18.0
    };
    let height = if !top {
        length
    } else if expanded {
        520.0
    } else {
        18.0
    };
    let width = width.min(w);
    let height = height.min(h);
    let px = if top {
        cfg.drag_offset_top.unwrap_or(x + (w - width) / 2.0)
    } else if cfg.dock_side == "left" {
        x
    } else {
        x + w - width
    };
    let py = if top {
        y
    } else {
        cfg.drag_offset_side.unwrap_or(y + (h - height) / 2.0)
    };
    [
        px.clamp(x, x + w - width),
        py.clamp(y, y + h - height),
        width,
        height,
    ]
}
pub fn position(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Monitor window unavailable")?;
    let _ = window.set_always_on_top(true);
    let monitor = window
        .current_monitor()
        .map_err(|_| "Cannot get monitor")?
        .or(window
            .primary_monitor()
            .map_err(|_| "Cannot get primary monitor")?)
        .ok_or("No monitor")?;
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let state = app.state::<AppState>();
    let cfg = state
        .store
        .lock()
        .map_err(|_| "Configuration lock failed")?
        .config
        .clone();
    let (expanded, length) = *state.geometry.lock().map_err(|_| "Window lock failed")?;
    let [x, y, w, h] = bounds(
        &cfg,
        expanded,
        length,
        [
            area.position.x as f64 / scale,
            area.position.y as f64 / scale,
            area.size.width as f64 / scale,
            area.size.height as f64 / scale,
        ],
    );
    window
        .set_size(tauri::LogicalSize::new(w, h))
        .map_err(|_| "Cannot resize window")?;
    window
        .set_position(tauri::LogicalPosition::new(x, y))
        .map_err(|_| "Cannot position window".into())
}
pub fn set_expanded(app: &tauri::AppHandle, expanded: bool) -> Result<(), String> {
    app.state::<AppState>()
        .geometry
        .lock()
        .map_err(|_| "Window lock failed")?
        .0 = expanded;
    position(app)?;
    app.emit("expanded-update", expanded)
        .map_err(|_| "Cannot emit window state".into())
}
pub fn settings(app: &tauri::AppHandle) -> Result<(), String> {
    let window = if let Some(window) = app.get_webview_window("settings") {
        window
    } else {
        tauri::WebviewWindowBuilder::new(
            app,
            "settings",
            tauri::WebviewUrl::App("accounts.html".into()),
        )
        .title("Pulse · 设置")
        .inner_size(720.0, 700.0)
        .min_inner_size(480.0, 400.0)
        .build()
        .map_err(|_| "Cannot open settings")?
    };
    window
        .show()
        .and_then(|_| window.set_focus())
        .map_err(|_| "Cannot focus settings".into())
}
pub fn tray(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{Menu, MenuItem, Submenu};
    let native_menu = Menu::default(app)?;
    let settings_item =
        MenuItem::with_id(app, "settings", "设置", true, Some("CmdOrCtrl+Shift+A"))?;
    native_menu.append(&Submenu::with_items(app, "Pulse", true, &[&settings_item])?)?;
    app.set_menu(native_menu)?;
    app.on_menu_event(|app, event| {
        if event.id.as_ref() == "settings" {
            if let Err(error) = settings(app) {
                eprintln!("Pulse settings: {error}");
            }
        }
    });
    let items = [
        ("show", "显示监控"),
        ("settings", "偏好设置"),
        ("left", "停靠左侧"),
        ("right", "停靠右侧"),
        ("top", "停靠顶部"),
        ("quit", "退出 Pulse"),
    ];
    let entries: Vec<_> = items
        .iter()
        .map(|(id, label)| MenuItem::with_id(app, *id, *label, true, None::<&str>))
        .collect::<Result<_, _>>()?;
    let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
        entries.iter().map(|item| item as _).collect();
    let menu = Menu::with_items(app, &refs)?;
    let mut builder = tauri::tray::TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Pulse");
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder
        .on_menu_event(|app, event| {
            let result = match event.id.as_ref() {
                "quit" => {
                    app.exit(0);
                    Ok(())
                }
                "settings" => settings(app),
                side @ ("left" | "right" | "top") => {
                    let state = app.state::<AppState>();
                    let result = (|| {
                        let mut store = state
                            .store
                            .lock()
                            .map_err(|_| "Configuration lock failed")?;
                        let mut cfg = store.config.clone();
                        cfg.dock_side = side.into();
                        store.save(cfg.clone())?;
                        app.emit("config-update", cfg)
                            .map_err(|_| "Cannot emit config")?;
                        Ok(())
                    })();
                    result.and_then(|_| position(app))
                }
                "show" => {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                    Ok(())
                }
                _ => Ok(()),
            };
            if let Err(error) = result {
                eprintln!("Pulse desktop: {error}");
            }
        })
        .build(app)?;
    Ok(())
}
pub fn watch(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use std::sync::atomic::Ordering;
    let window = app
        .get_webview_window("main")
        .ok_or("Monitor unavailable")?;
    let handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Focused(false)) {
            if let Some(window) = handle.get_webview_window("main") {
                let _ = window.set_always_on_top(true);
            }
        }
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            if let Some(window) = handle.get_webview_window("main") {
                let _ = window.hide();
            }
            return;
        }
        if matches!(event, tauri::WindowEvent::ScaleFactorChanged { .. }) {
            let _ = position(&handle);
        }
        if !matches!(event, tauri::WindowEvent::Moved(_)) {
            return;
        }
        let state = handle.state::<AppState>();
        if !state.dragging.load(Ordering::Relaxed) {
            return;
        }
        let sequence = state.move_sequence.fetch_add(1, Ordering::Relaxed) + 1;
        let handle = handle.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
            let state = handle.state::<AppState>();
            if state.move_sequence.load(Ordering::Relaxed) != sequence {
                return;
            }
            if let Err(e) = snap(&handle) {
                eprintln!("Pulse docking: {e}");
            }
        });
    });
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut outside_since = None;
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(80)).await;
            let Some(window) = handle.get_webview_window("main") else {
                continue;
            };
            if window.is_focused().unwrap_or(false) || !window.is_visible().unwrap_or(false) {
                outside_since = None;
                continue;
            }
            let Ok(cursor) = handle.cursor_position() else {
                continue;
            };
            let (Ok(position), Ok(size)) = (window.outer_position(), window.outer_size()) else {
                continue;
            };
            let inside = contains_point(position, size, cursor);
            let state = handle.state::<AppState>();
            let expanded = state.geometry.lock().map(|g| g.0).unwrap_or(false);
            if inside {
                outside_since = None;
                if !expanded {
                    let _ = set_expanded(&handle, true);
                }
            } else if expanded {
                let delay = state
                    .store
                    .lock()
                    .map(|s| s.config.collapse_delay_ms)
                    .unwrap_or(2500);
                let since = outside_since.get_or_insert_with(std::time::Instant::now);
                if since.elapsed() >= std::time::Duration::from_millis(delay) {
                    let _ = set_expanded(&handle, false);
                    outside_since = None;
                }
            }
        }
    });
    Ok(())
}
fn snap(app: &tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    state
        .dragging
        .store(false, std::sync::atomic::Ordering::Relaxed);
    let window = app
        .get_webview_window("main")
        .ok_or("Monitor unavailable")?;
    let monitor = window
        .current_monitor()
        .map_err(|_| "Cannot locate monitor")?
        .ok_or("No monitor")?;
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let pos = window
        .outer_position()
        .map_err(|_| "Cannot read window position")?;
    let size = window.outer_size().map_err(|_| "Cannot read window size")?;
    let top = (pos.y - area.position.y).abs();
    let left = (pos.x - area.position.x).abs();
    let right = (area.position.x + area.size.width as i32 - pos.x - size.width as i32).abs();
    let cfg = {
        let mut store = state
            .store
            .lock()
            .map_err(|_| "Configuration lock failed")?;
        let mut cfg = store.config.clone();
        cfg.dock_side = if top <= left && top <= right {
            "top"
        } else if left <= right {
            "left"
        } else {
            "right"
        }
        .into();
        if cfg.dock_side == "top" {
            cfg.drag_offset_top = Some(pos.x as f64 / scale);
        } else {
            cfg.drag_offset_side = Some(pos.y as f64 / scale);
        }
        store.save(cfg.clone())?;
        cfg
    };
    position(app)?;
    app.emit("config-update", cfg)
        .map_err(|_| "Cannot emit dock position".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounds_clamp_offsets_and_small_screens() {
        let mut c = Config {
            drag_offset_side: Some(10000.0),
            ..Config::default()
        };
        assert_eq!(
            bounds(&c, true, 680.0, [-100.0, 20.0, 200.0, 400.0]),
            [-100.0, 20.0, 200.0, 400.0]
        );
        c.dock_side = "top".into();
        c.drag_offset_top = Some(-10000.0);
        assert_eq!(
            bounds(&c, false, 680.0, [0.0, 25.0, 1000.0, 700.0]),
            [0.0, 25.0, 680.0, 18.0]
        );
    }

    #[test]
    fn global_cursor_hit_test_handles_inactive_windows_and_negative_coordinates() {
        let position = tauri::PhysicalPosition::new(-380, 120);
        let size = tauri::PhysicalSize::new(380, 680);
        assert!(contains_point(
            position,
            size,
            tauri::PhysicalPosition::new(-1.0, 799.0)
        ));
        assert!(!contains_point(
            position,
            size,
            tauri::PhysicalPosition::new(0.0, 799.0)
        ));
    }
}
