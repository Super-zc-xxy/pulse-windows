use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    io::Write,
    path::{Path, PathBuf},
};

pub const PROVIDERS: [(&str, &str, &str); 7] = [
    ("claudeCode", "Claude Code", "claude"),
    ("codex", "Codex", "openai"),
    ("antigravity", "Antigravity", "antigravity"),
    ("cursor", "Cursor", "cursor"),
    ("kimi", "Kimi Code", "kimi"),
    ("glm", "GLM Coding", "default"),
    ("deepseek", "DeepSeek", "default"),
];

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub enabled: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct Config {
    pub dock_side: String,
    pub auto_collapse: bool,
    pub collapse_delay_ms: u64,
    pub countdown_mode: String,
    pub theme: String,
    pub refresh_interval_sec: u64,
    pub demo_mode: bool,
    pub providers: Vec<Provider>,
    pub drag_offset_top: Option<f64>,
    pub drag_offset_side: Option<f64>,
    pub glm_region: String,
    pub cursor_data_dir: Option<String>,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            dock_side: "right".into(),
            auto_collapse: true,
            collapse_delay_ms: 2500,
            countdown_mode: "left".into(),
            theme: "obsidian".into(),
            refresh_interval_sec: 60,
            demo_mode: false,
            providers: PROVIDERS
                .iter()
                .enumerate()
                .map(|(i, (id, name, _))| Provider {
                    id: (*id).into(),
                    name: (*name).into(),
                    enabled: i < 5,
                })
                .collect(),
            drag_offset_top: None,
            drag_offset_side: None,
            glm_region: "cn".into(),
            cursor_data_dir: None,
        }
    }
}
impl Config {
    pub fn validate(&self) -> Result<(), String> {
        if self.cursor_data_dir.as_ref().is_some_and(|path| {
            path.len() > 4096 || path.contains('\0') || !Path::new(path).is_absolute()
        }) {
            return Err("Cursor directory must be an absolute path".into());
        }
        if !["right", "left", "top"].contains(&self.dock_side.as_str())
            || !["left", "used"].contains(&self.countdown_mode.as_str())
            || !["obsidian", "liquid-glass"].contains(&self.theme.as_str())
            || !["cn", "international"].contains(&self.glm_region.as_str())
            || !(10..=3600).contains(&self.refresh_interval_sec)
            || !(100..=60000).contains(&self.collapse_delay_ms)
            || [self.drag_offset_top, self.drag_offset_side]
                .iter()
                .flatten()
                .any(|n| !n.is_finite())
        {
            return Err("Invalid configuration value".into());
        }
        let ids: HashSet<_> = self.providers.iter().map(|p| p.id.as_str()).collect();
        if ids.len() != 7
            || self.providers.len() != 7
            || PROVIDERS.iter().any(|(id, _, _)| !ids.contains(id))
        {
            return Err("Configuration must contain each supported provider exactly once".into());
        }
        Ok(())
    }
}
pub struct Store {
    pub path: PathBuf,
    pub config: Config,
}
impl Store {
    pub fn load(path: PathBuf) -> Result<Self, String> {
        let config = if path.exists() {
            serde_json::from_slice(
                &std::fs::read(&path).map_err(|_| "Cannot read Pulse configuration")?,
            )
            .map_err(|_| "Invalid Pulse configuration; original file preserved")?
        } else {
            Config::default()
        };
        let store = Self { path, config };
        store.config.validate()?;
        Ok(store)
    }
    pub fn save(&mut self, cfg: Config) -> Result<(), String> {
        cfg.validate()?;
        atomic_json(&self.path, &cfg)?;
        self.config = cfg;
        Ok(())
    }
}
pub fn atomic_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid config path")?;
    std::fs::create_dir_all(parent).map_err(|_| "Cannot create configuration directory")?;
    let mut file = tempfile::NamedTempFile::new_in(parent)
        .map_err(|_| "Cannot create temporary configuration")?;
    serde_json::to_writer_pretty(&mut file, value).map_err(|_| "Cannot encode configuration")?;
    file.flush()
        .and_then(|_| file.as_file().sync_all())
        .map_err(|_| "Cannot flush configuration")?;
    file.persist(path)
        .map_err(|_| "Cannot replace configuration; original preserved")?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejected_config_does_not_replace_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        let mut store = Store::load(path.clone()).unwrap();
        store.save(Config::default()).unwrap();
        let before = std::fs::read(&path).unwrap();
        let mut bad = store.config.clone();
        bad.refresh_interval_sec = 0;
        assert!(store.save(bad).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), before);
        assert!(serde_json::from_str::<Config>(r#"{"secret":"no"}"#).is_err());
        let blocker = dir.path().join("blocker");
        std::fs::write(&blocker, "x").unwrap();
        store.path = blocker.join("config.json");
        let mut changed = store.config.clone();
        changed.demo_mode = true;
        assert!(store.save(changed).is_err());
        assert!(!store.config.demo_mode);
    }
}

pub fn decode_legacy(
    mut value: serde_json::Value,
) -> Result<(Config, std::collections::BTreeMap<String, String>), String> {
    let object = value
        .as_object_mut()
        .ok_or("Invalid legacy configuration")?;
    let mut keys: std::collections::BTreeMap<String, String> = match object.remove("apiKeys") {
        Some(value) => {
            serde_json::from_value(value).map_err(|_| "Invalid legacy API Key fields")?
        }
        None => Default::default(),
    };
    if let Some(providers) = object
        .get_mut("providers")
        .and_then(serde_json::Value::as_array_mut)
    {
        for provider in providers {
            if let Some(p) = provider.as_object_mut() {
                if let Some(key) = p.remove("customKey") {
                    let key = key.as_str().ok_or("Invalid legacy custom Key")?;
                    if !key.is_empty() {
                        let id = p
                            .get("id")
                            .and_then(serde_json::Value::as_str)
                            .ok_or("Missing provider ID")?;
                        if keys.get(id).is_none_or(|k| k.is_empty()) {
                            keys.insert(id.into(), key.into());
                        }
                    }
                }
            }
        }
    }
    let cfg: Config = serde_json::from_value(value)
        .map_err(|_| "Cannot import legacy configuration; original preserved")?;
    cfg.validate()?;
    for (id, key) in &keys {
        crate::auth::validate_provider(id)?;
        if key.len() > 8192 || key.chars().any(char::is_control) {
            return Err("Invalid legacy API Key".into());
        }
    }
    Ok((cfg, keys))
}
#[cfg(test)]
mod migration_tests {
    use super::*;
    #[test]
    fn import_keeps_credentials_out_of_config_and_preserves_custom_keys() {
        let mut value = serde_json::to_value(Config::default()).unwrap();
        value["providers"][4]["customKey"] = serde_json::json!("test-custom");
        let (cfg, keys) = decode_legacy(value).unwrap();
        assert_eq!(keys["kimi"], "test-custom");
        assert!(!serde_json::to_string(&cfg).unwrap().contains("test-custom"));
        assert!(decode_legacy(serde_json::json!({"apiKeys":{"unknown":"test"}})).is_err());
    }
}
