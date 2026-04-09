import React, { useState, useRef, useCallback, useEffect } from 'react';
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
import * as Location from 'expo-location';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, borderRadius } from '../theme';
import FaceGuideOverlay from '../components/FaceGuideOverlay';
import { saveSubmission } from '../services/database';
import { syncPendingSubmissions } from '../services/sync';
import { format } from 'date-fns';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface CapturedGps {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

interface Props {
  workforceId: string;
  onComplete: () => void;
  onCancel: () => void;
}

type CaptureStep = 'camera' | 'preview' | 'saving';

export default function CaptureScreen({ workforceId, onComplete, onCancel }: Props) {
  const [step, setStep] = useState<CaptureStep>('camera');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [captureTimestamp, setCaptureTimestamp] = useState<Date | null>(null);
  const [capturedGps, setCapturedGps] = useState<CapturedGps | null>(null);
  const [facing, setFacing] = useState<CameraType>('front');
  const [gpsReady, setGpsReady] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const gpsRef = useRef<CapturedGps | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          if (mounted) {
            const gps: CapturedGps = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              accuracy: loc.coords.accuracy,
            };
            gpsRef.current = gps;
            setGpsReady(true);
          }
        } catch {
          if (mounted) setGpsReady(false);
        }
      }
    })();
    return () => { mounted = false; };
  }, []);

  const takePhoto = useCallback(async () => {
    if (!cameraRef.current) return;

    const now = new Date();
    let gps: CapturedGps | null = gpsRef.current;

    try {
      const locPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const photoPromise = cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
        exif: false,
      });

      const [locResult, photo] = await Promise.all([
        locPromise.catch(() => null),
        photoPromise,
      ]);

      if (locResult) {
        gps = {
          latitude: locResult.coords.latitude,
          longitude: locResult.coords.longitude,
          accuracy: locResult.coords.accuracy,
        };
        gpsRef.current = gps;
      }

      if (photo?.uri) {
        setPhotoUri(photo.uri);
        setCaptureTimestamp(now);
        setCapturedGps(gps);
        setStep('preview');
      }
    } catch {
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  }, []);

  const retakePhoto = (): void => {
    setPhotoUri(null);
    setCaptureTimestamp(null);
    setCapturedGps(null);
    setStep('camera');
  };

  const submitAttendance = async (): Promise<void> => {
    if (!photoUri || !capturedGps || !captureTimestamp) {
      Alert.alert('Missing Data', 'GPS location is required. Please retake the photo with GPS enabled.');
      return;
    }

    setStep('saving');

    try {
      const timestamp = captureTimestamp.toISOString();
      const localDir = `${FileSystem.documentDirectory}attendance/`;
      await FileSystem.makeDirectoryAsync(localDir, { intermediates: true });
      const localPath = `${localDir}${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: photoUri, to: localPath });

      await saveSubmission({
        workforceId,
        photoPath: localPath,
        photoBase64: null,
        gpsLat: capturedGps.latitude,
        gpsLng: capturedGps.longitude,
        gpsAccuracy: capturedGps.accuracy,
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
        <Text style={styles.savingSubtext}>Encrypting and storing locally</Text>
      </View>
    );
  }

  if (step === 'preview' && photoUri && captureTimestamp) {
    return (
      <View style={styles.container}>
        <View style={styles.previewHeader}>
          <TouchableOpacity onPress={retakePhoto} testID="button-retake">
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.previewTitle}>Review Photo</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.previewContent}>
          <Image source={{ uri: photoUri }} style={styles.previewImage} />

          <View style={styles.timestampCard}>
            <Ionicons name="time" size={16} color={colors.primary} />
            <Text style={styles.timestampText}>
              {format(captureTimestamp, 'EEEE, MMM d, yyyy h:mm:ss a')}
            </Text>
          </View>

          {capturedGps ? (
            <>
              <View style={styles.locationInfo}>
                <Ionicons name="location" size={16} color={colors.success} />
                <Text style={styles.locationText}>
                  {capturedGps.latitude.toFixed(6)}, {capturedGps.longitude.toFixed(6)}
                  {capturedGps.accuracy ? ` (${'\u00B1'}${Math.round(capturedGps.accuracy)}m)` : ''}
                </Text>
              </View>

              <View style={styles.miniMapContainer}>
                <MapView
                  style={styles.miniMap}
                  provider={PROVIDER_GOOGLE}
                  initialRegion={{
                    latitude: capturedGps.latitude,
                    longitude: capturedGps.longitude,
                    latitudeDelta: 0.003,
                    longitudeDelta: 0.003,
                  }}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                  mapType="hybrid"
                >
                  <Marker
                    coordinate={{
                      latitude: capturedGps.latitude,
                      longitude: capturedGps.longitude,
                    }}
                    title="Your Location"
                  />
                </MapView>
              </View>
            </>
          ) : (
            <View style={styles.locationInfo}>
              <Ionicons name="location-outline" size={16} color={colors.error} />
              <Text style={[styles.locationText, { color: colors.error }]}>
                GPS not available. Please retake with location enabled.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.previewActions}>
          <TouchableOpacity style={styles.retakeButton} onPress={retakePhoto} testID="button-retake-photo">
            <Ionicons name="camera-reverse-outline" size={20} color={colors.text} />
            <Text style={styles.retakeButtonText}>Retake</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.submitButton, !capturedGps && styles.buttonDisabled]}
            onPress={submitAttendance}
            disabled={!capturedGps}
            testID="button-submit-attendance"
          >
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
          <View style={styles.gpsIndicator}>
            <Ionicons
              name={gpsReady ? 'location' : 'location-outline'}
              size={14}
              color={gpsReady ? colors.success : colors.warning}
            />
            <Text style={[styles.gpsText, { color: gpsReady ? colors.success : colors.warning }]}>
              {gpsReady ? 'GPS Ready' : 'Acquiring GPS...'}
            </Text>
          </View>
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
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  cameraButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center',
  },
  gpsIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs, borderRadius: borderRadius.full,
  },
  gpsText: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
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
  previewContent: {
    flex: 1, padding: spacing.lg, gap: spacing.md,
  },
  previewImage: {
    width: SCREEN_WIDTH - spacing.lg * 2, height: (SCREEN_WIDTH - spacing.lg * 2) * 0.75,
    borderRadius: borderRadius.lg, alignSelf: 'center',
  },
  timestampCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, padding: spacing.md,
    borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.cardBorder,
  },
  timestampText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.text },
  locationInfo: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, padding: spacing.md,
    borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.cardBorder,
  },
  locationText: { fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary, flex: 1 },
  miniMapContainer: {
    height: 120, borderRadius: borderRadius.md, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  miniMap: { flex: 1 },
  previewActions: { padding: spacing.lg, gap: spacing.md },
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
  buttonDisabled: { opacity: 0.4 },
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
