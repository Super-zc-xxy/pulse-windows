use crate::auth::Credential;
use serde_json::{json, Value};
use std::time::Duration;
use tokio::process::Command;

const PROD_API: &str = "https://cloudcode-pa.googleapis.com";
const DAILY_API: &str = "https://daily-cloudcode-pa.googleapis.com";

fn user_agent() -> String {
    format!(
        "antigravity/hub/2.9.1 {}/{}",
        std::env::consts::OS,
        std::env::consts::ARCH
    )
}

fn project(value: &Value) -> Option<String> {
    ["cloudaicompanionProject", "projectId", "project"]
        .iter()
        .find_map(|key| {
            value[*key]
                .as_str()
                .or_else(|| value[*key]["id"].as_str())
                .map(str::trim)
                .filter(|id| !id.is_empty() && id.len() <= 1024)
                .map(str::to_owned)
        })
}

fn default_tier(value: &Value) -> &str {
    value["allowedTiers"]
        .as_array()
        .and_then(|tiers| tiers.iter().find(|tier| tier["isDefault"] == true))
        .and_then(|tier| tier["id"].as_str())
        .or_else(|| value["currentTier"]["id"].as_str())
        .filter(|tier| !tier.trim().is_empty())
        .unwrap_or("free-tier")
}

fn cloud_request(url: String, token: &str, body: Value) -> Result<reqwest::RequestBuilder, String> {
    Ok(super::client()?
        .post(url)
        .bearer_auth(token)
        .header("User-Agent", user_agent())
        .header("Accept", "*/*")
        .json(&body))
}

pub async fn discover_project(token: &str) -> Result<String, String> {
    let mut last = "Antigravity project discovery failed".to_string();
    for base in [PROD_API, DAILY_API] {
        let request = cloud_request(
            format!("{base}/v1internal:loadCodeAssist"),
            token,
            json!({"metadata":{"ideType":"ANTIGRAVITY"}}),
        )?;
        match super::response(request).await {
            Ok(value) => {
                if let Some(id) = project(&value) {
                    return Ok(id);
                }
                let tier = default_tier(&value).to_owned();
                return onboard(token, &tier).await;
            }
            Err(error) => last = error,
        }
    }
    Err(last)
}

