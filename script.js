let players = [];
let advancedQueue = [];
let intermediateQueue = [];
let courtAssignments = {};
let courtTypes = {};
let dragPlayerIndex = null;
let firebaseUnsubscribe = null;
let courtsUnsubscribe = null;

let allPlayers = [];
let deletedPlayers = [];
let lastSyncTime = null;
let localBackupInterval = null;
const LOCAL_STORAGE_KEY = "badminton_queue_data";

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
let periodicCheckInterval = null;

/**
 * Starts a new practice session by clearing all local data and fetching fresh from database
 */
async function startNewSession() {
  try {
    // Clear all local data
    players = [];
    advancedQueue = [];
    intermediateQueue = [];
    courtAssignments = {};
    deletedPlayers = [];
    lastSyncTime = null;
    
    // Clear local storage
    localStorage.clear();
    
    // Reset all courts to default state
    const courts = ['G1', 'G2', 'G3', 'G4', 'W1', 'W2', 'W3', 'W4'];
    courts.forEach(court => {
      courtAssignments[court] = [];
      courtTypes[court] = 'training';
      const dropdown = document.querySelector(`#${court}-court select`);
      if (dropdown) {
        dropdown.value = 'training';
      }
    });

    // Fetch fresh data from database
    await initializeFirebase();

    // Deactivate all players by default after loading
    players.forEach(player => {
      player.isActive = false;
    });
    allPlayers.forEach(player => {
      player.isActive = false;
    });
    console.log('Active Players Count:', allPlayers.filter(player => player.isActive));
    saveToLocalStorage();
    console.log('Active Players Count:', allPlayers.filter(player => player.isActive));

    renderPlayerPool();

    alert('New session started successfully!');
  } catch (error) {
    console.error('Error starting new session:', error);
    alert('Error starting new session. Please try again.');
  }
}

/**
 * Initializes the Firebase connection and loads initial data
 * Prints the number of active players
 * - Connects to Firebase services
 * - Loads players data from Firebase database
 * - Loads court data from Firebase database
 * - Sets up local backups and periodic court checks
 */
async function initializeFirebase() {
  console.log('Active players:', players.filter(p => p.isActive).length);
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

    console.log("Loading players from Firebase...");
    players = await window.playersDB.getAllPlayers();
    console.log("Players loaded from Firebase:", players.length);

    players.forEach((player) => {
        player.isActive = false;
        player.status =
          player.qualification === "advanced"
            ? "queue-advanced"
            : "queue-intermediate";

        if (!player.order) {
          player.order = Date.now() + Math.floor(Math.random() * 1000);
        }
    });

    initializePlayerArrays();
    renderPlayerQueue();
    renderCourtPlayers();
    updateCourtDropdowns();

    console.log("Firebase initialization complete");
    return true;
  } catch (error) {
    console.error("Firebase initialization failed:", error);
    console.log("Firebase connection failed");
    alert(
      "Firebase connection failed: " +
        error.message +
        "\n\nMake sure you:\n1. Created a Firebase project\n2. Enabled Firestore\n3. Updated firebase-config.js with your config"
    );
    return false;
  }
}

/**
 * Organizes players into queues and courts
 * - Creates sorted arrays for advanced and intermediate queues
 * - Builds court assignment map to track who is on which court
 * - Used whenever player data changes to keep local data structures in sync
 * - Only processes active players (isActive === true or undefined)
 */
