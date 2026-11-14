use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Serialize, Default)]
struct Detected {
    gta_paths: Vec<String>,
    fivem_paths: Vec<String>,
    codewalker: Option<String>,
    codewalker_keys_folder: bool,
    ffmpeg: Option<String>,
}

fn drives() -> Vec<String> {
    ('C'..='H').map(|c| format!("{}:\\", c)).filter(|d| Path::new(d).exists()).collect()
}

fn gta_candidates() -> Vec<PathBuf> {
    let mut v = Vec::new();
    for d in drives() {
        for rel in [
            "Program Files\\Rockstar Games\\Grand Theft Auto V",
            "Program Files (x86)\\Rockstar Games\\Grand Theft Auto V",
            "Rockstar Games\\Grand Theft Auto V",
            "Program Files\\Epic Games\\GTAV",
            "Program Files (x86)\\Steam\\steamapps\\common\\Grand Theft Auto V",
            "Program Files\\Steam\\steamapps\\common\\Grand Theft Auto V",
            "Steam\\steamapps\\common\\Grand Theft Auto V",
            "SteamLibrary\\steamapps\\common\\Grand Theft Auto V",
            "Games\\Grand Theft Auto V",
        ] {
            v.push(Path::new(&d).join(rel));
        }
    }
    // Bibliotecas adicionales de Steam (libraryfolders.vdf)
    for d in drives() {
        for rel in ["Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf", "Program Files\\Steam\\steamapps\\libraryfolders.vdf"] {
            if let Ok(text) = std::fs::read_to_string(Path::new(&d).join(rel)) {
                for line in text.lines() {
                    let l = line.trim();
                    if l.starts_with("\"path\"") {
                        if let Some(p) = l.split('"').nth(3) {
                            v.push(Path::new(&p.replace("\\\\", "\\")).join("steamapps").join("common").join("Grand Theft Auto V"));
                        }
                    }
                }
            }
        }
    }
    v
}

fn which(exe: &str) -> Option<PathBuf> {
    let paths = std::env::var_os("PATH")?;
    std::env::split_paths(&paths).map(|p| p.join(exe)).find(|p| p.is_file())
}

fn codewalker_candidates() -> Vec<PathBuf> {
    let mut v = Vec::new();
    let mut roots: Vec<PathBuf> = Vec::new();
    for d in drives() {
        for rel in ["CodeWalker", "Program Files\\CodeWalker", "Tools\\CodeWalker", "Games\\CodeWalker"] {
            roots.push(Path::new(&d).join(rel));
        }
    }
    if let Some(h) = std::env::var_os("USERPROFILE") {
        let h = PathBuf::from(h);
        for rel in ["Downloads", "Desktop", "Documents", "Downloads\\CodeWalker", "Desktop\\CodeWalker"] {
            roots.push(h.join(rel));
        }
    }
    for r in roots {
        v.push(r.join("CodeWalker.exe"));
        if let Ok(rd) = std::fs::read_dir(&r) {
            for e in rd.flatten() {
                if e.path().is_dir() {
                    v.push(e.path().join("CodeWalker.exe"));
                }
            }
        }
    }
    v
}

#[tauri::command]
fn detect_environment() -> Detected {
    let mut d = Detected::default();
    for p in gta_candidates() {
        if p.join("GTA5.exe").is_file() || p.join("x64").join("audio").join("sfx").is_dir() {
            let s = p.to_string_lossy().to_string();
            if !d.gta_paths.contains(&s) {
                d.gta_paths.push(s);
            }
        }
    }
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        let f = PathBuf::from(local).join("FiveM");
        if f.is_dir() {
            d.fivem_paths.push(f.to_string_lossy().to_string());
        }
    }
    for p in codewalker_candidates() {
        if p.is_file() {
            d.codewalker_keys_folder = p.parent().map(|x| x.join("Keys").is_dir()).unwrap_or(false);
            d.codewalker = Some(p.to_string_lossy().to_string());
            break;
        }
    }
    d.ffmpeg = which("ffmpeg.exe").map(|p| p.to_string_lossy().to_string());
    d
}

#[tauri::command]
fn check_tool(path: String) -> bool {
    Path::new(&path).is_file()
}

/// Ejecuta ffmpeg y devuelve el error real (stderr) si falla.
#[tauri::command]
fn run_ffmpeg(ffmpeg: Option<String>, input: String, output: String, sample_rate: u32) -> Result<(), String> {
    let exe = ffmpeg
        .filter(|p| !p.is_empty())
        .or_else(|| which("ffmpeg.exe").map(|p| p.to_string_lossy().to_string()))
        .ok_or_else(|| "FFmpeg no encontrado. Instálalo (https://ffmpeg.org) y añádelo al PATH, o indica su ruta en Configuración.".to_string())?;
    let out = Command::new(exe)
        .args(["-y", "-i", &input, "-vn", "-ac", "1", "-ar", &sample_rate.to_string(), "-c:a", "pcm_s16le", &output])
        .output()
        .map_err(|e| format!("No se pudo ejecutar FFmpeg: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).to_string())
    }
}

/// Abre CodeWalker (herramienta externa). CodeWalker no tiene interfaz de línea de comandos para importar.
#[tauri::command]
fn launch_external(path: String) -> Result<(), String> {
    if !Path::new(&path).is_file() {
        return Err("La ruta no existe".into());
    }
    let dir = Path::new(&path).parent().map(|p| p.to_path_buf());
    let mut c = Command::new(&path);
    if let Some(d) = dir {
        c.current_dir(d);
    }
    c.spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![detect_environment, check_tool, run_ffmpeg, launch_external])
        .run(tauri::generate_context!())
        .expect("error al iniciar 444CFG SOUND STUDIO");
}
