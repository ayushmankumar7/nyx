mod media;
mod overlay;
mod system;
mod todos;
mod weather;

use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{
    AppHandle, Emitter, Manager,
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    webview::{PermissionKind, PermissionResponse},
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

/// Latest value of everything the island displays, so a freshly loaded
/// webview can render immediately instead of waiting for the next event.
#[derive(Default, Clone, Serialize)]
pub struct Snapshot {
    pub media: Option<media::NowPlaying>,
    pub battery: Option<system::Battery>,
    pub volume: Option<system::Volume>,
}

pub type Shared = Arc<Mutex<Snapshot>>;

#[tauri::command]
fn snapshot(state: tauri::State<'_, Shared>) -> Snapshot {
    state.lock().unwrap().clone()
}

#[tauri::command]
fn media_control(action: String) {
    std::thread::spawn(move || media::control(&action));
}

#[tauri::command]
fn media_seek(position_ms: u64) {
    std::thread::spawn(move || media::seek(position_ms));
}

#[tauri::command]
fn set_volume(level: f32) {
    system::set_volume(level);
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_, _, _| {}))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        // The island can't host WebView2's own permission prompt (it never takes
        // focus and is click-through), so answer for it: the camera is used only
        // by the Mirror panel, and only while that panel is open.
        .on_permission_request(|_, kind| match kind {
            PermissionKind::Camera => PermissionResponse::Allow,
            _ => PermissionResponse::Default,
        })
        .manage(Shared::default())
        .invoke_handler(tauri::generate_handler![
            snapshot,
            media_control,
            media_seek,
            set_volume,
            overlay::set_hit_rect,
            todos::load_todos,
            todos::save_todos,
            todos::set_typing,
            todos::load_vibes,
            todos::save_vibes,
            weather::weather_active
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let window = app.get_webview_window("island").expect("island window");
            overlay::install(app.handle(), &window)?;
            weather::install(app.handle())?;
            build_tray(app.handle())?;
            register_hotkeys(app.handle())?;

            let shared = app.state::<Shared>().inner().clone();
            media::spawn(app.handle().clone(), shared.clone());
            system::spawn(app.handle().clone(), shared);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running nyx");
}

/// Ctrl+Alt+T: quick-add a to-do. Ctrl+Alt+N: pin the panel open (or unpin).
/// Ctrl+Alt+W: desktop weather on/off.
fn register_hotkeys(app: &AppHandle) -> tauri::Result<()> {
    use tauri_plugin_global_shortcut::{
        Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
    };
    let quick_add = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyT);
    let pin = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyN);
    let weather = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyW);
    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, shortcut, event| {
                if event.state() != ShortcutState::Pressed {
                    return;
                }
                if shortcut == &quick_add {
                    overlay::set_user_visible(app, true);
                    let _ = app.emit("hotkey", "quick-add");
                } else if shortcut == &pin {
                    overlay::set_user_visible(app, true);
                    let _ = app.emit("hotkey", "pin");
                } else if shortcut == &weather {
                    let _ = app.emit("hotkey", "weather");
                }
            })
            .build(),
    )?;
    // Another app may already own a combination; Nyx still works without it.
    for s in [quick_add, pin, weather] {
        if let Err(e) = app.global_shortcut().register(s) {
            eprintln!("nyx: couldn't register {s}: {e}");
        }
    }
    Ok(())
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let autostart = app.autolaunch();
    let show = CheckMenuItem::with_id(app, "show", "Show the moon", true, true, None::<&str>)?;
    let login = CheckMenuItem::with_id(
        app,
        "login",
        "Launch at login",
        true,
        autostart.is_enabled().unwrap_or(false),
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Quit Nyx", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&show, &login, &PredefinedMenuItem::separator(app)?, &quit],
    )?;

    TrayIconBuilder::with_id("nyx")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Nyx")
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "show" => {
                let visible = show.is_checked().unwrap_or(true);
                overlay::set_user_visible(app, visible);
            }
            "login" => {
                let al = app.autolaunch();
                let _ = if login.is_checked().unwrap_or(false) {
                    al.enable()
                } else {
                    al.disable()
                };
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}
