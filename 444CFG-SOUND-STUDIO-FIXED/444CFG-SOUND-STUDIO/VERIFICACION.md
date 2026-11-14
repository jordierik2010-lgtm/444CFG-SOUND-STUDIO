# Relación de funciones verificadas

Fecha de verificación: 14-nov-2026. Entorno: Linux, Node 22, TypeScript 5 (sin Rust, sin red).
Comando: `RPF_DIR=<carpeta con los 4 RPF> npm test` → **29 pruebas, 29 correctas** (ejecutadas de verdad).

## ✅ Verificado con ejecución (núcleo `src/core`, pruebas en `tests/`)
| Función | Cómo se comprobó |
|---|---|
| Lectura RPF7 (cabecera, nº de entradas, tipo de cifrado) | Los 4 RPF reales: todos «NG», índice no legible sin claves |
| Localización de bancos AWC sin cifrar | 32 bancos (6 + 14 + 4 + 8) detectados en los 4 RPF; criterio estricto (alineado a 512, parseo completo, tabla coherente) |
| Lector AWC (cabecera, streams, chunks, formato) | 32/32 parseados; 5.428 streams con audio → todos PCM16 LE mono (codec 0) |
| **Reconstrucción AWC byte a byte** | `buildAwc(parseAwc(x)) == x` en los 32 bancos |
| Validación AWC | `validateAwc` sobre los 32 bancos |
| Sustitución de un stream en un AWC real | Se lee de vuelta idéntico, el resto de streams y todos los IDs quedan intactos |
| Parche en sitio dentro del RPF | Longitud y TOC idénticos; solo cambian bytes dentro del hueco; AWC resultante re-parsea. Rechaza correctamente un AWC que no cabe |
| WAV (lectura 8/16/24/32 bit y float, escritura PCM16) | Ida y vuelta |
| DSP: volumen, normalizar, remuestreo, pitch (WSOLA), velocidad, graves, eco, reverb, fade, trim, mezcla | 10 pruebas numéricas (frecuencia por cruces por cero, RMS, longitudes) |
| Instalación segura: backup, manifiesto, hash, historial, desinstalación | 6 pruebas con sistema de archivos real: restaura el original exacto, no toca archivos ajenos, no sobrescribe backups, detecta cambios externos y backups dañados, exige confirmación |
| Clasificación por nombre y diccionario joaat | `joaat('adder')=0xB779A091`; clasificación solo con nombre resuelto |
| Proyecto (serialización/validación) | Ida y vuelta |
| Sintaxis de todo el TS/TSX | 0 errores de sintaxis; `tsc --strict` limpio sobre `src/core` |

## ⚠️ Escrito pero NO ejecutado (no hay forma de hacerlo en este entorno)
- Interfaz React completa (`src/pages`, `src/components`): no se ha arrancado ni tipado contra `react`/`@tauri-apps`. Puede haber errores de tipos o de ejecución que solo aparecerán en `npm run typecheck` / al ejecutar.
- Backend Rust (`src-tauri/src/lib.rs`): **no compilado** (no hay `cargo`).
- Compilación Tauri, instalador NSIS, nombre `444CFG-Sound-Studio.exe`, icono: no probados.
- Workflow de GitHub Actions: no ejecutado.
- Reproducción Web Audio, pausa, bucle, waveform interactiva, previsualización de efectos en la UI.
- Importación MP3/OGG (Web Audio) y conversión con FFmpeg.
- Detección de GTA V / FiveM / CodeWalker (Windows).
- Instalación sobre un GTA V real y funcionamiento en el juego de un banco parcheado.
- Recurso FiveM exportado (no probado en un servidor/cliente).
- Carga del diccionario de nombres con datos reales (solo probado con nombres de ejemplo).
