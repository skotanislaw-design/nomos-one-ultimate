/**
 * PWA Install Prompt Component
 * Shows "Install Nomos" button on mobile devices
 * Uses beforeinstallprompt event to trigger app installation
 */

import React, { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Check if this is a PWA-capable browser
      const isPWACapable = isPWABrowser();
      if (isPWACapable) {
        setShowPrompt(true);
      }
    };

    // Listen for app installed event
    const handleAppInstalled = () => {
      console.log('Nomos One app installed!');
      setShowPrompt(false);
      setIsInstalled(true);
      setDeferredPrompt(null);

      // Track installation
      trackEvent('app_installed');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  /**
   * Check if browser supports PWA installation
   */
  const isPWABrowser = (): boolean => {
    const userAgent = navigator.userAgent.toLowerCase();

    // iOS Safari
    if (/iphone|ipad|ipod/.test(userAgent)) {
      return true;
    }

    // Android Chrome/Firefox
    if (/android/.test(userAgent)) {
      return true;
    }

    // Desktop Chrome/Edge/Opera
    if (/chrome|edge|opera/.test(userAgent)) {
      return true;
    }

    return false;
  };

  /**
   * Handle install button click
   */
  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      return;
    }

    setIsInstalling(true);

    try {
      // Show the install prompt
      await deferredPrompt.prompt();

      // Wait for user choice
      const choiceResult = await deferredPrompt.userChoice;

      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted app installation');
        trackEvent('install_accepted');
      } else {
        console.log('User dismissed app installation');
        trackEvent('install_dismissed');
      }

      setDeferredPrompt(null);
      setShowPrompt(false);
    } catch (error) {
      console.error('Installation failed:', error);
      trackEvent('install_failed');
    } finally {
      setIsInstalling(false);
    }
  };

  /**
   * Track install events for analytics
   */
  const trackEvent = (eventName: string) => {
    // Send to analytics service if available
    if (window.gtag) {
      window.gtag('event', eventName);
    }
  };

  /**
   * Handle dismiss button
   */
  const handleDismiss = () => {
    setShowPrompt(false);
    trackEvent('install_dismissed_manual');
  };

  // Don't show if already installed or not eligible
  if (isInstalled || !showPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 shadow-lg animate-slide-up">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <Download size={24} className="flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-lg">Install Nomos One</h3>
            <p className="text-sm text-blue-100">
              Access your cases from home screen
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={handleInstallClick}
            disabled={isInstalling}
            className="
              px-4 py-2 bg-white text-blue-600 font-semibold rounded-lg
              hover:bg-blue-50 transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
              whitespace-nowrap
            "
          >
            {isInstalling ? 'Installing...' : 'Install'}
          </button>
          <button
            onClick={handleDismiss}
            className="
              p-2 hover:bg-blue-600 rounded-lg transition-colors
              text-white
            "
            aria-label="Dismiss"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Mobile: Stack layout */}
      <style>{`
        @media (max-width: 640px) {
          .fixed.bottom-0 {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
};

export default PWAInstallPrompt;
