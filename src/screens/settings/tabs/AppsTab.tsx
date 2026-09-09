import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SettingsInfoBox } from '../../../components/settings';
import Icon from '../../../components/Icon';
import { Colors, Spacing, Typography } from '../../../theme';
import AppLauncherModule from '../../../utils/AppLauncherModule';
import { getApps, AppInfo } from '../../../utils/apps';

const AppsTab: React.FC = () => {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState<string | null>(null);

  const loadApps = useCallback(async () => {
    setLoading(true);
    try {
      setApps(await getApps());
    } catch (error) {
      Alert.alert('Error', `Unable to discover installed apps: ${error}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  const launchApp = async (app: AppInfo) => {
    setLaunching(app.packageName);
    try {
      await AppLauncherModule.launchExternalApp(app.packageName);
    } catch (error) {
      Alert.alert('Unable to launch app', `${app.appName}: ${error}`);
    } finally {
      setLaunching(null);
    }
  };

  return (
    <View>
      <SettingsInfoBox variant="info">
        <Text style={styles.infoText}>
          Launch any installed app from the admin interface. 
        </Text>
      </SettingsInfoBox>

      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Installed Apps</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={loadApps} disabled={loading}>
          <Icon name="refresh" size={20} color={Colors.primary} />
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.muted}>Discovering apps…</Text>
        </View>
      ) : (
        <FlatList
          data={apps}
          scrollEnabled={false}
          keyExtractor={item => item.packageName}
          ListEmptyComponent={<Text style={styles.muted}>No launchable apps found.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.appRow}
              onPress={() => launchApp(item)}
              disabled={launching !== null}
            >
              <View style={styles.iconCircle}>
                <Text style={styles.iconText}>{item.appName.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.appDetails}>
                <Text style={styles.appName} numberOfLines={1}>{item.appName}</Text>
                <Text style={styles.packageName} numberOfLines={1}>{item.packageName}</Text>
              </View>
              {launching === item.packageName ? (
                <ActivityIndicator color={Colors.primary} />
              ) : (
                <Icon name="launch" size={22} color={Colors.primary} />
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  infoText: { ...Typography.body, color: Colors.textPrimary },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: Spacing.lg, marginBottom: Spacing.sm,
  },
  sectionTitle: { ...Typography.sectionTitle },
  refreshButton: { flexDirection: 'row', alignItems: 'center', padding: Spacing.xs },
  refreshText: { ...Typography.body, color: Colors.primary, marginLeft: 5 },
  loading: { alignItems: 'center', padding: Spacing.xl },
  muted: { ...Typography.body, color: Colors.textHint, paddingVertical: Spacing.md },
  appRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  iconCircle: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center', marginRight: Spacing.sm,
  },
  iconText: { color: Colors.primary, fontSize: 18, fontWeight: '700' },
  appDetails: { flex: 1, marginRight: Spacing.sm },
  appName: { ...Typography.body, color: Colors.textPrimary, fontWeight: '600' },
  packageName: { ...Typography.hint, color: Colors.textHint, marginTop: 2 },
});

export default AppsTab;
