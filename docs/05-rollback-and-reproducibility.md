# Rollback and reproducibility strategy

Status: Proposed, 2026-11-01

This page says how every TOTK Luma build is pinned, how it is proven to be the same binary, how variants run side
by side without sharing state, and how any change is undone. It implements decision D10 of
[ADR 0001](adr/0001-architecture-and-delivery.md) and the kill switches named in ADRs
[0002](adr/0002-hdr-pipeline-and-presenter.md) to [0006](adr/0006-visual-effects-and-reshade-style-support.md).
Like those records, it is awaiting owner approval. Nothing here authorises building or running anything yet.

Tags follow AGENTS.md: `[D]` documented, `[M]` measured, `[I]` inferred, `[A]` anecdotal. `[E]` cites
[the prior local evidence](evidence/prior-local-evidence.md), and `R10 §3.5` cites research note 10, section 3.5.
Every effort or time figure is an estimate `[I]` unless it is tagged `[E]` or `[M]`.

Placeholders such as `<build-root>`, `<data-root>` and `<sha256>` stand for owner-local values. Real paths and
hashes are never written into this public repository.

---

## 1. Principles

1. **Never replace, only add.** A new build is a new app bundle. The previous known-good bundle and the official
   reference app stay untouched [M] (R10 §3.5). This is how the prior experiments already worked [E].
2. **Every measurement names an exact binary.** A build manifest records what went in and the hashes of what came
   out. Launchers start only executables whose hash is in a manifest [M] (R10 §3.5; ADR 0001 D10.5).
3. **Flags first.** Every runtime change is off by default. With all flags off, the build behaves as stock
   (ADR 0001 D1.2). The cheapest rollback is a flag.
4. **Isolated data.** Each variant has its own data root. Saves are copied in from a manifest-checked backup and
   are never shared live between variants (ADR 0001 D10.4).
5. **No system changes.** No TCC, Gatekeeper or SIP changes at any step [E]. Deleting the build folder is a
   complete undo [E].
6. **Three locations, one direction of flow.** Public specs, a separate fork, and a private workspace. Facts may
   move toward the public repository; game material never does (ADR 0001 D10.1; section 10).

---

## 2. Where everything lives

| Location | Holds | Visibility |
|---|---|---|
| TOTK Luma (this repository) | Specs, ADRs, test matrices, the simulated demo, and the *schemas* of `luma.json`, the build manifest and the save manifest | Public |
| Luma fork of Ryubing | Generic patch queue, `series` file, `rebase.sh`, `global.json`, lock files, build scripts, launcher, build manifests | Local-only by default; hosting is an owner decision (ADR 0001 D10.1) |
| Build folder (`<build-root>`) | Isolated .NET SDK, NuGet cache (about 3.4 GB [E]), source archive, bundles | Owner-local; deleting it is the full undo [E] |
| Data roots (`<data-root>/<variant>`) | Per-variant `Config.json`, `luma.json`, saves, shader caches, logs | Owner-local |
| Private local evidence workspace | Title pack, save backups and their manifests, captures, shader dumps, GPU traces, telemetry runs, display calibration records | Owner-local, never committed anywhere |

---

## 3. Pinned toolchain and dependencies

At `475615f` the build is close to reproducible but not pinned: `global.json` asks for `10.0.301` with
`rollForward: latestFeature` (the local build resolved to `10.0.303`), there are no NuGet lock files, and every
bundle shares the id `org.ryujinx.Ryujinx` [D] (R10 §3.3, §3.4, verification). The table below closes each gap.

