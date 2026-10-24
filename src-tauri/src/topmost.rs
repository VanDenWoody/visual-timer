// Keeps the overlay above other always-on-top windows, such as one pinned with
// PowerToys Always On Top. Windows orders always-on-top windows among themselves
// by who came last, so a pinned window you click lands on top of the overlay.
// While the overlay shows, it puts itself back on top whenever another program's
// always-on-top window covers it: at once when another window comes to the
// foreground, and otherwise within a quarter second.
// Only windows with a title bar count, so menus, tooltips, the Start menu and the
// taskbar's pop-ups still open over the overlay.

use std::{
    ptr::null_mut,
    sync::atomic::{AtomicBool, AtomicIsize, Ordering},
};

use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows_sys::Win32::System::Threading::GetCurrentProcessId;
use windows_sys::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
use windows_sys::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetWindow, GetWindowLongW, GetWindowRect, GetWindowThreadProcessId, IsWindowVisible, KillTimer,
    SetTimer, SetWindowPos, EVENT_SYSTEM_FOREGROUND, GWL_EXSTYLE, GWL_STYLE, GW_HWNDPREV,
    HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, WINEVENT_OUTOFCONTEXT, WM_TIMER,
    WS_CAPTION, WS_EX_TOPMOST,
};

// Distinct from any timer the window toolkit sets on the same window.
const TIMER_ID: usize = 0x5654;
const CHECK_MS: u32 = 250;

static HWND_OVERLAY: AtomicIsize = AtomicIsize::new(0);
static ACTIVE: AtomicBool = AtomicBool::new(false);

fn hwnd() -> HWND {
    HWND_OVERLAY.load(Ordering::SeqCst) as HWND
}

// Call on the main thread: the hook and the timer report to the thread that sets them up.
pub fn install(hwnd: isize) {
    HWND_OVERLAY.store(hwnd, Ordering::SeqCst);
    unsafe {
        SetWindowSubclass(hwnd as HWND, Some(subclass), 2, 0);
        SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_FOREGROUND,
            null_mut(),
            Some(on_foreground),
            0,
            0,
            WINEVENT_OUTOFCONTEXT,
        );
    }
}

// On while the window is the overlay, off while it is the full window.
pub fn keep_on_top(on: bool) {
    ACTIVE.store(on, Ordering::SeqCst);
    unsafe {
        if on {
            SetTimer(hwnd(), TIMER_ID, CHECK_MS, None);
            raise_if_covered();
        } else {
            KillTimer(hwnd(), TIMER_ID);
        }
    }
}

fn overlaps(a: &RECT, b: &RECT) -> bool {
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

unsafe fn raise_if_covered() {
    if !ACTIVE.load(Ordering::SeqCst) {
        return;
    }
    let ours = hwnd();
    let mut own_rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
    GetWindowRect(ours, &mut own_rect);
    let own_process = GetCurrentProcessId();
    // The windows above the overlay in the z-order.
    let mut above = GetWindow(ours, GW_HWNDPREV);
    while !above.is_null() {
        let mut process = 0;
        GetWindowThreadProcessId(above, &mut process);
        let style = GetWindowLongW(above, GWL_STYLE) as u32;
        let ex_style = GetWindowLongW(above, GWL_EXSTYLE) as u32;
        let mut rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
        GetWindowRect(above, &mut rect);
        if process != own_process
            && IsWindowVisible(above) != 0
            && ex_style & WS_EX_TOPMOST != 0
            && style & WS_CAPTION == WS_CAPTION
            && overlaps(&own_rect, &rect)
        {
            SetWindowPos(ours, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            return;
        }
        above = GetWindow(above, GW_HWNDPREV);
    }
}

unsafe extern "system" fn on_foreground(
    _hook: HWINEVENTHOOK,
    _event: u32,
    _hwnd: HWND,
    _object: i32,
    _child: i32,
    _thread: u32,
    _time: u32,
) {
    raise_if_covered();
}

unsafe extern "system" fn subclass(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    _data: usize,
) -> LRESULT {
    if msg == WM_TIMER && wparam == TIMER_ID {
        raise_if_covered();
        return 0;
    }
    DefSubclassProc(hwnd, msg, wparam, lparam)
}
