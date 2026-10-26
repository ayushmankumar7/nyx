//! Windows: Global System Media Transport Controls (the same session the
//! volume flyout shows), which covers Spotify, browsers, Media Player, etc.

use base64::{Engine, engine::general_purpose::STANDARD};
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSessionManager as Manager,
    GlobalSystemMediaTransportControlsSessionPlaybackControls as Controls,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
};
use windows::Storage::Streams::{DataReader, IRandomAccessStreamReference};
use windows::Win32::System::Com::{COINIT_MULTITHREADED, CoInitializeEx};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    INPUT, INPUT_0, INPUT_KEYBOARD, KEYBD_EVENT_FLAGS, KEYBDINPUT, KEYEVENTF_KEYUP, SendInput,
    VIRTUAL_KEY, VK_MEDIA_NEXT_TRACK, VK_MEDIA_PLAY_PAUSE, VK_MEDIA_PREV_TRACK,
};

use super::{NowPlaying, now_ms};

/// 100ns ticks between 1601-01-01 (Windows epoch) and 1970-01-01.
const EPOCH_DELTA: i64 = 116_444_736_000_000_000;
const MAX_ART_BYTES: u64 = 8 << 20;

pub struct Source {
    manager: Option<Manager>,
    track: String,
    /// Players often publish cover art a beat after the title, so retry a few
    /// polls before giving up on a new track's artwork.
    art_attempts: u8,
}

impl Source {
    pub fn new() -> Self {
        init_com();
        Source { manager: None, track: String::new(), art_attempts: 0 }
    }

    pub fn poll(&mut self) -> Option<NowPlaying> {
        if self.manager.is_none() {
            self.manager = Manager::RequestAsync().ok()?.join().ok();
        }
        let session = self.manager.as_ref()?.GetCurrentSession().ok()?;
        let props = session.TryGetMediaPropertiesAsync().ok()?.join().ok()?;

        let title = props.Title().ok()?.to_string();
        if title.is_empty() {
            return None;
        }
        let artist = props.Artist().map(|s| s.to_string()).unwrap_or_default();
        let album = props.AlbumTitle().map(|s| s.to_string()).unwrap_or_default();

        let track = format!("{title}\u{1f}{artist}\u{1f}{album}");
        if track != self.track {
            self.track = track;
            self.art_attempts = 4;
        }
        let mut artwork = None;
        if self.art_attempts > 0 {
            self.art_attempts -= 1;
            artwork = props.Thumbnail().ok().and_then(|t| read_image(&t));
            if artwork.is_some() {
                self.art_attempts = 0;
            }
        }

        let info = session.GetPlaybackInfo().ok();
        let playing = info
            .as_ref()
            .and_then(|p| p.PlaybackStatus().ok())
            .is_some_and(|s| s == Status::Playing);
        // What the player says it can do right now (e.g. YouTube only offers
        // "next" inside a playlist). Assume yes if it doesn't say.
        let controls = info.as_ref().and_then(|p| p.Controls().ok());
        let can = |f: fn(&Controls) -> windows::core::Result<bool>| {
            controls.as_ref().and_then(|c| f(c).ok()).unwrap_or(true)
        };
        let (can_next, can_prev) = (can(Controls::IsNextEnabled), can(Controls::IsPreviousEnabled));
        // Unlike the others, only claim seeking when the player says so.
        let can_seek = controls
            .as_ref()
            .and_then(|c| c.IsPlaybackPositionEnabled().ok())
            .unwrap_or(false);

        let now = now_ms();
        let (mut position_ms, mut duration_ms) = (0, 0);
        if let Ok(tl) = session.GetTimelineProperties() {
            let ms = |ticks: i64| (ticks.max(0) / 10_000) as u64;
            let start = tl.StartTime().map(|t| t.Duration).unwrap_or(0);
            duration_ms = ms(tl.EndTime().map(|t| t.Duration).unwrap_or(0) - start);
            position_ms = ms(tl.Position().map(|t| t.Duration).unwrap_or(0) - start);
            // The position is only refreshed on state changes; advance it to now.
            if let Ok(updated) = tl.LastUpdatedTime() {
                let updated = ms(updated.UniversalTime - EPOCH_DELTA);
                if playing && updated > 0 && updated <= now {
                    position_ms += now - updated;
                }
            }
            if duration_ms > 0 {
                position_ms = position_ms.min(duration_ms);
            }
        }

        Some(NowPlaying {
            title,
            artist,
            album,
            artwork,
            playing,
            can_next,
            can_prev,
            can_seek,
            position_ms,
            duration_ms,
            sampled_at: now,
            source: session
                .SourceAppUserModelId()
                .map(|s| s.to_string())
                .unwrap_or_default(),
        })
    }
}

fn init_com() {
    // Each thread that touches WinRT needs an apartment; already-initialised is fine.
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
}

fn read_image(reference: &IRandomAccessStreamReference) -> Option<String> {
    let stream = reference.OpenReadAsync().ok()?.join().ok()?;
    let size = stream.Size().ok()?;
    if size == 0 || size > MAX_ART_BYTES {
        return None;
    }
    let reader = DataReader::CreateDataReader(&stream).ok()?;
    reader.LoadAsync(size as u32).ok()?.join().ok()?;
    let mut bytes = vec![0u8; size as usize];
    reader.ReadBytes(&mut bytes).ok()?;
    let mime = if bytes.starts_with(b"\x89PNG") { "image/png" } else { "image/jpeg" };
    Some(format!("data:{mime};base64,{}", STANDARD.encode(&bytes)))
}

/// Jump to `position_ms` from the start of the current track.
pub fn seek(position_ms: u64) {
    init_com();
    let Ok(session) = Manager::RequestAsync()
        .and_then(|op| op.join())
        .and_then(|m| m.GetCurrentSession())
    else {
        return;
    };
    // Positions are absolute on the session's own timeline, in 100ns ticks.
    let start = session
        .GetTimelineProperties()
        .and_then(|t| t.StartTime())
        .map(|t| t.Duration)
        .unwrap_or(0);
    let _ = session
        .TryChangePlaybackPositionAsync(start + position_ms as i64 * 10_000)
        .and_then(|op| op.join());
}

pub fn control(action: &str) {
    init_com();
    let key = match action {
        "toggle" => VK_MEDIA_PLAY_PAUSE,
        "next" => VK_MEDIA_NEXT_TRACK,
        "prev" => VK_MEDIA_PREV_TRACK,
        _ => return,
    };
    let accepted = Manager::RequestAsync()
        .and_then(|op| op.join())
        .and_then(|m| m.GetCurrentSession())
        .and_then(|s| match action {
            "toggle" => s.TryTogglePlayPauseAsync(),
            "next" => s.TrySkipNextAsync(),
            _ => s.TrySkipPreviousAsync(),
        })
        .and_then(|op| op.join())
        .unwrap_or(false);
    // Some players register a session but ignore its commands while still
    // honouring the hardware media keys, so fall back to pressing one.
    if !accepted {
        press(key);
    }
}

fn press(key: VIRTUAL_KEY) {
    let input = |flags: KEYBD_EVENT_FLAGS| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT { wVk: key, dwFlags: flags, ..Default::default() },
        },
    };
    let inputs = [input(KEYBD_EVENT_FLAGS(0)), input(KEYEVENTF_KEYUP)];
    unsafe {
        SendInput(&inputs, size_of::<INPUT>() as i32);
    }
}
