import { StrictMode } from 'react'
import { createRoot, ReactDOM } from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from "./elements/firebaseAuth.jsx";
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <StrictMode>
        {/*<AuthProvider>*/}
        {/*    <App />*/}
        {/*</AuthProvider>*/}

        <App />
    </StrictMode>

);
