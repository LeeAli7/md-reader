import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../hooks/useTheme';

declare const require: any;
function getImagePicker(): any | null {
  try {
    return require('expo-image-picker');
  } catch {
    return null;
  }
}

interface Props {
  navigation: any;
  route: any;
}

export default function ApoCaptureScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<{ name: string; uri: string }[]>([]);
  const s = styles(theme, insets);
  const initialTab = route?.params?.tab === 'gallery' ? 'gallery' : 'camera';
  const [tab, setTab] = useState(initialTab);

  const addPicked = (name: string, uri: string) => {
    setPicked((prev) => [...prev, { name, uri }].slice(-5));
  };

  const shootPhoto = async () => {
    const IP = getImagePicker();
    if (IP) {
      try {
        const perm = await IP.requestCameraPermissionsAsync();
        if (perm.status !== 'granted') {
          Alert.alert('Нет доступа', 'Разрешите доступ к камере в настройках');
          return;
        }
        const res = await IP.launchCameraAsync({ quality: 0.9 });
        if (!res.canceled && res.assets[0]) {
          const a = res.assets[0];
          addPicked(a.fileName ?? 'photo.jpg', a.uri);
          return;
        }
      } catch (e) {
        console.warn('camera error:', e);
      }
    }
    // Запасной путь без expo-image-picker: выбор кадра через файлы.
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      if (!res.canceled && res.assets[0]) addPicked(res.assets[0].name, res.assets[0].uri);
    } catch (e) {
      console.warn('pick error:', e);
    }
  };

  const pickGallery = async () => {
    const IP = getImagePicker();
    if (IP) {
      try {
        const res = await IP.launchImageLibraryAsync({ quality: 0.9 });
        if (!res.canceled && res.assets[0]) {
          const a = res.assets[0];
          addPicked(a.fileName ?? 'gallery.jpg', a.uri);
          return;
        }
      } catch (e) {
        console.warn('gallery error:', e);
      }
    }
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      if (!res.canceled && res.assets[0]) addPicked(res.assets[0].name, res.assets[0].uri);
    } catch (e) {
      console.warn('pick error:', e);
    }
  };

  const goConvert = () => {
    if (picked.length === 0) {
      Alert.alert('Нет кадров', 'Снимите фото или выберите из галереи');
      return;
    }
    navigation.navigate('ApoConvert', { files: picked });
  };

  return (
    <View style={s.container}>
      <View style={s.topbar}>
        <Pressable style={s.back} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={18} color="#8A94A6" />
          <Text style={s.backText}>Назад</Text>
        </Pressable>
        <View style={s.tagLive}><Text style={s.tagText}>Камера · авто</Text></View>
      </View>

      <View style={s.cam}>
        <View style={s.frame} />
        <Text style={s.frameHint}>Вопрос и варианты — внутри рамки</Text>
      </View>

      <View style={s.sheet}>
        <View style={s.seg}>
          <Pressable style={[s.segBtn, tab === 'camera' && s.segOn]} onPress={() => setTab('camera')}>
            <Ionicons name="camera" size={16} color={tab === 'camera' ? '#FFF' : '#8A94A6'} />
            <Text style={tab === 'camera' ? s.segOnText : s.segText}>Камера</Text>
          </Pressable>
          <Pressable style={[s.segBtn, tab === 'gallery' && s.segOn]} onPress={() => { setTab('gallery'); pickGallery(); }}>
            <Ionicons name="image" size={16} color={tab === 'gallery' ? '#FFF' : '#8A94A6'} />
            <Text style={tab === 'gallery' ? s.segOnText : s.segText}>Галерея</Text>
          </Pressable>
        </View>

        <Text style={s.sect}>Выбрано: {picked.length}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.strip}>
          {picked.map((p, i) => (
            <View key={i} style={s.cellSel}>
              <Ionicons name="image" size={18} color="#B9C9EE" />
              <Text style={s.cellText} numberOfLines={1}>{p.name}</Text>
            </View>
          ))}
          <Pressable style={s.cell} onPress={pickGallery}>
            <Ionicons name="add" size={22} color="#5B6678" />
          </Pressable>
        </ScrollView>

        <View style={s.shutterbar}>
          <Pressable style={s.iconBtn} onPress={pickGallery}>
            <Ionicons name="image-outline" size={22} color="#B9C3D4" />
          </Pressable>
          <Pressable style={s.shutter} onPress={shootPhoto} />
          <Pressable style={s.iconBtn} onPress={goConvert}>
            <Ionicons name="checkmark" size={22} color="#B9C3D4" />
          </Pressable>
        </View>

        <Pressable style={s.cta} onPress={goConvert}>
          <Text style={s.ctaText}>Продолжить</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFF" />
        </Pressable>
      </View>
    </View>
  );
}

function styles(theme: any, insets: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0B0F17', paddingTop: insets.top },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8 },
    back: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    backText: { color: '#8A94A6', fontSize: 13, fontWeight: '600' },
    tagLive: { backgroundColor: '#131A26', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 },
    tagText: { fontSize: 11, fontWeight: '800', color: '#B9C9EE' },
    cam: { flex: 1, marginTop: 12, backgroundColor: '#05070C', alignItems: 'center', justifyContent: 'center' },
    frame: { width: '78%', height: '52%', borderWidth: 2, borderColor: '#4F7CFF', borderRadius: 14 },
    frameHint: { position: 'absolute', bottom: 12, color: '#4F7CFF', fontSize: 11.5, fontWeight: '700' },
    sheet: { backgroundColor: '#0D121C', borderTopWidth: 1, borderTopColor: '#161D2A', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 14, paddingBottom: insets.bottom + 14 },
    seg: { flexDirection: 'row', backgroundColor: '#131A26', borderRadius: 14, padding: 4 },
    segBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10 },
    segOn: { backgroundColor: '#22304A' },
    segText: { fontSize: 12, fontWeight: '700', color: '#8A94A6' },
    segOnText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
    sect: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: '#5B6678', marginTop: 12 },
    strip: { marginTop: 8 },
    cell: { width: 64, height: 64, borderRadius: 12, backgroundColor: '#131A26', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
    cellSel: { width: 100, height: 64, borderRadius: 12, backgroundColor: 'rgba(79,124,255,.1)', borderWidth: 1.5, borderColor: '#4F7CFF', alignItems: 'center', justifyContent: 'center', marginRight: 8, paddingHorizontal: 6 },
    cellText: { fontSize: 10, color: '#B9C9EE', marginTop: 2 },
    shutterbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 26, marginTop: 12 },
    iconBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#131A26', alignItems: 'center', justifyContent: 'center' },
    shutter: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#FFF', borderWidth: 6, borderColor: '#4F7CFF' },
    cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, padding: 15, marginTop: 12, backgroundColor: '#4F7CFF' },
    ctaText: { fontWeight: '800', fontSize: 16, color: '#FFF' },
  });
}
