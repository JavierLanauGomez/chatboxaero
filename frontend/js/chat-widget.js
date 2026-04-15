/**
 * ChatboxAero — Widget de chat con IA
 * Integración: <script src="chat-widget.js" type="module"></script>
 * Opcional: window.CHATBOX_API = "http://tu-servidor:8000";
 */

(function () {
    const API_BASE = window.CHATBOX_API || "http://localhost:8000";
    const MENSAJE_BIENVENIDA = "¡Hola! Soy el asistente de TiendaAero. ¿En qué puedo ayudarte hoy?";
    const STORAGE_KEY = "chatboxaero_historial";
    const LIMITE_CHARS = 500;

    // ── Inyectar CSS ────────────────────────────────────────────────────────
    const linkCSS = document.createElement("link");
    linkCSS.rel = "stylesheet";
    linkCSS.href = new URL("../css/chat.css", import.meta ? import.meta.url : document.currentScript.src).href;
    document.head.appendChild(linkCSS);

    // ── Cargar marked.js para renderizar Markdown ───────────────────────────
    (function () {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/marked@9/marked.min.js";
        document.head.appendChild(s);
    })();

    // ── HTML del widget ─────────────────────────────────────────────────────
    const contenedor = document.createElement("div");
    contenedor.innerHTML = `
        <!-- Botón flotante -->
        <button id="chatbox-boton" title="Abrir asistente">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>
            </svg>
        </button>

        <!-- Ventana de chat -->
        <div id="chatbox-ventana" class="oculto">
            <div id="chatbox-cabecera">
                <svg viewBox="0 0 24 24" width="32" height="32" style="background:#ffffff22;border-radius:50%;padding:4px;flex-shrink:0">
                    <path fill="white" d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                </svg>
                <div id="chatbox-cabecera-texto">
                    <h3>Asistente TiendaAero</h3>
                    <p>Responde en segundos</p>
                </div>
                <button id="chatbox-limpiar" title="Nueva conversación">🗑</button>
                <button id="chatbox-cerrar">✕</button>
            </div>

            <div id="chatbox-mensajes-contenedor">
                <div id="chatbox-mensajes"></div>
                <button id="chatbox-scroll-abajo" class="oculto" title="Ir al final">↓</button>
            </div>

            <div id="chatbox-contador" class="oculto"></div>

            <div id="chatbox-entrada">
                <textarea
                    id="chatbox-input"
                    placeholder="Escribe tu consulta..."
                    rows="1"
                    maxlength="500"
                ></textarea>
                <button id="chatbox-enviar" title="Enviar">
                    <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(contenedor);

    // ── Referencias DOM ─────────────────────────────────────────────────────
    const boton       = document.getElementById("chatbox-boton");
    const ventana     = document.getElementById("chatbox-ventana");
    const cerrar      = document.getElementById("chatbox-cerrar");
    const limpiar     = document.getElementById("chatbox-limpiar");
    const mensajesEl  = document.getElementById("chatbox-mensajes");
    const scrollBoton = document.getElementById("chatbox-scroll-abajo");
    const contador    = document.getElementById("chatbox-contador");
    const input       = document.getElementById("chatbox-input");
    const enviar      = document.getElementById("chatbox-enviar");

    // ── Estado ──────────────────────────────────────────────────────────────
    let historial = cargarHistorial();  // [{role, content}]
    let respondiendo = false;
    let primeraApertura = true;

    // ── Persistencia (sessionStorage) ───────────────────────────────────────
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

    // ── Utilidades ──────────────────────────────────────────────────────────
    function formatearHora() {
        const ahora = new Date();
        return `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
    }

    // Renderiza texto en el elemento: Markdown si marked está disponible, textContent como fallback
    function renderMarkdown(elemento, texto) {
        if (window.marked) {
            elemento.innerHTML = window.marked.parse(texto);
        } else {
            elemento.textContent = texto;
        }
    }

    // ── Funciones UI ────────────────────────────────────────────────────────

    /**
     * Crea y añade una burbuja de mensaje al chat.
     * @param {string} rol - "usuario" o "asistente"
     * @param {string} texto - contenido del mensaje
     * @param {boolean} aplicarMarkdown - usar marked.js para renderizar (solo asistente)
     * @returns {HTMLElement} el elemento burbuja (para actualización en streaming)
     */
    function agregarBurbuja(rol, texto, aplicarMarkdown = false) {
        const fila = document.createElement("div");
        fila.className = `chatbox-fila ${rol}`;

        const burbuja = document.createElement("div");
        burbuja.className = `chatbox-burbuja ${rol}`;

        if (aplicarMarkdown && texto) {
            renderMarkdown(burbuja, texto);
        } else {
            burbuja.textContent = texto;
        }

        const hora = document.createElement("span");
        hora.className = "chatbox-timestamp";
        hora.textContent = formatearHora();

        fila.appendChild(burbuja);
        fila.appendChild(hora);
        mensajesEl.appendChild(fila);
        scrollAbajo();
        return burbuja;
    }

    // Muestra los tres puntos animados en una burbuja vacía mientras espera el primer token
    function mostrarEscribiendo(burbuja) {
        burbuja.innerHTML = `
            <div class="chatbox-typing-dots">
                <span></span><span></span><span></span>
            </div>`;
    }

    function scrollAbajo() {
        mensajesEl.scrollTop = mensajesEl.scrollHeight;
        scrollBoton.classList.add("oculto");
    }

    function ajustarAlturaInput() {
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 80) + "px";
    }

    function actualizarBotonScroll() {
        const distancia = mensajesEl.scrollHeight - mensajesEl.scrollTop - mensajesEl.clientHeight;
        scrollBoton.classList.toggle("oculto", distancia < 60);
    }

    function actualizarContador() {
        const restantes = LIMITE_CHARS - input.value.length;
        if (restantes <= 50) {
            contador.textContent = `${restantes} caracteres restantes`;
            contador.classList.toggle("limite", restantes <= 10);
            contador.classList.remove("oculto");
        } else {
            contador.classList.add("oculto");
        }
    }

    function limpiarConversacion() {
        if (respondiendo) return;
        historial = [];
        mensajesEl.innerHTML = "";
        sessionStorage.removeItem(STORAGE_KEY);
        agregarBurbuja("asistente", MENSAJE_BIENVENIDA);
    }

    // Reconstruye la UI con los mensajes guardados en sessionStorage
    function restaurarHistorialUI() {
        agregarBurbuja("asistente", MENSAJE_BIENVENIDA);
        for (const msg of historial) {
            const rol = msg.role === "user" ? "usuario" : "asistente";
            agregarBurbuja(rol, msg.content, msg.role === "assistant");
        }
    }

    // ── Abrir/cerrar ────────────────────────────────────────────────────────
    function abrirCerrar() {
        ventana.classList.toggle("oculto");
        if (!ventana.classList.contains("oculto")) {
            if (primeraApertura) {
                primeraApertura = false;
                if (historial.length > 0) {
                    restaurarHistorialUI();
                } else {
                    agregarBurbuja("asistente", MENSAJE_BIENVENIDA);
                }
            }
            setTimeout(() => input.focus(), 200);
        }
    }

    // ── Enviar mensaje ───────────────────────────────────────────────────────
    async function enviarMensaje() {
        const texto = input.value.trim();
        if (!texto || respondiendo || texto.length > LIMITE_CHARS) return;

        // Mostrar mensaje del usuario
        agregarBurbuja("usuario", texto);
        historial.push({ role: "user", content: texto });
        guardarHistorial();

        input.value = "";
        ajustarAlturaInput();
        actualizarContador();

        // Deshabilitar entrada mientras responde
        respondiendo = true;
        enviar.disabled = true;
        input.disabled = true;

        // Burbuja del asistente con indicador de escritura
        const burbujaRespuesta = agregarBurbuja("asistente", "");
        mostrarEscribiendo(burbujaRespuesta);

        let textoRespuesta = "";
        let primerFragmento = true;

        try {
            const respuesta = await fetch(`${API_BASE}/chat/stream`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mensajes: historial }),
            });

            if (!respuesta.ok) {
                throw new Error(`Error ${respuesta.status}`);
            }

            const lector = respuesta.body.getReader();
            const decodificador = new TextDecoder();
            let buffer = "";

            outer: while (true) {
                const { done, value } = await lector.read();
                if (done) break;

                buffer += decodificador.decode(value, { stream: true });
                const lineas = buffer.split("\n");
                buffer = lineas.pop(); // la última puede estar incompleta

                for (const linea of lineas) {
                    if (!linea.startsWith("data: ")) continue;
                    const dato = linea.slice(6).trim();
                    if (dato === "[DONE]") break outer;

                    try {
                        const datos = JSON.parse(dato);

                        // Error enviado desde el backend vía SSE
                        if (datos.error) {
                            burbujaRespuesta.textContent = `⚠️ ${datos.error}`;
                            textoRespuesta = ""; // no persistir error en historial
                            break outer;
                        }

                        const fragmento = datos.texto || "";
                        if (fragmento) {
                            if (primerFragmento) {
                                // Reemplazar typing dots con el texto real
                                burbujaRespuesta.innerHTML = "";
                                primerFragmento = false;
                            }
                            textoRespuesta += fragmento;
                            renderMarkdown(burbujaRespuesta, textoRespuesta);
                            scrollAbajo();
                        }
                    } catch (_) {
                        // Fragmento JSON incompleto, ignorar
                    }
                }
            }

            // Guardar respuesta en historial solo si llegó contenido
            if (textoRespuesta) {
                historial.push({ role: "assistant", content: textoRespuesta });
                guardarHistorial();
            } else {
                // Sin contenido (error SSE o respuesta vacía): quitar el mensaje de usuario para permitir reintento
                historial.pop();
                guardarHistorial();
                if (primerFragmento) {
                    burbujaRespuesta.textContent = "No se recibió respuesta del servidor. Por favor, inténtalo de nuevo.";
                }
            }

        } catch (error) {
            burbujaRespuesta.textContent = "Lo siento, no pude conectarme con el servidor. Por favor, inténtalo de nuevo.";
            historial.pop();
            guardarHistorial();
        } finally {
            respondiendo = false;
            enviar.disabled = false;
            input.disabled = false;
            input.focus();
        }
    }

    // ── Eventos ──────────────────────────────────────────────────────────────
    boton.addEventListener("click", abrirCerrar);
    cerrar.addEventListener("click", abrirCerrar);
    limpiar.addEventListener("click", limpiarConversacion);
    scrollBoton.addEventListener("click", scrollAbajo);

    enviar.addEventListener("click", enviarMensaje);

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            enviarMensaje();
        }
    });

    input.addEventListener("input", () => {
        ajustarAlturaInput();
        actualizarContador();
    });

    mensajesEl.addEventListener("scroll", actualizarBotonScroll);

})();
