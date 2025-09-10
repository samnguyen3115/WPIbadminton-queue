import { create } from "zustand";

/**
 * This mirrors your global variables/functions from script.js:
 * - players, advancedQueue, intermediateQueue
 * - courtAssignments, courtTypes, courtPairs
 * - initializePlayerArrays, render..., changeCourtType, rotateCourtPlayers, autoFill...
 */
const courtPairs = { G1: "W1", G2: "W2", G3: "W3", G4: "W4", W1: "G1", W2: "G2", W3: "G3", W4: "G4" };

export const useQueueStore = create((set, get) => ({
    // --- state ---
    players: [],                         // [{id,name,qualification,status,order}, ...]
    courtTypes: {},                      // { G1:'intermediate'|'advanced'|'training', ... }
    courtAssignments: {},                // { G1:[idx,...], W1:[idx,...], ... }

    // --- selectors ---
    playersByIndex: (i) => get().players[i],
    advancedQueuePlayers: [],
    intermediateQueuePlayers: [],

    playersOnCourt: (courtName) => {
        const { courtAssignments, players } = get();
        const idxs = courtAssignments[courtName] || [];
        return idxs.map((i) => players[i]).filter(Boolean).slice(0, 4);
    },

    // --- boot ---
    initFromFirebaseOrLocal: async () => {
        // 1) TODO Firebase: load players + courtTypes (if available)
        //    For now, start with local defaults:
        const players = []; // [] initially
        const courtTypes = { G1: "intermediate", G2: "intermediate", G3: "intermediate", G4: "intermediate" };
        // W courts inherit:
        ["W1","W2","W3","W4"].forEach((w, i) => { courtTypes[w] = courtTypes[`G${i+1}`]; });

        set({ players, courtTypes });
        get().rebuildQueuesAndCourts();  // sorts queues + builds courtAssignments
    },

    // --- derived builders (adapted from initializePlayerArrays in script.js) ---
    rebuildQueuesAndCourts: () => {
        const { players } = get();

        const advancedQueue = players
            .map((_, i) => i)
            .filter((i) => players[i].status === "queue-advanced")
            .sort((a,b) => (players[a].order || 0) - (players[b].order || 0));

        const intermediateQueue = players
            .map((_, i) => i)
            .filter((i) => players[i].status === "queue-intermediate")
            .sort((a,b) => (players[a].order || 0) - (players[b].order || 0));

        const courtAssignments = {};
        players.forEach((p, i) => {
            if (p.status && !p.status.startsWith("queue")) {
                if (!courtAssignments[p.status]) courtAssignments[p.status] = [];
                courtAssignments[p.status].push(i);
            }
        });

        set({
            advancedQueuePlayers: advancedQueue.map((i) => players[i]),
            intermediateQueuePlayers: intermediateQueue.map((i) => players[i]),
            courtAssignments
        });
    },

    // --- actions ported from script.js (simplified) ---
    changeCourtType: (courtName, newType) => {
        const { courtTypes } = get();
        if (courtName.startsWith("W")) return; // inherits from G
        const updated = { ...courtTypes, [courtName]: newType };
        const w = courtPairs[courtName];
        if (w) updated[w] = newType; // keep W in sync

        set({ courtTypes: updated });
        // If switched to or from 'training', adjust players (optional: mirror script.js handleCourtTypeChange)
        // Then attempt auto-fill if needed.
    },

    rotateCourtPlayers: (gCourtName) => {
        if (!gCourtName.startsWith("G")) return;
        const { courtAssignments, players } = get();
        const w = courtPairs[gCourtName];

        const gPlayers = [...(courtAssignments[gCourtName] || [])];
        const wPlayers = [...(courtAssignments[w] || [])];

        // G -> queue (preserve order semantics)
        gPlayers.forEach((idx) => {
            const p = players[idx];
            if (!p) return;
            const qStatus = p.qualification === "advanced" ? "queue-advanced" : "queue-intermediate";
            p.status = qStatus;
            p.order = Date.now();
        });

        // W -> G
        wPlayers.forEach((idx) => {
            const p = players[idx];
            if (!p) return;
            p.status = gCourtName;
        });

        set({ players: [...players] });
        get().rebuildQueuesAndCourts();
        // Optionally trigger auto-fill afterward (mirrors debouncedAutoFill/autoFillEmptyCourts).
    },

    // helpers
    moveToSpecificQueue: (playerIndex, queueType) => {
        const { players } = get();
        const p = players[playerIndex];
        if (!p) return;
        p.status = queueType === "advanced" ? "queue-advanced" : "queue-intermediate";
        p.qualification = queueType === "advanced" ? "advanced" : "intermediate";
        p.order = Date.now();
        set({ players: [...players] });
        get().rebuildQueuesAndCourts();
    },

    // Example: wire this to Add Player UI
    addPlayer: (name, qualification) => {
        const { players } = get();
        const qp = qualification === "advanced" ? "queue-advanced" : "queue-intermediate";
        players.push({
            id: "temp_" + Date.now(),
            name,
            qualification,
            status: qp,
            order: Date.now(),
        });
        set({ players: [...players] });
        get().rebuildQueuesAndCourts();
        // TODO Firebase create
    },
}));
