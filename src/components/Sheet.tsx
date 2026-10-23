// Шторка снизу с настоящей анимацией: подложка плавно темнеет,
// карточка выезжает на пружине. Вместо «Modal + slide», который дёргается.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  bg?: string;
  maxHeight?: number | `${number}%`;
  /** Радиус углов карточки */
  radius?: number;
  /** Отступ снизу (home-индикатор), добавляется в саму карточку */
  paddingBottom?: number;
}

export function Sheet({ visible, onClose, children, bg = '#FFF', maxHeight = '88%', radius = 24, paddingBottom = 0 }: Props) {
  const H = Dimensions.get('window').height;
  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      anim.setValue(0);
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 26,
        stiffness: 250,
        mass: 0.9,
      }).start();
    } else if (mounted) {
      Animated.timing(anim, {
        toValue: 0,
        duration: 190,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={st.root}>
        <Animated.View
          style={[
            st.backdrop,
            { opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] }) },
          ]}
        >
          <Pressable style={st.fill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={{
            maxHeight,
            backgroundColor: bg,
            borderTopLeftRadius: radius,
            borderTopRightRadius: radius,
            paddingBottom,
            transform: [
              { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [Math.min(H * 0.55, 620), 0] }) },
            ],
          }}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  fill: { flex: 1 },
});
