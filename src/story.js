// Narrative and Objectives Engine for Lost Footage
import { soundEngine } from './audio.js';

export const TAPES_DATABASE = {
  1: {
    id: 1,
    title: 'Tape 01: First Contact',
    date: 'OCT 12 1997 - 23:42:10',
    location: 'WARD A - MEDICAL EXAM',
    transcript: [
      { text: "[TAPE HISS - MICROPHONE CRACKLE]", duration: 1500 },
      { text: "DR. HOLLOWAY: 'Audio Log 01. Subject 407 intake. The patient was recovered from the abandoned salt shafts.'", duration: 4000 },
      { text: "DR. HOLLOWAY: 'Vital signs fluctuate erratically. Tissue samples display total cellular reconfiguration.'", duration: 4200 },
      { text: "[DISTANT UNNATURAL METALLIC SCRATCHING]", duration: 2500 },
      { text: "DR. HOLLOWAY: 'It exhibits an extreme aversion to direct halogen light... and an acute awareness of sound.'", duration: 4000 },
      { text: "DR. HOLLOWAY: 'I am securing Ward B. Keycard left on the ECT desk. If you hear whispers in the dark... freeze.'", duration: 4500 }
    ],
    audioPlan: [
      { delay: 1500, pitch: 105, formant: 580, duration: 3.8 },
      { delay: 5600, pitch: 102, formant: 610, duration: 4.0 },
      { delay: 12200, pitch: 98, formant: 560, duration: 3.9 },
      { delay: 16300, pitch: 92, formant: 520, duration: 4.2 }
    ]
  },
  2: {
    id: 2,
    title: 'Tape 02: The Transformation',
    date: 'OCT 18 1997 - 03:15:48',
    location: 'WARD B - QUARANTINE',
    transcript: [
      { text: "[TAPE SPEED WARP - ERRATIC STATIC]", duration: 1500 },
      { text: "ORDERLY: 'Doctor, look at the observation monitor! His limbs... they are elongating!'", duration: 3500 },
      { text: "DR. HOLLOWAY: 'Sedate him! Maximum dose through the pneumatic injector now!'", duration: 3500 },
      { text: "[HIGH PITCHED METALLIC TEARING & ROAR]", duration: 2800 },
      { text: "ORDERLY: 'The glass is spiderwebbing! It's mimicking our breathing!'", duration: 3500 },
      { text: "DR. HOLLOWAY: 'The main power tripped! We need the backup fuse from the quarantine desk to restart the generator!'", duration: 4500 }
    ],
    audioPlan: [
      { delay: 1500, pitch: 160, formant: 750, duration: 3.2 },
      { delay: 5100, pitch: 105, formant: 580, duration: 3.3 },
      { delay: 11500, pitch: 155, formant: 720, duration: 3.2 },
      { delay: 15100, pitch: 100, formant: 560, duration: 4.2 }
    ]
  },
  3: {
    id: 3,
    title: 'Tape 03: Containment Breach',
    date: 'OCT 24 1997 - 01:04:19',
    location: 'ARCHIVES VAULT',
    transcript: [
      { text: "[EMERGENCY KLAXON BLARING IN REVERSE]", duration: 1800 },
      { text: "DR. HOLLOWAY: 'Mayday to anyone monitoring this channel! Subject 407 has breached Ward B.'", duration: 4000 },
      { text: "DR. HOLLOWAY: 'All security personnel are down. The facility is under full biological lockdown.'", duration: 4000 },
      { text: "[WET SLOW FOOTSTEPS ECHOING ON TILES]", duration: 3000 },
      { text: "DR. HOLLOWAY: 'I locked the morgue key inside this office safe. The code is the year the vault was sealed: 1 9 7 4.'", duration: 4800 },
      { text: "DR. HOLLOWAY: 'God forgive us for what we unearthed... it is outside my door.'", duration: 4200 }
    ],
    audioPlan: [
      { delay: 1800, pitch: 110, formant: 620, duration: 3.8 },
      { delay: 5900, pitch: 106, formant: 600, duration: 3.8 },
      { delay: 12800, pitch: 98, formant: 570, duration: 4.5 },
      { delay: 17400, pitch: 88, formant: 500, duration: 3.9 }
    ]
  },
  4: {
    id: 4,
    title: 'Tape 04: The Final Log',
    date: 'OCT 31 1997 - 04:59:00',
    location: 'MORGUE SUB-LEVEL 2',
    transcript: [
      { text: "[GUTTURAL REVERBERATING STATIC]", duration: 2000 },
      { text: "DR. HOLLOWAY (WHISPERING): 'My flashlight... dead. I am hiding beneath the autopsy table.'", duration: 4200 },
      { text: "DR. HOLLOWAY: 'It doesn't kill for hunger. It absorbs the faces, the voices.'", duration: 4000 },
      { text: "[HEAVY RHYTHMIC BREATHING RIGHT NEXT TO MIC]", duration: 3200 },
      { text: "DR. HOLLOWAY: 'The fire exit in the basement is the only way out. Put the fuse in the generator... and RUN.'", duration: 4800 },
      { text: "DR. HOLLOWAY: 'DON'T LOOK BACK. IT'S STANDING RIGHT OVER ME--'", duration: 3500 },
      { text: "[SUDDEN SIGNAL CORRUPTION & SCREAM]", duration: 2500 }
    ],
    audioPlan: [
      { delay: 2000, pitch: 85, formant: 490, duration: 4.0 },
      { delay: 6300, pitch: 82, formant: 470, duration: 3.8 },
      { delay: 13400, pitch: 95, formant: 580, duration: 4.5 },
      { delay: 18000, pitch: 130, formant: 800, duration: 3.0 }
    ]
  }
};

