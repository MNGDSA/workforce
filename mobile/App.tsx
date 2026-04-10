import './src/crypto-polyfill';
import React, { useState, useCallback, useEffect } from 'react';
import { StatusBar, ActivityIndicator, View, StyleSheet } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from './src/hooks/useAuth';
import { startAutoSync, stopAutoSync } from './src/services/sync';
import { getDatabase } from './src/services/database';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import CaptureScreen from './src/screens/CaptureScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import MapScreen from './src/screens/MapScreen';
import PrivacyScreen from './src/screens/PrivacyScreen';
import BiometricDisclosure from './src/components/BiometricDisclosure';
import { colors } from './src/theme';

const BIOMETRIC_CONSENT_KEY = 'workforce_biometric_consent';

type Screen = 'home' | 'capture' | 'history' | 'map' | 'privacy';

export default function App() {
  const auth = useAuth();
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [dbReady, setDbReady] = useState(false);
  const [biometricConsentGiven, setBiometricConsentGiven] = useState<boolean | null>(null);
  const [showBiometricDisclosure, setShowBiometricDisclosure] = useState(false);

  useEffect(() => {
    getDatabase().then(() => setDbReady(true));
  }, []);

  useEffect(() => {
    if (auth.isAuthenticated) {
      SecureStore.getItemAsync(BIOMETRIC_CONSENT_KEY).then(val => {
        setBiometricConsentGiven(val === 'accepted');
        if (val !== 'accepted') {
          setShowBiometricDisclosure(true);
        }
      });
    }
  }, [auth.isAuthenticated]);

  useEffect(() => {
    if (auth.isAuthenticated && auth.workforceRecord) {
      startAutoSync(30000);
      return () => stopAutoSync();
    }
    return undefined;
  }, [auth.isAuthenticated, auth.workforceRecord]);

  const handleLogin = useCallback(async (identifier: string, password: string) => {
    await auth.login(identifier, password);
  }, [auth]);

  const navigateTo = useCallback((screen: Screen) => {
    setCurrentScreen(screen);
  }, []);

  const handleBiometricAccept = async (): Promise<void> => {
    await SecureStore.setItemAsync(BIOMETRIC_CONSENT_KEY, 'accepted');
    setBiometricConsentGiven(true);
    setShowBiometricDisclosure(false);
  };

  const handleBiometricDecline = async (): Promise<void> => {
    await SecureStore.setItemAsync(BIOMETRIC_CONSENT_KEY, 'declined');
    setBiometricConsentGiven(false);
    setShowBiometricDisclosure(false);
  };

  if (auth.isLoading || !dbReady) {
    return (
      <View style={styles.loading}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <LoginScreen onLogin={handleLogin} />
      </>
    );
  }

  const renderScreen = () => {
    if (showBiometricDisclosure) {
      return (
        <BiometricDisclosure
          visible={showBiometricDisclosure}
          onAccept={handleBiometricAccept}
          onDecline={handleBiometricDecline}
        />
      );
    }

    switch (currentScreen) {
      case 'capture':
        if (!auth.workforceRecord || !biometricConsentGiven) {
          setCurrentScreen('home');
          return null;
        }
        return (
          <CaptureScreen
            workforceId={auth.workforceRecord.id}
            onComplete={() => navigateTo('home')}
            onCancel={() => navigateTo('home')}
          />
        );
      case 'history':
        return (
          <HistoryScreen
            workforceId={auth.workforceRecord?.id || ''}
            onBack={() => navigateTo('home')}
          />
        );
      case 'map':
        return <MapScreen onBack={() => navigateTo('home')} />;
      case 'privacy':
        return (
          <PrivacyScreen
            onBack={() => navigateTo('home')}
            onDeleteAllData={auth.deleteAllData}
          />
        );
      default:
        return (
          <HomeScreen
            user={auth.user!}
            workforceRecord={auth.workforceRecord}
            onCheckIn={() => {
              if (!biometricConsentGiven) {
                setShowBiometricDisclosure(true);
                return;
              }
              navigateTo('capture');
            }}
            onViewHistory={() => navigateTo('history')}
            onViewMap={() => navigateTo('map')}
            onLogout={auth.logout}
            onPrivacyPolicy={() => navigateTo('privacy')}
          />
        );
    }
  };

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      {renderScreen()}
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
