// Generates a few playable (silent) sample .mp3 files in the media folder so
// you can try the app before wiring up real audio. Run: npm run seed:media
//
// Each file is named in the convention the indexer expects:
//   YYYY-MM-DD_Rabbi Name_Parasha_Title.mp3

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mediaDir = path.resolve(fileURLToPath(import.meta.url), '../../media');
fs.mkdirSync(mediaDir, { recursive: true });

// One silent MPEG-1 Layer III frame (128 kbps, 44.1 kHz) = 417 bytes.
function silentFrame() {
  const frame = Buffer.alloc(417, 0);
  frame[0] = 0xff; // frame sync
  frame[1] = 0xfb; // MPEG-1 Layer III, no CRC
  frame[2] = 0x90; // 128 kbps, 44.1 kHz
  frame[3] = 0x64;
  return frame;
}

function silentMp3(seconds = 3) {
  const framesPerSecond = 38; // ~26ms per frame
  return Buffer.concat(Array.from({ length: seconds * framesPerSecond }, silentFrame));
}

const samples = [
  'AR-04-06-Chukat-TSFV - חוקת תשפו_ארנון הרב ישראל.mp3',
  'BRUN-04-07-Chukat-TSFV - חוקת תשפו_בראון הרב חיים.mp3',
  'BRK-04-06-Chukat-TSFV-Vaad - חוקת תשפו-ועד_ברוק הרב יוסף.mp3',
  'BSNR-04-06-Chukat-TSFV - חוקת תשפו_בן סניור הרב נתן.mp3',
  'DMN-04-06-Chukat-TSFV-VD-GNRL - תפילה-חוקת תשפו-כללי_דיאמנט הרב נחום.mp3',
];

const audio = silentMp3(3);
for (const name of samples) {
  fs.writeFileSync(path.join(mediaDir, name), audio);
  console.log('wrote', name);
}
console.log(`\nDone. ${samples.length} sample lessons in ${mediaDir}`);