| Item | Pin | How it is checked | Source |
|---|---|---|---|
| Upstream source | Ryubing canary 1.3.351, commit `475615f` | SHA-256 of the source archive against the official git.ryujinx.app archive (4,312 files; already done once) | [E]; R10 §3.1 [M] |
| .NET SDK | `global.json`: `"version": "10.0.303"`, `"rollForward": "disable"`, plus the .NET 10 `paths` key pointing at the isolated SDK | SDK archive checked against Microsoft's `releases.json` with SHA-512 (already done once); SDK and runtime version (10.0.11) recorded in the manifest | ADR 0001 D10.5; R10 §3.1 [M], §3.3 [D] |
| Build environment | `DOTNET_ROOT`, `NUGET_PACKAGES` and `DOTNET_CLI_HOME` all inside `<build-root>` | Recorded in the manifest as relative paths | R10 §3.1 [M] |
| NuGet packages | `RestorePackagesWithLockFile=true`; `packages.lock.json` for `src/Ryujinx` and the test projects only; restore with `dotnet restore --locked-mode` | Restore fails if anything drifts; SHA-256 of each lock file in the manifest | ADR 0001 D10.5; R10 §3.3 [D] (lock files are not meaningful for library projects) |
| NuGet sources | nuget.org, plus the git.ryujinx.app feed for `Ryujinx.LibHac` only, with source mapping kept | Optional private mirror of the restored `.nupkg` set, with hashes, so a build survives a feed outage | R10 §3.3 [I] |
| MoltenVK | NuGet `Ryujinx.Graphics.Vulkan.MoltenVK 1.4.2-ryujinx.5` (equal to Kenji-NX/MoltenVK `89cdc5f`) | Lock file, plus SHA-256 of the shipped dylib in the manifest | ADR 0001 D2.1; R10 §3.3 |
| MoltenVK A/B (optional) | `1.4.3-ryujinx.2`, only as a separate measurement build | Its own manifest; judged against G6-6 (direct-to-display) | ADR 0001 D2.2 |
| KosmicKrisp (P5 only) | A separate flagged variant. Driver built from Mesa source (record the Mesa commit and build toolchain), or the LunarG SDK driver, or the PR !131 NuGet `26.2.5-ryu.1`, only after owner approval | SHA-256 of the driver dylib and its ICD manifest (selected through `VK_DRIVER_FILES`); gate G-KK requires "driver from source or owner-approved binary" | ADR 0001 G-KK; R05 §1.2, verification [D] |
| SDL | `Ryujinx.SDL3-CS 2026.707.0` (Kenji-NX/SDL3-CS `8d28a75`), bundling `libSDL3.dylib` `3.5.0-5403934` | Lock file, plus SHA-256 of `libSDL3.dylib` and its version string in the manifest. The ADR 0004 input patches are C# changes in the fork; the native SDL library itself stays as shipped [I] | ADR 0004; R07 Summary, sources 1-2 [M]/[D] |
| Dear ImGui (P1 onward) | ImGui.NET binding and its osx-arm64 native library, exact versions | Lock file plus native library SHA-256. Gate G-UI-0 decides whether it is reproducible; if not, the custom renderer is used | ADR 0002 D9, G-UI-0 |
| Signing | Ad hoc (`-`), the same 8 entitlements as the reference app | Entitlements extracted from each bundle and diffed against the recorded set; the debug-only set is removed and tested for play builds | ADR 0001 D10.6; R10 §3.2 [D] |
| Swift or Xcode | Not in v1. Only if G-REOPEN-C or G-NATIVE fires: pinned Xcode version recorded. The Mac runs a beta Xcode 27.2, which is a reproducibility risk | Recorded in the manifest even when unused | R10 §3.1 [M], Risks [I] |
| Host OS | macOS 27.2 beta | `sw_vers` build number in every manifest and run record | R10 Risks [I] |

**Entitlements to keep or test** (R10 §3.2):

| Entitlement | Play build | Debug build |
|---|---|---|
| `allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`, `hypervisor` | Keep | Keep |
| `disable-executable-page-protection` | Test removal [I] | Keep |
| `allow-dyld-environment-variables`, `debugger`, `get-task-allow` | Test removal [I] | Keep |

A removal is adopted only if a warm 900 s run in each of the three scenes shows no new crash or artefact. If it
fails, the play build keeps the full set.

---

## 4. Build recipe and provenance

### 4.1 Recipe

The fork carries one script that performs these steps. Builds run only when the owner agrees, because they compete
for CPU (ADR 0001 D10.9), and agents never start a measured run (ADR 0004).

