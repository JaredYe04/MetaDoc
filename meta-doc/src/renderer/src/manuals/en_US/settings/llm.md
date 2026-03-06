# LLM Configuration

## Overview

LLM (Large Language Model) configuration is the core setting for MetaDoc AI features. By configuring the LLM, you can enable intelligent functions such as AI chat, AI proofreading, and AI completion. MetaDoc supports multiple LLM service providers, allowing you to choose the appropriate model based on your needs.

## Enabling LLM

<SettingLlmSection mode="demo" />

### Enabling AI Features

On the LLM settings page, you first need to enable the LLM feature:

1.  Locate the "Enable LLM" switch.
2.  Toggle the switch to the "Enabled" state.
3.  The system will automatically load the default LLM configuration.

You can access the settings via the top menu bar:

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

### LLM Settings Interface

The following diagram shows the main functional areas of the LLM configuration page:

<SettingLlmSection mode="demo" />

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

The above diagram illustrates the main components of the LLM settings interface:

-   **Global Settings**: LLM enable switch, Temperature adjustment slider, think tag removal option.
-   **Configuration List**: Displays all configured LLM providers (e.g., OpenAI, Ollama, Gemini, etc.) on the left.
-   **Configuration Details**: Shows detailed parameters (API address, model selection, token limits, etc.) for the selected configuration on the right.
-   **Test Area**: Allows testing if the current configuration is working correctly.
-   **Action Buttons**: Functions such as creating a new configuration, importing/exporting configurations, and deleting configurations.

In demo mode, you can interactively view the interface layout, but modifications will not be saved.

After enabling LLM, you can use the following AI features:

-   AI Chat
-   AI Proofreading
-   AI Auto-completion
-   AI Assistant Functions
-   Agent Framework

**Important Notes**:

-   After enabling LLM, some features may call APIs, potentially incurring costs.
-   It is recommended to configure your LLM service before enabling it.
-   If AI features are not needed, you can keep it disabled to save resources.

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
-   **Conversational Interaction**: Recommended 0.7-0.9 to keep the dialogue natural and fluent.

The temperature setting affects all features using the LLM, including AI chat, AI completion, AI proofreading, etc.

## Auto-Remove Think Tags

### Feature Description

Some LLMs may include a thinking process when generating content, often marked with special tags. When "Auto-Remove Think Tags" is enabled, MetaDoc automatically filters out these tags, retaining only the final generated content.

**Applicable Scenarios**:

-   Using LLMs that support a thinking process (e.g., certain open-source models).
-   Desiring more concise output.
-   Not needing to view the AI's thought process.

**Important Notes**:

-   If your LLM does not support think tags, this option will have no effect.
-   In some cases, retaining the thinking process may help in understanding the AI's decision logic.

## Configuration Management

<SettingLlmSection mode="demo" />

### Multiple Configuration Support

MetaDoc supports creating multiple LLM configurations, allowing you to use different models for different scenarios:

-   **Work Configuration**: For daily work, using stable and reliable models.
-   **Experimental Configuration**: For testing new models or features.
-   **Different Providers**: Create independent configurations for different LLM services.

### Switching Configurations

In the configuration list on the left side of the LLM settings page, you can:

1.  **Select a Configuration**: Click on a configuration item to switch to it.
2.  **View Configuration Info**: The configuration name is displayed in the list.
3.  **Identify Current Configuration**: The currently active configuration is highlighted.

After switching configurations, all AI features will immediately use the LLM service from the new configuration.

## Configuration Status Indicators

<SettingLlmSection mode="demo" />

### Unsaved Changes

When you have modified a configuration but not yet saved it, the system displays an "Unsaved Changes" prompt:

-   A warning icon appears next to the configuration name.
-   The workspace status bar shows "Unsaved changes exist."
-   You must click the "Save Changes" button to save modifications.

### Saving Changes

After modifying a configuration, remember to click the "Save Changes" button:

1.  Click the "Save Changes" button in the top-right corner of the workspace.
2.  The system saves all modifications to the current configuration.
3.  Upon successful save, the status updates to "All changes saved."

### Discarding Changes

If you do not wish to save the current modifications:

1.  Click the "Discard Changes" button.
2.  The system reverts to the last saved state.
3.  All unsaved modifications will be discarded.

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