# 07 - DualSense on macOS, input architecture, and non-intrusive background control

Research note - 2026-11-01 - independently verified (see Independent verification)

Scope: the Ryubing input stack at official commit `9afba70` (identical to upstream `475615f`), the SDL3 build that ships with it, Apple's GameController framework, advanced DualSense haptics and adaptive triggers, TOTK motion aiming, and how the existing virtual "agent pad" can coexist with a physical DualSense without touching keyboard, mouse or focus.

Nothing in this note was run against a live controller. The DualSense is paired with the host over Bluetooth but was not connected at research time [M]. Every behavioural claim about the physical pad is therefore documented or inferred, not measured.

---

## Summary

- **The DualSense already works through SDL3's HIDAPI PS5 driver over IOKit, not through Apple's GameController framework.** On macOS, SDL enables HIDAPI by default, and its MFi (GameController) backend skips any DualSense that HIDAPI already owns [D][3][4]. Ryubing at `9afba70` ships SDL `3.5.0-5403934` (a 2026-07-07 development snapshot) inside `Ryujinx.SDL3-CS 2026.707.0` [M][D][1][2].
- **No Input Monitoring (TCC) prompt is expected for the DualSense.** SDL only enumerates joystick, gamepad and multi-axis HID usages by default, precisely to avoid the macOS keyboard-capture prompt. It opens devices non-exclusively (`kIOHIDOptionsTypeNone`) [D][3][5]. This is not verified on macOS 27.2 beta, and any TCC change still needs a separate decision.
- **Ryubing uses only part of the DualSense.** It maps buttons, sticks, analog triggers (thresholded to digital ZL/ZR), the touchpad *click*, gyro, accelerometer and SDL "rumble" [D][1]. It does not read touch coordinates, never calls `SDL_SendGamepadEffect` (adaptive triggers), and never sets the player index [D][1]. Its LED code tests `CAP_MONO_LED`, but SDL reports the DualSense as `CAP_RGB_LED`, so the lightbar setting is probably a no-op [D][1][3].
- **The default HD Rumble path collapses to two SDL motor amplitudes.** Switch frequencies are discarded, and the Switch right actuator drives SDL's "low" motor while the left actuator drives "high" [D][1]. That likely swaps left and right on the DualSense voice coils [I]. `NpadHdRumble` opens a second raw HID handle for a DualSense but never writes to it [D][1].
- **Input freshness is capped by a 10 ms SDL event pump on the Avalonia UI thread.** That pump is the only call that updates SDL joystick state [D][1][3]. The DualSense reports at about 250 Hz over USB [D][9], so Ryubing samples it at no more than about 100 Hz and keeps only the latest gyro rate. This adds roughly 0-10 ms of input age and throws away IMU samples [I].
- **Background control is already possible without focus, for both pads.** The emulation loop polls gamepad drivers while the window is inactive [D][13]. SDL's background-events hint is set to `1` [D][1]. The agent pad bypasses SDL entirely, and the composite driver pattern (`CompositeGamepadDriver`) needs no change to `InputManager` [D][13]. For the **agent pad only**, this was validated live with the window fully covered in the prior control trials: two short runs of 2-4 min at 1x, using an extra `--agent-background` UI patch (no Avalonia app delegate, `ShowActivated=false`) [M][14]. A physical DualSense in the background has not been tested [I].
- **The main focus-steal risks for the physical pad are system-level.** Apple says that pressing the Home (PS) button on a supported wireless controller "might open Game Overlay, Games, or Spotlight, depending on the game and your controller's settings" [D][8]. User reports on macOS 26 agree, but they vary [A][19]. SDL asks GameController to disable system gestures, but Apple says the system "isn't guaranteed to respect" that request [D][7]. A disconnect can also trigger the game's controller applet, which Ryubing shows as a dialog unless `ignore_applet` is set [D][1].
- **Apple's GameController framework has every DualSense feature except raw HID control.** It covers two-finger touchpad, adaptive trigger modes, GCMotion, CoreHaptics per locality, the light, and background monitoring. Most of it needs macOS 11.3 or later; `PositionalResistiveStrengths` and slope feedback need macOS 12.3 [D][6]. A native shim would mean Objective-C interop from .NET and running a second driver stack. It is a later option, not v1 [I].
- **Advanced haptics and adaptive triggers are feasible but not v1.** Over USB, the DualSense appears as a 4-channel audio output whose channels 3 and 4 drive the voice coils [A][10][11]. Over Bluetooth, community research streams 3 kHz signed 8-bit PCM in HID report `0x32` [A][11][12]. Adaptive triggers have no Switch source signal, so they need TOTK game-state hooks [I].
- **USB is the recommended default for v1 measurement sessions.** It gives a steady 250 Hz with 1.1-3.6 ms button jitter across three cable tests, power, and the only voice-coil PCM path. Bluetooth can average lower latency but has worse tails: a 17-28 ms button maximum, and up to 39 ms for the stick, in a third-party Windows test [D][9]. Bluetooth and USB also give **different Ryubing device ids**, because the SDL GUID encodes the bus type [D][1][3].

---

## Findings

### 1. The Ryubing input stack at 9afba70

#### 1.1 Layers and threads

