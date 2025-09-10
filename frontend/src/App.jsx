import React, { useEffect, useState } from "react";
import PartyView from "./elements/partyView.jsx";
import CourtsView from "./elements/courtsView.jsx";
import QueueView from "./elements/queueView.jsx";


function useMediaQuery(query) {
    const [matches, setMatches] = useState(() =>
        typeof window !== "undefined" && window.matchMedia
            ? window.matchMedia(query).matches
            : false
    );
    useEffect(() => {
        if (!window.matchMedia) return;
        const mql = window.matchMedia(query);
        const onChange = (e) => setMatches(e.matches);
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
    }, [query]);
    return matches;
}


export default function App() {
    const isPhone = useMediaQuery("(max-width: 640px)");


    const pageStyle = { minHeight: "100vh", display: "flex", flexDirection: "column" };
    const headerStyle = { padding: "8px 12px", borderBottom: "1px solid #e5e7eb" };
    const mainStyle = { flex: 1, overflowY: "auto", padding: isPhone ? "0 0 16px" : "0 0 16px" };


    const rowStyle = isPhone
        ? { display: "flex", flexDirection: "column", gap: 16 }
        : { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, alignItems: "start" };


    return (
        <div style={pageStyle}>
            <header style={headerStyle}>
                <strong>Badminton Queue</strong>
            </header>


            <main style={mainStyle}>
                <div style={rowStyle}>
                    <PartyView />
                    <CourtsView />
                    <QueueView />
                </div>
            </main>
        </div>
    );
}