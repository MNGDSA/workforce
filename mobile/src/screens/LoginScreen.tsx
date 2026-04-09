import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, borderRadius } from '../theme';
import { setBaseUrl } from '../services/api';

interface Props {
  onLogin: (identifier: string, password: string) => Promise<void>;
}

export default function LoginScreen({ onLogin }: Props) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [showServerConfig, setShowServerConfig] = useState(false);

  const handleLogin = async () => {
    if (!identifier.trim() || !password.trim()) {
      Alert.alert('Required', 'Please enter your ID and password.');
      return;
    }

    setIsLoading(true);
    try {
      if (serverUrl.trim()) {
        await setBaseUrl(serverUrl.trim());
      }
      await onLogin(identifier.trim(), password.trim());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      Alert.alert('Login Failed', message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoSection}>
          <View style={styles.logoContainer}>
            <View style={styles.stripes}>
              <View style={[styles.stripe, styles.stripe1]} />
              <View style={[styles.stripe, styles.stripe2]} />
              <View style={[styles.stripe, styles.stripe3]} />
            </View>
          </View>
          <Text style={styles.appName}>WORKFORCE</Text>
          <Text style={styles.tagline}>Mobile Attendance</Text>
        </View>

        <View style={styles.formSection}>
          <View style={styles.inputContainer}>
            <Ionicons name="person-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="National ID or Phone Number"
              placeholderTextColor={colors.textMuted}
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
              returnKeyType="next"
              testID="input-identifier"
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Password"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              returnKeyType="go"
              onSubmitEditing={handleLogin}
              testID="input-password"
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeButton}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.textMuted}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
            testID="button-login"
          >
            {isLoading ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.serverConfigToggle}
            onPress={() => setShowServerConfig(!showServerConfig)}
          >
            <Ionicons name="settings-outline" size={14} color={colors.textMuted} />
            <Text style={styles.serverConfigText}>Server Configuration</Text>
          </TouchableOpacity>

          {showServerConfig && (
            <View style={styles.inputContainer}>
              <Ionicons name="globe-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="https://your-server.com"
                placeholderTextColor={colors.textMuted}
                value={serverUrl}
                onChangeText={setServerUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                testID="input-server-url"
              />
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Luxury Carts Company Ltd</Text>
          <Text style={styles.footerSubtext}>Masjid Al-Haram Operations</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxxl,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: spacing.xxxl * 1.5,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  stripes: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    gap: 6,
  },
  stripe: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  stripe1: { width: 40 },
  stripe2: { width: 32, alignSelf: 'center' },
  stripe3: { width: 24, alignSelf: 'flex-end' },
  appName: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.text,
    letterSpacing: 3,
  },
  tagline: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  formSection: {
    gap: spacing.lg,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    height: 52,
  },
  inputIcon: {
    marginRight: spacing.md,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    height: '100%',
  },
  eyeButton: {
    padding: spacing.sm,
    marginLeft: spacing.sm,
  },
  loginButton: {
    backgroundColor: colors.primary,
    height: 52,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: 16,
    letterSpacing: 0.5,
  },
  serverConfigToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  serverConfigText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing.xxxl * 2,
  },
  footerText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.textMuted,
  },
  footerSubtext: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
    opacity: 0.7,
  },
});
