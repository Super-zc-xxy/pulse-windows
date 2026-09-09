// Protocol sources and upstream license notices: docs/provider-research.md and THIRD_PARTY_NOTICES.md.
use super::Credential;
use crate::{
    providers::{client, now, response},
    AppState,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, time::Duration};
use tauri::{Emitter, Manager};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::oneshot,
};

pub type Attempts = HashMap<String, (String, oneshot::Sender<()>)>;
const ANTIGRAVITY_CLIENT_SECRET: &str = "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";
fn random() -> String {
    URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>())
}
fn settings(
    provider: &str,
) -> Result<(&'static str, &'static str, &'static str, &'static str, u16), String> {
    match provider {
        "codex" => Ok((
            "https://auth.openai.com/oauth/authorize",
            "https://auth.openai.com/oauth/token",
            "app_EMoamEEZ73f0CkXaXp7hrann",
            "http://localhost:1455/auth/callback",
            1455,
        )),
        "claudeCode" => Ok((
            "https://claude.com/cai/oauth/authorize",
            "https://platform.claude.com/v1/oauth/token",
            "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
            "",
            0,
        )),
        "kimi" => Ok((
            "https://auth.kimi.com/api/oauth/device_authorization",
            "https://auth.kimi.com/api/oauth/token",
            "17e5f671-d194-4dfb-9706-5516cb48c098",
            "",
            0,
        )),
        "antigravity" => Ok((
            "https://accounts.google.com/o/oauth2/v2/auth",
            "https://oauth2.googleapis.com/token",
            "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",
            "",
            0,
        )),
        _ => Err("This provider's login protocol has not been verified".into()),
    }
}
fn credential(v: &Value) -> Result<Credential, String> {
    let token = v["access_token"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or("Login did not return an access token")?;
    let expires = v["expires_in"]
        .as_u64()
        .filter(|n| *n > 0)
        .ok_or("Login did not return an expiry")?;
    Ok(Credential {
        mode: "login".into(),
        access_token: token.into(),
        refresh_token: v["refresh_token"].as_str().unwrap_or("").into(),
        expires_at: now().saturating_add(expires),
        device_id: String::new(),
        project_id: String::new(),
    })
}

struct OpenAIPrompt {
    user_code: String,
    device_auth_id: String,
    interval: u64,
}

fn openai_prompt(value: &Value) -> Result<OpenAIPrompt, String> {
    Ok(OpenAIPrompt {
        user_code: value["user_code"]
            .as_str()
            .or_else(|| value["usercode"].as_str())
            .filter(|value| !value.is_empty())
            .ok_or("Device login did not return a user code")?
            .into(),
        device_auth_id: value["device_auth_id"]
            .as_str()
            .filter(|value| !value.is_empty())
            .ok_or("Device login did not return an attempt ID")?
            .into(),
        interval: value["interval"].as_u64().unwrap_or(5).clamp(1, 60),
    })
}

fn openai_grant(status: u16, value: &Value) -> Result<Option<(String, String)>, String> {
    if matches!(status, 403 | 404) {
        return Ok(None);
    }
    if status != 200 {
        return Err(format!("Device authorization failed (HTTP {status})"));
    }
    let code = value["authorization_code"]
        .as_str()
        .filter(|value| !value.is_empty())
        .ok_or("Device authorization did not return a code")?;
    let verifier = value["code_verifier"]
        .as_str()
        .filter(|value| !value.is_empty())
        .ok_or("Device authorization did not return a proof key")?;
    Ok(Some((code.into(), verifier.into())))
}

async fn response_with_status(request: reqwest::RequestBuilder) -> Result<(u16, Value), String> {
    let reply = request
        .send()
        .await
        .map_err(|_| "Device authorization request failed")?;
    let status = reply.status().as_u16();
    if reply
        .content_length()
        .is_some_and(|length| length > 2_000_000)
    {
        return Err("Provider response too large".into());
    }
    let body = reply
        .bytes()
        .await
        .map_err(|_| "Cannot read device authorization response")?;
    if body.len() > 2_000_000 {
        return Err("Provider response too large".into());
    }
    let value = match serde_json::from_slice(&body) {
        Ok(value) => value,
        Err(_) if matches!(status, 403 | 404) => Value::Null,
        Err(_) => return Err("Invalid device authorization response".into()),
    };
    Ok((status, value))
}

async fn openai_flow(app: &tauri::AppHandle, attempt: &str) -> Result<Credential, String> {
    let (_, token_url, client_id, _, _) = settings("codex")?;
    let prompt = openai_prompt(
        &response(
            client()?
                .post("https://auth.openai.com/api/accounts/deviceauth/usercode")
                .json(&json!({"client_id":client_id})),
        )
        .await?,
    )?;
    app.emit("login-update",json!({"attemptId":attempt,"status":"pending","message":format!("请在浏览器登录后输入设备码：{}",prompt.user_code)})).map_err(|_|"Cannot emit login status")?;
    open::that("https://auth.openai.com/codex/device").map_err(|_| "Cannot open system browser")?;
    loop {
        let (status, value) = response_with_status(
            client()?
                .post("https://auth.openai.com/api/accounts/deviceauth/token")
                .json(&json!({"device_auth_id":prompt.device_auth_id.as_str(),"user_code":prompt.user_code.as_str()})),
        )
        .await?;
        if let Some((code, verifier)) = openai_grant(status, &value)? {
            return credential(
                &response(client()?.post(token_url).form(&[
                    ("grant_type", "authorization_code"),
                    ("code", code.as_str()),
                    (
                        "redirect_uri",
                        "https://auth.openai.com/deviceauth/callback",
                    ),
                    ("client_id", client_id),
                    ("code_verifier", verifier.as_str()),
                ]))
                .await?,
            );
        }
        tokio::time::sleep(Duration::from_secs(prompt.interval)).await;
    }
}
fn callback(request: &str, path: &str, state: &str) -> Result<String, String> {
    let line = request.lines().next().ok_or("Invalid callback")?;
    let mut parts = line.split_whitespace();
    if parts.next() != Some("GET") {
        return Err("Invalid callback method".into());
    }
    let target = parts.next().ok_or("Invalid callback")?;
    let url = reqwest::Url::parse(&format!("http://localhost{target}"))
        .map_err(|_| "Invalid callback URL")?;
    if url.path() != path {
        return Err("Wrong callback path".into());
    }
    let values: Vec<_> = url.query_pairs().collect();
    if values.iter().filter(|(k, _)| k == "state").count() != 1
        || values
            .iter()
            .find(|(k, _)| k == "state")
            .map(|(_, v)| v.as_ref())
            != Some(state)
    {
        return Err("OAuth state mismatch".into());
    }
    if values.iter().any(|(k, _)| k == "error") {
        return Err("Authorization denied".into());
    }
    let codes: Vec<_> = values.iter().filter(|(k, _)| k == "code").collect();
    if codes.len() != 1 || codes[0].1.is_empty() {
        return Err("Missing authorization code".into());
    }
    Ok(codes[0].1.to_string())
}
async fn browser_flow(
    provider: &str,
    listener: TcpListener,
    state: &str,
    verifier: &str,
    redirect: &str,
) -> Result<Credential, String> {
    let (_, token_url, id, _, _) = settings(provider)?;
    let path = reqwest::Url::parse(redirect)
        .map_err(|_| "Invalid redirect")?
        .path()
        .to_owned();
    loop {
        let (mut stream, peer) = listener
            .accept()
            .await
            .map_err(|_| "Callback listener failed")?;
        if !peer.ip().is_loopback() {
            continue;
        }
        let mut raw = Vec::new();
        let mut chunk = [0; 1024];
        let read = tokio::time::timeout(Duration::from_secs(3), async {
            while raw.len() < 8192 {
                let n = stream.read(&mut chunk).await?;
                if n == 0 {
                    break;
                }
                raw.extend_from_slice(&chunk[..n]);
                if raw.windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
            }
            Ok::<_, std::io::Error>(())
        })
        .await;
        if !matches!(read, Ok(Ok(()))) {
            continue;
        }
        let result = callback(std::str::from_utf8(&raw).unwrap_or(""), &path, state);
        let message = if result.is_ok() {
            "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nAuthorization received. Return to Pulse."
        } else {
            "HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\nInvalid authorization callback."
        };
        let _ = tokio::time::timeout(Duration::from_secs(1), stream.write_all(message.as_bytes()))
            .await;
        let code = match result {
            Ok(code) => code,
            Err(e) if e == "Authorization denied" => return Err(e),
            Err(_) => continue,
        };
        let mut data = json!({"grant_type":"authorization_code","client_id":id,"code":code,"redirect_uri":redirect,"code_verifier":verifier,"state":state});
        if provider == "antigravity" {
            data["client_secret"] = json!(ANTIGRAVITY_CLIENT_SECRET);
            data.as_object_mut().unwrap().remove("code_verifier");
            data.as_object_mut().unwrap().remove("state");
        }
        let req = client()?.post(token_url);
        let req = if provider == "claudeCode" {
            req.json(&data)
        } else {
            req.form(&data)
        };
        let mut credential = credential(&response(req).await?)?;
        if provider == "antigravity" {
            credential.project_id =
                crate::providers::antigravity::discover_project(&credential.access_token).await?;
        }
        return Ok(credential);
    }
}
fn kimi_headers(request: reqwest::RequestBuilder, device: &str) -> reqwest::RequestBuilder {
    request
        .header("X-Msh-Platform", "pulse")
        .header("X-Msh-Version", env!("CARGO_PKG_VERSION"))
        .header("X-Msh-Device-Name", "Pulse desktop")
        .header("X-Msh-Device-Model", std::env::consts::OS)
        .header("X-Msh-Device-Id", device)
}
async fn kimi_flow(app: &tauri::AppHandle, attempt: &str) -> Result<Credential, String> {
    let (url, token_url, id, _, _) = settings("kimi")?;
    let data =
        response(kimi_headers(client()?.post(url), attempt).form(&[("client_id", id)])).await?;
    let uri = data["verification_uri_complete"]
        .as_str()
        .or_else(|| data["verification_uri"].as_str())
        .ok_or("Missing device authorization URL")?;
    let parsed = reqwest::Url::parse(uri).map_err(|_| "Invalid device authorization URL")?;
    if parsed.scheme() != "https"
        || !matches!(
            parsed.host_str(),
            Some("auth.kimi.com" | "www.kimi.com" | "kimi.com")
        )
    {
        return Err("Unexpected device authorization host".into());
    }
    let code = data["device_code"].as_str().ok_or("Missing device code")?;
    let user_code = data["user_code"].as_str().unwrap_or("");
    app.emit("login-update",json!({"attemptId":attempt,"status":"pending","message":format!("请在浏览器确认设备码：{user_code}")})).map_err(|_|"Cannot emit login status")?;
    open::that(uri).map_err(|_| "Cannot open system browser")?;
    let expires = data["expires_in"]
        .as_u64()
        .filter(|n| *n > 0)
        .ok_or("Missing device expiry")?
        .min(900);
    let deadline = tokio::time::Instant::now() + Duration::from_secs(expires);
    let mut interval = data["interval"].as_u64().unwrap_or(5).clamp(5, 60);
    loop {
        tokio::time::sleep(Duration::from_secs(interval)).await;
        if tokio::time::Instant::now() >= deadline {
            return Err("Device code expired".into());
        }
        let reply = kimi_headers(client()?.post(token_url), attempt)
            .form(&[
                ("client_id", id),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                ("device_code", code),
            ])
            .send()
            .await
            .map_err(|_| "Device authorization request failed")?;
        let status = reply.status();
        let body: Value = reply
            .json()
            .await
            .map_err(|_| "Invalid device authorization response")?;
        if status.is_success() {
            let mut result = credential(&body)?;
            result.device_id = attempt.into();
            return Ok(result);
        }
        match body["error"].as_str() {
            Some("authorization_pending") => {}
            Some("slow_down") => interval = (interval + 5).min(60),
            Some("access_denied") => return Err("Authorization denied".into()),
            Some("expired_token") => return Err("Device code expired".into()),
            _ => {
                return Err(format!(
                    "Device authorization failed (HTTP {})",
                    status.as_u16()
                ))
            }
        }
    }
}
pub async fn start(app: tauri::AppHandle, provider: String) -> Result<Value, String> {
    if crate::providers::isolated_test() {
        return Err("Login disabled in isolated smoke profile".into());
    }
    let (auth_url, _, id, redirect, port) = settings(&provider)?;
    let listener = if matches!(provider.as_str(), "claudeCode" | "antigravity") {
        Some(
            TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port))
                .await
                .map_err(|_| format!("Cannot bind login callback port {port}"))?,
        )
    } else {
        None
    };
    let state = random();
    let verifier = random();
    let attempt = random();
    let (cancel_tx, cancel_rx) = oneshot::channel();
    {
        let shared = app.state::<AppState>();
        let mut attempts = shared
            .attempts
            .lock()
            .map_err(|_| "Login state lock failed")?;
        if attempts.contains_key(&provider) {
            return Err("A login is already active for this provider".into());
        }
        attempts.insert(provider.clone(), (attempt.clone(), cancel_tx));
    }
    let reply =
        json!({"attemptId":attempt,"expiresAt":now()+900,"message":"请在系统浏览器完成登录"});
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let work = async {
            if let Some(listener) = listener {
                let redirect = if matches!(provider.as_str(), "antigravity" | "claudeCode") {
                    format!(
                        "http://localhost:{}{}",
                        listener
                            .local_addr()
                            .map_err(|_| "Cannot read login callback port")?
                            .port(),
                        if provider == "antigravity" {
                            "/oauth-callback"
                        } else {
                            "/callback"
                        }
                    )
                } else {
                    redirect.to_string()
                };
                let mut url =
                    reqwest::Url::parse(auth_url).map_err(|_| "Invalid authorization URL")?;
                if provider == "antigravity" {
                    url.query_pairs_mut().extend_pairs([
                        ("client_id", id),
                        ("response_type", "code"),
                        ("redirect_uri", redirect.as_str()),
                        ("state", state.as_str()),
                        ("access_type", "offline"),
                        ("prompt", "consent"),
                        ("scope", "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/cclog https://www.googleapis.com/auth/experimentsandconfigs"),
                    ]);
                } else {
                    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
                    url.query_pairs_mut().extend_pairs([
                        ("client_id", id),
                        ("response_type", "code"),
                        ("redirect_uri", redirect.as_str()),
                        ("state", &state),
                        ("code_challenge", &challenge),
                        ("code_challenge_method", "S256"),
                        ("scope", "user:profile"),
                    ]);
                }
                if provider == "claudeCode" {
                    url.query_pairs_mut().append_pair("code", "true");
                }
                open::that(url.as_str()).map_err(|_| "Cannot open system browser")?;
                browser_flow(&provider, listener, &state, &verifier, &redirect).await
            } else if provider == "codex" {
                openai_flow(&handle, &attempt).await
            } else {
                kimi_flow(&handle, &attempt).await
            }
        };
        let result = tokio::select! { _=cancel_rx=>Err("Login cancelled".into()),result=tokio::time::timeout(Duration::from_secs(900),work)=>result.unwrap_or_else(|_|Err("Login expired".into())) };
        let shared = handle.state::<AppState>();
        let result = if let Ok(mut attempts) = shared.attempts.lock() {
            if attempts
                .get(&provider)
                .is_some_and(|(id, _)| id == &attempt)
            {
                attempts.remove(&provider);
                result.and_then(|credential| super::write(&provider, &credential))
            } else {
                Err("Login cancelled".into())
            }
        } else {
            Err("Login state lock failed".into())
        };
        let _=handle.emit("login-update",json!({"attemptId":attempt,"provider":provider,"status":if result.is_ok(){"complete"}else{"error"},"message":result.err().unwrap_or_else(||"登录完成".into())}));
        shared
            .revision
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let _ = handle.emit("auth-update", crate::get_auth_status());
    });
    Ok(reply)
}
pub fn cancel(attempts: &mut Attempts, attempt: &str) -> Result<(), String> {
    let provider = attempts
        .iter()
        .find(|(_, (id, _))| id == attempt)
        .map(|(p, _)| p.clone())
        .ok_or("Login attempt not found")?;
    if let Some((_, tx)) = attempts.remove(&provider) {
        let _ = tx.send(());
    }
    Ok(())
}
pub async fn refresh(provider: &str, old: &Credential) -> Result<Credential, String> {
    if old.refresh_token.is_empty() {
        return Err("Session expired; log in again".into());
    }
    let (_, url, id, _, _) = settings(provider)?;
    let mut data =
        json!({"grant_type":"refresh_token","client_id":id,"refresh_token":old.refresh_token});
    if provider == "codex" {
        data["scope"] =
            json!("openid profile email offline_access api.connectors.read api.connectors.invoke");
    } else if provider == "claudeCode" {
        data["scope"] = json!("user:profile");
    }
    if provider == "antigravity" {
        data["client_secret"] = json!(ANTIGRAVITY_CLIENT_SECRET);
    }
    let request = client()?.post(url);
    let request = if provider == "kimi" {
        kimi_headers(request, &old.device_id)
    } else {
        request
    };
    let request = if provider == "claudeCode" {
        request.json(&data)
    } else {
        request.form(&data)
    };
    let mut fresh = credential(&response(request).await?)?;
    if fresh.refresh_token.is_empty() {
        fresh.refresh_token = old.refresh_token.clone();
    }
    fresh.device_id = old.device_id.clone();
    fresh.project_id = old.project_id.clone();
    Ok(fresh)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_wrong_or_duplicate_state() {
        assert_eq!(
            callback(
                "GET /callback?state=abc&code=xyz HTTP/1.1\r\n",
                "/callback",
                "abc"
            )
            .unwrap(),
            "xyz"
        );
        for req in [
            "GET /callback?state=no&code=xyz HTTP/1.1",
            "GET /callback?state=abc&state=abc&code=x HTTP/1.1",
            "GET /wrong?state=abc&code=x HTTP/1.1",
        ] {
            assert!(callback(req, "/callback", "abc").is_err());
        }
        assert!(credential(&json!({"access_token":"x"})).is_err());
        let (auth, token, client, redirect, port) = settings("antigravity").unwrap();
        assert_eq!(auth, "https://accounts.google.com/o/oauth2/v2/auth");
        assert_eq!(token, "https://oauth2.googleapis.com/token");
        assert!(client.ends_with(".apps.googleusercontent.com"));
        assert!(redirect.is_empty());
        assert_eq!(port, 0);
        let (tx, mut rx) = oneshot::channel();
        let mut attempts = HashMap::from([("kimi".into(), ("test".into(), tx))]);
        cancel(&mut attempts, "test").unwrap();
        assert!(attempts.is_empty());
        assert_eq!(rx.try_recv(), Ok(()));
    }

    #[test]
    fn matches_current_pulse_codex_and_claude_login_contracts() {
        let (claude_authorize, _, _, claude_redirect, claude_port) =
            settings("claudeCode").unwrap();
        assert_eq!(claude_authorize, "https://claude.com/cai/oauth/authorize");
        assert!(claude_redirect.is_empty());
        assert_eq!(claude_port, 0);

        let prompt = openai_prompt(&json!({
            "user_code": "ABCD-EFGH",
            "device_auth_id": "device-id",
            "interval": 2
        }))
        .unwrap();
        assert_eq!(prompt.user_code, "ABCD-EFGH");
        assert_eq!(prompt.device_auth_id, "device-id");
        assert_eq!(prompt.interval, 2);

        assert!(openai_grant(403, &json!({})).unwrap().is_none());
        assert!(openai_grant(404, &json!({})).unwrap().is_none());
        assert_eq!(
            openai_grant(
                200,
                &json!({"authorization_code":"code","code_verifier":"proof"})
            )
            .unwrap(),
            Some(("code".into(), "proof".into()))
        );
        assert!(openai_grant(200, &json!({})).is_err());
    }
}
