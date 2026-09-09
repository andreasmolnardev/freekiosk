/** Configuration for the optional voice assistant integration. */
export type VoiceTranscriptionAction = 'none' | 'open_url';

export interface VoiceAssistantSettings {
  wakeWordEnabled: boolean;
  wakeWord: string;
  sttEnabled: boolean;
  sttLanguage: string;
  onTranscription: VoiceTranscriptionAction;
  transcriptionUrlTemplate: string;
}
