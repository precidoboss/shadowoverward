# 📼 SHADOW OVER WARD B: The St. Jude Incident

A first-person & third-person 3D horror mystery found-footage game built with Three.js, Web Audio API, and custom GLSL/Canvas VHS post-processing shaders.

## 🕹️ How to Play

Open your web browser and navigate to:
```
http://localhost:5173/
```

### 🎮 Controls
- **W, A, S, D**: Move Investigator
- **Mouse**: Look / Pan camcorder (click anywhere to capture mouse lock)
- **Right Click**: **4.0X Optical Camcorder Zoom** (with camera motor audio & focus)
- **N**: **Toggle Infrared Night Vision Mode** (enhances dark visibility with phosphor green IR grade)
- **V**: **Toggle 1st Person / 3rd Person View** (switch perspectives to see your upgraded 3D character!)
- **M**: **Open Sanatorium Facility Blueprint Map** (view all rooms & live `YOU ARE HERE` marker!)
- **F**: Toggle Flashlight on/off
- **Shift**: Sprint (drains Stamina bar, heavy footstep noise)
- **C / Ctrl**: Crouch (quieter movement)
- **Space**: Jump
- **E**: Interact (pick up VHS tapes, keys, batteries, open doors, inspect documents, operate keypad safe)
- **Tab / I**: Open Satchel / Inventory & VCR Tape Viewer
- **ESC**: Pause Menu / Close open documents & keypad

---

## 🧭 Live Objective Guidance & Navigation
- **HUD Waypoint Beacon**: A live compass beacon at the top of your screen indicates your current target room and exact distance in meters (e.g. `[◆ TARGET: WARD A (ROOM 101) - 14m away]`).
- **Sanatorium Blueprint Map (`M` Key)**: Displays the architectural layout of the facility:
  - **Reception Lobby & Waiting Room**: Starting entrance & Ward A Key.
  - **Central Hallway**: Blood footprint trail connecting all wings.
  - **Ward A (Medical & ECT)**: Tape 01 & Ward B Keycard.
  - **Archives & Dr. Holloway's Office**: Wall Safe (`1974`), VCR / TV Station, and Morgue Key.
  - **Ward B (Quarantine Wing)**: Tape 02 & High-Voltage Fuse.
  - **Sub-Level (Morgue & Generator)**: Autopsy Lab (Tape 04), Generator Breaker Box, and Emergency Fire Exit.

---

## 🏚️ Synopsis & Objectives
You are an investigative journalist breaking into the abandoned **St. Jude's Psychiatric Facility** on Halloween night, October 31, 1997. Decades ago, the facility was abruptly quarantined and wiped from public records after a catastrophic breach involving **Subject 407**. 

Your goal is to recover **4 missing VHS tapes**, piece together the mystery, and escape through the basement fire exit before you are consumed.

### 📼 The 4 Lost VHS Tapes:
1. **Tape 01: "First Contact" (Oct 12, 1997)** — Medical examination room (Ward A). Reveals the initial containment and light sensitivity of Subject 407.
2. **Tape 02: "The Transformation" (Oct 18, 1997)** — Quarantine cell (Ward B). Contains the panicked recording of Subject 407 mutating and breaking containment.
3. **Tape 03: "Containment Breach" (Oct 24, 1997)** — Locked inside the Wall Safe in Dr. Holloway's Office (combination: `1974`). Reveals the emergency fire exit lockdown and gives the Morgue Key.
4. **Tape 04: "The Final Log" (Oct 31, 1997)** — Autopsy slab in the basement Morgue. The horrifying final moments of Dr. Holloway and instructions to restore generator power.

