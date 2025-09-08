
//======================================================
// GLOBAL VARIABLES AND STATE MANAGEMENT
//======================================================

let players = [];
let advancedQueue = [];
let intermediateQueue = [];
let courtAssignments = {};
let courtTypes = {};
let dragPlayerIndex = null;
let firebaseUnsubscribe = null;
let courtsUnsubscribe = null;

// Variables for offline-first approach
let deletedPlayers = []; // IDs of players to delete on sync
let lastSyncTime = null; // When we last synced with Firebase
let localBackupInterval = null; // For periodic local backups
const LOCAL_STORAGE_KEY = 'badminton_queue_data';

const courtPairs = {
  G1: "W1",
  G2: "W2",
  G3: "W3",
  G4: "W4",
  W1: "G1",
  W2: "G2",
  W3: "G3",
  W4: "G4",
};

let isDragging = false;
let autoFillTimeout = null;
let lastAutoFillTime = 0;
let isUpdatingFirebase = false;
let pendingUpdates = new Set();
let periodicCheckInterval = null;

//======================================================
// FIREBASE INITIALIZATION AND CONNECTION
//======================================================

/**
 * Initializes the Firebase connection and loads initial data
 * - Connects to Firebase services
 * - Loads players data from Firebase database
 * - Loads court data from Firebase database
 * - Sets up local backups and periodic court checks
 */
async function initializeFirebase() {
  try {
    console.log("Connecting to Firebase...");

    if (!window.FirebaseApp || !window.FirebaseFirestore) {
      throw new Error("Firebase modules not loaded");
    }

    window.initializeFirebaseApp(window.FirebaseApp, window.FirebaseFirestore);

    const connectionStatus = await window.checkFirebaseConnection();
    if (!connectionStatus.connected) {
      throw new Error(connectionStatus.message);
    }

    // Load players once at the start of practice
    console.log("Loading players from Firebase...");
    players = await window.playersDB.getAllPlayers();
    console.log("Players loaded from Firebase:", players.length);
    
    // Make sure all loaded players are in the queue (not on courts)
    players.forEach(player => {
      if (player.status && !player.status.startsWith('queue-')) {
        // Reset any player on courts to their queue
        player.status = player.qualification === 'advanced' ? 'queue-advanced' : 'queue-intermediate';
      }
    });
    
    // Initialize local arrays
    initializePlayerArrays();
    renderPlayerQueue();
    
    // Initialize court types with defaults - courts are only stored locally now
    initializeDefaultCourtTypes();
    renderCourtPlayers();
    updateCourtDropdowns();
    
    
    return;
    
  } catch (error) {
    console.error("Firebase initialization failed:", error);
    console.log("Firebase connection failed");
    alert(
      "Firebase connection failed: " +
        error.message +
        "\n\nMake sure you:\n1. Created a Firebase project\n2. Enabled Firestore\n3. Updated firebase-config.js with your config"
    );
  }
}

//======================================================
// PLAYER DATA MANAGEMENT
//======================================================

/**
 * Organizes players into queues and courts
 * - Creates sorted arrays for advanced and intermediate queues
 * - Builds court assignment map to track who is on which court
 * - Used whenever player data changes to keep local data structures in sync
 */
function initializePlayerArrays() {
  advancedQueue = players
    .map((_, i) => i)
    .filter((i) => players[i].status === "queue-advanced")
    .sort((a, b) => (players[a].order || 0) - (players[b].order || 0));

  intermediateQueue = players
    .map((_, i) => i)
    .filter((i) => players[i].status === "queue-intermediate")
    .sort((a, b) => (players[a].order || 0) - (players[b].order || 0));

  courtAssignments = {};
  players.forEach((p, i) => {
    if (p.status && !p.status.startsWith("queue")) {
      if (!courtAssignments[p.status]) courtAssignments[p.status] = [];
      courtAssignments[p.status].push(i);
    }
  });

  console.log(
    "Advanced Queue: " +
      advancedQueue.length +
      ", Intermediate Queue: " +
      intermediateQueue.length
  );
}



/**
 * Updates both a player's status and qualification level
 * - Used when moving players between different level queues
 * - Updates player's position in queue using timestamps
 * - Updates UI and saves changes to local storage
 * 
 * @param {number} playerIndex - Index of player in players array
 * @param {string} newStatus - New status/location (court name or queue)
 * @param {string} newQualification - Player's skill level (advanced/intermediate)
 */
function updatePlayerStatus(
  playerIndex,
  newStatus,
  newQualification
) {
  if (!players[playerIndex]) return;

  const player = players[playerIndex];
  const oldStatus = player.status;
  const oldQualification = player.qualification;

  try {
    let orderToAssign = player.order || Date.now();

    if (newStatus.startsWith("queue-")) {
      orderToAssign = Date.now();
    }

    // Update local state only
    player.status = newStatus;
    player.qualification = newQualification;
    player.modified = true; // Mark this player as modified
    
    if (newStatus.startsWith("queue-") && orderToAssign !== player.order) {
      player.order = orderToAssign;
    }
    
    initializePlayerArrays();
    renderPlayerQueue();
    renderCourtPlayers();
    
    // Save to local storage as backup
    saveToLocalStorage();

    console.log(
      `Updated ${player.name} to ${newStatus} with qualification ${newQualification} and order ${orderToAssign} in memory`
    );
  } catch (error) {
    console.error(
      "Failed to update player status and qualification:",
      error
    );

    // Revert changes on error
    player.status = oldStatus;
    player.qualification = oldQualification;
    initializePlayerArrays();
    renderPlayerQueue();
    renderCourtPlayers();
  }
}

/**
 * Reorders players in a queue after drag and drop
 * - Updates the order timestamp for each player based on their new position
 * - Ensures queue display matches the drag-and-drop arrangement
 * - Saves changes to local storage
 * 
 * @param {string} queueType - Type of queue being reordered (advanced/intermediate)
 * @param {Array} newOrderArray - Array of player indices in their new order
 */
