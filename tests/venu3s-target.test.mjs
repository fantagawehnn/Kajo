import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const manifest = readFileSync(new URL("../KajoConnect/manifest.xml", import.meta.url), "utf8");
const buildScript = readFileSync(new URL("../KajoConnect/build.ps1", import.meta.url), "utf8");
const activityDelegate = readFileSync(new URL("../KajoConnect/source/KajoConnectActivityDelegate.mc", import.meta.url), "utf8");
const homeDelegate = readFileSync(new URL("../KajoConnect/source/KajoConnectDelegate.mc", import.meta.url), "utf8");
const menuDelegate = readFileSync(new URL("../KajoConnect/source/KajoConnectMenuViewDelegate.mc", import.meta.url), "utf8");
const settingsRootDelegate = readFileSync(new URL("../KajoConnect/source/KajoConnectMenuDelegate.mc", import.meta.url), "utf8");
const settingsMenu = readFileSync(new URL("../KajoConnect/source/KajoConnectMenuView.mc", import.meta.url), "utf8");
const recordingEngine = readFileSync(new URL("../KajoConnect/source/KajoConnectRecordingEngine.mc", import.meta.url), "utf8");
const activityView = readFileSync(new URL("../KajoConnect/source/KajoConnectActivityView.mc", import.meta.url), "utf8");
const layoutView = readFileSync(new URL("../KajoConnect/source/KajoLayout.mc", import.meta.url), "utf8");
const homeView = readFileSync(new URL("../KajoConnect/source/KajoConnectView.mc", import.meta.url), "utf8");
const workoutSelectView = readFileSync(new URL("../KajoConnect/source/KajoConnectWorkoutSelectView.mc", import.meta.url), "utf8");
const workoutListView = readFileSync(new URL("../KajoConnect/source/KajoConnectWorkoutListView.mc", import.meta.url), "utf8");
const workoutListDelegate = readFileSync(new URL("../KajoConnect/source/KajoConnectWorkoutListDelegate.mc", import.meta.url), "utf8");
const workoutView = readFileSync(new URL("../KajoConnect/source/KajoConnectWorkoutView.mc", import.meta.url), "utf8");
const workoutDelegate = readFileSync(new URL("../KajoConnect/source/KajoConnectWorkoutDelegate.mc", import.meta.url), "utf8");
const customFieldsView = readFileSync(new URL("../KajoConnect/source/KajoConnectCustomFieldsView.mc", import.meta.url), "utf8");
const displayConfigView = readFileSync(new URL("../KajoConnect/source/KajoConnectDisplayConfigView.mc", import.meta.url), "utf8");
const pairingView = readFileSync(new URL("../KajoConnect/source/KajoConnectPairingView.mc", import.meta.url), "utf8");
const trainingFieldsView = readFileSync(new URL("../KajoConnect/source/KajoConnectTrainingFieldsView.mc", import.meta.url), "utf8");
const intervalHintsView = readFileSync(new URL("../KajoConnect/source/KajoConnectIntervalHintsView.mc", import.meta.url), "utf8");
const historyView = readFileSync(new URL("../KajoConnect/source/KajoConnectHistoryView.mc", import.meta.url), "utf8");
const boatClassView = readFileSync(new URL("../KajoConnect/source/KajoConnectBoatClassView.mc", import.meta.url), "utf8");
const unitsView = readFileSync(new URL("../KajoConnect/source/KajoConnectUnitsView.mc", import.meta.url), "utf8");
const connectEndpoint = readFileSync(new URL("../supabase/functions/kajo-connect/index.ts", import.meta.url), "utf8");
const smartphoneStorage = readFileSync(new URL("../js/storage.js", import.meta.url), "utf8");
const smartphonePlanning = readFileSync(new URL("../js/planning.js", import.meta.url), "utf8");
const smartphoneHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("standard workouts are synchronized and shown separately from dated sessions", () => {
  assert.match(connectEndpoint, /function safeStandardWorkout\(/);
  assert.match(connectEndpoint, /standardWorkouts,/);
  assert.match(homeView, /mStandardWorkouts/);
  assert.match(homeView, /kajoStandardWorkouts/);
  assert.match(workoutListView, /getStandardWorkouts\(\)/);
  assert.match(workoutListView, /isStandardWorkout/);
  assert.match(workoutListView, /STANDARD · /);
  assert.match(workoutView, /mWorkout\["isStandardWorkout"\] == true/);
  assert.match(workoutView, /isStandard \? "STANDARDTRAINING" : "GEPLANTE EINHEIT"/);
  assert.match(workoutView, /valueText\("discipline", "KANU"\)/);
  assert.match(workoutView, /"TRAININGSZIEL"/);
  assert.match(workoutView, /"ABLAUF"/);
  assert.match(workoutView, /"TRAINING STARTEN"/);
});

test("a selected standard workout keeps its instructions through preview and recording start", () => {
  assert.match(workoutListView, /mHomeView\.startActivityWithWorkout\(mSessions\[mSelectedIndex\] as Lang\.Dictionary\)/);
  assert.match(homeView, /function startActivityWithWorkout\(workout as Lang\.Dictionary\)[\s\S]*?showWorkoutDetails\(workout\)/);
  assert.match(workoutView, /function startSelectedWorkout\(\)[\s\S]*?mParent\.beginWorkout\(mWorkout\)/);
  assert.match(homeView, /function beginWorkout\(workout as Lang\.Dictionary\)[\s\S]*?openActivityView\(workout\)/);
  assert.match(activityView, /function setSelectedWorkout\(workout as Lang\.Dictionary\)[\s\S]*?loadWorkoutSteps\(workout\["steps"\]\)/);
  assert.match(activityView, /mCurrentWorkoutObjective = workout\["objective"\]/);
  assert.match(activityView, /mCurrentWorkoutMainSet = workout\["mainSet"\]/);
});

test("standard workout templates persist independently of dated planning", () => {
  assert.match(smartphoneStorage, /standardWorkouts: 'standardWorkouts'/);
  assert.match(smartphoneStorage, /state\.standardWorkouts = Array\.isArray\(loaded\.standardWorkouts\)/);
  assert.match(smartphoneStorage, /standardWorkouts: state\.standardWorkouts/);
  assert.match(smartphoneStorage, /Ältere Cloud-Snapshots kennen Standardtrainings noch nicht/);
  assert.match(smartphonePlanning, /export function saveStandardWorkout/);
  assert.match(smartphonePlanning, /state\.standardWorkouts\.push\(workout\)/);
  assert.match(smartphoneHtml, /id="standard-workouts-list"/);
  assert.match(smartphoneHtml, /id="standard-workout-modal"/);
  assert.doesNotMatch(smartphonePlanning.slice(smartphonePlanning.indexOf("export function saveStandardWorkout")), /state\.plannedActivities\.push/);
});

test("Venu 3S is the only Connect IQ product target", () => {
  const products = [...manifest.matchAll(/<iq:product id="([^"]+)"\s*\/>/g)].map((match) => match[1]);
  assert.deepEqual(products, ["venu3s"]);
  assert.match(manifest, /minApiLevel="5\.1\.0"/);
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

test("Venu 3S navigation routes raw physical keys and keeps touch handling separate", () => {
  assert.match(activityDelegate, /extends WatchUi\.InputDelegate/);
  assert.match(activityDelegate, /InputDelegate\.initialize\(\)/);
  assert.match(activityDelegate, /function onKey\(keyEvent[\s\S]*?WatchUi\.KEY_ENTER/);
  assert.match(activityDelegate, /WatchUi\.KEY_ESC/);
  assert.match(activityDelegate, /WatchUi\.KEY_MENU/);
  assert.match(activityDelegate, /function onTap\(clickEvent/);
  assert.match(activityDelegate, /function onSwipe\(swipeEvent/);
  assert.match(homeDelegate, /extends WatchUi\.InputDelegate/);
  assert.match(homeDelegate, /InputDelegate\.initialize\(\)/);
  assert.match(homeDelegate, /function onKey\(keyEvent[\s\S]*?WatchUi\.KEY_ENTER/);
  assert.match(homeDelegate, /function onTap\(clickEvent/);
  assert.match(homeDelegate, /function onSwipe\(swipeEvent/);
  assert.match(workoutDelegate, /extends WatchUi\.InputDelegate/);
  assert.match(settingsRootDelegate, /function onSelect\(item as WatchUi\.MenuItem\)[\s\S]*?openSettingsItem\(item\.getId\(\)\.toString\(\)\)/);
  assert.match(menuDelegate, /extends WatchUi\.Menu2InputDelegate/);
  assert.match(menuDelegate, /function onSelect\(item as WatchUi\.MenuItem\)[\s\S]*?openSettingsItem\(item\.getId\(\)\.toString\(\)\)/);
  assert.match(settingsMenu, /extends WatchUi\.Menu2/);
  assert.match(displayConfigView, /extends WatchUi\.CheckboxMenu/);
  assert.match(displayConfigView, /findItemById\(identifier\)/);
  assert.match(displayConfigView, /activeCount == 0/);
});

test("Recording uses Garmin kayaking as its FIT sport type", () => {
  assert.match(recordingEngine, /:sport\s*=>\s*Activity\.SPORT_KAYAKING/);
  assert.doesNotMatch(recordingEngine, /:subSport\s*=>\s*Activity\.SUB_SPORT_WHITEWATER/);
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
  assert.ok(layoutView.includes("dc.getFontHeight(preferredFont)"));
  assert.ok(layoutView.includes("dc.getTextWidthInPixels(text, preferredFont)"));
  assert.match(layoutView, /Graphics\.getVectorFont\([\s\S]*?:font => preferredFont[\s\S]*?:scale => scale/);
  assert.ok(layoutView.includes("dc.setColor(color, Graphics.COLOR_TRANSPARENT)"));
});

test("Activity screen uses shared bounded text and reserves a separate bottom control area", () => {
  assert.match(activityView, /function drawFit\(/);
  assert.match(activityView, /mKajoLayout\.drawTextFit/);
  assert.match(activityView, /mButtonTop = 306/);
  assert.match(activityView, /mButtonBottom = 374/);
  assert.match(activityView, /"TRAINING STARTEN"/);
  assert.match(activityView, /mScreenWidth = dc\.getWidth\(\)/);
  assert.match(activityView, /drawActivityDashboard\(dc, cx, hrNow, elapsed, distance, speedNow/);
  assert.match(activityView, /"ERNEUT SPEICHERN"/);
  assert.match(homeView, /Kein Training geplant/);
  assert.doesNotMatch(homeView, /HEUTE KEIN TRAINING/);
  assert.match(homeView, /if \(todaySessions\.size\(\) == 0\)/);
  assert.match(homeView, /mStartLeft = 0/);
});

test("all custom Garmin screens use the shared measured-width text layout", () => {
  assert.match(layoutView, /displayText\.substring/);
  assert.match(layoutView, /getTextWidthInPixels\(displayText, font\)/);
  for (const [name, source] of [
    ["home", homeView],
    ["activity", activityView],
    ["workout detail", workoutView],
    ["custom fields", customFieldsView],
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

test("boat class and metric unit settings are available on the watch", () => {
  assert.match(boatClassView, /new WatchUi\.MenuItem\("K1 · Kajak"/);
  assert.match(boatClassView, /new WatchUi\.MenuItem\("C1 · Canadier"/);
  assert.match(boatClassView, /new WatchUi\.MenuItem\("C2 · Canadier"/);
  assert.match(boatClassView, /Storage\.getValue\("kajoSelectedBoat"\)/);
  assert.match(unitsView, /new WatchUi\.MenuItem\("Distanz", "Kilometer \(km\)"/);
  assert.match(unitsView, /new WatchUi\.MenuItem\("Tempo", "Minuten pro Kilometer/);
  assert.match(unitsView, /new WatchUi\.MenuItem\("Geschwindigkeit", "Kilometer pro Stunde/);
});

test("completed activities are stored locally and displayed in watch history", () => {
  assert.match(activityView, /Storage\.setValue\("kajoActivityHistory", nextHistory\)/);
  assert.match(activityView, /mHistoryEntrySaved/);
  assert.match(activityView, /entry\["dateIso"\] = dateIso/);
  assert.match(activityView, /entry\["durationSeconds"\] = mElapsedSeconds/);
  assert.match(activityView, /entry\["distanceMeters"\] = mFinalDistanceMeters/);
  assert.match(activityView, /entry\["averageHeartRateBpm"\] = mFinalAverageHeartRateValue/);
  assert.match(historyView, /Storage\.getValue\("kajoActivityHistory"\)/);
  assert.match(historyView, /extends WatchUi\.Menu2/);
  assert.match(historyView, /"AKTIVITÄTEN"/);
  assert.match(historyView, /" bpm"/);
  assert.match(homeView, /getTodaysSessions\(\)/);
});

test("completed Garmin watch activities are queued locally and uploaded idempotently", () => {
  assert.match(activityView, /Storage\.setValue\("kajoPendingActivityUploads", next\)/);
  assert.match(activityView, /"action" => "upload-activity"/);
  assert.match(activityView, /function onActivityUploadResponse\(/);
  assert.match(activityView, /function onShow\(\) as Void[\s\S]*?syncPendingActivityUploads\(\)/);
  assert.match(activityView, /pending\.size\(\) >= 20/);
  assert.match(activityView, /syncPendingActivityUploads\(\);[\s\S]*?WatchUi\.requestUpdate\(\)/);
  assert.match(activityView, /mStartDateIso/);
  assert.match(activityView, /entry\["clientActivityId"\]/);
  assert.match(connectEndpoint, /action === "upload-activity"/);
  assert.match(connectEndpoint, /recordId = "kajo-watch-" \+ device\.id \+ "-" \+ clientId/);
  assert.match(connectEndpoint, /onConflict: "user_id,record_id"/);
  assert.match(connectEndpoint, /durationSeconds/);
  assert.match(connectEndpoint, /distanceMeters/);
  assert.match(connectEndpoint, /averageHeartRateBpm/);
});

test("live training field settings offer the supported 2 and 4 field layouts", () => {
  assert.match(trainingFieldsView, /mCounts as Lang\.Array<Lang\.Number> = \[2, 4\]/);
  assert.match(trainingFieldsView, /extends WatchUi\.Menu2/);
  assert.match(trainingFieldsView, /new WatchUi\.MenuItem\("Feld 1 konfigurieren"/);
  assert.match(trainingFieldsView, /"heartRateZone"/);
  assert.match(trainingFieldsView, /"Schlagfrequenz"/);
  assert.match(trainingFieldsView, /"Gesamtdistanz"/);
  assert.match(trainingFieldsView, /"Pace"/);
  assert.match(intervalHintsView, /extends WatchUi\.CheckboxMenu/);
  assert.match(intervalHintsView, /"kajoIntervalTone", false/);
  assert.match(activityView, /mTrainingFieldCount == 2/);
  assert.match(activityView, /var mTrainingFieldCount as Lang\.Number = 4/);
  assert.match(activityView, /dc\.fillRoundedRectangle\(55, 63, 280, 30, 15\)/);
  assert.match(activityView, /dc\.drawArc\(cx, 197, 105, Graphics\.ARC_CLOCKWISE, 225, 360\)/);
  assert.match(activityView, /drawHeartRateZoneBar\(dc, cx, cx, mUnit \* 0\.455, zone\)/);
  assert.match(activityView, /dc\.drawLine\(72, 220, 318, 220\)/);
  assert.match(activityView, /"PACE"/);
  assert.match(activityView, /"ZONE " \+ zone\.toString\(\)/);
  assert.match(activityView, /intervalDistanceText\(activityInfo\)/);
});

test("custom metric layouts relocate the wide center tile when a lower side tile would overlap it", () => {
  assert.match(activityView, /var centerMetric = ""/);
  assert.match(activityView, /var hasLowerSideMetric = false/);
  assert.match(activityView, /if \(centerMetric != "" && hasLowerSideMetric\)/);
});

test("home screen uses a Garmin-style list, hides empty workout icon, and cycles boat class in place", () => {
  assert.match(homeView, /function getTodaysSessions\(\)/);
  assert.match(homeView, /sessionDate\.toString\(\) == today/);
  assert.match(homeView, /sessionType\.toString\(\) != "RestDay"/);
  assert.match(homeView, /var todaySessions = getTodaysSessions\(\)/);
  assert.match(homeView, /todaySessions\.size\(\) == 1/);
  assert.match(homeView, /todaySessions\.size\(\) == 1/);
  assert.match(homeView, /Einheiten heute/);
  assert.match(homeView, /"Kein Training geplant"/);
  assert.match(homeView, /"Trainings"/);
  assert.match(homeView, /"Freies Training"/);
  assert.match(homeView, /function cycleBoatClass\(\)/);
  assert.match(homeView, /mSelectedBoat == "K1"[\s\S]*?mSelectedBoat = "C1"/);
  assert.match(homeView, /mSelectedBoat == "C1"[\s\S]*?mSelectedBoat = "C2"/);
  assert.match(homeView, /mSelectedBoat = "K1"/);
  assert.match(homeView, /cycleBoatClass\(\)/);
  assert.match(homeView, /mStartLeft = 0/);
  assert.match(homeView, /mBoatTop/);
  assert.match(homeView, /mBoatBottom/);
  assert.doesNotMatch(homeView, /"TRAININGSPLAN"/);
  assert.doesNotMatch(homeView, /"HEUTE KEIN TRAINING"/);
  assert.doesNotMatch(homeView, /fillTriangle/);
});

test("shared text boxes reject text taller than their assigned vertical region", () => {
  assert.match(layoutView, /function drawTextBox\(/);
  assert.match(layoutView, /if \(textHeight > height\)/);
  assert.match(layoutView, /dc\.setClip\(/);
  assert.match(layoutView, /dc\.clearClip\(\)/);
  assert.match(homeView, /mKajoLayout\.drawTextBox/);
  assert.match(activityView, /mKajoLayout\.drawTextBox/);
});

test("all custom watch views clear with an opaque black background before drawing", () => {
  const sourceDirectory = new URL("../KajoConnect/source/", import.meta.url);
  const sourceFiles = readdirSync(sourceDirectory).filter((name) => name.endsWith(".mc"));
  for (const fileName of sourceFiles) {
    const source = readFileSync(new URL(fileName, sourceDirectory), "utf8");
    if (!source.includes("dc.clear();")) continue;
    assert.match(
      source,
      /dc\.setColor\(Graphics\.COLOR_BLACK,\s*Graphics\.COLOR_BLACK\);\s*dc\.clear\(\);/,
      fileName + " must clear to an opaque black background"
    );
  }
});

test("settings keep native menus while workout selection uses a custom dark view", () => {
  assert.match(settingsMenu, /extends WatchUi\.Menu2/);
  assert.match(settingsMenu, /new WatchUi\.MenuItem\("Trainingsfelder"/);
  assert.match(settingsMenu, /new WatchUi\.MenuItem\("Mit KAJO verbinden"/);
  assert.match(workoutListView, /extends WatchUi\.View/);
  assert.match(workoutListView, /dc\.setColor\(Graphics\.COLOR_BLACK, Graphics\.COLOR_BLACK\)/);
  assert.match(workoutListView, /fillRoundedRectangle/);
  assert.match(workoutListDelegate, /extends WatchUi\.InputDelegate/);
  assert.match(homeView, /new KajoConnectWorkoutListView\(self, todaysSessions, "HEUTE WÄHLEN"/);
  assert.doesNotMatch(homeView, /new KajoConnectWorkoutSelectView/);
  assert.match(menuDelegate, /function onSelect\(item as WatchUi\.MenuItem\)/);
});


test("workout database lists only planned K1/C1/C2 canoe sessions and supports scrolling through the full loaded list", () => {
  assert.match(workoutListView, /mSessions = getCanoeSessions\(sourceSessions\)/);
  assert.match(workoutListView, /session\["discipline"\]/);
  assert.match(workoutListView, /boatClass == "K1" \|\| boatClass == "C1" \|\| boatClass == "C2"/);
  assert.match(workoutListView, /mFirstVisibleIndex = mSelectedIndex - mVisibleRows \+ 1/);
  assert.match(workoutListDelegate, /direction == WatchUi\.SWIPE_UP[\s\S]*?moveSelection\(1\)/);
  assert.match(workoutListDelegate, /key == WatchUi\.KEY_DOWN[\s\S]*?moveSelection\(1\)/);
});
