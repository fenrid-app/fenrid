# Fenrid Installer for Windows

Fenrid Installer opens the Fenrid community app in a dedicated desktop window. It uses the Fenrid website for its interface, account, and online features; it does not bundle or replace Fenrid's service.

## Install

Run `Fenrid-Installer-1.0.3-x64.exe` and follow the installer. Fenrid Installer is installed for the current Windows user, with Start menu and desktop shortcuts.

The installer is not code-signed. Windows may show an unknown-publisher notice.

## Build

Install Node.js, then run these commands from the project folder:

```powershell
npm install
npm start
npm run dist
```

The Windows installer is created in `dist`.

## App behavior

- Opens `https://fenrid.com/channels/me`; Fenrid redirects to sign-in when needed and returns signed-in users to their community.
- Displays the supplied Fenrid logo as the application, window, and taskbar icon; labels the application and shortcuts "Fenrid Installer."
- Allows media and notification permissions only for Fenrid. Closing the window hides the app in the system tray, keeping its live session available; choose **Quit Fenrid Installer** in the tray menu to exit.
- Checks its configured GitHub release feed when it starts, downloads updates, and silently restarts to install them.
- Opens links outside Fenrid in the default web browser.
- Requires an internet connection and a Fenrid account for account features.

Automatic releases require this project to live in a **public GitHub repository**. Pushing to `main` or `master` builds a Windows installer and publishes a release for the app updater. A packaged local build that has not been built from GitHub Actions cannot check that release feed.

Fenrid's website uses the browser Push API. Although Electron grants Fenrid notification permission, its Chromium push service currently rejects `PushManager.subscribe()` with `push service not available`. Actual remote web push requires a browser with a working push service (such as Edge or Chrome) or a push integration supported by Fenrid's backend.
