import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, borderRadius } from '../theme';

interface Props {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export default function BiometricDisclosure({ visible, onAccept, onDecline }: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons name="shield-checkmark" size={48} color={colors.primary} />
          </View>

          <Text style={styles.title}>Biometric Data Disclosure</Text>
          <Text style={styles.subtitle}>
            Before using the attendance system, please review how we handle your biometric data.
          </Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What We Collect</Text>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                A facial photograph each time you check in to verify your identity
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                Your GPS location to confirm you are at the authorized work site
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>How We Use It</Text>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                Photos are compared against your reference photo using automated facial recognition (AWS Rekognition)
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                Biometric templates are generated during comparison but are not permanently stored
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                Flagged photos may be reviewed by authorized HR personnel
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Data Protection</Text>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                All photos are encrypted on your device using AES-256-GCM before storage
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                Data is transmitted over encrypted connections (HTTPS/TLS)
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                Photos are deleted within 90 days of contract end
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Rights</Text>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                You may request deletion of your biometric data at any time through the app or HR
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>
                Declining consent will prevent use of the mobile attendance system (manual attendance alternatives available)
              </Text>
            </View>
          </View>

          <Text style={styles.consentText}>
            By tapping "I Agree", you consent to the collection and processing of your biometric
            data as described above for the purposes of attendance verification.
          </Text>
        </ScrollView>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.declineButton} onPress={onDecline} testID="button-decline-biometric">
            <Text style={styles.declineText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.acceptButton} onPress={onAccept} testID="button-accept-biometric">
            <Text style={styles.acceptText}>I Agree</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xxl, paddingTop: 60, paddingBottom: spacing.xxxl },
  iconContainer: {
    alignItems: 'center', marginBottom: spacing.xl,
  },
  title: {
    fontFamily: fonts.display, fontSize: 24, color: colors.text,
    textAlign: 'center', marginBottom: spacing.sm,
  },
  subtitle: {
    fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary,
    textAlign: 'center', lineHeight: 22, marginBottom: spacing.xxl,
  },
  section: {
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: colors.cardBorder,
    padding: spacing.lg, marginBottom: spacing.lg, gap: spacing.md,
  },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 15, color: colors.text },
  bulletItem: { flexDirection: 'row', gap: spacing.md, paddingLeft: spacing.xs },
  bullet: {
    width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.primary, marginTop: 7,
  },
  bulletText: {
    fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary,
    flex: 1, lineHeight: 20,
  },
  consentText: {
    fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text,
    textAlign: 'center', lineHeight: 20, marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  actions: {
    flexDirection: 'row', gap: spacing.md,
    padding: spacing.xl, paddingBottom: 40,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  declineButton: {
    flex: 1, paddingVertical: spacing.lg, borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center',
  },
  declineText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.textMuted },
  acceptButton: {
    flex: 2, paddingVertical: spacing.lg, borderRadius: borderRadius.md,
    backgroundColor: colors.primary, alignItems: 'center',
  },
  acceptText: { fontFamily: fonts.heading, fontSize: 15, color: colors.text },
});
