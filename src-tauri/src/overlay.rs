//! The island window: a transparent, always-on-top, click-through canvas pinned
//! to the top-centre of the primary display. Only the pill drawn by the webview
//! should catch the mouse, so we poll the cursor and toggle click-through
//! whenever it crosses the hit rectangle the frontend reports.

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WebviewWindow};

/// Logical size of the canvas. It has to fit the largest expanded panel plus
/// room for its glow.
const WIDTH: f64 = 760.0;
const HEIGHT: f64 = 420.0;
const TICK: Duration = Duration::from_millis(33);

#[derive(Clone, Copy, Deserialize)]
pub struct HitRect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

static HIT: Mutex<HitRect> = Mutex::new(HitRect { x: 0.0, y: 0.0, w: 0.0, h: 0.0 });
static USER_VISIBLE: AtomicBool = AtomicBool::new(true);
static FULLSCREEN: AtomicBool = AtomicBool::new(false);

/// Called by the frontend whenever the pill changes shape. Coordinates are CSS
/// pixels relative to the window.
#[tauri::command]
pub fn set_hit_rect(rect: HitRect) {
    *HIT.lock().unwrap() = rect;
}

pub fn install(app: &AppHandle, window: &WebviewWindow) -> tauri::Result<()> {
    let mut placed_on = place(window)?;
    window.set_ignore_cursor_events(true)?;

    let app = app.clone();
    let window = window.clone();
    std::thread::spawn(move || {
        let mut inside = false;
        let mut tick: u32 = 0;
        loop {
            std::thread::sleep(TICK);
            tick = tick.wrapping_add(1);

            // About once a second: follow display changes, hide over fullscreen
            // apps, and re-assert topmost (some fullscreen apps knock it loose).
            if tick % 30 == 0 {
                if let Ok(Some(m)) = window.primary_monitor() {
                    let key = (*m.position(), *m.size(), m.scale_factor().to_bits());
                    if Some(key) != placed_on {
                        placed_on = place(&window).unwrap_or(placed_on);
                    }
                }
                let busy = platform::fullscreen_app_active();
                if busy != FULLSCREEN.swap(busy, Ordering::Relaxed) {
                    apply_visibility(&window);
                }
                if is_visible() {
                    platform::keep_on_top(&window);
                }
            }

            if !is_visible() {
                continue;
            }
            let (Ok(cursor), Ok(origin), Ok(scale)) = (
                app.cursor_position(),
                window.outer_position(),
                window.scale_factor(),
            ) else {
                continue;
            };
            let r = *HIT.lock().unwrap();
            let x = (cursor.x - origin.x as f64) / scale;
            let y = (cursor.y - origin.y as f64) / scale;
            // Treat anything above the pill as inside too, so slamming the
            // cursor into the top edge of the screen still counts.
            let now_inside = x >= r.x && x <= r.x + r.w && y <= r.y + r.h && r.w > 0.0;
            if now_inside != inside {
                inside = now_inside;
                let _ = window.set_ignore_cursor_events(!inside);
                let _ = app.emit("pointer", inside);
            }
        }
    });
    Ok(())
}

type MonitorKey = Option<(PhysicalPosition<i32>, tauri::PhysicalSize<u32>, u64)>;

fn place(window: &WebviewWindow) -> tauri::Result<MonitorKey> {
    let Some(m) = window.primary_monitor()?.or(window.current_monitor()?) else {
        return Ok(None);
    };
    let scale = m.scale_factor();
    window.set_size(LogicalSize::new(WIDTH, HEIGHT))?;
    let w = (WIDTH * scale).round() as i32;
    let pos = m.position();
    window.set_position(PhysicalPosition::new(
        pos.x + (m.size().width as i32 - w) / 2,
        pos.y,
    ))?;
    Ok(Some((*pos, *m.size(), scale.to_bits())))
}

/// Whether a fullscreen app, game or presentation owns the display (sampled
/// about once a second by the island's loop).
pub fn fullscreen_app_active() -> bool {
    FULLSCREEN.load(Ordering::Relaxed)
}

pub fn raise_island(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("island") {
        if is_visible() {
            platform::keep_on_top(&w);
        }
    }
}

fn is_visible() -> bool {
    USER_VISIBLE.load(Ordering::Relaxed) && !FULLSCREEN.load(Ordering::Relaxed)
}

fn apply_visibility(window: &WebviewWindow) {
    let _ = if is_visible() { window.show() } else { window.hide() };
}

pub fn set_user_visible(app: &AppHandle, visible: bool) {
    USER_VISIBLE.store(visible, Ordering::Relaxed);
    if let Some(window) = app.get_webview_window("island") {
        apply_visibility(&window);
    }
}

#[cfg(windows)]
mod platform {
    use tauri::WebviewWindow;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Shell::{
        QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
        SHQueryUserNotificationState,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SetWindowPos,
    };

    /// True while a fullscreen game, video or presentation owns the display.
    pub fn fullscreen_app_active() -> bool {
        matches!(
            unsafe { SHQueryUserNotificationState() },
            Ok(QUNS_BUSY | QUNS_RUNNING_D3D_FULL_SCREEN | QUNS_PRESENTATION_MODE)
        )
    }

    pub fn keep_on_top(window: &WebviewWindow) {
        if let Ok(h) = window.hwnd() {
            unsafe {
                let _ = SetWindowPos(
                    HWND(h.0),
                    Some(HWND_TOPMOST),
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                );
            }
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use tauri::WebviewWindow;

    // TODO(macos): detect fullscreen Spaces; TODO(linux): _NET_WM_STATE_FULLSCREEN.
    pub fn fullscreen_app_active() -> bool {
        false
    }

    pub fn keep_on_top(_: &WebviewWindow) {}
}
