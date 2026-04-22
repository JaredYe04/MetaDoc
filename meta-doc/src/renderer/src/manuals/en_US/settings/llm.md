# LLM Configuration

## Overview

LLM (large language model) settings are central to MetaDoc’s AI features. **Retail builds distributed via Steam** differ from older test channels in what we recommend by default:

- **Steam (recommended)**: Use our **Cloudflare-based LLM API proxy** operated by MetaDoc (labeled **“MetaDoc Cloud (Steam)”** in the app). Purchase **credits** through **Steam top-up**, then use AI features—usually **without** supplying third-party API keys yourself.
- **Bring your own API (BYOK)**: This is a **developer / experimental** path. Only after you expand **Experimental options** on the **LLM** settings page and enable **“Enable experimental connectivity”** will you see the legacy **multi-profile + custom API** workflow. See “Experimental connectivity and BYOK” below and the linked articles.

The following sections first explain **Steam / MetaDoc Cloud** (balance, top-up, model switching), then **experimental options**, then the **full UI behavior** (enable LLM, temperature, configuration grid, etc.).

---

## Steam: MetaDoc Cloud and credits (recommended)

For MetaDoc installed and run through **Steam**.

### Quick steps

1. **Open LLM settings**: **Settings** → **LLM** (or open **Settings** from the menu bar).
2. **Find “MetaDoc Cloud (Steam)”**: There you can see **Balance (credits)**, pick a **Model**, use **Add credits** / **Top up**, and **Refresh** the balance from the server.
3. **Top up**: Use **Add credits** and complete the **Steam in-app purchase** flow. Launch the app from your Steam library and keep the Steam client available (if purchase cannot start, the UI will explain Steam / Greenworks requirements).
4. **Check balance**: Credits are shown on this page. You can also use the **Steam** tray entry to see **Account credits balance** and start a top-up (wording matches the in-app UI).
5. **Pricing**: Different **models** may debit **credits** at different rates. Exact rules are shown in the app.
6. **Switch models anytime**: After you choose a model under MetaDoc Cloud, **AI chat, completion, proofreading, Agent**, etc. use that model; you can change it whenever you like.

<SettingLlmSection mode="demo" />

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

### Notes

- The service endpoint and proxy are operated by MetaDoc—you **do not** need to paste OpenAI / DeepSeek URLs and keys for this path (unlike BYOK below).
- If your balance is insufficient or the network fails, AI features may be unavailable or show errors—**top up** or **refresh balance** and try again.

---

## Developer options: experimental connectivity and BYOK (custom API)

On **Steam** builds, the older **“configure your own LLM API”** flow is under **developer / experimental** controls: open **Experimental options** on the **LLM** settings page, then enable **“Enable experimental connectivity”** (you will be asked to confirm). Only then will you see the **multi-configuration cards, API base URL, API key, provider types**, etc., as in legacy test builds.

**Important**:

- This is **experimental** and may **differ** from the standard Steam / MetaDoc Cloud experience, and may cause **charges directly with third-party providers** plus extra network and compliance considerations.
- **You are solely responsible** for API key handling, billing, availability, and compliance with third-party terms when using your own APIs. MetaDoc only provides client-side configuration and connectivity.

For step-by-step details (same as the historical docs):

- [[settings.llm-management|LLM configuration management]]
- [[settings.llm-types|LLM provider types]]
- [[ai.llm-config|LLM configuration guide]]

---

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

1.  **API Key Security**: Please keep your API keys secure and do not share them with others (only relevant when using BYOK / experimental connectivity).
2.  **Cost Control**: Using LLM services may incur costs—monitor usage. MetaDoc Cloud uses **credits**; BYOK follows your provider’s billing.
3.  **Network Connection**: Using external APIs requires a stable network connection.
4.  **Configuration Backup**: It is recommended to export and back up important configurations to avoid loss.
5.  **Model Selection**: Different models have different capabilities and limitations; choose based on your needs.

## Related Documentation

-   [[settings.llm-management|LLM Configuration Management]]
-   [[settings.llm-types|LLM Type Configuration]]
-   [[ai.chat|AI Chat Feature]]
-   [[ai.completion|AI Auto-completion]]
-   [[ai.proofread|AI Proofreading Feature]]
