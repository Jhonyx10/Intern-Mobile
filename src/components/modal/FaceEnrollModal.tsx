import React, { useState, useRef, useEffect } from 'react';
import { Text, View, ActivityIndicator, Pressable, Alert, Modal } from 'react-native';
import {
    Camera,
    CameraRef,
    useCameraDevice,
    useCameraPermission,
    usePhotoOutput,
} from 'react-native-vision-camera';
import { useFaceDetectorOutput } from 'react-native-vision-camera-face-detector';
import { ScanFace, X } from 'lucide-react-native';

const REQUIRED_BLINKS = 2;
const WARMUP_MS = 1000;      // ignore blinks while camera/face settle in
const CHALLENGE_WINDOW_MS = 8000; // must complete both blinks within this window

export default function FaceEnrollModal({
    visible,
    onClose,
    onEnroll,
    isEnrolling,
    themeColor,
    title,
    captureLabel,
}: {
    visible: boolean;
    onClose: () => void;
    onEnroll: (uri: string) => Promise<void> | void;
    isEnrolling: boolean;
    themeColor: string;
    title: string;
    captureLabel: string;
}) {
    const { hasPermission, requestPermission } = useCameraPermission();
    const device = useCameraDevice('front');
    const camera = useRef<CameraRef>(null);
    const photoOutput = usePhotoOutput();

    const [blinkCount, setBlinkCount] = useState(0);
    const [readyForChallenge, setReadyForChallenge] = useState(false);
    const eyeState = useRef<'INITIAL' | 'OPEN' | 'CLOSED'>('INITIAL');
    const challengeDeadline = useRef<number | null>(null);

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
        eyeState.current = 'INITIAL';
        challengeDeadline.current = null;

        const warmupTimer = setTimeout(() => {
            setReadyForChallenge(true);
            challengeDeadline.current = Date.now() + CHALLENGE_WINDOW_MS;
        }, WARMUP_MS);

        return () => clearTimeout(warmupTimer);
    }, [visible]);

    const faceDetectorOutput = useFaceDetectorOutput({
        performanceMode: 'fast',
        runClassifications: true,
        onFacesDetected(faces) {
            if (!readyForChallenge || blinkCount >= REQUIRED_BLINKS) return;

            // Challenge window expired without completing both blinks — reset and restart the window.
            if (challengeDeadline.current !== null && Date.now() > challengeDeadline.current) {
                setBlinkCount(0);
                eyeState.current = 'INITIAL';
                challengeDeadline.current = Date.now() + CHALLENGE_WINDOW_MS;
                return;
            }

            if (faces.length === 1) {
                const face = faces[0];
                const left = face.leftEyeOpenProbability;
                const right = face.rightEyeOpenProbability;

                if (left !== undefined && right !== undefined) {
                    if (left > 0.6 && right > 0.6 && eyeState.current === 'INITIAL') {
                        eyeState.current = 'OPEN';
                    } else if (left < 0.4 && right < 0.4 && eyeState.current === 'OPEN') {
                        eyeState.current = 'CLOSED';
                    } else if (left > 0.6 && right > 0.6 && eyeState.current === 'CLOSED') {
                        eyeState.current = 'OPEN';
                        setBlinkCount((count) => count + 1);
                    }
                }
            }
        },
        onError(error) {
            console.error('Face detector error:', error);
        }
    });

    const handleCapture = async () => {
        if (!isVerified) {
            Alert.alert('Liveness Check Required', `Please blink ${REQUIRED_BLINKS} times before capturing.`);
            return;
        }
        try {
            if (!hasPermission) {
                await requestPermission();
                return;
            }
            const photo = await photoOutput.capturePhoto({}, {});
            const path = await photo.saveToTemporaryFileAsync();
            if (path) {
                const uri = `file://${path}`;
                await onEnroll(uri);
                photo.dispose();
            }
        } catch (e) {
            Alert.alert('Camera Error', 'Could not capture photo. Please try again.');
        }
    };

    const statusText = !readyForChallenge
        ? 'Getting ready...'
        : isVerified
            ? 'Perfect! Face verified.'
            : `Position your face inside the guide and blink (${blinkCount}/${REQUIRED_BLINKS})`;

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
            <View style={{ flex: 1, backgroundColor: '#000' }}>
                {device && hasPermission ? (
                    <Camera
                        ref={camera}
                        style={{ flex: 1 }}
                        device={device}
                        isActive={visible && !isEnrolling}
                        outputs={[photoOutput, faceDetectorOutput]}
                    />
                ) : (
                    <View className="flex-1 items-center justify-center">
                        <ScanFace color="#fff" size={64} />
                        <Text className="text-white mt-4 text-center px-8">
                            Camera permission is required.
                        </Text>
                        <Pressable
                            onPress={requestPermission}
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
                    <Text className="text-white text-center font-bold text-lg mb-2">{title}</Text>
                    <View className="items-center" style={{ position: 'absolute', top: -280, left: 0, right: 0 }}>
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
                        style={{ backgroundColor: themeColor, opacity: (isEnrolling || !isVerified) ? 0.7 : 1 }}
                    >
                        {isEnrolling ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text className="text-white font-bold text-base">{captureLabel}</Text>
                        )}
                    </Pressable>

                    <Pressable onPress={onClose} className="items-center py-3">
                        <X color="#fff" size={24} />
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
}