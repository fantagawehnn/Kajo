import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const manifest = readFileSync(new URL("../KajoConnect/manifest.xml", import.meta.url), "utf8");
const buildScript = readFileSync(new URL("../KajoConnect/build.ps1", import.meta.url), "utf8");
const activityDelegate = readFileSync(new URL("../KajoConnect/source/KajoConnectActivityDelegate.mc", import.meta.url), "utf8");
const recordingEngine = readFileSync(new URL("../KajoConnect/source/KajoConnectRecordingEngine.mc", import.meta.url), "utf8");
const activityView = readFileSync(new URL("../KajoConnect/source/KajoConnectActivityView.mc", import.meta.url), "utf8");
const layoutView = readFileSync(new URL("../KajoConnect/source/KajoLayout.mc", import.meta.url), "utf8");
const homeView = readFileSync(new URL("../KajoConnect/source/KajoConnectView.mc", import.meta.url), "utf8");
const workoutSelectView = readFileSync(new URL("../KajoConnect/source/KajoConnectWorkoutSelectView.mc", import.meta.url), "utf8");
const workoutListView = readFileSync(new URL("../KajoConnect/source/KajoConnectWorkoutListView.mc", import.meta.url), "utf8");
const workoutView = readFileSync(new URL("../KajoConnect/source/KajoConnectWorkoutView.mc", import.meta.url), "utf8");
const customFieldsView = readFileSync(new URL("../KajoConnect/source/KajoConnectCustomFieldsView.mc", import.meta.url), "utf8");
const displayConfigView = readFileSync(new URL("../KajoConnect/source/KajoConnectDisplayConfigView.mc", import.meta.url), "utf8");
const pairingView = readFileSync(new URL("../KajoConnect/source/KajoConnectPairingView.mc", import.meta.url), "utf8");

test("Venu 3S is the only Connect IQ product target", () => {
  const products = [...manifest.matchAll(/<iq:product id="([^"]+)"\s*\/>/g)].map((match) => match[1]);
  assert.deepEqual(products, ["venu3s"]);
  assert.match(manifest, /minApiLevel="4\.1\.6"/);
});

test("PowerShell build helper uses Garmin's Windows Monkey C launcher and compiles only the Venu 3S", () => {
  assert.match(buildScript, /\$compiler\s*=\s*Join-Path \$SdkPath "bin\\monkeyc\.bat"/);
  assert.doesNotMatch(buildScript, /\$compiler\s*=.*monkeyc\.exe/);
  assert.match(buildScript, /\$devices\s*=\s*@\("venu3s"\)/);
  assert.doesNotMatch(buildScript, /venu2plus/);
  assert.match(buildScript, /KajoConnect-.*\.prg/);
  assert.match(buildScript, /-r -w/);
  assert.match(buildScript, /outputInfo\.Length -le 0/);
});

test("Activity controls retain the intended Venu 3S button mapping", () => {
  assert.match(activityDelegate, /key == WatchUi\.KEY_ENTER \|\| key == WatchUi\.KEY_START/);
  assert.match(activityDelegate, /key == WatchUi\.KEY_ESC && mView\.handleLapButton\(\)/);
});

test("Recording uses Garmin kayaking with whitewater subsport", () => {
  assert.match(recordingEngine, /:sport\s*=>\s*Activity\.SPORT_KAYAKING/);
  assert.match(recordingEngine, /:subSport\s*=>\s*Activity\.SUB_SPORT_WHITEWATER/);
});

test("Monkey C source has no duplicate class-level member declarations", () => {
  const sourceDirectory = new URL("../KajoConnect/source/", import.meta.url);
  const sourceFiles = readdirSync(sourceDirectory).filter((name) => name.endsWith(".mc"));

  for (const fileName of sourceFiles) {
    const source = readFileSync(new URL(fileName, sourceDirectory), "utf8");
    const lines = source.split("\n");
    let className = null;
    let depth = 0;
    let members = new Set();

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const classMatch = line.match(/^\s*class\s+([A-Za-z0-9_]+)/);
      if (classMatch) {
        className = classMatch[1];
        members = new Set();
      }

      if (className && depth === 1) {
        const memberMatch = line.match(/^\s*var\s+([A-Za-z0-9_]+)\b/);
        if (memberMatch) {
          assert.equal(
            members.has(memberMatch[1]),
            false,
            fileName + ":" + (index + 1) + " redeclares " + className + "." + memberMatch[1]
          );
          members.add(memberMatch[1]);
        }
      }

      depth += (line.match(/{/g) ?? []).length;
      depth -= (line.match(/}/g) ?? []).length;
      if (depth <= 0) {
        className = null;
        depth = 0;
        members = new Set();
      }
    }
  }
});


