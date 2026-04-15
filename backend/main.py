import json
import os
from typing import AsyncGenerator

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

OLLAMA_URL = "http://localhost:11434"
MODELO = "llama3.2"

# En producción: establece ALLOWED_ORIGINS=https://tiendaaero.com en backend/.env
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*").split(",")

aplicacion = FastAPI(title="ChatboxAero API")

aplicacion.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

SYSTEM_PROMPT = """Eres el asistente virtual de TiendaAero, una tienda especializada en material y equipamiento aeronáutico.

Tu función es ayudar a los clientes con:
- Información sobre productos (drones, piezas, accesorios, instrumentación)
- Consultas sobre pedidos y estado de envíos
- Disponibilidad y precios aproximados
- Recomendaciones según las necesidades del cliente
- Resolución de dudas técnicas básicas sobre los productos

Normas de comportamiento:
- Responde siempre en español, de forma amable y profesional
- Si no tienes información exacta sobre stock o precios en tiempo real, indica que el cliente puede consultar la web o llamar al servicio de atención
- Sé conciso: respuestas de 2-4 frases a menos que se necesite más detalle
- Si el cliente tiene una queja, muestra empatía y ofrece soluciones concretas
- No inventes precios ni disponibilidades concretas que no conozcas

Empieza cada conversación siendo útil y directo."""


class Mensaje(BaseModel):
    role: str  # "user" o "assistant"
    content: str


class PeticionChat(BaseModel):
    mensajes: list[Mensaje]


async def generar_stream(mensajes: list[Mensaje]) -> AsyncGenerator[str, None]:
    mensajes_api = [{"role": "system", "content": SYSTEM_PROMPT}]
    mensajes_api += [{"role": m.role, "content": m.content} for m in mensajes]

    try:
        async with httpx.AsyncClient(timeout=120) as cliente:
            async with cliente.stream(
                "POST",
                f"{OLLAMA_URL}/api/chat",
                json={"model": MODELO, "messages": mensajes_api, "stream": True},
            ) as respuesta:
                async for linea in respuesta.aiter_lines():
                    if not linea:
                        continue
                    datos = json.loads(linea)
                    texto = datos.get("message", {}).get("content", "")
                    if texto:
                        yield f"data: {json.dumps({'texto': texto})}\n\n"
                    if datos.get("done"):
                        break

    except httpx.ConnectError:
        yield f"data: {json.dumps({'error': 'No se pudo conectar con Ollama. Asegúrate de que está ejecutándose en localhost:11434.'})}\n\n"
    except httpx.TimeoutException:
        yield f"data: {json.dumps({'error': 'Tiempo de espera agotado. El modelo tardó demasiado en responder.'})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'error': f'Error interno del servidor: {type(e).__name__}'})}\n\n"

    yield "data: [DONE]\n\n"


@aplicacion.post("/chat/stream")
async def chat_stream(peticion: PeticionChat):
    if not peticion.mensajes:
        raise HTTPException(status_code=400, detail="Se requiere al menos un mensaje")
    if len(peticion.mensajes) > 50:
        raise HTTPException(status_code=400, detail="Demasiados mensajes en el historial")
    for msg in peticion.mensajes:
        if len(msg.content) > 2000:
            raise HTTPException(status_code=400, detail="Mensaje demasiado largo (máximo 2000 caracteres)")

    return StreamingResponse(
        generar_stream(peticion.mensajes),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@aplicacion.get("/")
def inicio():
    return {"mensaje": "ChatboxAero API activa"}
