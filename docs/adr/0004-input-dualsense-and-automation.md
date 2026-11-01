# ADR 0004: DualSense input and non-intrusive automation

- **Status:** Proposed, awaiting owner approval
- **Date:** 2026-11-01
- **Covers:** D6 (input)
- **Related:** [0001](0001-architecture-and-delivery.md) (composite driver seam, reopen gate for a native shim),
  [0002](0002-hdr-pipeline-and-presenter.md) (dashboard), [0003](0003-frame-pacing-caps-and-vrr.md) (measurement protocol)

Tags: `[D]` documented, `[M]` measured, `[I]` inferred, `[A]` anecdotal; `[E]` prior local evidence; `Rnn §x`
research notes. All effort figures are estimates `[I]`.

---

## Context

**The DualSense already works through SDL3's HIDAPI PS5 driver,** not Apple's GameController framework. Ryubing at
`475615f` ships SDL `3.5.0-5403934` [M]/[D] (R07 Summary). SDL enumerates only controller HID usages and opens
devices non-exclusively, so no Input Monitoring prompt is expected; this is unverified on macOS 27.2 beta [D] (R07
Summary).

**Ryubing uses only part of the pad** [D] (R07 Summary, §1.2-1.5):

- buttons, sticks, analog triggers (thresholded to ZL/ZR), touchpad *click*, gyro, accelerometer and SDL rumble work;
- touch coordinates, adaptive triggers and the player index are never used;
- the LED code tests `CAP_MONO_LED`, but SDL reports `CAP_RGB_LED`, so the lightbar is probably a no-op;
- HD Rumble collapses to two motor amplitudes, probably swapping left and right [I];
- `NpadHdRumble` opens a second raw HID handle for a DualSense but never writes to it;
- USB and Bluetooth give **different device ids** because the SDL GUID encodes the bus.

**Input freshness** is capped by a 10 ms SDL event pump on the Avalonia UI thread, against the pad's 250 Hz USB report
rate, adding roughly 0-10 ms of input age [D]/[I] (R07 Summary).

**Background control already works for the agent pad.** `InputManager` holds one `IGamepadDriver`; the local agentpad
branch wraps SDL and a virtual driver in a `CompositeGamepadDriver` [D] (R07 §1.6). Measured [E] §2:
`Ryujinx.Tests.Input` 42/42, client-server 9/9 (hold timing, release on SIGKILL, file ESTOP within 53 ms). In two
short covered-window trials, the window came forward once, 112 ms after a physical trackpad click by the owner.
Dialog and crash-reporter focus paths were not observed, and the revised "user clicked, so ESTOP and keep running"
guard was not replayed live [E] §2 row 9. The control socket is a Unix socket in a 0700 folder with peer-uid checks,
bounded commands and a neutral pad after 5 s idle [E] §6.

**Focus-steal risks are system-level.** The PS button "might open Game Overlay, Games, or Spotlight" [D]; SDL's request
to disable system gestures "isn't guaranteed" [D]; a disconnect can trigger the controller applet dialog unless
`ignore_applet` is set [D] (R07 Summary). In Ryubing the PS button is not Switch Home by default [D] (R09
verification).

**Advanced haptics and adaptive triggers** are feasible but separate: USB voice-coil PCM through a 4-channel USB audio
device [A]; Bluetooth haptics through community-documented report `0x32` [A]; adaptive triggers have no Switch source
signal and need TOTK game-state hooks [I] (R07 §4).

**Latency by bus:** USB 250 Hz with 1.1-3.6 ms button jitter; Bluetooth button maximum 17-28 ms and stick up to 39 ms
in a third-party Windows test [D] (R07 Summary).

**Dashboard toggle conflict.** R07 suggests the touchpad click; R09 suggests the mute button (`MISC1`), which has no
Switch equivalent [D] (R09 §4). Ryubing hotkeys read the same keyboard state as emulated input and nothing is
consumed, so a key bound to both fires both [D] (R09 §4).