async fn onboard(token: &str, tier: &str) -> Result<String, String> {
    let metadata = json!({
        "ide_type":"ANTIGRAVITY",
        "ide_version":"2.9.1",
        "ide_name":"antigravity"
    });
    for _ in 0..5 {
        let request = cloud_request(
            format!("{DAILY_API}/v1internal:onboardUser"),
            token,
            json!({"tier_id":tier,"metadata":metadata.clone()}),
        )?
        .header("X-Goog-Api-Client", "gl-node/22.21.1")
        .header(
            "User-Agent",
            format!("{} google-api-nodejs-client/10.3.0", user_agent()),
        );
        let value = super::response(request).await?;
        if value["done"] == true {
            return project(&value["response"])
                .ok_or_else(|| "Antigravity onboarding returned no project".into());
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
    Err("Antigravity onboarding did not complete".into())
}

pub async fn fetch_oauth(credential: &Credential) -> Result<Value, String> {
    if credential.project_id.trim().is_empty() {
        return Err("Antigravity login is missing its project; log in again".into());
    }
    let mut last = "Antigravity quota query failed".to_string();
    for base in [DAILY_API, PROD_API] {
        let request = cloud_request(
            format!("{base}/v1internal:retrieveUserQuotaSummary"),
            &credential.access_token,
            json!({"project":&credential.project_id}),
        )?;
        match super::response(request)
            .await
            .and_then(|value| super::parse("antigravity", &value))
        {
            Ok(data) => return Ok(data),
            Err(error) => last = error,
        }
    }
    Err(last)
}

async fn command(program: &str, args: &[&str]) -> Result<String, String> {
    let mut command = Command::new(program);
    command.args(args).kill_on_drop(true);
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);
    let output = tokio::time::timeout(Duration::from_secs(3), command.output())
        .await
        .map_err(|_| "Antigravity process discovery timed out")?
        .map_err(|_| "Antigravity discovery command unavailable")?;
    if !output.status.success() {
        return Err("Antigravity discovery command failed".into());
    }
    String::from_utf8(output.stdout).map_err(|_| "Invalid process metadata".into())
}
fn csrf(args: &str) -> Option<String> {
    let mut parts = args.split_whitespace();
    while let Some(part) = parts.next() {
        let value = if part == "--csrf_token" {
            parts.next()
        } else {
            part.strip_prefix("--csrf_token=")
        };
        if let Some(value) = value {
            let value = value.trim_matches('"');
            if !value.is_empty()
                && value.len() <= 4096
                && value.bytes().all(|b| b.is_ascii_graphic())
            {
                return Some(value.into());
            }
        }
    }
    None
}
#[cfg(unix)]
async fn candidates() -> Result<Vec<(u32, String)>, String> {
    let uid = command("/usr/bin/id", &["-u"]).await?;
    let output = command("/bin/ps", &["-u", uid.trim(), "-ww", "-o", "pid=,args="]).await?;
    Ok(output
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            let (pid, args) = line.split_once(char::is_whitespace)?;
            if !args.contains("language_server") || !args.to_lowercase().contains("antigravity") {
                return None;
            }
            Some((pid.parse().ok()?, csrf(args)?))
        })
        .take(16)
        .collect())
}
#[cfg(target_os = "windows")]
async fn candidates() -> Result<Vec<(u32, String)>, String> {
    let output=command("powershell.exe",&["-NoProfile","-NonInteractive","-Command",r#"$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $rows=@(foreach($p in (Get-CimInstance Win32_Process -Filter "Name LIKE '%language_server%'")) {if($p.CommandLine -match 'antigravity') {$owner=Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid -ErrorAction SilentlyContinue; if($owner.Sid -eq $sid) {$p | Select-Object ProcessId,CommandLine}}}); @($rows | Select-Object -First 16) | ConvertTo-Json -Compress"#]).await?;
    let rows: Vec<Value> =
        serde_json::from_str(&output).map_err(|_| "Invalid Windows process metadata")?;
    Ok(rows
        .iter()
        .filter_map(|row| {
            Some((
                u32::try_from(row["ProcessId"].as_u64()?).ok()?,
                csrf(row["CommandLine"].as_str()?)?,
            ))
        })
        .take(16)
        .collect())
}
#[cfg(target_os = "macos")]
async fn ports(pid: u32) -> Result<Vec<u16>, String> {
    let output = command(
        "/usr/sbin/lsof",
        &[
            "-nP",
            "-a",
            "-p",
            &pid.to_string(),
            "-iTCP",
            "-sTCP:LISTEN",
            "-F",
            "n",
        ],
    )
    .await?;
    Ok(output
        .lines()
        .filter(|line| line.starts_with('n'))
        .filter_map(|line| line.rsplit(':').next()?.parse().ok())
        .collect())
}
#[cfg(target_os = "windows")]
async fn ports(pid: u32) -> Result<Vec<u16>, String> {
    let script=format!("@(Get-NetTCPConnection -State Listen -OwningProcess {pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort) | ConvertTo-Json -Compress");
    let output = command(
        "powershell.exe",
        &["-NoProfile", "-NonInteractive", "-Command", &script],
    )
    .await?;
    serde_json::from_str(&output).map_err(|_| "Invalid Windows port metadata".into())
}
#[cfg(target_os = "linux")]
async fn ports(pid: u32) -> Result<Vec<u16>, String> {
    use std::collections::HashSet;
    let mut inodes = HashSet::new();
    for entry in std::fs::read_dir(format!("/proc/{pid}/fd"))
        .map_err(|_| "Cannot inspect language server sockets")?
        .flatten()
    {
        if let Ok(link) = std::fs::read_link(entry.path()) {
            if let Some(inode) = link
                .to_string_lossy()
                .strip_prefix("socket:[")
                .and_then(|s| s.strip_suffix(']'))
            {
                inodes.insert(inode.to_owned());
            }
        }
    }
    let mut ports = Vec::new();
    for name in ["tcp", "tcp6"] {
        if let Ok(table) = std::fs::read_to_string(format!("/proc/{pid}/net/{name}")) {
            for line in table.lines().skip(1) {
                let cols: Vec<_> = line.split_whitespace().collect();
                if cols.len() > 9 && cols[3] == "0A" && inodes.contains(cols[9]) {
                    if let Some(port) = cols[1]
                        .rsplit(':')
                        .next()
                        .and_then(|n| u16::from_str_radix(n, 16).ok())
                    {
                        ports.push(port);
                    }
                }
            }
        }
    }
    Ok(ports)
}
pub async fn fetch_local() -> Result<Value, String> {
    if super::isolated_test() {
        return Err("Antigravity access disabled in isolated smoke profile".into());
    }
    tokio::time::timeout(Duration::from_secs(20),async {
        let candidates=candidates().await?;
        if candidates.is_empty() {return Err("Antigravity language server not running for this user".into());}
        // This client never leaves a discovered literal loopback endpoint. No proxies or redirects.
        let client=reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none())
            .danger_accept_invalid_certs(true).timeout(Duration::from_secs(3)).build().map_err(|_|"Cannot create local RPC client")?;
        let mut last="No listening Antigravity port found".to_string();
        for (pid,token) in candidates {let mut ports=match ports(pid).await {Ok(p)=>p,Err(e)=>{last=e;continue;}};ports.sort_unstable();ports.dedup();
            for port in ports.into_iter().filter(|p|*p!=0).take(16) {
                let url=format!("https://127.0.0.1:{port}/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary");
                match super::response(client.post(url).header("x-codeium-csrf-token",&token).json(&serde_json::json!({}))).await.and_then(|v|super::parse("antigravity",&v)) {
                    Ok(data)=>return Ok(data),Err(e)=>last=e,
                }
            }
        } Err(last)
    }).await.map_err(|_|"Antigravity discovery exceeded total time budget")?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn csrf_flag_formats() {
        assert_eq!(csrf("x --csrf_token abc --port 0"), Some("abc".into()));
        assert_eq!(csrf("x --csrf_token=def"), Some("def".into()));
        assert_eq!(csrf("x --csrf_token"), None);
    }

    #[test]
    fn extracts_project_and_default_tier_without_accepting_empty_values() {
        assert_eq!(
            project(&json!({"cloudaicompanionProject":{"id":"project-1"}})),
            Some("project-1".into())
        );
        assert_eq!(
            default_tier(&json!({"allowedTiers":[
                {"id":"paid","isDefault":false},
                {"id":"standard-tier","isDefault":true}
            ]})),
            "standard-tier"
        );
        assert_eq!(project(&json!({"project":""})), None);
    }
}