function reorderPlayersInQueue(queueType, newOrderArray) {
  try {
    const baseTime = Date.now();

    for (let i = 0; i < newOrderArray.length; i++) {
      const playerIndex = newOrderArray[i];
      const player = players[playerIndex];
      if (player) {
        const newOrder = baseTime + i;
        player.order = newOrder;
        player.modified = true; // Mark this player as modified
      }
    }

    initializePlayerArrays();
    renderPlayerQueue();
    
    // Save to local storage as backup
    saveToLocalStorage();

    console.log(
      `Reordered ${queueType} queue with ${newOrderArray.length} players in memory`
    );
  } catch (error) {
    console.error("Failed to reorder queue:", error);
  }
}

//======================================================
// PLAYER MOVEMENT & ASSIGNMENT
//======================================================

/**
 * Moves a player to a specific court
 * - Enforces court type restrictions (training, advanced, intermediate)
 * - Checks qualification match for court type
 * - Ensures court is not already full
 * - Updates player status to move them to the court
 * 
 * @param {number} playerIndex - Index of player in players array
 * @param {string} court - Court identifier (G1-G4, W1-W4)
 */
function moveToCourt(playerIndex, court) {
  if (!players[playerIndex]) return;

  const player = players[playerIndex];
  const courtType = courtTypes[court] || "intermediate";

  if (courtType === "advanced" && player.qualification !== "advanced") {
    alert(
      `Court ${court} is for ADVANCED players only. ${player.name} is ${player.qualification}.`
    );
    console.log(
      `Cannot move ${player.name} to ${court} - advanced court requires advanced qualification`
    );
    return;
  }

  if (courtType === "intermediate" && player.qualification !== "intermediate") {
    alert(
      `Court ${court} is for INTERMEDIATE players only. ${player.name} is ${player.qualification}.`
    );
    console.log(
      `Cannot move ${player.name} to ${court} - intermediate court requires intermediate qualification`
    );
    return;
  }

  const currentPlayersOnCourt = courtAssignments[court] || [];
  if (currentPlayersOnCourt.length >= 4) {
    alert(`Court ${court} is full! Maximum 4 players per court.`);
    console.log(
      `Cannot move player to ${court} - court is full (${currentPlayersOnCourt.length}/4 players)`
    );
    return;
  }

  updatePlayerStatus(playerIndex, court,player.qualification);
}

/**
 * Moves a player to a specific queue type
 * - Used to move players from courts back to queues
 * - Can also change player's qualification level
 * - Triggers auto-fill to fill vacant court spots
 * 
 * @param {number} playerIndex - Index of player in players array
 * @param {string} queueType - Queue to move player to (advanced/intermediate)
 */
function moveToSpecificQueue(playerIndex, queueType) {
  if (!players[playerIndex]) return;

  const player = players[playerIndex];
  const wasOnCourt = player.status && !player.status.includes("queue");
  const previousCourt = wasOnCourt ? player.status : null;

  let newStatus, newQualification;

  if (queueType === "advanced") {
    newStatus = "queue-advanced";
    newQualification = "advanced";
  } else {
    newStatus = "queue-intermediate";
    newQualification = "intermediate";
  }

  updatePlayerStatus(playerIndex, newStatus, newQualification);

  if (wasOnCourt && previousCourt) {
    setTimeout(() => {
      if (!isDragging) {
        debouncedAutoFill();
      }
    }, 1000);
  }
}


//======================================================
// AUTO ADVANCE & QUEUE MANAGEMENT
//======================================================

/**
 * Advances a player from a specific queue to a court
 * - Takes the next player from the specified queue
 * - Checks if court is available and not in training mode
 * - Ensures player qualification matches court type
 * 
 * @param {string} courtName - Court identifier to advance player to
 * @param {string} queueType - Queue to take player from (advanced/intermediate)
 */
async function autoAdvanceFromQueue(courtName, queueType = "advanced") {
  const queue = queueType === "advanced" ? advancedQueue : intermediateQueue;

  if (queue.length === 0) {
    console.log(`No players in ${queueType} queue to advance to ${courtName}`);
    return;
  }

  const courtType = courtTypes[courtName] || "intermediate";

  if (courtType === "training") {
    console.log(
      `Cannot auto-advance to ${courtName} - court is in training mode`
    );
    return;
  }

  const currentPlayersOnCourt = courtAssignments[courtName] || [];
  if (currentPlayersOnCourt.length >= 4) {
    console.log(
      `Cannot auto-advance to ${courtName} - court is full (${currentPlayersOnCourt.length}/4 players)`
    );
    return;
  }

  let nextPlayerIndex = null;
  for (const playerIndex of queue) {
    const player = players[playerIndex];
    if (!player) continue;

    if (courtType === "advanced" && player.qualification !== "advanced") {
      continue;
    }
    if (
      courtType === "intermediate" &&
      player.qualification !== "intermediate"
    ) {
      continue;
    }

    nextPlayerIndex = playerIndex;
    break;
  }

  if (nextPlayerIndex === null) {
    console.log(
      `No suitable ${queueType} players for ${courtType} court ${courtName}`
    );
    return;
  }

  const nextPlayer = players[nextPlayerIndex];

  try {
    await updatePlayerStatus(nextPlayerIndex, courtName,player.qualification);
    console.log(
      `Auto-advanced ${nextPlayer.name} from ${queueType} queue to ${courtName}`
    );
  } catch (error) {
    console.error("Failed to auto-advance player:", error);
  }
}

//======================================================
// COURT MANAGEMENT
//======================================================


/**
 * Changes the type of a court (advanced, intermediate, training)
 * - Enforces restrictions on which courts can be changed
 * - Maintains synchronization between paired G and W courts
 * - Handles player movement when changing to/from training mode
 * - Updates UI and saves changes to local storage
 * 
 * @param {string} courtName - Court identifier to change (G1-G4)
 * @param {string} courtType - New court type (advanced/intermediate/training)
 */
