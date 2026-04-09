import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, borderRadius } from '../theme';
import FaceGuideOverlay from '../components/FaceGuideOverlay';
import { useLocation } from '../hooks/useLocation';
import { saveSubmission } from '../services/database';
import { syncPendingSubmissions } from '../services/sync';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  workforceId: string;
  onComplete: () => void;
  onCancel: () => void;
}

type CaptureStep = 'camera' | 'preview' | 'saving';

export default function CaptureScreen({ workforceId, onComplete, onCancel }: Props) {
  const [step, setStep] = useState<CaptureStep>('camera');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [facing, setFacing] = useState<CameraType>('front');
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const location = useLocation();

  const takePhoto = useCallback(async () => {
    if (!cameraRef.current) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
        exif: false,
      });

      if (photo?.uri) {
        setPhotoUri(photo.uri);
        setStep('preview');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  }, []);

  const retakePhoto = () => {
    setPhotoUri(null);
    setStep('camera');
  };

  const submitAttendance = async () => {
    if (!photoUri) return;

    setStep('saving');

    try {
      const gps = await location.getCurrentLocation();
      if (!gps) {
        Alert.alert('Location Required', 'Unable to get your location. Please enable GPS and try again.');
        setStep('preview');
        return;
      }

      const timestamp = new Date().toISOString();
      const localDir = `${FileSystem.documentDirectory}attendance/`;
      await FileSystem.makeDirectoryAsync(localDir, { intermediates: true });
      const localPath = `${localDir}${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: photoUri, to: localPath });

      await saveSubmission({
        workforceId,
        photoPath: localPath,
        photoBase64: null,
        gpsLat: gps.latitude,
        gpsLng: gps.longitude,
        gpsAccuracy: gps.accuracy,
        timestamp,
      });

      syncPendingSubmissions().catch(() => {});

      Alert.alert(
        'Attendance Submitted',
        'Your attendance has been recorded and will sync when online.',
        [{ text: 'OK', onPress: onComplete }]
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save attendance';
      Alert.alert('Error', message);
      setStep('preview');
    }
  };

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Ionicons name="camera-outline" size={64} color={colors.textMuted} />
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionText}>
          Camera permission is needed to capture your attendance photo.
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelLink} onPress={onCancel}>
          <Text style={styles.cancelLinkText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === 'saving') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.savingText}>Saving attendance...</Text>
        <Text style={styles.savingSubtext}>Getting your location</Text>
      </View>
    );
  }

  if (step === 'preview' && photoUri) {
    return (
      <View style={styles.container}>
        <View style={styles.previewHeader}>
          <TouchableOpacity onPress={retakePhoto} testID="button-retake">
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.previewTitle}>Review Photo</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.previewImageContainer}>
          <Image source={{ uri: photoUri }} style={styles.previewImage} />
        </View>

        <View style={styles.previewActions}>
          <View style={styles.locationInfo}>
            {location.latitude ? (
              <>
                <Ionicons name="location" size={16} color={colors.success} />
                <Text style={styles.locationText}>
                  GPS: {location.latitude?.toFixed(4)}, {location.longitude?.toFixed(4)}
                  {location.accuracy ? ` (±${Math.round(location.accuracy)}m)` : ''}
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="location-outline" size={16} color={colors.warning} />
                <Text style={[styles.locationText, { color: colors.warning }]}>
                  Location will be captured on submit
                </Text>
              </>
            )}
          </View>

          <TouchableOpacity style={styles.retakeButton} onPress={retakePhoto} testID="button-retake-photo">
            <Ionicons name="camera-reverse-outline" size={20} color={colors.text} />
            <Text style={styles.retakeButtonText}>Retake</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.submitButton} onPress={submitAttendance} testID="button-submit-attendance">
            <Ionicons name="checkmark-circle" size={22} color={colors.text} />
            <Text style={styles.submitButtonText}>Submit Attendance</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
        <FaceGuideOverlay />

        <View style={styles.cameraTopBar}>
          <TouchableOpacity onPress={onCancel} style={styles.cameraButton} testID="button-cancel-capture">
            <Ionicons name="close" size={28} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFacing(f => f === 'front' ? 'back' : 'front')}
            style={styles.cameraButton}
            testID="button-flip-camera"
          >
            <Ionicons name="camera-reverse-outline" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.cameraBottomBar}>
          <TouchableOpacity style={styles.captureButton} onPress={takePhoto} testID="button-take-photo">
            <View style={styles.captureButtonInner} />
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: {
    flex: 1, backgroundColor: colors.background,
    justifyContent: 'center', alignItems: 'center', padding: spacing.xxxl,
  },
  camera: { flex: 1 },
  cameraTopBar: {
    position: 'absolute', top: 50, left: spacing.xl, right: spacing.xl,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  cameraButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center',
  },
  cameraBottomBar: {
    position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center',
  },
  captureButton: {
    width: 76, height: 76, borderRadius: 38,
    borderWidth: 4, borderColor: colors.text,
    justifyContent: 'center', alignItems: 'center',
  },
  captureButtonInner: {
    width: 62, height: 62, borderRadius: 31, backgroundColor: colors.primary,
  },
  previewHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 50, paddingHorizontal: spacing.xl, paddingBottom: spacing.lg,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  previewTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.text },
  previewImageContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  previewImage: {
    width: SCREEN_WIDTH - spacing.xxxl * 2, height: (SCREEN_WIDTH - spacing.xxxl * 2) * 1.33,
    borderRadius: borderRadius.lg,
  },
  previewActions: { padding: spacing.xl, gap: spacing.md },
  locationInfo: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, padding: spacing.md,
    borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.cardBorder,
  },
  locationText: { fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary, flex: 1 },
  retakeButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceElevated, paddingVertical: spacing.md,
    borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border,
  },
  retakeButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.text },
  submitButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, paddingVertical: spacing.lg, borderRadius: borderRadius.md,
  },
  submitButtonText: { fontFamily: fonts.heading, fontSize: 16, color: colors.text },
  permissionTitle: { fontFamily: fonts.heading, fontSize: 20, color: colors.text, marginTop: spacing.xl },
  permissionText: {
    fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary,
    textAlign: 'center', marginTop: spacing.sm,
  },
  permissionButton: {
    backgroundColor: colors.primary, paddingHorizontal: spacing.xxl, paddingVertical: spacing.md,
    borderRadius: borderRadius.md, marginTop: spacing.xl,
  },
  permissionButtonText: { fontFamily: fonts.heading, fontSize: 15, color: colors.text },
  cancelLink: { marginTop: spacing.lg },
  cancelLinkText: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted },
  savingText: { fontFamily: fonts.heading, fontSize: 18, color: colors.text, marginTop: spacing.xl },
  savingSubtext: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: spacing.xs },
});
