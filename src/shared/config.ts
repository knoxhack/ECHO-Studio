// App-level config persisted in userData/config.json.
export interface AppConfig {
  ai: {
    enabled: boolean
    apiKey: string
    baseUrl: string // OpenAI-compatible base, e.g. https://api.openai.com/v1
    model: string
  }
  sdk: {
    autoUpdate: boolean
    targetVersion: string
  }
  sandbox: {
    defaultProfile: string
  }
  git: {
    enabled: boolean
  }
  theme: string
}

export const DEFAULT_CONFIG: AppConfig = {
  ai: {
    enabled: true,
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini'
  },
  sdk: { autoUpdate: true, targetVersion: '1.4.x' },
  sandbox: { defaultProfile: 'Ashfall Sandbox' },
  git: { enabled: false },
  theme: 'dark'
}

export interface AiFile {
  path: string
  content: string
}

export interface AiChatResult {
  text: string
  files?: AiFile[]
  usedModel: boolean
}