function changeCourtType(courtName, courtType) {
  if (!courtName || !courtType) {
    console.error("Court name and type are required");
    return;
  }

  if (!["advanced", "intermediate", "training"].includes(courtType)) {
    console.error("Invalid court type:", courtType);
    return;
  }

  if (courtName.startsWith("W")) {
    const gCourtName = courtPairs[courtName];
    alert(
      `Cannot change type of ${courtName} directly. It inherits type from ${gCourtName}. Change ${gCourtName} instead.`
    );

    updateCourtDropdowns();
    return;
  }

  try {
    console.log(`Changing court ${courtName} type to ${courtType}...`);
    
    const oldCourtType = courtTypes[courtName.trim()] || "intermediate";
    
    // Update in memory only - no longer syncing to Firebase
    courtTypes[courtName.trim()] = courtType;
    
    if (courtName.startsWith("G")) {
      const wCourtName = courtPairs[courtName];
      courtTypes[wCourtName] = courtType;
      console.log(`Synced ${wCourtName} type with ${courtName}: ${courtType} in memory`);
    }
    
    // Handle players on court based on the new court type
    handleCourtTypeChange(courtName, oldCourtType, courtType);
    
    // Update UI and save to local storage
    syncWCourtTypes();
    renderCourtPlayers();
    updateCourtDropdowns();
    saveToLocalStorage();

    console.log("Updated court " + courtName + " to " + courtType + " in memory");
  } catch (error) {
    console.error("Failed to update court type:", error);
  }
}

/**
 * Rotates players between courts in a G-W pair
 * - Moves G court players back to queue
 * - Moves W court players to G court
 * - Triggers auto-fill to populate empty spots in W court
 * - Essential for court rotation flow management
 * 
 * @param {string} gCourtName - G court identifier to rotate (G1-G4)
 */
function rotateCourtPlayers(gCourtName) {
  if (!gCourtName.startsWith("G")) {
    console.error("Rotation can only be triggered from G-Courts");
    return;
  }

  const wCourtName = courtPairs[gCourtName];
  const gCourtPlayers = courtAssignments[gCourtName] || [];
  const wCourtPlayers = courtAssignments[wCourtName] || [];

  try {
    // Move G court players to queue
    for (const playerIndex of gCourtPlayers) {
      const player = players[playerIndex];
      if (player) {
        const queueType =
          player.qualification === "advanced"
            ? "queue-advanced"
            : "queue-intermediate";
        player.status = queueType;
        player.order = Date.now();
        player.modified = true;
        console.log(`Moved ${player.name} from ${gCourtName} back to queue`);
      }
    }

    // Move W court players to G court
    for (const playerIndex of wCourtPlayers) {
      const player = players[playerIndex];
      if (player) {
        player.status = gCourtName;
        player.modified = true;
        console.log(`Moved ${player.name} from ${wCourtName} to ${gCourtName}`);
      }
    }

    // Update UI and save to local storage
    initializePlayerArrays();
    renderPlayerQueue();
    renderCourtPlayers();
    saveToLocalStorage();

    setTimeout(() => {
      autoFillEmptyCourts();
    }, 1000);

    console.log(`Completed rotation for ${gCourtName}-${wCourtName} pair`);
  } catch (error) {
    console.error(`Failed to rotate players for ${gCourtName}:`, error);
  }
}

/**
 * Handles player movement when a court type changes
 * - Manages both G court and its paired W court
 * - When changing to training mode: moves all players to their respective queues
 * - When changing from training mode: triggers auto-fill to populate courts
 * - Uses batch processing to avoid race conditions
 * 
 * @param {string} courtName - Court identifier being changed
 * @param {string} oldCourtType - Previous court type
 * @param {string} newCourtType - New court type
 */
function handleCourtTypeChange(courtName, oldCourtType, newCourtType) {
  // Get both courts in a pair (G and W courts)
  const courts = [courtName];
  const isGCourt = courtName.startsWith("G");
  const pairedCourtName = courtPairs[courtName];
  
  if (isGCourt && pairedCourtName) {
    courts.push(pairedCourtName);
  }
  
  console.log(`Handling court type change for ${courts.join(', ')} from ${oldCourtType} to ${newCourtType}`);
  
  // Handle players when changing to training mode (kick all players)
  if (newCourtType === "training") {
    // First identify all players that need to be moved
    const playersToMove = [];
    
    courts.forEach(court => {
      const playersOnCourt = courtAssignments[court] || [];
      if (playersOnCourt.length > 0) {
        console.log(`Court ${court} changed to training mode. Will move ${playersOnCourt.length} player(s) to queue.`);
        
        // Add each player to our list to move
        for (const playerIndex of playersOnCourt) {
          if (players[playerIndex]) {
            playersToMove.push({
              playerIndex: playerIndex,
              player: players[playerIndex],
              fromCourt: court
            });
          }
        }
      }
    });
    
    // Now move all identified players to their respective queues
    for (const item of playersToMove) {
      const queueType = item.player.qualification === "advanced" ? "advanced" : "intermediate";
      const queueStatus = queueType === "advanced" ? "queue-advanced" : "queue-intermediate";
      
      // Directly update player status to prevent race conditions
      item.player.status = queueStatus;
      item.player.order = Date.now();
      item.player.modified = true;
      
      console.log(`Moving ${item.player.name} from court ${item.fromCourt} to ${queueType} queue (training mode activated)`);
    }
    
    // Update all arrays and UI at once after all changes are made
    initializePlayerArrays();
    renderPlayerQueue();
    renderCourtPlayers();
    saveToLocalStorage();
    
  }
  // Handle players when changing from training mode to regular mode (auto-fill)
  else if (oldCourtType === "training" && newCourtType !== "training") {
    console.log(`Court ${courtName} changed from training to ${newCourtType} mode. Auto-filling court.`);
    
    // Use a timeout to ensure court arrays are updated before auto-filling
    setTimeout(() => {
      autoFillEmptyCourts();
    }, 500);
  }
}

