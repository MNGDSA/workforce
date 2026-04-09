import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, borderRadius } from '../theme';

interface Props {
  onBack: () => void;
}

const SECTIONS = [
  {
    title: 'Data We Collect',
    icon: 'document-text-outline' as const,
    items: [
      'Facial photograph for identity verification during attendance check-in',
      'GPS coordinates at the time of check-in to verify your presence at the work site',
      'Device information (device model, OS version) for troubleshooting',
      'Timestamps of all attendance submissions',
    ],
  },
  {
    title: 'How We Use Your Data',
    icon: 'shield-checkmark-outline' as const,
    items: [
      'Facial photos are compared against your reference photo using automated facial recognition to verify identity',
      'GPS data is checked against authorized geofence zones to confirm you are at the designated work location',
      'Attendance records are used for payroll processing and workforce management',
      'Photos flagged by the system are reviewed by authorized HR personnel only',
    ],
  },
  {
    title: 'Data Storage & Security',
    icon: 'lock-closed-outline' as const,
    items: [
      'Photos are stored locally on your device until synced, then transmitted over encrypted connections (HTTPS/TLS)',
      'Server-side data is stored in secure databases with access controls',
      'Facial recognition processing is performed server-side; biometric templates are not stored permanently',
      'Local attendance data is automatically purged after 30 days of successful sync',
    ],
  },
  {
    title: 'Your Rights',
    icon: 'person-circle-outline' as const,
    items: [
      'You may request access to all personal data we hold about you',
      'You may request correction of inaccurate personal data',
      'You may request deletion of your data, subject to legal retention requirements',
      'You may withdraw consent for facial recognition (this may affect your ability to use the attendance system)',
      'Contact HR department to exercise any of these rights',
    ],
  },
  {
    title: 'Data Retention',
    icon: 'time-outline' as const,
    items: [
      'Attendance records: retained for the duration of your employment contract plus any legally required retention period',
      'Facial photographs: retained while you are an active employee; deleted within 90 days of contract end',
      'GPS data: retained with attendance records for audit purposes',
      'Local device data: automatically purged 30 days after successful server sync',
    ],
  },
  {
    title: 'Third-Party Services',
    icon: 'globe-outline' as const,
    items: [
      'AWS Rekognition may be used for facial comparison (Amazon Web Services privacy policy applies)',
      'Google Maps is used for zone visualization (Google privacy policy applies)',
      'No personal data is shared with third parties for marketing or advertising purposes',
    ],
  },
];

export default function PrivacyScreen({ onBack }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} testID="button-back-privacy">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Privacy Policy</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.intro}>
          <Ionicons name="shield" size={32} color={colors.primary} />
          <Text style={styles.introTitle}>Your Privacy Matters</Text>
          <Text style={styles.introText}>
            WORKFORCE by Luxury Carts Company Ltd is committed to protecting the privacy
            of our seasonal workers. This policy explains how we collect, use, and protect
            your personal data in the mobile attendance system.
          </Text>
        </View>

        {SECTIONS.map((section, idx) => (
          <View key={idx} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name={section.icon} size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
            {section.items.map((item, itemIdx) => (
              <View key={itemIdx} style={styles.bulletItem}>
                <View style={styles.bullet} />
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.contact}>
          <Text style={styles.contactTitle}>Questions or Concerns?</Text>
          <Text style={styles.contactText}>
            Contact the HR department at your nearest office or speak with your supervisor.
          </Text>
        </View>

        <Text style={styles.lastUpdated}>Last updated: 2024</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 50, paddingHorizontal: spacing.xl, paddingBottom: spacing.lg,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontFamily: fonts.heading, fontSize: 18, color: colors.text },
  content: { flex: 1 },
  contentContainer: { padding: spacing.xl, gap: spacing.xl },
  intro: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  introTitle: { fontFamily: fonts.heading, fontSize: 20, color: colors.text },
  introText: {
    fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary,
    textAlign: 'center', lineHeight: 22,
  },
  section: {
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: colors.cardBorder, padding: spacing.lg, gap: spacing.md,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 15, color: colors.text },
  bulletItem: { flexDirection: 'row', gap: spacing.md, paddingLeft: spacing.sm },
  bullet: {
    width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.primary, marginTop: 7,
  },
  bulletText: {
    fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary,
    flex: 1, lineHeight: 20,
  },
  contact: {
    backgroundColor: colors.surfaceElevated, borderRadius: borderRadius.lg,
    padding: spacing.xl, gap: spacing.sm, alignItems: 'center',
  },
  contactTitle: { fontFamily: fonts.heading, fontSize: 15, color: colors.text },
  contactText: {
    fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, textAlign: 'center',
  },
  lastUpdated: {
    fontFamily: fonts.body, fontSize: 11, color: colors.textMuted,
    textAlign: 'center', paddingBottom: spacing.xxxl,
  },
});
