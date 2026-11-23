import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = readFileSync(new URL("../KajoConnect/manifest.xml", import.meta.url), "utf8");
const buildScript = readFileSync(new URL("../KajoConnect/build.ps1", import.meta.url), "utf8");
const activityDelegate = readFileSync(new URL("../KajoConnect/source/KajoConnectActivityDelegate.mc", import.meta.url), "utf8");
const recordingEngine = readFileSync(new URL("../KajoConnect/source/KajoConnectRecordingEngine.mc", import.meta.url), "utf8");

test("Venu 3S is the only Connect IQ product target", () => {
  const products = [...manifest.matchAll(/<iq:product id="([^"]+)"\s*\/>/g)].map((match) => match[1]);
  assert.deepEqual(products, ["venu3s"]);
  assert.match(manifest, /minApiLevel="4\.1\.6"/);
});

test("PowerShell build helper compiles only the Venu 3S", () => {
  assert.match(buildScript, /\$devices\s*=\s*@\("venu3s"\)/);
  assert.doesNotMatch(buildScript, /venu2plus/);
  assert.match(buildScript, /KajoConnect-.*\.prg/);
});

test("Activity controls retain the intended Venu 3S button mapping", () => {
  assert.match(activityDelegate, /key == WatchUi\.KEY_ENTER \|\| key == WatchUi\.KEY_START/);
  assert.match(activityDelegate, /key == WatchUi\.KEY_ESC && mView\.handleLapButton\(\)/);
});

test("Recording uses Garmin kayaking with whitewater subsport", () => {
  assert.match(recordingEngine, /:sport\s*=>\s*Activity\.SPORT_KAYAKING/);
  assert.match(recordingEngine, /:subSport\s*=>\s*Activity\.SUB_SPORT_WHITEWATER/);
});
