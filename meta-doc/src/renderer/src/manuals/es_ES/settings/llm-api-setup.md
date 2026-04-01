# Guía rápida: API LLM ✨

Para usar el chat, la corrección o el agente en MetaDoc necesitas una **API LLM operativa** en ajustes 📡. Esta página va de conceptos → qué rellenar en MetaDoc → cómo activar proveedores habituales → solución de problemas → FAQ para principiantes.

> **⚠️ Aviso**: Salvo **Ollama** local 🦙, proveedores como OpenRouter, OpenAI, Google, Alibaba Cloud, DeepSeek y agregadores como **4sapi** son **servicios de terceros**. Facturación, cumplimiento, seguridad de la cuenta y privacidad son entre tú y ese proveedor; MetaDoc solo envía peticiones compatibles como cliente.

## 📋 De un vistazo: comparar tipos de proveedor


| Tipo | Icono | Ideal para 👤 | Ventajas ✨ | Compromisos ⚖️ |
| :--- | :---: | :--- | :--- | :--- |
| **Gratis integrado (OpenRouter)** | ![OpenRouter](https://www.google.com/s2/favicons?domain=openrouter.ai&sz=64) | Probar por primera vez | 🎁 Sin configuración—prueba sin tu propia clave | 📉 Cuota mínima; puede haber límites de velocidad—añade tu clave para trabajo real |
| **Compatible con OpenAI** | ![OpenAI](https://www.google.com/s2/favicons?domain=openai.com&sz=64) | Puertas de enlace, OpenRouter, espejos regionales | 🔧 Muy flexible: URL base + clave + modelo | 📚 La “compatibilidad” varía—revisa la documentación |
| **OpenAI oficial** | ![OpenAI](https://www.google.com/s2/favicons?domain=openai.com&sz=64) | Facturación oficial de OpenAI | 🚀 Modelos punteros, ecosistema maduro | 💳 Precios y política regional según OpenAI |
| **DeepSeek** | ![DeepSeek](https://www.google.com/s2/favicons?domain=deepseek.com&sz=64) | Presupuesto ajustado, mucho chino | 💰 Buena relación calidad-precio, API sencilla | ⏱️ Cuotas/límites según consola—protege tu clave |
| **Google Gemini** | ![Gemini](https://www.google.com/s2/favicons?domain=ai.google.dev&sz=64) | Multimodal / stack Google | 🖼️ Amplia familia de modelos, iteración rápida | 🌍 Cuenta Google y política de API; regiones según Google |
| **Qwen (DashScope)** | ![Alibaba](https://www.google.com/s2/favicons?domain=aliyun.com&sz=64) | Región China estable, empresas | 🇨🇳 Baja latencia, fuerte en chino | ☁️ Activa el producto DashScope correcto; endpoint y región coherentes |
| **Ollama (local)** | ![Ollama](https://www.google.com/s2/favicons?domain=ollama.com&sz=64) | Privacidad / uso cercano a sin conexión | 🔒 Sin facturación cloud por token (electricidad/HW aparte) | 💾 Disco y GPU; solo CPU es lento; modelos pequeños pueden parecer débiles |

**En una frase**: **comodidad y modelos punteros** → cloud oficial o agregadores compatibles ☁️; **coste / chino** → DeepSeek, Qwen, etc. 💰; **privacidad y control** → Ollama—a costa de hardware y capacidad bruta 🦙; **probar gratis primero** → ruta gratuita integrada—no esperes carga diaria intensa 🎁.

---

## 🧭 Tres cosas que hacer en MetaDoc

<SettingLlmSection mode="demo" />

1. **Elegir o crear un perfil** (compatible OpenAI o DeepSeek es un buen inicio) 🃏.
2. Pegar la **clave API** 🔑 y, si hace falta, la **URL base** y el id del **modelo**.
3. Pulsar **Comprobar configuración** ✅ para probar conectividad y autenticación.

---

## 🌐 Ruta A — OpenRouter (todo en uno, compatible OpenAI)

OpenRouter agrega muchos modelos tras una **URL base compatible OpenAI**—útil si quieres recordar un solo endpoint 🎯.

### 1️⃣ Registro

Abre [OpenRouter](https://openrouter.ai/) y crea una cuenta.

### 2️⃣ Clave API

Ve a [Keys](https://openrouter.ai/settings/keys), crea una clave y **cópiala en un lugar seguro** (muchos proveedores solo muestran el secreto completo una vez) 📋.

### 3️⃣ En MetaDoc

Elige **Compatible con OpenAI**. **URL base**: `https://openrouter.ai/api/v1`, pega la clave, **modelo**: p. ej. `openrouter/free` o un id del catálogo. Lectura opcional: [documentación OpenRouter](https://openrouter.ai/docs/) y página [free router](https://openrouter.ai/openrouter/free).

Las rutas gratuitas pueden tener topes diarios o colas ⏳; en producción vigila **saldo y límites** en la consola.

---

## 🐋 Ruta B — DeepSeek (relación calidad-precio)

### 1️⃣ Consola

Inicia sesión en [deepseek.com](https://www.deepseek.com/) y abre la sección API de la consola.

### 2️⃣ Clave API

Crea una clave en **API keys** (o equivalente) y guárdala 🔐.

### 3️⃣ Campos en MetaDoc

Elige **DeepSeek**, pega la clave, modelo `deepseek-chat` o `deepseek-reasoner` según la [documentación API](https://api-docs.deepseek.com/) actual.

---

## 🔗 Ruta C — Agregadores como 4sapi (compatible OpenAI)

Suelen exponer la misma forma de URL que OpenAI (`.../v1/chat/completions`) 🌏. Lee precios y endpoints en la [documentación 4sapi (Apifox)](https://4sapi.apifox.cn/), crea una clave y copia **URL base** e **id de modelo** exactamente como indiquen. En MetaDoc, **Compatible con OpenAI** y pega cada campo. Las reglas cambian a menudo—la **consola del proveedor** es la fuente de verdad; **protege tu clave** ⚠️.

---

## 🦙 Ruta D — Ollama (local)

### 1️⃣ Instalación

Descarga desde [ollama.com](https://ollama.com/) y comprueba que la app funciona.

### 2️⃣ Descargar un modelo

Ej.: `ollama pull llama3.1` (nombres actuales en el sitio). Los modelos son grandes—deja espacio en disco 💾.

### 3️⃣ Ajustes en MetaDoc

Elige **Ollama**, base `http://localhost:11434/api`, **modelo** el nombre que descargaste. Una GPU dedicada ayuda mucho 🎮; solo CPU es más lento en respuestas largas. Más en [Ollama en GitHub](https://github.com/ollama/ollama).

---

## ☁️ Ruta E — Alibaba Qwen / DashScope

Activa **DashScope** y crea una clave siguiendo la [ayuda DashScope](https://help.aliyun.com/zh/dashscope/). En MetaDoc, **Qwen**: pega la **URL compatible OpenAI** que muestre tu consola, más el nombre de modelo y región si aplica.

---

## 🔷 Ruta F — Google Gemini

Crea una clave en [Google AI for Developers](https://ai.google.dev/) (o flujos de Cloud Console). En MetaDoc, **Gemini**: clave e id de modelo según la lista actual.

---

## 🧯 Solución de problemas

- **401 / 403** 🔐: Clave incorrecta, sin derecho al modelo o proyecto no autorizado.
- **402 / facturación** 💳: Añade créditos o cambia a una clave con fondos.
- **429** ⏱️: Límite de velocidad—reintenta más tarde, reduce concurrencia o mejora el plan.
- **502 / puerta de enlace** 🌐: Problema de red o upstream—reintenta o cambia la ruta de red.
- **Salida vacía / errores JSON** 🧩: Revisa URL base (incl. `/v1`), ortografía del modelo, proxy/firewall corporativo.

---

## ❓ FAQ

### ¿Para qué sirve la clave API? 🔑

Es la **credencial** con la que el proveedor factura y autoriza. MetaDoc solo la envía a los endpoints que configures. No compartas claves públicamente ni las subas a repos; una filtración puede agotar cuota o saldo.

### ¿Cómo funciona la facturación? ¿Qué es un token? 💰

Muchas APIs cloud cobran por **tokens**—trozos de texto tras el tokenizador del modelo. Entrada y salida suelen tener precios distintos. **Tarifas, niveles gratuitos y paquetes** están en la página de precios de cada proveedor. MetaDoc no revende acceso a modelos. Ollama local suele evitar cargos cloud por token pero consume electricidad y hardware.

### ¿Qué es la URL base y por qué la necesito? 🔗

Es el **prefijo HTTP** de la API: host + ruta que llama el cliente. Bajo “compatible OpenAI”, cambiar de proveedor suele ser solo URL base + id de modelo; un error de tipeo apunta al servicio equivocado o devuelve 404/401.

### ¿Por qué MetaDoc no incluye modelos cloud “ilimitados”? ☁️

La inferencia cuesta dinero y debe respetar políticas regionales. MetaDoc es **cliente**: eliges un proveedor con licencia y pagas directamente en lugar de ocultar esos costes para todos. En el futuro, MetaDoc podría ofrecer servicios de modelos grandes a través de agentes oficiales.

### Prueba gratuita integrada vs mi propia clave 🎁

Las pruebas suelen tener **cuotas pequeñas** y pueden hacer cola o limitar. Tu propia clave ata el uso a tu contrato con ese proveedor—mejor para el día a día.

### ¿A quién va el texto de mi documento? 🔒

Con **APIs cloud**, al proveedor que elijas (y subprocesadores según **su** política de privacidad). Con **Ollama local** enlazado a localhost, el contenido suele quedarse en la máquina, según SO y red—evita secretos en redes no fiables.

### ¿Los errores HTTP son lo mismo que fallar “Comprobar configuración”? 🧪

No siempre. **Comprobar configuración** ejecuta varias pruebas; un **401/429** aún encaja con los puntos de arriba. Si fallan varias, revisa clave, URL base e id de modelo juntos.

### Ollama vs cloud—¿cómo elegir? ⚖️

**Ollama** 🦙 para más privacidad y uso cercano a sin conexión, aceptando compensaciones de velocidad/calidad. **Cloud** ☁️ cuando quieres los últimos modelos grandes y rendimiento estable, aceptando facturación y términos del proveedor.

### ¿Reutilizar una clave en varios PCs? 💻

A menudo sí técnicamente, pero **cuota y límites se comparten**. Algunos proveedores restringen uso compartido o IP—sigue sus términos. En equipos, mejor claves separadas o políticas tipo IAM.

### ¿Necesito VPN? 🌍

Depende del **proveedor** y tu **red**. Algunos endpoints internacionales son inestables o bloqueados en ciertas regiones—prueba conectividad y cumple la normativa local.

---

La primera configuración implica cuentas y copiar cadenas largas; después suele ser “nuevo proveedor → nueva URL base + modelo” ✨. Suerte conectando una pila que encaje con lo que necesitas 🎉.
