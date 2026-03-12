# LLM Configuration

## Overview

LLM (Large Language Model) configuration is the core setting for MetaDoc AI features. By configuring LLM, you can enable intelligent functions such as AI chat, AI proofreading, and AI completion. MetaDoc supports multiple LLM service providers, allowing you to choose the appropriate model based on your needs.

## Enabling LLM

<SettingLlmSection mode="demo" />

### Enabling AI Features

On the LLM settings page, you first need to enable the LLM feature:

1.  Locate the "Enable LLM" toggle switch.
2.  Switch the toggle to the "Enabled" state.
3.  The system will automatically load the default LLM configuration.

You can access the settings via the top menu bar:

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

### LLM Settings Interface

The following diagram illustrates the main functional areas of the LLM configuration page:

<SettingLlmSection mode="demo" />

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

The above diagram shows the main components of the LLM settings interface:

-   **Global Settings**: LLM enable toggle, Temperature adjustment slider, think tag removal option, default terminal execution permission, etc.
-   **Configuration Grid**: Displays all configurations in card format, each card showing the configuration name and type (e.g., OpenAI, Tongyi Qianwen, DeepSeek, Ollama, etc.); click a card to switch to using it, with the current configuration highlighted by a green border.
-   **Card Actions**: Click "Check" on the right side of a card to test its Q&A and chat streaming capabilities; the right-click menu supports Copy, Edit, Export, and Delete.
-   **Top Actions**: Use the buttons in the top-right corner of the grid to create a new configuration or batch import configurations from a file.

In demo mode, you can interactively view the interface layout, but modifications will not be saved.

After enabling LLM, you can use the following AI features:

-   AI Chat
-   AI Proofreading
-   AI Auto-completion
-   AI Assistant Features
-   Agent Framework

**Important Notes**:

-   After enabling LLM, certain features may call APIs and incur costs.
-   It is recommended to configure your LLM service before enabling it.
-   If AI features are not needed, you can keep LLM disabled to conserve resources.

## LLM Temperature Setting

<SettingLlmSection mode="demo" />

### Understanding the Temperature Parameter

Temperature is a parameter that controls the randomness of AI-generated text:

-   **Low Temperature (0-0.5)**: Results are more deterministic and consistent, suitable for scenarios requiring precise answers.
-   **Medium Temperature (0.5-1.0)**: Balances creativity and accuracy, suitable for most scenarios.
-   **High Temperature (1.0-2.0)**: Results are more diverse and creative, suitable for creative writing.

### Setting Recommendations

-   **Technical Documentation**: Recommended 0.3-0.5 to ensure content accuracy.
-   **Creative Writing**: Recommended 0.7-1.0 to increase content diversity.
-   **Code Generation**: Recommended 0.2-0.4 to guarantee code accuracy.
-   **Conversational Exchange**: Recommended 0.7-0.9 to maintain natural and fluent dialogue.

The temperature setting affects all features using LLM, including AI Chat, AI Completion, AI Proofreading, etc.

## Auto-Remove Reasoning Tags

### Feature Description

Some LLMs may include a reasoning process (thinking process) when generating content, often marked with special tags. When "Auto-Remove Reasoning Tags" is enabled, MetaDoc automatically filters out these tags, retaining only the final generated content.

**Applicable Scenarios**:

-   Using LLMs that support reasoning processes (e.g., certain open-source models).
-   Desiring more concise output.
-   Not needing to view the AI's thought process.

**Important Notes**:

-   If your LLM does not support reasoning tags, this option will have no effect.
-   In some cases, retaining the reasoning process may help understand the AI's decision logic.

## Configuration Management

<SettingLlmSection mode="demo" />

### Multiple Configuration Support

MetaDoc supports creating multiple LLM configurations, allowing you to use different models for different scenarios:

-   **Work Configuration**: For daily work, using stable and reliable models.
-   **Experimental Configuration**: For testing new models or features.
-   **Different Providers**: Create independent configurations for different LLM services.

### Switching Configurations

In the configuration grid on the LLM settings page, you can:

1.  **Select a Configuration**: Click any configuration card to switch to that configuration.
2.  **View Configuration Info**: Each card displays the configuration name and type.
3.  **Identify Current Configuration**: The card for the currently used configuration is highlighted with a green border.

After switching configurations, all AI features will immediately use the LLM service from the new configuration. To edit a configuration, use the "Edit Configuration" option in the card's right-click menu to open a dialog. Make changes in the dialog and click "OK" to save or "Cancel" to discard; the interface no longer distinguishes an "Unsaved" state.

## Important Notes

1.  **API Key Security**: Please keep your API keys secure and do not share them with others.
2.  **Cost Control**: Using LLM services may incur costs; please monitor your usage.
3.  **Network Connection**: Using external APIs requires a stable network connection.
4.  **Configuration Backup**: It is recommended to export and back up important configurations to avoid loss.
5.  **Model Selection**: Different models have different capabilities and limitations; choose based on your needs.

## Related Documentation

-   [[settings.llm-management|LLM Configuration Management]]
-   [[settings.llm-types|LLM Type Configuration]]
-   [[ai.chat|AI Chat Feature]]
-   [[ai.completion|AI Auto-completion]]
-   [[ai.proofread|AI Proofreading Feature]]