/**
 * Synchronizes W court types with their paired G courts
 * - Ensures W courts always have the same type as their paired G court
 * - Called after court type changes and during initialization
 */
function syncWCourtTypes() {
  ["G1", "G2", "G3", "G4"].forEach((gCourt) => {
    const wCourt = courtPairs[gCourt];
    const gCourtType = courtTypes[gCourt] || "intermediate";
    courtTypes[wCourt] = gCourtType;
  });
}

//======================================================
// AUTO FILL FUNCTIONALITY
//======================================================

/**
 * Provides a debounced version of the auto-fill function
 * - Prevents multiple rapid auto-fills which could cause conflicts
 * - Adds delay to allow UI updates to complete
 * - Checks for drag operations in progress to avoid interrupting user actions
 */
function debouncedAutoFill() {
  if (autoFillTimeout) {
    clearTimeout(autoFillTimeout);
  }

  const now = Date.now();
  if (now - lastAutoFillTime < 3000) {
    autoFillTimeout = setTimeout(() => {
      debouncedAutoFill();
    }, 1000);
    return;
  }

  autoFillTimeout = setTimeout(() => {
    if (!isDragging) {
      lastAutoFillTime = Date.now();
      autoFillEmptyCourts();
    }
  }, 500);
}

/**
 * Core function that manages court balance and player placement
 * - Balances G courts by moving players from W courts when needed
 * - Prioritizes filling G courts first, then W courts from queues
 * - Respects court types and player qualifications
 * - Skips training courts
 * - Updates UI after changes
 * 
 * This is the primary automation function that maintains court population.
 * G courts always have priority over W courts when filling from queues.
 */
function autoFillEmptyCourts() {
  console.log("Auto-filling empty courts...");
  syncWCourtTypes();
  
  console.log("PRIORITY STEP: First checking if any G courts need balancing from W courts...");
  
  // Make sure we have the latest court assignments
  initializePlayerArrays();

  // First, balance G courts by moving players from W courts when needed
  const gCourts = ["G1", "G2", "G3", "G4"];
  let anyChanges = false;
  
  for (const gCourtName of gCourts) {
    const courtType = courtTypes[gCourtName] || "intermediate";
    if (courtType === "training") {
      console.log(`Skipping ${gCourtName} as it is in training mode`);
      continue;
    }
    
    const gCourtPlayers = courtAssignments[gCourtName] || [];
    const wCourtName = courtPairs[gCourtName];
    const wCourtPlayers = courtAssignments[wCourtName] || [];
    
    console.log(`Checking court pair ${gCourtName}/${wCourtName}: G=${gCourtPlayers.length} players, W=${wCourtPlayers.length} players`);
    
    // Case 1: If G court is empty and W court has players (at least 2), move them to G court
    if (gCourtPlayers.length === 0 && wCourtPlayers.length >= 2) {
      try {
        // Create a copy to avoid modification issues during iteration
        const playersToCopy = [...wCourtPlayers];
        
        // Log the attempt with more details for debugging
        console.log(`BALANCING ATTEMPT: Moving ${playersToCopy.length} players from ${wCourtName} to empty ${gCourtName}`);
        
        // Move all players from W to G
        for (const playerIndex of playersToCopy) {
          const player = players[playerIndex];
          if (player) {
            // Directly update player status
            player.status = gCourtName;
            player.modified = true;
            console.log(
              `🎾 Moved ${player.name} from ${wCourtName} to game court ${gCourtName}`
            );
            anyChanges = true;
          }
        }

        console.log(
          `Started game on ${gCourtName} with ${playersToCopy.length} players from ${wCourtName}`
        );
      } catch (error) {
        console.error(`Failed to start game on ${gCourtName}:`, error);
      }
    } 
    // Case 2: G court has players but not full, and W court has players to share
    else if (gCourtPlayers.length > 0 && gCourtPlayers.length < 4 && wCourtPlayers.length > 0) {
      const playersNeededInG = 4 - gCourtPlayers.length;
      const playersToMove = Math.min(playersNeededInG, wCourtPlayers.length);
      
      if (playersToMove > 0) {
        try {
          // Log the balancing attempt with detailed information
          console.log(`BALANCING ATTEMPT: ${gCourtName} needs ${playersNeededInG} more players, moving ${playersToMove} from ${wCourtName}`);
          
          // Move players from W to G court (create a copy to avoid modification issues)
          const playersToMoveFromW = [...wCourtPlayers].slice(0, playersToMove);
          for (const playerIndex of playersToMoveFromW) {
            const player = players[playerIndex];
            if (player) {
              // Directly update player status
              player.status = gCourtName;
              player.modified = true;
              console.log(
                `Balanced: Moved ${player.name} from ${wCourtName} to game court ${gCourtName}`
              );
              anyChanges = true;
            }
          }

          console.log(
            `Balanced ${gCourtName} by moving ${playersToMove} player(s) from ${wCourtName}`
          );
        } catch (error) {
          console.error(`Failed to balance ${gCourtName} from ${wCourtName}:`, error);
        }
      }
    }
  }
  
  // After balancing, reinitialize the arrays to ensure consistent state
  if (anyChanges) {
    console.log("Court balancing made changes - reinitializing arrays before continuing");
    initializePlayerArrays();
  }

  // First, fill empty spaces in G courts from the queue (priority)
  const allCourts = ["G1", "G2", "G3", "G4", "W1", "W2", "W3", "W4"];
  
  // Process G courts first, then W courts (prioritizing G courts)
  for (const courtName of allCourts) {
    const courtType = courtTypes[courtName] || "intermediate";
    
    // Skip training courts
    if (courtType === "training") {
      console.log(`Skipping ${courtName} as it is in training mode`);
      continue;
    }

    const currentPlayersOnCourt = courtAssignments[courtName] || [];
    const availableSpots = 4 - currentPlayersOnCourt.length;
    
    console.log(`Court ${courtName} (${courtType}) has ${availableSpots} available spots`);

    if (availableSpots <= 0) {
      continue;
    }

    // Log priority message for G courts
    if (courtName.startsWith("G")) {
      console.log(`Prioritizing filling ${courtName} as it's a G court`);
    }

    let playersToAdd = [];

    if (courtType === "advanced") {
      const availableAdvanced = advancedQueue.filter((playerIndex) => {
        const player = players[playerIndex];
        return player && player.qualification === "advanced";
      });
      playersToAdd = availableAdvanced.slice(0, availableSpots);
      console.log(`Found ${playersToAdd.length} advanced players to add to ${courtName}`);
    } else if (courtType === "intermediate") {
      const availableIntermediate = intermediateQueue.filter((playerIndex) => {
        const player = players[playerIndex];
        return player && player.qualification === "intermediate";
      });
      playersToAdd = availableIntermediate.slice(0, availableSpots);
      console.log(`Found ${playersToAdd.length} intermediate players to add to ${courtName}`);
    } else {
      playersToAdd = [];
    }

    if (playersToAdd.length > 0) {
      try {
        for (const playerIndex of playersToAdd) {
          const player = players[playerIndex];
          if (player) {
            player.status = courtName;
            player.modified = true;
            console.log(
              `Auto-filled ${player.name} to waiting court ${courtName}`
            );
            anyChanges = true;
          }
        }

        console.log(
          `Auto-filled ${playersToAdd.length} player(s) to ${courtName}`
        );
      } catch (error) {
        console.error(`Failed to auto-fill players to ${courtName}:`, error);
      }
    }
  }
  
  if (anyChanges) {
    // Update arrays and UI
    console.log("Changes detected during auto-fill. Updating UI and saving...");
    initializePlayerArrays();
    renderPlayerQueue();
    renderCourtPlayers();
    saveToLocalStorage();
  } else {
    console.log("No changes made during auto-fill");
  }
}

