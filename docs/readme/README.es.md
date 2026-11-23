**Languages:** [Русский](../../README.md) · [English](./README.en.md) · [简体中文](./README.zh-CN.md) · [Українська](./README.uk.md) · [Tiếng Việt](./README.vi.md) · [हिन्दी](./README.hi.md) · [日本語](./README.ja.md) · [Deutsch](./README.de.md) · [Français](./README.fr.md) · [עברית](./README.he.md) · [العربية](./README.ar.md) · **Español** · [Português (BR)](./README.pt-BR.md) · [한국어](./README.ko.md) · [Türkçe](./README.tr.md) · [Bahasa Indonesia](./README.id.md)

> 📖 **Aplicación guía interactiva (16 idiomas, diseño PDF e historial de versiones):** `AllY-Guide.exe` · [../index.html?lang=es](../index.html?lang=es)

# AllY · Genie (v0.1)

Shell de escritorio local para Windows que reúne varios modelos de IA en una sola ventana con historial de conversación compartido, memoria local en disco, cola de tareas y control de límites.

*Fecha de nacimiento de AllY · Genie: 23 de noviembre de 2026. Licencia: MIT.*

---

## Qué es esta aplicación y qué problema resuelve

Al trabajar con IA a diario, las tareas terminan repartidas entre distintas pestañas del navegador, consolas y claves separadas. Cuando un modelo agota su límite de cinco horas, toca abrir otro y volver a explicar todo el contexto del proyecto.

**AllY · Genie** resuelve cuatro problemas prácticos:

- **Contexto compartido entre modelos.** El historial de conversación y tu base de reglas se guardan localmente en archivos Markdown (`pamyat/`). Puedes cambiar de motor, modelo o profundidad de razonamiento directamente en el campo de entrada para que el siguiente modelo continúe desde el mismo punto.
- **Visibilidad de agentes CLI.** En una terminal normal es difícil ver a tiempo el paso actual del agente e intervenir sobre la marcha. AllY muestra a la izquierda una esfera de estado y el flujo de actividad en vivo tras una línea divisoria vertical suave de ancho ajustable, y a la derecha el chat y la cola de tareas con aclaraciones al vuelo (`live-steer`), edición de cola y prioridad de mensajes importantes.
- **Control de límites y ventana de contexto.** El widget **«Recursos»** muestra el motor principal, el uso del contexto (con umbral de `350k`) y las cuotas de 5 horas y semanales de las suscripciones; la pestaña **«Asistentes»** reúne los saldos del resto de conexiones. Las métricas se leen localmente sin llamadas de pago en segundo plano.
- **Control de datos y conexiones directas.** Las conversaciones, notas en `pamyat/`, habilidades `.claude/skills/` y ajustes locales `.ally-data/` permanecen en tu PC. Usas tus propias suscripciones y claves directamente con tus proveedores.

---

## Para quién está pensada la aplicación

- **Desarrolladores y vibe coders** que trabajan en proyectos con Claude Code, Codex, Antigravity o DeepSeek y quieren ver los pasos de los agentes, la cola y el uso de contexto en una única ventana.
- **Autores, emprendedores y especialistas** que necesitan una memoria local unificada para sus proyectos en su propio equipo.
- **Usuarios de Windows 10/11** que buscan una herramienta local con diseño adaptable a su flujo de trabajo y posibilidad de influir en futuras versiones desde los comentarios integrados.

---

## Qué funciona realmente en la versión 0.1

### 1. Conexiones y modo «Auto»
Para empezar basta con conectar una opción. En el modo **«Auto»**, el sistema elige automáticamente un motor disponible:

| Conexión | Cómo funciona | Qué incluye en v0.1 |
|---|---|---|
| **Claude Code** | CLI oficial con suscripción Anthropic Pro / Max | Tareas complejas, código, textos, planificación y compactación automática de contexto |
| **Codex** | CLI oficial con suscripción ChatGPT Plus / Pro | Trabajo en repositorios y aclaraciones mientras la respuesta está en curso (`live-steer`) |
| **Antigravity** | CLI oficial de Google AI | Análisis con contexto amplio (umbral de `350k`) y seguimiento de cuotas |
| **DeepSeek Harness** | Perfil headless local `dsh` con saldo DeepSeek | Motor de respaldo económico y consulta de saldo en la pestaña «Asistentes» |
| **Agregador API (OpenRouter)** | Cualquier pasarela compatible con Anthropic mediante Base URL y clave | Conexión de modelos externos mediante el proceso local Claude Code CLI (sin suscripción Anthropic) |
| **Qoder CLI** | CLI local (detección e inicio de sesión) | Lo detecta el asistente de conexión (incluido acceso desde la ventana); el rol de motor principal en chat llegará en la próxima actualización |

