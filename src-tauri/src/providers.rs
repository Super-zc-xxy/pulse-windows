use crate::{
    auth,
    config::{Config, PROVIDERS},
};
use serde_json::{json, Value};
use std::time::Duration;
pub mod antigravity;
pub mod codex;
pub mod cursor;

pub fn isolated_test() -> bool {
    cfg!(debug_assertions) && std::env::var_os("PULSE_TEST_CONFIG").is_some()
}

pub fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
pub fn client() -> Result<reqwest::Client, String> {
    if isolated_test() {
        return Err("Network clients disabled in isolated smoke profile".into());
    }
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Cannot create HTTPS client".into())
}
pub async fn response(request: reqwest::RequestBuilder) -> Result<Value, String> {
    let mut response = request.send().await.map_err(|_| "Network request failed")?;
    match response.status().as_u16() {
        200..=299 => {}
        401 | 403 => return Err("Authentication expired or permission denied".into()),
        429 => return Err("Rate limited; retry on next refresh".into()),
        status => return Err(format!("Provider returned HTTP {status}")),
    }
    if response.content_length().is_some_and(|n| n > 2_000_000) {
        return Err("Provider response too large".into());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Cannot read provider response")?
    {
        if body.len() + chunk.len() > 2_000_000 {
            return Err("Provider response too large".into());
        }
        body.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&body).map_err(|_| "Provider returned invalid JSON".into())
}
pub fn number(v: &Value) -> Option<f64> {
    v.as_f64()
        .or_else(|| v.as_str()?.parse().ok())
        .filter(|n| n.is_finite())
}
pub fn quota(name: &str, percent: f64, reset: &Value) -> Value {
    if !percent.is_finite() || percent < 0.0 {
        return Value::Null;
    }
    json!({"name":name,"used":percent.ceil().clamp(0.0,100.0),"max":100,"unit":"%","reset":reset})
}
pub fn parse(id: &str, v: &Value) -> Result<Value, String> {
    let mut pools = Vec::new();
    match id {
        "cursor" => {
            let plan = v
                .pointer("/individualUsage/plan")
                .or_else(|| v.pointer("/teamUsage/pooled"))
                .unwrap_or(&Value::Null);
            for (field, label) in [
                ("autoPercentUsed", "Cursor Models"),
                ("apiPercentUsed", "Other Models"),
            ] {
                if let Some(n) = number(&plan[field]) {
                    pools.push(quota(label, n, &v["billingCycleEnd"]));
                }
            }
            if pools.is_empty() {
                if let (Some(used), Some(limit)) = (number(&plan["used"]), number(&plan["limit"])) {
                    if limit > 0.0 && used >= 0.0 {
                        pools.push(quota("Plan", 100.0 * used / limit, &v["billingCycleEnd"]));
                    }
                }
            }
            if let Some(demand) = v
                .pointer("/individualUsage/onDemand")
                .or_else(|| v.pointer("/teamUsage/onDemand"))
            {
                if demand["enabled"] == true {
                    if let (Some(used), Some(limit)) =
                        (number(&demand["used"]), number(&demand["limit"]))
                    {
                        if limit > 0.0 {
                            pools.push(quota(
                                "On-demand",
                                used / limit * 100.0,
                                &v["billingCycleEnd"],
                            ));
                        }
                    }
                }
            }
        }
        "antigravity" => {
            if let Some(groups) = v
                .pointer("/response/groups")
                .or_else(|| v.get("groups"))
                .and_then(Value::as_array)
            {
                for group in groups {
                    if let Some(buckets) = group["buckets"].as_array() {
                        for b in buckets {
                            if let Some(left) = number(&b["remainingFraction"]) {
                                if (0.0..=1.0).contains(&left) {
                                    pools.push(quota(
                                        &format!(
                                            "{} · {}",
                                            group["displayName"].as_str().unwrap_or("Models"),
                                            b["displayName"]
                                                .as_str()
                                                .or_else(|| b["window"].as_str())
                                                .unwrap_or("Quota")
                                        ),
                                        (1.0 - left) * 100.0,
                                        &b["resetTime"],
                                    ));
                                }
                            }
                        }
                    }
                }
            }
        }
        "codex" => return codex::parse(v),
        "claudeCode" => {
            for (field, label) in [
                ("five_hour", "5-hour session"),
                ("seven_day", "Weekly"),
                ("seven_day_sonnet", "Sonnet weekly"),
            ] {
                if let Some(n) = number(&v[field]["utilization"]) {
                    pools.push(quota(label, n, &v[field]["resets_at"]));
                }
            }
        }
        "kimi" => {
            let mut details = vec![("Usage".to_string(), &v["usage"])];
            if let Some(limits) = v["limits"].as_array() {
                for limit in limits {
                    details.push((
                        format!(
                            "{} {}",
                            limit["window"]["duration"],
                            limit["window"]["timeUnit"].as_str().unwrap_or("window")
                        ),
                        &limit["detail"],
                    ));
                }
            }
            for (label, d) in details {
                if let Some(limit) = number(&d["limit"]).filter(|n| *n > 0.0) {
                    if let Some(used) = number(&d["used"])
                        .or_else(|| number(&d["remaining"]).map(|left| limit - left))
                        .filter(|n| *n >= 0.0)
                    {
                        pools.push(quota(&label, 100.0 * used / limit, &d["resetTime"]));
                    }
                }
            }
        }
        "glm" => {
            if let Some(limits) = v.pointer("/data/limits").and_then(Value::as_array) {
                for limit in limits {
                    if let Some(n) = number(&limit["percentage"]) {
                        pools.push(quota(
                            limit["type"].as_str().unwrap_or("Coding Plan"),
                            n,
                            &limit["nextResetTime"],
                        ));
                    }
                }
            }
        }
        "deepseek" => {
            let balances = v["balance_infos"]
                .as_array()
                .ok_or("Missing balance data")?;
            let balances: Vec<_> = balances
                .iter()
                .filter_map(|b| {
                    let amount = b["total_balance"].as_str()?;
                    number(&b["total_balance"])?;
                    Some(json!({"currency":b["currency"].as_str()?,"amount":amount}))
                })
                .collect();
            if balances.is_empty() {
                return Err("No account balance returned".into());
            }
            return Ok(json!({"kind":"balance","balances":balances}));
        }
        _ => return Err("Unsupported provider".into()),
    }
    pools.retain(|p| !p.is_null());
    if pools.is_empty() {
        return Err("Provider returned no supported quota windows".into());
    }
    Ok(json!({"kind":"quota","windows":pools}))
}
async fn fetch(app: &tauri::AppHandle, id: &str, cfg: &Config) -> Result<Value, String> {
    if isolated_test() {
        return Err("Live providers disabled in isolated smoke profile".into());
    }
    if id == "cursor" {
        return parse(id, &cursor::fetch(cfg.cursor_data_dir.as_deref()).await?);
    }
    if id == "antigravity" {
        return match auth::read(id)? {
            Some(_) => {
                let credential = auth::current(app, id).await?;
                match antigravity::fetch_oauth(&credential).await {
                    Ok(data) => Ok(data),
                    Err(remote) => antigravity::fetch_local().await.map_err(|local| {
                        format!("OAuth quota failed: {remote}; local session failed: {local}")
                    }),
                }
            }
            None => antigravity::fetch_local().await,
        };
    }
    let credential = auth::current(app, id).await?;
    let url=match id {
        "codex" if credential.mode=="login"=>"https://chatgpt.com/backend-api/wham/usage",
        "claudeCode" if credential.mode=="login"=>"https://api.anthropic.com/api/oauth/usage",
        "codex"|"claudeCode"=>return Err("API Key stored; subscription quota requires login. Organization usage requires a separate admin credential.".into()),
        "kimi"=>"https://api.kimi.com/coding/v1/usages",
        "glm" if cfg.glm_region=="international"=>"https://api.z.ai/api/monitor/usage/quota/limit",
        "glm"=>"https://open.bigmodel.cn/api/monitor/usage/quota/limit",
        "deepseek"=>"https://api.deepseek.com/user/balance",
        _=>return Err("Unknown provider".into()),
    };
    let request = client()?.get(url);
    let mut request = if id == "glm" {
        request.header("Authorization", &credential.access_token)
    } else {
        request.bearer_auth(&credential.access_token)
    };
    if id == "codex" {
        if let Some(account) = codex::account_id(&credential.access_token) {
            request = request.header("ChatGPT-Account-Id", account);
        }
    }
    if id == "claudeCode" {
        request = request.header("anthropic-beta", "oauth-2025-04-20");
    }
    parse(id, &response(request).await?)
}
pub async fn collect(app: &tauri::AppHandle, cfg: &Config) -> Vec<Value> {
    futures::future::join_all(cfg.providers.iter().filter(|p|p.enabled).map(|p|async move {
        let mut data=if cfg.demo_mode || isolated_test() {
            json!({"kind":"quota","windows":[quota("DEMO · Preview",42.0,&Value::Null)],"demo":true})
        } else {fetch(app,&p.id,cfg).await.unwrap_or_else(|e|json!({"kind":"unavailable","message":e}))};
        let (_,name,icon)=PROVIDERS.iter().find(|(id,_,_)|*id==p.id).unwrap();
        data["id"]=json!(p.id); data["name"]=json!(name);data["icon"]=json!(icon);data["collectedAt"]=json!(now()); data
    })).await
}
pub fn project(data: &[Value]) -> Vec<Value> {
    data.iter().filter_map(|d| {
        let windows=d["windows"].as_array()?;let first=windows.first()?;let percent=number(&first["used"])?;
        let escaped:Vec<_>=windows.iter().map(|w| {let mut w=w.clone();w["name"]=json!(w["name"].as_str().unwrap_or("").replace('&',"&amp;").replace('<',"&lt;").replace('>',"&gt;"));w}).collect();
        Some(json!({"id":d["id"],"name":d["name"],"icon":d["icon"],"usedPercent":percent.round(),"isGenerating":false,
            "status":if d["limitReached"]==true {"limited"} else if percent>=90.0 {"critical"} else if percent>=75.0 {"warning"} else {"ok"},
            "primaryQuota":{"label":first["name"],"resetTime":first["reset"]},
            "plan":d["plan"],"creditBalance":d["creditBalance"],"creditsUnlimited":d["creditsUnlimited"],"breakdown":escaped,"burnRate":{"estimateText":if d["demo"]==true {"演示数据"} else {"账户额度"},"etaToExhaustion":"暂无消耗速度估计"}}))
    }).collect()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    #[ignore = "run with PULSE_TEST_CONFIG set"]
    async fn smoke_profile_blocks_credentials_and_network() {
        assert!(isolated_test());
        assert!(client().is_err());
        assert!(cursor::fetch(None).await.is_err());
        assert!(antigravity::fetch_local().await.is_err());
        assert!(auth::read("cursor").unwrap().is_none());
        assert!(auth::save_key("kimi", "test-only").is_err());
        assert!(auth::delete("kimi").is_err());
    }
    #[test]
    fn missing_data_is_not_free_quota() {
        for (id, _, _) in PROVIDERS {
            assert!(parse(id, &json!({})).is_err());
        }
        let d = parse(
            "deepseek",
            &json!({"balance_infos":[{"currency":"CNY","total_balance":"12.34"}]}),
        )
        .unwrap();
        assert!(project(&[d]).is_empty());
        let d=parse("kimi",&json!({"limits":[{"window":{"duration":5,"timeUnit":"HOUR"},"detail":{"limit":"100","remaining":"25"}}]})).unwrap();
        assert_eq!(d["windows"][0]["used"], 75.0);
        let malicious = json!({"windows":[{"name":"<img src=x onerror=alert(1)>","used":25,"max":100,"unit":"%"}]});
        assert_eq!(
            project(&[malicious])[0]["breakdown"][0]["name"],
            "&lt;img src=x onerror=alert(1)&gt;"
        );
        assert!(parse(
            "cursor",
            &json!({"individualUsage":{"plan":{"autoPercentUsed":-1}}})
        )
        .is_err());
        let quota = parse(
            "antigravity",
            &json!({"groups":[{"displayName":"Gemini Models","buckets":[{
                "displayName":"Weekly Limit","remainingFraction":0.75,"resetTime":"2026-09-10T00:00:00Z"
            }]}]}),
        )
        .unwrap();
        assert_eq!(quota["windows"][0]["name"], "Gemini Models · Weekly Limit");
        assert_eq!(quota["windows"][0]["used"], 25.0);
        assert_eq!(
            parse(
                "cursor",
                &json!({"teamUsage":{"pooled":{"used":25,"limit":100}}})
            )
            .unwrap()["windows"][0]["used"],
            25.0
        );
        assert!(parse(
            "antigravity",
            &json!({"response":{"groups":[{"buckets":[{}]}]}})
        )
        .is_err());
    }

    #[test]
    fn displayed_quota_rounds_up_and_never_exceeds_one_hundred() {
        assert_eq!(quota("test", 2.1760200000000007, &Value::Null)["used"], 3.0);
        assert_eq!(quota("test", 100.1, &Value::Null)["used"], 100.0);
    }
}

#[cfg(test)]
mod codex_regression_tests {
    use super::*;
    #[test]
    fn codex_preserves_weekly_primary_extra_windows_and_metadata() {
        let mut data = parse("codex", &json!({
            "plan_type":"pro", "credits":{"balance":"12.5","unlimited":false},
            "rate_limit":{"primary_window":{"used_percent":43,"limit_window_seconds":604800,"reset_at":1900000000}},
            "additional_rate_limits":[{"limit_name":"Spark","rate_limit":{
                "primary_window":{"used_percent":15,"limit_window_seconds":18000,"reset_after_seconds":3600},
                "secondary_window":{"used_percent":25,"limit_window_seconds":604800,"reset_at":1900001000}}}],
            "code_review_rate_limit":{"primary_window":{"used_percent":5,"limit_window_seconds":604800,"reset_at":1900002000}}
        })).unwrap();
        assert_eq!(data["windows"].as_array().unwrap().len(), 4);
        assert_eq!(data["windows"][0]["name"], "每周额度");
        assert_eq!(data["windows"][1]["name"], "Spark · 5 小时额度");
        assert!(data["windows"][1]["reset"].as_u64().unwrap() >= now() + 3599);
        assert_eq!(data["plan"], "pro");
        data["id"] = json!("codex");
        let view = project(&[data]);
        assert_eq!(view[0]["primaryQuota"]["resetTime"], 1900000000u64);
        assert_eq!(view[0]["creditBalance"], "12.5");
        let limited = parse(
            "codex",
            &json!({"rate_limit":{"limit_reached":true,"primary_window":{"used_percent":43}}}),
        )
        .unwrap();
        assert_eq!(project(&[limited])[0]["status"], "limited");
    }
}
