//! "Now playing" for whatever app currently owns the system media session.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::Shared;

#[cfg(windows)]
mod windows;
#[cfg(windows)]
use self::windows as platform;

#[cfg(not(windows))]
mod unsupported;
#[cfg(not(windows))]
use self::unsupported as platform;

#[derive(Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    pub title: String,
    pub artist: String,
    pub album: String,
    /// `data:` URL of the cover art, if the player exposes one.
    pub artwork: Option<String>,
    pub playing: bool,
    pub can_next: bool,
    pub can_prev: bool,
    pub can_seek: bool,
    pub position_ms: u64,
    pub duration_ms: u64,
    /// Unix ms at which `position_ms` was sampled, so the UI can extrapolate.
    pub sampled_at: u64,
    pub source: String,
}

impl NowPlaying {
    fn same_track(&self, other: &Self) -> bool {
        self.title == other.title && self.artist == other.artist && self.album == other.album
    }

    fn position_at(&self, now: u64) -> u64 {
        if self.playing {
            self.position_ms + now.saturating_sub(self.sampled_at)
        } else {
            self.position_ms
        }
    }
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn spawn(app: AppHandle, shared: Shared) {
    std::thread::spawn(move || {
        let mut source = platform::Source::new();
        let mut last: Option<NowPlaying> = None;
        loop {
            let mut next = source.poll();
            if let (Some(n), Some(l)) = (next.as_mut(), last.as_ref()) {
                // Cover art is only fetched when the track changes.
                if n.artwork.is_none() && n.same_track(l) {
                    n.artwork = l.artwork.clone();
                }
            }
            if changed(&last, &next) {
                shared.lock().unwrap().media = next.clone();
                let _ = app.emit("media", &next);
                last = next;
            }
            std::thread::sleep(Duration::from_millis(800));
        }
    });
}

/// Ignore the steady tick of the playhead; only report real changes or drift.
fn changed(old: &Option<NowPlaying>, new: &Option<NowPlaying>) -> bool {
    match (old, new) {
        (None, None) => false,
        (Some(a), Some(b)) => {
            !a.same_track(b)
                || a.playing != b.playing
                || (a.can_next, a.can_prev, a.can_seek) != (b.can_next, b.can_prev, b.can_seek)
                || a.duration_ms != b.duration_ms
                || a.artwork.is_some() != b.artwork.is_some()
                || a.position_at(b.sampled_at).abs_diff(b.position_ms) > 1500
        }
        _ => true,
    }
}

pub fn seek(position_ms: u64) {
    platform::seek(position_ms);
}

pub fn control(action: &str) {
    platform::control(action);
}