function startPeriodicCourtCheck() {
  if (periodicCheckInterval) {
    clearInterval(periodicCheckInterval);
  }

  periodicCheckInterval = setInterval(() => {
    if (!isDragging) {
      console.log("Periodic court check...");
      debouncedAutoFill();
    }
  }, 30000);

  console.log("Started periodic court fill check (every 30 seconds)");
}

function stopPeriodicCourtCheck() {
  if (periodicCheckInterval) {
    clearInterval(periodicCheckInterval);
    periodicCheckInterval = null;
    console.log("Stopped periodic court fill check");
  }
}


//======================================================
// UI RENDERING AND INTERACTIONS
//======================================================

function renderPlayerQueue() {
  const queueLeft = document.getElementById("player-queue");
  const queueRight = document.getElementById("player-queue-right");

  if (!queueLeft || !queueRight) return;

  queueLeft.innerHTML = '<div class="queue-header"></div>';
  queueRight.innerHTML = '<div class="queue-header"></div>';

  advancedQueue.forEach((playerIndex, position) => {
    const player = players[playerIndex];
    if (!player) return;

    const playerDiv = document.createElement("div");
    playerDiv.className = "player-box advanced-player queue-item";
    playerDiv.dataset.playerIndex = playerIndex;
    playerDiv.dataset.queueType = "advanced";
    playerDiv.dataset.position = position;
    playerDiv.innerHTML = `
      <span class="queue-number">${position + 1}</span>
      <span class="player-name">${player.name} (A)</span>
    `;
    playerDiv.draggable = true;

    playerDiv.ondragstart = (e) => {
      isDragging = true;
      dragPlayerIndex = playerIndex;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(
        "text/plain",
        JSON.stringify({
          playerIndex: playerIndex,
          sourceQueue: "advanced",
          sourcePosition: position,
        })
      );
      playerDiv.classList.add("dragging");
    };

    playerDiv.ondragend = () => {
      isDragging = false;
      playerDiv.classList.remove("dragging");

      setTimeout(() => {
        debouncedAutoFill();
      }, 200);
    };

    queueLeft.appendChild(playerDiv);
  });

  intermediateQueue.forEach((playerIndex, position) => {
    const player = players[playerIndex];
    if (!player) return;

    const playerDiv = document.createElement("div");
    playerDiv.className = "player-box intermediate-player queue-item";
    playerDiv.dataset.playerIndex = playerIndex;
    playerDiv.dataset.queueType = "intermediate";
    playerDiv.dataset.position = position;
    playerDiv.innerHTML = `
      <span class="queue-number">${position + 1}</span>
      <span class="player-name">${player.name} (I)</span>
    `;
    playerDiv.draggable = true;

    playerDiv.ondragstart = (e) => {
      isDragging = true;
      dragPlayerIndex = playerIndex;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(
        "text/plain",
        JSON.stringify({
          playerIndex: playerIndex,
          sourceQueue: "intermediate",
          sourcePosition: position,
        })
      );
      playerDiv.classList.add("dragging");
    };

    playerDiv.ondragend = () => {
      isDragging = false;
      playerDiv.classList.remove("dragging");

      setTimeout(() => {
        debouncedAutoFill();
      }, 200);
    };

    queueRight.appendChild(playerDiv);
  });

  setupQueueReordering();
}

