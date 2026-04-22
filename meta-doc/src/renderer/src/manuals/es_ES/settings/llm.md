# Configuración de LLM

## Descripción general

La configuración de LLM (modelo de lingüístico grande) es central para las funciones de IA de MetaDoc. Las **versiones distribuidas por Steam** siguen un camino recomendado distinto al de los canales de prueba antiguos:

- **Steam (recomendado)**: use el **proxy de API LLM basado en Cloudflare** operado por MetaDoc (etiquetado como **«MetaDoc Cloud (Steam)»** en la app). Compre **créditos** con **recarga de Steam** y use la IA; normalmente **sin** aportar claves API de terceros.
- **API propia (BYOK)**: ruta **de desarrollador / experimental**. Solo después de abrir **Opciones experimentales** en **LLM** y activar **«Habilitar conectividad experimental»** verá el flujo clásico de **varios perfiles + API personalizada**. Vea más abajo y los artículos enlazados.

Primero: **Steam / MetaDoc Cloud** (saldo, recarga, cambio de modelo); luego **opciones experimentales**; después el **resto de la interfaz** (activar LLM, temperatura, cuadrícula de tarjetas, etc.).

---

## Steam: MetaDoc Cloud y créditos (recomendado)

Para MetaDoc instalado y ejecutado con **Steam**.

### Pasos rápidos

1. **Abrir ajustes de LLM**: **Ajustes** → **LLM** (o **Ajustes** desde la barra de menús).
2. Buscar **«MetaDoc Cloud (Steam)»**: **saldo (credits)**, **modelo**, **Añadir créditos** / recarga, **Actualizar** el saldo.
3. **Recargar**: use **Añadir créditos** y complete la **compra en la aplicación de Steam**. Inicie la app desde la biblioteca de Steam; el cliente Steam debe estar disponible (la UI explica requisitos Steam/Greenworks si falla).
4. **Consultar saldo**: los créditos se muestran en la página; la entrada **Steam** en la bandeja también muestra el **saldo de créditos** y permite iniciar recarga.
5. **Precios**: los **modelos** pueden debitar créditos de forma distinta; consulte la app.
6. **Cambiar de modelo**: al elegir en MetaDoc Cloud, **chat IA, completado, corrección, Agent**, etc. usan ese modelo; puede cambiarlo en cualquier momento.

<SettingLlmSection mode="demo" />

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

### Notas

- El extremo y el proxy los opera MetaDoc: **no** necesita pegar URL/claves OpenAI o DeepSeek para este modo (a diferencia del BYOK).
- Saldo insuficiente o red inestable: las funciones IA pueden fallar — **recargue** o **actualice el saldo**.

---

## Opciones de desarrollador: conectividad experimental y BYOK (API propia)

En builds **Steam**, el flujo antiguo de **«configurar su propia API LLM»** es **experimental**: abra **Opciones experimentales** en **LLM**, active **«Habilitar conectividad experimental»** (con confirmación). Solo entonces aparecen **tarjetas de configuración, URL base, clave API, tipos de proveedor**, como en builds de prueba.

**Importante**:

- Es **experimental** y puede **diferir** de la experiencia estándar; puede implicar **cargos directos** a terceros y otros riesgos.
- **Usted es el único responsable** de claves, facturación, disponibilidad y términos de terceros. MetaDoc solo ofrece configuración en el cliente.

Pasos detallados (como la documentación histórica):

- [[settings.llm-management|Gestión de configuraciones LLM]]
- [[settings.llm-types|Tipos de proveedor LLM]]
- [[ai.llm-config|Guía de configuración LLM]]

---

## Habilitar LLM

<SettingLlmSection mode="demo" />

### Activar funciones IA

1. Localice el interruptor «Habilitar LLM»
2. Actívelo
3. Se carga la configuración predeterminada

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

### Interfaz

<SettingLlmSection mode="demo" />

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

- **Ajustes globales**: interruptor LLM, temperatura, quitar etiquetas de razonamiento, permiso de terminal predeterminado, etc.
- **Cuadrícula**: tarjetas con nombre y tipo; clic para cambiar la configuración activa (borde verde)
- **Acciones**: comprobar flujo; menú contextual: copiar, editar, exportar, eliminar
- **Arriba a la derecha**: nueva configuración, importar desde archivo

En modo demo no se guardan cambios.

Tras activar: chat IA, corrección, completado, asistente, Agent.

**Nota**: las llamadas API pueden tener coste.

## Temperatura

<SettingLlmSection mode="demo" />

Baja (0–0,5): más determinista. Media (0,5–1): equilibrada. Alta (1–2): más creativa. Recomendaciones: documentación técnica 0,3–0,5; creativo 0,7–1; código 0,2–0,4; diálogo 0,7–0,9.

## Quitar etiquetas de razonamiento

Filtra etiquetas de proceso de razonamiento cuando el modelo las incluye.

## Gestión de configuraciones

<SettingLlmSection mode="demo" />

Varias configuraciones para distintos escenarios. Clic en tarjeta para cambiar; edición desde el menú contextual.

## Avisos importantes

1. **Claves API**: solo con BYOK — no las comparta
2. **Costes**: MetaDoc Cloud = **créditos**; BYOK = facturación del proveedor
3. **Red**: conexión estable a APIs externas
4. **Copia de seguridad**: exporte configuraciones importantes
5. **Modelos**: capacidades y límites distintos

## Documentación relacionada

- [[settings.llm-management|Gestión de configuraciones LLM]]
- [[settings.llm-types|Tipos de proveedor LLM]]
- [[ai.chat|Chat IA]]
- [[ai.completion|Autocompletado IA]]
- [[ai.proofread|Corrección IA]]
