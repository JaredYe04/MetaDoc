# Gestión de Configuración de LLM

## Descripción General

La gestión de configuración de LLM le permite crear, editar, eliminar y administrar múltiples configuraciones de LLM. Las configuraciones se muestran en forma de **tarjetas en cuadrícula**, similares a un cliente de agentes: cada tarjeta muestra el nombre y el tipo de configuración, se puede hacer clic para cambiar a su uso, permite verificar la conectividad en la tarjeta y, a través de un menú contextual, realizar acciones como copiar, editar, exportar y eliminar.

## Diseño de la Interfaz

### Cuadrícula y Tarjetas

1.  Después de habilitar el LLM en la página de configuración de LLM, se mostrará una **cuadrícula de configuraciones** debajo.
2.  Cada **tarjeta de configuración** contiene:
    - **Primera línea**: Nombre de la configuración.
    - **Segunda línea**: Tipo de modelo grande (por ejemplo, OpenAI, Tongyi Qianwen, DeepSeek, Ollama, etc.).
3.  **Haga clic en una tarjeta** para cambiar a esa configuración. La tarjeta de configuración en uso actual se resaltará con un **borde verde**.
4.  En la esquina superior derecha de la cuadrícula hay botones para **Nueva configuración** e **Importar configuración**.

Puede acceder a la configuración de LLM a través de la barra de menú superior:

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

### Demostración de la Interfaz de Configuración

La siguiente imagen muestra las funciones principales de la interfaz de gestión de configuración de LLM:

<SettingLlmSection mode="demo" />

## Cambiar de Configuración

-   **Haga clic en cualquier tarjeta** dentro de la cuadrícula de configuraciones para cambiar a esa configuración.
-   La configuración actual se mostrará con un borde verde y un ligero resaltado. Todas las funciones de IA utilizarán inmediatamente el servicio LLM de esa configuración.

## Verificar Conectividad

-   Cada tarjeta tiene un botón **«Verificar»** en el lado derecho. Al hacer clic, se probarán las capacidades de **flujo de preguntas y respuestas** y **flujo de conversación** de esa configuración.
-   Durante la prueba, se mostrará un icono de carga; si hay una salida normal, se detendrá automáticamente y mostrará una **marca de verificación verde**; si hay un error en la solicitud, mostrará una **cruz roja** y un breve mensaje de error.
-   Independientemente del resultado, puede volver a hacer clic para repetir la prueba.

## Menú Contextual

Al hacer **clic derecho** en una tarjeta de configuración, se abre un menú que permite:

-   **Copiar configuración**: Crea una copia de esta configuración (el nuevo nombre incluirá «(copia)»).
-   **Editar configuración**: Abre un cuadro de diálogo de edición para modificar el nombre, el tipo y los diversos parámetros. **Aceptar** guarda los cambios, **Cancelar** los descarta.
-   **Exportar configuración**: Exporta la configuración actual a un archivo JSON.
-   **Eliminar configuración**: Elimina esta configuración (**las configuraciones predefinidas no se pueden eliminar**, ver más abajo).

## Configuraciones Predefinidas

Las **configuraciones predefinidas** correspondientes a los siguientes tipos (como «Ollama (predeterminado)», «Tongyi Qianwen (predeterminado)», etc.) **no se pueden eliminar**, pero **sí se permiten editar** (durante la edición **no se puede cambiar el tipo de modelo grande**):

-   Tongyi Qianwen, DeepSeek, OpenAI oficial, OpenAI compatible, Google Gemini, Ollama

Las configuraciones personalizadas y las obtenidas por copia se pueden eliminar normalmente.

## Crear Configuraciones

### Nueva Configuración

1.  Haga clic en **«Nueva configuración»** en la esquina superior derecha de la cuadrícula.
2.  En la ventana emergente, ingrese el nombre de la configuración y confirme.
3.  El sistema creará una nueva configuración basada en la **configuración actualmente seleccionada** y cambiará automáticamente a la nueva configuración.

**Nota**: El botón de nueva configuración no está disponible cuando la configuración actualmente seleccionada es del tipo «manual».

### Importar Configuración

1.  Haga clic en **«Importar configuración»** en la esquina superior derecha de la cuadrícula.
2.  En el cuadro de diálogo de archivos que se abre, seleccione uno o más archivos de configuración JSON (admite **selección múltiple**).
3.  El sistema los leerá e importará uno por uno. Las configuraciones importadas se agregarán a la lista.

Admite formato JSON de un solo objeto de configuración o un array de configuraciones. Durante la importación, se generará un nuevo ID para evitar conflictos con configuraciones existentes.

## Editar Configuración

1.  Haga **clic derecho** en una tarjeta de configuración y seleccione **«Editar configuración»**.
2.  En el cuadro de diálogo de edición, modifique el **nombre de la configuración**, el **tipo de modelo grande** (modificable si no es una configuración predefinida) y los diversos parámetros para ese tipo (dirección de la API, clave, modelo, etc.).
3.  Haga clic en **Aceptar** para guardar o en **Cancelar** para descartar los cambios. **No hay un estado de «no guardado»**: los cambios solo se escriben después de confirmar.

Para obtener explicaciones sobre los parámetros de configuración de diferentes tipos de LLM, consulte [[settings.llm-types|Configuración de Tipos de LLM]].

## Eliminar Configuración

1.  Haga **clic derecho** en una tarjeta de configuración y seleccione **«Eliminar configuración»** (esta opción no se muestra para configuraciones predefinidas).
2.  Confirme la eliminación en el cuadro de diálogo de confirmación.
3.  Si se elimina la configuración en uso actual, el sistema cambiará automáticamente a otra configuración.

## Exportar Configuración

-   **Exportación individual**: Clic derecho en la tarjeta → **Exportar configuración**, guarda la configuración actual como un archivo JSON.
-   Los archivos exportados se pueden usar para copias de seguridad o para restaurar en otros dispositivos/cuentas mediante la función «Importar configuración».

## Mejores Prácticas

1.  **Convención de nombres**: Use nombres de configuración claros, como «Trabajo-Ollama», «Experimento-OpenAI».
2.  **Copias de seguridad periódicas**: Exporte copias de seguridad de configuraciones importantes regularmente.
3.  **Verificar antes de usar**: Para configuraciones nuevas o después de modificaciones, use la función «Verificar» en la tarjeta para confirmar la conectividad.
4.  **Limpiar configuraciones inútiles**: Elimine periódicamente las configuraciones que ya no use para mantener la lista ordenada.

## Documentación Relacionada

-   [[settings.llm|Configuración de LLM]]
-   [[settings.llm-types|Configuración de Tipos de LLM]]
-   [[ai.chat|Función de Chat de IA]]
-   [[agent.config|Gestión de Configuración de Agentes]]

<QuickStartPanel mode="demo" />

<MainTabs mode="demo" />