function renderCourtPlayers() {
  [
    "G1-court",
    "G2-court",
    "G3-court",
    "G4-court",
    "W1-court",
    "W2-court",
    "W3-court",
    "W4-court",
  ].forEach((courtId) => {
    const courtElement = document.getElementById(courtId);
    if (courtElement) {
      const courtLabel = courtId.replace("-court", "");
      const courtType =
        courtTypes[courtLabel] || courtTypes[courtId] || "training";

      const courtPlayersContainer =
        courtElement.querySelector(".court-players");
      if (courtPlayersContainer) {
        courtPlayersContainer.innerHTML = "";
      }

      courtElement.className = `court court-${courtType}`;
    }
  });

  Object.keys(courtAssignments).forEach((court) => {
    const courtMapping = {
      G1: "G1-court",
      G2: "G2-court",
      G3: "G3-court",
      G4: "G4-court",
      W1: "W1-court",
      W2: "W2-court",
      W3: "W3-court",
      W4: "W4-court",
    };

    const courtId = courtMapping[court] || court + "-court";
    const courtElement = document.getElementById(courtId);

    if (courtElement && courtAssignments[court]) {
      const courtPlayersContainer =
        courtElement.querySelector(".court-players");
      if (!courtPlayersContainer) return;

      const playersOnCourt = courtAssignments[court].slice(0, 4);

      playersOnCourt.forEach((playerIndex) => {
        const player = players[playerIndex];
        if (!player) return;

        const playerDiv = document.createElement("div");
        playerDiv.className = `player-box ${
          player.qualification === "advanced"
            ? "advanced-player"
            : "intermediate-player"
        }`;
        playerDiv.textContent = `${player.name} (${
          player.qualification === "advanced" ? "A" : "I"
        })`;
        playerDiv.style.cssText = `
          margin: 1px;
          padding: 3px 6px;
          border-radius: 4px;
          font-size: 10px;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        `;
        playerDiv.draggable = true;
        playerDiv.ondragstart = (e) => {
          isDragging = true;
          dragPlayerIndex = playerIndex;
          e.dataTransfer.effectAllowed = "move";
          playerDiv.classList.add("dragging");
        };
        playerDiv.ondragend = () => {
          isDragging = false;
          playerDiv.classList.remove("dragging");

          setTimeout(() => {
            debouncedAutoFill();
          }, 200);
        };
        courtPlayersContainer.appendChild(playerDiv);
      });

      if (courtAssignments[court].length > 4) {
        const extraPlayers = courtAssignments[court].slice(4);
        extraPlayers.forEach((playerIndex) => {
          const player = players[playerIndex];
          if (player) {
            console.log(
              `Moving ${player.name} back to queue - court ${court} is full (max 4 players)`
            );

            const queueType =
              player.qualification === "advanced" ? "advanced" : "intermediate";
            moveToSpecificQueue(playerIndex, queueType);
          }
        });
      }
    }
  });

  updateCourtDropdowns();
}

function updateCourtDropdowns() {
  ["G1", "G2", "G3", "G4", "W1", "W2", "W3", "W4"].forEach((courtName) => {
    const courtElement = document.getElementById(courtName + "-court");
    if (courtElement) {
      const dropdown = courtElement.querySelector(".court-type-dropdown");
      if (dropdown) {
        const currentType = courtTypes[courtName] || "intermediate";
        dropdown.value = currentType;

        if (courtName.startsWith("W")) {
          dropdown.disabled = true;
          dropdown.title = `Type is inherited from ${courtPairs[courtName]}`;
        }
      }
    }
  });
}

//======================================================
// DRAG AND DROP FUNCTIONALITY
//======================================================

function setupQueueReordering() {
  const queueContainers = [
    { element: document.getElementById("player-queue"), type: "advanced" },
    {
      element: document.getElementById("player-queue-right"),
      type: "intermediate",
    },
  ];

  queueContainers.forEach(({ element, type }) => {
    if (!element) return;

    element.ondragover = (e) => {
      e.preventDefault();

      const draggingElement = element.querySelector(".dragging");
      if (!draggingElement) return;

      const afterElement = getDragAfterElement(element, e.clientY);
      if (afterElement == null) {
        element.appendChild(draggingElement);
      } else {
        element.insertBefore(draggingElement, afterElement);
      }
    };

    element.ondrop = (e) => {
      e.preventDefault();
      const dragData = JSON.parse(e.dataTransfer.getData("text/plain"));

      const queueItems = [
        ...element.querySelectorAll(".queue-item:not(.queue-header)"),
      ];
      const newOrder = queueItems.map((item) =>
        parseInt(item.dataset.playerIndex)
      );

      if (dragData.sourceQueue === type) {
        reorderPlayersInQueue(type, newOrder);
      } else {
        const targetQualification =
          type === "advanced" ? "advanced" : "intermediate";
        moveToSpecificQueue(dragData.playerIndex, targetQualification);
      }

      dragPlayerIndex = null;
    };
  });
}

function getDragAfterElement(container, y) {
  const draggableElements = [
    ...container.querySelectorAll(
      ".queue-item:not(.dragging):not(.queue-header)"
    ),
  ];

  return draggableElements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;

      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    },
    { offset: Number.NEGATIVE_INFINITY }
  ).element;
}

function setupDropTargets() {
  const courtAreas = [
    { id: "G1-court", status: "G1" },
    { id: "G2-court", status: "G2" },
    { id: "G3-court", status: "G3" },
    { id: "G4-court", status: "G4" },
    { id: "W1-court", status: "W1" },
    { id: "W2-court", status: "W2" },
    { id: "W3-court", status: "W3" },
    { id: "W4-court", status: "W4" },
  ];

  courtAreas.forEach(({ id, status }) => {
    const element = document.getElementById(id);
    if (element) {
      element.ondragover = (e) => {
        e.preventDefault();
        element.style.backgroundColor = "#e8f5e8";
        element.style.border = "2px dashed #28a745";
      };
      element.ondragleave = () => {
        element.style.backgroundColor = "";
        element.style.border = "";
        element.style.border = "";
      };
      element.ondrop = (e) => {
        e.preventDefault();
        element.style.backgroundColor = "";
        element.style.border = "";
        if (dragPlayerIndex !== null) {
          moveToCourt(dragPlayerIndex, status);
          dragPlayerIndex = null;
        }
      };
    }
  });

  const advancedQueueArea = document.querySelector(".queue-left");
  if (advancedQueueArea) {
    advancedQueueArea.ondragover = (e) => {
      e.preventDefault();
      advancedQueueArea.style.backgroundColor = "#fff3cd";
      advancedQueueArea.style.border = "3px dashed #ffd700";
    };
    advancedQueueArea.ondragleave = () => {
      advancedQueueArea.style.backgroundColor = "";
      advancedQueueArea.style.border = "";
    };
    advancedQueueArea.ondrop = (e) => {
      e.preventDefault();
      advancedQueueArea.style.backgroundColor = "";
      advancedQueueArea.style.border = "";
      if (dragPlayerIndex !== null) {
        moveToSpecificQueue(dragPlayerIndex, "advanced");
        dragPlayerIndex = null;
      }
    };
  }

  const intermediateQueueArea = document.querySelector(".queue-right");
  if (intermediateQueueArea) {
    intermediateQueueArea.ondragover = (e) => {
      e.preventDefault();
      intermediateQueueArea.style.backgroundColor = "#d1ecf1";
      intermediateQueueArea.style.border = "3px dashed #4a90e2";
    };
    intermediateQueueArea.ondragleave = () => {
      intermediateQueueArea.style.backgroundColor = "";
      intermediateQueueArea.style.border = "";
    };
    intermediateQueueArea.ondrop = (e) => {
      e.preventDefault();
      intermediateQueueArea.style.backgroundColor = "";
      intermediateQueueArea.style.border = "";
      if (dragPlayerIndex !== null) {
        moveToSpecificQueue(dragPlayerIndex, "intermediate");
        dragPlayerIndex = null;
      }
    };
  }
}