1. **Verify the source.** Check the upstream archive or commit against its recorded SHA-256.
2. **Apply the queue.** Replay the `series` file in order with `git am`. Record each patch's stable patch id.
3. **Check the toolchain.** Confirm the SDK path and version match `global.json`, with no roll-forward.
4. **Restore.** `dotnet restore --locked-mode`. Any lock-file drift stops the build.
5. **Test.** Run `Ryujinx.Tests.Memory` and `Ryujinx.Tests.Input` (83/83 and 42/42 on the prior trees [E]), plus any
   Luma unit tests added by the queue.
6. **Publish.** `osx-arm64` single-file publish (about 48 s [E]).
7. **Bundle and sign.** Write the variant's `CFBundleIdentifier`, name and `LSSupportsGameMode` (ADR 0003 §5) into the
   plist, then sign ad hoc with the recorded entitlements.
8. **Hash.** SHA-256 of the main executable, every dylib, the plist and the entitlements blob.
9. **Write `build-manifest.json`** into the bundle folder and the fork's manifest store.

### 4.2 Build manifest

Fields of `build-manifest.json` (values here are placeholders):

```json
{
  "schema": 1,
  "variant": "measure",
  "bundle_id": "app.totkluma.ryubing.measure",
  "upstream": { "repo": "projects/Ryubing", "commit": "475615f", "archive_sha256": "<sha256>" },
  "queue": {
    "tag": "luma/475615f/q3",
    "series_sha256": "<sha256>",
    "patches": [ { "name": "0001-build-config", "patch_id": "<patch-id>" } ]
  },
  "toolchain": {
    "dotnet_sdk": "10.0.303", "dotnet_runtime": "10.0.11", "roll_forward": "disable",
    "macos_build": "<sw_vers build>", "xcode": "<version or none>"
  },
  "lock_files": { "src/Ryujinx/packages.lock.json": "<sha256>" },
  "native": {
    "moltenvk": { "package": "1.4.2-ryujinx.5", "dylib_sha256": "<sha256>" },
    "sdl3": { "package": "Ryujinx.SDL3-CS 2026.707.0", "version": "3.5.0-5403934", "dylib_sha256": "<sha256>" }
  },
  "outputs": { "executable_sha256": "<sha256>", "dylibs": { "<name>": "<sha256>" } },
  "signing": { "mode": "adhoc", "entitlements_sha256": "<sha256>", "entitlement_set": "play|debug" },
  "tests": { "Ryujinx.Tests.Memory": "pass n/n", "Ryujinx.Tests.Input": "pass n/n" },
  "built_at": "<UTC timestamp>"
}
```

Paths inside the manifest are relative to `<build-root>`, so a manifest never names a user's home folder.

### 4.3 Run record

A build manifest identifies the binary. A **run record** identifies everything else that a measurement depends on,
following the hygiene list in ADR 0004 and the protocol in ADR 0003 §6 [I]:

| Field | Why |
|---|---|
| Build manifest SHA-256 | Exact binary |
| SHA-256 of `luma.json` and `Config.json`, and the active profile name | "Same config hash" (ADR 0004) |
| Title pack manifest SHA-256 and the D2 checksum | TOTK-specific inputs loaded at runtime |
| Save backup id | Same save slot |
| Cache state C0, C1 or C2 | Steady-state claims use C2 only (ADR 0003 §6) |
| Backend and driver hash | MoltenVK or KosmicKrisp |
| Display, refresh, HDMI format, pad bus, battery | Display and input conditions (ADR 0004) |
| Power, thermal state, Metal HUD off, agent present or not | Uncontended host (ADR 0004) |

Run records and telemetry stay in the private local evidence workspace. Only aggregated, path-free numbers may be
quoted in public docs.

### 4.4 Gate G-BUILD

G-BUILD passes when a clean rebuild from a manifest reproduces the executable and dylib hashes (ADR 0001 gates).
Until it passes, no measurement is trusted.

Known risks to bit-identical output [I]:

- Compiler output can embed the source path. Rebuild in the same `<build-root>` layout, or set a path map, so the
  hash does not depend on where the folder sits.
- The manifest timestamp and any build-time version stamp must be excluded from the hashed outputs.
- Whether the ad hoc signature is byte-stable across rebuilds is not yet measured. If it is not, G-BUILD compares
  the unsigned executable plus the entitlements blob, and the manifest says so.