// Quick run: the last tape of the lost footage. Each step has a short objective and a line from the recording.
export const QUICK_INTRO = [
  '● REC  TAPE 4 OF 4\nOCT 31 1997  WARD B BASEMENT',
  'THE CAMERAMAN\'S LAST RECORDING.\nHE NEVER CAME BACK UP.',
  'YOU ARE HIM NOW. FIND A WAY OUT.\nFOLLOW THE ARROW AT THE TOP OF THE SCREEN.'
];

// The quick run, in the order the story is played. Each step has its tutorial line (how to do it) and a
// short log line from the recording. The checklist on screen shows the same steps.
const QUICK_OBJECTIVES = [
  { text: 'Take the rifle from the table beside the skelevision [E]  (or punch: left-click)',
    tutorial: 'Walk to the entrance table. Press E on the rifle, or fight with your fists.',
    log: 'FOOTAGE: HE DROPPED THE RIFLE RUNNING.',
    target: { x: -3.65, z: -6.62 }, locationName: 'ENTRANCE TABLE' },
  { text: 'Kill the two infected staff in the west halls',
    tutorial: 'Shoot (left-click) or punch them. Both must go down before the next step.',
    log: 'FOOTAGE: THEY WERE STAFF ONCE.\nTHEIR BADGES ARE STILL ON.',
    target: { x: -8.0, z: -2.1 }, locationName: 'WEST HALLS' },
  { text: 'Go to the bedroom safe and roll the code 0 - 4 - 0 - 7 [E]',
    tutorial: 'The code is on the skelevision by the entrance. At the safe: drag the dial or use the arrow keys, then LOCK each digit.',
    log: 'FOOTAGE: THE SKELEVISION BY THE ENTRANCE SHOWED THE CODE.\nTHE SAFE IS IN THE BEDROOM. THE SHEETS ARE STILL WARM.',
    target: { x: -14.4, z: 4.6 }, locationName: 'BEDROOM SAFE' },
  { text: 'Put the high-voltage fuse in the generator [E]',
    tutorial: 'The fuse is inside the safe. Take it, then go to the generator in the south room and press E.',
    log: 'FOOTAGE: POWER BACK ON SOUTH.\nSOMETHING IS WATCHING THE LIGHTS.',
    target: { x: -5.85, z: 7.5 }, locationName: 'GENERATOR' },
  { text: 'Kill Shadow 47, then walk through the portal',
    tutorial: 'Shadow 47 is awake now. Keep your distance, shoot it down, then the airlock opens into a portal. Walk into it.',
    log: 'FOOTAGE: THE TAPE ENDS HERE.\nMAKE YOURS END DIFFERENTLY.',
    target: { x: -3.9, z: 8.3 }, locationName: 'PORTAL' }
];

