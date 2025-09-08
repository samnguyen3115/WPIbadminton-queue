
const firebaseConfig = {
  apiKey: "AIzaSyC0D9SIqvJuVdbGJA4asolruJlW8i3oGg0",
  authDomain: "badminton-queue-wpi.firebaseapp.com",
  projectId: "badminton-queue-wpi",
  storageBucket: "badminton-queue-wpi.firebasestorage.app",
  messagingSenderId: "297316463306",
  appId: "1:297316463306:web:bc54f9238c888c904d7a33",
  measurementId: "G-2JFVDZPL8T"
};

let app = null;
let db = null;

window.initializeFirebaseApp = (FirebaseApp, FirebaseFirestore) => {
  app = FirebaseApp.initializeApp(firebaseConfig);
  db = FirebaseFirestore.getFirestore(app);
  console.log('🔥 Firebase initialized successfully');
};

const playersDB = {
  
  onPlayersChange: (callback) => {
    if (!db) throw new Error('Firebase not initialized');
    const { collection, onSnapshot } = window.FirebaseFirestore;
    
    const unsubscribe = onSnapshot(collection(db, 'players'), (snapshot) => {
      const players = [];
      snapshot.forEach((doc) => {
        players.push({
          id: doc.id,
          ...doc.data()
        });
      });
      callback(players);
    });
    return unsubscribe; 
  },
  
  addPlayer: async (playerData) => {
    if (!db) throw new Error('Firebase not initialized');
    const { collection, addDoc } = window.FirebaseFirestore;
    
    let status = 'queue-intermediate'; 
    let queueType = 'intermediate';
    if (playerData.qualification && playerData.qualification.toLowerCase() === 'advanced') {
      status = 'queue-advanced';
      queueType = 'advanced';
    }
    
    try {
      const orderNumber = Date.now(); 
      
      const docRef = await addDoc(collection(db, 'players'), {
        name: playerData.name,
        status: playerData.status || status,
        qualification: playerData.qualification || 'intermediate',
        order: orderNumber,
        timestamp: new Date(),
        lastUpdated: new Date()
      });
      console.log('✅ Player added with ID:', docRef.id, 'Order:', orderNumber);
      return docRef.id;
    } catch (error) {
      console.error('❌ Error adding player:', error);
      throw error;
    }
  },
  
  updatePlayer: async (playerId, newData) => {
    if (!db) throw new Error('Firebase not initialized');
    const { doc, updateDoc } = window.FirebaseFirestore;
    
    try {
      const playerRef = doc(db, 'players', playerId);
      await updateDoc(playerRef, {
        ...newData,
        lastUpdated: new Date()
      });
      console.log('Player updated:', playerId);
    } catch (error) {
      console.error('Error updating player:', error);
      throw error;
    }
  },

  
  updatePlayerStatusAndQualification: async (playerId, status, qualification) => {
    if (!db) throw new Error('Firebase not initialized');
    const { doc, updateDoc } = window.FirebaseFirestore;
    
    try {
      const playerRef = doc(db, 'players', playerId);
      await updateDoc(playerRef, {
        status: status,
        qualification: qualification,
        lastUpdated: new Date()
      });
      console.log('Player status and qualification updated:', playerId, status, qualification);
    } catch (error) {
      console.error('Error updating player status and qualification:', error);
      throw error;
    }
  },

  
  updatePlayerOrder: async (playerId, newOrder) => {
    if (!db) throw new Error('Firebase not initialized');
    const { doc, updateDoc } = window.FirebaseFirestore;
    
    try {
      const playerRef = doc(db, 'players', playerId);
      await updateDoc(playerRef, {
        order: newOrder,
        lastUpdated: new Date()
      });
      console.log('Player order updated:', playerId, newOrder);
    } catch (error) {
      console.error('Error updating player order:', error);
      throw error;
    }
  },

  getNextOrder: async (queueType) => {
    if (!db) throw new Error('Firebase not initialized');
    const { collection, getDocs, query, where } = window.FirebaseFirestore;
    
    try {
      const statusFilter = queueType === 'advanced' ? 'queue-advanced' : 'queue-intermediate';
      
      const q = query(
        collection(db, 'players'), 
        where('status', '==', statusFilter)
      );
      
      const querySnapshot = await getDocs(q);
      let maxOrder = 0;
      
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.order && data.order > maxOrder) {
          maxOrder = data.order;
        }
      });
      
      return maxOrder + 1;
    } catch (error) {
      console.error('❌ Error getting next order:', error);
      return Date.now() % 10000; 
    }
  },
  
  
  deletePlayer: async (playerId) => {
    if (!db) throw new Error('Firebase not initialized');
    const { doc, deleteDoc } = window.FirebaseFirestore;
    
    try {
      await deleteDoc(doc(db, 'players', playerId));
      console.log('✅ Player deleted:', playerId);
    } catch (error) {
      console.error('❌ Error deleting player:', error);
      throw error;
    }
  },
  
  
  getAllPlayers: async () => {
    if (!db) throw new Error('Firebase not initialized');
    const { collection, getDocs } = window.FirebaseFirestore;
    
    try {
      const querySnapshot = await getDocs(collection(db, 'players'));
      const players = [];
      querySnapshot.forEach((doc) => {
        players.push({
          id: doc.id,
          ...doc.data()
        });
      });
      return players;
    } catch (error) {
      console.error('❌ Error getting players:', error);
      throw error;
    }
  }
};


const courtsDB = {
  
  
  onCourtsChange: (callback) => {
    if (!db) throw new Error('Firebase not initialized');
    const { collection, onSnapshot } = window.FirebaseFirestore;
    
    const unsubscribe = onSnapshot(collection(db, 'courts'), (snapshot) => {
      const courts = [];
      snapshot.forEach((doc) => {
        courts.push({
          id: doc.id,
          ...doc.data()
        });
      });
      callback(courts);
    });
    return unsubscribe;
  },
  
  
  updateCourtType: async (courtName, courtType) => {
    if (!db) throw new Error('Firebase not initialized');
    const { collection, doc, setDoc } = window.FirebaseFirestore;
    
    try {
      const courtRef = doc(collection(db, 'courts'), courtName);
      await setDoc(courtRef, {
        name: courtName,
        type: courtType, 
        lastUpdated: new Date()
      }, { merge: true });
      console.log('✅ Court type updated:', courtName, courtType);
    } catch (error) {
      console.error('❌ Error updating court type:', error);
      throw error;
    }
  },
  
  
  getCourtType: async (courtName) => {
    if (!db) throw new Error('Firebase not initialized');
    const { collection, doc, getDoc } = window.FirebaseFirestore;
    
    try {
      const courtRef = doc(collection(db, 'courts'), courtName);
      const courtDoc = await getDoc(courtRef);
      
      if (courtDoc.exists()) {
        return courtDoc.data().type || 'intermediate'; 
      } else {
        return 'intermediate'; 
      }
    } catch (error) {
      console.error('❌ Error getting court type:', error);
      return 'intermediate'; 
    }
  }
};


const checkFirebaseConnection = async () => {
  if (!db) return { connected: false, message: 'Firebase not initialized' };
  const { collection, getDocs } = window.FirebaseFirestore;
  
  try {
    await getDocs(collection(db, 'players'));
    return { connected: true, message: 'Firebase connected successfully' };
  } catch (error) {
    return { connected: false, message: error.message };
  }
};


window.playersDB = playersDB;
window.courtsDB = courtsDB;
window.checkFirebaseConnection = checkFirebaseConnection;