---

## 5. Side-by-side variants

### 5.1 Bundles and data roots

Today every build is `org.ryujinx.Ryujinx`, so variants would share defaults, saved window state and TCC decisions
[D] (R10 §3.4). Each variant therefore gets its own name, bundle id and data root (ADR 0001 D10.4).

| Variant | `CFBundleIdentifier` | Purpose | Flags on by default | Default profile |
|---|---|---|---|---|
| Official reference app | Unchanged upstream id | Untouched control, never modified (R10 §3.5) | n/a | n/a |
| `reference` | `app.totkluma.ryubing.reference` | Fork with **all flags off**: the stock-equivalent baseline for SDR identity (G-HDR-0) and A/B | None | none |
| `measure` | `app.totkluma.ryubing.measure` | Performance measurement; no agent code path (ADR 0004 "no-agent build") | Telemetry, plus the CPU profile set by G-AB | `measurement` |
| `agent` | `app.totkluma.ryubing.agent` | Background automation with owner-wins arbitration | Telemetry, input composite | `agent-background` |
| `hdr` | `app.totkluma.ryubing.hdr` | Owner play build: output stage, display helper, dashboard, later scene HDR | Phase-dependent | `macbook-xdr` or `a95l` |

Each bundle starts with `--root-data-dir <data-root>/<variant>`. Ryubing supports this option and a `portable`
folder [D] (R10 §3.4, verification). The launcher always passes the option explicitly rather than relying on a
`portable` folder, so a moved bundle cannot silently pick up another root [I].

