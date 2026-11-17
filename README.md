# ZEROX // BODYCAM

A web-based tactical body-mounted camera first-person shooter built with **Three.js**, **WebGL2 Post-Processing**, and a **Procedural Web Audio Acoustic Engine**.

## Features

- **Authentic Bodycam Optics & High-DPI Kinematics**
  - WebGL2 4x MSAA Half-Float `EffectComposer` target + CAS-style unsharp micro-sharpening (`BodycamPostFX`), diagonal-normalized wide-angle barrel lens distortion across ultra-wide and portrait screens, chromatic aberration, CMOS low-light sensor grain, and impact shock blur.
  - Up to `2.0x` Retina/AMOLED high-DPI scaling (`Ultra Max` mode) with 16x anisotropic filtering for wet concrete puddles and brushed gunmetal.
  - Chest/shoulder-mounted perspective with organic breathing, stride-synced footstep dips, strafe/turn roll inertia, free-aim weapon lag, and wall-safe corner leaning (`Q` / `E`).
- **Mobile Touch Dual-Stick Controls & Native Fullscreen**
  - Dynamic floating left analog stick with edge-push **Sprint** threshold, isolated right camera swipe zone, and **Aim-While-Firing** drag support on the main `FIRE` button (plus secondary left `FIRE` button).
  - Ergonomic right-thumb combat cluster (`FIRE`, `ADS`, `RLD`, `CANT`, `CROUCH`, `JUMP`), lean toggles (`< Q` / `E >`), top-right utility strip (`SWAP G19/MK18`, `AUTO/SEMI`, `LIGHT`, `INSP`), Screen Wake Lock, and tactical haptic feedback (`navigator.vibrate`).
  - One-tap **Fullscreen + Landscape Lock** (`FULLSCREEN DEPLOY`, quick HUD `FULL`, portrait-to-landscape advisory banner, and iOS/Android safe-area insets).
- **Detailed Tactical Weapons & Multi-Stage Visual Reloads**
  - **MK18 MOD 1 (5.56×45mm)** with EOTech EXPS3 parallax holographic reticle, PEQ-15 visible laser & target dot, tactical shadow-casting flashlight, reciprocating bolt carrier group (locks back on empty), and charging handle.
  - **G19 Tactical (9×19mm)** with reciprocating slide (locks back on empty) and Trijicon RMR mini red dot.
  - Separate **Tactical Reload** (chambered `+1` preserved, baseplate slap) and **Dry Bolt-Lock Reload** (empty mag physically drops & clatters on concrete, fresh mag with visible brass rounds seats, bolt release slap).
  - Canted **PEQ-15 Laser Point-Shooting** (`X` / Middle Mouse / `CANT`) and **Weapon Inspection** (`G` / `INSP`).
- **Procedural 3D Warehouse Map ("Sector 07") & PBR Materials**
  - Procedurally generated 512×512 Albedo, Sobel Normal, and Roughness maps for wet puddle-reflective concrete floors, weathered concrete walls, hazard stripes, corrugated steel containers, wood crates, and brushed gunmetal.
  - Volumetric skylight cones, drifting dust motes, flickering fluorescent tube in the dark storage wing, emergency beacons, and a walkable mezzanine catwalk with ramps.
- **Procedural Web Audio Acoustics & Spatial 3D SFX**
  - Synthesized concrete warehouse impulse response (`ConvolverNode`), 5-layer gunshot acoustics, HRTF spatialized enemy gunfire & footsteps, supersonic bullet whiz/crack near misses, brass casing floor clinks, multi-stage reload foley, radio dispatch squelch, and damage tinnitus/suppression filtering.
- **Realistic Breach Spawning & Tactical AI**
  - Occluded doorway breach director checks line-of-sight and frustum visibility before spawning staggered fireteams from physical breach bays with metallic door breach cues and emergency beacon alerts.
  - Articulated tactical operators take cover, peek with telegraphed aiming lasers, flank, react to suppression, and collapse directionally when neutralized.

## Controls

| Action | Desktop | Mobile Touch |
|---|---|---|
| Move / Sprint | `W A S D` + `Shift` | Left Floating Analog Stick (push top edge to Sprint) |
| Look / Aim | `Mouse` (`PointerLock` / Drag) | Right Swipe Zone / Drag `FIRE` Button |
| Fire | `LMB` | Right `FIRE` (aim-drag) or Left `FIRE` |
| Aim Down Sight (ADS) | `RMB` / `V` | `ADS` Toggle Button |
| Canted PEQ-15 Point-Shoot | `X` / `MMB` | `CANT` Toggle Button |
| Crouch / Jump | `C` / `Ctrl` / `Space` | `CROUCH` / `JUMP` |
| Lean Left / Right | `Q` / `E` | `< Q` / `E >` |
| Reload | `R` | `RLD` |
| Switch Weapon / Fire Mode | `1` / `2` / `Wheel` & `B` | `SWAP G19/MK18` & `AUTO/SEMI` |
| Flashlight / Inspect | `F` / `G` | `LIGHT` / `INSP` |
| Fullscreen / Pause | `FULL` / `P` / `Esc` | `FULL` / `II MENU` |

## Running Locally & Mobile Testing

```bash
npm install
npm run dev -- --host
```

Open the local network URL on your phone's browser and tap **`FULLSCREEN DEPLOY`** for full-screen landscape play.
