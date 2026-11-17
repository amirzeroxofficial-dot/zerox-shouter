# ZEROX // BODYCAM

A web-based tactical body-mounted camera first-person shooter built with **Three.js**, **WebGL2 Post-Processing**, and a **Procedural Web Audio Acoustic Engine**.

## Features

- **Authentic Bodycam Optics & Kinematics**
  - Wide-angle barrel fisheye lens distortion, radial chromatic aberration, CMOS low-light sensor grain, dynamic exposure adaptation, and impact shock blur.
  - Chest/shoulder-mounted perspective with organic breathing, stride-synced footstep dips, strafe/turn roll inertia, free-aim weapon lag, and wall-safe corner leaning (`Q` / `E`).
- **Detailed Tactical Weapons & Multi-Stage Visual Reloads**
  - **MK18 MOD 1 (5.56×45mm)** with EOTech EXPS3 parallax holographic reticle, PEQ-15 visible laser & target dot, tactical shadow-casting flashlight, reciprocating bolt carrier group (locks back on empty), and charging handle.
  - **G19 Tactical (9×19mm)** with reciprocating slide (locks back on empty) and Trijicon RMR mini red dot.
  - Separate **Tactical Reload** (chambered `+1` preserved, baseplate slap) and **Dry Bolt-Lock Reload** (empty mag physically drops & clatters on concrete, fresh mag with visible brass rounds seats, bolt release slap).
  - Canted **PEQ-15 Laser Point-Shooting** (`X` / Middle Mouse) and **Weapon Inspection** (`G`).
- **Procedural 3D Warehouse Map ("Sector 07") & PBR Materials**
  - Procedurally generated 512×512 Albedo, Sobel Normal, and Roughness maps for wet puddle-reflective concrete floors, weathered concrete walls, hazard stripes, corrugated steel containers, wood crates, and brushed gunmetal.
  - Volumetric skylight cones, drifting dust motes, flickering fluorescent tube in the dark storage wing, emergency beacons, and a walkable mezzanine catwalk with ramps.
- **Procedural Web Audio Acoustics & Spatial 3D SFX**
  - Synthesized concrete warehouse impulse response (`ConvolverNode`), 5-layer gunshot acoustics, HRTF spatialized enemy gunfire & footsteps, supersonic bullet whiz/crack near misses, brass casing floor clinks, multi-stage reload foley, radio dispatch squelch, and damage tinnitus/suppression filtering.
- **Realistic Breach Spawning & Tactical AI**
  - Occluded doorway breach director checks line-of-sight and frustum visibility before spawning staggered fireteams from physical breach bays with metallic door breach cues and emergency beacon alerts.
  - Articulated tactical operators take cover, peek with telegraphed aiming lasers, flank, react to suppression, and collapse directionally when neutralized.

## Controls

| Key | Action |
|---|---|
| `W A S D` | Move / Tactical Strafe |
| `Shift` | Low-Ready Sprint |
| `C` / `Ctrl` | Crouch |
| `Q` / `E` | Lean Left / Right |
| `Mouse` | Aim (`PointerLock` + unlocked hover/edge fallback) |
| `LMB` | Fire |
| `RMB` / `V` | Aim Down Holographic Sight (ADS) |
| `X` / `MMB` | Canted PEQ-15 Laser Point-Shoot / Toggle Laser |
| `R` | Tactical / Dry Reload |
| `B` | Fire Selector (`AUTO` / `SEMI`) |
| `F` | Toggle Weapon Flashlight |
| `G` | Inspect Weapon |
| `1` / `2` / `Wheel` | Switch MK18 / G19 |
| `P` / `Esc` | Pause / Calibration |

## Running Locally

```bash
npm install
npm run dev
```
