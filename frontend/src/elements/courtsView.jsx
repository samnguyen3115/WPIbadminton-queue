import React, { useMemo, useState } from "react";


function Carousel({ items, renderItem }) {
    const [index, setIndex] = useState(0);
    const total = items.length || 1;
    const prev = () => setIndex((i) => (i - 1 + total) % total);
    const next = () => setIndex((i) => (i + 1) % total);


    return (
        <div style={{ padding: 16 }}>
            <div style={{ marginBottom: 8 }}>{renderItem(items[index], index)}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={prev}>Prev</button>
                <div>
                    {index + 1} / {total}
                </div>
                <button onClick={next}>Next</button>
            </div>
        </div>
    );
}


export default function CourtsView() {
    // need to add firebase for this
    const courts = useMemo(
        () => [
            { id: 1, name: "Court 1", status: "Playing", players: ["A", "B", "C", "D"] },
            { id: 2, name: "Court 2", status: "Open", players: [] },
            { id: 3, name: "Court 3", status: "Queued", players: ["E", "F", "G", "H"] },
        ],
        []
    );


    return (
        <div>
            <h3 style={{ padding: 16, margin: 0, fontSize: 18, fontWeight: 700 }}>Courts</h3>
            <Carousel
                items={courts}
                renderItem={(c) => (
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
                        <div style={{ fontWeight: 600 }}>{c.name}</div>
                        <div style={{ fontSize: 14, opacity: 0.8 }}>Status: {c.status}</div>
                        <div style={{ marginTop: 8 }}>
                            Players: {c.players.length ? c.players.join(", ") : "None"}
                        </div>
                    </div>
                )}
            />
        </div>
    );
}