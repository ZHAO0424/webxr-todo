# Music credits

All tracks by Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0 License
http://creativecommons.org/licenses/by/4.0/

- "Local Forecast - Elevator" Kevin MacLeod (incompetech.com) — elevator.mp3
- "Funkorama" Kevin MacLeod (incompetech.com) — funkorama.mp3
- "Disco con Tutti" Kevin MacLeod (incompetech.com) — disco.mp3
- "Hyperfun" Kevin MacLeod (incompetech.com) — hyperfun.mp3

Changes: each file is trimmed to its first ~2 minutes (ending on a downbeat) with a 2.5 s fade-out,
and re-encoded at 128 kbps. `tracks.js` holds beat / energy / onset data analysed from the original
recordings with librosa, used by the game to build its ring charts.

`*-stems.mp3` are derived from the same trimmed files: separated with Demucs (htdemucs, two stems) into
drums + bass (left channel, mono) and all other instruments (right channel, mono). The game keeps the
left channel steady and turns the right channel up or down depending on whether you hit the rings.
