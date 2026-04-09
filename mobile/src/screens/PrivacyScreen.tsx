import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, borderRadius } from '../theme';
import { requestDataDeletion } from '../services/api';
import { purgeAllLocalData } from '../services/database';

interface Props {
  onBack: () => void;
  onDeleteAllData?: () => void;
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
      'Photos are encrypted on your device before storage using a device-specific key stored in secure enclave (SecureStore)',
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
      'Use the "Request Data Deletion" button below or contact the HR department',
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

export default function PrivacyScreen({ onBack, onDeleteAllData }: Props) {
  const [deletingLocal, setDeletingLocal] = useState(false);
  const [requestingServerDeletion, setRequestingServerDeletion] = useState(false);

  const handleDeleteLocalData = async (): Promise<void> => {
    Alert.alert(
      'Delete Local Data',
      'This will permanently delete all attendance records stored on this device. Server records will not be affected. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingLocal(true);
            try {
              await purgeAllLocalData();
              Alert.alert('Deleted', 'All local attendance data has been removed from this device.');
            } catch {
              Alert.alert('Error', 'Failed to delete local data. Please try again.');
            } finally {
              setDeletingLocal(false);
            }
          },
        },
      ]
    );
  };

  const handleRequestServerDeletion = async (): Promise<void> => {
    Alert.alert(
      'Request Data Deletion',
      'This will submit a formal request to delete all your personal data from WORKFORCE servers, including attendance records, photos, and biometric data. HR will process your request within 30 days. This may affect your employment status.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit Request',
          style: 'destructive',
          onPress: async () => {
            setRequestingServerDeletion(true);
            try {
              const result = await requestDataDeletion();
              Alert.alert('Request Submitted', result.message || 'Your data deletion request has been submitted. HR will process it within 30 days.');
            } catch {
              Alert.alert(
                'Request Failed',
                'Unable to submit the request right now. Please contact HR directly or try again when you have an internet connection.'
              );
            } finally {
              setRequestingServerDeletion(false);
            }
          },
        },
      ]
    );
  };

  const handleFullDataWipe = (): void => {
    Alert.alert(
      'Complete Data Wipe',
      'This will delete all local data, encryption keys, and log you out. You will need to log in again. Server data deletion must be requested separately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe & Logout',
          style: 'destructive',
          onPress: () => {
            onDeleteAllData?.();
          },
        },
      ]
    );
  };

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

        <View style={styles.dataActionsSection}>
          <Text style={styles.dataActionsTitle}>Data Management</Text>

          <TouchableOpacity
            style={styles.dataActionButton}
            onPress={handleDeleteLocalData}
            disabled={deletingLocal}
            testID="button-delete-local-data"
          >
            {deletingLocal ? (
              <ActivityIndicator color={colors.warning} size="small" />
            ) : (
              <Ionicons name="phone-portrait-outline" size={18} color={colors.warning} />
            )}
            <View style={styles.dataActionTextContainer}>
              <Text style={styles.dataActionLabel}>Delete Local Data</Text>
              <Text style={styles.dataActionDesc}>Remove all attendance records from this device</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dataActionButton}
            onPress={handleRequestServerDeletion}
            disabled={requestingServerDeletion}
            testID="button-request-server-deletion"
          >
            {requestingServerDeletion ? (
              <ActivityIndicator color={colors.error} size="small" />
            ) : (
              <Ionicons name="cloud-offline-outline" size={18} color={colors.error} />
            )}
            <View style={styles.dataActionTextContainer}>
              <Text style={[styles.dataActionLabel, { color: colors.error }]}>Request Server Data Deletion</Text>
              <Text style={styles.dataActionDesc}>Submit formal GDPR/privacy data deletion request</Text>
            </View>
          </TouchableOpacity>

          {onDeleteAllData && (
            <TouchableOpacity
              style={[styles.dataActionButton, styles.dataActionDanger]}
              onPress={handleFullDataWipe}
              testID="button-full-data-wipe"
            >
              <Ionicons name="trash-outline" size={18} color={colors.error} />
              <View style={styles.dataActionTextContainer}>
                <Text style={[styles.dataActionLabel, { color: colors.error }]}>Complete Data Wipe & Logout</Text>
                <Text style={styles.dataActionDesc}>Delete all local data, keys, and sign out</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

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
  dataActionsSection: {
    backgroundColor: colors.surfaceElevated, borderRadius: borderRadius.lg,
    padding: spacing.lg, gap: spacing.md,
  },
  dataActionsTitle: { fontFamily: fonts.heading, fontSize: 16, color: colors.text, marginBottom: spacing.xs },
  dataActionButton: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.card, padding: spacing.lg,
    borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.cardBorder,
  },
  dataActionDanger: {
    borderColor: 'rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
  dataActionTextContainer: { flex: 1 },
  dataActionLabel: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.text },
  dataActionDesc: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginTop: 2 },
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
