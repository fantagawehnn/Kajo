# KAJO Connect – Garmin Connect IQ API audit

Stand: 27 November 2026  
Target device: Garmin Venu 3S  
Branch: `feature/kajo-connect`

## Audit method

Every Garmin-facing feature is checked against:

1. The Connect IQ API reference: correct module, method, parameter types, units and API level.
2. The manifest: the required permission is declared and the target product is explicit.
3. The implementation: nullable values, unit conversions, state transitions and fallback calculations.
4. Device validation: Monkey C compilation, simulator checks and a real Venu 3S recording. The last item is still required; static source checks cannot prove sensor or FIT-file behavior.

Primary references:

- [ActivityRecording](https://developer.garmin.com/connect-iq/api-docs/Toybox/ActivityRecording.html)
- [ActivityRecording.Session](https://developer.garmin.com/connect-iq/api-docs/Toybox/ActivityRecording/Session.html)
- [Activity.Info](https://developer.garmin.com/connect-iq/api-docs/Toybox/Activity/Info.html)
- [Activity](https://developer.garmin.com/connect-iq/api-docs/Toybox/Activity.html)
- [Positioning](https://developer.garmin.com/connect-iq/core-topics/positioning)
- [Manifest and permissions](https://developer.garmin.com/connect-iq/articles/core-topics/Manifest_and_Permissions.html)
- [Garmin time-field definitions](https://support.garmin.com/en-IN/?faq=k5TPjwyAWi5f4hnObUAVf7)

## 1. Session and sport type

| KAJO behavior | Garmin mapping | Assessment |
|---|---|---|
| Create a recording | `ActivityRecording.createSession()` | Correct API. Requires `Fit`. |
| Start | `Session.start()` | Correct API; return value is checked. |
| Stop before save | `Session.stop()` | Correct API. |
| Save FIT | `Session.save()` | Correct API; success is checked before history is marked saved. |
| Discard | `Session.discard()` | Correct API; success is checked. |
| Add lap | `Session.addLap()` | Correct API; return value is checked. |
| Check recording state | `Session.isRecording()` | Correct API, but it is not the same as checking whether the activity timer is running. |
| Sport | `Activity.SPORT_KAYAKING` | Valid Garmin sport enum. Venu 3S is listed as supporting ActivityRecording. |
| Boat class | K1/C1/C2 appended to session name and stored in KAJO metadata | Garmin's sport enum does not encode K1/C1/C2. They are not separate FIT sport types in this implementation. |

### Whitewater sub-sport

Garmin defines `Activity.SUB_SPORT_WHITEWATER` from API level 4.1.6. KAJO currently omits the sub-sport and records only `SPORT_KAYAKING`. The source comment records a previous simulator/device session-creation problem when the sub-sport was used; that problem has not been independently reproduced in this audit. Because the project minimum is API 5.1.0, the enum is available at the declared API level, but it should only be restored after a Venu 3S test confirms session creation and FIT output.

### Pause and resume – important limitation

The documented `ActivityRecording.Session` API exposes `start()` and `stop()`; it does not expose a `pause()` or `resume()` method. KAJO's pause is therefore implemented as `stop()`, and resume as `start()` on the existing session object. This is not yet proven equivalent to Garmin's native pause/resume behavior on the Venu 3S. It must be tested by inspecting the resulting FIT timer events and Garmin Connect summary.

## 2. Live data fields

Garmin's `Activity.Info` fields are nullable. KAJO should show an unavailable marker rather than invent or calculate a replacement where Garmin supplies no value.

| KAJO field | Garmin source | Unit/conversion | Assessment |
|---|---|---|---|
| Current heart rate | `currentHeartRate` | bpm | Correct source; may be null. |
| Average heart rate | `averageHeartRate` | bpm | Correct source; may be null. |
| Maximum heart rate | `maxHeartRate` | bpm | Correct source; may be null. |
| Heart-rate zone | KAJO thresholds passed into the watch | KAJO compares bpm with the four supplied upper bounds | This is a KAJO calculation, not a Garmin-provided zone value. |
| Current speed | `currentSpeed` | m/s × 3.6 = km/h | Correct conversion. |
| Average speed | `averageSpeed` | m/s × 3.6 = km/h | Correct conversion. Garmin documents average speed as 3-D accumulated distance divided by elapsed time. |
| Maximum speed | `maxSpeed` | m/s × 3.6 = km/h | Correct conversion. |
| Pace | Derived from `currentSpeed` | min/km | Formula is dimensionally correct after converting speed to km/h. It is a derived display, not a native Garmin pace field. |
| Distance | `elapsedDistance` | meters ÷ 1,000 = km | Correct conversion; may be null. |
| Cadence | `currentCadence` | Garmin documents rpm | Label/unit corrected from “Schlagfrequenz / SPM” to “Kadenz / RPM”. Garmin's generic cadence value is not documented as paddle strokes per minute, so KAJO must not claim that equivalence. |
| Power | `currentPower` | watts | Correct unit; availability depends on the device/activity/sensor and may be null. |
| Calories | `calories` | kcal | Correct unit; may be null. |
| Altitude | `altitude` | meters | Correct unit; may be null. Garmin may derive elevation from barometer or GPS. |
| Ascent/descent | `totalAscent`, `totalDescent` | meters | Correct units; may be null. |
| Training Effect | `trainingEffect` | Firstbeat score, 1.0–5.0 | Correctly treated as optional; not a direct measure of paddling power or lactate. |
| GPS/position quality | `currentLocationAccuracy` and `Position.Info.accuracy` | Garmin quality enum | Correctly treated as a quality category, not meters. A non-null location is not proof of a high-quality onboard GPS fix. UI wording changed from “GPS AKTIV” to “POSITION AKTIV”. |

## 3. Time handling

Garmin exposes both `timerTime` and `elapsedTime` in milliseconds.

- `timerTime` is the activity timer duration and excludes pauses.
- `elapsedTime` includes the time since the activity began, including pauses.
- KAJO's visible timer is currently a local one-second timer because the source records previous cases where `Activity.Info.timerTime` was delayed or unchanged on the target device.
- The previous fallback from `timerTime` to `elapsedTime` was removed. It could incorrectly add pause duration to active training time.
- Lap duration now falls back to KAJO's active-time counter if Garmin's `timerTime` is missing or has not advanced beyond the previous lap baseline.

Remaining risk: the local timer can drift if its callbacks are delayed or the app is suspended. The Venu 3S test must compare KAJO's time against Garmin's FIT `total_timer_time` and `total_elapsed_time`.

## 4. Laps and intervals

- Manual and automatic laps use `Session.addLap()`.
- Garmin lap event data can provide elapsed distance (m), average/max speed (m/s), elapsed time (ms) and timer time (ms). KAJO converts speed to km/h.
- Garmin's documented lap callback does not provide average lap heart rate. KAJO therefore calculates lap average HR from its own samples of `Activity.Info.currentHeartRate`, taken by its one-second timer. This is an approximation based on the sampling cadence, not Garmin's native lap-average-HR field.
- Free training creates a local automatic lap at each 1,000 m threshold. The FIT lap is created through `addLap()`.
- Planned workout steps are interpreted by KAJO's own timer and state machine. They are not currently sent to Garmin as a native Garmin workout.
- If Garmin returns no timer value for a lap, KAJO now uses its active-time counter as a fallback.

## 5. GPS lifecycle

- The manifest includes `Positioning`.
- KAJO enables continuous position events after a successful session start.
- On pause, KAJO now disables position events and resets its displayed GPS-quality state.
- On resume, KAJO enables position events again.
- On save/discard, KAJO disables position events.

The position callback currently uses the accuracy value for display; the FIT track itself still needs to be checked in a real Venu 3S recording.

## 6. Permissions

The source files were reviewed for Garmin module imports. The current manifest now requests only the permissions used by the app:

- `Communications` – KAJO watch-to-phone/server HTTP requests.
- `Fit` – `ActivityRecording` FIT session creation, recording and saving.
- `Positioning` – `Position.enableLocationEvents()`.

Other permissions previously listed in the manifest were not required by the current source imports and were removed. If a future feature adds ANT, BLE, SensorHistory, SensorLogging, UserProfile, persisted content or notifications, its permission must be reviewed and added when that feature is implemented.

## 7. Data saved locally and uploaded

The watch's local history stores duration, distance, average HR, speed, max speed, max HR, calories, ascent and lap summaries when those values are available.

The current watch-to-server upload sends only the activity date/start time, duration, distance, average HR, boat class and name. Maximum speed, maximum HR, calories, ascent and lap summaries are not currently included in the server payload. They therefore must not be assumed to be available in the web app/cloud activity record.

## 8. Code corrections made during this audit

- Reduced manifest permissions to Communications, Fit and Positioning.
- Corrected cadence wording/unit to Kadenz/RPM.
- Changed GPS status wording to position status.
- Added a guard against duplicate start inputs while a recording is already active.
- Added null guards when reading activity summaries and sampling lap metrics.
- Added a guard for absent lap event data.
- Removed the `elapsedTime` fallback for active training time.
- Added an active-time fallback for lap timing when Garmin's timer value is missing or has not advanced.
- Disabled position events during pause and re-enabled them on resume.

## 9. Required Venu 3S validation

The following cannot be confirmed by source inspection or Node-based tests:

1. Start a K1, C1 and C2 recording and confirm the FIT file is created as Kayaking with the intended name.
2. Pause, wait at least 60 seconds, resume and confirm that timer time excludes the pause while elapsed time includes it.
3. Add manual laps and complete an automatic 1,000 m lap; compare lap count, distance, time and speed in the FIT file.
4. Check whether heart rate, cadence, speed, distance, altitude, ascent, calories and Training Effect are actually populated during paddling on the Venu 3S.
5. Check GPS acquisition, GPS track continuity, pause behavior and resume behavior.
6. Save and discard separate test sessions; confirm no incomplete FIT file or duplicate activity is created.
7. Leave and reopen the app during a recording; compare the KAJO timer with Garmin's timer.
8. Inspect the FIT file or Garmin Connect activity, not only the values displayed by the app.

## 10. Current verification status

The GitHub workflows on the audited branch completed successfully after the latest code changes. These workflows run Node-based regression/source tests; they do **not** compile the Monkey C app with Garmin's SDK. A successful Garmin Monkey C build and a real Venu 3S test are still outstanding.