//======================================================
// USER INTERFACE FUNCTIONS
//======================================================

async function addPlayer() {
  const name = prompt("Enter player name:");
  if (!name || !name.trim()) return;

  let qualification;
  while (true) {
    const input = prompt(
      "Enter qualification (I for intermediate, A for advanced):"
    );
    if (!input) return;

    const trimmedInput = input.trim().toUpperCase();
    if (trimmedInput === "I") {
      qualification = "intermediate";
      break;
    } else if (trimmedInput === "A") {
      qualification = "advanced";
      break;
    } else {
      alert(
        'Invalid input! Please enter "I" for intermediate or "A" for advanced.'
      );
    }
  }

  try {
    console.log("Adding player to memory...");
    // Generate a temporary ID
    const tempId = "temp_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    
    // Create queue status based on qualification
    const status = qualification === "advanced" ? "queue-advanced" : "queue-intermediate";
    
    // Add to local players array
    const newPlayer = {
      id: tempId,
      name: name.trim(),
      qualification: qualification,
      status: status,
      order: Date.now(),
      isNew: true, // Mark as new for syncing later
      timestamp: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };
    
    players.push(newPlayer);
    
    // Update UI and save to local storage
    initializePlayerArrays();
    renderPlayerQueue();
    saveToLocalStorage();
    
    console.log(
      "Added player " + name + " (" + qualification + ") to memory"
    );
    
    // If online, also add to Firebase immediately (for new players only)
    if (window.navigator.onLine && window.playersDB) {
      try {
        const playerId = await window.playersDB.addPlayer({
          name: name.trim(),
          qualification: qualification,
        });
        
        // Update the local player with the real ID
        newPlayer.id = playerId;
        newPlayer.isNew = false;
        
        console.log("Also added player to Firebase with ID:", playerId);
      } catch (e) {
        console.warn("Couldn't add player to Firebase (will sync later):", e);
      }
    }
  } catch (error) {
    console.error("Failed to add player:", error);
    alert("Failed to add player: " + error.message);
  }
}

async function deletePlayer() {
  const name = prompt("Enter player name to delete:");
  if (!name || !name.trim()) return;

  const playerIndex = players.findIndex(
    (p) => p.name.toLowerCase() === name.toLowerCase()
  );
  
  if (playerIndex === -1) {
    alert("Player not found!");
    return;
  }
  
  const player = players[playerIndex];

  if (!confirm("Are you sure you want to delete " + player.name + "?")) return;

  try {
    console.log("Deleting player from memory...");
    
    // For newly added players that haven't been synced, just remove from array
    if (player.isNew) {
      players.splice(playerIndex, 1);
      console.log("Removed new player " + player.name + " from memory");
    } else {
      // For existing players, mark as deleted for syncing later
      if (!deletedPlayers) deletedPlayers = [];
      deletedPlayers.push(player.id);
      
      // Remove from local array
      players.splice(playerIndex, 1);
    }
    
    // Update UI and save to local storage
    initializePlayerArrays();
    renderPlayerQueue();
    renderCourtPlayers();
    saveToLocalStorage();
    
    console.log("Deleted player " + player.name + " from memory");
    
    // If online, also delete from Firebase immediately
    if (window.navigator.onLine && window.playersDB && !player.isNew) {
      try {
        await window.playersDB.deletePlayer(player.id);
        console.log("Also deleted player from Firebase");
      } catch (e) {
        console.warn("Couldn't delete player from Firebase (will sync later):", e);
      }
    }
  } catch (error) {
    console.error("Failed to delete player:", error);
    alert("Failed to delete player: " + error.message);
  }
}

async function showAdvanceMenu() {
  const courts = ["G1", "G2", "G3", "G4", "W1", "W2", "W3", "W4"];
  const courtOptions = courts
    .map((court, index) => index + 1 + ". " + court)
    .join("\n");

  const courtChoice = prompt(
    "Choose a court to advance the next player to:\n\n" +
      courtOptions +
      "\n\nEnter court number (1-8):"
  );

  const courtIndex = parseInt(courtChoice) - 1;
  if (courtIndex >= 0 && courtIndex < courts.length) {
    const selectedCourt = courts[courtIndex];

    const queueChoice = prompt(
      "Advance to " +
        selectedCourt +
        " from which queue?\n\n1. Advanced Queue\n2. Intermediate Queue\n3. Auto (best match)\n\nEnter choice (1-3):"
    );

    switch (queueChoice) {
      case "1":
        await autoAdvanceFromQueue(selectedCourt, "advanced");
        break;
      case "2":
        await autoAdvanceFromQueue(selectedCourt, "intermediate");
        break;
      case "3":
      default:
        await autoAdvanceToCourt(selectedCourt);
        break;
    }
  } else {
    alert("Invalid court selection!");
  }
}

//======================================================
// INITIALIZATION AND EVENT HANDLERS
//======================================================

