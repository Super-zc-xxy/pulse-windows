use super::{now, number, quota};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::{json, Value};

// Read routing metadata only; token authenticity is checked by the upstream API.
pub fn account_id(token: &str) -> Option<String> {
    if token.len() > 32768 {
        return None;
    }
    let bytes = URL_SAFE_NO_PAD.decode(token.split('.').nth(1)?).ok()?;
    let claims: Value = serde_json::from_slice(&bytes).ok()?;
    let id = claims["https://api.openai.com/auth"]["chatgpt_account_id"].as_str()?;
    if id.is_empty()
        || id.len() > 256
        || !id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
    {
        return None;
    }
    Some(id.into())
}
fn windows(group: &Value, scope: &str, output: &mut Vec<Value>) {
    for field in ["primary_window", "secondary_window"] {
        let w = &group[field];
        let Some(percent) = number(&w["used_percent"]).filter(|n| (0.0..=100.0).contains(n)) else {
            continue;
        };
        let duration = number(&w["limit_window_seconds"]);
        let label = match duration {
            Some(18000.0) => "5 小时额度".into(),
            Some(604800.0) => "每周额度".into(),
            Some(seconds) if seconds > 0.0 => format!("{} 小时额度", seconds / 3600.0),
            _ => "额度窗口".into(),
        };
        let reset = number(&w["reset_at"])
            .filter(|n| *n > 0.0)
            .or_else(|| {
                number(&w["reset_after_seconds"])
                    .filter(|n| *n >= 0.0)
                    .map(|n| now() as f64 + n)
            })
            .filter(|n| *n <= 253402300799.0)
            .map(|n| json!(n as u64))
            .unwrap_or(Value::Null);
        let name = if scope.is_empty() {
            label
        } else {
            format!("{scope} · {label}")
        };
        output.push(quota(&name, percent, &reset));
    }
}
pub fn parse(value: &Value) -> Result<Value, String> {
    let mut pools = Vec::new();
    windows(&value["rate_limit"], "", &mut pools);
    if let Some(extra) = value["additional_rate_limits"].as_array() {
        for item in extra {
            windows(
                &item["rate_limit"],
                item["limit_name"]
                    .as_str()
                    .or(item["metered_feature"].as_str())
                    .unwrap_or("模型额度"),
                &mut pools,
            );
        }
    }
    windows(&value["code_review_rate_limit"], "代码审查", &mut pools);
    if pools.is_empty() {
        return Err("Provider returned no supported quota windows".into());
    }
    Ok(
        json!({"kind":"quota", "windows":pools, "plan":value["plan_type"].as_str(),
        "creditBalance":number(&value["credits"]["balance"]).map(|n|n.to_string()),
        "creditsUnlimited":value["credits"]["unlimited"].as_bool(),
        "limitReached":value["rate_limit"]["limit_reached"]==true || value["rate_limit"]["allowed"]==false || value["spend_control"]["reached"]==true}),
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn routing_claim_is_bounded_and_never_accepts_header_injection() {
        for (id, valid) in [("acct-123", true), ("acct\r\nx-test:1", false), ("", false)] {
            let body = json!({"https://api.openai.com/auth":{"chatgpt_account_id":id}});
            let token = format!(
                "test.{}.signature",
                URL_SAFE_NO_PAD.encode(body.to_string())
            );
            assert_eq!(account_id(&token).is_some(), valid);
        }
        assert!(account_id("invalid").is_none());
    }
}
