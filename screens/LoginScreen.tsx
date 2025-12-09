import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../App";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  db,
} from "../utils/firebase";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [isLogin, setIsLogin] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);

  const validateEmail = (email: string): boolean => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleAuth = async () => {
    // Validasi input
    if (!email.trim()) {
      Alert.alert("Error", "Email harus diisi");
      return;
    }
    
    if (!validateEmail(email)) {
      Alert.alert("Error", "Format email tidak valid");
      return;
    }
    
    if (!password.trim()) {
      Alert.alert("Error", "Password harus diisi");
      return;
    }
    
    if (password.length < 6) {
      Alert.alert("Error", "Password minimal 6 karakter");
      return;
    }

    if (!isLogin && !username.trim()) {
      Alert.alert("Error", "Username harus diisi untuk registrasi");
      return;
    }

    setLoading(true);

    try {
      let userCredential;
      let finalUsername = "";

      if (isLogin) {
        // ============================================
        // LOGIN - AMBIL USERNAME DARI FIRESTORE
        // ============================================
        userCredential = await signInWithEmailAndPassword(email, password);
        
        try {
          // Ambil data user dari Firestore
          const userDoc = await db.collection('users').doc(userCredential.user.uid).get();
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            finalUsername = userData?.username || email.split('@')[0];
            console.log("Username loaded from Firestore:", finalUsername);
          } else {
            // Jika document tidak ada, gunakan email sebagai fallback
            finalUsername = email.split('@')[0];
            console.log("User document not found, using email as username");
            
            // Buat document baru untuk user ini
            await db.collection('users').doc(userCredential.user.uid).set({
              username: finalUsername,
              usernameLower: finalUsername.toLowerCase(),
              email: email,
              createdAt: new Date(),
              userId: userCredential.user.uid,
            });
            console.log("Created new user document");
          }
        } catch (firestoreError) {
          console.error("Error loading username from Firestore:", firestoreError);
          finalUsername = email.split('@')[0];
        }
        
      } else {
        // ============================================
        // REGISTER - SIMPAN USERNAME KE FIRESTORE
        // ============================================
        userCredential = await createUserWithEmailAndPassword(email, password);
        finalUsername = username;
        
        // Simpan username dalam lowercase untuk pencarian
        const usernameLower = username.toLowerCase();
        
        try {
          await db.collection('users').doc(userCredential.user.uid).set({
            username: username,
            usernameLower: usernameLower, // Untuk pencarian case-insensitive
            email: email,
            createdAt: new Date(),
            userId: userCredential.user.uid,
          });
          console.log("User saved to Firestore:", userCredential.user.uid);
        } catch (firestoreError) {
          console.error("Error saving to Firestore:", firestoreError);
        }
      }

      // Simpan data ke AsyncStorage (untuk login dan register)
      const userData = {
        email: email,
        username: finalUsername,
        userId: userCredential.user.uid,
        timestamp: new Date().toISOString(),
      };
      
      await AsyncStorage.setItem('userData', JSON.stringify(userData));
      console.log("User data saved to AsyncStorage:", userData);
      
      // Navigasi ke Chat Screen
      navigation.replace('Chat');
      
    } catch (error: any) {
      console.error('Auth error:', error);
      
      let errorMessage = "Terjadi kesalahan";
      
      switch (error.code) {
        case 'auth/invalid-email':
          errorMessage = "Format email tidak valid";
          break;
        case 'auth/user-disabled':
          errorMessage = "Akun dinonaktifkan";
          break;
        case 'auth/user-not-found':
          errorMessage = "Akun tidak ditemukan";
          break;
        case 'auth/wrong-password':
          errorMessage = "Password salah";
          break;
        case 'auth/email-already-in-use':
          errorMessage = "Email sudah terdaftar";
          break;
        case 'auth/weak-password':
          errorMessage = "Password terlalu lemah (minimal 6 karakter)";
          break;
        case 'auth/network-request-failed':
          errorMessage = "Koneksi internet bermasalah";
          break;
        case 'auth/invalid-api-key':
          errorMessage = "API key tidak valid - periksa konfigurasi Firebase";
          break;
        case 'auth/operation-not-allowed':
          errorMessage = "Metode autentikasi tidak diaktifkan di Firebase Console";
          break;
        default:
          errorMessage = error.message || "Terjadi kesalahan";
      }
      
      Alert.alert("Error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView 
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Header dengan logo Star */}
        <View style={styles.header}>
          <Text style={styles.starIcon}>⭐</Text>
          <Text style={styles.appTitle}>STAR CHAT</Text>
          <Text style={styles.welcomeText}>
            {"Welcome back to the stars!"}
          </Text>
        </View>

        <View style={styles.form}>
          {!isLogin && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>
                <Text style={styles.star}>★ </Text>
                Username
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your username"
                value={username}
                onChangeText={setUsername}
                placeholderTextColor="#A8D5BA"
                editable={!loading}
                autoCapitalize="none"
              />
            </View>
          )}

          <View style={styles.inputContainer}>
            <Text style={styles.label}>
              <Text style={styles.star}>★ </Text>
              Email
            </Text>
            <TextInput
              style={styles.input}
              placeholder="your@email.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor="#A8D5BA"
              editable={!loading}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>
              <Text style={styles.star}>★ </Text>
              Password
            </Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholderTextColor="#A8D5BA"
              editable={!loading}
            />
          </View>

          <TouchableOpacity
            style={[styles.authButton, loading && styles.disabledButton]}
            onPress={handleAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#0A0F2D" />
            ) : (
              <Text style={styles.authButtonText}>
                {isLogin ? "Login" : "Create Account"}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => setIsLogin(!isLogin)}
            disabled={loading}
          >
            <Text style={styles.switchText}>
              {isLogin 
                ? "New here? Create an account" 
                : "Already have an account? Sign in"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#0A0F2D', 
    padding: 20,
    justifyContent: 'center',
    minHeight: '100%',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  starIcon: {
    fontSize: 60,
    marginBottom: 10,
    textShadowColor: 'rgba(255, 215, 0, 0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 15,
  },
  appTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFD700',
    letterSpacing: 4,
    marginBottom: 10,
  },
  welcomeText: {
    fontSize: 16,
    color: '#A8D5BA',
    textAlign: 'center',
    opacity: 0.9,
  },
  form: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 25,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: '#0A0F2D',
    marginBottom: 8,
    fontWeight: '600',
  },
  star: {
    color: '#FF6B8B',
  },
  input: {
    borderWidth: 2,
    borderColor: '#A8D5BA',
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    color: '#0A0F2D',
    backgroundColor: '#FFFFFF',
  },
  authButton: {
    backgroundColor: '#FF6B8B',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 15,
    shadowColor: '#FF6B8B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  disabledButton: {
    backgroundColor: '#FFB8C6',
    shadowOpacity: 0.1,
  },
  authButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  switchButton: {
    padding: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  switchText: {
    color: '#0A0F2D',
    fontSize: 14,
    fontWeight: '600',
  },
});