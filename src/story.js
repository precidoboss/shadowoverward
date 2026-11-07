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
      { text: "DR. HOLLOWAY: 'The main breaker tripped! We need the backup fuse from the quarantine desk to restart the gate!'", duration: 4500 }
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
      { text: "DR. HOLLOWAY: 'I locked the morgue access key inside this office safe. Code is the founding year: 1 9 7 4.'", duration: 4800 },
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
      { text: "DR. HOLLOWAY: 'The fire exit in the basement is the only way out. Insert the fuse into the breaker... and RUN.'", duration: 4800 },
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

export class StoryManager {
  constructor(ui) {
    this.ui = ui;
    this.currentObjectiveIndex = 0;
    this.objectives = [
      { text: 'Search the Reception Lobby for the Ward A Key', target: { x: 4.2, z: 15.8 }, locationName: 'RECEPTION DESK' },
      { text: 'Unlock Ward A and recover Tape 01', target: { x: -11.5, z: 6.5 }, locationName: 'WARD A (ROOM 101)' },
      { text: 'Get Ward B Keycard & Safe Code in Room 102', target: { x: -11.0, z: -6.5 }, locationName: 'WARD A (ROOM 102)' },
      { text: 'Unlock Wall Safe in Dr. Holloway\'s Office (Tape 03 & Key)', target: { x: 16.5, z: 6.5 }, locationName: 'OFFICE SAFE' },
      { text: 'Retrieve High-Voltage Fuse from Ward B (Tape 02)', target: { x: 14.5, z: -9.5 }, locationName: 'WARD B QUARANTINE' },
      { text: 'Unlock Basement & Install Fuse into the Generator', target: { x: -8.0, z: -25.0 }, locationName: 'BASEMENT GENERATOR' },
      { text: 'Recover Final Tape 04 in Morgue & Escape Fire Exit!', target: { x: 0.0, z: -34.8 }, locationName: 'EMERGENCY FIRE EXIT' }
    ];

    this.tapeFound = { 1: false, 2: false, 3: false, 4: false };
    this.generatorPowered = false;
    this.safeUnlocked = false;
    this.gameCompleted = false;
  }

  getCurrentObjective() {
    const obj = this.objectives[this.currentObjectiveIndex];
    return obj ? obj.text : 'Escape the Sanatorium!';
  }

  getCurrentObjectiveData() {
    return this.objectives[this.currentObjectiveIndex] || { text: 'Escape the Sanatorium!', target: { x: 0, z: -34.8 }, locationName: 'FIRE EXIT' };
  }

  advanceObjective(index) {
    if (index > this.currentObjectiveIndex) {
      this.currentObjectiveIndex = index;
      this.ui.updateObjective(this.getCurrentObjective());
      this.ui.showBannerNotification(`OBJECTIVE UPDATED:\n${this.getCurrentObjective()}`);
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
