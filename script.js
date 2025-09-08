/**
 * Badminton Queue System
 * Organized JavaScript File
 */

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

    firebaseUnsubscribe = window.playersDB.onPlayersChange((updatedPlayers) => {
      console.log("Players updated from Firebase:", updatedPlayers.length);

      let hasOwnUpdates = false;
      updatedPlayers.forEach((player) => {
        if (pendingUpdates.has(player.id)) {
          hasOwnUpdates = true;
          pendingUpdates.delete(player.id);
        }
      });

      players = updatedPlayers;
      initializePlayerArrays();

      if (!isUpdatingFirebase || !hasOwnUpdates) {
        renderPlayerQueue();
        renderCourtPlayers();
      }

      console.log("Firebase connected (" + players.length + " players)");

      if (!isDragging && !isUpdatingFirebase) {
        debouncedAutoFill();
      }
    });

    courtsUnsubscribe = window.courtsDB.onCourtsChange((updatedCourts) => {
      console.log("Courts updated from Firebase:", updatedCourts.length);
      courtTypes = {};
      updatedCourts.forEach((court) => {
        courtTypes[court.name] = court.type;
      });

      syncWCourtTypes();

      renderCourtPlayers();
      updateCourtDropdowns();
    });

    startPeriodicCourtCheck();
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

async function updatePlayerStatus(playerIndex, newStatus) {
  if (!players[playerIndex] || !window.playersDB) return;

  const player = players[playerIndex];
  const oldStatus = player.status;

  try {
    isUpdatingFirebase = true;
    pendingUpdates.add(player.id);

    player.status = newStatus;
    initializePlayerArrays();
    renderPlayerQueue();
    renderCourtPlayers();

    await window.playersDB.updatePlayer(player.id, { status: newStatus });
    console.log(
      "Updated " +
        player.name +
        " from " +
        oldStatus +
        " to " +
        newStatus +
        " in Firebase"
    );

    if (
      oldStatus &&
      !oldStatus.startsWith("queue") &&
      newStatus.startsWith("queue")
    ) {
      setTimeout(() => {
        if (!isDragging) {
          debouncedAutoFill();
        }
      }, 1000);
    }
  } catch (error) {
    console.error("Failed to update player in Firebase:", error);

    player.status = oldStatus;
    initializePlayerArrays();
    renderPlayerQueue();
    renderCourtPlayers();
  } finally {
    setTimeout(() => {
      isUpdatingFirebase = false;
      pendingUpdates.delete(player.id);
    }, 500);
  }
}

async function updatePlayerStatusAndQualification(
  playerIndex,
  newStatus,
  newQualification
) {
  if (!players[playerIndex] || !window.playersDB) return;

  const player = players[playerIndex];
  const oldStatus = player.status;
  const oldQualification = player.qualification;

  try {
    isUpdatingFirebase = true;
    pendingUpdates.add(player.id);

    let orderToAssign = player.order || Date.now();

    if (newStatus.startsWith("queue-")) {
      orderToAssign = Date.now();
    }

    player.status = newStatus;
    player.qualification = newQualification;
    if (newStatus.startsWith("queue-") && orderToAssign !== player.order) {
      player.order = orderToAssign;
    }
    initializePlayerArrays();
    renderPlayerQueue();
    renderCourtPlayers();

    await window.playersDB.updatePlayerStatusAndQualification(
      player.id,
      newStatus,
      newQualification
    );

    if (newStatus.startsWith("queue-") && orderToAssign !== player.order) {
      await window.playersDB.updatePlayerOrder(player.id, orderToAssign);
    }

    console.log(
      `Updated ${player.name} to ${newStatus} with qualification ${newQualification} and order ${orderToAssign}`
    );
  } catch (error) {
    console.error(
      "Failed to update player status and qualification in Firebase:",
      error
    );

    player.status = oldStatus;
    player.qualification = oldQualification;
    initializePlayerArrays();
    renderPlayerQueue();
    renderCourtPlayers();
  } finally {
    setTimeout(() => {
      isUpdatingFirebase = false;
      pendingUpdates.delete(player.id);
    }, 500);
  }
}

