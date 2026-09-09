import { StorageService } from './storage';
import voiceAssistant from './VoiceAssistantModule';
import { mqttClient } from './MqttModule';

export interface VoiceAssistantRuntimeOptions {
  onOpenUrl: (url: string) => Promise<void> | void;
  onError?: (message: string) => void;
}

/** Coordinates the independent native wake-word and STT lifecycles. */
export async function startVoiceAssistantRuntime(
  options: VoiceAssistantRuntimeOptions,
): Promise<() => void> {
  const [wakeWordEnabled, sttEnabled, language, action, template, wakeWord] = await Promise.all([
    StorageService.getVoiceWakeWordEnabled(),
    StorageService.getVoiceSttEnabled(),
    StorageService.getVoiceSttLanguage(),
    StorageService.getVoiceTranscriptionAction(),
    StorageService.getVoiceTranscriptionUrlTemplate(),
    StorageService.getVoiceWakeWord(),
  ]);

  if (!voiceAssistant.isAvailable() || !wakeWordEnabled || !sttEnabled) return () => {};
  if (!(await voiceAssistant.requestMicrophonePermission())) {
    options.onError?.('Microphone permission is required for voice assistant');
    return () => {};
  }

  let disposed = false;
  let listening = false;
  let handlingResult = false;

  const handleWakeWord = async () => {
    if (disposed || listening) return;
    listening = true;
    // Keep the two native modes distinct and avoid two components competing for audio.
    await voiceAssistant.stopWakeWordDetection();
    try {
      await voiceAssistant.startListening(language);
    } catch (error) {
      listening = false;
      options.onError?.(error instanceof Error ? error.message : 'Unable to start speech-to-text');
      if (!disposed) await voiceAssistant.startWakeWordDetection();
    }
  };

  const handleResult = async (event: { text?: string; isFinal?: boolean }) => {
    if (disposed || !event.isFinal || !event.text?.trim() || handlingResult) return;
    handlingResult = true;
    listening = false;
    const text = event.text.trim();
    const transcript = {
      text,
      language,
      wakeWord: wakeWord || undefined,
      timestamp: new Date().toISOString(),
      sessionId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };

    try {
      await mqttClient.publishVoiceTranscript(transcript);
      if (action === 'open_url') {
        if (!template.includes('{param}')) throw new Error('Voice URL must contain {param}');
        const target = template.split('{param}').join(encodeURIComponent(text));
        if (!/^https?:\/\//i.test(target)) {
          throw new Error('Voice URL must use http or https');
        }
        if (!/^https?:\/\/[^\s]+$/i.test(target)) {
          throw new Error('Voice URL is invalid');
        }
        await options.onOpenUrl(target);
      }
    } catch (error) {
      options.onError?.(error instanceof Error ? error.message : 'Voice command failed');
    } finally {
      handlingResult = false;
      if (!disposed) {
        await voiceAssistant.startWakeWordDetection();
      }
    }
  };

  const removeWakeWord = voiceAssistant.onWakeWord(handleWakeWord);
  const removeResult = voiceAssistant.onResult(handleResult);
  const removeError = voiceAssistant.onError(event => {
    if (!disposed && listening) {
      listening = false;
      options.onError?.(event.message || `Speech recognition error${event.code ? ` (${event.code})` : ''}`);
      voiceAssistant.startWakeWordDetection().catch(() => {});
    }
  });

  try {
    await voiceAssistant.startWakeWordDetection();
  } catch (error) {
    removeWakeWord();
    removeResult();
    removeError();
    options.onError?.(error instanceof Error ? error.message : 'Unable to start wake-word detection');
    return () => {};
  }

  return () => {
    disposed = true;
    removeWakeWord();
    removeResult();
    removeError();
    voiceAssistant.stopListening().catch(() => {});
    voiceAssistant.stopWakeWordDetection().catch(() => {});
  };
}

export default startVoiceAssistantRuntime;