export class StoryManager {
  constructor(ui) {
    this.ui = ui;
    this.currentObjectiveIndex = 0;
    this.objectives = [
      { text: 'Find the Ward A key in the reception lobby', target: { x: 4.2, z: 15.8 }, locationName: 'RECEPTION DESK' },
      { text: 'Open Ward A and take Tape 01 from Room 101', target: { x: -11.5, z: 6.5 }, locationName: 'WARD A (ROOM 101)' },
      { text: 'Take the Ward B keycard and the safe code from Room 102', target: { x: -11.0, z: -6.5 }, locationName: 'WARD A (ROOM 102)' },
      { text: "Open the safe in Dr. Holloway's office for the morgue key and Tape 03", target: { x: 16.5, z: 6.5 }, locationName: "DR. HOLLOWAY'S OFFICE" },
      { text: 'Take the fuse and Tape 02 from the Ward B quarantine desk', target: { x: 14.5, z: -9.5 }, locationName: 'WARD B QUARANTINE' },
      { text: 'Open the basement door and put the fuse into the generator', target: { x: -8.0, z: -25.0 }, locationName: 'BASEMENT GENERATOR' },
      { text: 'Take Tape 04 and escape through the basement fire exit', target: { x: 0.0, z: -34.8 }, locationName: 'EMERGENCY FIRE EXIT' }
    ];

    this.fullObjectives = this.objectives;
    this.quick = false;

    this.tapeFound = { 1: false, 2: false, 3: false, 4: false };
    this.generatorPowered = false;
    this.safeUnlocked = false;
    this.gameCompleted = false;
  }

  // 'full' is the sanatorium; 'quick' is the two-room run with its own objectives
  setLevel(kind) {
    this.quick = kind === 'quick';
    this.objectives = this.quick ? QUICK_OBJECTIVES : this.fullObjectives;
    this.currentObjectiveIndex = 0;
    this.sideQuests = { tv: false, cctv: false };
    this.refreshChecklist();
  }

  // The on-screen checklist. Quick run only: the steps, a line of how-to for the current one, and the side quests.
  refreshChecklist() {
    if (!this.quick) { this.ui.updateChecklist(null); return; }
    const i = this.currentObjectiveIndex;
    const steps = this.objectives.map((o, k) => ({
      label: o.text, state: k < i ? 'done' : k === i ? 'active' : 'todo'
    }));
    const tapes = [2, 4].filter(id => this.tapeFound[id]).length;
    const side = [
      { label: `VHS footage ${tapes}/2  (pick up both tapes)`, state: tapes === 2 ? 'done' : 'optional' },
      { label: 'Play a tape on the old TV, west hall  (E at the TV)', state: this.sideQuests.tv ? 'done' : 'optional' },
      { label: 'Watch the CCTV console feeds, west hall  (E at the console)', state: this.sideQuests.cctv ? 'done' : 'optional' }
    ];
    this.ui.updateChecklist({ steps, side, how: this.objectives[i] ? this.objectives[i].tutorial : '' });
  }

  getCurrentObjective() {
    const obj = this.objectives[this.currentObjectiveIndex];
    if (!obj) return this.quick ? 'Escape through the portal' : 'Escape the Sanatorium!';
    // The quick run shows its step number so the order is always clear
    return this.quick ? `STEP ${this.currentObjectiveIndex + 1}/${this.objectives.length}: ${obj.text}` : obj.text;
  }

  getCurrentObjectiveData() {
    if (this.quick) return this.objectives[this.currentObjectiveIndex] || { text: 'Escape through the portal', target: { x: -3.9, z: 8.3 }, locationName: 'PORTAL' };
    return this.objectives[this.currentObjectiveIndex] || { text: 'Escape the Sanatorium!', target: { x: 0, z: -34.8 }, locationName: 'FIRE EXIT' };
  }

  advanceObjective(index) {
    if (index > this.currentObjectiveIndex) {
      this.currentObjectiveIndex = index;
      this.ui.updateObjective(this.getCurrentObjective());
      this.refreshChecklist();
      const log = this.quick && this.objectives[index] ? this.objectives[index].log + '\n' : '';
      this.ui.showBannerNotification(`${log}${this.getCurrentObjective()}`);
    }
  }

  collectTape(tapeId) {
    if (!this.tapeFound[tapeId]) {
      this.tapeFound[tapeId] = true;
      const tape = TAPES_DATABASE[tapeId];
      this.ui.showBannerNotification(`RECOVERED: ${tape.title}\n[Watch at any CRT / VCR Station]`);
      soundEngine.playItemPickup();

      if (tapeId === 1) this.advanceObjective(2);
      if (tapeId === 2) this.advanceObjective(5);
      if (tapeId === 3) this.advanceObjective(4);
      if (tapeId === 4) this.advanceObjective(6);
    }
  }

  allTapesCollected() {
    return this.tapeFound[1] && this.tapeFound[2] && this.tapeFound[3] && this.tapeFound[4];
  }
}
