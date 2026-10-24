// Keeps the overlay's shape while it is resized: the dial area stays square, with
// the drag strip on top. Windows asks before every size change (WM_SIZING while
// dragging an edge, WM_WINDOWPOSCHANGING for everything else, such as snapping;
// WM_NCLBUTTONDBLCLK is swallowed),
// so the window never shows a wrong shape, not even for one frame.

use std::sync::{
    atomic::{AtomicBool, Ordering},
    OnceLock,
};

use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows_sys::Win32::UI::HiDpi::GetDpiForWindow;
use windows_sys::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetClientRect, GetWindowRect, SWP_NOSIZE, WINDOWPOS, WMSZ_BOTTOM, WMSZ_BOTTOMLEFT, WMSZ_LEFT,
    WMSZ_TOPLEFT, WMSZ_TOPRIGHT, WMSZ_TOP, WM_EXITSIZEMOVE, WM_NCLBUTTONDBLCLK, WM_SIZING, WM_WINDOWPOSCHANGING,
};

static LOCKED: AtomicBool = AtomicBool::new(false);
static ON_SETTLED: OnceLock<Box<dyn Fn() + Send + Sync>> = OnceLock::new();

// Turned on before the overlay gets its size and off before the full window gets its own.
pub fn lock(locked: bool) {
    LOCKED.store(locked, Ordering::SeqCst);
}

// `on_settled` runs each time you let go of the overlay after moving or resizing it.
pub fn install(hwnd: isize, on_settled: impl Fn() + Send + Sync + 'static) {
    let _ = ON_SETTLED.set(Box::new(on_settled));
    unsafe { SetWindowSubclass(hwnd as HWND, Some(subclass), 1, 0) };
}

// The frame Windows adds around the web view (resize borders, shadow), in pixels.
unsafe fn frame(hwnd: HWND) -> (i32, i32) {
    let mut window = RECT { left: 0, top: 0, right: 0, bottom: 0 };
    let mut client = window;
    GetWindowRect(hwnd, &mut window);
    GetClientRect(hwnd, &mut client);
    (
        (window.right - window.left) - (client.right - client.left),
        (window.bottom - window.top) - (client.bottom - client.top),
    )
}

unsafe fn strip(hwnd: HWND) -> i32 {
    (crate::OVERLAY_STRIP * GetDpiForWindow(hwnd) as f64 / 96.0).round() as i32
}

unsafe extern "system" fn subclass(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    _data: usize,
) -> LRESULT {
    if LOCKED.load(Ordering::SeqCst) {
        match msg {
            WM_SIZING => {
                let r = &mut *(lparam as *mut RECT);
                let (fw, fh) = frame(hwnd);
                let strip = strip(hwnd);
                let edge = wparam as u32;
                let width = r.right - r.left - fw;
                let height = r.bottom - r.top - fh;
                // Dragging the top or bottom edge sizes by height; any other edge or corner by width.
                let side = if edge == WMSZ_TOP || edge == WMSZ_BOTTOM {
                    height - strip
                } else {
                    width
                };
                let (w, h) = (side + fw, side + strip + fh);
                // The edges you are not dragging stay where they are.
                if matches!(edge, WMSZ_LEFT | WMSZ_TOPLEFT | WMSZ_BOTTOMLEFT) {
                    r.left = r.right - w;
                } else {
                    r.right = r.left + w;
                }
                if matches!(edge, WMSZ_TOP | WMSZ_TOPLEFT | WMSZ_TOPRIGHT) {
                    r.top = r.bottom - h;
                } else {
                    r.bottom = r.top + h;
                }
                return 1;
            }
            // A double-click on the top border would stretch the overlay to the full screen height.
            WM_NCLBUTTONDBLCLK => return 0,
            WM_EXITSIZEMOVE => {
                if let Some(on_settled) = ON_SETTLED.get() {
                    on_settled();
                }
            }
            WM_WINDOWPOSCHANGING => {
                let pos = &mut *(lparam as *mut WINDOWPOS);
                if pos.flags & SWP_NOSIZE == 0 {
                    let (fw, fh) = frame(hwnd);
                    pos.cy = pos.cx - fw + strip(hwnd) + fh;
                }
            }
            _ => {}
        }
    }
    DefSubclassProc(hwnd, msg, wparam, lparam)
}
