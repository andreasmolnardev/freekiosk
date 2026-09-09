import { DeviceEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';

export interface VoiceAssistantStatus {
  wakeWordDetectionActive: boolean;
  listening: boolean;
  speechRecognizerAvailable: boolean;
  state: string;
  wakeWordModel?: string;
}

type NativeVoiceAssistant = {
  getStatus?: () => Promise<VoiceAssistantStatus>;
  startWakeWordDetection?: () => Promise<boolean>;
  stopWakeWordDetection?: () => Promise<boolean>;
  startListening?: (language: string) => Promise<boolean>;
  stopListening?: () => Promise<boolean>;
  triggerWakeWord?: () => void;
};

const nativeVoiceAssistant = NativeModules.VoiceAssistantModule as NativeVoiceAssistant | undefined;

export const voiceAssistant = {
  isAvailable: (): boolean => Platform.OS === 'android' && !!nativeVoiceAssistant,

  getStatus: async (): Promise<VoiceAssistantStatus | null> => {
    if (!nativeVoiceAssistant?.getStatus) return null;
    try { return await nativeVoiceAssistant.getStatus(); } catch { return null; }
  },

  requestMicrophonePermission: async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return false;
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  },

  startWakeWordDetection: async (): Promise<boolean> => {
    if (!nativeVoiceAssistant?.startWakeWordDetection) return false;
    return nativeVoiceAssistant.startWakeWordDetection();
  },

  stopWakeWordDetection: async (): Promise<boolean> => {
    if (!nativeVoiceAssistant?.stopWakeWordDetection) return false;
    return nativeVoiceAssistant.stopWakeWordDetection();
  },

  startListening: async (language = 'en-US'): Promise<boolean> => {
    if (!nativeVoiceAssistant?.startListening) return false;
    return nativeVoiceAssistant.startListening(language);
  },

  stopListening: async (): Promise<boolean> => {
    if (!nativeVoiceAssistant?.stopListening) return false;
    return nativeVoiceAssistant.stopListening();
  },

  triggerWakeWord: (): void => {
    nativeVoiceAssistant?.triggerWakeWord?.();
  },

  onWakeWord: (callback: (event: { source?: string; model?: string; score?: number; timestamp?: number }) => void): (() => void) => {
    const subscription = DeviceEventEmitter.addListener('voiceAssistantWakeWord', callback);
    return () => subscription.remove();
  },

  onResult: (callback: (event: { text?: string; isFinal?: boolean }) => void): (() => void) => {
    const subscription = DeviceEventEmitter.addListener('voiceAssistantResult', callback);
    return () => subscription.remove();
  },

  onError: (callback: (event: { code?: number; message?: string }) => void): (() => void) => {
    const subscription = DeviceEventEmitter.addListener('voiceAssistantError', callback);
    return () => subscription.remove();
  },
};

export default voiceAssistant;
