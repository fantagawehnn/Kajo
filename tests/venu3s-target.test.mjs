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


test("shared Garmin layout provides the percentage-based font selector used by compact controls", () => {
  assert.ok(layoutView.includes("function fontForPercent(dc as Dc, targetPercent as Lang.Float)"));
  assert.ok(layoutView.includes("dc.getFontHeight(candidate)"));
  assert.ok(activityView.includes("fontForPercent"));
  assert.ok(customFieldsView.includes("fontForPercent"));
  assert.ok(displayConfigView.includes("fontForPercent"));
});

test("Activity screen uses shared bounded text and reserves a separate bottom control area", () => {
  assert.match(activityView, /function drawFit\(/);
  assert.match(activityView, /mKajoLayout\.drawTextFit/);
  assert.match(activityView, /mButtonTop = mUnit \* 0\.82/);
  assert.match(activityView, /mButtonBottom = mUnit \* 0\.90/);
  assert.match(activityView, /drawFit\(dc, cx, mUnit \* 0\.335/);
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
  assert.match(customFieldsView, /mRowTop = Math\.round\(mUnit \* 0\.245\)/);
  assert.match(customFieldsView, /mRowHeight = Math\.round\(mUnit \* 0\.108\)/);
  assert.match(customFieldsView, /mControlTop = Math\.round\(mUnit \* 0\.70\)/);
  assert.match(customFieldsView, /mSaveTop = Math\.round\(mUnit \* 0\.78\)/);
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

test("home screen keeps the hero card, scrollable menu and lower controls in distinct bands", () => {
  assert.match(homeView, /var cardY = mUnit \* 0\.255/);
  assert.match(homeView, /var cardHeight = mUnit \* 0\.18/);
  assert.match(homeView, /var dividerY = mUnit \* 0\.52/);
  assert.match(homeView, /mFreeTop = mUnit \* 0\.56/);
  assert.match(homeView, /mFreeBottom = mUnit \* 0\.85/);
  assert.match(homeView, /var rowHeight = mUnit \* 0\.073/);
  assert.match(homeView, /"GEPLANTE TRAININGS"/);
  assert.match(homeView, /"EINSTELLUNGEN"/);
});
