//! Placeholder until the native sources land:
//! TODO(linux): MPRIS over D-Bus (org.mpris.MediaPlayer2.*).
//! TODO(macos): MediaRemote, or an AppleScript bridge for Music/Spotify.

use super::NowPlaying;

pub struct Source;

impl Source {
    pub fn new() -> Self {
        Source
    }

    pub fn poll(&mut self) -> Option<NowPlaying> {
        None
    }
}

pub fn control(_action: &str) {}

pub fn seek(_position_ms: u64) {}
