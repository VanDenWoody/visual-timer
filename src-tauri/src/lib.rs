// The desktop shell around the web app: a tray icon, closing hides to the tray,
// and minimising (or the pop-out button) turns the window into a borderless
// overlay that stays on top of other windows, also other always-on-top ones. The overlay's size and place are
// remembered, also across restarts.

#[cfg(windows)]
mod shape;
#[cfg(windows)]
mod topmost;

use std::{fs, path::PathBuf, sync::Mutex};

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewWindow,
    WindowEvent,
};

// The overlay's dial area is square; the drag strip (body.compact .titlebar) sits on top.
// Sizes are in logical pixels, so the overlay looks the same at any display scaling.
const OVERLAY_SIZE: f64 = 240.0;
const OVERLAY_STRIP: f64 = 14.0;
const OVERLAY_MARGIN: f64 = 16.0;

fn lock_shape(_locked: bool) {
    #[cfg(windows)]
    shape::lock(_locked);
}

fn keep_on_top(_on: bool) {
    #[cfg(windows)]
    topmost::keep_on_top(_on);
}

// Where the overlay was last and how big, kept in overlay.json in the app's config folder.
#[derive(Clone, Copy, Serialize, Deserialize)]
struct OverlayPlace {
    x: i32,
    y: i32,
    side: f64,
}

#[derive(Default)]
struct Layout {
    // Where the full window was before it became the overlay; Some while compact.
    full: Option<(PhysicalPosition<i32>, PhysicalSize<u32>)>,
    overlay: Option<OverlayPlace>,
}

struct LayoutState(Mutex<Layout>);

fn main_window(app: &AppHandle) -> WebviewWindow {
    app.get_webview_window("main").expect("the main window exists")
}

fn place_file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join("overlay.json"))
}

fn load_place(app: &AppHandle) -> Option<OverlayPlace> {
    let text = fs::read_to_string(place_file(app)?).ok()?;
    serde_json::from_str(&text).ok()
}

// Losing the remembered place is harmless, so write errors are ignored.
fn save_place(app: &AppHandle, place: Option<OverlayPlace>) {
    let Some(file) = place_file(app) else { return };
    match place {
        Some(place) => {
            let _ = fs::create_dir_all(file.parent().unwrap());
            let _ = fs::write(&file, serde_json::to_string(&place).unwrap());
        }
        None => {
            let _ = fs::remove_file(&file);
        }
    }
}

// Read the overlay's place from the window, while it is the overlay.
fn current_place(window: &WebviewWindow) -> tauri::Result<OverlayPlace> {
    let position = window.outer_position()?;
    Ok(OverlayPlace {
        x: position.x,
        y: position.y,
        side: window.inner_size()?.width as f64 / window.scale_factor()?,
    })
}

// The remembered place counts only while its top left is still on a screen;
// otherwise, and the first time, the overlay goes to the bottom right.
fn place_overlay(window: &WebviewWindow, place: Option<OverlayPlace>) -> tauri::Result<()> {
    let side = place.map_or(OVERLAY_SIZE, |place| place.side);
    window.set_size(LogicalSize::new(side, side + OVERLAY_STRIP))?;
    let on_screen = place.filter(|place| {
        window.available_monitors().unwrap_or_default().iter().any(|monitor| {
            let area = monitor.work_area();
            (area.position.x..area.position.x + area.size.width as i32).contains(&place.x)
                && (area.position.y..area.position.y + area.size.height as i32).contains(&place.y)
        })
    });
    let position = match on_screen {
        Some(place) => Some(PhysicalPosition::new(place.x, place.y)),
        None => window.current_monitor()?.map(|monitor| {
            // Bottom right of the screen, clear of the taskbar.
            let area = monitor.work_area();
            let scale = monitor.scale_factor();
            PhysicalPosition::new(
                area.position.x + area.size.width as i32
                    - ((side + OVERLAY_MARGIN) * scale) as i32,
                area.position.y + area.size.height as i32
                    - ((side + OVERLAY_STRIP + OVERLAY_MARGIN) * scale) as i32,
            )
        }),
    };
    if let Some(position) = position {
        window.set_position(position)?;
    }
    Ok(())
}

fn reveal(window: &WebviewWindow) -> tauri::Result<()> {
    window.unminimize()?;
    window.show()?;
    window.set_focus()
}

