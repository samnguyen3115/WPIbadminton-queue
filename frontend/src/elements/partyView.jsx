import React, { useState } from "react";


export default function PartyView() {
    const [partyName] = useState("Friday Night Smash");
    const [partyCode] = useState("BDMN-4829");


    const cardStyle = {
        maxWidth: 720,
        margin: "16px auto",
        padding: 24,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        textAlign: "center",
    };
    const titleStyle = { margin: 0, fontSize: 20, fontWeight: 700 };
    const subStyle = { marginTop: 6, fontSize: 16, opacity: 0.9 };
    const codeStyle = {
        display: "inline-block",
        marginTop: 10,
        padding: "4px 8px",
        background: "#f3f4f6",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        fontFamily: "monospace",
    };


    return (
        <div style={cardStyle}>
            <h2 style={titleStyle}>Party</h2>
            <div style={subStyle}>{partyName}</div>
            <code style={codeStyle}>{partyCode}</code>
        </div>
    );
}