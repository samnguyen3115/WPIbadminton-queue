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


function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}


export default function QueueView() {
    const queue = useMemo(
        () => [
            { id: "1", name: "Pakorn" },
            { id: "2", name: "Liam" },
            { id: "3", name: "Noah" },
            { id: "4", name: "Olivia" },
            { id: "5", name: "Emma" },
            { id: "6", name: "Mason" },
            { id: "7", name: "Sophia" },
        ],
        []
    );


    const pages = useMemo(() => chunk(queue, 4), [queue]);


    return (
        <div>
            <h3 style={{ padding: 16, margin: 0, fontSize: 18, fontWeight: 700 }}>Queue</h3>
            <Carousel
                items={pages}
                renderItem={(group) => (
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
                        <ol style={{ margin: 0, paddingLeft: 16 }}>
                            {group.map((p, i) => (
                                <li key={p.id} style={{ padding: "6px 0" }}>
                                    {p.name}
                                </li>
                            ))}
                        </ol>
                    </div>
                )}
            />
        </div>
    );
}