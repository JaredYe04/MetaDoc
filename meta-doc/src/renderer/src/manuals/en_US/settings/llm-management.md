# LLM Configuration Management

## Overview

LLM Configuration Management allows you to create, edit, delete, and manage multiple LLM configurations. Configurations are displayed as **grid cards**, similar to agent clients: each card shows the configuration name and type. Clicking a card switches to using that configuration. You can test connectivity directly on the card and use the right-click menu to copy, edit, export, or delete configurations.

## Interface Layout

### Grid and Cards

1. After enabling LLM on the LLM Settings page, a **Configuration Grid** will appear below.
2. Each **Configuration Card** contains:
   - **First line**: Configuration name
   - **Second line**: Large model type (e.g., OpenAI, Tongyi Qianwen, DeepSeek, Ollama, etc.)
3. **Click a card** to switch to that configuration. The currently active configuration card is highlighted with a **green border**.
4. The top-right corner of the grid has **New Configuration** and **Import Configuration** buttons.

You can access LLM settings via the top menu bar:

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

### Configuration Interface Demo

The following image demonstrates the main features of the LLM Configuration Management interface:

<SettingLlmSection mode="demo" />

## Switching Configurations

- **Click any card** in the configuration grid to switch to that configuration.
- The current configuration is indicated by a green border and slight highlighting. All AI features will immediately use the LLM service defined by this configuration.

## Checking Connectivity

- Each card has a **"Check"** button on its right side. Clicking it tests the configuration's **Q&A streaming** and **chat streaming** capabilities.
- A loading icon is displayed during the test. If output is normal, the test stops automatically and shows a **green checkmark**. If there is a request error, it shows a **red cross** and a brief error message.
- Regardless of the result, clicking the button again will restart the test.

## Right-Click Menu

**Right-click** on a configuration card to open a menu with the following options:

- **Copy Configuration**: Creates a duplicate of the configuration (the new name will have "(Copy)" appended).
- **Edit Configuration**: Opens the edit dialog to modify the name, type, and various parameters. Click **OK** to save or **Cancel** to discard changes.
- **Export Configuration**: Exports the current configuration as a JSON file.
- **Delete Configuration**: Deletes the configuration (**Preset configurations cannot be deleted**, see below).

## Preset Configurations

**Preset configurations** for the following types (e.g., "Ollama (Default)", "Tongyi Qianwen (Default)", etc.) **cannot be deleted** but **can be edited** (the **large model type cannot be changed** during editing):

- Tongyi Qianwen, DeepSeek, Official OpenAI, OpenAI-compatible, Google Gemini, Ollama

Custom configurations and those created by copying can be deleted normally.

## Creating Configurations

### New Configuration

1. Click **"New Configuration"** in the top-right corner of the grid.
2. Enter a configuration name in the pop-up window and confirm.
3. The system creates a new configuration based on the **currently selected configuration** and automatically switches to it.

**Note**: The "New Configuration" button is unavailable when the currently selected configuration is of the "Manual" type.

### Import Configuration

1. Click **"Import Configuration"** in the top-right corner of the grid.
2. In the file dialog that opens, select one or more JSON configuration files (**batch selection is supported**).
3. The system reads and imports them one by one. Imported configurations are appended to the list.

The JSON format supports either a single configuration object or an array of configurations. New IDs are generated upon import to avoid conflicts with existing configurations.

## Editing a Configuration

1. **Right-click** on a configuration card and select **"Edit Configuration"**.
2. In the edit dialog, modify the **Configuration Name**, **Large Model Type** (changeable for non-preset configurations), and the various parameters for that type (API address, key, model, etc.).
3. Click **OK** to save or **Cancel** to discard changes. **There is no "unsaved" state**: changes are only written after confirmation.

For explanations of configuration parameters for different LLM types, see [[settings.llm-types|LLM Type Configuration]].

## Deleting a Configuration

1. **Right-click** on a configuration card and select **"Delete Configuration"** (this option is not shown for preset configurations).
2. Confirm the deletion in the confirmation dialog.
3. If the deleted configuration was the one currently in use, the system automatically switches to another configuration.

## Exporting a Configuration

- **Single Export**: Right-click on a card → **Export Configuration** to save the current configuration as a JSON file.
- Exported files can be used for backup or to restore configurations on other devices/accounts via "Import Configuration".

## Best Practices

1. **Naming Convention**: Use clear configuration names, such as "Work-Ollama" or "Experiment-OpenAI".
2. **Regular Backups**: Periodically export and back up important configurations.
3. **Check Before Use**: Use the "Check" button on the card to verify connectivity for new or modified configurations.
4. **Clean Up Unused Configs**: Regularly delete configurations that are no longer in use to keep the list tidy.

## Related Documentation

- [[settings.llm|LLM Configuration]]
- [[settings.llm-types|LLM Type Configuration]]
- [[ai.chat|AI Chat Feature]]
- [[agent.config|Agent Configuration Management]]

<QuickStartPanel mode="demo" />

<MainTabs mode="demo" />