### 🧩 Puzzles & Progression:
- **Lobby**: Search behind the reception desk for the **Ward A Key** and memo note.
- **Ward A (Room 101 & 102)**: Recover **Tape 01**, the **Ward B Keycard**, and the first half of the safe combination clue ("19").
- **Dr. Holloway's Office**: Wall Safe combination keypad puzzle (`1974`). Inside lies **Tape 03** and the **Morgue / Basement Key**.
- **Ward B (Quarantine Wing)**: Recover **Tape 02** and the **High-Voltage Fuse**.
- **Basement & Morgue**: Unlock the heavy iron security gate, install the High-Voltage Fuse into the breaker box to restore auxiliary power, recover **Tape 04**, and make a break for the Emergency Fire Exit!
- **VCR Player**: Walk up to the CRT TV / VCR cart in the Doctor's Office (or press `Tab` in your inventory) to play any recovered tape with animated found-footage visual noise and procedural voice audio logs.

---

## ⚠️ Survival Guide
- **Subject 407** awakens after you retrieve Tape 01. It actively patrols the dark corridors and rooms.
- **Hearing**: Running sprints will alert the entity from far away. Walk or crouch when you hear groaning pipes or heavy breathing.
- **Sight**: Your flashlight illuminates dark corners, but direct beam contact alerts the entity.
- **Proximity Alerts**: When Subject 407 is near, your camcorder tracking error bars jitter frantically, your flashlight flickers, and your heartbeat accelerates. Turn off your light and hide!

---

## 🆕 Version 2.0 Changes

### Bug fixes
- **Tape 03 and the Morgue Key could never be picked up.** They were added to the scene but not to the interaction list, so the basement fire exit could never be reached. They are now interactable once the safe is opened.
- **Restarting did not restore the world.** Tapes, keys, batteries, the fuse, the safe, the generator and Subject 407 now reset properly.
- **Subject 407 turned the wrong way.** Its heading now uses the shortest path, so it no longer spins the long way round.

### Performance
- About 25 per-prop point lights replaced with additive glow sprites. Lights are now one of the main costs in a Three.js scene, since every lit surface pays for each one.
- Static walls merged into a few draw calls.
- Shadow maps refreshed on a cadence and only when something that casts shadows is moving. The moon shadow covers the playable area at higher resolution, and the surgical lamp no longer casts a shadow.
- Interaction raycast throttled to about 12 Hz and ignores hidden items.
- Per-frame allocations removed from the player, entity, and collision code.
- Adaptive resolution: the render scale steps down when frames run slow and recovers when there is headroom.
- HUD updates capped at 20 Hz, and the interaction prompt only touches the DOM when its text changes.
- The VHS vignette gradient is cached.
- Three.js is split into its own build chunk for better browser caching.

### Environment
- Textures use real-world scale on every wall and floor, so brick, tile, and wood no longer stretch across large surfaces.
- Ceiling fluorescent fixtures that stutter, plus overhead rusted pipe runs.
- Blood streaks on corridor walls, a fire extinguisher, and wall signs in reception.
- Reception chairs, office filing cabinets, a bookshelf with books, a wheelchair and overturned chair in Ward B, an IV stand in Ward A, a body-drawer bank and puddles in the basement.
- Lights stutter around a base level rather than permanently dropping, as before.

### Investigator
- A fully articulated figure: hips, spine, elbows, knees and hands.
- Long coat with flared tails, turned-up collar, scarf, lapels, belt and brass buckle, radio pouch, satchel strap, and a press credential on a lanyard.
- A face with eyes, brows, nose and mouth, plus hair with a fringe.
- Walk cycle with arm swing and hip sway, sprint lean, and a crouch that drops the hips and folds the knees.
- The camcorder is held forward at chest height, and the left wrist carries a luminous watch.

### Subject 407
- Gaunt, with a visible rib cage and a knuckled spine.
- Long four-fingered hands, a jaw that opens while chasing, and glowing eyes that pulse.
- Gown strips that flutter in motion.
- Dormant pose with a slow twitch, a hunched stalk, and a chase posture that lunges forward and drops low.
- Mist particles use soft sprites instead of hard points.
