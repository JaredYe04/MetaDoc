# Atajos globales

## Resumen

Los atajos globales son combinaciones de teclas en MetaDoc que se pueden utilizar en cualquier interfaz. Dominar estos atajos puede mejorar significativamente la eficiencia del trabajo.

**Nota**: Los atajos en este documento han sido verificados con la implementación actual del código y están implementados y disponibles en el proceso principal o en el proceso de renderizado.

## Operaciones de archivo

### Nuevo documento

- **Atajo**: `Ctrl+N` (Windows/Linux) o `Cmd+N` (macOS)
- **Función**: Crear un nuevo documento en blanco
- **Caso de uso**: Comenzar rápidamente a editar un nuevo documento

### Abrir documento

- **Atajo**: `Ctrl+O` (Windows/Linux) o `Cmd+O` (macOS)
- **Función**: Abrir el cuadro de diálogo de selección de archivos
- **Caso de uso**: Abrir un documento existente

### Guardar documento

- **Atajo**: `Ctrl+S` (Windows/Linux) o `Cmd+S` (macOS)
- **Función**: Guardar el documento actual
- **Caso de uso**: Guardar el contenido editado para evitar pérdidas

### Guardar como

- **Atajo**: `Ctrl+Shift+S` (Windows/Linux) o `Cmd+Shift+S` (macOS)
- **Función**: Guardar el documento actual como un nuevo archivo
- **Caso de uso**: Crear una copia del documento o cambiar la ubicación de guardado

### Guardar todos los documentos

- **Atajo**: `Ctrl+K S` (Windows/Linux) o `Cmd+K S` (macOS)
- **Función**: Guardar todos los documentos abiertos
- **Instrucciones de uso**: Primero presione `Ctrl+K` (o `Cmd+K`), luego presione `S`
- **Caso de uso**: Guardar todos los documentos de una vez

<MenuItemsDemo mode="demo" :items='[{"id": "file", "items": ["save-all"]}]' />

### Cerrar archivo

- **Atajo**: `Ctrl+W` (Windows/Linux) o `Cmd+W` (macOS)
- **Función**: Cerrar la pestaña actual
- **Caso de uso**: Cerrar documentos innecesarios

```mermaid
graph LR
    A[文件操作] --> B[Ctrl+N新建]
    A --> C[Ctrl+O打开]
    A --> D[Ctrl+S保存]
    A --> E[Ctrl+Shift+S另存为]
    A --> F[Ctrl+K S保存全部]
    A --> G[Ctrl+W关闭]
    style A fill:#f3f4f6,stroke:#374151
    style B fill:#f3f4f6,stroke:#374151
    style C fill:#f3f4f6,stroke:#374151
    style D fill:#f3f4f6,stroke:#374151
    style E fill:#f3f4f6,stroke:#374151
    style F fill:#f3f4f6,stroke:#374151
    style G fill:#f3f4f6,stroke:#374151
```

## Operaciones de pestañas

La barra de pestañas muestra todos los documentos abiertos y admite operaciones como crear, cambiar y cerrar:

<MainTabs mode="demo" />

<ViewMenuItemsDemo mode="demo" :items='["editor", "outline"]' />

### Nueva pestaña

- **Atajo**: `Ctrl+T` (Windows/Linux) o `Cmd+T` (macOS)
- **Función**: Crear una nueva pestaña
- **Caso de uso**: Crear rápidamente un nuevo documento

### Cambiar de pestaña

#### Pestaña siguiente

- **Atajo**: `Ctrl+Tab` (Windows/Linux) o `Cmd+Tab` (macOS)
- **Función**: Cambiar a la siguiente pestaña
- **Instrucciones de uso**: Mantener presionado `Ctrl+Tab` mostrará una superposición para cambiar de pestaña, puede continuar presionando Tab para seleccionar o hacer clic directamente
- **Caso de uso**: Cambiar rápidamente entre múltiples documentos

<TabSwitcherOverlay mode="demo" />

#### Pestaña anterior

- **Atajo**: `Ctrl+Shift+Tab` (Windows/Linux) o `Cmd+Shift+Tab` (macOS)
- **Función**: Cambiar a la pestaña anterior
- **Caso de uso**: Cambiar de pestaña en orden inverso

### Reabrir pestaña cerrada

- **Atajo**: `Ctrl+Shift+T` (Windows/Linux) o `Cmd+Shift+T` (macOS)
- **Función**: Reabrir la pestaña cerrada más recientemente
- **Instrucciones de uso**: Se puede usar repetidamente para restaurar secuencialmente las pestañas cerradas más recientemente (hasta 20)
- **Caso de uso**: Recuperar rápidamente una pestaña cerrada por error

<MainTabs mode="demo" />

## Otros atajos

### Abrir manual de usuario

- **Atajo**: `F1`
- **Función**: Abrir la página del manual de usuario
- **Caso de uso**: Cuando se necesita consultar la documentación de ayuda