async function reorderPlayersInQueue(queueType, newOrderArray) {
  if (!window.playersDB) return;

  try {
    isUpdatingFirebase = true;

    const baseTime = Date.now();

    for (let i = 0; i < newOrderArray.length; i++) {
      const playerIndex = newOrderArray[i];
      const player = players[playerIndex];
      if (player) {
        const newOrder = baseTime + i;
        player.order = newOrder;
        pendingUpdates.add(player.id);

        await window.playersDB.updatePlayerOrder(player.id, newOrder);
      }
    }

    initializePlayerArrays();
    renderPlayerQueue();

    console.log(
      `Reordered ${queueType} queue with ${newOrderArray.length} players`
    );
  } catch (error) {
    console.error("Failed to reorder queue:", error);
  } finally {
    setTimeout(() => {
      isUpdatingFirebase = false;

      newOrderArray.forEach((playerIndex) => {
        const player = players[playerIndex];
        if (player) {
          pendingUpdates.delete(player.id);
        }
      });
    }, 500);
  }
}

//======================================================
// PLAYER MOVEMENT & ASSIGNMENT
//======================================================

function moveToCourt(playerIndex, court) {
  if (!players[playerIndex]) return;

  const player = players[playerIndex];
  const courtType = courtTypes[court] || "intermediate";

  if (courtType === "training") {
    alert(`Court ${court} is set to TRAINING mode. No players can join.`);
    console.log(
      `Cannot move ${player.name} to ${court} - court is in training mode`
    );
    return;
  }

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

  updatePlayerStatus(playerIndex, court);
}

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

  updatePlayerStatusAndQualification(playerIndex, newStatus, newQualification);

  if (wasOnCourt && previousCourt) {
    setTimeout(() => {
      if (!isDragging) {
        debouncedAutoFill();
      }
    }, 1000);
  }
}

function moveToQueue(playerIndex) {
  if (!players[playerIndex]) return;

  const player = players[playerIndex];
  const wasOnCourt = player.status && !player.status.includes("queue");
  const previousCourt = wasOnCourt ? player.status : null;

  let newStatus;

  if (
    player.qualification &&
    player.qualification.toLowerCase() === "advanced"
  ) {
    newStatus = "queue-advanced";
  } else {
    newStatus = "queue-intermediate";
  }

  updatePlayerStatus(playerIndex, newStatus);

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
    await updatePlayerStatus(nextPlayerIndex, courtName);
    console.log(
      `Auto-advanced ${nextPlayer.name} from ${queueType} queue to ${courtName}`
    );
  } catch (error) {
    console.error("Failed to auto-advance player:", error);
  }
}

async function autoAdvanceToVacatedCourt(courtName) {
  console.log(
    `Court ${courtName} became available, looking for next player...`
  );
  await autoAdvanceToCourt(courtName);
}

async function autoAdvanceToCourt(courtName) {
  if (!courtName) {
    console.log(`Invalid court name for auto-advance`);
    return;
  }

  const courtType = courtTypes[courtName] || "intermediate";

  const currentPlayersOnCourt = courtAssignments[courtName] || [];
  if (currentPlayersOnCourt.length >= 4) {
    console.log(
      `Cannot auto-advance to ${courtName} - court is full (${currentPlayersOnCourt.length}/4 players)`
    );
    return;
  }

  if (courtType === "training") {
    console.log(
      `Cannot auto-advance to ${courtName} - court is in training mode`
    );
    return;
  }

  let nextPlayerIndex = null;
  let fromQueue = null;

  if (courtType === "advanced") {
    if (advancedQueue.length > 0) {
      nextPlayerIndex = advancedQueue[0];
      fromQueue = "advanced";
    }
  } else if (courtType === "intermediate") {
    if (intermediateQueue.length > 0) {
      nextPlayerIndex = intermediateQueue[0];
      fromQueue = "intermediate";
    }
  }

  if (nextPlayerIndex === null) {
    console.log(`No players available to auto-advance to ${courtName}`);
    return;
  }

  const nextPlayer = players[nextPlayerIndex];
  if (!nextPlayer) {
    console.log(`Player not found for auto-advance to ${courtName}`);
    return;
  }

  if (courtType === "advanced" && nextPlayer.qualification !== "advanced") {
    console.log(
      `Cannot auto-advance ${nextPlayer.name} to ${courtName} - advanced court requires advanced qualification`
    );
    return;
  }

  try {
    await updatePlayerStatus(nextPlayerIndex, courtName);
    console.log(
      "Auto-advanced " +
        nextPlayer.name +
        " from " +
        fromQueue +
        " queue to " +
        courtName
    );
  } catch (error) {
    console.error("Failed to auto-advance player to " + courtName + ":", error);
  }
}

//======================================================
// COURT MANAGEMENT
//======================================================