window.addEventListener("beforeunload", () => {
  stopPeriodicCourtCheck();
  if (firebaseUnsubscribe) {
    firebaseUnsubscribe();
  }
  if (courtsUnsubscribe) {
    courtsUnsubscribe();
  }
});

//======================================================
// LOCAL STORAGE AND SYNC MANAGEMENT
//======================================================

function saveToLocalStorage() {
  const data = {
    players: players,
    courtTypes: courtTypes,
    deletedPlayers: deletedPlayers || [],
    lastSaved: new Date().toISOString()
  };
  
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
    console.log("Saved data to local storage");
  } catch (error) {
    console.error("Failed to save to local storage:", error);
  }
}

function loadFromLocalStorage() {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!data) {
      console.log("No local data found");
      return false;
    }
    
    const parsedData = JSON.parse(data);
    if (!parsedData.players || !parsedData.players.length) {
      console.log("Invalid local data - missing players");
      return false;
    }
    
    console.log("Found local data from:", parsedData.lastSaved);
    
    // Ask if user wants to continue from last practice session
    if (confirm("Continue from last practice session?\n\nLast saved: " + 
               new Date(parsedData.lastSaved).toLocaleString() + 
               "\nPlayers: " + parsedData.players.length)) {
      
      players = parsedData.players;
      courtTypes = parsedData.courtTypes || {};
      
      // If courtTypes is empty or missing any court, initialize with defaults
      if (Object.keys(courtTypes).length === 0 || 
          ["G1", "G2", "G3", "G4", "W1", "W2", "W3", "W4"].some(court => !courtTypes[court])) {
        console.log("Court types missing in local data, using defaults");
        initializeDefaultCourtTypes();
      }
      
      deletedPlayers = parsedData.deletedPlayers || [];
      
      initializePlayerArrays();
      syncWCourtTypes();
      renderPlayerQueue();
      renderCourtPlayers();
      updateCourtDropdowns();
      
      console.log("Loaded data from local storage");
      return true;
    }
  } catch (error) {
    console.error("Failed to load from local storage:", error);
  }
  
  return false;
}

function setupLocalBackup() {
  // Clear any existing interval
  if (localBackupInterval) {
    clearInterval(localBackupInterval);
  }
  
  // Set up periodic backup to local storage (every minute)
  localBackupInterval = setInterval(() => {
    saveToLocalStorage();
  }, 60000);
  
  console.log("Set up local backup (every minute)");
}

async function syncWithFirebase() {
  if (!window.navigator.onLine || !window.playersDB) {
    alert("Cannot sync with Firebase - you are offline or Firebase is not connected");
    return;
  }
  
  if (!confirm("Sync all changes with Firebase database?")) {
    return;
  }
  
  try {
    console.log("Syncing with Firebase...");
    let updatedCount = 0;
    let addedCount = 0;
    let deletedCount = 0;
    
    // 1. Handle deleted players
    if (deletedPlayers && deletedPlayers.length > 0) {
      for (const playerId of deletedPlayers) {
        try {
          await window.playersDB.deletePlayer(playerId);
          deletedCount++;
        } catch (error) {
          console.error(`Failed to delete player ${playerId}:`, error);
        }
      }
      deletedPlayers = [];
    }
    
    // 2. Update or add players
    for (const player of players) {
      try {
        // Always make sure we're saving players to Firebase with queue status
        // This ensures they always go into queue when loaded in a new session
        let syncStatus = player.status;
        if (!syncStatus.startsWith('queue-')) {
          syncStatus = player.qualification === 'advanced' ? 'queue-advanced' : 'queue-intermediate';
        }
        
        if (player.isNew) {
          // Add new player
          const playerId = await window.playersDB.addPlayer({
            name: player.name,
            qualification: player.qualification,
            status: syncStatus
          });
          player.id = playerId;
          player.isNew = false;
          addedCount++;
        } else if (player.modified) {
          // Update modified player
          await window.playersDB.updatePlayerStatus(
            player.id, syncStatus, player.qualification
          );
          updatedCount++;
        }
        // Clear modified flag
        delete player.modified;
      } catch (error) {
        console.error(`Failed to sync player ${player.name}:`, error);
      }
    }
    
    // No longer syncing court types - they are only stored locally
    
    // Save clean state to local storage
    saveToLocalStorage();
    
    lastSyncTime = new Date();
    alert(`Sync complete!\n\nAdded: ${addedCount} players\nUpdated: ${updatedCount} players\nDeleted: ${deletedCount} players`);
    
  } catch (error) {
    console.error("Failed to sync with Firebase:", error);
    alert("Failed to sync with Firebase: " + error.message);
  }
}

// Initialize default court types
function initializeDefaultCourtTypes() {
  // Default court types
  courtTypes = {
    G1: "training",
    G2: "training",
    G3: "training",
    G4: "training",
    W1: "training",
    W2: "training",
    W3: "training",
    W4: "training"
  };
  
  // Sync W courts with G courts to ensure consistency
  syncWCourtTypes();
  
  console.log("Initialized default court types");
}

window.onload = () => {
  setupDropTargets();
  
  // Try to load from local storage first
  if (!loadFromLocalStorage()) {
    // If no local data or user declined, initialize with defaults and connect to Firebase
    console.log("No local data or user declined to load it, initializing with defaults");
    initializeDefaultCourtTypes();
    initializePlayerArrays();
    renderPlayerQueue();
    renderCourtPlayers();
    updateCourtDropdowns();
    
    // Connect to Firebase
    initializeFirebase();
  } else {
    // If loaded from local storage, still set up backup
    setupLocalBackup();
    startPeriodicCourtCheck();
  }
  
  // Add sync button to UI
  const controlsSection = document.querySelector('.controls-section');
  if (controlsSection) {
    const syncButton = document.createElement('button');
    syncButton.textContent = 'Sync with Database';
    syncButton.className = 'control-button sync-button';
    syncButton.onclick = syncWithFirebase;
    controlsSection.appendChild(syncButton);
  }
};
