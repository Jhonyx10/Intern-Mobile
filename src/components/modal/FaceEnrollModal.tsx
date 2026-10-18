import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import { Text, View, ActivityIndicator, Pressable, Modal } from 'react-native';
import {
  Camera,
  CameraRef,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
  CommonResolutions,
} from 'react-native-vision-camera';
import { useFaceDetectorOutput } from 'react-native-vision-camera-face-detector';
import { ScanFace, X } from 'lucide-react-native';
import { useToast } from '../ToastProvider';

const REQUIRED_BLINKS = 2;
const WARMUP_MS = 1000; // ignore blinks while camera/face settle in
const INTER_BLINK_TIMEOUT_MS = 5000; // must finish the 2nd blink within this long of the 1st
const CHALLENGE_WINDOW_MS = 8000; // overall cap from "ready" to fully verified

const FaceEnrollModal = React.memo(
  ({
    visible,
    onClose,
    onEnroll,
    onError,
    isEnrolling,
    themeColor,
    title,
    captureLabel,
  }: {
    visible: boolean;
    onClose: () => void;
    onEnroll: (uri: string) => Promise<void> | void;
    // Called only for camera/capture failures. Server errors are handled by
    // the parent's onEnroll, which also closes this modal.
    onError?: (message: string) => void;
    isEnrolling: boolean;
    themeColor: string;
    title: string;
    captureLabel: string;
  }) => {
    const { hasPermission, requestPermission } = useCameraPermission();
    const device = useCameraDevice('front');
    const camera = useRef<CameraRef>(null);

    // Memoized so usePhotoOutput doesn't see a "new" config on every render,
    // which would reconfigure the camera mid-capture ("Camera is closed").
    const photoOutputConfig = useMemo(
      () => ({ targetResolution: CommonResolutions.HD_4_3 }), // Prevents Android high-res ImageCapture crashes
      [],
    );
    const photoOutput = usePhotoOutput(photoOutputConfig);
    const isCapturing = useRef(false);
    const sleep = (ms: number) =>
      new Promise<void>(resolve => setTimeout(resolve, ms));
    const [blinkCount, setBlinkCount] = useState(0);
    const [readyForChallenge, setReadyForChallenge] = useState(false);
    const [timedOut, setTimedOut] = useState(false);
    const { showToast } = useToast();

    // Refs mirror the state above so the face-detector callback always reads
    // the latest value without needing to be recreated every render.
    const blinkCountRef = useRef(0);
    const readyRef = useRef(false);
    const eyeState = useRef<'INITIAL' | 'OPEN' | 'CLOSED'>('INITIAL');
    const interBlinkDeadline = useRef<number | null>(null);
    const challengeStart = useRef<number | null>(null);
    const onEnrollRef = useRef(onEnroll);
    onEnrollRef.current = onEnroll;
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;
    const isVerified = blinkCount >= REQUIRED_BLINKS;

    useEffect(() => {
      if (visible && !hasPermission) {
        requestPermission();
      }
    }, [visible, hasPermission]);

    // Full reset + warm-up delay every time the modal opens.
    useEffect(() => {
      if (!visible) return;

      setBlinkCount(0);
      setReadyForChallenge(false);
      setTimedOut(false);
      blinkCountRef.current = 0;
      readyRef.current = false;
      eyeState.current = 'INITIAL';
      interBlinkDeadline.current = null;
      challengeStart.current = null;

      const warmupTimer = setTimeout(() => {
        readyRef.current = true;
        challengeStart.current = Date.now();
        setReadyForChallenge(true);
      }, WARMUP_MS);

      return () => clearTimeout(warmupTimer);
    }, [visible]);

    const resetChallenge = useCallback(() => {
      blinkCountRef.current = 0;
      eyeState.current = 'INITIAL';
      interBlinkDeadline.current = null;
      challengeStart.current = Date.now();
      setBlinkCount(0);
      setTimedOut(true);
      setTimeout(() => setTimedOut(false), 1500);
    }, []);

    // Stable callback: reads everything it needs from refs, so it never
    // needs to be recreated, and the config object below stays referentially equal.
    const onFacesDetected = useCallback(
      (faces: any[]) => {
        // Freeze detection once a capture is underway so no state churn
        // can happen mid-capture.
        if (isCapturing.current) return;
        if (!readyRef.current || blinkCountRef.current >= REQUIRED_BLINKS)
          return;

        const now = Date.now();

        if (
          challengeStart.current !== null &&
          now - challengeStart.current > CHALLENGE_WINDOW_MS
        ) {
          resetChallenge();
          return;
        }

        if (
          blinkCountRef.current > 0 &&
          interBlinkDeadline.current !== null &&
          now > interBlinkDeadline.current
        ) {
          resetChallenge();
          return;
        }

        if (faces.length === 1) {
          const face = faces[0];
          const left = face.leftEyeOpenProbability;
          const right = face.rightEyeOpenProbability;

          if (left !== undefined && right !== undefined) {
            if (left > 0.5 && right > 0.5 && eyeState.current === 'INITIAL') {
              eyeState.current = 'OPEN';
            } else if (
              left < 0.35 &&
              right < 0.35 &&
              eyeState.current === 'OPEN'
            ) {
              eyeState.current = 'CLOSED';
            } else if (
              left > 0.5 &&
              right > 0.5 &&
              eyeState.current === 'CLOSED'
            ) {
              eyeState.current = 'OPEN';
              const newCount = blinkCountRef.current + 1;
              blinkCountRef.current = newCount;
              if (newCount === 1) {
                interBlinkDeadline.current = now + INTER_BLINK_TIMEOUT_MS;
              }
              setBlinkCount(newCount);
            }
          }
        }
      },
      [resetChallenge],
    );

    const onFaceDetectorError = useCallback((error: unknown) => {
      console.error('Face detector error:', error);
    }, []);

    const faceDetectorConfig = useMemo(
      () => ({
        performanceMode: 'accurate' as const,
        runClassifications: true,
        onFacesDetected,
        onError: onFaceDetectorError,
      }),
      [onFacesDetected, onFaceDetectorError],
    );

    const faceDetectorOutput = useFaceDetectorOutput(faceDetectorConfig);

    const constraints = useMemo(() => [{ fps: 30 }], []);
    const outputs = useMemo(
      () => [photoOutput, faceDetectorOutput],
      [photoOutput, faceDetectorOutput],
    );
    const cameraStyle = useMemo(() => ({ flex: 1 }), []);

    const handleCapture = async () => {
      if (!isVerified || isCapturing.current) return;
      isCapturing.current = true;
      try {
        if (!hasPermission) {
          await requestPermission();
          return;
        }

        // Retry once: if the session was mid-reconfigure, the first attempt
        // can fail with "Camera is closed". Only the capture is retried,
        // never the upload.
        let photo;
        try {
          photo = await photoOutput.capturePhotoToFile({}, {});
        } catch (firstErr) {
          console.warn('Capture failed, retrying once:', firstErr);
          await sleep(900);
          photo = await photoOutput.capturePhotoToFile({}, {});
        }

        if (photo && photo.filePath) {
          const uri = `file://${photo.filePath}`;
          // The parent handles upload success/failure and closes this modal.
          await onEnrollRef.current(uri); // latest callback, not the stale one
        }
      } catch (e: any) {
        // Only camera/capture failures land here; the parent's onEnroll
        // catches its own upload errors.
        console.warn('Capture threw:', e?.message || e);
        onErrorRef.current?.(
          `Could not capture your photo. Please try again. ${
            e?.message ?? ''
          }`.trim(),
        );
      } finally {
        isCapturing.current = false;
      }
    };

    const statusText = !readyForChallenge
      ? 'Getting ready...'
      : timedOut
      ? "That took a bit long — let's try again."
      : isVerified
      ? 'Perfect! Face verified.'
      : `Position your face inside the guide and blink (${blinkCount}/${REQUIRED_BLINKS})`;

    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {device && hasPermission ? (
            <Camera
              ref={camera}
              style={cameraStyle}
              device={device}
              constraints={constraints}
              isActive={visible}
              outputs={outputs}
            />
          ) : (
            <View className="flex-1 items-center justify-center">
              <ScanFace color="#fff" size={64} />
              <Text className="text-white mt-4 text-center px-8">
                Camera permission is required.
              </Text>
              <Pressable
                onPress={async () => {
                  try {
                    const result = await requestPermission();
                    if (!result) {
                      showToast(
                        'Please go to your device settings to enable the camera.',
                        'error',
                      );
                    }
                  } catch (e) {
                    showToast('Failed to request camera permission.', 'error');
                  }
                }}
                className="mt-6 px-6 py-3 rounded-full"
                style={{ backgroundColor: themeColor }}
              >
                <Text className="text-white font-bold">Grant Permission</Text>
              </Pressable>
            </View>
          )}

          <View
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              paddingBottom: 48,
              paddingHorizontal: 24,
              gap: 16,
            }}
          >
            <Text className="text-white text-center font-bold text-lg mb-2">
              {title}
            </Text>
            <View
              className="items-center"
              style={{ position: 'absolute', top: -280, left: 0, right: 0 }}
            >
              <View
                style={{
                  width: 220,
                  height: 280,
                  borderRadius: 110,
                  borderWidth: 3,
                  borderColor: 'rgba(255,255,255,0.6)',
                  borderStyle: 'dashed',
                }}
              />
            </View>

            <Text className="text-white/80 text-center text-sm mb-2">
              {statusText}
            </Text>

            <Pressable
              onPress={handleCapture}
              disabled={isEnrolling || !isVerified}
              className="items-center justify-center rounded-full py-4"
              style={{
                backgroundColor: themeColor,
                opacity: isEnrolling || !isVerified ? 0.7 : 1,
              }}
            >
              {isEnrolling ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-bold text-base">
                  {captureLabel}
                </Text>
              )}
            </Pressable>

            <Pressable onPress={onClose} className="items-center py-3">
              <X color="#fff" size={24} />
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  },
  (prev, next) => {
    return (
      prev.visible === next.visible &&
      prev.isEnrolling === next.isEnrolling &&
      prev.title === next.title
    );
  },
);

export default FaceEnrollModal;
