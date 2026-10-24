// No console window next to the app in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    visual_timer_lib::run()
}
