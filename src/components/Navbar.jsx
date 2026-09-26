import './Navbar.css';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useEffect, useState } from 'react';

function Navbar() {
    const [user, setUser] = useState(null);
    const [accountOpen, setAccountOpen] = useState(false);

    useEffect(() => {
        const getUser = async () => {
            const { data } = await supabase.auth.getUser();
            setUser(data.user);
        };

        getUser();
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.href = '/login';
    };

    return (
        <nav className="navbar">

            {/* clicking the title takes user back to the home page. */}
            <div className="navbar-title">
                <h2><Link to="/">PinSphere</Link></h2>
            </div>
            
            {/* displays the user account name. */}
            <div className="navbar-account">
                <button
                    className="navbar-account-button"
                    onClick={() => setAccountOpen(!accountOpen)}
                >
                    {user?.email}
                    <span>▼</span>
                </button>

                {accountOpen && (
                    <div className="account-dropdown">
                        <button onClick={handleLogout}>Log Out</button>
                    </div>
                )}
            </div>
        </nav>
    )
}

export default Navbar;