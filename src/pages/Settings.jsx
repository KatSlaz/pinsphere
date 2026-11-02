import './Settings.css';
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { MAP_STYLES } from '../mapStyles';

function Settings({ theme, onThemeChange, mapStyle, onMapStyleChange, syncStatus, onRetrySync }) {
    const statusRef = useRef(null);
    const statusMessage = syncStatus === 'saved' ? 'Settings synced to your account.' :
        syncStatus === 'error' ? 'Could not sync with your account. Your choices still apply here.' :
            syncStatus === 'syncing' ? 'Syncing with your account…' : 'Using your current browser preferences.';
    return (
        <div className="settings-page">
            <Navbar />
            <main className="settings-main">
                <div className="settings-heading-row">
                    <h1>Settings</h1>
                    <Link className="settings-back" to="/map"><span aria-hidden="true">←</span> Back to Maps</Link>
                </div>
                <div className={`settings-feedback${syncStatus === 'error' ? ' is-error' : ''}`}>
                    <p ref={statusRef} tabIndex={-1} role="status" aria-atomic="true">{statusMessage}</p>
                    {syncStatus === 'error' && <button type="button" className="settings-retry" onClick={() => {
                        // Keep keyboard focus somewhere useful when Retry disappears.
                        statusRef.current?.focus({ preventScroll: true });
                        onRetrySync();
                    }}>Retry sync</button>}
                </div>
                <section className="settings-section" aria-labelledby="appearance-heading">
                    <h2 id="appearance-heading">Appearance</h2>
                    <div className="settings-row">
                        <div>
                            <label htmlFor="theme-setting">Theme</label>
                            <p id="theme-description">System follows your device's appearance.</p>
                        </div>
                        <select id="theme-setting" value={theme}
                            onChange={event => onThemeChange(event.target.value)} aria-describedby="theme-description">
                            <option value="light">Light</option>
                            <option value="dark">Dark</option>
                            <option value="system">System</option>
                        </select>
                    </div>
                </section>
                <section className="settings-section" aria-labelledby="map-heading">
                    <h2 id="map-heading">Map</h2>
                    <div className="settings-row">
                        <div>
                            <label htmlFor="map-style-setting">Map Style</label>
                            <p id="map-style-description">Independent of the app theme.</p>
                        </div>
                        <select id="map-style-setting" value={mapStyle}
                            onChange={event => onMapStyleChange(event.target.value)} aria-describedby="map-style-description">
                            {MAP_STYLES.map(style => <option key={style.id} value={style.id}>{style.label}</option>)}
                        </select>
                    </div>
                </section>
            </main>
        </div>
    );
}

export default Settings;
