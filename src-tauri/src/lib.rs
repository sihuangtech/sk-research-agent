mod localization;
use serde::Serialize;
use std::{
    env, fs,
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::PathBuf,
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};
use tauri::{Manager, State};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};
use uuid::Uuid;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackendConnection {
    base_url: String,
    token: String,
}
struct BackendState {
    connection: BackendConnection,
    address: SocketAddr,
    child: Mutex<Option<CommandChild>>,
}

#[tauri::command]
async fn backend_connection(state: State<'_, BackendState>) -> Result<BackendConnection, String> {
    let address = state.address;
    let connection = state.connection.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let deadline = Instant::now() + Duration::from_secs(30);
        while Instant::now() < deadline {
            if let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(250)) {
                let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
                let request = format!("GET /api/health HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {}\r\nConnection: close\r\n\r\n", connection.token);
                let mut buffer = [0; 256];
                if stream.write_all(request.as_bytes()).is_ok() {
                    if let Ok(size) = stream.read(&mut buffer) {
                        if String::from_utf8_lossy(&buffer[..size]).starts_with("HTTP/1.1 200") { return Ok(connection); }
                    }
                }
            }
            thread::sleep(Duration::from_millis(150));
        }
        Err("backendBoot".to_string())
    }).await.map_err(|e| e.to_string())?
}

fn stop_backend(app: &tauri::AppHandle) {
    let Some(state) = app.try_state::<BackendState>() else {
        return;
    };
    if let Ok(mut stream) = TcpStream::connect_timeout(&state.address, Duration::from_secs(1)) {
        let _ = stream.set_read_timeout(Some(Duration::from_secs(8)));
        let request = format!("POST /api/shutdown HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", state.connection.token);
        let _ = stream.write_all(request.as_bytes());
        let mut response = Vec::new();
        let _ = stream.read_to_end(&mut response);
    }
    // Parent-death monitoring also handles an unexpected desktop crash.
    if let Ok(mut guard) = state.child.lock() {
        if let Some(child) = guard.take() {
            let _ = child.kill();
        }
    };
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            backend_connection,
            localization::set_locale
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            let listener = TcpListener::bind(("127.0.0.1", 0))?;
            let address = listener.local_addr()?;
            drop(listener);
            let token = Uuid::new_v4().simple().to_string();
            let data_dir = env::var_os("AGENTIC_DATA_DIR")
                .map(PathBuf::from)
                .unwrap_or(app.path().app_data_dir()?);
            fs::create_dir_all(&data_dir)?;
            let bundled_runtime = app.path().resource_dir()?.join("runtime");
            let runtime = if bundled_runtime.join("dist/service/main.js").is_file() {
                bundled_runtime
            } else if cfg!(debug_assertions) {
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("runtime")
            } else {
                bundled_runtime
            };
            let entry = runtime.join("dist/service/main.js");
            if !entry.is_file() {
                return Err(format!("Agent 运行时未准备好：{}", entry.display()).into());
            }
            let args = vec![
                entry.to_string_lossy().into_owned(),
                "--port".into(),
                address.port().to_string(),
                "--data-dir".into(),
                data_dir.to_string_lossy().into_owned(),
                "--parent-pid".into(),
                std::process::id().to_string(),
            ];
            let (mut events, child) = app
                .shell()
                .sidecar("research-node")?
                .args(args)
                .env("AGENTIC_TOKEN", &token)
                .current_dir(&data_dir)
                .spawn()?;
            tauri::async_runtime::spawn(async move {
                while let Some(event) = events.recv().await {
                    match event {
                        CommandEvent::Stdout(bytes) => {
                            log::info!("[agent] {}", String::from_utf8_lossy(&bytes))
                        }
                        CommandEvent::Stderr(bytes) => {
                            log::warn!("[agent] {}", String::from_utf8_lossy(&bytes))
                        }
                        CommandEvent::Error(error) => log::error!("[agent] {error}"),
                        CommandEvent::Terminated(payload) => {
                            log::info!("Agent 已退出：{:?}", payload.code)
                        }
                        _ => {}
                    }
                }
            });
            app.manage(BackendState {
                connection: BackendConnection {
                    base_url: format!("http://{address}"),
                    token,
                },
                address,
                child: Mutex::new(Some(child)),
            });
            localization::create_tray(app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("无法启动第二月亮");
    app.run(|handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            stop_backend(handle);
        }
    });
}
