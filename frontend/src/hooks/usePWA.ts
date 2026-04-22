/**
 * usePWA Hook
 * Provides PWA functionality including device registration, offline detection, and push notifications
 */

import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType: 'ios' | 'android' | 'web' | 'desktop';
  pushToken: string;
  trusted: boolean;
  lastSeen: string;
}

export interface PWAState {
  isOnline: boolean;
  isPWACapable: boolean;
  isInstalled: boolean;
  devices: DeviceInfo[];
  isRegistering: boolean;
  error: string | null;
}

const initialState: PWAState = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isPWACapable: false,
  isInstalled: false,
  devices: [],
  isRegistering: false,
  error: null
};

export function usePWA() {
  const [state, setState] = useState<PWAState>(initialState);

  /**
   * Detect if PWA is installed
   */
  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setState((prev) => ({ ...prev, isInstalled: true }));
    }
  }, []);

  /**
   * Listen for online/offline events
   */
  useEffect(() => {
    const handleOnline = () => {
      setState((prev) => ({ ...prev, isOnline: true }));
    };

    const handleOffline = () => {
      setState((prev) => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  /**
   * Check if browser is PWA-capable
   */
  const checkPWACapable = useCallback(() => {
    const userAgent = navigator.userAgent.toLowerCase();

    const isPWACapable =
      /iphone|ipad|ipod|android|chrome|edge|opera/.test(userAgent) &&
      'serviceWorker' in navigator;

    setState((prev) => ({ ...prev, isPWACapable }));
    return isPWACapable;
  }, []);

  /**
   * Register device for push notifications
   */
  const registerDevice = useCallback(async (token: string): Promise<boolean> => {
    setState((prev) => ({ ...prev, isRegistering: true, error: null }));

    try {
      // Detect device type and name
      const deviceType = detectDeviceType();
      const deviceName = getDeviceName();

      // Get app version (from package.json or env)
      const appVersion = process.env.REACT_APP_VERSION || '1.0.0';

      // Call API
      const response = await axios.post('/api/v1/auth/register-device', {
        device_name: deviceName,
        device_type: deviceType,
        push_token: token,
        app_version: appVersion
      });

      if (response.data.device_id) {
        // Store device ID locally
        localStorage.setItem('nomos_device_id', response.data.device_id);

        setState((prev) => ({ ...prev, isRegistering: false }));
        return true;
      }

      throw new Error('Failed to register device');
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || error.message;
      setState((prev) => ({
        ...prev,
        isRegistering: false,
        error: errorMessage
      }));
      return false;
    }
  }, []);

  /**
   * Get list of registered devices
   */
  const getDevices = useCallback(async (): Promise<DeviceInfo[] | null> => {
    try {
      const response = await axios.get('/api/v1/auth/register-device');
      setState((prev) => ({ ...prev, devices: response.data }));
      return response.data;
    } catch (error) {
      console.error('Failed to fetch devices:', error);
      return null;
    }
  }, []);

  /**
   * Trust a device (skip 2FA for 30 days)
   */
  const trustDevice = useCallback(async (deviceId: string): Promise<boolean> => {
    try {
      const response = await axios.post(
        `/api/v1/auth/register-device/${deviceId}/trust`,
        { device_name: getDeviceName() }
      );

      if (response.status === 200) {
        // Update devices list
        await getDevices();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to trust device:', error);
      return false;
    }
  }, [getDevices]);

  /**
   * Unregister a device
   */
  const unregisterDevice = useCallback(async (deviceId: string): Promise<boolean> => {
    try {
      await axios.delete(`/api/v1/auth/register-device/${deviceId}`);
      // Update devices list
      await getDevices();
      return true;
    } catch (error) {
      console.error('Failed to unregister device:', error);
      return false;
    }
  }, [getDevices]);

  /**
   * Request push notification permission
   */
  const requestNotificationPermission = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) {
      console.warn('Browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission === 'denied') {
      return false;
    }

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }, []);

  /**
   * Get FCM token for push notifications
   */
  const getFCMToken = useCallback(async (): Promise<string | null> => {
    try {
      // This assumes Firebase Messaging is initialized in the app
      const messaging = await import('firebase/messaging').then(
        (m) => m.getMessaging?.()
      );

      if (!messaging) {
        console.warn('Firebase Messaging not available');
        return null;
      }

      const token = await import('firebase/messaging').then((m) =>
        m.getToken?.(messaging, {
          vapidKey: process.env.REACT_APP_FIREBASE_VAPID_KEY
        })
      );

      return token || null;
    } catch (error) {
      console.error('Failed to get FCM token:', error);
      return null;
    }
  }, []);

  /**
   * Trigger full sync on demand
   */
  const syncData = useCallback(async (lastSync?: Date): Promise<boolean> => {
    try {
      const response = await axios.get('/api/v1/cases/sync', {
        params: {
          last_sync: lastSync?.toISOString(),
          device_id: localStorage.getItem('nomos_device_id')
        }
      });

      if (response.data) {
        // Update last sync time
        localStorage.setItem('nomos_last_sync', new Date().toISOString());
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to sync data:', error);
      return false;
    }
  }, []);

  return {
    ...state,
    checkPWACapable,
    registerDevice,
    getDevices,
    trustDevice,
    unregisterDevice,
    requestNotificationPermission,
    getFCMToken,
    syncData
  };
}

/**
 * Detect device type based on user agent
 */
function detectDeviceType(): 'ios' | 'android' | 'web' | 'desktop' {
  const userAgent = navigator.userAgent.toLowerCase();

  if (/iphone|ipad|ipod/.test(userAgent)) {
    return 'ios';
  }

  if (/android/.test(userAgent)) {
    return 'android';
  }

  if (/windows|linux|mac/.test(userAgent) && !/mobile|tablet/.test(userAgent)) {
    return 'desktop';
  }

  return 'web';
}

/**
 * Get human-readable device name
 */
function getDeviceName(): string {
  const userAgent = navigator.userAgent;

  // iOS
  if (/iPhone/.test(userAgent)) {
    return 'iPhone';
  }
  if (/iPad/.test(userAgent)) {
    return 'iPad';
  }

  // Android
  if (/Android/.test(userAgent)) {
    const androidMatch = userAgent.match(/Android (\d+\.\d+)/);
    const version = androidMatch ? androidMatch[1] : '';
    return `Android Device ${version}`.trim();
  }

  // Desktop
  if (/Windows/.test(userAgent)) {
    return 'Windows PC';
  }
  if (/Mac/.test(userAgent)) {
    return 'Mac';
  }
  if (/Linux/.test(userAgent)) {
    return 'Linux';
  }

  // Fallback
  const now = new Date();
  return `Device (${now.toLocaleDateString()})`;
}

export default usePWA;
