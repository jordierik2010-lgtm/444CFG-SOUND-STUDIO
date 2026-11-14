# Limitaciones reales

1. **Índice RPF cifrado (NG).** Sin claves no se leen los nombres de los archivos internos ni se puede reescribir el RPF completo. No se piden ni distribuyen claves. Los bancos AWC se localizan por firma `ADAT`; solo se ven los que están sin cifrar (hay zonas de alta entropía en los RPF que no se han podido interpretar).
2. **Exportar RPF = parche en sitio.** Solo sustituye AWC dentro de su hueco original (≤ tamaño original del AWC; el relleno libre es de 116–494 bytes en las muestras). Si el audio nuevo hace crecer el banco, se rechaza. Alternativa: «Export AWC» y reimportarlo con CodeWalker (RPF Explorer). CodeWalker no tiene interfaz de línea de comandos: la app solo lo localiza y lo abre.
3. **Nombres y categorías.** Los AWC identifican los sonidos por hash de 29 bits. Death/Footsteps/Weapons se rellenan solo con (a) un diccionario de nombres que cargues (.txt, un nombre por línea) o (b) etiquetando un banco entero a mano en el Sound Pack Editor. Sin ninguna de las dos, esas pantallas están vacías a propósito. Las reglas por palabras clave (`src/core/classify.ts`) son heurísticas y pueden clasificar mal.
4. **Codecs.** Solo PCM16 mono (codec 0) — es el único que aparece en las muestras. Otros codecs, multicanal y streams sin chunk de audio (p. ej. 14 streams con chunk 0x68 en un banco de RESIDENT_1) se muestran como no editables y se conservan intactos.
5. **Chunks extra (0x36, 0xBD, 0x68)** se conservan tal cual; su significado exacto no está verificado. Si un stream tiene marcadores 0x36 y cambias su duración, los marcadores no se reescalan.
6. **Frecuencias.** Se guarda en el AWC la frecuencia del stream original (por defecto) o la elegida en Configuración. Las muestras usan valores no estándar (p. ej. 26001, 24027 Hz); se conservan.
7. **REL / dat54 / dat151:** no se leen ni se editan. El recurso FiveM exportado no sustituye sonidos por sí solo (la línea `data_file` va comentada a propósito) y no está verificado en el juego.
8. **Instalación:** solo en GTA V (`x64\audio\sfx`). Con FiveM no se instala automáticamente. Modificar archivos del juego puede causar bloqueos o sanciones online.
9. **OAC y carpetas:** `.oac` se trata como AWC (no verificado con un archivo real). Las carpetas se recorren hasta 3 niveles buscando .rpf/.awc/.oac.
10. **Rendimiento:** los RPF se cargan enteros en memoria (167 MB en las muestras).
