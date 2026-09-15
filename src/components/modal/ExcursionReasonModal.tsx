import React, { useState } from 'react';
import { Modal, Text, View, TextInput, Pressable, ActivityIndicator } from 'react-native';

interface ExcursionReasonModalProps {
    visible: boolean;
    onClose: () => void;
    onSubmit: (reason: string) => void;
    isSubmitting: boolean;
    themeColor: string;
}

export default function ExcursionReasonModal({ visible, onClose, onSubmit, isSubmitting, themeColor }: ExcursionReasonModalProps) {
    const [reason, setReason] = useState('');

    const handleSubmit = () => {
        if (!reason.trim()) return;
        onSubmit(reason);
        setReason(''); // Reset after submit
    };

    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View className="flex-1 justify-center items-center bg-black/50 px-5">
                <View className="bg-white p-6 rounded-[24px] w-full max-w-[400px]">
                    <Text className="text-lg font-bold text-slate-800 mb-2">Excursion Reason Required</Text>
                    <Text className="text-sm text-slate-600 mb-4">
                        You recently left the geofence area. Please provide a reason for the excursion.
                    </Text>

                    <TextInput
                        value={reason}
                        onChangeText={setReason}
                        placeholder="e.g. Bought lunch, Emergency, etc."
                        multiline
                        className="bg-slate-50 border border-slate-200 rounded-xl px-4 pt-3 pb-3 min-h-[100px] text-slate-800 mb-5"
                        style={{ textAlignVertical: 'top' }}
                    />

                    <View className="flex-row justify-end mt-2 space-x-3">
                        <Pressable
                            onPress={onClose}
                            className="px-5 py-2.5 rounded-full"
                        >
                            <Text className="text-slate-500 font-semibold">Cancel</Text>
                        </Pressable>
                        <Pressable
                            onPress={handleSubmit}
                            disabled={isSubmitting || !reason.trim()}
                            className={`px-5 py-2.5 rounded-full ${(!reason.trim() || isSubmitting) ? 'opacity-50' : ''}`}
                            style={{ backgroundColor: themeColor }}
                        >
                            {isSubmitting ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text className="text-white font-semibold">Submit Reason</Text>
                            )}
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
