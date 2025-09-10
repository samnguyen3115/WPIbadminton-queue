import React from "react";
import PartyView from "./elements/partyView.jsx";
import CourtsView from "./elements/courtsView.jsx";
import QueueView from "./elements/queueView.jsx";
import { useAuth } from "./components/firebaseAuth.jsx";


export default function App() {
    const { user, loading, signIn, logOut } = useAuth();


    return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
            <header
                style={{
                    position: "sticky",
                    top: 0,
                    background: "white",
                    borderBottom: "1px solid #e5e7eb",
                    padding: "8px 12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    zIndex: 10,
                }}
            >
                <button
                    onClick={user ? logOut : signIn}
                    title={user ? "Sign out" : "Sign in"}
                    style={{ background: "transparent", border: "none", padding: 0, fontWeight: 600, cursor: "pointer" }}
                >
                    {loading ? "Loading" : user ? "Sign out" : "Sign in"}
                </button>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {user ? user.displayName || user.email : "Not signed in"}
                </div>
            </header>


            <main style={{ flex: 1, overflowY: "auto" }}>
                <PartyView />
                <CourtsView />
                <QueueView />
            </main>
        </div>
    );
}