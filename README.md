# ChatboxAero

Chatbot con streaming en tiempo real integrado en cualquier web. Usa Ollama para ejecutar modelos de lenguaje localmente — sin API keys, sin coste por token, sin dependencias de terceros.

![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat&logo=fastapi&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-llama3.2-000000?style=flat&logo=ollama&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=flat&logo=javascript&logoColor=black)

---

## Descripción

ChatboxAero es un widget de chat embebible que conecta con un modelo LLM local a través de [Ollama](https://ollama.com). El backend hace de puente entre el navegador y Ollama usando **Server-Sent Events (SSE)** para transmitir la respuesta token a token, igual que ChatGPT.

El frontend es un widget de chat autónomo — sin frameworks, sin dependencias npm — que se añade a cualquier página con una sola etiqueta `<script>`.

---

## Stack tecnológico

| Capa | Tecnología | Motivo |
|------|-----------|--------|
| Modelo LLM | Ollama + llama3.2 | Local, gratuito, sin latencia de red |
| Backend | Python + FastAPI | SSE nativo con `StreamingResponse` |
| Frontend | HTML + CSS + JS Vanilla | Widget embebible sin dependencias |
| Renderizado | marked.js (CDN) | Markdown en las respuestas del modelo |

---

## Funcionalidades

### Widget de chat
- **Streaming token a token** vía Server-Sent Events — la respuesta aparece progresivamente
- **Indicador de escritura** animado (tres puntos rebotando) mientras el modelo genera
- **Renderizado de Markdown** en las respuestas del asistente (negrita, código, listas…)
- **Persistencia de conversación** en `sessionStorage` — el historial sobrevive a recargas dentro de la misma sesión de navegador
- **Contador de caracteres** con límite configurable (por defecto 2 000 caracteres)
- **Botón de limpiar** conversación
- **Botón de scroll** al final cuando el usuario ha subido en el historial
- **Timestamps** en cada mensaje
- **Respuestas de error amigables** cuando Ollama no está disponible

### Backend
- `POST /chat` — recibe `{ mensaje, historial }` y devuelve un stream SSE
- Manejo de errores de conexión con Ollama (`httpx.ConnectError`, `TimeoutException`)
- Campo `error` en el stream SSE para comunicar fallos al frontend sin romper la conexión
- `ALLOWED_ORIGINS` configurable por variable de entorno (CORS)
- Validación de longitud de mensaje en servidor

---

## Estructura del proyecto

```
ChatboxAero/
├── backend/
│   └── main.py              # FastAPI + endpoint /chat con SSE
├── frontend/
│   ├── index.html           # Demo / página de prueba
│   ├── css/
│   │   └── chat.css         # Estilos del widget
│   └── js/
│       └── chat-widget.js   # Lógica completa del widget
└── CREAR_DESDE_CERO.md      # Guía de construcción paso a paso
```

---

## Puesta en marcha

### Requisitos
- Python 3.11+
- [Ollama](https://ollama.com/download) instalado y ejecutándose
- Modelo `llama3.2` descargado

### 1. Instalar el modelo en Ollama

```bash
ollama pull llama3.2
```

### 2. Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install fastapi uvicorn httpx python-dotenv

uvicorn main:aplicacion --reload
```

El servidor arranca en `http://127.0.0.1:8000`.

### 3. Frontend

Abrir `frontend/index.html` en el navegador (con Live Server o similar para evitar restricciones CORS).

---

## Cómo funciona el streaming

```
Navegador                 Backend (FastAPI)           Ollama
    |                           |                        |
    |-- POST /chat ------------>|                        |
    |   { mensaje, historial }  |-- POST /api/chat ----->|
    |                           |   stream: true         |
    |<-- SSE stream ------------|<-- tokens -------------|
    |   data: hola              |                        |
    |   data:  mundo            |                        |
    |   data: [DONE]            |                        |
```

El backend abre una conexión de streaming con Ollama y va reenviando cada token al navegador como un evento SSE. El frontend acumula los tokens y los renderiza progresivamente en el burbuja del asistente.

---

## Embeber en otra web

```html
<!-- 1. Añadir el CSS -->
<link rel="stylesheet" href="ruta/a/chat.css">

<!-- 2. Añadir el contenedor del widget en el HTML -->
<div id="chatbox-contenedor">
  <!-- el widget se renderiza aquí -->
</div>

<!-- 3. Añadir el script al final del body -->
<script src="ruta/a/chat-widget.js"></script>
```

---

## Variables de entorno

```env
ALLOWED_ORIGINS=http://localhost:3000,https://mi-sitio.com
OLLAMA_URL=http://localhost:11434
```

---

## Documentación extendida

`CREAR_DESDE_CERO.md` cubre todo el proceso de construcción: desde la instalación de Ollama hasta cada decisión de diseño del widget, incluyendo por qué se usa SSE en lugar de WebSockets y cómo funciona el protocolo de streaming.
