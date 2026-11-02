import './Navbar.css';
import { Link } from 'react-router-dom';
import NavbarAccount from './NavbarAccount';

function Navbar() {
    return <nav className="navbar">
        <div className="navbar-title"><h2><Link to="/">PinSphere</Link></h2></div>
        <NavbarAccount />
    </nav>;
}

export default Navbar;
