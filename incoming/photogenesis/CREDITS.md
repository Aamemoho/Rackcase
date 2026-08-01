# Photogenesis credits and provenance

- Version: prototype 0f.1, station map pin + afterimage opening
- Concept, direction, selection, and editing: aamemoho
- Development: AI-assisted
- Rendering library: Three.js r128 (0.128.0), MIT License

## Opening and audio provenance

The eye-opening sequence, `breath.mp3`, and seven `shutter_take_*.mp3` files were transplanted from the project-owner-supplied donor archive `breathe-v0_7_9a-afterimage.zip` (SHA-256 `e199831cfc09e42c9058597e94bca4bc3f4a2c474f264cf2e34f1c92b9265102`). They are included in Photogenesis at the project owner's explicit direction; no standalone license for extracting or reusing these recordings outside this project is asserted here.

The donor code labels the shutter set as practical Minolta XE-7 recordings. The seven files and their per-take capture/release timing are preserved. If MP3 playback is blocked, the cartridge falls back to a locally synthesized shutter sound.

No camera, microphone, geolocation, account, analytics, or remote API access is used. Runtime state sharing is limited to `BroadcastChannel` when the browser permits it; the cartridge still runs when that channel is unavailable.
