# 444CFG SOUND STUDIO · GTA V / FIVEM AUDIO EDITOR · v1.0.0

Editor de bancos de audio AWC de GTA V con interfaz Tauri 2 + React + TypeScript. Lee las muestras reales, reproduce, sustituye (WAV/MP3/OGG → PCM16), aplica efectos, mezcla, exporta AWC/RPF y gestiona backups e instalación.

> Lee primero **VERIFICACION.md** (qué se ha ejecutado de verdad) y **LIMITACIONES.md**. El informe de tus RPF está en **docs/ANALISIS_RPF.md**.

## Estructura
- `src/core/` motor sin dependencias de UI (AWC, RPF, WAV, DSP, instalación, clasificación, proyectos) — **probado**.
- `src/pages`, `src/components`, `src/store.tsx` interfaz.
- `src-tauri/` backend Rust mínimo (detección de rutas, FFmpeg, lanzar CodeWalker). Archivos y hashes se manejan desde TypeScript (plugin-fs + WebCrypto).
- `tests/` pruebas (`npm test`). Las que usan RPF reales se omiten si no defines `RPF_DIR`.
- `public/logo.png` logo original sin modificar; los iconos de `src-tauri/icons` se generan reescalando ese PNG.

## Compilar con GitHub Actions
1. Sube la carpeta a un repositorio de GitHub (rama `main`).
2. Ve a *Actions → Build Windows → Run workflow*.
3. Descarga los artefactos: `444CFG-Sound-Studio-installer` (NSIS) y `444CFG-Sound-Studio-exe` (444CFG-Sound-Studio.exe suelto, requiere WebView2).
El workflow hace `npm install`, `typecheck`, `npm test`, `cargo check`, `tauri build`. Si falla el typecheck, corrige los errores que indique: la UI no se pudo tipar durante el desarrollo.

## Compilar en local (Windows)
Requisitos: Node 22+, Rust estable, WebView2.
```
npm install
npm run typecheck
RPF_DIR=C:\ruta\con\los\rpf npm test
npm run tauri build -- --bundles nsis
```

## Uso rápido
1. *Sound Pack Editor* → IMPORTAR SOUND PACK (.rpf/.awc).
2. (Opcional) *Configuración → Diccionario de nombres* para ver nombres y activar Death/Footsteps/Weapons.
3. Selecciona un sonido → IMPORTAR AUDIO → efectos → GUARDAR CAMBIOS.
4. *Exportar* → comprobación previa → EXPORT AWC / EXPORT RPF / SOUNDPACK / FIVEM.
5. *Guardar proyecto* en Inicio.
Discord: https://discord.gg/444cfg

## Dependencias y licencias
React (MIT), Tauri (MIT/Apache-2.0), Vite (MIT). FFmpeg y CodeWalker son herramientas externas opcionales que el usuario instala; no se distribuyen con la app. No se incluye ninguna clave NG.