---

## Decision

### v1 controller path: SDL3 HIDAPI as shipped, plus small tested patches

| Patch | Test before merge into the queue |
|---|---|
| Accept `CAP_RGB_LED` so the lightbar works (per-profile colour) | Unit probe |
| Call `SDL_SetGamepadPlayerIndex` so the player LEDs match | Unit probe |
| Stop destroying the gamepad property set | Double-open probe (G-INP-2) |
| Fix rumble left and right | Side probe first (G-INP-2) |
| Skip `NpadHdRumble` for non-Nintendo vendors (aligns with open PR #192) | Unit test |
| Input pump at 2-4 ms off the UI thread | Only after the pump-age probe (G-INP-4) shows it matters |

### Composite driver with owner-wins arbitration (R07 §1.7)

- **Owner wins.** Any non-neutral physical input on the same player (button, stick outside deadzone, trigger past
  threshold) latches the agent ESTOP and neutralises the virtual pad until an explicit resume.
- **Agent-exclusive mode** (opt-in, for unattended automation) masks the physical pad for that player; the mask drops
  automatically on ESTOP or socket loss.
- **Rumble** is never routed from the virtual pad to the physical pad.
- **Explicit player assignment** replaces dynamic "last input wins" swap.
- The dashboard shows which source owns Player 1.
- Keyboard, mouse and focus are never touched. The default-off property stays: with no socket configured, the stock SDL
  driver is used.

### Profiles and reconnects

- Profiles bind **both** the USB and the Bluetooth DualSense ids explicitly.
- Starting values: gyro deadzone 0.5, sensitivity 100, motion on for Player 1 only (R07 implication 5); gyro axis signs
  confirmed by G-INP-2.
- `ignore_applet` set, with a dashboard toast instead of the controller-applet dialog.

### Dashboard toggle

- **Primary:** the DualSense mute button (`MISC1`), removed from the guest mapping. It has no Switch equivalent, so
  nothing leaks to the game.
- **Keyboard:** one key verified unbound in every keyboard player profile.
- **Optional:** touchpad click, if the owner prefers it and accepts losing it as a guest input.
- Whether `MISC1` reaches SDL on this macOS is logged in G-INP-1. If it does not, fall back to a held chord (Create +
  Options for 0.5 s, swallowed from the guest while held; R09 §4).

### Bus policy

- **USB is the default for every measurement session.** Bluetooth is allowed for play.

### Separate feasibility track (P5), each with its own go/no-go note

| Item | Feasibility (R07 §4) | Main risk |
|---|---|---|
| Native GameController shim | Medium | Second driver stack on one pad; Objective-C interop |
| USB voice-coil PCM from HD Rumble (CoreAudio) | Medium | Device association, 5-20 ms buffer latency |
| Adaptive triggers (`SDL_SendGamepadEffect`, or GameController if that fails) | Medium (API); low (game hooks) | Read-only TOTK state hooks (kept in the private title pack); effects stuck after a crash |
| Bluetooth haptics (report `0x32`) | Low-medium | Undocumented format, a second HID writer, radio saturation |

### Measurement hygiene (R07 §6, R05 §4)

Input isolation does not make a performance run clean. Every performance sample requires:

- the build without the agent patch for strict comparisons, or the agent pad disconnected and idle;
- physical pad state logged (bus, battery, enhanced mode, rumble on or off);
- an owner-uncontended host: no other GPU-heavy apps, no screen capture beyond the measuring tool, Metal HUD off;
- power, thermal state, display, fullscreen or windowed, and Game Mode logged;
- the same build, config hash, save slot and warm shader cache;
- agents never launch the emulator for a measurement; the owner starts measured runs.

---

## Alternatives considered

| Option | Strengths | Why not chosen | Evidence |
|---|---|---|---|
| **SDL3 HIDAPI plus small patches and the composite driver (chosen)** | Covers every v1 control requirement in days; no TCC change expected; keeps the tested agent pad | Adaptive triggers and voice-coil haptics wait for the separate track | R07 Options B; [E] §2 rows 7-8 |
| Native GameController shim in v1 | Every DualSense feature incl. trigger modes | Weeks of work; Objective-C interop from .NET; second driver stack on the same pad | R07 Options D |
| Force the SDL MFi path (`SDL_JOYSTICK_HIDAPI_PS5=0`) | System-managed | Adaptive triggers lost (MFi `SendEffect` unsupported); device id changes. Fallback only | R07 §2, Options C |
| Dynamic controller swap ("last input wins") | Already merged upstream (PR #125) | Opposite of owner-wins; would let an agent override the owner | R07 §1.7 |
| Touchpad click as the primary toggle (R07) | Easy to reach | Touchpad click is an ordinary mappable input in Ryubing; mute has no Switch equivalent | R09 §4 |

---

## Consequences

**Positive**

- Buttons, sticks, motion aiming, touchpad click, rumble, USB, Bluetooth and reconnects are covered in v1.
- The owner can pick up the pad at any time and win, without the agent touching keyboard, mouse or focus.
- Measurement runs are reproducible because bus and pad state are recorded.

**Negative**

- System-level focus theft (PS button, crash or applet dialogs) can still happen; ESTOP limits the damage but cannot
  prevent it [D]/[A].
- Enhanced report mode and trigger effects persist on the pad until a power cycle or explicit clear [D].
- Touchpad two-finger coordinates are deferred.

---

## Evidence gates and kill criteria

| Gate | What it checks | Outcome |
|---|---|---|
| G-INP-1 (attended) | Input Monitoring prompt check on USB, then Bluetooth, with no TCC edits; log SDL driver names, and whether `MISC1` and PS reach SDL | Any prompt goes to the owner; toggle fallback chosen |
| G-INP-2 | Rumble side probe; property-set double-open probe; gyro axis signs during Great Sky Island archery | Gates the corresponding v1 patches |
| G-INP-3 | Can `SDL_SendGamepadEffect` drive adaptive triggers reliably? | Fail: reopen the GameController shim (ADR 0001 G-REOPEN-C) |
| G-INP-4 | Pump-age histogram (`SDL_GetTicks` at pump against `NpadManager.Update`) | Pump patch only if the age is material |
| G-INP-5 | PS button and Game Overlay while Ryubing is in the background; Bluetooth dropout with `ignore_applet` off, then on | Documents the focus-hygiene guidance |
| G-INP-6 | Owner-wins arbitration replayed live, including the "user clicked" guard path not yet replayed [E] | Required before unattended agent sessions are approved |

**Kill criteria:** if owner-wins arbitration cannot be made reliable in G-INP-6, agent sessions run only with the
physical pad disconnected. If any haptics item fails its go/no-go, it is dropped without affecting v1.

---

## Effort range

All [I], from R07 and R09.

| Item | Range |
|---|---|
| Attended validation | 0.5-1 day |
| v1 SDL patches | 1-2 days |
| Owner-wins arbitration | 1-2 days |
| Dashboard toggle | 0.5-1 day (R07), or 2-4 days including the guest-swallow logic (R09) |
| Pump patch | 1-3 days |
| Later: USB PCM haptics / adaptive triggers / Bluetooth haptics | 1-2 weeks / 2-4 weeks / 2-4 weeks and uncertain |

---

## Open questions for the owner

1. Approve SDL3 HIDAPI plus the small patches for v1, with the GameController shim deferred?
2. Approve the mute button plus one keyboard key as the dashboard toggle (touchpad click optional)?
3. Respond to any Input Monitoring (TCC) prompt yourself; no TCC changes are planned.
4. Go/no-go on the separate haptics and adaptive-trigger track, including read-only TOTK state hooks kept private.
5. Approve the attended controller check (G-INP-1, G-INP-2, G-INP-5) and the live arbitration replay (G-INP-6).
