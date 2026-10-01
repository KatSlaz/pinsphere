import './Settings.css';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { MAP_STYLES } from '../mapStyles';

function Settings({ theme, onThemeChange, mapStyle, onMapStyleChange, syncStatus, onRetrySync }) {
    return (
        <div className="settings-page">
            <Navbar />
            <main className="settings-main">
                <Link to="/map">Back to My Maps</Link>
                <h1>Settings</h1>
                <p className="settings-note" role="status">
                    {syncStatus === 'saved' ? 'Settings saved to your account.' :
                        syncStatus === 'error' ? 'Account sync failed. Your choices still apply in this browser.' :
                            'Syncing account settings…'}
                </p>
                {syncStatus === 'error' && <button onClick={onRetrySync}>Retry sync</button>}
                <section className="settings-section" aria-labelledby="appearance-heading">
                    <h2 id="appearance-heading">Appearance</h2>
                    <div className="settings-row">
                        <div>
                            <label htmlFor="theme-setting">Theme</label>
                            <p id="theme-description">Choose how PinSphere looks. System follows your device's appearance.</p>
                        </div>
                        <select
                            id="theme-setting"
                            value={theme}
                            onChange={event => onThemeChange(event.target.value)}
                            aria-describedby="theme-description"
                        >
                            <option value="light">Light</option>
                            <option value="dark">Dark</option>
                            <option value="system">System</option>
                        </select>
                    </div>
                    <p className="settings-note">Your choice is saved in this browser.</p>
                </section>
                <section className="settings-section" aria-labelledby="map-heading">
                    <h2 id="map-heading">Map</h2>
                    <div className="settings-row">
                        <div>
                            <label htmlFor="map-style-setting">Map Style</label>
                            <p id="map-style-description">Choose the basemap independently of the app theme.</p>
                        </div>
                        <select
                            id="map-style-setting"
                            value={mapStyle}
                            onChange={event => onMapStyleChange(event.target.value)}
                            aria-describedby="map-style-description"
                        >
                            {MAP_STYLES.map(style => (
                                <option key={style.id} value={style.id}>{style.label}</option>
                            ))}
                        </select>
                    </div>
                    <p className="settings-note">Your choice is saved in this browser.</p>
                </section>
            </main>
        </div>
    );
}

export default Settings;
