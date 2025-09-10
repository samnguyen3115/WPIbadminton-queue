import React, { createContext, useContext, useEffect, useState } from "react";
import { initializeApp } from "firebase/app";
import firebase from 'firebase/compat/app';
import * as firebaseui from 'firebaseui'
import 'firebaseui/dist/firebaseui.css'
import {
    getAuth,
    onAuthStateChanged,
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
} from "firebase/auth";


const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();


const AuthCtx = createContext({ user: null, loading: true, signIn: () => {}, logOut: () => {} });


export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);


    useEffect(() => {
        const off = onAuthStateChanged(auth, (u) => {
            setUser(u);
            setLoading(false);
        });
        return () => off();
    }, []);


    async function signIn() {
        await signInWithPopup(auth, provider);
    }


    async function logOut() {
        await signOut(auth);
    }


    return (
        <AuthCtx.Provider value={{ user, loading, signIn, logOut }}>
            {children}
        </AuthCtx.Provider>
    );
}


export function useAuth() {
    return useContext(AuthCtx);
}


export async function getIdToken() {
    const u = auth.currentUser;
    return u ? await u.getIdToken() : null;
}