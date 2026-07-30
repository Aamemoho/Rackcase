# Photogenesis credits and provenance

- Version: prototype 0f.1, station map pin
- Concept, direction, selection, and editing: aamemoho
- Development: AI-assisted
- Rendering library: Three.js r128 (0.128.0), MIT License

## Audio safety decision

The latest private prototype contained camera-shutter and breathing MP3 files whose exact creator, source URL, and license could not be recovered. Those files are intentionally excluded from this public repository. The public build synthesizes its shutter sound locally with the Web Audio API and keeps breathing as a visual effect only.

No camera, microphone, geolocation, account, analytics, or remote API access is used. Runtime state sharing is limited to `BroadcastChannel` when the browser permits it; the cartridge still runs when that channel is unavailable.