<MenuItemsDemo mode="demo" :items='[{"id": "help"}]' />

## Lista de atajos

### Atajos de Windows/Linux

| Función                    | Atajo                |
| -------------------------- | -------------------- |
| Nuevo documento            | `Ctrl+N`             |
| Abrir documento            | `Ctrl+O`             |
| Guardar documento          | `Ctrl+S`             |
| Guardar como               | `Ctrl+Shift+S`       |
| Guardar todos              | `Ctrl+K S`           |
| Cerrar pestaña             | `Ctrl+W`             |
| Nueva pestaña              | `Ctrl+T`             |
| Pestaña siguiente          | `Ctrl+Tab`           |
| Pestaña anterior           | `Ctrl+Shift+Tab`     |
| Reabrir pestaña cerrada    | `Ctrl+Shift+T`       |
| Abrir manual de usuario    | `F1`                 |

### Atajos de macOS

| Función                    | Atajo                |
| -------------------------- | -------------------- |
| Nuevo documento            | `Cmd+N`              |
| Abrir documento            | `Cmd+O`              |
| Guardar documento          | `Cmd+S`              |
| Guardar como               | `Cmd+Shift+S`        |
| Guardar todos              | `Cmd+K S`            |
| Cerrar pestaña             | `Cmd+W`              |
| Nueva pestaña              | `Cmd+T`              |
| Pestaña siguiente          | `Cmd+Tab`            |
| Pestaña anterior           | `Cmd+Shift+Tab`      |
| Reabrir pestaña cerrada    | `Cmd+Shift+T`        |
| Abrir manual de usuario    | `F1`                 |

## Técnicas para usar atajos

### Orden de las combinaciones de teclas

Algunos atajos requieren presionar las teclas en secuencia:

- **Guardar todos**: Primero presione `Ctrl+K`, luego presione `S` (no simultáneamente)
- **Cambio de pestaña**: Mantenga presionado `Ctrl+Tab` para mostrar la superposición, luego continúe presionando Tab para seleccionar

### Personalizar atajos

Puede gestionar los atajos globales en **Configuración → Atajos de teclado**:

- **Esquema de teclas**: El programa proporciona tres esquemas predeterminados: Windows, Linux y macOS. Al iniciar por primera vez, se selecciona automáticamente según el sistema actual.
- **Crear/Editar esquema**: Puede crear un esquema personalizado y modificar las teclas para cada acción.
- **Importar/Exportar**: Admite exportar el esquema como un archivo JSON o importar un esquema desde un archivo.
- **Restaurar predeterminados**: Para cada elemento de tecla que difiera del esquema predeterminado, puede hacer clic en "Restaurar predeterminado" para revertirlo.

Después de cambiar un esquema, debe hacer clic en "Guardar" en la parte inferior para que surta efecto.

### Conflictos de atajos

Si un atajo entra en conflicto con el sistema u otro software:

- **Atajos del sistema**: Algunos atajos del sistema pueden tener prioridad.
- **Otro software**: Cierre el software conflictivo o modifique sus atajos.
- **Atajos personalizados**: En **Configuración → Atajos de teclado** puede modificarlos a otras teclas.

### Técnicas de memorización

- **Operaciones de archivo**: Use los atajos estándar para operaciones de archivo (Ctrl+N/O/S).
- **Operaciones de pestañas**: Use combinaciones relacionadas con la tecla Tab.
- **Guardar todos**: Use Ctrl+K como prefijo de comando.

## Mejores prácticas

1. **Dominar el uso**: Domine los atajos comunes para mejorar la eficiencia.
2. **Uso combinado**: Combine múltiples atajos para completar operaciones complejas.
3. **Cambio de pestañas**: Use Ctrl+Tab para cambiar rápidamente, evitando operaciones con el ratón.
4. **Guardar periódicamente**: Adquiera el hábito de usar Ctrl+S para guardar periódicamente.
5. **Recuperación rápida**: Use Ctrl+Shift+T para recuperar rápidamente una pestaña cerrada por error.

## Consideraciones

1. **Diferencias de plataforma**: Windows/Linux usan Ctrl, macOS usa Cmd.
2. **Conflictos de atajos**: Preste atención a conflictos con atajos de otro software.
3. **Orden de combinaciones**: Algunos atajos requieren presionar las teclas en secuencia.
4. **Cambio de pestañas**: Ctrl+Tab mostrará una superposición, donde puede continuar seleccionando.
5. **Guardar todos**: Ctrl+K S requiere presionar primero Ctrl+K, luego S.

## Documentación relacionada

- [[shortcuts.editor|Atajos del editor]]
- [[core.file-operations|Operaciones de archivo]]
- [[core.multi-tab|Gestión de múltiples pestañas]]

<MenuItemsDemo mode="demo" :items='[{"id": "file"}]' />

<MainTabs mode="demo" />

<ViewMenuItemsDemo mode="demo" :items='["editor", "outline", "agent"]' />

<QuickStartPanel mode="demo" />