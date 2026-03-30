# Home Page Features

## Overview

The home page serves as the entry interface for MetaDoc, providing quick start, new document creation, file opening, and other functions. Designed to be clean and aesthetically pleasing, it helps you get started with MetaDoc quickly.

## Agent input and suggested prompts

At the top of the home page you get the same **composer** as the full **Agent** tab (with @ references for files, tabs, and folders). Text stays on the home page until you **send**; then MetaDoc switches to the **Agent** tab, **creates a new session**, and submits that message.

Below the composer you will see **suggested prompts** (short ideas, many with emoji):

- Tap **Shuffle** to pick a new random set
- Each chip **auto-rotates** about every **10–20 seconds** with a small transition animation
- Clicking a chip fills the composer; use **Ctrl+Z** (**⌘Z** on macOS) once to restore what you had before the chip click

> The legacy **Quick Start** wizard has been removed. Create documents with **New document** or the left menu.
## New Document

### Create a Blank Document

Click the "New Document" button to quickly create a blank document:

1.  Click the "New Document" button
2.  Select the document format (Markdown/LaTeX/Plain Text)
3.  The document will open in a new tab

**Shortcut**: You can also use `Ctrl+N` (Windows/Linux) or `Cmd+N` (macOS) to create one quickly.

## Open File

### Open an Existing File

Click the "Open File" button to open an existing file:

1.  Click the "Open File" button
2.  Select the file in the file selection dialog
3.  The file will open in a new tab

**Shortcut**: You can also use `Ctrl+O` (Windows/Linux) or `Cmd+O` (macOS) to open quickly.

### Supported File Formats

-   **Markdown** (.md)
-   **LaTeX** (.tex)
-   **Plain Text** (.txt)
-   **JSON** (.json)

## User Manual

### Open the User Manual

Click the "User Manual" button to open the user manual:

1.  Click the "User Manual" button
2.  The user manual will open in a new tab
3.  You can browse and learn about various features

**Shortcut**: You can also press the `F1` key to open the user manual quickly.

## Recent Documents List

### View Recent Documents

The home page displays a list of recently opened documents:

-   **Display Count**: Shows up to 12 recent documents
-   **Document Cards**: Each document is displayed as a card
-   **Quick Open**: Click a card to quickly open the document

### Recent Document Actions

-   **Open Document**: Click a document card to open it
-   **Delete Record**: Click the delete button on a card to remove its record
-   **Right-Click Menu**: Right-clicking a card may reveal more options

### Recent Document Management

-   **Auto-Update**: The list updates automatically after opening a document
-   **Record Saving**: Recent document records are saved
-   **List Sorting**: Sorted in reverse chronological order of opening time

## User Profile Dialog

### Open User Profile

The home page may display a user profile dialog:

-   **First Use**: May prompt to set up user profile upon first use
-   **Profile Setup**: You can set user persona and usage preferences
-   **AI Optimization**: User profile helps AI better understand your needs

### User Profile Content

The user profile may include:

-   **Basic Information**: Name, occupation, etc.
-   **Usage Preferences**: Editing habits, frequently used features, etc.
-   **User Persona**: Helps AI understand your usage scenarios

## Home Page Interface

### Interface Layout

The home page uses a centered layout:

-   **Top**: MetaDoc title and subtitle
-   **Middle**: Action button area
-   **Bottom**: Recent documents list

### Visual Design

The home page features a clean, modern design:

-   **Dynamic Background**: Animated dynamic background effect
-   **Grid Decoration**: Minimalist grid decoration
-   **Card Design**: Action buttons use a card design

## Best Practices

1.  **Quick Start**: It is recommended to use the quick start wizard for first-time use.
2.  **Shortcuts**: Master the use of shortcuts to improve efficiency.
3.  **Recent Documents**: Utilize the recent documents list for quick access to frequently used documents.
4.  **User Profile**: Set up your user profile for a better AI experience.
5.  **User Manual**: Consult the user manual when encountering issues.

## Notes

1.  **Home Page Display**: The home page is only displayed when no documents are open.
2.  **Quick Start**: The quick start wizard can be closed at any time.
3.  **Recent Documents**: The recent documents list displays a maximum of 12 items.
4.  **User Profile**: User profile setup is optional.
5.  **Interface Language**: The home page interface language follows the system language settings.

## Related Documents

-   [[quick-start.guide|Quick Start Guide]]
-   [[core.file-operations|File Operations]]
-   [[user.profile|User Profile]]
-   [[views.types|View Types]]

<MenuItemsDemo mode="demo" :items='[{"id": "file"}]' />

<MenuItemsDemo mode="demo" :items='[{"id": "edit"}]' />

<MenuItemsDemo mode="demo" :items='[{"id": "view"}]' />

<ViewMenuItemsDemo mode="demo" :items='["home", "outline", "chat", "agent"]' />

<MainTabs mode="demo" />

<UserProfileView mode="demo" />
