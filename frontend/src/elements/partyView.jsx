import React, { useState } from "react";


export default function PartyView() {
    const [partyName] = useState("Friday Night Smash");
    const [partyCode] = useState("BDMN-4829");


    function copyCode() {
        if (navigator && navigator.clipboard) navigator.clipboard.writeText(partyCode).catch(() => {});
    }


    return (
        <div style={{ padding: 16 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: "700" }}>Party</h2>
            <div style={{ marginTop: 4, fontSize: 16 }}>{partyName}</div>
            <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                <code>{partyCode}</code>
                <button onClick={copyCode}>Copy</button>
            </div>
        </div>
    );
}