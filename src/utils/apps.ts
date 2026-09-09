import AppLauncherModule, { AppInfo } from './AppLauncherModule';

/**
 * Returns the launchable Android applications available to FreeKiosk.
 * This is the shared app catalogue used by administration UI and app-launch flows.
 */
export async function getApps(): Promise<AppInfo[]> {
  if (!AppLauncherModule?.getInstalledApps) {
    return [];
  }
  const apps = await AppLauncherModule.getInstalledApps();
  return apps
    .filter(app => Boolean(app.packageName && app.appName))
    .sort((a, b) => a.appName.localeCompare(b.appName));
}

export type { AppInfo };
