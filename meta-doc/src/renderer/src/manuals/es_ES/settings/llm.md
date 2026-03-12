# Configuración de LLM

## Descripción general

La configuración de LLM (Modelo de Lenguaje Grande) es la configuración central de las funciones de IA de MetaDoc. Al configurar el LLM, puede habilitar funciones inteligentes como diálogo con IA, corrección con IA, autocompletado con IA, etc. MetaDoc admite múltiples proveedores de servicios LLM, y puede elegir el modelo adecuado según sus necesidades.

## Habilitar LLM

<SettingLlmSection mode="demo" />

### Activar funciones de IA

En la página de configuración de LLM, primero debe habilitar la función LLM:

1.  Encuentre el interruptor "Habilitar LLM"
2.  Cambie el interruptor al estado "Habilitado"
3.  El sistema cargará automáticamente la configuración predeterminada del LLM

Puede acceder a la configuración a través de la barra de menú superior:

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

### Interfaz de configuración de LLM

La siguiente imagen muestra las áreas funcionales principales de la página de configuración de LLM:

<SettingLlmSection mode="demo" />

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

La imagen anterior muestra los componentes principales de la interfaz de configuración de LLM:

-   **Configuración global**: Interruptor de habilitación de LLM, control deslizante de ajuste de temperatura (Temperature), opción para eliminar etiquetas de pensamiento (think), permiso predeterminado para ejecución en terminal, etc.
-   **Cuadrícula de configuraciones**: Muestra todas las configuraciones en forma de tarjetas; cada tarjeta muestra el nombre y el tipo de configuración (como OpenAI, Tongyi Qianwen, DeepSeek, Ollama, etc.); haga clic en una tarjeta para cambiar a esa configuración; la configuración actual se resalta con un borde verde.
-   **Operaciones de tarjeta**: En el lado derecho de la tarjeta, puede "Verificar" la capacidad de respuesta y el flujo de diálogo de esa configuración; el menú contextual (clic derecho) admite copiar, editar, exportar y eliminar.
-   **Operaciones superiores**: En la esquina superior derecha de la cuadrícula, puede crear una nueva configuración o importar configuraciones por lotes desde un archivo.

En el modo de demostración, puede ver el diseño de la interfaz de forma interactiva, pero los cambios no se guardarán realmente.

Después de habilitar el LLM, podrá utilizar las siguientes funciones de IA:

-   Diálogo con IA
-   Corrección con IA
-   Autocompletado automático con IA
-   Funciones del asistente de IA
-   Marco de Agentes (Agent)

**Aspectos a tener en cuenta**:

-   Después de habilitar el LLM, algunas funciones pueden llamar a la API, generando costos.
-   Se recomienda configurar primero el servicio LLM antes de habilitarlo.
-   Si no necesita funciones de IA, puede mantenerlo desactivado para ahorrar recursos.

## Configuración de temperatura del LLM

<SettingLlmSection mode="demo" />

### Comprender el parámetro de temperatura

La temperatura (Temperature) es un parámetro que controla la aleatoriedad del texto generado por la IA:

-   **Temperatura baja (0-0.5)**: Los resultados generados son más deterministas y consistentes, adecuados para escenarios que requieren respuestas precisas.
-   **Temperatura media (0.5-1.0)**: Equilibra creatividad y precisión, adecuada para la mayoría de los escenarios.
-   **Temperatura alta (1.0-2.0)**: Los resultados generados son más diversos y creativos, adecuados para escritura creativa.

### Recomendaciones de configuración

-   **Documentación técnica**: Se recomienda 0.3-0.5 para garantizar la precisión del contenido.
-   **Escritura creativa**: Se recomienda 0.7-1.0 para aumentar la diversidad del contenido.
-   **Generación de código**: Se recomienda 0.2-0.4 para garantizar la precisión del código.
-   **Conversación**: Se recomienda 0.7-0.9 para mantener la conversación natural y fluida.

La configuración de temperatura afecta a todas las funciones que utilizan el LLM, incluidos el diálogo con IA, el autocompletado con IA, la corrección con IA, etc.

## Eliminación automática de etiquetas de razonamiento

### Descripción de la función

Algunos LLM pueden incluir el proceso de razonamiento (thinking process) al generar contenido, y este contenido suele estar marcado con etiquetas especiales. Al habilitar "Eliminar automáticamente las etiquetas de razonamiento", MetaDoc filtrará automáticamente estas etiquetas, conservando solo el contenido final generado.

**Escenarios de aplicación**:

-   Uso de LLM que admiten procesos de razonamiento (como algunos modelos de código abierto).
-   Deseo de que los resultados de salida sean más concisos.
-   No es necesario ver el proceso de pensamiento de la IA.

**Aspectos a tener en cuenta**:

-   Si su LLM no admite etiquetas de razonamiento, esta opción no tendrá efecto.
-   En algunos casos, conservar el proceso de razonamiento puede ayudar a comprender la lógica de decisión de la IA.

## Gestión de configuraciones

<SettingLlmSection mode="demo" />

### Soporte para múltiples configuraciones

MetaDoc admite la creación de múltiples configuraciones de LLM, lo que le permite utilizar diferentes modelos en diferentes escenarios:

-   **Configuración de trabajo**: Para el trabajo diario, utilizando un modelo estable y confiable.
-   **Configuración experimental**: Para probar nuevos modelos o funciones.
-   **Diferentes proveedores**: Crear configuraciones independientes para diferentes servicios LLM.

### Cambiar de configuración

En la cuadrícula de configuraciones de la página de configuración de LLM, puede:

1.  **Seleccionar configuración**: Haga clic en cualquier tarjeta de configuración para cambiar a esa configuración.
2.  **Ver información de configuración**: Cada tarjeta muestra el nombre y el tipo de configuración.
3.  **Identificar la configuración actual**: La tarjeta de la configuración en uso se resaltará con un borde verde.

Después de cambiar la configuración, todas las funciones de IA utilizarán inmediatamente el servicio LLM de la nueva configuración. Para editar una configuración, abra el cuadro de diálogo a través de la opción "Editar configuración" en el menú contextual (clic derecho) de la tarjeta; modifique en el cuadro de diálogo y haga clic en "Aceptar" para guardar, o en "Cancelar" para no guardar; la interfaz ya no distingue el estado "No guardado".

## Aspectos a tener en cuenta

1.  **Seguridad de la clave API**: Guarde de forma segura su clave API y no la comparta con otros.
2.  **Control de costos**: El uso de servicios LLM puede generar gastos; preste atención al consumo.
3.  **Conexión de red**: El uso de API externas requiere una conexión de red estable.
4.  **Copia de seguridad de configuraciones**: Se recomienda exportar y hacer copias de seguridad de configuraciones importantes para evitar pérdidas.
5.  **Selección de modelo**: Diferentes modelos tienen diferentes capacidades y limitaciones; elija según sus necesidades.

## Documentación relacionada

-   [[settings.llm-management|Gestión de configuración de LLM]]
-   [[settings.llm-types|Configuración de tipos de LLM]]
-   [[ai.chat|Función de diálogo con IA]]
-   [[ai.completion|Autocompletado automático con IA]]
-   [[ai.proofread|Función de corrección con IA]]