test("shared Garmin layout uses transparent text backgrounds and measured font widths", () => {
  assert.ok(layoutView.includes("function fontForPercent(dc as Dc, targetPercent as Lang.Float)"));
  assert.ok(layoutView.includes("dc.getFontHeight(candidate)"));
  assert.ok(layoutView.includes("getTextWidthInPixels(text, font)"));
  assert.ok(layoutView.includes("dc.setColor(color, Graphics.COLOR_TRANSPARENT)"));
});

test("Activity screen uses shared bounded text and reserves a separate bottom control area", () => {
  assert.match(activityView, /function drawFit\(/);
  assert.match(activityView, /mKajoLayout\.drawTextFit/);
  assert.match(activityView, /mButtonTop = 340/);
  assert.match(activityView, /mButtonBottom = 375/);
  assert.match(activityView, /drawActivityDashboard\(dc, cx, hrNow, elapsed, distance, speedNow/);
  assert.match(activityView, /"ERNEUT SPEICHERN"/);
});

test("all custom Garmin screens use the shared measured-width text layout", () => {
  assert.match(layoutView, /displayText\.substring/);
  assert.match(layoutView, /getTextWidthInPixels\(displayText, font\)/);
  for (const [name, source] of [
    ["home", homeView],
    ["activity", activityView],
    ["workout select", workoutSelectView],
    ["workout list", workoutListView],
    ["workout detail", workoutView],
    ["custom fields", customFieldsView],
    ["display config", displayConfigView],
    ["pairing", pairingView],
  ]) {
    assert.match(source, /mKajoLayout\.drawTextFit/, name + " must use the shared text layout");
  }
});

test("custom field editor keeps header, four rows, controls and save action in distinct vertical bands", () => {
  assert.match(customFieldsView, /mRowTop = Math\.round\(mUnit \* 0\.225\)/);
  assert.match(customFieldsView, /mRowHeight = Math\.round\(mUnit \* 0\.108\)/);
  assert.match(customFieldsView, /mControlTop = Math\.round\(mUnit \* 0\.70\)/);
  assert.match(customFieldsView, /mSaveTop = Math\.round\(mUnit \* 0\.79\)/);
});

test("custom metric layouts relocate the wide center tile when a lower side tile would overlap it", () => {
  assert.match(activityView, /var centerMetric = ""/);
  assert.match(activityView, /var hasLowerSideMetric = false/);
  assert.match(activityView, /if \(centerMetric != "" && hasLowerSideMetric\)/);
});

test("home screen filters today's sessions and separates planned and free training actions", () => {
  assert.match(homeView, /function getTodaysSessions\(\)/);
  assert.match(homeView, /sessionDate\.toString\(\) == today/);
  assert.match(homeView, /sessionType\.toString\(\) != "RestDay"/);
  assert.match(homeView, /var todaySessions = getTodaysSessions\(\)/);
  assert.match(homeView, /todaySessions\.size\(\) == 1/);
  assert.match(homeView, /todaySessions\.size\(\) > 1/);
  assert.match(homeView, /"FREIES TRAINING"/);
  assert.match(homeView, /openActivityView\(null\)/);
  assert.match(homeView, /if \(y >= mStartTop && y <= mStartBottom\)/);
  assert.match(homeView, /startActivity\(\)/);
  assert.doesNotMatch(homeView, /Noch keine Einheit angezeigt/);
  assert.doesNotMatch(homeView, /"DEIN TRAINING"/);
});

test("home screen uses four non-overlapping fixed zones on the Venu 3S", () => {
  assert.match(homeView, /mStartTop = 136/);
  assert.match(homeView, /mStartBottom = 226/);
  assert.match(homeView, /mBoatTop = 76/);
  assert.match(homeView, /mBoatBottom = 118/);
  assert.match(homeView, /rowYs = \[240, 268, 296, 324\]/);
  assert.match(homeView, /drawHomeText\(dc, cx, rowY \+ 3, rowWidth - 24, 18/);
  assert.match(homeView, /"TRAININGSPLAN"/);
  assert.match(homeView, /"EINSTELLUNGEN"/);
  assert.doesNotMatch(homeView, /ANTIPPEN ZUM STARTEN|OHNE VORGABE|GEPLANTE EINHEITEN/);
});

test("shared text boxes reject text taller than their assigned vertical region", () => {
  assert.match(layoutView, /function drawTextBox\(/);
  assert.match(layoutView, /dc\.getFontHeight\(font\) > height/);
  assert.match(homeView, /mKajoLayout\.drawTextBox/);
  assert.match(activityView, /mKajoLayout\.drawTextBox/);
});