fn set_compact(app: &AppHandle, compact: bool) -> tauri::Result<()> {
    let window = main_window(app);
    let state = app.state::<LayoutState>();
    let mut layout = state.0.lock().unwrap();
    if compact == layout.full.is_some() {
        return reveal(&window);
    }
    // Restore first: a minimised window reports a meaningless position and size.
    window.unminimize()?;
    if compact {
        layout.full = Some((window.outer_position()?, window.inner_size()?));
        window.set_decorations(false)?;
        window.set_skip_taskbar(true)?;
        window.set_always_on_top(true)?;
        keep_on_top(true);
        // A maximised or double-clicked overlay would lose its shape.
        window.set_maximizable(false)?;
        lock_shape(true);
        place_overlay(&window, layout.overlay)?;
    } else {
        layout.overlay = Some(current_place(&window)?);
        save_place(app, layout.overlay);
        let (position, size) = layout.full.take().unwrap();
        lock_shape(false);
        window.set_maximizable(true)?;
        keep_on_top(false);
        window.set_always_on_top(false)?;
        window.set_skip_taskbar(false)?;
        window.set_decorations(true)?;
        window.set_size(size)?;
        window.set_position(position)?;
    }
    window.emit("compact", compact)?;
    reveal(&window)
}

// Remember the overlay as it is now, for the next start; nothing to do in the full window.
fn remember_overlay(app: &AppHandle) {
    let state = app.state::<LayoutState>();
    let mut layout = state.0.lock().unwrap();
    if layout.full.is_some() {
        if let Ok(place) = current_place(&main_window(app)) {
            layout.overlay = Some(place);
            save_place(app, layout.overlay);
        }
    }
}

// Back to the default size in the bottom right, at once if the overlay is showing.
fn reset_overlay(app: &AppHandle) -> tauri::Result<()> {
    let state = app.state::<LayoutState>();
    let mut layout = state.0.lock().unwrap();
    layout.overlay = None;
    save_place(app, None);
    if layout.full.is_some() {
        place_overlay(&main_window(app), None)?;
    }
    Ok(())
}

fn is_compact(app: &AppHandle) -> bool {
    app.state::<LayoutState>().0.lock().unwrap().full.is_some()
}

#[tauri::command]
fn toggle_compact(app: AppHandle) -> Result<(), String> {
    let compact = is_compact(&app);
    set_compact(&app, !compact).map_err(|e| e.to_string())
}

// Time ran out: bring the timer back from the tray, in whichever shape it had.
#[tauri::command]
fn reveal_window(app: AppHandle) -> Result<(), String> {
    reveal(&main_window(&app)).map_err(|e| e.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = reveal(&main_window(app));
        }))
        .manage(LayoutState(Mutex::new(Layout::default())))
        .invoke_handler(tauri::generate_handler![toggle_compact, reveal_window])
        .setup(|app| {
            app.state::<LayoutState>().0.lock().unwrap().overlay = load_place(app.handle());
            #[cfg(windows)]
            {
                let handle = app.handle().clone();
                let hwnd = main_window(app.handle()).hwnd()?.0 as isize;
                shape::install(hwnd, move || remember_overlay(&handle));
                topmost::install(hwnd);
            }
            let show = MenuItem::with_id(app, "show", "Show timer", true, None::<&str>)?;
            let overlay = MenuItem::with_id(app, "overlay", "Overlay", true, None::<&str>)?;
            let reset = MenuItem::with_id(app, "reset", "Reset overlay size", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &overlay, &reset, &separator, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Visual Timer")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    let _ = match event.id.as_ref() {
                        "show" => set_compact(app, false),
                        "overlay" => set_compact(app, true),
                        "reset" => reset_overlay(app),
                        "quit" => {
                            remember_overlay(app);
                            app.exit(0);
                            Ok(())
                        }
                        _ => Ok(()),
                    };
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let _ = set_compact(tray.app_handle(), false);
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // Closing keeps the timer running in the tray; Quit in the tray menu ends it.
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            // Minimising turns the window into the overlay. Deferred, because the
            // window calls below send their own resize events while this one runs.
            WindowEvent::Resized(_) if window.is_minimized().unwrap_or(false) => {
                let app = window.app_handle().clone();
                let _ = window.app_handle().run_on_main_thread(move || {
                    if !is_compact(&app) {
                        let _ = set_compact(&app, true);
                    }
                });
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running the Visual Timer");
}
