import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { colors, fonts, spacing } from '../theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const OVAL_WIDTH = SCREEN_WIDTH * 0.65;
const OVAL_HEIGHT = OVAL_WIDTH * 1.35;

export default function FaceGuideOverlay() {
  return (
    <View style={styles.container} pointerEvents="none">
      <View style={styles.topOverlay} />
      <View style={styles.middleRow}>
        <View style={styles.sideOverlay} />
        <View style={styles.ovalContainer}>
          <View style={styles.oval} />
        </View>
        <View style={styles.sideOverlay} />
      </View>
      <View style={styles.bottomOverlay}>
        <Text style={styles.instruction}>
          Position your face within the oval
        </Text>
        <Text style={styles.subInstruction}>
          Ensure good lighting and remove sunglasses
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topOverlay: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.overlay,
  },
  middleRow: {
    flexDirection: 'row',
    height: OVAL_HEIGHT,
  },
  sideOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  ovalContainer: {
    width: OVAL_WIDTH,
    height: OVAL_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  oval: {
    width: OVAL_WIDTH,
    height: OVAL_HEIGHT,
    borderRadius: OVAL_WIDTH / 2,
    borderWidth: 3,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  bottomOverlay: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.overlay,
    alignItems: 'center',
    paddingTop: spacing.xxl,
  },
  instruction: {
    color: colors.text,
    fontFamily: fonts.displayMedium,
    fontSize: 16,
    textAlign: 'center',
  },
  subInstruction: {
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
