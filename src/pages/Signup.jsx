import './Signup.css'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { supabase } from '../supabaseClient'

function Signup() {

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSignup = async () => {
        setError('');

        const { error } = await supabase.auth.signUp({
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
            <header className="header-signup">
                <h1>Create an account!</h1>
                <Link to="/">
                    <button className="home-button-signup">Home</button>
                </Link>
            </header>
            <main className="main-signup">
                <p>Sign up to continue.</p>
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
                <button className="signup-button" onClick={handleSignup}>
                    Join Now!
                </button>
                <p>Already have an account? <Link to="/login">Log in</Link></p>
            </main>
        </div>
    )
}

export default Signup