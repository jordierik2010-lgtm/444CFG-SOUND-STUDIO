# Informe de la ronda de corrección (14-nov-2026)

## Entorno de esta ronda
Linux, Node 22.23, **sin Rust/cargo, sin acceso a red (no se pudo hacer `npm install`) y sin tus 4 RPF** (solo llegó el ZIP del proyecto).
Por eso solo se pudo ejecutar el núcleo (`src/core`): `npm test` → **29 pruebas: 20 correctas, 0 fallos, 9 omitidas** (las 9 omitidas son las que leen RPF reales y necesitan `RPF_DIR`).

## Cambios hechos
1. **Workflow** (`.github/workflows/build-windows.yml`): Node 20 → **22**; añadido `cargo check`; el exe se publica como `444CFG-Sound-Studio.exe` y el instalador como `444CFG-Sound-Studio-Setup.exe` (artefactos separados, fallan si no existen); adjunta ambos a una Release al subir una etiqueta `v*`.
2. **Cargo.toml**: el paquete se llamaba `444CFG-Sound-Studio`; Cargo rechaza nombres de paquete que empiezan por dígito. Ahora el paquete es `cfg444-sound-studio`; el binario sigue siendo `444CFG-Sound-Studio`.
3. **Bug en el editor de audio** (`StreamTools.tsx`): los datos de audio se recalculaban en cada render, lo que reiniciaba efectos/selección/deshacer continuamente y podía provocar un bucle de renders. Ahora están memorizados. Además, tras «Guardar cambios» ya no se vuelven a aplicar los efectos sobre un audio que ya los llevaba.
4. **Reproductor** (`audio.ts`): tras el desmontaje se reutilizaba un `AudioContext` cerrado (fallo con React StrictMode); ahora se descarta.
5. `Waveform.tsx`: tipo de evento importado explícitamente (evita un posible error de tipado).

## NO verificado (requiere Windows / GitHub Actions)
- `npm run typecheck` de la interfaz (React/Tauri no instalados aquí): **puede seguir habiendo errores de tipos**.
- Compilación Rust y Tauri, exe, instalador NSIS, y el propio workflow: **no ejecutados**. No se afirma que compile.
- Reproducción, forma de onda, efectos y mezclador en la interfaz; detección de GTA V/FiveM/CodeWalker; importación MP3/OGG.
- Pruebas con tus 4 RPF en esta ronda (la ronda anterior las ejecutó; ver VERIFICACION.md, no repetidas aquí).
- Cualquier uso dentro de GTA V / FiveM.

## Sin resolver (limitación real)
- Exportar un AWC **más grande** que su hueco dentro de un RPF cifrado (NG) no es posible sin reescribir el índice cifrado; la app no incluye claves. Alternativa válida: «EXPORT AWC» y sustituirlo con CodeWalker (RPF Explorer → Import), paso manual; CodeWalker no tiene línea de comandos.
- Death/Footsteps/Weapons solo se rellenan con un diccionario de nombres o etiquetado manual de bancos; no se inventan identificaciones.

## Siguiente paso
Sube el proyecto a GitHub, ejecuta *Actions → Build Windows* y pásame el log si algún paso falla (typecheck, cargo o tauri): lo corregiré con el error real.
