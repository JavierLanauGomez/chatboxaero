# CREAR CHATBOXAERO DESDE CERO
## Guía paso a paso completa

---

## Índice

1. [Planificación del proyecto](#1-planificación-del-proyecto)
2. [Herramientas necesarias](#2-herramientas-necesarias)
3. [Estructura de carpetas](#3-estructura-de-carpetas)
4. [Obtener la API Key de Anthropic](#4-obtener-la-api-key-de-anthropic)
5. [Backend — Configuración inicial](#5-backend--configuración-inicial)
6. [Backend — main.py explicado](#6-backend--mainpy-explicado)
7. [Frontend — CSS del widget](#7-frontend--css-del-widget)
8. [Frontend — JS del widget](#8-frontend--js-del-widget)
9. [Frontend — Página de demo](#9-frontend--página-de-demo)
10. [Script de arranque](#10-script-de-arranque)
11. [Verificación final](#11-verificación-final)
12. [Integrar en TiendaAero](#12-integrar-en-tiendaaero)
13. [Cómo funciona el streaming SSE](#13-cómo-funciona-el-streaming-sse)
14. [Referencia de la API](#14-referencia-de-la-api)
15. [Diagrama de flujo del chat](#15-diagrama-de-flujo-del-chat)
16. [Puntos fuertes del proyecto](#16-puntos-fuertes-del-proyecto)
17. [Puntos de mejora](#17-puntos-de-mejora)
18. [Preguntas frecuentes en entrevista técnica](#18-preguntas-frecuentes-en-entrevista-técnica)

---

## 1. Planificación del proyecto

### ¿Qué es ChatboxAero?

Un widget de chat inteligente para TiendaAero. Aparece como un botón flotante en la esquina inferior derecha de cualquier página web. Al hacer clic, se abre un chat donde el usuario puede hacer preguntas sobre productos, pedidos o cualquier consulta.

Las respuestas las genera **Claude** (el modelo de IA de Anthropic) con un contexto específico de la tienda aeronáutica.

### ¿Por qué se desarrolla por separado?

La estrategia de separar primero y luego integrar tiene varias ventajas:

- **Testear de forma independiente** sin tocar el proyecto principal
- **Reutilizar** el widget en otras páginas o proyectos
- **Facilitar el mantenimiento**: si hay que actualizar Claude o cambiar el modelo, solo tocas este proyecto
- **Evitar romper** lo que ya funciona en TiendaAero

### ¿Qué tecnologías usa?

**Backend:**
- Python + FastAPI (igual que TiendaAero)
- Anthropic Python SDK (cliente oficial de Claude)
- SSE (Server-Sent Events) para streaming en tiempo real

**Frontend:**
- Vanilla JS (sin frameworks, igual que TiendaAero)
- CSS puro con widget flotante
- EventSource / Fetch con streams para recibir texto en tiempo real

---

## 2. Herramientas necesarias

```
Python 3.10+         → lenguaje del backend
pip                  → gestor de paquetes Python
Cuenta en Anthropic  → para obtener la API Key
Navegador moderno    → Chrome, Firefox, Edge (para el widget)
Editor de código     → VS Code, PyCharm, etc.
```

Verificar que Python está instalado:
```bash
python --version
# debe mostrar Python 3.10 o superior
```

---

## 3. Estructura de carpetas

```
ChatboxAero/
├── backend/
│   ├── main.py            ← FastAPI: endpoint de chat con streaming
│   └── requirements.txt   ← dependencias Python
├── frontend/
│   ├── index.html         ← página de demo para probar el widget
│   ├── js/
│   │   └── chat-widget.js ← widget embebible (toda la lógica del chat)
│   └── css/
│       └── chat.css       ← estilos del widget flotante
├── .env.example           ← plantilla de variables de entorno
├── arrancar.bat           ← script de arranque Windows
└── CREAR_DESDE_CERO.md    ← este documento
```

**Filosofía de diseño:**
- `chat-widget.js` es el único archivo que necesitas copiar a otro proyecto
- Se inyecta a sí mismo en cualquier página con una línea: `<script src="chat-widget.js" type="module">`
- El CSS se carga automáticamente desde el JS

---

## 4. Obtener la API Key de Anthropic

1. Ir a [console.anthropic.com](https://console.anthropic.com)
2. Crear una cuenta o iniciar sesión
3. En el menú lateral: **API Keys** → **Create Key**
4. Copiar la clave (empieza por `sk-ant-api03-...`)

> ⚠️ **IMPORTANTE**: Esta clave es secreta. Nunca la pongas directamente en el código ni la subas a GitHub.

Crear el archivo `backend/.env`:
```
ANTHROPIC_API_KEY=sk-ant-api03-XXXXXXXXX
```

---

## 5. Backend — Configuración inicial

### Crear entorno virtual

```bash
cd ChatboxAero
python -m venv venv

# Activar en Windows:
venv\Scripts\activate

# Activar en Linux/Mac:
source venv/bin/activate
```

### Instalar dependencias

```bash
pip install -r backend/requirements.txt
```

**`backend/requirements.txt`:**
```
fastapi==0.135.3
uvicorn==0.44.0
anthropic>=0.40.0
python-dotenv==1.2.2
```

¿Qué es cada paquete?

| Paquete | Para qué sirve |
|---------|---------------|
| `fastapi` | Framework web para crear la API |
| `uvicorn` | Servidor ASGI que ejecuta FastAPI |
| `anthropic` | SDK oficial para llamar a la API de Claude |
| `python-dotenv` | Lee las variables del archivo `.env` |

---

## 6. Backend — main.py explicado

El backend es un único archivo `main.py` que hace tres cosas:

1. **Configura FastAPI** con CORS para que el frontend pueda llamar a la API
2. **Define el System Prompt** que da personalidad al asistente
3. **Crea el endpoint `/chat/stream`** que devuelve texto en tiempo real

### Código completo anotado

```python
import os
import json
from typing import AsyncGenerator

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv()  # Lee backend/.env y carga ANTHROPIC_API_KEY
```

**¿Por qué `load_dotenv()`?**
Carga el archivo `.env` y hace disponibles las variables como variables de entorno de Python. Sin esto, `os.environ.get("ANTHROPIC_API_KEY")` devolvería `None`.

```python
aplicacion = FastAPI(title="ChatboxAero API")

aplicacion.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Permitir cualquier origen (para desarrollo)
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)
```

**¿Qué es CORS?**
Cross-Origin Resource Sharing. Los navegadores bloquean por seguridad las peticiones entre dominios diferentes (por ejemplo, desde `localhost:5500` hacia `localhost:8000`). El middleware de CORS añade las cabeceras HTTP necesarias para que el navegador lo permita.

En producción cambiarías `allow_origins=["*"]` por `allow_origins=["https://tiendaaero.com"]`.

```python
SYSTEM_PROMPT = """Eres el asistente virtual de TiendaAero..."""
```

El System Prompt es la "personalidad" del asistente. Claude lo recibe en cada petición y determina:
- Cómo se comporta (amable, conciso, profesional)
- Qué puede y qué no puede hacer
- En qué idioma responde

```python
cliente_anthropic = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
```

Crea una instancia del cliente de Anthropic. Se crea una sola vez al arrancar (no en cada petición) porque es un objeto costoso de inicializar.

### El modelo de datos

```python
class Mensaje(BaseModel):
    role: str      # "user" o "assistant"
    content: str   # el texto del mensaje

class PeticionChat(BaseModel):
    mensajes: list[Mensaje]   # historial completo de la conversación
```

**¿Por qué mandar el historial completo?**
La API de Claude (como todas las LLM modernas) es **sin estado (stateless)**. No recuerda conversaciones anteriores. Cada petición es independiente. Para que Claude tenga contexto de los mensajes previos, hay que mandárselos todos en cada petición.

Por eso el frontend guarda el historial localmente y lo manda en cada mensaje.

### El endpoint de streaming

```python
async def generar_stream(mensajes: list[Mensaje]) -> AsyncGenerator[str, None]:
    mensajes_api = [{"role": m.role, "content": m.content} for m in mensajes]

    with cliente_anthropic.messages.stream(
        model="claude-opus-4-6",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=mensajes_api,
    ) as stream:
        for texto in stream.text_stream:
            yield f"data: {json.dumps({'texto': texto})}\n\n"

    yield "data: [DONE]\n\n"
```

**¿Por qué `async def` y `yield`?**
Esta función es un generador asíncrono. En vez de calcular toda la respuesta y devolverla de golpe, va generando fragmentos de texto uno a uno (conforme los recibe de Claude) y los envía al cliente inmediatamente.

**Formato SSE:**
Cada fragmento sigue el formato de Server-Sent Events:
```
data: {"texto": "fragmento de texto"}\n\n
```
El doble `\n\n` marca el final de un evento. El navegador lo procesa automáticamente.

**El marcador `[DONE]`:**
Cuando Claude termina de generar, enviamos `data: [DONE]` para que el frontend sepa que ya no hay más texto.

```python
@aplicacion.post("/chat/stream")
async def chat_stream(peticion: PeticionChat):
    if not peticion.mensajes:
        raise HTTPException(status_code=400, detail="Se requiere al menos un mensaje")
    if len(peticion.mensajes) > 50:
        raise HTTPException(status_code=400, detail="Demasiados mensajes en el historial")

    return StreamingResponse(
        generar_stream(peticion.mensajes),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
```

**`StreamingResponse`** es la clase de FastAPI que envía datos en tiempo real. En vez de esperar a tener toda la respuesta, va enviando cada fragmento conforme llega.

**Cabeceras importantes:**
- `Cache-Control: no-cache` → que ningún proxy/navegador almacene el stream en caché
- `X-Accel-Buffering: no` → desactiva el buffering de Nginx (si hay un proxy delante)

---

## 7. Frontend — CSS del widget

El CSS define el aspecto del widget flotante. Está dividido en partes:

### Botón flotante
```css
#chatbox-boton {
    position: fixed;      /* fijo en la pantalla, no sube con el scroll */
    bottom: 24px;
    right: 24px;
    border-radius: 50%;   /* círculo */
    ...
}
```

`position: fixed` es clave: el botón siempre está visible en la misma posición independientemente del scroll de la página.

### Ventana de chat
```css
#chatbox-ventana {
    position: fixed;
    bottom: 90px;   /* justo encima del botón */
    right: 24px;
    width: 360px;
    max-height: 520px;
    ...
}
#chatbox-ventana.oculto {
    opacity: 0;
    pointer-events: none;   /* no recibe clicks cuando está oculto */
    transform: translateY(12px) scale(0.97);
}
```

La clase `.oculto` en vez de `display: none` permite animar la apertura/cierre con una transición CSS suave.

### Burbujas de mensaje
```css
.chatbox-burbuja.usuario {
    align-self: flex-end;     /* alineada a la derecha */
    background: #1a3a5c;
    color: white;
}
.chatbox-burbuja.asistente {
    align-self: flex-start;   /* alineada a la izquierda */
    background: #f0f4f8;
}
```

Con `flexbox` y `align-self`, los mensajes del usuario van a la derecha y los del asistente a la izquierda, como en cualquier aplicación de chat.

---

## 8. Frontend — JS del widget

El widget está envuelto en una **IIFE** (Immediately Invoked Function Expression):

```javascript
(function () {
    // todo el código aquí dentro
})();
```

**¿Por qué una IIFE?**
Para evitar contaminar el espacio global. Las variables dentro de la función no son accesibles desde fuera, por lo que el widget no puede chocar con el código JavaScript de la página donde se embeba.

### Inyección dinámica del CSS

```javascript
const linkCSS = document.createElement("link");
linkCSS.rel = "stylesheet";
linkCSS.href = new URL("../css/chat.css", document.currentScript.src).href;
document.head.appendChild(linkCSS);
```

El widget calcula la ruta del CSS relativa a su propia ubicación. Así funciona aunque se embeba en cualquier página, sin que el desarrollador tenga que añadir manualmente el CSS.

### Estado del chat

```javascript
let historial = [];      // [{role: "user", content: "..."}, ...]
let respondiendo = false; // evita enviar si ya hay una respuesta en curso
```

`historial` es el array que se manda al backend en cada mensaje. Va creciendo con cada intercambio.

### Leer el stream SSE

```javascript
const respuesta = await fetch(`${API_BASE}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mensajes: historial }),
});

const lector = respuesta.body.getReader();
const decodificador = new TextDecoder();
let buffer = "";

while (true) {
    const { done, value } = await lector.read();
    if (done) break;

    buffer += decodificador.decode(value, { stream: true });
    const lineas = buffer.split("\n");
    buffer = lineas.pop(); // última línea puede estar incompleta

    for (const linea of lineas) {
        if (!linea.startsWith("data: ")) continue;
        const dato = linea.slice(6).trim();
        if (dato === "[DONE]") break;

        const { texto: fragmento } = JSON.parse(dato);
        textoRespuesta += fragmento;
        burbujaRespuesta.textContent = textoRespuesta;
    }
}
```

**¿Por qué leer con `getReader()`?**
`fetch` con streaming lee el cuerpo de la respuesta trozo a trozo (`chunks`) conforme llegan los bytes. Es más eficiente que esperar a toda la respuesta.

**El buffer:**
Los chunks de red pueden llegar partidos por la mitad de una línea SSE. El buffer acumula los bytes recibidos y procesa solo las líneas completas (terminadas en `\n`). La última línea (posiblemente incompleta) se guarda en el buffer para el siguiente chunk.

---

## 9. Frontend — Página de demo

`frontend/index.html` es simplemente una página vacía con una tarjeta de información. Su único propósito es probar el widget en un entorno controlado.

Para añadir el widget:
```html
<script type="module" src="js/chat-widget.js"></script>
```

`type="module"` es necesario para que funcione `import.meta.url` dentro del widget (que se usa para calcular la ruta del CSS).

---

## 10. Script de arranque

`arrancar.bat` automatiza el proceso:
1. Comprueba que existe `backend/.env` (y avisa si no)
2. Crea el entorno virtual si no existe
3. Instala las dependencias
4. Arranca el servidor en `localhost:8000`

---

## 11. Verificación final

### Paso 1: Crear el archivo .env
```
backend/.env:
ANTHROPIC_API_KEY=sk-ant-api03-...
```

### Paso 2: Arrancar el backend
```bash
# Activar entorno virtual
venv\Scripts\activate

# Arrancar desde la carpeta backend/
cd backend
uvicorn main:aplicacion --reload --port 8000
```

Verificar que funciona:
- Abrir `http://localhost:8000` → debe responder `{"mensaje": "ChatboxAero API activa"}`
- Abrir `http://localhost:8000/docs` → documentación Swagger automática de FastAPI

### Paso 3: Abrir el frontend

Abrir `frontend/index.html` en el navegador. Necesitas un servidor local (no simplemente abrir el archivo) porque los módulos ES6 (`type="module"`) no funcionan con el protocolo `file://`.

Opciones:
- Extensión **Live Server** de VS Code (botón derecho → "Open with Live Server")
- Python: `python -m http.server 5500` desde la carpeta `frontend/`

### Paso 4: Probar el chat
1. Clic en el botón azul (✈) abajo a la derecha
2. El chat se abre con el mensaje de bienvenida
3. Escribir "¿Qué productos tenéis?" y pulsar Enter
4. El texto de Claude debe aparecer progresivamente (streaming)

---

## 12. Integrar en TiendaAero

Una vez que el chatbox funcione de forma independiente, integrarlo en TiendaAero es trivial.

### Opción A — Widget independiente (recomendada)

El backend de ChatboxAero sigue funcionando en su propio puerto. Solo hay que añadir el widget al HTML de TiendaAero:

```html
<!-- En frontend/index.html de TiendaAero, antes de </body> -->
<script>
    window.CHATBOX_API = "http://localhost:8000";
</script>
<script type="module" src="http://localhost:8000/widget/chat-widget.js"></script>
```

O si copias los archivos al proyecto TiendaAero:
```html
<script type="module" src="js/chat-widget.js"></script>
```

### Opción B — Integrar el router en TiendaAero

Copiar `backend/routers/chat.py` al backend de TiendaAero y registrar el router en `main.py`:

```python
# En main.py de TiendaAero
from routers import ..., chat

aplicacion.include_router(chat.enrutador)
```

Esta opción tiene la ventaja de que el chatbox puede acceder directamente a la base de datos de TiendaAero para dar información en tiempo real sobre stock y pedidos.

---

## 13. Cómo funciona el streaming SSE

```
Usuario escribe "¿Qué drones tenéis?"
          │
          ▼
Frontend: POST /chat/stream
{
  "mensajes": [
    {"role": "user", "content": "¿Qué drones tenéis?"}
  ]
}
          │
          ▼
Backend recibe la petición
          │
          ▼
Backend llama a Claude API con streaming
          │
          ▼ (Claude empieza a generar texto)
Backend: yield "data: {'texto': 'Tenemos'}\n\n"
Backend: yield "data: {'texto': ' varios'}\n\n"
Backend: yield "data: {'texto': ' modelos'}\n\n"
Backend: yield "data: {'texto': ' de drones'}\n\n"
...
Backend: yield "data: [DONE]\n\n"
          │
          ▼
Frontend recibe cada fragmento y lo añade al texto de la burbuja
          │
          ▼
Usuario ve el texto aparecer palabra a palabra en tiempo real
```

**Sin streaming:** el usuario esperaría 3-5 segundos con la pantalla en blanco, y de repente aparecería toda la respuesta de golpe.

**Con streaming:** el texto aparece inmediatamente, palabra a palabra. La experiencia de usuario es mucho mejor.

---

## 14. Referencia de la API

### `POST /chat/stream`

Envía un mensaje al asistente y recibe la respuesta en streaming.

**Request body:**
```json
{
    "mensajes": [
        {"role": "user", "content": "Hola, ¿en qué me puedes ayudar?"}
    ]
}
```

El array `mensajes` debe incluir todo el historial de la conversación (alternando `user` y `assistant`).

**Response:** `text/event-stream` (SSE)
```
data: {"texto": "Hola"}

data: {"texto": "! Soy"}

data: {"texto": " el asistente"}

data: [DONE]
```

**Validaciones:**
- Mínimo 1 mensaje
- Máximo 50 mensajes (para no superar el contexto del modelo)
- El último mensaje debe ser de `role: "user"`

**Errores:**
| Código | Descripción |
|--------|-------------|
| 400 | Sin mensajes o demasiados mensajes |
| 500 | Error al llamar a la API de Anthropic |

### `GET /`

Health check.

**Response:**
```json
{"mensaje": "ChatboxAero API activa"}
```

---

## 15. Diagrama de flujo del chat

```
┌─────────────────────────────────────────────────────────┐
│                      FRONTEND                           │
│                                                         │
│  [Botón flotante] ──click──▶ [Abrir ventana]           │
│                                    │                    │
│                              [Mostrar bienvenida]       │
│                                    │                    │
│  [Input del usuario] ──Enter──▶ [enviarMensaje()]      │
│                                    │                    │
│                    ┌───────────────▼──────────────────┐ │
│                    │  historial.push({role:"user",...}) │ │
│                    │  Crear burbuja usuario             │ │
│                    │  Deshabilitar input                │ │
│                    │  Crear burbuja asistente vacía     │ │
│                    └───────────────┬──────────────────┘ │
│                                    │                    │
│                          POST /chat/stream              │
└────────────────────────────────────┼────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────┐
│                      BACKEND                            │
│                                                         │
│  FastAPI recibe la petición                             │
│        │                                                │
│        ▼                                                │
│  Validar mensajes (1-50)                                │
│        │                                                │
│        ▼                                                │
│  anthropic.messages.stream(                             │
│      model="claude-opus-4-6",                          │
│      system=SYSTEM_PROMPT,                              │
│      messages=[...]                                     │
│  )                                                      │
│        │                                                │
│        ▼ (Claude genera tokens)                         │
│  yield "data: {'texto': fragmento}\n\n"  ──────────────▶│
│  ...                                                    │
│  yield "data: [DONE]\n\n"  ────────────────────────────▶│
└─────────────────────────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────┐
│                      FRONTEND                           │
│                                                         │
│  Recibir fragmento ──▶ burbuja.textContent += fragmento │
│  scrollAbajo()                                          │
│  ...                                                    │
│  Recibir [DONE] ──▶ historial.push({role:"assistant"}) │
│                    Habilitar input                      │
└─────────────────────────────────────────────────────────┘
```

---

## 16. Puntos fuertes del proyecto

### Streaming real en tiempo real
La respuesta de Claude aparece palabra a palabra usando SSE (Server-Sent Events). No hay que esperar a que termine de generar toda la respuesta.

### System Prompt personalizado
El asistente tiene una "personalidad" definida específica para TiendaAero. Sabe que es una tienda aeronáutica, responde en español y sabe qué puede y qué no puede hacer.

### Historial de conversación
El frontend mantiene el historial completo y lo manda en cada petición. Claude tiene contexto de los mensajes anteriores.

### Widget embebible con una línea
Una sola línea de `<script>` añade el chatbox a cualquier página. El widget se inyecta a sí mismo en el DOM y carga su propio CSS.

### Separación clara de responsabilidades
- El backend solo sabe de Claude y de la API
- El frontend solo sabe de la UI y de llamar al backend
- El System Prompt centraliza toda la lógica de negocio del asistente

### Sin dependencias de terceros en frontend
El widget usa Vanilla JS puro. No necesita React, Vue, jQuery ni ninguna librería adicional.

---

## 17. Puntos de mejora

| Mejora | Descripción | Dificultad | Estado |
|--------|-------------|------------|--------|
| **Autenticación** | Proteger el endpoint `/chat/stream` con JWT (igual que TiendaAero) | Media | Pendiente |
| **Rate limiting** | Limitar peticiones por IP para evitar abusos de la API | Baja | Pendiente |
| **Caché de respuestas** | Cachear preguntas frecuentes para ahorrar tokens | Media | Pendiente |
| **Persistencia** | Guardar el historial en sessionStorage para que sobreviva a recargas | Baja | ✅ Implementado |
| **Contexto dinámico** | Pasar stock real, pedidos, etc. al System Prompt consultando la BBDD | Alta | Pendiente |
| **Indicador de escritura** | Mostrar "•••" animado mientras el modelo genera la respuesta | Baja | ✅ Implementado |
| **Feedback de mensajes** | Botones 👍/👎 para valorar respuestas | Media | Pendiente |
| **Multi-idioma** | Detectar idioma del usuario y responder en consecuencia | Baja | Pendiente |
| **Renderizado Markdown** | Mostrar negrita, listas y código con formato real | Baja | ✅ Implementado |
| **Timestamps** | Hora en cada mensaje | Baja | ✅ Implementado |
| **Limpiar conversación** | Botón para resetear el historial | Baja | ✅ Implementado |
| **Scroll al final** | Botón flotante cuando el usuario sube en el historial | Baja | ✅ Implementado |
| **Límite de caracteres** | Contador regresivo y límite de 500 chars en el input | Baja | ✅ Implementado |
| **Errores de Ollama** | Mostrar mensaje claro si Ollama no está ejecutándose | Baja | ✅ Implementado |
| **CORS configurable** | Restringir orígenes vía variable de entorno `ALLOWED_ORIGINS` | Baja | ✅ Implementado |

---

## 18. Preguntas frecuentes en entrevista técnica

### ¿Qué es un LLM y cómo lo estás usando aquí?

Un LLM (Large Language Model) es un modelo de machine learning entrenado para generar texto. Anthropic's Claude es el LLM que usamos. Lo llamamos a través de su API oficial: le mandamos un historial de mensajes y un System Prompt, y él genera la respuesta.

### ¿Por qué usas streaming en vez de una respuesta normal?

Sin streaming, el usuario estaría mirando una pantalla en blanco durante 3-5 segundos. Con streaming, el texto aparece inmediatamente conforme se genera, lo que da una percepción de velocidad mucho mayor. Es exactamente cómo funciona ChatGPT o Claude.ai.

### ¿Qué son los Server-Sent Events (SSE)?

SSE es un protocolo HTTP estándar para que el servidor envíe datos al cliente en tiempo real. A diferencia de WebSockets (bidireccional), SSE es unidireccional (solo servidor → cliente), lo que es perfecto para streaming de texto. Usa el tipo MIME `text/event-stream` y el formato `data: ...\n\n`.

### ¿Cómo evitas que alguien abuse de tu API key?

En este proyecto de demostración, el endpoint es público. En producción habría que:
1. Añadir autenticación (JWT como en TiendaAero)
2. Rate limiting por IP/usuario
3. Nunca exponer la API key en el frontend

### ¿Qué es el System Prompt?

Es una instrucción especial que se le da al modelo antes de la conversación. Define su comportamiento, limitaciones y personalidad. Claude lo usa como contexto persistente en toda la conversación. Es la forma de convertir un modelo genérico en un asistente especializado.

### ¿Por qué mandas el historial completo en cada petición?

Porque la API de Claude es stateless: no recuerda conversaciones pasadas. Cada petición es independiente. Para que Claude tenga contexto, hay que mandarle todos los mensajes anteriores en cada llamada. El historial se mantiene en el frontend (en memoria) y se serializa en cada petición.

### ¿Cómo integrarías el chatbot con la base de datos de TiendaAero?

Añadiendo herramientas (tools/functions) al modelo. Claude puede llamar funciones definidas por nosotros, por ejemplo `consultar_stock(producto_id)`. El backend intercepta esa llamada, consulta la BBDD y devuelve el resultado a Claude para que lo incluya en su respuesta. Así el asistente puede dar información en tiempo real sobre disponibilidad y precios.

---

## 19. Mejoras implementadas

Esta sección documenta las mejoras añadidas a la versión inicial del proyecto.

### 19.1 Renderizado de Markdown (marked.js)

El modelo puede devolver respuestas con formato (`**negrita**`, listas, `` `código` ``). Sin tratamiento, aparecen como texto plano. La solución es cargar `marked.js` desde CDN y usar `innerHTML` en lugar de `textContent` para las burbujas del asistente.

```javascript
// Carga dinámica al arrancar el widget
(function () {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/marked@9/marked.min.js";
    document.head.appendChild(s);
})();

// Renderizar en la burbuja
function renderMarkdown(elemento, texto) {
    if (window.marked) {
        elemento.innerHTML = window.marked.parse(texto);
    } else {
        elemento.textContent = texto; // fallback si CDN falla
    }
}
```

> **Nota de seguridad:** `innerHTML` con contenido no sanitizado es un vector XSS. En este caso el contenido viene del modelo (no del usuario), pero en producción con Tool Use donde se refleja input del usuario, añadir [DOMPurify](https://github.com/cure53/DOMPurify).

---

### 19.2 Indicador de escritura real (typing dots)

Antes, la burbuja del asistente aparecía vacía mientras esperaba el primer token. Ahora muestra tres puntos animados:

```javascript
function mostrarEscribiendo(burbuja) {
    burbuja.innerHTML = `
        <div class="chatbox-typing-dots">
            <span></span><span></span><span></span>
        </div>`;
}
```

```css
.chatbox-typing-dots span {
    width: 7px; height: 7px;
    background: #8899aa;
    border-radius: 50%;
    animation: chatbox-bounce 1.2s infinite ease-in-out;
}
.chatbox-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
.chatbox-typing-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes chatbox-bounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.6; }
    30% { transform: translateY(-6px); opacity: 1; }
}
```

Cuando llega el primer token de texto, los puntos se reemplazan limpiamente:

```javascript
if (primerFragmento) {
    burbujaRespuesta.innerHTML = ""; // eliminar typing dots
    primerFragmento = false;
}
textoRespuesta += fragmento;
renderMarkdown(burbujaRespuesta, textoRespuesta);
```

---

### 19.3 Persistencia del historial (sessionStorage)

El historial se guarda automáticamente en `sessionStorage` tras cada mensaje. Al recargar la página y reabrir el chat, la conversación se restaura.

```javascript
const STORAGE_KEY = "chatboxaero_historial";

function guardarHistorial() {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(historial));
    } catch (_) { /* quota exceeded, ignorar */ }
}

function cargarHistorial() {
    try {
        const guardado = sessionStorage.getItem(STORAGE_KEY);
        return guardado ? JSON.parse(guardado) : [];
    } catch {
        return [];
    }
}
```

`sessionStorage` en lugar de `localStorage`: el historial se borra automáticamente al cerrar la pestaña, lo que es más apropiado para un chat de soporte (privacidad).

---

### 19.4 Manejo de errores de Ollama en el backend

Si Ollama no está ejecutándose, la conexión falla con `ConnectError`. En vez de que FastAPI devuelva un 500 genérico, el error se captura dentro del generador y se envía como un evento SSE especial:

```python
try:
    async with httpx.AsyncClient(timeout=120) as cliente:
        async with cliente.stream(...) as respuesta:
            ...
except httpx.ConnectError:
    yield f"data: {json.dumps({'error': 'No se pudo conectar con Ollama...'})}\n\n"
except httpx.TimeoutException:
    yield f"data: {json.dumps({'error': 'Tiempo de espera agotado...'})}\n\n"
except Exception as e:
    yield f"data: {json.dumps({'error': f'Error interno: {type(e).__name__}'})}\n\n"

yield "data: [DONE]\n\n"  # siempre se envía al final
```

El frontend detecta el campo `error` en el payload SSE y lo muestra en la burbuja:

```javascript
if (datos.error) {
    burbujaRespuesta.textContent = `⚠️ ${datos.error}`;
    textoRespuesta = ""; // no guardar error en historial
    break outer;
}
```

Si hay error, el mensaje del usuario se elimina del historial para que el usuario pueda reintentar.

---

### 19.5 Límite de caracteres con contador

El textarea tiene `maxlength="500"`. Además, cuando quedan menos de 50 caracteres, aparece un contador regresivo:

```javascript
const LIMITE_CHARS = 500;

function actualizarContador() {
    const restantes = LIMITE_CHARS - input.value.length;
    if (restantes <= 50) {
        contador.textContent = `${restantes} caracteres restantes`;
        contador.classList.toggle("limite", restantes <= 10); // rojo al llegar a 10
        contador.classList.remove("oculto");
    } else {
        contador.classList.add("oculto");
    }
}
```

El backend también valida la longitud de cada mensaje (máximo 2000 caracteres) para evitar abusos:

```python
for msg in peticion.mensajes:
    if len(msg.content) > 2000:
        raise HTTPException(status_code=400, detail="Mensaje demasiado largo")
```

---

### 19.6 Botón "limpiar conversación"

Icono 🗑 en la cabecera. Al pulsarlo, limpia el DOM, vacía el historial y el sessionStorage, y muestra de nuevo el mensaje de bienvenida:

```javascript
function limpiarConversacion() {
    if (respondiendo) return; // no interrumpir una respuesta en curso
    historial = [];
    mensajesEl.innerHTML = "";
    sessionStorage.removeItem(STORAGE_KEY);
    agregarBurbuja("asistente", MENSAJE_BIENVENIDA);
}
```

---

### 19.7 Botón scroll al final

Cuando el usuario sube en el historial para releer mensajes anteriores, aparece un botón `↓` en la esquina inferior derecha del área de mensajes:

```javascript
function actualizarBotonScroll() {
    const distancia = mensajesEl.scrollHeight - mensajesEl.scrollTop - mensajesEl.clientHeight;
    scrollBoton.classList.toggle("oculto", distancia < 60);
}

mensajesEl.addEventListener("scroll", actualizarBotonScroll);
scrollBoton.addEventListener("click", scrollAbajo);
```

El contenedor de mensajes necesita `position: relative` para que el botón con `position: absolute` se posicione dentro de él sin que `overflow: hidden` del widget lo recorte.

---

### 19.8 Timestamps en mensajes

Cada burbuja va envuelta en un `.chatbox-fila` con su hora:

```javascript
function agregarBurbuja(rol, texto, aplicarMarkdown = false) {
    const fila = document.createElement("div");
    fila.className = `chatbox-fila ${rol}`;

    const burbuja = document.createElement("div");
    burbuja.className = `chatbox-burbuja ${rol}`;
    // ... render contenido ...

    const hora = document.createElement("span");
    hora.className = "chatbox-timestamp";
    hora.textContent = formatearHora(); // "HH:MM"

    fila.appendChild(burbuja);
    fila.appendChild(hora);
    mensajesEl.appendChild(fila);
    return burbuja; // se devuelve para actualizarlo durante streaming
}
```

Las filas se alinean a izquierda (asistente) o derecha (usuario) con flexbox:

```css
.chatbox-fila.usuario  { align-items: flex-end; }
.chatbox-fila.asistente { align-items: flex-start; }
```

---

### 19.9 CORS configurable por variable de entorno

En desarrollo `allow_origins=["*"]` es cómodo, pero en producción es un riesgo. La solución es leer los orígenes desde una variable de entorno:

```python
# En backend/.env (producción):
# ALLOWED_ORIGINS=https://tiendaaero.com

ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*").split(",")

aplicacion.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    ...
)
```

Sin la variable, sigue funcionando con `*` para desarrollo.
