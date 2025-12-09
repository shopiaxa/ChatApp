import auth from "@react-native-firebase/auth";
import firestore from "@react-native-firebase/firestore";

firestore().settings({
  persistence: true,
});

// Export auth
export { auth };

// Export firestore
export const db = firestore();

// Firestore collections
export const messagesCollection = db.collection('messages');

// Firestore functions
export const addDoc = async (collection: any, data: any) => {
  return await collection.add(data);
};

export const serverTimestamp = () => firestore.FieldValue.serverTimestamp();

// LOGIN
export const signInWithEmailAndPassword = async (
  email: string,
  password: string
) => {
  try {
    console.log("Login attempt:", email);
    const userCredential = await auth().signInWithEmailAndPassword(
      email,
      password
    );
    console.log("Login success:", userCredential.user.uid);
    return userCredential;
  } catch (error) {
    console.error("Login error:", error);
    return Promise.reject(error);
  }
};

// REGISTER
export const createUserWithEmailAndPassword = async (
  email: string,
  password: string
) => {
  try {
    console.log("Register attempt:", email);
    const userCredential = await auth().createUserWithEmailAndPassword(
      email,
      password
    );
    console.log("Register success:", userCredential.user.uid);
    return userCredential;
  } catch (error) {
    console.error("Register error:", error);
    return Promise.reject(error);
  }
};

// LOGOUT
export const signOut = () => auth().signOut();

// Fungsi helper untuk query (tanpa orderBy untuk hindari index error)
export const queryMessagesByChatRoom = (chatRoomId: string) => {
  return messagesCollection
    .where('chatRoomId', '==', chatRoomId);
};