// kickAllPlayersFromCourt function has been removed as it's replaced by rotateCourtPlayers functionality

async function changeCourtType(courtName, courtType) {
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

  if (!window.courtsDB) {
    console.error("Firebase not connected!");
    return;
  }

  try {
    console.log("Updating court type...");
    await window.courtsDB.updateCourtType(courtName.trim(), courtType);

    if (courtName.startsWith("G")) {
      const wCourtName = courtPairs[courtName];
      await window.courtsDB.updateCourtType(wCourtName, courtType);
      console.log(`Synced ${wCourtName} type with ${courtName}: ${courtType}`);
    }

    console.log("Updated court " + courtName + " to " + courtType);
  } catch (error) {
    console.error("Failed to update court type:", error);
  }
}

async function rotateCourtPlayers(gCourtName) {
  if (!gCourtName.startsWith("G")) {
    console.error("Rotation can only be triggered from G-Courts");
    return;
  }

  const wCourtName = courtPairs[gCourtName];
  const gCourtPlayers = courtAssignments[gCourtName] || [];
  const wCourtPlayers = courtAssignments[wCourtName] || [];

  try {
    isUpdatingFirebase = true;

    for (const playerIndex of gCourtPlayers) {
      const player = players[playerIndex];
      if (player) {
        const queueType =
          player.qualification === "advanced"
            ? "queue-advanced"
            : "queue-intermediate";
        player.status = queueType;
        player.order = Date.now();
        pendingUpdates.add(player.id);
        await updatePlayerStatus(playerIndex, queueType);
        console.log(`Moved ${player.name} from ${gCourtName} back to queue`);
      }
    }

    for (const playerIndex of wCourtPlayers) {
      const player = players[playerIndex];
      if (player) {
        player.status = gCourtName;
        pendingUpdates.add(player.id);
        await updatePlayerStatus(playerIndex, gCourtName);
        console.log(`Moved ${player.name} from ${wCourtName} to ${gCourtName}`);
      }
    }

    initializePlayerArrays();
    renderPlayerQueue();
    renderCourtPlayers();

    setTimeout(() => {
      autoFillEmptyCourts();
    }, 1000);

    console.log(`Completed rotation for ${gCourtName}-${wCourtName} pair`);
  } catch (error) {
    console.error(`Failed to rotate players for ${gCourtName}:`, error);
  } finally {
    setTimeout(() => {
      isUpdatingFirebase = false;
    }, 1000);
  }
}

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

