//! To-do list storage: a small JSON file in the app's data directory. The
//! frontend owns the shape of each item; Rust just keeps it safe on disk.

use std::fs;
use std::path::PathBuf;

use serde_json::Value;
use tauri::{AppHandle, Manager, WebviewWindow};

fn path(app: &AppHandle, file: &str) -> tauri::Result<PathBuf> {
    Ok(app.path().app_data_dir()?.join(file))
}

fn read(app: &AppHandle, file: &str) -> Option<Value> {
    let s = fs::read_to_string(path(app, file).ok()?).ok()?;
    serde_json::from_str(&s).ok()
}

fn write(app: &AppHandle, file: &str, value: &Value) -> Result<(), String> {
    let p = path(app, file).map_err(|e| e.to_string())?;
    if let Some(dir) = p.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    // Write-then-rename so a crash mid-save can't leave a truncated file.
    let tmp = p.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_vec_pretty(value).unwrap()).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_todos(app: AppHandle) -> Value {
    read(&app, "todos.json").unwrap_or_else(|| Value::Array(vec![]))
}

#[tauri::command]
pub fn save_todos(app: AppHandle, todos: Value) -> Result<(), String> {
    write(&app, "todos.json", &todos)
}

/// Vibes settings (weather sliders, sync, sound). `null` until first saved.
#[tauri::command]
pub fn load_vibes(app: AppHandle) -> Value {
    read(&app, "vibes.json").unwrap_or(Value::Null)
}

#[tauri::command]
pub fn save_vibes(app: AppHandle, vibes: Value) -> Result<(), String> {
    write(&app, "vibes.json", &vibes)
}

/// The island normally never takes focus so it can't steal keystrokes. While
/// the user is typing a task it has to, briefly.
#[tauri::command]
pub fn set_typing(window: WebviewWindow, typing: bool) {
    if typing {
        previous::remember();
        let _ = window.set_focusable(true);
        let _ = window.set_focus();
    } else {
        let _ = window.set_focusable(false);
        // Hand the keyboard back to whatever the user was in before.
        previous::restore();
    }
}

#[cfg(windows)]
mod previous {
    use std::sync::atomic::{AtomicIsize, Ordering};

    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId, IsWindow, SetForegroundWindow,
    };

    static PREVIOUS: AtomicIsize = AtomicIsize::new(0);

    pub fn remember() {
        let hwnd = unsafe { GetForegroundWindow() };
        let mut pid = 0;
        unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
        if pid != std::process::id() {
            PREVIOUS.store(hwnd.0 as isize, Ordering::Relaxed);
        }
    }

    pub fn restore() {
        let hwnd = HWND(PREVIOUS.swap(0, Ordering::Relaxed) as *mut _);
        if !hwnd.is_invalid() && unsafe { IsWindow(Some(hwnd)) }.as_bool() {
            let _ = unsafe { SetForegroundWindow(hwnd) };
        }
    }
}

#[cfg(not(windows))]
mod previous {
    pub fn remember() {}
    pub fn restore() {}
}
