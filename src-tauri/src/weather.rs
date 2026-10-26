//! Vibes: ambient weather drawn over the desktop. A second transparent,
//! always-click-through window covers the primary display; while weather is
//! on, a tracker streams the position and stacking order of every app window
//! to it so rain can land on title bars and snow can ride along with windows.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::Serialize;
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

use crate::overlay;

const LABEL: &str = "weather";
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required";
const TICK: Duration = Duration::from_millis(33);

/// The renderer has something to draw (any effect on and not paused).
static ACTIVE: AtomicBool = AtomicBool::new(false);

/// One app window, in CSS pixels relative to the weather canvas.
#[derive(Clone, Serialize, PartialEq)]
pub struct Win {
    pub id: u64,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub maximized: bool,
}

#[derive(Clone, Serialize)]
struct Scene<'a> {
    /// Front-to-back. Only sent when something changed.
    windows: Option<&'a [Win]>,
    cursor: (f64, f64),
}

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("weather".into()))
        .title("")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focusable(false)
        .visible(false)
        // Must match the island's args (tauri.conf.json): WebView2 windows in
        // one process share an environment. Autoplay lets the rain sound start
        // in a window that never receives a click.
        .additional_browser_args(BROWSER_ARGS)
        .build()?;
    window.set_ignore_cursor_events(true)?;
    place(&window)?;

    let app = app.clone();
    std::thread::spawn(move || track(app, window));
    Ok(())
}

/// Cover the primary display, one pixel short of its full height so Windows
/// never mistakes the canvas for a full-screen app and drops the taskbar.
fn place(window: &WebviewWindow) -> tauri::Result<()> {
    if let Some(m) = window.primary_monitor()? {
        let scale = m.scale_factor();
        window.set_position(*m.position())?;
        window.set_size(LogicalSize::new(
            m.size().width as f64 / scale,
            (m.size().height as f64 - 1.0) / scale,
        ))?;
    }
    Ok(())
}

/// The renderer reports whether it has anything to draw; the window is only
/// shown (and windows only tracked) while it does.
#[tauri::command]
pub fn weather_active(app: AppHandle, active: bool) {
    ACTIVE.store(active, Ordering::Relaxed);
    if let Some(w) = app.get_webview_window(LABEL) {
        apply_visibility(&app, &w);
    }
}

fn apply_visibility(app: &AppHandle, window: &WebviewWindow) {
    let show = ACTIVE.load(Ordering::Relaxed) && !overlay::fullscreen_app_active();
    if show == window.is_visible().unwrap_or(false) {
        return;
    }
    let _ = if show { window.show() } else { window.hide() };
    // The island always floats above the weather.
    overlay::raise_island(app);
}

fn track(app: AppHandle, window: WebviewWindow) {
    let mut last: Vec<Win> = Vec::new();
    let mut last_cursor = (f64::NAN, f64::NAN);
    let mut tick: u32 = 0;
    loop {
        std::thread::sleep(TICK);
        tick = tick.wrapping_add(1);
        if tick % 30 == 0 {
            let _ = place(&window);
            apply_visibility(&app, &window);
        }
        if !ACTIVE.load(Ordering::Relaxed) || !window.is_visible().unwrap_or(false) {
            last.clear();
            continue;
        }
        let (Ok(origin), Ok(scale)) = (window.outer_position(), window.scale_factor()) else {
            continue;
        };
        let windows = platform::windows(origin, scale);
        let cursor = app
            .cursor_position()
            .map(|c| ((c.x - origin.x as f64) / scale, (c.y - origin.y as f64) / scale))
            .unwrap_or(last_cursor);

        let changed = windows != last;
        if changed || cursor != last_cursor {
            let _ = app.emit_to(
                LABEL,
                "scene",
                Scene { windows: changed.then_some(windows.as_slice()), cursor },
            );
            last_cursor = cursor;
            if changed {
                last = windows;
            }
        }
    }
}