### 2. Espacio de trabajo e interfaz
- **Pantalla inicial:** a la izquierda abre **«Conversación»** con una esfera limpia sin texto, cinta de pasos y divisor vertical fluido; a la derecha quedan **«Recursos» / «Asistentes»** (arriba) y **«Portátil»** (abajo), con altura totalmente ajustable.
- **Barra superior (de derecha a izquierda):** reloj a la derecha, panel amplio de **comentarios (icono de bicho)**, **pincel** (arrastrar y redimensionar bloques, restablecer diseño), **temas** (**Grafito** por defecto, más Turquesa, Medianoche, Oscuro y Claro), **icono de libro** (guía e historial integrados) y **rayo** (asistente en 3 pasos con **«Modo lectura»** a ancho completo).
- **Almacenamiento local:** `pamyat/` (memoria Markdown local), `.claude/skills/` (habilidades locales), `.ally-data/` (claves y diseño de ventana, excluida de Git).

## Instalación y ejecución (Windows 10/11)

**Antes de instalar, asegúrate de tener instalados y disponibles en `PATH`:**
1. **Node.js 24+** (con soporte para el módulo integrado `node:sqlite`)
2. **Python 3**
3. **Git**
4. Acceso a internet durante la primera compilación (`npm ci` y descarga de Electron) y al menos un motor de IA o clave configurada.

Elige cualquiera de estos tres métodos:

### Método 1 — archivo ZIP y ejecutable `.exe`
1. Descarga el archivo ZIP del repositorio y descomprímelo en una ruta corta sin caracteres cirílicos ni espacios, por ejemplo `C:\AllY`.
2. Haz doble clic en **`AllY.exe`**: en el primer inicio comprobará `node` 24+, `python` y `git`, instalará dependencias, descargará Electron, compilará **`programma\Dzhinni.exe`**, creará el acceso directo **`AllY`** en el escritorio y abrirá la ventana.
  *Si Windows SmartScreen muestra un aviso por ser un `.exe` sin firma, pulsa **Más información → Ejecutar de todas formas** (el código fuente está abierto en `docs/launchers/`, o ejecuta `.\ustanovka.ps1` directamente).*
3. En adelante, inicia la aplicación con doble clic en **`AllY.exe`**, el acceso directo **`AllY`** del escritorio o directamente ejecutando **`programma\Dzhinni.exe`**. Para abrir la guía y el historial de versiones en una ventana propia, abre **`AllY-Guide.exe`**.
4. En el primer arranque se abrirá el asistente de 3 pasos: conecta tu motor de IA y envía tu primer mensaje.

### Método 2 — comandos en la terminal (PowerShell / cmd)
Abre PowerShell y ejecuta en orden:

```powershell
git clone https://github.com/AyarZero/ally-dzhinni.git C:\AllY
cd C:\AllY
.\AllY.exe
```

Para comprobar después si la compilación está lista:

```powershell
.\AllY.exe -Proverka
```

Arrancar desde la terminal:

```powershell
.\AllY.exe
```

### Método 3 — prompt listo para tu IA local
Si ya tienes Claude Code, Codex, Antigravity u otro asistente en tu PC, copia todo este bloque y envíaselo:

```text
Instala y prepara la aplicación de escritorio local AllY · Genie (v0.1) en este PC Windows desde el repositorio https://github.com/AyarZero/ally-dzhinni:
1. Comprueba en la terminal que están disponibles `git`, `python` (Python 3) y `node` (se requiere Node.js 24+ con la prueba `node -e "require('node:sqlite')"` correcta). Si falta algo o la versión de Node es inferior a 24, avísame y ayúdame a instalarlo antes de compilar.
2. Clona el repositorio en una ruta corta sin espacios ni caracteres cirílicos, por ejemplo `C:\AllY`, y entra en esa carpeta.
3. Ejecuta la instalación: `powershell -NoProfile -ExecutionPolicy Bypass -File .\ustanovka.ps1` y espera a que compile `programma\Dzhinni.exe`.
4. Verifica la compilación con `powershell -NoProfile -ExecutionPolicy Bypass -File .\ustanovka.ps1 -Proverka`.
5. Comprueba qué motores CLI (Claude Code, Codex, Antigravity, DeepSeek Harness, Qoder) o claves de OpenRouter ya están disponibles en el sistema e indícame brevemente qué quedó listo.
6. Inicia `programma\Dzhinni.exe` (o `.\AllY.exe`) y avísame cuando pueda abrir la ventana de AllY y empezar a trabajar.
```

