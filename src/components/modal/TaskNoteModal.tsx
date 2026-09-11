import React from 'react';
import { Text, View, Modal, TextInput, Pressable, Alert } from 'react-native';

export default function TaskNoteModal({
    visible,
    onClose,
    taskNote,
    setTaskNote,
    onProceed,
    themeColor,
}: {
    visible: boolean;
    onClose: () => void;
    taskNote: string;
    setTaskNote: (v: string) => void;
    onProceed: () => void;
    themeColor: string;
}) {
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View className="flex-1 justify-center items-center bg-black/50 px-6">
                <View className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl">
                    <Text className="text-lg font-bold text-slate-900 mb-1">Off-site Punch Out</Text>
                    <Text className="text-xs text-slate-500 mb-4">
                        You are outside the geofence boundary. Please enter a brief reason or task note before punching out.
                    </Text>
                    <TextInput
                        className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-800 text-sm mb-4 h-24 text-top"
                        placeholder="e.g., Finished fieldwork assignment at client site..."
                        placeholderTextColor="#94A3B8"
                        multiline
                        value={taskNote}
                        onChangeText={setTaskNote}
                    />
                    <View className="flex-row gap-3">
                        <Pressable onPress={onClose} className="flex-1 py-3.5 rounded-2xl bg-slate-100 items-center">
                            <Text className="font-semibold text-slate-600 text-sm">Cancel</Text>
                        </Pressable>
                        <Pressable
                            onPress={() => {
                                if (!taskNote.trim()) {
                                    Alert.alert('Required', 'Please enter a brief task note.');
                                    return;
                                }
                                onProceed();
                            }}
                            className="flex-1 py-3.5 rounded-2xl items-center"
                            style={{ backgroundColor: themeColor }}
                        >
                            <Text className="font-semibold text-white text-sm">Proceed to Face ID</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}