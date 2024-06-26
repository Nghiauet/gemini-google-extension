import Browser from 'webextension-polyfill'
import { getProviderConfigs, ProviderType, PROVIDER_CONFIG_DEFAULT } from '../config'
import { GeminiProvider } from './providers/gemini'
import { OpenAIProvider } from './providers/openai'
import { Provider } from './types'

async function generateAnswers(port: Browser.Runtime.Port, question: string) {
  const providerConfigs = await getProviderConfigs()
  const geminiDefUrl = PROVIDER_CONFIG_DEFAULT[ProviderType.Gemini].baseUrl
  const geminiModel = PROVIDER_CONFIG_DEFAULT[ProviderType.Gemini].models[0]

  const openaiDefUrl = PROVIDER_CONFIG_DEFAULT[ProviderType.OpenAI].baseUrl
  const openaiModel = PROVIDER_CONFIG_DEFAULT[ProviderType.OpenAI].models[0]


  let provider: Provider
  if (providerConfigs.provider === ProviderType.Gemini) {
    const { apiKey, baseUrl = geminiDefUrl, model = geminiModel } = providerConfigs.configs[ProviderType.Gemini]!
    provider = new GeminiProvider(apiKey, baseUrl, model)
  } else if (providerConfigs.provider === ProviderType.OpenAI) {
    const { apiKey, model = openaiModel, baseUrl = openaiDefUrl } = providerConfigs.configs[ProviderType.OpenAI]!
    provider = new OpenAIProvider(apiKey, baseUrl, model)
  } else {
    throw new Error(`Unknown provider ${providerConfigs.provider}`)
  }

  const controller = new AbortController()
  port.onDisconnect.addListener(() => {
    controller.abort()
    cleanup?.()
  })

  const { cleanup } = await provider.generateAnswer({
    prompt: question,
    signal: controller.signal,
    onEvent(event) {
      if (event.type === 'done') {
        port.postMessage({ event: 'DONE' })
        return
      }
      port.postMessage(event.data)
    },
  })
}

Browser.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener(async (msg) => {
    console.debug('received msg', msg)
    try {
      await generateAnswers(port, msg.question)
    } catch (err: any) {
      console.error(err)
      port.postMessage({ error: err.message })
    }
  })
})

Browser.runtime.onMessage.addListener(async (message) => {
  if (message.type === 'OPEN_OPTIONS_PAGE') {
    Browser.runtime.openOptionsPage()
  }
})

Browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    Browser.runtime.openOptionsPage()
  }
})