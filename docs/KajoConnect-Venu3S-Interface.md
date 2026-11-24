# KAJO Connect – Venu 3S interface architecture

## Device target

The Connect IQ manifest targets only `venu3s`. Garmin's device reference lists a round 390 × 390 AMOLED display, touch input, logical buttons `enter`, `menu`, and `esc`, and Connect IQ API level 5.2.

## Screen architecture

Use Garmin's native UI components wherever the screen is primarily a list or a set of preferences:

- `WatchUi.Menu2` for settings, saved workouts, workout selection, history, boat class, and unit information.
- `WatchUi.CheckboxMenu` for independent on/off preferences such as interval hints, displayed training metrics, and enabled data pages.
- Custom `WatchUi.View` screens only where the interface is genuinely visual or task-specific: home dashboard, workout preview, live recording, pairing, and the multi-field editor.

Native menus own their layout, scrolling, focus, and touch interaction. Do not recreate a scrollable list with manually drawn rows unless a custom layout is essential.

## View stack and navigation

- Use `WatchUi.pushView()` when opening a child screen that should return to the current screen.
- Use `WatchUi.popView()` for the native Back behavior.
- Use `WatchUi.switchToView()` when replacing the current screen rather than retaining it underneath.
- Avoid pushing duplicate instances of the same screen during a single navigation action.
- Let `Menu2InputDelegate` handle native menu selection and Back behavior.

The home screen uses the middle/menu behavior to open settings. The action/enter button activates the focused home action. The lower/esc button is not repurposed as a settings shortcut. During a recording, the activity delegate retains its training-specific lap/back behavior.

## Opaque background rule for custom views

Every custom view that draws directly to the device context must begin its render pass with:

```monkeyc
dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
dc.clear();
```

Garmin documents that `Dc.clear()` uses the current background color. Since text drawing may set a transparent background, clearing without resetting the background can expose content from the previous drawing layer. Never rely on the drawing context retaining a particular background color between views or render passes.

## Circular layout rules

- Query the actual drawing surface with `dc.getWidth()` and `dc.getHeight()`.
- Configure the shared `KajoLayout` from those dimensions.
- Use `safeRectWidth()`, `drawTextFit()`, and `drawTextBox()` to keep content inside the circular display's usable area.
- Keep separate vertical bands for headers, content rows, and bottom hints/actions.
- Keep touch hitboxes aligned with the same row boundaries used for drawing.
- Do not clamp text vertically into the circle: that can move separate lines onto the same y-coordinate.
- Avoid fixed coordinates for other watch sizes. The current activity screen's 390 px coordinate system is specific to the manifest's Venu 3S-only target.

## Verification

The repository's Node-based workflows verify static source assumptions and regression behavior. They do not compile Monkey C with the Garmin SDK, run the Connect IQ simulator, or verify behavior on a physical Venu 3S. Those checks remain required before calling the interface device-tested.