function initializePlayerArrays() {
  const activePlayersIndices = players
    .map((p, i) => ({ player: p, index: i }))
    .filter((item) => item.player.isActive !== false)
    .map((item) => item.index);

  advancedQueue = activePlayersIndices
    .filter((i) => players[i].status === "queue-advanced")
    .sort((a, b) => (players[a].order || 0) - (players[b].order || 0));

  intermediateQueue = activePlayersIndices
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
function updatePlayerStatus(playerIndex, newStatus, newQualification) {
  if (!players[playerIndex]) return;

  const player = players[playerIndex];
  const oldStatus = player.status;
  const oldQualification = player.qualification;

  try {
    let orderToAssign = player.order || Date.now();

    if (newStatus.startsWith("queue-")) {
      orderToAssign = Date.now();
    }

    player.status = newStatus;
    player.qualification = newQualification;
    player.modified = true;

    if (newStatus.startsWith("queue-") && orderToAssign !== player.order) {
      player.order = orderToAssign;
    }

    initializePlayerArrays();
    renderPlayerQueue();
    renderCourtPlayers();

    saveToLocalStorage();

    console.log(
      `Updated ${player.name} to ${newStatus} with qualification ${newQualification} and order ${orderToAssign} in memory`
    );
  } catch (error) {
    console.error("Failed to update player status and qualification:", error);

    player.status = oldStatus;
    player.qualification = oldQualification;
    initializePlayerArrays();
    renderPlayerQueue();
    renderCourtPlayers();
  }
  syncWithFirebase();
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
        player.modified = true;
      }
    }

    initializePlayerArrays();
    renderPlayerQueue();

    saveToLocalStorage();

    console.log(
      `Reordered ${queueType} queue with ${newOrderArray.length} players in memory`
    );
  } catch (error) {
    console.error("Failed to reorder queue:", error);
  }
}

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

  updatePlayerStatus(playerIndex, court, player.qualification);
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
    await updatePlayerStatus(nextPlayerIndex, courtName, player.qualification);
    console.log(
      `Auto-advanced ${nextPlayer.name} from ${queueType} queue to ${courtName}`
    );
  } catch (error) {
    console.error("Failed to auto-advance player:", error);
  }
}

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

    courtTypes[courtName.trim()] = courtType;

    if (courtName.startsWith("G")) {
      const wCourtName = courtPairs[courtName];
      courtTypes[wCourtName] = courtType;
      console.log(
        `Synced ${wCourtName} type with ${courtName}: ${courtType} in memory`
      );
    }

    handleCourtTypeChange(courtName, oldCourtType, courtType);

    syncWCourtTypes();
    renderCourtPlayers();
    updateCourtDropdowns();
    saveToLocalStorage();

    console.log(
      "Updated court " + courtName + " to " + courtType + " in memory"
    );
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

    for (const playerIndex of wCourtPlayers) {
      const player = players[playerIndex];
      if (player) {
        player.status = gCourtName;
        player.modified = true;
        console.log(`Moved ${player.name} from ${wCourtName} to ${gCourtName}`);
      }
    }

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
  const courts = [courtName];
  const isGCourt = courtName.startsWith("G");
  const pairedCourtName = courtPairs[courtName];

  if (isGCourt && pairedCourtName) {
    courts.push(pairedCourtName);
  }

  console.log(
    `Handling court type change for ${courts.join(
      ", "
    )} from ${oldCourtType} to ${newCourtType}`
  );

  if (newCourtType === "training") {
    const playersToMove = [];

    courts.forEach((court) => {
      const playersOnCourt = courtAssignments[court] || [];
      if (playersOnCourt.length > 0) {
        console.log(
          `Court ${court} changed to training mode. Will move ${playersOnCourt.length} player(s) to queue.`
        );

        for (const playerIndex of playersOnCourt) {
          if (players[playerIndex]) {
            playersToMove.push({
              playerIndex: playerIndex,
              player: players[playerIndex],
              fromCourt: court,
            });
          }
        }
      }
    });

    for (const item of playersToMove) {
      const queueType =
        item.player.qualification === "advanced" ? "advanced" : "intermediate";
      const queueStatus =
        queueType === "advanced" ? "queue-advanced" : "queue-intermediate";

      item.player.status = queueStatus;
      item.player.order = Date.now();
      item.player.modified = true;

      console.log(
        `Moving ${item.player.name} from court ${item.fromCourt} to ${queueType} queue (training mode activated)`
      );
    }

    initializePlayerArrays();
    renderPlayerQueue();
    renderCourtPlayers();
    saveToLocalStorage();
  } else if (oldCourtType === "training" && newCourtType !== "training") {
    console.log(
      `Court ${courtName} changed from training to ${newCourtType} mode. Auto-filling court.`
    );

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

  console.log(
    "PRIORITY STEP: First checking if any G courts need balancing from W courts..."
  );

  initializePlayerArrays();

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

    console.log(
      `Checking court pair ${gCourtName}/${wCourtName}: G=${gCourtPlayers.length} players, W=${wCourtPlayers.length} players`
    );

    if (
      gCourtPlayers.length === 0 &&
      wCourtPlayers.length === 0 &&
      courtType !== "training"
    ) {
      try {
        console.log(
          `Both ${gCourtName} and ${wCourtName} are empty. Prioritizing filling ${gCourtName} from queue first.`
        );

        let queueToUse = [];
        if (courtType === "advanced") {
          queueToUse = advancedQueue.filter(
            (playerIndex) =>
              players[playerIndex] &&
              players[playerIndex].qualification === "advanced"
          );
        } else if (courtType === "intermediate") {
          queueToUse = intermediateQueue.filter(
            (playerIndex) =>
              players[playerIndex] &&
              players[playerIndex].qualification === "intermediate"
          );
        }

        if (queueToUse.length > 0) {
          const playersToMove = queueToUse.slice(0, 4);

          for (const playerIndex of playersToMove) {
            const player = players[playerIndex];
            if (player) {
              player.status = gCourtName;
              player.modified = true;
              console.log(
                `🎯 Filled empty ${gCourtName} with ${player.name} from queue`
              );
              anyChanges = true;
            }
          }

          console.log(
            `Filled empty ${gCourtName} with ${playersToMove.length} players from queue`
          );
          continue;
        }
      } catch (error) {
        console.error(`Failed to fill empty ${gCourtName} from queue:`, error);
      }
    }

    if (gCourtPlayers.length === 0 && wCourtPlayers.length >= 2) {
      try {
        const playersToCopy = [...wCourtPlayers];

        console.log(
          `BALANCING ATTEMPT: Moving ${playersToCopy.length} players from ${wCourtName} to empty ${gCourtName}`
        );

        for (const playerIndex of playersToCopy) {
          const player = players[playerIndex];
          if (player) {
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
    } else if (
      gCourtPlayers.length > 0 &&
      gCourtPlayers.length < 4 &&
      wCourtPlayers.length > 0
    ) {
      const playersNeededInG = 4 - gCourtPlayers.length;
      const playersToMove = Math.min(playersNeededInG, wCourtPlayers.length);

      if (playersToMove > 0) {
        try {
          console.log(
            `BALANCING ATTEMPT: ${gCourtName} needs ${playersNeededInG} more players, moving ${playersToMove} from ${wCourtName}`
          );

          const playersToMoveFromW = [...wCourtPlayers].slice(0, playersToMove);
          for (const playerIndex of playersToMoveFromW) {
            const player = players[playerIndex];
            if (player) {
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
          console.error(
            `Failed to balance ${gCourtName} from ${wCourtName}:`,
            error
          );
        }
      }
    }
  }

  if (anyChanges) {
    console.log(
      "Court balancing made changes - reinitializing arrays before continuing"
    );
    initializePlayerArrays();
  }

  const allCourts = ["G1", "G2", "G3", "G4", "W1", "W2", "W3", "W4"];

  for (const courtName of allCourts) {
    const courtType = courtTypes[courtName] || "intermediate";

    if (courtType === "training") {
      console.log(`Skipping ${courtName} as it is in training mode`);
      continue;
    }

    const currentPlayersOnCourt = courtAssignments[courtName] || [];
    const availableSpots = 4 - currentPlayersOnCourt.length;

    console.log(
      `Court ${courtName} (${courtType}) has ${availableSpots} available spots`
    );

    if (availableSpots <= 0) {
      continue;
    }

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
      console.log(
        `Found ${playersToAdd.length} advanced players to add to ${courtName}`
      );
    } else if (courtType === "intermediate") {
      const availableIntermediate = intermediateQueue.filter((playerIndex) => {
        const player = players[playerIndex];
        return player && player.qualification === "intermediate";
      });
      playersToAdd = availableIntermediate.slice(0, availableSpots);
      console.log(
        `Found ${playersToAdd.length} intermediate players to add to ${courtName}`
      );
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

async function addPlayer() {
  let name;
  let nameIsValid = false;

  while (!nameIsValid) {
    name = prompt("Enter player name:");
    if (!name || !name.trim()) return;

    if (window.navigator.onLine && window.playersDB) {
      try {
        const checkResult = await window.playersDB.checkNameExists(name);

        if (checkResult.exists) {
          alert(
            `Name "${name}" already exists. Please choose a different name or add a number/initial.`
          );
          continue;
        } else {
          nameIsValid = true;
        }
      } catch (error) {
        console.error("Error checking name:", error);

        nameIsValid = true;
      }
    } else {
      nameIsValid = true;
    }
  }

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

    const tempId =
      "temp_" + Date.now() + "_" + Math.floor(Math.random() * 1000);

    const status =
      qualification === "advanced" ? "queue-advanced" : "queue-intermediate";

    const newPlayer = {
      id: tempId,
      name: name.trim(),
      qualification: qualification,
      status: status,
      order: Date.now(),
      isNew: true,
      timestamp: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    players.push(newPlayer);

    initializePlayerArrays();
    renderPlayerQueue();
    saveToLocalStorage();

    console.log("Added player " + name + " (" + qualification + ") to memory");

    if (window.navigator.onLine && window.playersDB) {
      try {
        const playerId = await window.playersDB.addPlayer({
          name: name.trim(),
          qualification: qualification,
        });

        newPlayer.id = playerId;
        newPlayer.isNew = false;

        console.log("Also added player to Firebase with ID:", playerId);
      } catch (e) {
        console.warn("Couldn't add player to Firebase:", e);

        alert("Error adding player to database: " + e.message);
      }
    }
  } catch (error) {
    console.error("Failed to add player:", error);
    alert("Failed to add player: " + error.message);
  }
  syncWithFirebase();
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

    if (player.isNew) {
      players.splice(playerIndex, 1);
      console.log("Removed new player " + player.name + " from memory");
    } else {
      if (!deletedPlayers) deletedPlayers = [];
      deletedPlayers.push(player.id);

      players.splice(playerIndex, 1);
    }

    initializePlayerArrays();
    renderPlayerQueue();
    renderCourtPlayers();
    saveToLocalStorage();

    console.log("Deleted player " + player.name + " from memory");

    if (window.navigator.onLine && window.playersDB && !player.isNew) {
      try {
        await window.playersDB.deletePlayer(player.id);
        console.log("Also deleted player from Firebase");
      } catch (e) {
        console.warn(
          "Couldn't delete player from Firebase (will sync later):",
          e
        );
      }
    }
  } catch (error) {
    console.error("Failed to delete player:", error);
    alert("Failed to delete player: " + error.message);
  }
  syncWithFirebase();
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

window.addEventListener("beforeunload", () => {
  stopPeriodicCourtCheck();
  if (firebaseUnsubscribe) {
    firebaseUnsubscribe();
  }
  if (courtsUnsubscribe) {
    courtsUnsubscribe();
  }
});

function saveToLocalStorage() {
  refreshAllPlayers();

  const data = {
    players: players,
    allPlayers: allPlayers,
    courtTypes: courtTypes,
    deletedPlayers: deletedPlayers || [],
    lastSaved: new Date().toISOString(),
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

    players = parsedData.players;

    if (parsedData.allPlayers && Array.isArray(parsedData.allPlayers)) {
      allPlayers = parsedData.allPlayers;
    } else {
      allPlayers = [...players];
    }

    players.forEach((player) => {
      if (player.isActive === undefined) {
        player.isActive = true;
      }
    });

    allPlayers.forEach((player) => {
      if (player.isActive === undefined) {
        player.isActive = true;
      }
    });

    courtTypes = parsedData.courtTypes || {};
    deletedPlayers = parsedData.deletedPlayers || [];

    // Print out the saved court types
    console.log("Loaded court types from previous session:");
    ["G1", "G2", "G3", "G4", "W1", "W2", "W3", "W4"].forEach((courtName) => {
      const type = courtTypes[courtName] || "intermediate";
      console.log(`${courtName}: ${type}`);
    });

    initializePlayerArrays();

    syncWCourtTypes();

    renderPlayerQueue();
    renderCourtPlayers();
    updateCourtDropdowns();

    console.log("Loaded data from local storage");
    return true;
  } catch (error) {
    console.error("Failed to load from local storage:", error);
  }

  return false;
}

function setupLocalBackup() {
  if (localBackupInterval) {
    clearInterval(localBackupInterval);
  }

  localBackupInterval = setInterval(() => {
    saveToLocalStorage();
  }, 60000);

  console.log("Set up local backup (every minute)");
}

async function syncWithFirebase() {
  if (!window.navigator.onLine) {
    alert("Cannot sync with Firebase - you are offline");
    return;
  }

  try {
    if (!window.FirebaseApp || !window.FirebaseFirestore) {
      throw new Error("Firebase modules not loaded");
    }

    if (!window.playersDB || !window.db) {
      window.initializeFirebaseApp(
        window.FirebaseApp,
        window.FirebaseFirestore
      );
    }

    console.log("Syncing with Firebase...");
    let updatedCount = 0;
    let addedCount = 0;
    let deletedCount = 0;

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

    let existingPlayers = [];
    try {
      existingPlayers = await window.playersDB.getAllPlayers();
      console.log(
        `Retrieved ${existingPlayers.length} existing players from Firebase`
      );
    } catch (error) {
      console.error("Failed to get existing players from Firebase:", error);
      existingPlayers = [];
    }

    const existingPlayersMap = {};
    existingPlayers.forEach((p) => {
      if (p.id) {
        existingPlayersMap[p.id] = p;
      }
    });

    let qualificationChangesCount = 0;

    for (const player of players) {
      try {
        let syncStatus = player.status;
        if (!syncStatus.startsWith("queue-")) {
          syncStatus =
            player.qualification === "advanced"
              ? "queue-advanced"
              : "queue-intermediate";
        }

        if (
          !player.isNew &&
          player.id &&
          existingPlayersMap[player.id] &&
          existingPlayersMap[player.id].qualification !== player.qualification
        ) {
          console.log(
            `Qualification change detected for ${player.name}: ${
              existingPlayersMap[player.id].qualification
            } → ${player.qualification}`
          );
          qualificationChangesCount++;
        }

        if (player.isNew) {
          const playerId = await window.playersDB.addPlayer({
            name: player.name,
            qualification: player.qualification,
          });
          player.id = playerId;
          player.isNew = false;
          addedCount++;
        } else {
          await window.playersDB.updatePlayerStatusAndQualification(
            player.id,
            null,
            player.qualification
          );

          if (player.modified) {
            updatedCount++;
          }
        }

        delete player.modified;
      } catch (error) {
        console.error(`Failed to sync player ${player.name}:`, error);
      }
    }

    saveToLocalStorage();

    lastSyncTime = new Date();
  } catch (error) {
    console.error("Failed to sync with Firebase:", error);
    alert("Failed to sync with Firebase: " + error.message);
  }
}

function initializeDefaultCourtTypes() {
  courtTypes = {
    G1: "training",
    G2: "training",
    G3: "training",
    G4: "training",
    W1: "training",
    W2: "training",
    W3: "training",
    W4: "training",
  };

  syncWCourtTypes();

  console.log("Initialized default court types");
}

window.onload = () => {
  setupDropTargets();

  const hasLocalData = loadFromLocalStorage();

  if (!hasLocalData) {
    console.log(
      "No local data or user declined to load it, initializing empty arrays"
    );
    initializePlayerArrays();
    renderPlayerQueue();
    renderCourtPlayers();
    updateCourtDropdowns();
  }

  if (allPlayers.length === 0 || allPlayers.length < players.length) {
    refreshAllPlayers();
    console.log(
      "Initialized allPlayers array with",
      allPlayers.length,
      "players"
    );
  }
  setupLocalBackup();
  startPeriodicCourtCheck();

  const controlsDiv = document.querySelector(".controls");
  const poolButton = document.createElement("button");
  poolButton.className = "btn btn-info";
  poolButton.textContent = "Player Pool";
  poolButton.onclick = openPlayerPool;
  controlsDiv.appendChild(poolButton);

  document
    .getElementById("close-pool-modal")
    .addEventListener("click", closePlayerPool);
  document
    .querySelector(".close-modal")
    .addEventListener("click", closePlayerPool);

  // Attach live search event directly after modal opens
  const searchBox = document.getElementById("player-pool-search");
  if (searchBox) {
    searchBox.addEventListener("input", renderPlayerPool);
  }

  document
    .getElementById("show-active")
    .addEventListener("change", renderPlayerPool);
  document
    .getElementById("show-inactive")
    .addEventListener("change", renderPlayerPool);

  window.addEventListener("click", function (event) {
    const modal = document.getElementById("player-pool-modal");
    if (event.target === modal) {
      closePlayerPool();
    }
  });
};

function openPlayerPool() {
  refreshAllPlayers();

  console.log("Opening player pool with:", {
    totalPlayers: players.length,
    allPlayersTotal: allPlayers.length,
    activeInAll: allPlayers.filter((p) => p.isActive).length,
    inactiveInAll: allPlayers.filter((p) => p.isActive === false).length,
  });

  const modal = document.getElementById("player-pool-modal");
  modal.style.display = "block";
  renderPlayerPool();
}

function closePlayerPool() {
  const modal = document.getElementById("player-pool-modal");
  modal.style.display = "none";
}

function refreshAllPlayers() {
  const inactivePlayers = allPlayers.filter((p) => p.isActive === false);
  console.log(
    `Found ${inactivePlayers.length} inactive players before refresh`
  );

  if (allPlayers.length > 0) {
    for (const player of players) {
      const existingIndex = allPlayers.findIndex((p) => p.id === player.id);
      if (existingIndex === -1) {
        allPlayers.push({ ...player, isActive: true });
      } else {
        const wasInactive = allPlayers[existingIndex].isActive === false;
        allPlayers[existingIndex] = {
          ...player,
          isActive: wasInactive ? false : true,
        };
      }
    }

    for (const inactivePlayer of inactivePlayers) {
      const stillExists = allPlayers.some(
        (p) => p.id === inactivePlayer.id && p.isActive === false
      );
      if (!stillExists) {
        console.log(
          `Re-adding inactive player ${inactivePlayer.name} to allPlayers`
        );
        allPlayers.push({ ...inactivePlayer, isActive: false });
      }
    }
  } else {
    allPlayers = players.map((player) => ({
      ...player,
      isActive: player.isActive !== undefined ? player.isActive : true,
    }));

    for (const inactivePlayer of inactivePlayers) {
      if (!allPlayers.some((p) => p.id === inactivePlayer.id)) {
        allPlayers.push({ ...inactivePlayer, isActive: false });
      }
    }
  }

  allPlayers.forEach((player) => {
    if (player.isActive === undefined) {
      player.isActive = true;
    }
  });

  console.log(
    `refreshAllPlayers: ${allPlayers.length} total players (${
      allPlayers.filter((p) => p.isActive).length
    } active, ${allPlayers.filter((p) => !p.isActive).length} inactive)`
  );
}

function renderPlayerPool() {
  // Debug: print the unique player pool to console
  const poolList = document.getElementById("player-pool-list");

  const searchTerm =
    document.getElementById("player-pool-search")?.value?.toLowerCase() || "";
  const showActive = document.getElementById("show-active")?.checked !== false;
  const showInactive =
    document.getElementById("show-inactive")?.checked !== false;

  poolList.innerHTML = "";

  refreshAllPlayers();

  // Remove duplicate players by id, name, and qualification
  const uniquePlayersMap = {};
  allPlayers.forEach((player) => {
    const key = `${player.name.toLowerCase()}$`;
    if (!uniquePlayersMap[key]) {
      uniquePlayersMap[key] = player;
    }
  });
  const uniquePlayers = Object.values(uniquePlayersMap);

  // Variables already declared above, so remove redeclaration

  const filteredPlayers = uniquePlayers.filter((player) => {
    const matchesSearch = player.name.toLowerCase().includes(searchTerm);
    const matchesStatus =
      (player.isActive && showActive) || (!player.isActive && showInactive);
    return matchesSearch && matchesStatus;
  });

  filteredPlayers.sort((a, b) => {
    if (a.isActive !== b.isActive) {
      return a.isActive ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  poolList.innerHTML = "";
  filteredPlayers.forEach((player) => {
    const playerDiv = document.createElement("div");
    playerDiv.className = `pool-player-item ${
      player.isActive ? "pool-player-active" : "pool-player-inactive"
    }`;

    playerDiv.innerHTML = `
      <div class=\"player-info\">
        <span class=\"player-name\">${player.name}</span>
        <span class=\"player-qualification\">${player.qualification}</span>
      </div>
      <div class=\"player-actions\">
        <button class=\"toggle-${player.isActive ? "inactive" : "active"}\" 
                onclick=\"togglePlayerActive('${player.id}')\">
          ${player.isActive ? "Deactivate" : "Activate"}
        </button>
      </div>
    `;

    poolList.appendChild(playerDiv);
  });

  if (filteredPlayers.length === 0) {
    poolList.innerHTML = "<p>No players found matching your filters.</p>";
  }
}

function togglePlayerActive(playerId) {
  const playerInAll = allPlayers.find((p) => p.id === playerId);
  const playerIndex = players.findIndex((p) => p.id === playerId);

  console.log(`Toggling active status for player ID ${playerId}:`, {
    foundInAllPlayers: !!playerInAll,
    foundInActivePlayers: playerIndex !== -1,
    currentStatus: playerInAll ? playerInAll.isActive : "unknown",
  });

  if (playerInAll) {
    playerInAll.isActive = !playerInAll.isActive;
    playerInAll.modified = true;

    console.log(
      `Changed player status to: ${
        playerInAll.isActive ? "ACTIVE" : "INACTIVE"
      }`
    );

    if (playerInAll.isActive) {
      if (playerIndex === -1) {
        console.log(`Adding player ${playerInAll.name} back to active players`);
        players.push({ ...playerInAll });
        addToAppropriateQueue(playerInAll);
      } else {
        players[playerIndex].isActive = true;
        players[playerIndex].modified = true;
      }
    } else {
      if (playerIndex !== -1) {
        players[playerIndex].isActive = false;
        players[playerIndex].modified = true;

        removePlayerFromEverywhere(playerId);

        console.log(
          `Removing player ${players[playerIndex].name} from active players`
        );
        players.splice(playerIndex, 1);
      }
      renderPlayerQueue();
      renderCourtPlayers();
    }

    console.log("Player pools after toggle:", {
      totalPlayers: players.length,
      allPlayersTotal: allPlayers.length,
      activeInAll: allPlayers.filter((p) => p.isActive).length,
      inactiveInAll: allPlayers.filter((p) => p.isActive === false).length,
    });

    renderPlayerPool();
    initializePlayerArrays();
    renderPlayerQueue();
    renderCourtPlayers();
    saveToLocalStorage();
  }
}

function removeFromQueues(playerId) {
  const advIndex = advancedQueue.indexOf(playerId);
  if (advIndex !== -1) {
    advancedQueue.splice(advIndex, 1);
  }

  const intIndex = intermediateQueue.indexOf(playerId);
  if (intIndex !== -1) {
    intermediateQueue.splice(intIndex, 1);
  }

  for (const court in courtAssignments) {
    const courtIndex = courtAssignments[court].indexOf(playerId);
    if (courtIndex !== -1) {
      courtAssignments[court].splice(courtIndex, 1);
    }
  }
}

function removePlayerFromEverywhere(playerId) {
  const playerIndex = players.findIndex((p) => p.id === playerId);

  if (playerIndex === -1) {
    return;
  }

  const advIndex = advancedQueue.indexOf(playerIndex);
  if (advIndex !== -1) {
    advancedQueue.splice(advIndex, 1);
  }

  const intIndex = intermediateQueue.indexOf(playerIndex);
  if (intIndex !== -1) {
    intermediateQueue.splice(intIndex, 1);
  }

  for (const court in courtAssignments) {
    const courtIndex = courtAssignments[court].indexOf(playerIndex);
    if (courtIndex !== -1) {
      courtAssignments[court].splice(courtIndex, 1);
    }
  }

  console.log(
    `Removed player ${players[playerIndex].name} from all queues and courts`
  );
}

function addToAppropriateQueue(player) {
  let playerIndex = players.findIndex((p) => p.id === player.id);

  if (playerIndex === -1) {
    players.push({ ...player, isActive: true });
    playerIndex = players.length - 1;
  }

  if (player.qualification === "advanced") {
    if (!advancedQueue.includes(playerIndex)) {
      advancedQueue.push(playerIndex);
    }
  } else {
    if (!intermediateQueue.includes(playerIndex)) {
      intermediateQueue.push(playerIndex);
    }
  }

  initializePlayerArrays();
}

function addPoolPlayer() {
  const name = prompt("Enter player name:");
  if (name && name.trim() !== "") {
    const qualification =
      prompt("Enter qualification (advanced/intermediate):")?.toLowerCase() ||
      "intermediate";

    const validQual =
      qualification === "advanced" || qualification === "intermediate"
        ? qualification
        : "intermediate";

    const tempId =
      "local_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);

    const newPlayer = {
      id: tempId,
      name: name.trim(),
      qualification: validQual,
      isActive: true,
      isNew: true,
      status: `queue-${validQual}`,
      modified: true,
    };

    allPlayers.push(newPlayer);
    players.push(newPlayer);

    addToAppropriateQueue(newPlayer);

    renderPlayerPool();
    renderPlayerQueue();
    saveToLocalStorage();
  }
}
function reloadPage(page) {
  window.location.href = page;
}