Retention: keep the current bundle and N-1 (or N-2, owner's choice) per variant (ADR 0001 open question 8).

**Shader caches per variant.** A new build cold-starts the shader cache (about 85-88 s, about 1,017 shaders [E]).
Separate data roots also mean separate Ryujinx disk caches. Whether the system Metal cache is shared between bundle
ids is unknown [I]; the run record therefore always states C0, C1 or C2 instead of assuming a warm cache.

### 5.2 Configuration and profiles

- Ryubing's own `Config.json` is **not** edited by Luma. Luma settings live in a separate `luma.json` in each data
  root, and every Luma feature also has a CLI flag (ADR 0001 D10.3).
- A **profile** is a named section of `luma.json` (`macbook-xdr`, `a95l`, `measurement`, `agent-background`). Display
  profiles carry the calibration values of ADR 0002 (paper white, MaxTML, MaxFFTML, MinTML, UI white). The
  per-variant `Config.json` copies follow the prior pattern of named configs (`Config.FINAL-local.json`,
  `Config.AGENT-bg.json`) [M] (R10 §3.4).
- **Precedence** [I]: CLI flag, then the selected profile, then `luma.json` defaults, then off.
- Calibration values written by the dashboard are saved to a new profile revision, never over the old one, so a bad
  calibration rolls back by selecting the previous revision.

**Diffing.** Before any A/B, the two configurations are compared after canonicalising them (sorted keys, no
whitespace differences). The tool prints only changed keys. A/B runs change one variable per run (ADR 0003 §6), so
a diff that shows more than the intended key stops the run [I]. The canonical SHA-256 of each file goes into the run
record.

---

## 6. Save backups

Saves never enter any repository. They live only in data roots and in the private local evidence workspace.

**Backup manifest** (one per backup, stored next to it):

| Field | Content |
|---|---|
| `backup_id` | Timestamp plus short hash |
| `source` | Variant and data root it came from, as a relative name |
| `game_version` | 1.4.3 |
| `writer_build` | Build manifest SHA-256 of the build that last wrote the save |
| `files` | Relative path, size and SHA-256 of every file in the save folder |
| `purpose` | For example "Great Sky Island start", "Room of Awakening", "Beneath Hyrule Castle" |

**Rules:**

1. Back up before any first run of a new build, before a rebase, and before any session with the D2 patch, a
   replaced shader or a new mod.
2. Restore by copying into a variant's data root, then re-hash and compare with the manifest. A mismatch stops the
   launch.
3. Never point two variants at the same save folder. The shared-memory crash during a save load [E] (§2 row 6) shows
   that a crash can occur mid-save; only a copy limits the damage to one variant.
4. A save written by a flagged build is copied back to the owner's main play root only after the owner checks it in
   the `reference` variant.
5. Keep at least the last three backups per purpose [I].

---

## 7. Feature flags and kill switches

Flag names below are proposals [I]; the ADRs fix the behaviour, not the spelling. Every flag defaults to off.

| Feature | CLI flag (proposed) | Off means | Kill-switch behaviour | Source |
|---|---|---|---|---|
| Telemetry ring | `--luma-telemetry` | No ring, no socket | Off at any time; no state | ADR 0001 D1.4 |
| hvfix A+B | `--luma-hvfix` | Stock hypervisor path | Off returns the stock path; Hypervisor Off at 1.2x stays the default until G-AB | ADR 0001 G-AB |
| shmfix | Always on in every Luma build [I] | n/a | It is a crash fix with a regression test, proposed for upstream; roll back by bundle only | [E] §2 row 6; ADR 0001 D10.8 |
| Input composite and agent pad | `--agent-pad-socket` (existing) | SDL driver only | ESTOP by command or file (within 53 ms [E]); physical input latches ESTOP; mask drops on socket loss | ADR 0004; [E] §2 row 7 |
| SDL input patches | `--luma-input-fixes` | Stock SDL handling | Off per patch where independent | ADR 0004 |
| Output stage | `--luma-output` | Stock `B8G8R8A8Unorm` sRGB swapchain | Off returns the stock present path; an SDR-identity mode exists for G-HDR-0 | ADR 0002 D4 |
| Display helper | `--luma-display` | Layer untouched | Off leaves the layer as MoltenVK sets it | ADR 0002 D4 |
| Dashboard | Hotkey; `--luma-overlay` to load it at all | Not loaded | Hidden costs zero (G-UI-1) | ADR 0002 D9 |
| Title pack | `--luma-title-pack <path>` | No TOTK-specific data loaded | Off unloads all of the rows below | ADR 0001 D1.5 |
| D2 timing patch | Title pack entry with SHA-256 in `luma.json` | Only "30 (native)" is offered | Checksum mismatch refuses to load it | ADR 0003 §4 |
| Tonemap replacement | `--luma-scene-hdr` | Vanilla shaders | Off must serve vanilla shaders: the flag state is part of the shader cache key (G-HDR-2) [I] | ADR 0002 D3 |
| RGBA16F allow-list | `--luma-rt-upgrade` | No format upgrades | Its own switch, separate from the tonemap, because it is the highest-risk change | ADR 0002 Consequences, G-HDR-3 |
| Expanded SDR fallback | Profile setting | n/a | Always labelled as Expanded SDR | ADR 0002 D3 |
| Looks (scene and display stage) | Profile setting, neutral by default | Neutral | Per look, three strengths, removable if G-LOOK-2 fails | ADR 0006 |
| Concurrent compilation | `MVK_CONFIG_SHOULD_MAXIMIZE_CONCURRENT_COMPILATION=1` in the launcher | Upstream default 0 | Remove from the launcher environment | ADR 0001 D2.2; R05 |
| KosmicKrisp | Separate variant, driver chosen by `VK_DRIVER_FILES` | MoltenVK | Launch the MoltenVK bundle | ADR 0001 D2.4 |
| Adaptive triggers and haptics (P5) | Per-track flag | Off | Trigger effects reset on exit and on ESTOP, since "effects stuck after a crash" is a named risk | ADR 0004 |

A **global master switch** (`--luma-off`) that forces every flag above to off is proposed as a convenience for the
first rollback step [I]. It must produce the same behaviour as the `reference` variant.

---

## 8. Rollback procedures by layer

The ladder from ADR 0001 D10.7 is: flag off; then the previous bundle; then rebuild the previous tag (about a minute
with a warm NuGet cache [I], from the 48 s publish [E]); then delete the build folder. No step changes the system [E].
The table applies that ladder to each layer.

| Layer | Symptom | Step 1 | Step 2 | Step 3 | Verify |
|---|---|---|---|---|---|
| **Config and profile** | Wrong look, bad calibration, wrong cap | Select the previous profile revision | Restore `luma.json` from its last good copy (canonical hash in the last good run record) | Delete `luma.json`; all Luma flags fall back to off | Canonical diff against the last good file is empty |
| **Runtime feature** | Artefacts, crash, pacing regression | Turn that feature's flag off | `--luma-off` | Launch the `reference` variant | Same scene and save, warm cache, problem gone |
| **Mod and title pack** | Boot failure, speed error, shader mismatch | Unset `--luma-title-pack`, or disable the mod in Ryubing's mod manager | Restore the previous title pack revision by its manifest hash | Remove owner-installed mods (for example Serfrost) from that variant's data root | Title pack hash in the run record matches the intended revision; D2 removed shows "30 (native)" only |
| **Build** | Regression not tied to one flag | Launch the previous bundle (N-1) | Rebuild from the previous queue tag and check G-BUILD hashes | Delete `<build-root>` (complete undo) | Executable hash matches the manifest; cold cache rebuild (85-88 s [E]) is expected |
| **Backend** | MoltenVK A/B or KosmicKrisp regression | Launch the `1.4.2-ryujinx.5` bundle | Remove `VK_DRIVER_FILES` and the alternative driver from the launcher | Rebuild without the alternative package | Driver hash in the run record |
| **Data (saves)** | Corrupt or unexpected save | Stop the variant | Restore the latest backup that passes its manifest check | Restore an older backup | Re-hash matches; save loads in `reference` |
| **Data (shader caches)** | Stale or mixed shaders after a flag or build change | Delete that variant's Ryujinx shader cache | Recreate the variant's data root from scratch, then restore saves | n/a | Next run recorded as C0 |
| **Display settings** | TV left in calibration state | Restore the A95L picture settings recorded before the session (TV HDR Tone Mapping is Off only during calibration, ADR 0002) | Re-select the Mac's previous display mode | n/a | Settings record matches |
| **Upstream sync** | New base worse than old | Keep using the bundles of the previous tag; they are never overwritten | Abandon the sync branch | n/a | Previous tag still builds to its manifest hashes |

**Rollback drill** is an exit condition of P0 (ADR 0001 gates): each ladder step is performed once and verified.
Section 12 gives the drill.

---

## 9. Rebasing onto upstream

Upstream syncs happen on demand, not per canary (ADR 0001 D1.1). Upstream has been quiet since 2026-08-26
[D] (R10 Summary). A sync is estimated at 0.5-2 days now and 2-5 days once presenter and texture patches touch
`Window.cs` and `Gpu/Image` [I] (R10 §2A).

### 9.1 Queue layout

Fixed order from ADR 0001 D10.2:

1. build config
2. shmfix
3. hvfix A+B
4. telemetry
5. input composite
6. output stage
7. display helper
8. shader registry
9. RT allow-list mechanism

ADR 0001 does not place the later patches of ADRs 0003 and 0004 (cap policy, timed presents, display-locked vsync,
host LFC, SDL input fixes, title pack loader, looks hooks). This page proposes appending them after entry 9 in phase
order, so earlier, lower-churn entries stay stable [I]. See "Inconsistencies noted" at the end.

One commit per concern. The `series` file lists the patches in order. Each synced queue is tagged
`luma/<upstream-short-commit>/qN`; at the current base that is `luma/475615f/qN` (ADR 0001 D10.2).

### 9.2 Procedure

1. **Decide.** Sync only for a needed upstream fix, an accepted Luma upstream patch, or a security reason. Check the
   owner's per-sync budget (ADR 0001 kill criterion).
2. **Back up.** Back up saves (section 6). Keep all current bundles.
3. **Verify the new base.** Record the new commit and the SHA-256 of its official archive.
4. **Replay.** `rebase.sh` applies the `series` on the new base on a sync branch. Patches accepted upstream (for
   example shmfix or the `contentsScale` fix, ADR 0001 D10.8) are dropped from the series, and their tests must
   still pass on upstream code.
5. **Resolve conflicts** patch by patch. Expect conflicts in `HvExecutionContext.cs` and UI files that churn upstream
   (R10 §2A).
6. **Test.** `Ryujinx.Tests.Memory` and `Ryujinx.Tests.Input` must pass, plus the Luma unit tests.
7. **Build `reference` with all flags off** and confirm it boots to the title screen and loads a restored save.
8. **SDR identity.** Once the output stage exists, re-run G-HDR-0 (±1 code value against stock) on the new base.
9. **Title pack check** (P3 onward). Confirm the guest hashes still match, replacement shaders still compile, and
   G-HDR-2 coverage holds. Guest `Hash128` keys are host-independent [D] (ADR 0002 D3), so they should survive a
   rebase unless upstream changes the hashing [I].
10. **Short performance check.** Warm C2 runs in the three scenes (Great Sky Island, Beneath Hyrule Castle, Room of
    Awakening) with the ADR 0003 protocol, compared with the previous tag. A regression in p99 or game speed blocks
    the new tag. This is a short check, not a long benchmark.
11. **Tag and manifest.** Tag `luma/<new-base>/q1`, write manifests, and confirm G-BUILD on one rebuild.
12. **Record the cost** in days against the owner's budget. If two syncs in a row exceed it, the fork approach is
    re-evaluated (ADR 0001 kill criterion).

---

## 10. What must never enter the public repository

The public repository holds specs, schemas and the simulated demo only (ADR 0001 D10.1; AGENTS.md).

| Never commit | Where it lives instead |
|---|---|
| Game images, firmware, keys (`prod.keys`, `title.keys`), extracted game files | Owner's own storage |
| Saves and save backups | Data roots and the private workspace |
| Shader caches, shader dumps, GPU traces, frame dumps, captures, screenshots and video of the game | Private workspace (ADR 0001 D10.1) |
| The D2 patch, its offsets or bytes | Title pack; the public repo documents behaviour and a checksum *field* only (ADR 0003 §4) |
| Guest shader hash tables, TOTK replacement shaders, the RT allow-list, game-state hooks | Title pack (ADR 0001 D1.5) |
| Third-party mod payloads (for example Serfrost Base Defogger, CC BY-NC-ND) | Installed by the owner only, never bundled (ADR 0006) |
| GPL, ND or NC code | Ideas only (ADR 0006) |
| Built binaries and app bundles | Build folder; any publishing is an owner decision (ADR 0001 open question 2) |
| Build manifests and run records with real hashes or machine details | Fork and private workspace |
| Absolute home paths, usernames, email addresses, serial numbers, raw EDID dumps (they contain serials) | Nowhere public; EDID findings are quoted as decoded, non-identifying fields only |
| Credentials, tokens, TCC data | Nowhere |

**Pre-commit check (proposed [I]).** Before any commit to this repository, scan the staged files for: absolute
home-folder paths, email addresses, long hexadecimal strings that look like offsets or hashes of private files,
and the binary file types blocked by `.gitignore`. A hit stops the commit until a person reviews it.

---

## 11. Reproducibility checklist

Use before trusting any measurement, and after every rebase.

**Toolchain and inputs**

- [ ] Upstream archive SHA-256 matches the record.
- [ ] `global.json` pins `10.0.303` with `rollForward: disable`, and the SDK used is the isolated one.
- [ ] `dotnet restore --locked-mode` succeeds with no lock-file change.
- [ ] MoltenVK, SDL and (if present) ImGui native library hashes match the manifest.
- [ ] macOS build and any Xcode version are recorded.

**Build**

- [ ] `series` hash and every patch id match the queue tag.
- [ ] `Ryujinx.Tests.Memory` and `Ryujinx.Tests.Input` pass.
- [ ] Bundle id, name and data root are those of the intended variant.
- [ ] Entitlements match the recorded play or debug set.
- [ ] G-BUILD: a second clean build reproduces the executable and dylib hashes.

**Run**

- [ ] The launcher refuses an executable not in a manifest.
- [ ] `luma.json` and `Config.json` canonical hashes are recorded; the diff against the comparison run shows only
      the intended variable.
- [ ] Title pack and D2 checksums match.
- [ ] The save was restored from a manifest-checked backup.
- [ ] Cache state (C0, C1, C2) is recorded; steady-state claims use C2 only.
- [ ] Host is uncontended: no build running, Metal HUD off, agent absent for strict comparisons, USB pad bus, power
      and thermal state recorded (ADR 0004).

**Repository hygiene**

- [ ] Nothing from section 10 is staged in the public repository.

---

## 12. Restore drill

Run once in P0 (ADR 0001 rollback-drill gate), then after every rebase. Total effort about half a day attended [I].
Each step is timed and its result written to the private workspace.

| # | Scenario | Action | Pass condition |
|---|---|---|---|
| 1 | A flag causes a fault | Turn on one harmless flag (for example telemetry), confirm it is active, turn it off | Behaviour and canonical config match the run before |
| 2 | Master switch | Launch `measure` with `--luma-off` | Behaviour matches `reference`; dashboard and Luma sockets absent |
| 3 | Bad bundle | Pretend the current `measure` bundle is broken; launch N-1 | N-1 launches by hash, loads its own data root, no shared state |
| 4 | Bad build | Rebuild the previous queue tag from its manifest | Hashes match the old manifest (G-BUILD); time recorded, plus the cold shader rebuild |
| 5 | Wrong launch | Try to launch an executable whose hash is not in any manifest | Launcher refuses |
| 6 | Lost save | Delete a test save in a scratch variant; restore from backup | Manifest re-hash matches; the save loads in `reference` |
| 7 | Config damage | Corrupt `luma.json` in a scratch data root | Luma refuses the file and falls back to all-off; the previous revision restores it |
| 8 | Title pack | Change one byte of a copy of the D2 file | Checksum mismatch refuses it; only "30 (native)" is offered |
| 9 | Agent stop | With the `agent` variant, issue ESTOP by command and by file | Pad goes neutral (53 ms measured before [E]); game keeps running |
| 10 | Full undo | On a copy, delete the build folder | Official reference app and other folders unaffected; no system setting changed |

If any step fails, fix the ladder before P1 work starts (ADR 0001 gates).

---

## 13. Effort

| Item | Estimate [I] | Source |
|---|---|---|
| Fork hygiene: pinning, lock files, manifest, bundle ids, data roots, launch by hash, `rebase.sh` | 1-2 person-weeks | R10 phase 0; ADR 0001 effort table |
| Save manifest tool, config canonical diff, run record | Within the above [I] | This page |
| Restore drill | About half a day attended | This page [I] |
| Each upstream sync | 0.5-2 days now, 2-5 days after P3 | R10 §2A |

---

## 14. Owner decisions this page depends on

All are already listed in the ADRs; this page adds no new decision.

- Fork location and visibility; whether binaries are ever published; local builds or free public CI (ADR 0001 Q2).
- Variant set and retention (N-1 or N-2), and the bundle identifier scheme (ADR 0001 Q8, Q9).
- The per-sync budget used by the fork kill criterion (ADR 0001 Q9).
- Approval of the private title pack and of D2 as an owner-supplied file in it (ADR 0001 D1.5, ADR 0003 Q1).
- Any KosmicKrisp driver acquisition (ADR 0001 Q5).

---

## Inconsistencies noted

These were found while writing this page. The ADRs were not edited.

1. **Queue order is incomplete.** ADR 0001 D10.2 fixes nine queue entries but does not place the pacing patches of
   ADR 0003 (cap policy, timed presents, display-locked vsync, host LFC, the `LSSupportsGameMode` plist key), the SDL
   input patches of ADR 0004, the title pack loader, or the looks hooks of ADR 0006. Section 9.1 proposes appending
   them in phase order.
2. **Tag names fix the base.** ADR 0001 tags every synced queue `luma/475615f/qN`, but a sync changes the base. This
   page uses `luma/<upstream-short-commit>/qN`.
3. **"Reference" has two meanings.** R10 §3.5 keeps the original reference app untouched, while ADR 0001 D10.4 also
   names a `reference` variant with a Luma bundle id. This page keeps both: the untouched official app and an
   all-flags-off fork build.
4. **"About a minute" is build time, not time to a usable state.** The rollback rebuild in ADR 0001 D10.7 excludes the
   85-88 s cold shader rebuild that every new build triggers [E].
