fn main() {
    // `tauri icon` rewrites these files, but the crate itself does not change —
    // without an explicit edge cargo treats the build as fresh and keeps the
    // previously embedded icon, so a regenerated icon only showed up after a
    // manual clean. Recompile the Windows resource whenever the icon changes.
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/icon.png");
    tauri_build::build()
}
