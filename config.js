const firebaseConfig = {
  apiKey: "AIzaSyC0D9SIqvJuVdbGJA4asolruJlW8i3oGg0",
  authDomain: "badminton-queue-wpi.firebaseapp.com",
  projectId: "badminton-queue-wpi",
  storageBucket: "badminton-queue-wpi.firebasestorage.app",
  messagingSenderId: "297316463306",
  appId: "1:297316463306:web:bc54f9238c888c904d7a33",
  measurementId: "G-2JFVDZPL8T",
};

let app = null;
let db = null;

window.initializeFirebaseApp = (FirebaseApp, FirebaseFirestore) => {
  app = FirebaseApp.initializeApp(firebaseConfig);
  db = FirebaseFirestore.getFirestore(app);
  console.log("🔥 Firebase initialized successfully");
};

const playersDB = {
  onPlayersChange: (callback) => {
    if (!db) throw new Error("Firebase not initialized");
    const { collection, onSnapshot } = window.FirebaseFirestore;

    const unsubscribe = onSnapshot(collection(db, "players"), (snapshot) => {
      const players = [];
      snapshot.forEach((doc) => {
        players.push({
          id: doc.id,
          ...doc.data(),
        });
      });
      callback(players);
    });
    return unsubscribe;
  },

  addPlayer: async (playerData) => {
    if (!db) throw new Error("Firebase not initialized");
    const { collection, addDoc } = window.FirebaseFirestore;

    try {
      // We've already checked for duplicates in the UI, so just add the player
      const docRef = await addDoc(collection(db, "players"), {
        name: playerData.name,
        qualification: playerData.qualification || "intermediate",
        timestamp: new Date(),
        lastUpdated: new Date(),
      });
      console.log("Player added with ID:", docRef.id, "(status kept in memory only)");
      return docRef.id;
    } catch (error) {
      console.error("Error adding player:", error);
      throw error;
    }
  },

  updatePlayer: async (playerId, newData) => {
    if (!db) throw new Error("Firebase not initialized");
    const { doc, updateDoc } = window.FirebaseFirestore;

    try {
      const playerRef = doc(db, "players", playerId);
      await updateDoc(playerRef, {
        ...newData,
        lastUpdated: new Date(),
      });
      console.log("Player updated:", playerId);
    } catch (error) {
      console.error("Error updating player:", error);
      throw error;
    }
  },

  updatePlayerStatusAndQualification: async (
    playerId,
    status,
    qualification
  ) => {
    if (!db) throw new Error("Firebase not initialized");
    const { doc, updateDoc } = window.FirebaseFirestore;

    try {
      const playerRef = doc(db, "players", playerId);
      // Only update qualification in the database, not status
      await updateDoc(playerRef, {
        qualification: qualification,
        lastUpdated: new Date(),
      });
      console.log(
        "Player qualification updated:",
        playerId,
        qualification,
        "(status kept in memory only)"
      );
    } catch (error) {
      console.error("Error updating player qualification:", error);
      throw error;
    }
  },



  deletePlayer: async (playerId) => {
    if (!db) throw new Error("Firebase not initialized");
    const { doc, deleteDoc } = window.FirebaseFirestore;

    try {
      await deleteDoc(doc(db, "players", playerId));
      console.log("Player deleted:", playerId);
    } catch (error) {
      console.error("Error deleting player:", error);
      throw error;
    }
  },

  getAllPlayers: async () => {
    if (!db) throw new Error("Firebase not initialized");
    const { collection, getDocs } = window.FirebaseFirestore;

    try {
      const querySnapshot = await getDocs(collection(db, "players"));
      const players = [];
      querySnapshot.forEach((doc) => {
        players.push({
          id: doc.id,
          ...doc.data(),
        });
      });
      return players;
    } catch (error) {
      console.error("❌ Error getting players:", error);
      throw error;
    }
  },
  
  checkNameExists: async (name) => {
    if (!db) throw new Error("Firebase not initialized");
    const { collection, getDocs } = window.FirebaseFirestore;
    
    try {
      const nameToCheck = name.toLowerCase().trim();
      const querySnapshot = await getDocs(collection(db, "players"));
      
      let foundMatch = false;
      let matchingNames = [];
      
      querySnapshot.forEach((doc) => {
        const player = doc.data();
        if (player.name && player.name.toLowerCase().trim() === nameToCheck) {
          foundMatch = true;
          matchingNames.push(player.name);
        }
      });
      
      return {
        exists: foundMatch,
        matchingNames: matchingNames
      };
    } catch (error) {
      console.error("Error checking name existence:", error);
      throw error;
    }
  },
};


const checkFirebaseConnection = async () => {
  if (!db) return { connected: false, message: "Firebase not initialized" };
  const { collection, getDocs } = window.FirebaseFirestore;

  try {
    await getDocs(collection(db, "players"));
    return { connected: true, message: "Firebase connected successfully" };
  } catch (error) {
    return { connected: false, message: error.message };
  }
};

window.playersDB = playersDB;
window.checkFirebaseConnection = checkFirebaseConnection;
