//! Battery and output volume watchers. Both poll cheap OS calls and only emit
//! when something actually changes.

use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::Shared;

#[derive(Clone, Serialize, PartialEq)]
pub struct Battery {
    pub percent: u8,
    pub charging: bool,
    pub plugged: bool,
}

#[derive(Clone, Serialize, PartialEq)]
pub struct Volume {
    /// 0–100
    pub level: u8,
    pub muted: bool,
}

pub fn spawn(app: AppHandle, shared: Shared) {
    {
        let (app, shared) = (app.clone(), shared.clone());
        std::thread::spawn(move || {
            let mut last = None;
            loop {
                let now = platform::battery();
                if now != last {
                    shared.lock().unwrap().battery = now.clone();
                    let _ = app.emit("battery", &now);
                    last = now;
                }
                std::thread::sleep(platform::BATTERY_INTERVAL);
            }
        });
    }
    std::thread::spawn(move || {
        let mut mixer = platform::Mixer::new();
        let mut last = None;
        loop {
            let now = mixer.read();
            if now != last {
                shared.lock().unwrap().volume = now.clone();
                let _ = app.emit("volume", &now);
                last = now;
            }
            std::thread::sleep(Duration::from_millis(120));
        }
    });
}

pub fn set_volume(level: f32) {
    platform::set_volume(level.clamp(0.0, 1.0));
}

#[cfg(windows)]
mod platform {
    use std::time::Duration;

    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{IMMDeviceEnumerator, MMDeviceEnumerator, eConsole, eRender};
    use windows::Win32::System::Com::{
        CLSCTX_ALL, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx,
    };
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};

    use super::{Battery, Volume};

    pub const BATTERY_INTERVAL: Duration = Duration::from_millis(1000);

    pub fn battery() -> Option<Battery> {
        let mut s = SYSTEM_POWER_STATUS::default();
        unsafe { GetSystemPowerStatus(&mut s) }.ok()?;
        // 128 = no system battery (desktop); 255 = unknown.
        if s.BatteryFlag & 128 != 0 || s.BatteryLifePercent > 100 {
            return None;
        }
        Some(Battery {
            percent: s.BatteryLifePercent,
            charging: s.BatteryFlag & 8 != 0,
            plugged: s.ACLineStatus == 1,
        })
    }

    fn endpoint() -> windows::core::Result<IAudioEndpointVolume> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let devices: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            devices
                .GetDefaultAudioEndpoint(eRender, eConsole)?
                .Activate(CLSCTX_ALL, None)
        }
    }

    pub struct Mixer {
        endpoint: Option<IAudioEndpointVolume>,
        reads: u32,
    }

    impl Mixer {
        pub fn new() -> Self {
            Mixer { endpoint: None, reads: 0 }
        }

        pub fn read(&mut self) -> Option<Volume> {
            // Re-resolve the default device every few seconds to follow
            // headphones being plugged in or the output being switched.
            self.reads = self.reads.wrapping_add(1);
            if self.endpoint.is_none() || self.reads % 25 == 0 {
                self.endpoint = endpoint().ok();
            }
            let ep = self.endpoint.as_ref()?;
            unsafe {
                Some(Volume {
                    level: (ep.GetMasterVolumeLevelScalar().ok()? * 100.0).round() as u8,
                    muted: ep.GetMute().ok()?.as_bool(),
                })
            }
        }
    }

    pub fn set_volume(level: f32) {
        if let Ok(ep) = endpoint() {
            unsafe {
                let _ = ep.SetMasterVolumeLevelScalar(level, std::ptr::null());
            }
        }
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use std::fs;
    use std::time::Duration;

    use super::{Battery, Volume};

    pub const BATTERY_INTERVAL: Duration = Duration::from_millis(2000);

    pub fn battery() -> Option<Battery> {
        let mut found = None;
        let mut plugged = false;
        for entry in fs::read_dir("/sys/class/power_supply").ok()?.flatten() {
            let p = entry.path();
            let read = |f: &str| fs::read_to_string(p.join(f)).unwrap_or_default();
            match read("type").trim() {
                "Battery" if found.is_none() => {
                    let percent = read("capacity").trim().parse::<u8>().ok()?;
                    let status = read("status");
                    found = Some((percent.min(100), status.trim() == "Charging"));
                }
                "Mains" | "USB" => plugged |= read("online").trim() == "1",
                _ => {}
            }
        }
        let (percent, charging) = found?;
        Some(Battery { percent, charging, plugged: plugged || charging })
    }

    // TODO(linux): PipeWire/PulseAudio sink volume.
    pub struct Mixer;
    impl Mixer {
        pub fn new() -> Self {
            Mixer
        }
        pub fn read(&mut self) -> Option<Volume> {
            None
        }
    }
    pub fn set_volume(_: f32) {}
}

#[cfg(target_os = "macos")]
mod platform {
    use std::process::Command;
    use std::time::Duration;

    use super::{Battery, Volume};

    pub const BATTERY_INTERVAL: Duration = Duration::from_millis(4000);

    /// Parses `pmset -g batt`, e.g. "-InternalBattery-0 (id=…)	72%; charging; 1:02 remaining".
    pub fn battery() -> Option<Battery> {
        let out = Command::new("pmset").args(["-g", "batt"]).output().ok()?;
        let text = String::from_utf8_lossy(&out.stdout);
        let line = text.lines().find(|l| l.contains("InternalBattery"))?;
        let percent = line.split('%').next()?.rsplit(|c: char| !c.is_ascii_digit()).next()?;
        Some(Battery {
            percent: percent.parse::<u8>().ok()?.min(100),
            charging: line.contains("; charging"),
            plugged: text.contains("AC Power"),
        })
    }

    // TODO(macos): CoreAudio default output volume.
    pub struct Mixer;
    impl Mixer {
        pub fn new() -> Self {
            Mixer
        }
        pub fn read(&mut self) -> Option<Volume> {
            None
        }
    }
    pub fn set_volume(_: f32) {}
}