| Layer | Code (at `9afba70`) | Notes |
|---|---|---|
| SDL bootstrap | `src/Ryujinx.SDL3.Common/SDL3Driver.cs:50-117` | Sets the hints `JOYSTICK_ENHANCED_REPORTS=1`, `JOYSTICK_ALLOW_BACKGROUND_EVENTS=1`, Switch Home LED off, Joy-Cons via HIDAPI, no Joy-Con combining (:61-70). Disables per-axis and button events and `GAMEPAD_SENSOR_UPDATE` events (:95-101). Hotplug comes from joystick events only. |
| Gamepad DB download | `SDL3Driver.cs:47-48, 119-148` | Downloads `gamecontrollerdb.txt` from `raw.githubusercontent.com` on every SDL init (Ryubing PR #177, merged 2026-07-30) [D][1][15]. |
| Event pump | `SDL3Driver.cs:194-213`, `src/Ryujinx/Program.cs:270` | A worker thread posts `SDL_PollEvent` drains onto the **Avalonia UI thread** (`Dispatcher.UIThread.InvokeAsync`, `DispatcherPriority.Input`, which does not block), then waits 10 ms. The headless runner instead calls `SDL_PumpEvents` in its about-1 ms main loop (`Headless/Windows/WindowBase.cs:368`), so the 10 ms limit applies to the Avalonia GUI only. SDL updates joystick and sensor state only inside the event pump (`SDL_UpdateJoysticks` in SDL `src/events/SDL_events.c:1505-1512`) [D][1][3]. |
| Driver | `src/Ryujinx.Input.SDL3/SDL3GamepadDriver.cs` | Maps instance ids to string ids, pairs Joy-Cons, and forwards connect and disconnect events (:120-237). |
| Device | `src/Ryujinx.Input.SDL3/SDL3Gamepad.cs` | Buttons, sticks, triggers, motion, rumble and LED (details in 1.2). |
| HID rumble | `src/Ryujinx.Input.SDL3/NpadHdRumble.cs` | Raw HD Rumble writes for Nintendo devices only (:152-164). |
| Manager | `src/Ryujinx.Input/HLE/InputManager.cs`, `NpadManager.cs`, `NpadController.cs` | One keyboard driver plus **one** gamepad driver, plus the mouse driver [D][13]. |
| Emulation loop | `AppHost.UpdateFrame` (about a 1 ms loop) | Calls `NpadManager.Update` whether or not the window has focus. When inactive it only clears the keyboard (AppHost.cs:1305-1310 at 475615f) [D][13]. |

The emulation thread reads `SDL_GetGamepadAxis`, `SDL_GetGamepadButton` and `SDL_GetGamepadSensorData` [D][1]. Those return cached values that only the UI-thread pump refreshes. So the age of input is set by the 10 ms pump plus any UI-thread queueing, not by the 1 ms emulation poll [I].

#### 1.2 Buttons, sticks and triggers (`SDL3Gamepad.cs`)

- **Face buttons are mapped by label.** `SDL_GetGamepadButtonLabel` picks Cross, Circle, Square and Triangle, which keeps "A" semantics consistent across layouts (:95-107) [D][1].
- **The touchpad click is a mappable button.** `GamepadButtonInputId.Touchpad` maps to `SDL_GAMEPAD_BUTTON_TOUCHPAD` (:56) [D][1]. Touch coordinates are never read (a grep for touchpad APIs only finds the button) [D][1].
- **Sticks** are scaled with `1/(32767.5)`, then Y is negated so +Y is up (:361-395). Invert and rotate options are applied per stick (:397-415) [D][1]. Deadzone and range are applied later in `NpadController` (defaults: deadzone 0.1, `TriggerThreshold` 0.5) [D][1].
- **Triggers** are analog axes compared with `TriggerThreshold` to make digital ZL and ZR (:438-441) [D][1]. That fits the Switch, whose triggers are digital.

#### 1.3 Motion (SDL sensors and CemuHook)

- **Sensors are enabled only when both accel and gyro exist** (`GetFeaturesFlag` :141-145, enabled :110-121) [D][1].
- **Units:** SDL gyro in rad/s becomes deg/s. SDL accel in m/s² is divided by `SDL_STANDARD_GRAVITY`, giving g (the method is misnamed `GsToMs2`, :268-270) [D][1].
- **Axis remap:** `NpadController.UpdateControllerMotion` maps SDL `(x, y, z)` to Switch-side `(x, -z, y)` for both accel and gyro (:1122-1123) [D][1]. SDL's frame, with the pad held in front of you, is +X right, +Y top, +Z toward you (`include/SDL3/SDL_sensor.h:99-124`) [D][3]. SDL normalises every HIDAPI driver into that frame, so a DualSense and a Pro Controller pass through the same remap [I].
- **Filtering:** `MotionInput.Update` zeroes gyro when its magnitude is below `GyroDeadzone` (default 1, compared in deg/s). It scales by `Sensitivity/100` (default 100), integrates rotation, and feeds a fusion filter whose gain is set to `0f` with a "TODO: RE the correct filter" comment (`Motion/MotionInput.cs:23-50`) [D][1].
- **Units sent to the guest:** gyro and rotation are multiplied by `0.0027` (about 1/360, so revolutions per second) and truncated to 3 decimals (`NpadController.cs:573-575`) [D][1].
- **No bias calibration.** SDL applies the DualSense factory IMU calibration read from the pad (`HIDAPI_DriverPS5_LoadCalibrationData`) [D][3]. A Ryubing gyro-calibration wizard (PR #117) was closed unmerged on 2026-05-31 [D][15].
- **CemuHook (DSU) is a UDP client** keyed by player index (`NpadController.cs:1151-1171`) [D][1]. It is useful only if an external DSU server is the motion source. It adds a network listener dependency and is not recommended for this project [I].

#### 1.4 Rumble (Switch HD Rumble to SDL)

- **The game's `VibrationValue` carries two bands per actuator** (`AmplitudeLow`, `FrequencyLow`, `AmplitudeHigh`, `FrequencyHigh`) [D][1].
- **`NpadController.ApplyRumble` (:695-716) reduces them to two motor amplitudes.** Low is `0.85·right.AmpLow + 0.15·right.AmpHigh`, and high is `0.15·left.AmpLow + 0.85·left.AmpHigh`. It then calls `SDL_RumbleGamepad(low, high, infinite)` [D][1]. Frequencies are dropped.
- **Likely left/right swap.** SDL's PS5 driver sends the low-frequency value to the left actuator and the high-frequency value to the right (`ctx->rumble_left = low >> 8`, `SDL_hidapi_ps5.c:1011-1027`) [D][3]. The Switch right actuator therefore plays on the DualSense left side [I]. One short test pattern per side would confirm it.
- **What SDL does for "rumble" on a DualSense.** On firmware 2.24 or newer it uses the pad's "improved rumble emulation" bit, otherwise the legacy emulation at half strength. Both disable audio haptics while rumble is active (`SDL_hidapi_ps5.c:720-745`) [D][3]. This runs on the voice coils, but it does not stream PCM.
- **`NpadHdRumble` quirks.** For Sony VID/PID it opens `SDL_hid_open(...)` but `HdRumble` returns false for anything that is not Nintendo (:29-51, :152-164) [D][1]. So a DualSense (PID `0x0ce6` is in the supported-product enum) gets an unused second HID handle. `Create` runs at gamepad construction (`SDL3Gamepad.cs:87`), even when `UseHDRumble` is false, which is the default. `_vendor` and `_product` are `static`, so with two physical pads the last one created wins [D][1]. Open PR #192 (2026-08-30) comments out unsupported vendors after a null-pointer crash [D][15].

#### 1.5 Hotplug, reconnect, ids and GUIDs

- **Id format.** `GenerateGamepadId` (:88-118) builds `"<n>-" + GUID`, with the first 4 hex characters (the SDL name CRC) replaced by `0000` [D][1].
- **What the GUID encodes.** The SDL GUID holds the bus type (`0x03` USB, `0x05` Bluetooth), VID, PID, version, and the driver signature (`SDL_joystick.c:2979-3019`, `SDL_sysjoystick.h:162-165`) [D][3]. **The same DualSense therefore gets a different Ryubing id over USB and over Bluetooth**, and possibly after a firmware or driver-path change [I].
- **Consequences.** A player config bound to the USB id does not match the Bluetooth pad. With dynamic swap off, `NpadManager` then falls back to the default keyboard config (`NpadManager.cs:211-218`) [D][1].
- **Hotplug handling.** On disconnect, every controller holding that id is disposed and the configuration reloads. On connect, the player rebinds if the id matches (`NpadManager.cs:81-136`) [D][1]. The `<n>-` prefix is the lowest free index, so two identical pads can swap ids across reconnects [I].
- **Thread safety.** `_gamepadsInstanceIdsMapping` is touched outside `_lock` in the connect and disconnect handlers (:125, :182, :196). `GetInstanceIdFromId` runs a LINQ scan from other threads (:285-287). That is a low-probability race during hotplug [I].
- **Probable SDL property misuse.** `GetFeaturesFlag` calls `SDL_DestroyProperties` on the gamepad's own property set (:157-158) [D][1]. SDL documents those properties as "shared with the underlying joystick object" (`SDL_gamepad.h:804-806`) [D][3]. Later capability queries may read a destroyed set, for example when `GetGamepad` opens the same pad again [I]. A small probe test would settle it.

#### 1.6 The single-gamepad-driver limitation

`InputManager(keyboardDriver, gamepadDriver)` holds exactly one `IGamepadDriver` for all controllers [D][13]. `NpadController.UpdateDriverConfiguration` sends every non-keyboard config to that one driver [D][13]. A second source of gamepads therefore has to be merged *behind* that interface. The agent-pad patch does exactly this [D][13]:

- `CompositeGamepadDriver(SDL3GamepadDriver, VirtualGamepadDriver)` replaces the argument at `MainWindow.axaml.cs:113`.
- Ids starting with `virtual-agent-` go to the virtual driver, and everything else goes to SDL3.
- SDL ids are listed first, and SDL hotplug events are forwarded.
- Virtual ids must not contain `_`, which is the Joy-Con pair separator in `SDL3GamepadDriver.GetGamepad` (:292).

The virtual pad's `Features` are `None`: no motion, no rumble [D][13]. Its socket is local only (Unix domain socket, 0700/0600, `getpeereid`), and every input has a deadline [D][13][14].

#### 1.7 Composite driver design for TOTK Luma

Goal: the physical DualSense is the owner's controller, the agent pad stays available for automation, and neither path touches keyboard, mouse or focus.

1. **Keep the composite at the driver layer.** It is the only seam that needs no change in `NpadManager`, the UI or the HLE layer [D][13]. Keep the default-off property: with no socket configured, the stock SDL driver object is used [D][13].
2. **Add an arbitration policy inside the composite, not in the OS** [I]:
   - *Owner wins.* Any non-neutral input on a physical pad assigned to the same player (button, stick outside deadzone, trigger past threshold) latches the agent ESTOP and neutralises the virtual pad until an explicit `resume`. This turns "owner picks up the pad" into a safe handoff. It complements the prior window-activation guard, an external watcher script. That guard was revised to latch ESTOP when activation follows a user click, but the revised path "has not yet been replayed live" [D][14]. In the live trial, the earlier guard stopped the run (ESTOP plus SIGTERM) [M][14].
   - *Agent-exclusive mode (opt-in).* For unattended automation, the composite can mask physical-pad input for that player, while still forwarding hotplug, so a pad left on a desk cannot inject input. The mask must drop automatically on ESTOP or socket loss.
   - *Rumble routing.* Rumble for a player whose active source is the virtual pad must not reach the physical pad (unexpected vibration while the owner works). The virtual pad simply reports no `Rumble` feature.
3. **Use explicit player assignment, not dynamic swap, for v1.** Dynamic swap (PR #125, merged 2026-06-27) is "last input wins" across devices [D][15], which is the opposite of owner-wins arbitration. Keep Option A from the control plan (the agent owns Player 1 in agent sessions) and a separate owner config with the DualSense on Player 1 [D][13].
4. **Optional synthetic motion for the agent pad (later).** A `motion` command (gyro deg/s and accel g with deadlines, like the sticks) would let automation exercise bow aiming. The virtual pad would then declare `Motion` and return values in the SDL frame, so the shared `(x, -z, y)` remap applies [I].
5. **Pin the pump cadence for both paths.** The virtual pad's state is read straight from the emulation thread, but SDL pads depend on the UI-thread pump (1.1). Any App Nap or UI-thread stall would affect the physical pad, not the agent pad [I]. This asymmetry matters when comparing agent-driven and owner-driven measurements.

### 2. SDL3 DualSense support (HIDAPI PS5 driver, SDL 3.5.0-5403934)

| Feature | What SDL does | Evidence |
|---|---|---|
| Buttons, sticks, d-pad, triggers | Full gamepad mapping; triggers are analog axes | [D][3] `SDL_hidapi_ps5.c` |
| Touchpad | 1 touchpad with **2 fingers** (`SDL_PrivateJoystickAddTouchpad(…, 2)`), plus a touchpad button; reported in enhanced mode | [D][3] :846, :1421-1426 |
| Gyro and accelerometer | Added in enhanced mode at a nominal **250 Hz over USB, 1000 Hz over Bluetooth** (1000 Hz for the Edge over USB). Factory calibration applied. Timestamps come from the pad's sensor clock. | [D][3] :851-864, :1375-1406 |
| Rumble | Voice-coil "rumble emulation" (improved mode on firmware 2.24+). `RumbleTriggers` is unsupported (that is the Xbox impulse-trigger API). | [D][3] :720-745, :1029-1032 |
| Lightbar | `SDL_SetGamepadLED` RGB. Reported as `CAP_RGB_LED`, not mono. | [D][3] :1037-1067 |
| Player LEDs | Set from the SDL player index; can be turned off with the hint `JOYSTICK_HIDAPI_PS5_PLAYER_LED` | [D][3] :765-773, :941-965 |
| Adaptive triggers | Only through `SDL_SendGamepadEffect` with a raw `DS5EffectsState_t` that the app builds. SDL's `testcontroller` shows three 11-byte trigger effects and clears them on close. | [D][3] `test/testcontroller.c:517-537, :1241-1244` |
| USB vs Bluetooth | Bluetooth effects use report `0x31` with a CRC32 (78 bytes); USB uses a 48-byte report. On Bluetooth, the LED waits for the connection animation (about 10.2 s of sensor clock) before it applies. | [D][3] :1099-1121, :784-812 |
| Enhanced report mode | Needed for gyro, touchpad and effects over Bluetooth. Ryubing sets hint `1`, which is also SDL's documented default. SDL documents that **on PlayStation pads it cannot be turned off without power-cycling the pad**. | [D][1][3] `SDL_hints.h:1442-1465` |
| Background input | `JOYSTICK_ALLOW_BACKGROUND_EVENTS` (default 0, Ryubing sets 1) | [D][1][3] |

**The macOS backend.** HIDAPI is on by default on macOS (`SDL_HIDAPI_DEFAULT true`, `SDL_hidapijoystick_c.h:62-70`) [D][3]. It uses an `IOHIDManager` with `kIOHIDOptionsTypeNone`, and SDL forces non-exclusive opens on macOS (`hid_darwin_set_open_exclusive(0)`, `SDL_hidapi.c:1266`) [D][3].

The MFi (GameController) backend still initialises: the bundled dylib links GameController and CoreHaptics [M]. It skips a GCController that is a PS5 pad when HIDAPI already has a PS5 device (`SDL_mfijoystick.m:363-376`) [D][3]. While enumerating, it sets `GCController.shouldMonitorBackgroundEvents = YES` and asks GameController to disable system gestures on every bound button (:308-323) [D][3].

**TCC (Input Monitoring).** SDL's HIDAPI only enumerates joystick, gamepad and multi-axis usages by default (`SDL_HINT_HIDAPI_ENUMERATE_ONLY_CONTROLLERS`, default `1`). The hint text says this avoids "macOS keyboard capture permission prompts" (`SDL_hints.h:1250-1260`; filter `SDL_hidapi.c:1158-1185`) [D][3][5]. The IOKit joystick fallback also matches only GamePad and Joystick usages (`SDL_iokitjoystick.c:483, :694`) [D][3].

So the DualSense path should not need Input Monitoring [I, high]. The open question is whether macOS 27.2 beta changed TCC classification for HID gamepads. That needs a live check with an observer, and any TCC change remains a separate owner decision.

**Forcing the MFi path instead.** Setting `SDL_JOYSTICK_HIDAPI_PS5=0` would hand the DualSense to SDL's MFi backend [I]. That backend provides GCMotion, touchpad via GC d-pad elements, CoreHaptics rumble on handle localities, and the light (`SDL_mfijoystick.m:948-976, :1176-1206, :1490-1510`). But its `SendEffect` returns unsupported (:1513-1516), so adaptive triggers would be lost, and the GUID and therefore the id would change [D][3].

### 3. Apple GameController framework

All availability values below come from Apple's documentation JSON, accessed 2026-11-01 [D][6].

| API | What it gives | macOS |
|---|---|---|
| `GCDualSenseGamepad` | DualSense profile: `touchpadButton`, `touchpadPrimary`, `touchpadSecondary` (2 fingers), and `leftTrigger`/`rightTrigger` as `GCDualSenseAdaptiveTrigger`. Motion axes: +x right, +y out of the USB-C port, +z from the touchpad toward you. | 11.3 |
| `GCDualSenseAdaptiveTrigger` | Modes: off; feedback(start, strength); weapon(start, end, strength); vibration(start, amplitude, frequency); also `armPosition`, `status` | 11.3 |
| `setModeFeedback(resistiveStrengths:)`, `setModeVibration(amplitudes:frequency:)`, `setModeSlopeFeedback(...)` | Per-position strengths and slope | 12.3 |
| `GCMotion` (`GCController.motion`) | Rotation rate and acceleration; `sensorsRequireManualActivation` and `sensorsActive` | 10.10 (sensors 11.0) |
| `GCDeviceHaptics` (`GCController.haptics`) | `createEngine(withLocality:)` returns a `CHHapticEngine`. Localities: default, all, handles, left/right handle, triggers, left/right trigger. Apple warns the engine's `supportsHaptics` describes the host, not the pad; use `supportedLocalities`. | 11.0 |
| `GCDeviceLight` (`GCController.light`) | RGB colour | 11.0 |
| `GCController.playerIndex` | Lights the matching player LED | 10.9 |
| `GCController.shouldMonitorBackgroundEvents` | When false, input is not forwarded while the app is not frontmost. Default false since macOS 11.3. | 11.3 |
| `GCControllerLiveInput` (`GCController.input`) | Snapshots and an input-state queue | 14.0 |
| `preferredSystemGestureState` | Asks to disable system gestures; "the system isn't guaranteed to respect this property" | 11.0 |

[D][6][7]

Which haptic localities a DualSense actually exposes on macOS 27 (handles only, or also triggers) is unknown. SDL only enables trigger rumble if the triggers locality is listed (`SDL_mfijoystick.m:970-976`) [D][3].

### 4. Advanced haptics and adaptive triggers (separate feasibility)

**USB voice-coil PCM.** Over USB the DualSense is a USB Audio device with 4 output channels; channels 3 and 4 drive the left and right voice coils [A][10][11].

- A Wine-on-macOS fix (MacGameFix v1.5.0) states that "on a cable, macOS shows a DualSense as a 4-channel audio output" [A][10].
- RenHDrum (created 2026-10-25, Apache-2.0/MIT, Windows) documents 48 kHz float32, 4 channels, channels 1-2 muted, fixed 256-frame (5.33 ms) slots. It also warns that the audio endpoint can enumerate up to 12 s after the HID endpoint on Windows [A][11].

On macOS this would be a CoreAudio output device owned by `coreaudiod`. An app can open it with AudioUnit/HAL without any special entitlement [I]. A community tutorial reports that macOS Multi-Output and Aggregate devices cannot route the rear channels alongside normal speakers [A][18]. So the haptic stream must target the DualSense device directly, independently of game audio.

**Bluetooth haptics.** There is no Bluetooth audio profile for the DualSense on macOS [I]. SAxense (MPL-2.0, Linux proof of concept, last pushed 2026-01-29) streams 3 kHz two-channel signed 8-bit PCM over hidraw [A][12]. RenHDrum describes this as HID output report `0x32`: 142-byte packets with CRC32, 32 samples each, about 94 packets per second, sent on a second HID handle next to SDL [A][11].

On macOS that means a second `IOHIDDeviceSetReport` writer alongside SDL's effects writer. That raises sequencing and CRC conflicts and was never shown on macOS [I]. Linux hid-playstation maintainers stated in 2020 that the haptics need "PCM data (or special HID packets using Bluetooth)" [D][16].

**Translating HD Rumble.** Each Switch actuator gets (low band amplitude, frequency) and (high band amplitude, frequency) every few ms [D][1]. That maps naturally onto a two-oscillator synthesiser per voice coil, with phase-continuous frequency glides [I]. RenHDrum's documented recipe is x^0.5 amplitude shaping, proportional limiting when the bands sum above 1.0, a 0.8 ceiling, 20-1000 Hz glides, and a 48 kHz synth averaged by 16 for 3 kHz Bluetooth [A][11]. Ryubing's current mapping discards frequency (1.4).

**Adaptive triggers.** The Switch has no equivalent signal. A TOTK trigger effect (bow draw tension on ZR, shield or ZL lock-on resistance, a vibration "click" on a Fuse or Ultrahand bind) needs game-state hooks, for example reading player-state memory or hooking guest calls [I]. That is the same class of work as the D2 patch, but read-only. Effects persist on the pad until cleared; SDL's own test clears them on close [D][3]. A crash could leave a trigger stiff until the next app clears it or the pad power-cycles [I].

| Item | Feasibility | Main risk | Phase |
|---|---|---|---|
| SDL rumble (current path), with left/right fix | High | Swap unconfirmed; coarse feel | v1 |
| USB voice-coil PCM from HD Rumble (CoreAudio) | Medium | Device discovery and association with the right pad; buffer latency (5-20 ms); conflict with SDL's "disable audio haptics" bit while SDL rumble is active | Later (v2) |
| Bluetooth haptics (report `0x32`) | Low-medium | Undocumented format, second HID writer, radio saturation degrading input (RenHDrum notes gyro and button lag from flooding), credit and licence terms | Later, experimental |
| Adaptive triggers via `SDL_SendGamepadEffect` (HIDAPI path) | Medium (API); low (game hooks) | Needs TOTK state hooks per 1.4.3 offsets; stuck effects on crash | Later |
| Adaptive triggers via `GCDualSenseAdaptiveTrigger` | Medium | Native shim; GameController and HIDAPI both talking to one pad | Later, if SDL path fails |

### 5. TOTK motion aiming, conventions, latency and reconnect

**What gyro does in TOTK.** The in-game option is "Aim with motion controls" (on by default) [A][17]. Guides agree it covers bow aiming after drawing with ZR, and most include throwing aim, the scope or camera, and Ultrahand [A][17]. One guide adds Recall and the Purah Pad scanner [A][17]. No Nintendo primary source was found. Whether any 1.4.3 shrine *requires* motion is unverified.

**Axis conventions.** Ryubing applies one SDL-to-Switch remap to every SDL pad (1.3), so the Pro Controller and DualSense conventions are reconciled by SDL, not by Ryubing [D][1][3]. Apple's GCDualSense frame (+y out of the USB-C port) differs from SDL's frame. A GC-based shim would need its own remap, verified with a tilt probe [D][6][I].

**Calibration and deadzones.** Factory IMU calibration is applied by SDL; there is no runtime bias learning in Ryubing [D][1][3][15]. The default gyro deadzone (1 deg/s magnitude) hides slow drift but also swallows fine aim. Suggested starting values are 0.5 deg/s and 100 % sensitivity, then tune on Great Sky Island archery [I].

**Latency chain.** The pad reports every 4 ms over USB, or about 1.3-1.8 ms over Bluetooth with high jitter [D][9]. IOKit then delivers to SDL HIDAPI, which is pumped every about 10 ms on the UI thread [D][1]. The emulation thread polls about every 1 ms, and HID shared memory is sampled by TOTK once per game frame (33 ms at 30 FPS, 22 ms at 45) [I]. After that come rendering, MoltenVK present and the display. The game frame dominates, but the pump is the cheapest fixed cost to remove: for example, call `SDL_UpdateGamepads` from the input poll path at 2-4 ms, after a thread-safety review [I].

**Polling, measured by a third party on Windows** [D][9]:

| Connection | Polling | Avg / max button latency | Jitter |
|---|---|---|---|
| USB, default | 250 Hz | 7.8-11.3 / 9.9-17.1 ms | 1.1-3.6 ms |
| Bluetooth | 542-799 Hz | 6.0-9.0 / 17-28 ms | 2.4-6.8 ms |

These are button tests. Stick tests over Bluetooth reached a 39 ms maximum. Three cable tests were run (2025-03 to 2026-06). One of them (2026-06-06) averaged 11.3 ms with 3.6 ms jitter, so "about 1 ms jitter over USB" is typical but not guaranteed. Gamepadla also lists overclocked-cable results at 500 and 1000 Hz, which do not apply to a stock macOS setup [D][9].

The macOS behaviour is unmeasured.

**Game Mode.** Apple says Game Mode "doubles the Bluetooth sampling rate" and gives the game top CPU and GPU priority. It turns on automatically when a game enters native full screen, on Apple silicon with macOS 14 or later [D][8]. Ryubing's `Info.plist` declares `public.app-category.games` [D][1], so a native full-screen Ryubing window should qualify [I].

Game Mode is therefore a **variable to log**: it is on only when full screen, and it is off in the background agent trials. On macOS 26 and later, Command-Esc opens Game Overlay. The controller Home (PS) button "might open Game Overlay, Games, or Spotlight, depending on the game and your controller's settings" [D][8]. User reports say the action can be changed in the Game Controllers settings [A][19].

**Touchpad when docked.** TOTK docked has no touchscreen input, so the DualSense touchpad is free hardware [I].

- Best v1 use: touchpad click as the TOTK Luma dashboard toggle (a gamepad-side hotkey, since Ryubing hotkeys are keyboard-only and run only while the window is active [D][13]).
- Optional: a two-finger tap to cycle the FPS cap.
- Swipes need touch coordinates, which Ryubing does not read (SDL provides them).

**Reconnect UX.**

- **Bluetooth.** A pad that sleeps or drops out disconnects. Ryubing disposes and reloads, and the game may raise its controller applet. Ryubing turns that into an Avalonia dialog unless `ignore_applet` is true (`AvaHostUIHandler.cs:38-61`) [D][1], and a dialog can activate the window [D][13].
- **Bus switch.** Moving from Bluetooth to USB changes the id (1.5).
- **Recommendation.** Bind both ids through a device profile, or keep one bus per session. Set `ignore_applet` for agent sessions. Show a dashboard toast instead of a dialog [I].

### 6. Measurement hygiene

Input isolation (agent pad, no OS events) does not make a performance run clean. Required for every performance sample [I]:

- **Input state recorded.**
  - Agent pad disconnected or idle. Use the build *without* the agent patch for strict comparisons (control plan rule) [D][13].
  - Physical pad state recorded: bus, battery, enhanced mode, and whether it is connected at all.
  - Rumble on or off recorded, because SDL rumble writes are output reports on the same link.
- **Host uncontended.** No other GPU-heavy apps, and no screen capture beyond the measured tool. The Metal HUD's shader-cache effect is already known [M].
- **Power and thermals logged.** AC or battery, Low Power Mode, `pmset -g therm` and `powermetrics` thermal pressure before and after each run, and ambient conditions noted.
- **Display and mode logged.** Full screen or windowed, Game Mode state, display refresh rate, and which display (built-in XDR or A95L).
- **Network quiet.** Ryubing downloads the gamepad DB at launch (1.1), and Discord integration is configurable. Both are startup noise, not steady-state, but should be fixed per run [D][1].
- **Same build, same config hash, same save slot, same warm shader cache.**

---

## Implications for TOTK Luma

1. **v1 controller path: SDL3 HIDAPI as shipped.** USB for measurement sessions, Bluetooth allowed for play. No GameController shim and no TCC change.
2. **Small Ryubing patches worth carrying in v1**, each with a unit or probe test:
   - LED capability: accept `CAP_RGB_LED` (lightbar colour per profile, for example HDR profile colours).
   - Call `SDL_SetGamepadPlayerIndex` so the player LEDs match the Switch player.
   - Stop destroying the gamepad property set.
   - Correct the rumble left/right mapping (after a side-by-side test).
   - Skip `NpadHdRumble` for non-Nintendo vendors (aligns with open PR #192).
3. **Input freshness patch (v1 candidate, gated on a latency probe).** Update SDL gamepad state at 2-4 ms off the UI thread, or at least measure the current pump age (`SDL_GetTicks` minus the last pump time) in the dashboard.
4. **Composite driver with owner-wins arbitration** (1.7). It keeps the agent pad for automation and never affects keyboard, mouse or focus. Add a dashboard indicator for which source owns Player 1.
5. **Profiles.** Bind DualSense USB and Bluetooth ids explicitly. Set gyro deadzone 0.5 and sensitivity 100 as a starting point, and keep motion enabled for Player 1 only. Set `ignore_applet=true` in agent configs, and consider it for owner configs with a toast replacement.
6. **Touchpad click toggles the dashboard.** The TOTK Luma overlay owns this, not the guest.
7. **Later tracks:** USB voice-coil PCM synthesis from HD Rumble, then adaptive triggers with TOTK state hooks, then Bluetooth haptics (experimental). Each needs its own go or no-go note.
8. **Focus hygiene with a physical pad.** Tell the owner that the PS button may open Game Overlay, Games or Spotlight on macOS 26 and later, depending on the controller settings [D][8]. Do not bind PS (Home) to anything the game needs. Test whether GameController's gesture suppression holds while Ryubing is in the background.

---

## Options compared

| Option | Gyro | Touch (2-finger) | Adaptive triggers | Haptics | Light / player LED | Background | Effort | Fit |
|---|---|---|---|---|---|---|---|---|
| A. SDL3 HIDAPI as shipped | Yes | Click only | No | SDL rumble | No (cap bug) / SDL default | Yes (hint) | 0 | Baseline |
| **B. SDL3 HIDAPI + small patches (recommended v1)** | Yes | Click + coordinates possible | Possible later via `SendEffect` | SDL rumble, fixed sides | Yes / yes | Yes | Days | **v1** |
| C. SDL MFi path (`HIDAPI_PS5=0`) | GCMotion | GC d-pads | No (`SendEffect` unsupported) | CoreHaptics on handles | GC light | `shouldMonitorBackgroundEvents` set by SDL | Hours + validation | Fallback only |
| D. Native GameController shim beside SDL | Yes | Yes | Yes (modes) | CoreHaptics | Yes | Yes | Weeks | Later, if B blocks triggers |
| E. HIDAPI + CoreAudio PCM (USB) | Yes | Yes | Via B | Voice-coil PCM | Yes | Yes | 1-2 weeks | Later (v2) |

---

## Feature matrix

| Feature | USB | Bluetooth | API path | v1 or later | Evidence |
|---|---|---|---|---|---|
| Buttons, sticks, d-pad | Yes | Yes | SDL HIDAPI PS5 | v1 | [D][1][3] |
| Analog triggers to ZL/ZR | Yes | Yes | SDL axis + threshold 0.5 | v1 | [D][1] |
| Touchpad click | Yes | Yes (enhanced) | `SDL_GAMEPAD_BUTTON_TOUCHPAD` | v1 (dashboard toggle) | [D][1][3] |
| Touchpad 2-finger coordinates | Yes | Yes (enhanced) | `SDL_GetGamepadTouchpadFinger`, or GC `touchpadPrimary`/`Secondary` | Later | [D][3][6] |
| Gyro and accelerometer | 250 Hz | 1000 Hz nominal (enhanced) | SDL sensors, factory calibration | v1 | [D][3]; sampled at about 100 Hz by Ryubing [I] |
| Rumble (emulated, 2 amplitudes) | Yes | Yes (enhanced) | `SDL_RumbleGamepad` | v1 (fix sides) | [D][1][3] |
| HD Rumble as voice-coil PCM | Yes (4-channel USB audio, ch 3-4) | Report `0x32` 3 kHz s8 (community) | CoreAudio, or raw HID | Later | [A][10][11][12] |
| Lightbar RGB | Yes | Yes (after the about 10 s connection animation) | `SDL_SetGamepadLED` (Ryubing cap bug) or GC light | v1 (patch) | [D][1][3][6] |
| Player LEDs | Yes | Yes | SDL player index, GC `playerIndex` | v1 (patch) | [D][3][6] |
| Adaptive triggers | Yes | Yes | `SDL_SendGamepadEffect` raw bytes, or `GCDualSenseAdaptiveTrigger` | Later (needs game hooks) | [D][3][6] |
| Battery state | Yes | Yes | SDL battery events (logged only) | v1 (dashboard) | [D][1] |
| Background input without focus | Yes | Yes | SDL hint `1`; GC `shouldMonitorBackgroundEvents` | v1 | [D][1][3][6]; agent pad [M][14] |
| No Input Monitoring prompt | Expected | Expected | SDL controller-only enumeration | v1 (verify) | [D][3][5] |
| Game Mode Bluetooth boost | n/a | Yes (full screen only) | macOS | v1 (log it) | [D][8] |
| PS button system gesture suppression | Partial | Partial | GC `preferredSystemGestureState` (not guaranteed) | v1 (document) | [D][7]; [A][19] |
| Headset jack and speaker audio | Yes (USB audio) | No standard path | CoreAudio | Out of scope | [A][10] |
| Hotplug and reconnect | Yes | Yes (id differs from USB) | SDL joystick events, then NpadManager reload | v1 (bind both ids) | [D][1][3] |

---

## Unknowns and evidence gates

| Unknown | Why it matters | How to resolve | Gate or phase |
|---|---|---|---|
| Does macOS 27.2 beta prompt for Input Monitoring when Ryubing opens a DualSense? | TCC changes need a separate decision | Attended launch with the pad on USB, then Bluetooth; check System Settings > Privacy > Input Monitoring before and after; no TCC edits | Phase 1 controller check (attended) |
| Real input age through the 10 ms UI-thread pump | Gyro aim feel; the value of the pump patch | Log `SDL_GetTicks` at pump and at `NpadManager.Update`; histogram | Before the pump patch |
| Rumble left/right swap | Correct spatial feedback | Guest-independent probe: drive `ApplyRumble` with left-only and right-only values | v1 patch gate |
| Does `SDL_DestroyProperties` break caps on a second open? | Rumble or LED silently lost | Unit probe: open the pad twice and query caps | v1 patch gate |
| Gyro axis signs for TOTK bow aim on DualSense | Inverted aim | Archery on Great Sky Island: yaw, pitch, roll | Attended play test |
| Haptic localities exposed by GameController for DualSense on macOS 27 | Option D design | Small read-only probe app (no window), attended | Later |
| Is the DualSense USB audio device visible in CoreAudio with 4 channels on this Mac? | Option E | `system_profiler SPAudioDataType` with the pad on USB | Later |
| Does the PS button open Game Overlay while Ryubing is in the background? | Focus steal during agent or owner sessions | Attended test with the window hidden | v1 focus hygiene |
| macOS USB vs Bluetooth latency and jitter | Bus recommendation | High-speed camera or LED-to-photodiode rig; otherwise SDL timestamp deltas | Later |
| TOTK 1.4.3 motion-only content | Whether gyro is mandatory | Play test and community lists | Low priority |
| Does the controller applet appear on Bluetooth dropout in TOTK? | Dialog can activate the window | Attended dropout test with `ignore_applet` off, then on | v1 |

---

## Risks

- **Focus theft through system UI.** The PS button may open Game Overlay, Games or Spotlight [D][8][A][19]. Crash reporter and applet dialogs can activate the window [D][13]. Owner-wins ESTOP limits the damage but cannot prevent the activation.
- **Persistent pad state.** Enhanced report mode cannot be reverted without a power cycle [D][3], and adaptive trigger effects persist until cleared [D][3]. Other apps that expect simple Bluetooth reports may misbehave until the pad restarts.
- **Two writers to one pad.** SDL HIDAPI effects plus GameController (system or a shim), or plus a Bluetooth haptics stream, could fight over LED, rumble or CRC sequencing [I].
- **Id drift.** USB and Bluetooth, firmware version or driver-path changes alter the Ryubing id. A silent keyboard fallback can make it look as if "the controller does nothing" [D][1][I].
- **Startup network access.** The gamepad DB fetch from GitHub runs on every launch [D][1]. This is probably the outbound 443 connection seen in the control trials [I]; see the conflicts section.
- **Licence and credit.** Bluetooth haptics research (SAxense, MPL-2.0) asks for credit. RenHDrum is Apache-2.0/MIT but Windows-only and two weeks old [A][11][12].
- **Measurement contamination.** Rumble output and an idle Bluetooth pad still use radio and CPU time. Keep them fixed or off per run.

---

## Effort notes

All ranges assume one developer who knows the Ryubing tree, the private .NET SDK already set up, and no live-device surprises.

| Work | Range | Assumptions |
|---|---|---|
| Attended DualSense validation (USB and Bluetooth, gyro, rumble sides, TCC check) | 0.5-1 day | Owner present for about 1 h |
| v1 small patches (RGB cap, player index, property fix, rumble sides, HdRumble vendor skip) with tests | 1-2 days | Unit probes, no game run needed |
| Input pump at 2-4 ms off the UI thread, plus an age metric | 1-3 days | Thread-safety review of `SDL3GamepadDriver` dictionaries |
| Composite arbitration (owner-wins, agent-exclusive mask) on top of agentpad | 1-2 days | Reuses the 42-test harness |
| Touchpad dashboard toggle (click; coordinates optional) | 0.5-1 day | Overlay hook exists |
| USB voice-coil PCM synth from HD Rumble (CoreAudio) | 1-2 weeks | Device association and latency tuning |
| Adaptive triggers with TOTK 1.4.3 state hooks | 2-4 weeks | Read-only memory hooks, effect design |
| Bluetooth haptics on macOS | 2-4 weeks, uncertain | Unproven on macOS; may be no-go |

---

## Sources

1. Ryubing source at commit `9afba70` (= upstream `475615f`): `src/Ryujinx.SDL3.Common/SDL3Driver.cs`, `src/Ryujinx.Input.SDL3/{SDL3Gamepad,SDL3GamepadDriver,NpadHdRumble}.cs`, `src/Ryujinx.Input/HLE/{NpadManager,NpadController}.cs`, `src/Ryujinx.Input/Motion/MotionInput.cs`, `src/Ryujinx.Input/InputConfigDefaults.cs`, `src/Ryujinx/Program.cs`, `src/Ryujinx/UI/Applet/AvaHostUIHandler.cs`, `src/Ryujinx/Systems/Configuration/ConfigurationFileFormat.cs`, `distribution/macos/Info.plist`, `Directory.Packages.props` (`Ryujinx.SDL3-CS 2026.707.0`). Read from the local official commit, 2026-11-01.
2. `Ryujinx.SDL3-CS 2026.707.0` nuspec (repository Kenji-NX/SDL3-CS, commit `8d28a75`). Bundled `libSDL3.dylib` version string `SDL-3.5.0-5403934` and its linked frameworks (IOKit, GameController, CoreHaptics), read with `strings` and `otool -L` in the private local evidence workspace build output, 2026-11-01.
3. libsdl-org/SDL at `5403934fd30e3568b1e20f652d4823c796739722` (2026-07-07): `src/joystick/hidapi/SDL_hidapi_ps5.c`, `src/joystick/hidapi/SDL_hidapijoystick_c.h`, `src/joystick/apple/SDL_mfijoystick.m`, `src/joystick/darwin/SDL_iokitjoystick.c`, `src/hidapi/SDL_hidapi.c`, `src/hidapi/mac/hid.c`, `src/joystick/SDL_joystick.c`, `src/joystick/SDL_sysjoystick.h`, `src/events/SDL_events.c`, `include/SDL3/{SDL_hints.h,SDL_sensor.h,SDL_gamepad.h}`, `test/testcontroller.c`. https://github.com/libsdl-org/SDL, accessed 2026-11-01.
4. SDL PR #4402 (GameController and HIDAPI duplicate devices). https://github.com/libsdl-org/SDL/pull/4402, accessed 2026-11-01 (via search summary).
5. SDL3 wiki, `SDL_HINT_HIDAPI_ENUMERATE_ONLY_CONTROLLERS`. https://wiki.libsdl.org/SDL3/SDL_HINT_HIDAPI_ENUMERATE_ONLY_CONTROLLERS. SDL commit "hidapi/mac: Only enumerate IOHIDDevices that are likely to be joysticks", https://discourse.libsdl.org/t/sdl-hidapi-mac-only-enumerate-iohiddevices-that-are-likely-to-be-joysticks/43964, accessed 2026-11-01.
6. Apple Developer Documentation (JSON endpoints under https://developer.apple.com/tutorials/data/documentation/gamecontroller/): `GCDualSenseGamepad`, `touchpadPrimary`, `touchpadSecondary`, `GCDualSenseAdaptiveTrigger` and its mode setters, `armPosition`, `status`, `GCMotion`, `sensorsActive`, `sensorsRequireManualActivation`, `rotationRate`, `acceleration`, `GCDeviceHaptics`, `createEngine(withLocality:)`, `GCHapticsLocality`, `GCDeviceLight`, `GCController.light`, `haptics`, `motion`, `battery`, `playerIndex`, `shouldMonitorBackgroundEvents`, `current`, `input`, `GCControllerLiveInput`, `GCControllerTouchpad`, `GCPhysicalInputProfile`. Accessed 2026-11-01.
7. Apple Developer Documentation, `GCControllerElement.preferredSystemGestureState`. https://developer.apple.com/documentation/gamecontroller/gccontrollerelement/preferredsystemgesturestate, accessed 2026-11-01.
8. Apple Support, "Use Game Mode" (published 2026-09-14). https://support.apple.com/105118. MacRumors, "Apple Explains How Game Mode Works in macOS Sonoma" (2023-09-27), https://www.macrumors.com/2023/09/27/apple-explains-how-game-mode-works-in-macos-sonoma/. Both accessed 2026-11-01.
9. Gamepadla, Sony DualSense latency and polling (Windows 11, Prometheus 82). https://gamepadla.com/sony-dualsense.html, accessed 2026-11-01.
10. MathiasKowoll/MacGameFix release v1.5.0, "DualSense haptics on a USB cable". https://github.com/MathiasKowoll/MacGameFix/releases/tag/v1.5.0, accessed 2026-11-01.
11. trzz1214/RenHDrum (commit `d4ae23d`, created 2026-10-25) README, and its DualSense notes page https://ryuhdr.threedola.workers.dev/dualsense. https://github.com/trzz1214/RenHDrum, accessed 2026-11-01.
12. egormanga/SAxense, "DualSense Haptics over Bluetooth (POC)" (commit `6fd1648`, MPL-2.0). https://github.com/egormanga/SAxense, accessed 2026-11-01.
13. Prior control plan and agent-pad patch, from the private local evidence workspace: `phase1/agents/control/control-plan.md` and `agent-virtual-pad.patch` (CompositeGamepadDriver), against 475615f. Read 2026-11-01.
14. Prior control result (turn 17) from the private local evidence workspace: `CONTROL-RESULT.md` (42/42 tests, 9/9 end-to-end, hidden-window trials). Read 2026-11-01.
15. Ryubing forge, pull requests #117, #125, #177, #192 (https://git.ryujinx.app/projects/Ryubing/pulls/<n>), via the Forgejo API, accessed 2026-11-01.
16. Linux hid-playstation DualSense patch discussion (2020-12-19), quoted in https://gitlab.com/TYcommand/Gamepads/-/issues/11 and https://patchwork.kernel.org/comment/23879469, accessed 2026-11-01.
17. TOTK motion-control guides: Prima Games https://primagames.com/tips/how-to-turn-off-motion-controls-in-tears-of-the-kingdom; Shacknews https://www.shacknews.com/article/135485/settings-options-zelda-totk; GameSkinny https://www.gameskinny.com/?p=88409; PC Invasion https://www.pcinvasion.com/how-to-aim-the-bow-with-gyro-controls-in-tears-of-the-kingdom/. Accessed 2026-11-01 (search summaries).
18. r/macgaming, "Ultimate DualSense controller tutorial" (2024-01-14, mirror). https://reddit.birdcat.cafe/r/macgaming/comments/196mx0b/ultimate_dualsense_controller_tutorial, accessed 2026-11-01 (search summary).
19. Game Overlay and PS button reports: MacStories macOS 26 review https://www.macstories.net/stories/macos-26-tahoe-the-macstories-review/5; Apple Developer Forums https://developer.apple.com/forums/thread/743753 and https://developer.apple.com/forums/thread/775975. Accessed 2026-11-01 (search summaries).

---

## Independent verification

An independent skeptic pass ran on 2026-11-01. It re-read the official Ryubing commit `9afba70` with `git show` and `git grep`, and libsdl-org/SDL at `5403934`. It also fetched Apple's GameController documentation JSON and Apple Support 105118, re-read Gamepadla, and re-read the prior control result in the private local evidence workspace. No controller, emulator or game was run.

| Claim | Verdict | Evidence and source | Note |
|---|---|---|---|
| The DualSense goes through SDL HIDAPI by default on macOS, and the MFi backend skips a PS5 pad that HIDAPI owns | Confirmed | `SDL_hidapijoystick_c.h:62-70`: `SDL_HIDAPI_DEFAULT` is false only on Android, iOS, tvOS and visionOS. `SDL_mfijoystick.m:372-376`: `is_ps5 && HIDAPI_IsDeviceTypePresent(SDL_GAMEPAD_TYPE_PS5)` skips the device. | The gesture-disable and `shouldMonitorBackgroundEvents = YES` code (:308-323) runs *before* the skip, so it also applies to a pad that HIDAPI owns. |
| Ryubing bundles SDL `3.5.0-5403934` via `Ryujinx.SDL3-CS 2026.707.0` | Confirmed | `Directory.Packages.props:79` at `9afba70`. The `libSDL3.dylib` in the private build output contains the string `SDL-3.5.0-5403934` and links IOKit, GameController and CoreHaptics (weak). SDL commit `5403934` is dated 2026-07-07. | [M]+[D] |
| No Input Monitoring prompt is expected | Confirmed as documented intent; macOS 27.2 behaviour unverifiable | `SDL_hints.h:1245-1260` (the hint defaults to `1`, "avoiding macOS keyboard capture permission prompts"). `SDL_hidapi.c:1158-1189` keeps only joystick, gamepad and multi-axis usages. `SDL_hidapi.c:1266` makes opens non-exclusive. `mac/hid.c:450` uses `kIOHIDOptionsTypeNone`. | It is still [I] for the 27.2 beta. The attended gate stays. |
| A 10 ms UI-thread pump is the only thing that refreshes SDL pad state in the GUI | Confirmed | `SDL3Driver.cs:196-213` (`WaitTimeMs = 10`). `Program.cs:270` uses `Dispatcher.UIThread.InvokeAsync(..., DispatcherPriority.Input)`. `SDL_events.c:1508-1513` calls `SDL_UpdateJoysticks` inside the pump. A grep of `src` finds no other `SDL_UpdateGamepads` or `SDL_PumpEvents` call except the headless runner (`WindowBase.cs:368`, about 1 ms). | A headless-mode exception was added. The sensor rates (250 Hz USB, 1000 Hz Bluetooth) are labels in SDL's code, and the Bluetooth comment says "appears to be" (`SDL_hidapi_ps5.c:851-864`). |
| The LED feature tests `CAP_MONO_LED`, and the DualSense reports `CAP_RGB_LED` | Confirmed | `SDL3Gamepad.cs:153` tests only `SDL_PROP_GAMEPAD_CAP_MONO_LED_BOOLEAN`. `SDL_hidapi_ps5.c:1041` sets only `CAP_RGB_LED`, and only when enhanced mode is available. | The no-op effect is [I], but the code path leaves little room for doubt. |
| Rumble collapses to two amplitudes, the right actuator drives "low", and SDL sends low to the left voice coil | Confirmed (code); swap remains [I] | `NpadController.cs:705-716` builds `low` from `rightVibrationValue`. `SDL_hidapi_ps5.c:1023-1024`: `rumble_left = low >> 8`. `:726-727` writes `ucRumbleLeft`. | A physical side test is still needed. |
| `NpadHdRumble` opens an unused Sony handle, with static vendor and product fields | Confirmed | `NpadHdRumble.cs:17-18` (static fields). `:257` and `:286` list Sony `0x054c` and DualSense `0x0ce6`. `HdRumble` writes only for Nintendo PIDs. `SDL3Gamepad.cs:87` creates it at construction. | Clarified that the handle opens even when `UseHDRumble` is false (the default, `InputConfigDefaults.cs:143`). |
| USB and Bluetooth give different Ryubing ids | Confirmed | `SDL_joystick.c:2997-2998` puts the bus in bytes 0-1 and the CRC in bytes 2-3. `SDL_hidapijoystick.c:953-958` passes `SDL_HARDWARE_BUS_BLUETOOTH` (0x05) or USB (0x03). The custom `SDLGuidToString` (`SDL3GamepadDriver.cs:84`) reorders the bytes so that the first 4 characters are the CRC. Ryubing replaces those, which leaves the bus digits. Keyboard fallback: `NpadManager.cs:211-218`. | The byte reordering was checked by hand. A unit test would make it certain. |
| No touch coordinates, no `SDL_SendGamepadEffect`, no player index; touchpad click is mapped | Confirmed | `git grep` at `9afba70` over `src` finds no `SendGamepadEffect`, `SetGamepadPlayerIndex` or `TouchpadFinger`. `SDL3Gamepad.cs:56` maps `SDL_GAMEPAD_BUTTON_TOUCHPAD`. | |
| Enhanced report mode cannot be undone on PlayStation pads without a power cycle | Confirmed | `SDL_hints.h:1442-1465`: "Once enhanced reports are enabled, they can't be disabled on PlayStation controllers without power cycling the controller." | `1` is also SDL's default, so the note now says "sets" rather than "forces". |
| SDL's MFi `SendEffect` is unsupported; under HIDAPI, raw DS5 trigger bytes are sent | Confirmed | `SDL_mfijoystick.m:1513-1516` returns `SDL_Unsupported()`. `testcontroller.c:517-537` sends three 11-byte effects. | |
| Gamepad drivers are polled without focus, and only the keyboard is cleared | Confirmed | `AppHost.cs` `UpdateFrame` at `9afba70`: when `!_viewModel.IsActive` it calls `KeyboardDriver.Clear()`, then always calls `NpadManager.Update`. | |
| Background control was validated live with the window fully hidden | Corrected | `CONTROL-RESULT.md` (private local evidence workspace), trials 2 and 3: agent pad only, window 0 % visible, 2-4 min at 1x, `--agent-background` patch. In trial 2 the guard stopped the run after a trackpad click. The revised "ESTOP and keep running" guard "has not yet been replayed live". | The note now limits this to the agent pad and says the revised guard is untested live. |
| `shouldMonitorBackgroundEvents` defaults to false since macOS 11.3; positional strengths and slope need 12.3; `preferredSystemGestureState` is not guaranteed | Confirmed | Apple documentation JSON (accessed 2026-11-01): `shouldMonitorBackgroundEvents` is macOS 11.3, "In macOS 11.3 and later, the default value for this property is false". `setModeFeedback(resistiveStrengths:)` and `setModeSlopeFeedback(...)` are macOS 12.3. `preferredSystemGestureState` is macOS 11.0, "the system isn't guaranteed to respect this property". `GCDualSenseGamepad` is 11.3, with the stated axis frame. | |
| Game Mode doubles the Bluetooth sampling rate, only in full screen | Confirmed | Apple Support 105118 (published 2026-09-14): "Game Mode doubles the Bluetooth sampling rate"; it turns on "When your game enters full screen"; Apple silicon, macOS 14 or later. `Info.plist:56-57` declares `public.app-category.games`. | Whether Ryubing actually triggers Game Mode is still [I]. |
| The PS button opens the Games app or Game Overlay on macOS 26 and later | Corrected (upgraded) | Apple Support 105118: Home button "might open Game Overlay, Games, or Spotlight, depending on the game and your controller's settings". | The claim is now [D] for the system behaviour and [A] for its variability. The setting may let the owner reduce the risk. |
| DualSense polling: USB 250 Hz with about 8 ms average and about 1 ms jitter; Bluetooth 542-799 Hz with a 17-28 ms maximum | Corrected | Gamepadla page, re-read 2026-11-01. Three 250 Hz cable button tests: 7.81, 8.27 and **11.27** ms average; 9.85, 10.32 and **17.09** ms maximum; 1.07, 1.11 and **3.64** ms jitter. Bluetooth button maximum 17.11 and 27.71 ms; stick maximum 39.35 ms. All on Windows 11. | The summary's "28-39 ms" mixed button and stick results. The table and summary are now consistent. |

**Not re-checked:** the community haptics sources (MacGameFix, RenHDrum, SAxense; they stay [A]); the Ryubing forge PR dates (#117, #125, #177, #192); the TOTK motion-control guides; and the `SDL_DestroyProperties` side effect, which stays an [I] to be settled by a probe.
