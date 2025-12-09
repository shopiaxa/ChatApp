import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';

type SplashScreenProps = {
  onAnimationComplete: () => void;
};

export default function SplashScreen({ onAnimationComplete }: SplashScreenProps) {
  const fadeValue = new Animated.Value(0);
  const scaleValue = new Animated.Value(0.9);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const animationDuration = 5000;

  useEffect(() => {
    const fadeAnimation = Animated.timing(fadeValue, {
      toValue: 1,
      duration: animationDuration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });

    const scaleAnimation = Animated.timing(scaleValue, {
      toValue: 1,
      duration: 1000,
      easing: Easing.elastic(0.8),
      useNativeDriver: true,
    });

    const progressAnimation = Animated.timing(progressAnim, {
      toValue: 1,
      duration: animationDuration,
      easing: Easing.linear,
      useNativeDriver: true,
    });

    // Jalankan semua animasi parallel
    Animated.parallel([
      fadeAnimation,
      scaleAnimation,
      progressAnimation,
    ]).start();

    // Timer 
    const minSplashTime = 5000; 
    const timer = setTimeout(() => {
      onAnimationComplete();
    }, minSplashTime);

    return () => {
      clearTimeout(timer);
    };
  }, [onAnimationComplete]);

  // Interpolasi untuk skala 
  const scale = scaleValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  });

  // Interpolasi untuk progress bar 
  const progressScaleX = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const starPositions = Array.from({ length: 25 }, (_, i) => ({
    id: i,
    top: Math.random() * 100,
    left: Math.random() * 100,
    size: Math.random() * 2 + 1,
    opacity: Math.random() * 0.4 + 0.1,
  }));

  return (
    <View style={styles.container}>
      <View style={styles.background}>
        <View style={styles.starField}>
          {starPositions.map((star) => (
            <View 
              key={star.id} 
              style={[
                styles.star,
                {
                  top: `${star.top}%`,
                  left: `${star.left}%`,
                  width: star.size,
                  height: star.size,
                  borderRadius: star.size / 2,
                  opacity: star.opacity,
                }
              ]} 
            />
          ))}
        </View>
      </View>

      <View style={styles.mainContent}>
        <Animated.View
          style={[
            styles.starContainer,
            {
              opacity: fadeValue,
              transform: [{ scale: scale }],
            },
          ]}
        >
          <Text style={styles.starIcon}>⭐</Text>
        </Animated.View>

        <Animated.View style={[styles.textContainer, { opacity: fadeValue }]}>
          <Text style={styles.appName}>STAR CHAT</Text>
          <Text style={styles.appSubtitle}>Chat Application</Text>
        </Animated.View>
      </View>

      <View style={styles.bottomContent}>
        <View style={styles.progressContainer}>
          <Animated.View 
            style={[
              styles.progressBar,
              {
                transform: [{ scaleX: progressScaleX }],
              }
            ]} 
          />
        </View>

        <Text style={styles.loadingText}>
          Loading...
        </Text>

        <Text style={styles.copyright}>© 2025 Star Chat App</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F2D',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 40,
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  starField: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  star: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginTop: 40,
  },
  starContainer: {
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starIcon: {
    fontSize: 70, 
    textShadowColor: 'rgba(255, 215, 0, 0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 15,
  },
  textContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontSize: 36, 
    fontWeight: 'bold',
    color: '#FFD700',
    letterSpacing: 6, 
    textShadowColor: 'rgba(255, 215, 0, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
    marginBottom: 10,
  },
  appSubtitle: {
    fontSize: 14, 
    color: '#A8D5BA',
    letterSpacing: 2, 
    textAlign: 'center',
    opacity: 0.9,
    fontWeight: '300',
  },
  bottomContent: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 40,
    marginBottom: 40,
  },
  progressContainer: {
    width: '80%', // LEBIH LEBAR
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 1.5,
    marginBottom: 15,
    overflow: 'hidden',
  },
  progressBar: {
    width: '100%',
    height: '100%',
    backgroundColor: '#FFD700',
    borderRadius: 1.5,
    transformOrigin: 'left center',
  },
  loadingText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: 1,
    marginBottom: 25,
  },
  copyright: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
    letterSpacing: 0.5,
  },
});