async function autoFillEmptyCourts() {
  if (isUpdatingFirebase) {
    console.log("Skipping auto-fill: Firebase update in progress");
    return;
  }

  syncWCourtTypes();

  // First, balance G courts by moving players from W courts when needed
  const gCourts = ["G1", "G2", "G3", "G4"];
  
  for (const gCourtName of gCourts) {
    const courtType = courtTypes[gCourtName] || "intermediate";
    if (courtType === "training") {
      continue;
    }
    
    const gCourtPlayers = courtAssignments[gCourtName] || [];
    const wCourtName = courtPairs[gCourtName];
    const wCourtPlayers = courtAssignments[wCourtName] || [];
    
    // Case 1: If G court is empty and W court has 4 players, move all players to G court
    if (gCourtPlayers.length === 0 && wCourtPlayers.length === 4) {
      try {
        isUpdatingFirebase = true;
        
        for (const playerIndex of wCourtPlayers) {
          const player = players[playerIndex];
          if (player) {
            player.status = gCourtName;
            pendingUpdates.add(player.id);
            await updatePlayerStatus(playerIndex, gCourtName);
            console.log(
              `🎾 Moved ${player.name} from ${wCourtName} to game court ${gCourtName}`
            );
          }
        }

        initializePlayerArrays();
        renderPlayerQueue();

        console.log(
          `Started game on ${gCourtName} with 4 players from ${wCourtName}`
        );
      } catch (error) {
        console.error(`Failed to start game on ${gCourtName}:`, error);
      } finally {
        setTimeout(() => {
          isUpdatingFirebase = false;
          wCourtPlayers.forEach((playerIndex) => {
            const player = players[playerIndex];
            if (player) {
              pendingUpdates.delete(player.id);
            }
          });
        }, 500);
      }
    } 
    // Case 2: G court has players but not full, and W court has players to share
    else if (gCourtPlayers.length > 0 && gCourtPlayers.length < 4 && wCourtPlayers.length > 0) {
      const playersNeededInG = 4 - gCourtPlayers.length;
      const playersToMove = Math.min(playersNeededInG, wCourtPlayers.length);
      
      if (playersToMove > 0) {
        try {
          isUpdatingFirebase = true;
          
          // Move players from W to G court
          const playersToMoveFromW = wCourtPlayers.slice(0, playersToMove);
          for (const playerIndex of playersToMoveFromW) {
            const player = players[playerIndex];
            if (player) {
              player.status = gCourtName;
              pendingUpdates.add(player.id);
              await updatePlayerStatus(playerIndex, gCourtName);
              console.log(
                `Balanced: Moved ${player.name} from ${wCourtName} to game court ${gCourtName}`
              );
            }
          }

          initializePlayerArrays();
          renderPlayerQueue();

          console.log(
            `Balanced ${gCourtName} by moving ${playersToMove} player(s) from ${wCourtName}`
          );
        } catch (error) {
          console.error(`Failed to balance ${gCourtName} from ${wCourtName}:`, error);
        } finally {
          setTimeout(() => {
            isUpdatingFirebase = false;
            wCourtPlayers.slice(0, playersToMove).forEach((playerIndex) => {
              const player = players[playerIndex];
              if (player) {
                pendingUpdates.delete(player.id);
              }
            });
          }, 500);
        }
      }
    }
  }

  // Then, fill empty spaces in W courts from the queue
  const wCourts = ["W1", "W2", "W3", "W4"];

  for (const courtName of wCourts) {
    const courtType = courtTypes[courtName] || "intermediate";

    if (courtType === "training") {
      continue;
    }

    const currentPlayersOnCourt = courtAssignments[courtName] || [];
    const availableSpots = 4 - currentPlayersOnCourt.length;

    if (availableSpots <= 0) {
      continue;
    }

    let playersToAdd = [];

    if (courtType === "advanced") {
      const availableAdvanced = advancedQueue.filter((playerIndex) => {
        const player = players[playerIndex];
        return player && player.qualification === "advanced";
      });
      playersToAdd = availableAdvanced.slice(0, availableSpots);
    } else if (courtType === "intermediate") {
      const availableIntermediate = intermediateQueue.filter((playerIndex) => {
        const player = players[playerIndex];
        return player && player.qualification === "intermediate";
      });
      playersToAdd = availableIntermediate.slice(0, availableSpots);
    } else {
      playersToAdd = [];
    }

    if (playersToAdd.length > 0) {
      try {
        isUpdatingFirebase = true;

        for (const playerIndex of playersToAdd) {
          const player = players[playerIndex];
          if (player) {
            player.status = courtName;
            pendingUpdates.add(player.id);

            await updatePlayerStatus(playerIndex, courtName);
            console.log(
              `Auto-filled ${player.name} to waiting court ${courtName}`
            );
          }
        }

        initializePlayerArrays();
        renderPlayerQueue();

        console.log(
          `Auto-filled ${playersToAdd.length} player(s) to ${courtName}`
        );
      } catch (error) {
        console.error(`Failed to auto-fill players to ${courtName}:`, error);
      } finally {
        setTimeout(() => {
          isUpdatingFirebase = false;

          playersToAdd.forEach((playerIndex) => {
            const player = players[playerIndex];
            if (player) {
              pendingUpdates.delete(player.id);
            }
          });
        }, 500);
      }
    }
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
        courtTypes[courtLabel] || courtTypes[courtId] || "intermediate";

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

  if (!window.playersDB) {
    alert("Firebase not connected!");
    return;
  }

  try {
    console.log("Adding player...");
    await window.playersDB.addPlayer({
      name: name.trim(),
      qualification: qualification,
    });
    console.log(
      "Added player " + name + " (" + qualification + ") to Firebase"
    );
  } catch (error) {
    console.error("Failed to add player:", error);
    alert("Failed to add player: " + error.message);
  }
}

async function deletePlayer() {
  const name = prompt("Enter player name to delete:");
  if (!name || !name.trim()) return;

  const player = players.find(
    (p) => p.name.toLowerCase() === name.toLowerCase()
  );
  if (!player) {
    alert("Player not found!");
    return;
  }

  if (!confirm("Are you sure you want to delete " + player.name + "?")) return;

  if (!window.playersDB) {
    alert("Firebase not connected!");
    return;
  }

  try {
    console.log("Deleting player...");
    await window.playersDB.deletePlayer(player.id);
    console.log("Deleted player " + player.name + " from Firebase");
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

window.onload = () => {
  setupDropTargets();
  initializeFirebase();
};