*Nota: los agentes CLI conectados trabajan directamente con los archivos de la carpeta abierta sin pedir permiso en cada lectura o cambio; mantén tus proyectos importantes bajo control de versiones con Git.*

---

## Comentarios y participación en el desarrollo

A la derecha de la barra superior (a la izquierda del reloj) está el botón con el **icono de bicho — «Comentarios»**. Desde ahí puedes:

- informar de un fallo, problema visual o error de arranque;
- adjuntar hasta **3 archivos** de respaldo: registros de texto `.txt` / `.md` (hasta `2 MB`), capturas `.png` / `.jpg` / `.jpeg` / `.webp` / `.gif` (hasta `10 MB`) o vídeos cortos `.mp4` / `.webm` / `.mov` (hasta `25 MB`, total máximo `30 MB`);
- proponer un nuevo módulo, habilidad o caso de uso.

Se envían **únicamente el texto del formulario y los archivos seleccionados**: tu historial, notas personales y claves siguen en tu equipo. Las respuestas de los desarrolladores llegan directamente al chat de la app. El código está publicado bajo licencia MIT: puedes crear tus propias habilidades en `.claude/skills/` y contribuir al núcleo.

---

## Problemas conocidos y limitaciones de v0.1 en los que estamos trabajando

Documentamos con total transparencia lo que aún está limitado o en ajuste:

1. **Dependencias previas del sistema:** instalar `v0.1` requiere tener ya instalados `Node.js 24+`, `Python 3` y `Git`; el instalador `.exe` único sin preparación previa sigue en desarrollo.
2. **Entrada y salida de voz ocultas en v0.1 cliente:** los botones de micrófono y voz se ocultaron temporalmente mientras terminamos el reconocimiento local (`GigaAM`) y su instalador.
3. **El Diario («Conversación honesta») está oculto en la compilación v0.1:** el soporte multi-motor sigue en desarrollo y la pestaña se abrirá en una próxima actualización.
4. **Cierre diferido del puente en segundo plano:** al cerrar la ventana, el proceso puente local puede esperar hasta su tiempo de inactividad (hasta ~9 minutos) antes de cerrarse si vuelves a abrir otra instancia enseguida.
5. **Integración de Qoder en curso:** el asistente detecta Qoder CLI y el estado de sesión, pero su uso como motor principal del chat queda habilitado para la próxima versión.
6. **Despliegue en servidor para adjuntos grandes en comentarios:** si al enviar una captura o vídeo el servidor de recepción rechaza el archivo antes de completar su actualización, puedes enviar el informe en texto al momento sin perder el borrador.
7. **Plataforma:** probado y empaquetado solo para **Windows 10/11**.

---

## Hoja de ruta y fechas orientativas

Las fechas son aproximadas: las entregas cercanas se planifican por semanas y las más lejanas por franjas amplias según los comentarios reales de la comunidad:

| Plazo aproximado | Qué está previsto lanzar |
|---|---|
| **Finales de noviembre — principios de diciembre de 2026** *(1–2 semanas)* | Correcciones tras los primeros comentarios en la app, recepción completa de fotos y vídeos en comentarios en servidor, cierre inmediato del puente al cerrar la ventana |
| **Segunda mitad de diciembre de 2026** | Gestor integrado **«Tareas y Proyectos»** (enfoque diario, tablero, calendario, fichas) y compatibilidad del **Diario** con cualquier motor elegido |
| **Enero de 2027** | Regreso del **modo de voz local** (dictado sin nube + lectura en voz alta) e instalador simplificado sin instalación manual previa de `Node.js` y `Git` |
| **Febrero — marzo de 2027** | Sección **«Formación»** (biblioteca de lecciones dentro de la ventana y curso introductorio gratuito sobre AllY y preparación de lanzamientos), creador de widgets personalizados y módulos de revisión/contenido |
| **Abril — mayo de 2027** | **Grafo de conocimiento** interactivo del espacio de trabajo, panel **«Salud del proyecto»** (cobertura de enlaces y notas obsoletas) y Qoder activo como asistente de lectura de código |
| **Junio — julio de 2027** | Beta del **cliente Android** conectado por canal seguro a tu PC doméstico sin segunda base de datos + adaptación de escritorio para macOS y Linux |
| **Agosto de 2027 en adelante** | Lanzamiento estable `v1.0`, catálogo compartido de habilidades de la comunidad y sincronización del espacio de trabajo entre varios equipos del usuario |
