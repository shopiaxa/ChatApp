import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Image,
  Alert,
  SafeAreaView,
  PermissionsAndroid,
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  addDoc,
  serverTimestamp,
  messagesCollection,
  auth,
  signOut,
  db,
} from "../utils/firebase";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../App";
import { launchImageLibrary, ImageLibraryOptions } from "react-native-image-picker";

type MessageType = {
  id: string;
  text: string;
  user: string;
  userId: string;
  imageUrl?: string;
  imageBase64?: string;
  createdAt: any;
  localId?: string;
};

type UserType = {
  id: string;
  username: string;
  email: string;
  lastMessage?: string;
  lastMessageTime?: any;
};

type Props = NativeStackScreenProps<RootStackParamList, "Chat">;

export default function ChatScreen({ navigation }: Props) {
  // ==================== SEMUA HOOKS HARUS DI SINI (TOP LEVEL) ====================
  
  // State untuk chat
  const [message, setMessage] = useState<string>("");
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [loadingMessages, setLoadingMessages] = useState<boolean>(true);
  const flatListRef = useRef<FlatList>(null);
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  const [messagesCache, setMessagesCache] = useState<Record<string, MessageType[]>>({});
  const lastMessageRef = useRef<string | null>(null);

  // State untuk user
  const [username, setUsername] = useState<string>("User");
  const [userId, setUserId] = useState<string>("");
  const [users, setUsers] = useState<UserType[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // State untuk pencarian user baru
  const [searchingNewUsers, setSearchingNewUsers] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<UserType[]>([]);

  // State untuk mode
  const [isInChat, setIsInChat] = useState<boolean>(false);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);

  // ==================== USE EFFECT ====================
  useEffect(() => {
    loadUserData();
    requestStoragePermission();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const unsubscribe = loadUsersWithChats();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [userId]);
  
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    
    if (isInChat && selectedUser && userId) {
      unsubscribe = setupChatListener();
    } else {
      lastMessageRef.current = "";
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isInChat, selectedUser, userId]);

  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      searchNewUsers(searchQuery);
    } else {
      setSearchResults([]);
      setSearchingNewUsers(false);
    }
  }, [searchQuery, userId]);

  // ==================== FUNGSI UTAMA (useCallback) ====================
  const requestStoragePermission = useCallback(async () => {
    console.log('[DEBUG] requestStoragePermission called');
    try {
      const androidVersion = Number(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES ? 33 : 0);
      console.log('[DEBUG] Detected Android API level approach');
      
      if (PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES) {
        console.log('[DEBUG] Requesting READ_MEDIA_IMAGES for Android 13+');
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
          {
            title: 'Izin Akses Galeri',
            message: 'Aplikasi memerlukan akses ke galeri untuk memilih gambar',
            buttonPositive: 'Izinkan',
            buttonNegative: 'Tolak',
          }
        );
        console.log('[DEBUG] Permission result:', granted);
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        console.log('[DEBUG] Requesting READ_EXTERNAL_STORAGE for Android 12 and below');
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
          {
            title: 'Izin Akses Penyimpanan',
            message: 'Aplikasi memerlukan akses ke penyimpanan untuk memilih gambar',
            buttonPositive: 'Izinkan',
            buttonNegative: 'Tolak',
          }
        );
        console.log('[DEBUG] Permission result:', granted);
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (err) {
      console.error('[ERROR] Permission error:', err);
      return false;
    }
  }, []);

  const loadUserData = useCallback(async () => {
    try {
      const userData = await AsyncStorage.getItem('userData');
      const currentUser = auth().currentUser;

      if (userData) {
        const data = JSON.parse(userData);
        setUsername(data.username || data.email?.split('@')[0] || 'User');
        setUserId(data.userId || currentUser?.uid || '');
      } else if (currentUser) {
        setUsername(currentUser.email?.split('@')[0] || 'User');
        setUserId(currentUser.uid);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  }, []);

  const loadUsersWithChats = useCallback(() => {
    if (!userId) return;

    const q = db
      .collection("messages")
      .orderBy("createdAt", "asc");

    const unsubscribe = q.onSnapshot(
      (snapshot) => {
        if (!snapshot) return;

        const chatRoomIds = new Set<string>();
        const lastMessages = new Map<string, { text: string; time: any }>();

        snapshot.forEach((doc) => {
          const data = doc.data();

          if (data && data.chatRoomId && data.chatRoomId.includes(userId)) {
            chatRoomIds.add(data.chatRoomId);

            const existing = lastMessages.get(data.chatRoomId);
            const createdAtDate = data.createdAt?.toDate?.() || new Date();

            if (!existing || createdAtDate > (existing.time || 0)) {
              lastMessages.set(data.chatRoomId, {
                text: data.text || "Mengirim foto",
                time: createdAtDate,
              });
            }
          }
        });

        const otherUserIds = Array.from(chatRoomIds)
          .map((roomId) => {
            const ids = roomId.split("_");
            return ids.find((id) => id !== userId);
          })
          .filter(Boolean) as string[];

        if (otherUserIds.length === 0) {
          setUsers([]);
          return;
        }

        const batchSize = 10;
        const batches = [];
        for (let i = 0; i < otherUserIds.length; i += batchSize) {
          batches.push(otherUserIds.slice(i, i + batchSize));
        }

        Promise.all(
          batches.map((batch) =>
            db.collection("users").where("__name__", "in", batch).get()
          )
        )
          .then((snapshots) => {
            const userList: UserType[] = [];

            snapshots.forEach((userSnapshot) => {
              userSnapshot.forEach((doc) => {
                const userData = doc.data();
                if (userData) {
                  const chatRoomId = [userId, doc.id].sort().join("_");
                  const lastMsg = lastMessages.get(chatRoomId);

                  userList.push({
                    id: doc.id,
                    username:
                      userData.username ||
                      userData.email?.split("@")[0] ||
                      "User",
                    email: userData.email || "",
                    lastMessage: lastMsg?.text,
                    lastMessageTime: lastMsg?.time,
                  });
                }
              });
            });

            userList.sort((a, b) => {
              const timeA = a.lastMessageTime?.getTime() || 0;
              const timeB = b.lastMessageTime?.getTime() || 0;
              return timeB - timeA;
            });

            setUsers(userList);
          })
          .catch((error) => {
            console.error("Error loading users:", error);
          });
      },
      (error) => {
        console.error("Error in messages listener:", error);
      }
    );

    return unsubscribe;
  }, [userId]);

  // Mencari user baru di database
  const searchNewUsers = useCallback(async (query: string) => {
    if (!query.trim() || !userId) {
      setSearchResults([]);
      return;
    }

    setSearchingNewUsers(true);
    
    try {
      const searchLower = query.toLowerCase();
      
      // Cari berdasarkan username (case-insensitive menggunakan >= dan <)
      const usersSnapshot = await db
        .collection('users')
        .where('username', '>=', searchLower)
        .where('username', '<', searchLower + '\uf8ff')
        .limit(20)
        .get();

      const foundUsers: UserType[] = [];
      
      usersSnapshot.forEach((doc) => {
        const userData = doc.data();
        
        // Skip user sendiri
        if (doc.id === userId) return;
        
        if (userData) {
          foundUsers.push({
            id: doc.id,
            username: userData.username || userData.email?.split('@')[0] || 'User',
            email: userData.email || '',
          });
        }
      });

      setSearchResults(foundUsers);
    } catch (error) {
      console.error('Error searching users:', error);
      setSearchResults([]);
    } finally {
      setSearchingNewUsers(false);
    }
  }, [userId]);

  const setupChatListener = useCallback(() => {
    if (!selectedUser || !userId) return;

    setLoadingMessages(true);
    const chatRoomId = [userId, selectedUser.id].sort().join('_');
    
    lastMessageRef.current = "";

    const cached = messagesCache[chatRoomId];
    if (cached && cached.length > 0) {
      setMessages(cached);
      setLoadingMessages(false);
      
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
        setInitialScrollDone(true);
        if (cached.length > 0) {
          lastMessageRef.current = cached[cached.length - 1].id;
        }
      }, 150);
    }

    const unsubscribe = messagesCollection
      .where('chatRoomId', '==', chatRoomId)
      .orderBy('createdAt', 'asc')
      .onSnapshot(
        (snapshot) => {
          if (!snapshot) {
            setLoadingMessages(false);
            return;
          }

          const list: MessageType[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            if (data) {
              list.push({
                id: doc.id,
                ...(data as Omit<MessageType, "id">),
              });
            }
          });

          setMessagesCache(prev => ({
            ...prev,
            [chatRoomId]: list,
          }));
          
          const isFirstLoad = !initialScrollDone;
          const hasNewMessage = list.length > 0 && 
            lastMessageRef.current !== list[list.length - 1].id;
          
          setMessages(list);
          setLoadingMessages(false);

          if (list.length > 0) {
            if (isFirstLoad) {
              setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: false });
                setInitialScrollDone(true);
                lastMessageRef.current = list[list.length - 1].id;
              }, 150);
            } else if (hasNewMessage) {
              lastMessageRef.current = list[list.length - 1].id;
              setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
              }, 100);
            }
          }
        },
        (error) => {
          console.error('Error in chat listener:', error);
          setLoadingMessages(false);
        }
      );

    return unsubscribe;
  }, [selectedUser, userId, messagesCache, initialScrollDone]);

  const sendMessage = useCallback(async () => {
    if (!message.trim() || !selectedUser || !userId || !username) return;

    const chatRoomId = [userId, selectedUser.id].sort().join('_');
    const messageToSend = message;
    setMessage("");

    const tempId = `temp_${Date.now()}`;
    const optimisticMessage: MessageType = {
      id: tempId,
      text: messageToSend,
      user: username,
      userId: userId,
      createdAt: new Date(),
    };

    const newMessages = [...messages, optimisticMessage];
    setMessages(newMessages);

    setMessagesCache(prev => ({
      ...prev,
      [chatRoomId]: newMessages,
    }));

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 50);

    try {
      await addDoc(messagesCollection, {
        text: messageToSend,
        user: username,
        userId: userId,
        chatRoomId: chatRoomId,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Gagal mengirim pesan ke server');
      
      const rollbackMessages = messages.filter(m => m.id !== tempId);
      setMessages(rollbackMessages);
      setMessagesCache(prev => ({
        ...prev,
        [chatRoomId]: rollbackMessages,
      }));
      setMessage(messageToSend);
    }
  }, [message, selectedUser, userId, username, messages, messagesCache]);

  const pickImage = useCallback(async () => {
    console.log('[DEBUG] ===== PICK IMAGE STARTED =====');
    
    if (!selectedUser || !userId || !username) {
      console.log('[ERROR] Missing required data');
      Alert.alert('Error', 'Tidak bisa mengirim gambar, data tidak lengkap');
      return;
    }

    try {
      console.log('[DEBUG] Step 1: Checking permission...');
      const hasPermission = await requestStoragePermission();
      console.log('[DEBUG] Permission result:', hasPermission);
      
      if (!hasPermission) {
        Alert.alert(
          'Izin Diperlukan', 
          'Berikan izin akses galeri untuk melanjutkan',
          [
            { text: 'Batal', style: 'cancel' },
            { 
              text: 'Buka Settings', 
              onPress: () => {
                Linking.openSettings();
              }
            }
          ]
        );
        return;
      }

      console.log('[DEBUG] Step 2: Opening image picker...');
      
      const options: ImageLibraryOptions = {
        mediaType: 'photo',
        maxWidth: 800,
        maxHeight: 800,
        quality: 0.7,
        includeBase64: true,
        selectionLimit: 1,
      };
      
      launchImageLibrary(options, (response) => {
        console.log('[DEBUG] ===== IMAGE PICKER CALLBACK TRIGGERED =====');

        if (response.didCancel) {
          console.log('[INFO] User cancelled image picker');
          return;
        }
        
        if (response.errorCode) {
          console.error('[ERROR] ImagePicker Error:', response.errorMessage);
          Alert.alert('Error', `Gagal memilih gambar: ${response.errorMessage || response.errorCode}`);
          return;
        }
        
        if (!response.assets || response.assets.length === 0) {
          console.error('[ERROR] No assets in response');
          Alert.alert('Error', 'Tidak ada gambar yang dipilih');
          return;
        }

        const asset = response.assets[0];
        
        if (!asset.base64) {
          console.error('[ERROR] No base64 data in asset');
          Alert.alert('Error', 'Gagal memuat gambar (tidak ada data base64)');
          return;
        }

        console.log('[DEBUG] Step 3: Sending image to Firestore...');
        
        const chatRoomId = [userId, selectedUser.id].sort().join('_');
        const tempId = `temp_img_${Date.now()}`;
        
        const optimisticMessage: MessageType = {
          id: tempId,
          text: '',
          user: username,
          userId: userId,
          imageBase64: asset.base64,
          createdAt: new Date(),
        };

        const newMessages = [...messages, optimisticMessage];
        setMessages(newMessages);
        setMessagesCache(prev => ({
          ...prev,
          [chatRoomId]: newMessages,
        }));

        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 50);

        const base64ToSend = asset.base64.substring(0, 1000000);
        
        addDoc(messagesCollection, {
          text: '',
          user: username,
          userId: userId,
          chatRoomId: chatRoomId,
          imageBase64: base64ToSend,
          createdAt: serverTimestamp(),
        })
        .then(() => {
          console.log('[SUCCESS] Image sent to Firestore');
        })
        .catch((error) => {
          console.error('[ERROR] Failed to send image to Firestore:', error);
          Alert.alert('Error', 'Gagal mengirim gambar ke server');
          
          const rollbackMessages = messages.filter(m => m.id !== tempId);
          setMessages(rollbackMessages);
          setMessagesCache(prev => ({
            ...prev,
            [chatRoomId]: rollbackMessages,
          }));
        });
      });
      
    } catch (error: any) {
      console.error('[ERROR] Exception in pickImage:', error);
      Alert.alert('Error', `Terjadi kesalahan: ${error.message || 'Unknown error'}`);
    }
  }, [selectedUser, userId, username, requestStoragePermission, messages, messagesCache]);

  const handleLogout = useCallback(() => {
    Alert.alert(
      'Logout',
      'Apakah Anda yakin ingin logout?',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
              await AsyncStorage.removeItem('userData');
              navigation.replace('Login');
            } catch (error) {
              console.error('Logout error:', error);
              Alert.alert('Error', 'Gagal logout');
            }
          },
        },
      ]
    );
  }, [navigation]);

  const openChat = useCallback((user: UserType) => {
    setSelectedUser(user);
    setIsInChat(true);
    setInitialScrollDone(false);
    lastMessageRef.current = "";
    setSearchQuery(""); // Reset search saat buka chat
  }, []);

  const backToUserList = useCallback(() => {
    setIsInChat(false);
    setSelectedUser(null);
    setSearchQuery("");
    setSearchResults([]);
    lastMessageRef.current = "";
  }, []);

  // ==================== RENDER FUNCTIONS ====================
  const renderMessage = useCallback(({ item }: { item: MessageType }) => {
    const isMyMessage = item.userId === userId;
    const isImage = item.imageUrl || item.imageBase64;

    const timeString = item.createdAt?.toDate?.()?.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    }) || new Date(item.createdAt).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    return (
      <View style={[
        styles.messageContainer,
        isMyMessage ? styles.myMessageContainer : styles.otherMessageContainer,
      ]}>
        <View style={[
          styles.messageBubble,
          isMyMessage ? styles.myMessageBubble : styles.otherMessageBubble,
        ]}>
          {isImage ? (
              <Image
                source={{
                  uri: item.imageUrl || 
                    (item.imageBase64 ? `data:image/jpeg;base64,${item.imageBase64}` : '')
                }}
                style={styles.messageImage}
                resizeMode="cover"
              />
          ) : (
            <Text style={[
              styles.messageText,
              isMyMessage ? styles.myMessageText : styles.otherMessageText,
            ]}>
              {item.text}
            </Text>
          )}
        </View>
        <Text style={styles.messageTime}>{timeString}</Text>
      </View>
    );
  }, [userId]);

  const renderUser = useCallback(({ item }: { item: UserType }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => openChat(item)}
    >
      <View style={styles.userAvatar}>
        <Text style={styles.avatarText}>{item.username.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.userUsername}>{item.username}</Text>
        {item.lastMessage ? (
          <Text style={styles.lastMessage} numberOfLines={1}>
            {item.lastMessage}
          </Text>
        ) : (
          <Text style={styles.userEmail}>{item.email}</Text>
        )}
      </View>
      <Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
  ), [openChat]);

  // ==================== RENDER KOMPONEN UTAMA ====================
  const filteredUsers = users.filter(user => 
    user.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Data yang akan ditampilkan
  const displayData = searchQuery.trim().length > 0 ? searchResults : filteredUsers;

  if (!isInChat) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View>
              <Text style={styles.headerTitle}>Chats</Text>
              <Text style={styles.headerSubtitle}>Halo, {username}!</Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
          <View style={styles.searchInputWrapper}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Cari pengguna..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#A8D5BA"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Text style={styles.clearIcon}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          {searchQuery.trim().length > 0 && (
            <Text style={styles.searchHint}>
              {searchingNewUsers ? 'Mencari...' : `Hasil pencarian: ${searchResults.length} pengguna`}
            </Text>
          )}
        </View>

        <FlatList
          data={displayData}
          keyExtractor={(item) => item.id}
          renderItem={renderUser}
          contentContainerStyle={styles.userList}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              {searchingNewUsers ? (
                <>
                  <ActivityIndicator size="large" color="#FF6B8B" />
                  <Text style={styles.emptyText}>Mencari pengguna...</Text>
                </>
              ) : searchQuery.length > 0 ? (
                <>
                  <Text style={styles.emptyText}>Tidak ditemukan</Text>
                  <Text style={styles.emptySubtext}>
                    Pengguna "{searchQuery}" tidak terdaftar
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.emptyText}>Belum ada percakapan</Text>
                  <Text style={styles.emptySubtext}>
                    Gunakan kotak pencarian untuk menemukan pengguna baru
                  </Text>
                </>
              )}
            </View>
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }}
      behavior="height"
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.headerRoomChat}>
          <TouchableOpacity onPress={backToUserList} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.chatUserAvatar}>
              <Text style={styles.avatarText}>
                {selectedUser?.username.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.chatUsername}>{selectedUser?.username}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {loadingMessages ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF6B8B" />
            <Text style={styles.loadingText}>Memuat pesan...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Belum ada pesan</Text>
                <Text style={styles.emptySubtext}>Mulai percakapan!</Text>
              </View>
            }
          />
        )}

        <View style={styles.inputContainer}>
          <TouchableOpacity 
            onPress={pickImage} 
            style={styles.attachButton}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.attachIcon}>📎</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.textInput}
            placeholder="Ketik pesan..."
            value={message}
            onChangeText={setMessage}
            placeholderTextColor="#A8D5BA"
            multiline={true}
            maxLength={500}
            textAlignVertical="center"
          />

          <TouchableOpacity
            style={[styles.sendButton, !message.trim() && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={!message.trim()}
          >
            <Text style={styles.sendButtonText}>➤</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF5F7',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 15,
    paddingTop: 50,
    backgroundColor: '#FF6B8B',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    // height: 80,
  },
    headerRoomChat: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    paddingTop: 25,
    backgroundColor: '#FF6B8B',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#FFF5F7',
    fontSize: 12,
  },
  backButton: {
    padding: 5,
    width: 40,
    alignItems: 'center',
  },
  backText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '300',
  },
  chatUserAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#A8D5BA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  chatUsername: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  logoutButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 15,
    paddingVertical: 6,
    borderRadius: 15,
  },
  logoutText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  searchContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E8F5E8',
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F8F8',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
    color: '#FF6B8B',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#2C3E50',
    paddingVertical: 0,
  },
  clearIcon: {
    fontSize: 16,
    color: '#95A5A6',
    paddingLeft: 8,
  },
  searchHint: {
    fontSize: 12,
    color: '#FF6B8B',
    marginTop: 8,
    marginLeft: 5,
  },
  userList: {
    paddingVertical: 5,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  userAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#A8D5BA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  userInfo: {
    flex: 1,
  },
  userUsername: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 13,
    color: '#95A5A6',
  },
  lastMessage: {
    fontSize: 13,
    color: '#7F8C8D',
  },
  arrow: {
    fontSize: 28,
    color: '#BDC3C7',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#FF6B8B',
  },
  messagesList: {
    padding: 15,
    paddingBottom: 10,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  emptyText: {
    fontSize: 18,
    color: '#FF6B8B',
    fontWeight: 'bold',
    marginBottom: 5,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#A8D5BA',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  messageContainer: {
    marginVertical: 8,
    maxWidth: '80%',
  },
  myMessageContainer: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  otherMessageContainer: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  messageBubble: {
    borderRadius: 18,
    padding: 12,
    paddingHorizontal: 14,
  },
  myMessageBubble: {
    backgroundColor: '#FF6B8B',
    borderBottomRightRadius: 4,
  },
  otherMessageBubble: {
    backgroundColor: '#A8D5BA',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  myMessageText: {
    color: '#FFFFFF',
  },
  otherMessageText: {
    color: '#1A3C34',
  },
  messageImage: {
    width: 200,
    height: 150,
    borderRadius: 12,
    marginBottom: 5,
  },
  messageTime: {
    fontSize: 10,
    color: '#888',
    marginTop: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8F5E8',
  },
  attachButton: {
    marginRight: 10,
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
  },
  attachIcon: {
    fontSize: 22,
    color: '#FF6B8B',
  },
  textInput: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#A8D5BA',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44,
    maxHeight: 120,
    fontSize: 16,
    color: '#4A6572',
    backgroundColor: '#FAFFFC',
  },
  sendButton: {
    marginLeft: 10,
    backgroundColor: '#FF6B8B',
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#FF6B8B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  sendButtonDisabled: {
    backgroundColor: '#FFB8C6',
    elevation: 0,
    shadowOpacity: 0,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
});