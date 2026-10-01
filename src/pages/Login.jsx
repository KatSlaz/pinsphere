import './Login.css'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { supabase } from '../supabaseClient'

function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = async () => {
        setError('');

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            setError(error.message);
            return;
        }

        window.location.href = '/map';
    };

    return (
        <div>
            <header className="header-login">
                <h1>Log in!</h1>
                <Link to="/">
                    <button className="home-button-login">Home</button>
                </Link>
            </header>
            <main className="main-login">
                <p>Sign in to continue.</p>
                <h2>Email Address</h2>
                <input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
                <h2>Password</h2>
                <input
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
                {error && <p>{error}</p>}
                <button className="signup-button" onClick={handleLogin}>
                    Sign In
                </button>
                <p>Dont have an account? <Link to="/signup">Sign up</Link></p>
            </main>
        </div>
    )
}

export default Login