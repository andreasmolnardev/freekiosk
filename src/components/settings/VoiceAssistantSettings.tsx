import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import SettingsSection from './SettingsSection';
import SettingsSwitch from './SettingsSwitch';
import SettingsInput from './SettingsInput';
import SettingsRadioGroup from './SettingsRadioGroup';
import SettingsButton from './SettingsButton';
import { Colors, Spacing, Typography } from '../../theme';
import { StorageService } from '../../utils/storage';
import type { VoiceTranscriptionAction } from '../../types/voiceAssistant';
import voiceAssistant, { VoiceAssistantStatus } from '../../utils/VoiceAssistantModule';

const isHttpUrlTemplate = (value: string): boolean => {
  if (!value.trim() || !value.includes('{param}')) return false;
  return /^https?:\/\/[^\s]+$/i.test(value.replace('{param}', 'voice-test'));
};

const persist = (operation: Promise<void>): void => {
  operation.catch(() => undefined);
};

const VoiceAssistantSettings: React.FC = () => {
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);
  const [wakeWord, setWakeWord] = useState('');
  const [sttEnabled, setSttEnabled] = useState(false);
  const [sttLanguage, setSttLanguage] = useState('en-US');
  const [action, setAction] = useState<VoiceTranscriptionAction>('none');
  const [urlTemplate, setUrlTemplate] = useState('');
  const [nativeStatus, setNativeStatus] = useState<VoiceAssistantStatus | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const refreshNativeStatus = async () => {
    if (!voiceAssistant.isAvailable()) return;
    setNativeStatus(await voiceAssistant.getStatus());
  };

  useEffect(() => {
    Promise.all([
      StorageService.getVoiceWakeWordEnabled(),
      StorageService.getVoiceWakeWord(),
      StorageService.getVoiceSttEnabled(),
      StorageService.getVoiceSttLanguage(),
      StorageService.getVoiceTranscriptionAction(),
      StorageService.getVoiceTranscriptionUrlTemplate(),
    ]).then(([wakeEnabled, word, speechEnabled, language, transcriptionAction, template]) => {
      setWakeWordEnabled(wakeEnabled);
      setWakeWord(word);
      setSttEnabled(speechEnabled);
      setSttLanguage(language);
      setAction(transcriptionAction);
      setUrlTemplate(template);
    });
  }, []);

  useEffect(() => {
    refreshNativeStatus();
    const interval = setInterval(refreshNativeStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const urlError = action === 'open_url' && urlTemplate.length > 0 && !isHttpUrlTemplate(urlTemplate)
    ? 'Use an http:// or https:// URL containing {param}.'
    : action === 'open_url' && urlTemplate.length === 0
      ? 'Enter an http:// or https:// URL containing {param}.'
      : undefined;

  return (
    <>
      <SettingsSection title="Voice Assistant" icon="microphone">
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Native voice module</Text>
          <Text style={styles.statusValue}>
            {voiceAssistant.isAvailable() ? nativeStatus?.state ?? 'Checking…' : 'Not available'}
          </Text>
        </View>
        <Text style={styles.statusHint}>
          {voiceAssistant.isAvailable()
            ? `Speech recognizer: ${nativeStatus?.speechRecognizerAvailable ? 'available' : 'unavailable'}`
            : 'Settings can be saved, but this build has no registered Android voice module.'}
        </Text>
        {voiceAssistant.isAvailable() && (
          <>
            <SettingsButton
              title={permissionGranted ? 'Microphone permission granted' : 'Grant microphone permission'}
              icon="microphone"
              variant="outline"
              onPress={async () => setPermissionGranted(await voiceAssistant.requestMicrophonePermission())}
            />
            <SettingsButton
              title={nativeStatus?.listening ? 'Stop speech-to-text test' : 'Test speech-to-text'}
              icon={nativeStatus?.listening ? 'stop' : 'test-tube'}
              variant="secondary"
              onPress={async () => {
                if (nativeStatus?.listening) await voiceAssistant.stopListening();
                else await voiceAssistant.startListening(sttLanguage);
                await refreshNativeStatus();
              }}
            />
            <SettingsButton
              title={nativeStatus?.wakeWordDetectionActive ? 'Stop wake-word test' : 'Start wake-word test'}
              icon={nativeStatus?.wakeWordDetectionActive ? 'stop' : 'flash'}
              variant="outline"
              onPress={async () => {
                if (nativeStatus?.wakeWordDetectionActive) {
                  await voiceAssistant.stopWakeWordDetection();
                } else {
                  await voiceAssistant.startWakeWordDetection();
                  voiceAssistant.triggerWakeWord();
                }
                await refreshNativeStatus();
              }}
            />
          </>
        )}
      </SettingsSection>

      <SettingsSection title="Wake Word" icon="microphone">
        <SettingsSwitch
          label="Enable wake word"
          hint="Listen for a configured phrase before starting speech recognition."
          icon="microphone"
          value={wakeWordEnabled}
          onValueChange={(value) => {
            setWakeWordEnabled(value);
            persist(StorageService.saveVoiceWakeWordEnabled(value));
          }}
        />
        <SettingsInput
          label="Wake word or phrase"
          value={wakeWord}
          onChangeText={(value) => {
            setWakeWord(value);
            persist(StorageService.saveVoiceWakeWord(value));
          }}
          placeholder="Hey Jarvis"
          icon="microphone"
          disabled={!wakeWordEnabled}
          hint="The bundled local model detects Hey Jarvis. Custom phrases require a separately trained wake-word model."
        />
      </SettingsSection>

      <SettingsSection title="Speech-to-Text (STT)" icon="microphone">
        <SettingsSwitch
          label="Enable speech-to-text"
          hint="Allow transcribed speech to trigger the selected action."
          icon="microphone"
          value={sttEnabled}
          onValueChange={(value) => {
            setSttEnabled(value);
            persist(StorageService.saveVoiceSttEnabled(value));
          }}
        />
        <SettingsInput
          label="Recognition language"
          value={sttLanguage}
          onChangeText={(value) => {
            setSttLanguage(value);
            persist(StorageService.saveVoiceSttLanguage(value));
          }}
          placeholder="en-US"
          icon="earth"
          hint="Use a BCP-47 language tag, for example en-US or de-DE. Android offline recognition is requested when supported by the device."
          disabled={!sttEnabled}
        />
        <SettingsRadioGroup
          label="On transcription"
          icon="flash"
          value={action}
          onValueChange={(value) => {
            const next = value as VoiceTranscriptionAction;
            setAction(next);
            persist(StorageService.saveVoiceTranscriptionAction(next));
          }}
          options={[
            { value: 'none', label: 'None', hint: 'Only expose the transcription to the native integration.' },
            { value: 'open_url', label: 'Open URL', hint: 'Open a URL after replacing {param} with the transcription.' },
          ]}
        />
        {action === 'open_url' && (
          <SettingsInput
            label="URL template"
            value={urlTemplate}
            onChangeText={(value) => {
              setUrlTemplate(value);
              persist(StorageService.saveVoiceTranscriptionUrlTemplate(value));
            }}
            placeholder="https://example.com/search?q={param}"
            icon="web"
            autoCapitalize="none"
            error={urlError}
            hint="The template must be an http:// or https:// URL and include {param}."
          />
        )}
      </SettingsSection>
    </>
  );
};

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  statusLabel: {
    ...Typography.label,
  },
  statusValue: {
    color: Colors.warningDark,
    fontSize: 14,
  },
  statusHint: {
    ...Typography.hint,
  },
});

export default VoiceAssistantSettings;
