import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert, Image } from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../components/Navigation';
import { useTaskUpdate } from '../util/queries/timelog';
import { pick, types } from '@react-native-documents/picker';
import { X, UploadCloud, CheckCircle2 } from 'lucide-react-native';
import { useUser } from '../util/queries/auth';

type UpdateTaskScreenRouteProp = RouteProp<RootStackParamList, 'UpdateTask'>;

export default function UpdateTaskScreen() {
    const route = useRoute<UpdateTaskScreenRouteProp>();
    const navigation = useNavigation();
    const { timeLogId } = route.params;

    const { data: userData } = useUser();
    const themeColor = userData?.settings?.theme_color || '#1D4ED8';

    const [note, setNote] = useState('');
    const [selectedPhotos, setSelectedPhotos] = useState<any[]>([]);

    const updateTaskMutation = useTaskUpdate();

    const handlePickPhotos = async () => {
        try {
            const res = await pick({
                mode: 'import',
                type: [types.images],
                allowMultiSelection: true,
            });

            if (res && res.length > 0) {
                if (selectedPhotos.length + res.length > 10) {
                    Alert.alert('Limit Exceeded', 'You can only upload up to 10 photos total.');
                    return;
                }
                setSelectedPhotos([...selectedPhotos, ...res]);
            }
        } catch (err: any) {
            if (err?.code !== 'OPERATION_CANCELED') {
                Alert.alert('Error', err?.message || 'Failed to open photo picker');
            }
        }
    };

    const handleRemovePhoto = (index: number) => {
        const newPhotos = [...selectedPhotos];
        newPhotos.splice(index, 1);
        setSelectedPhotos(newPhotos);
    };

    const handleSave = async () => {
        if (!note && selectedPhotos.length === 0) {
            Alert.alert('Validation Check', 'Please enter a note or select photos.');
            return;
        }

        try {
            await updateTaskMutation.mutateAsync({
                timeLogId,
                note: note.trim() !== '' ? note.trim() : null,
                photos: selectedPhotos.map(p => ({ uri: p.uri, name: p.name, type: p.type || 'image/jpeg' })),
            });
            Alert.alert('Success', 'Task note and photos updated successfully.');
            navigation.goBack();
        } catch (err: any) {
            Alert.alert('Update Failed', err?.response?.data?.message || err.message || 'Failed to update task');
        }
    };

    return (
        <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
            <View style={{ paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, backgroundColor: 'white', shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, elevation: 2, flexDirection: 'row', alignItems: 'center' }}>
                <Pressable onPress={() => navigation.goBack()} style={{ padding: 8, marginRight: 10, borderRadius: 20, backgroundColor: '#F1F5F9' }}>
                    <X color="#64748B" size={20} />
                </Pressable>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1E293B' }}>Update Task</Text>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#475569', marginBottom: 8 }}>Task Note</Text>
                <TextInput
                    style={{ backgroundColor: 'white', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 15, fontSize: 15, minHeight: 120, textAlignVertical: 'top' }}
                    placeholder="Enter what you accomplished for the day..."
                    placeholderTextColor="#94A3B8"
                    multiline
                    value={note}
                    onChangeText={setNote}
                />

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 12 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#475569' }}>Supporting Photos ({selectedPhotos.length}/10)</Text>
                    <Pressable onPress={handlePickPhotos} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 }}>
                        <UploadCloud color={themeColor} size={16} />
                        <Text style={{ fontSize: 12, fontWeight: 'bold', color: themeColor, marginLeft: 4 }}>Add Photos</Text>
                    </Pressable>
                </View>

                {selectedPhotos.length > 0 ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                        {selectedPhotos.map((photo, index) => (
                            <View key={index} style={{ width: '31%', aspectRatio: 1, position: 'relative' }}>
                                <Image source={{ uri: photo.uri }} style={{ width: '100%', height: '100%', borderRadius: 12 }} />
                                <Pressable
                                    onPress={() => handleRemovePhoto(index)}
                                    style={{ position: 'absolute', top: -5, right: -5, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, zIndex: 10 }}
                                >
                                    <X color="white" size={20} />
                                </Pressable>
                            </View>
                        ))}
                    </View>
                ) : (
                    <View style={{ alignItems: 'center', justifyContent: 'center', backgroundColor: 'white', borderRadius: 16, height: 140, borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed' }}>
                        <Text style={{ color: '#94A3B8', fontSize: 13 }}>No photos selected</Text>
                    </View>
                )}
            </ScrollView>

            <View style={{ padding: 20, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                <Pressable
                    onPress={handleSave}
                    disabled={updateTaskMutation.isPending}
                    style={{ backgroundColor: themeColor, padding: 16, borderRadius: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', opacity: updateTaskMutation.isPending ? 0.7 : 1 }}
                >
                    {updateTaskMutation.isPending ? (
                        <ActivityIndicator color="white" style={{ marginRight: 8 }} />
                    ) : (
                        <CheckCircle2 color="white" size={20} style={{ marginRight: 8 }} />
                    )}
                    <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>
                        {updateTaskMutation.isPending ? 'Saving...' : 'Save Update'}
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}