#[cfg(windows)]
mod platform {
    use tauri::PhysicalPosition;
    use windows::Win32::Foundation::{HWND, LPARAM, RECT};
    use windows::Win32::Graphics::Dwm::{
        DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS, DwmGetWindowAttribute,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GWL_EXSTYLE, GetClassNameW, GetWindowLongPtrW, GetWindowTextLengthW,
        GetWindowThreadProcessId, IsIconic, IsWindowVisible, IsZoomed, WS_EX_TOOLWINDOW,
        WS_EX_TRANSPARENT,
    };
    use windows::core::BOOL;

    use super::Win;

    unsafe extern "system" fn collect(hwnd: HWND, list: LPARAM) -> BOOL {
        unsafe { (*(list.0 as *mut Vec<HWND>)).push(hwnd) };
        BOOL(1)
    }

    fn class(hwnd: HWND) -> String {
        let mut buf = [0u16; 64];
        let n = unsafe { GetClassNameW(hwnd, &mut buf) } as usize;
        String::from_utf16_lossy(&buf[..n])
    }

    /// Visible app windows in front-to-back order (EnumWindows walks the
    /// z-order from the top), roughly the set Alt-Tab would show, plus the
    /// taskbar so rain can land on it too.
    pub fn windows(origin: PhysicalPosition<i32>, scale: f64) -> Vec<Win> {
        let mut all: Vec<HWND> = Vec::with_capacity(256);
        unsafe {
            let _ = EnumWindows(Some(collect), LPARAM(&mut all as *mut _ as isize));
        }
        let me = std::process::id();
        let mut out = Vec::new();
        for hwnd in all {
            unsafe {
                if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
                    continue;
                }
                let mut pid = 0;
                GetWindowThreadProcessId(hwnd, Some(&mut pid));
                if pid == me {
                    continue;
                }
                let mut cloaked = 0u32;
                let _ = DwmGetWindowAttribute(
                    hwnd,
                    DWMWA_CLOAKED,
                    &mut cloaked as *mut _ as *mut _,
                    size_of::<u32>() as u32,
                );
                if cloaked != 0 {
                    continue; // on another virtual desktop, or a suspended UWP shell
                }
                let cls = class(hwnd);
                let taskbar = cls == "Shell_TrayWnd" || cls == "Shell_SecondaryTrayWnd";
                let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
                if !taskbar
                    && (ex & WS_EX_TOOLWINDOW.0 != 0
                        || ex & WS_EX_TRANSPARENT.0 != 0
                        || GetWindowTextLengthW(hwnd) == 0
                        || matches!(cls.as_str(), "Progman" | "WorkerW"))
                {
                    continue;
                }
                // The visible frame, without Windows 10/11's invisible resize borders.
                let mut r = RECT::default();
                if DwmGetWindowAttribute(
                    hwnd,
                    DWMWA_EXTENDED_FRAME_BOUNDS,
                    &mut r as *mut _ as *mut _,
                    size_of::<RECT>() as u32,
                )
                .is_err()
                {
                    continue;
                }
                let (w, h) = ((r.right - r.left) as f64 / scale, (r.bottom - r.top) as f64 / scale);
                if w < 80.0 || h < 30.0 {
                    continue;
                }
                out.push(Win {
                    id: hwnd.0 as u64,
                    x: ((r.left - origin.x) as f64 / scale).round(),
                    y: ((r.top - origin.y) as f64 / scale).round(),
                    w: w.round(),
                    h: h.round(),
                    maximized: IsZoomed(hwnd).as_bool(),
                });
            }
        }
        out
    }
}

#[cfg(not(windows))]
mod platform {
    use tauri::PhysicalPosition;

    use super::Win;

    // TODO(macos): CGWindowListCopyWindowInfo; TODO(linux/X11): _NET_CLIENT_LIST_STACKING.
    pub fn windows(_: PhysicalPosition<i32>, _: f64) -> Vec<Win> {
        Vec::new()
    }
}
