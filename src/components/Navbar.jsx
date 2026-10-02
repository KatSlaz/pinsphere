import './Navbar.css';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useEffect, useState } from 'react';
import useInvitations from '../useInvitations';
import { invitationStatus } from '../invitations';

const roleLabel = role => ({ viewer: 'Viewer', editor: 'Editor' }[role] || 'Unknown');
const statusLabel = status => ({ pending: 'Pending', accepted: 'Accepted', declined: 'Declined', expired: 'Expired' }[status] || 'Unknown');

function Navbar() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [accountOpen, setAccountOpen] = useState(false);
    const [showInvitations, setShowInvitations] = useState(false);
    const invitations = useInvitations(user?.id, showInvitations);

    useEffect(() => {
        let cancelled = false;
        supabase.auth.getUser().then(({ data }) => {
            if (!cancelled) setUser(data.user);
        });
        return () => { cancelled = true; };
    }, []);

    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) alert(error.message);
    };

    return (
        <nav className="navbar">
            <div className="navbar-title"><h2><Link to="/">PinSphere</Link></h2></div>
            <div className="navbar-account">
                <button className="navbar-account-button" onClick={() => setAccountOpen(!accountOpen)}>
                    {user?.email}<span>▼</span>
                </button>
                {accountOpen && <>
                    <div className="account-dropdown">
                        <button onClick={() => setShowInvitations(!showInvitations)}>
                            Invitations{invitations.received.length > 0 && ` (${invitations.received.length})`}
                        </button>
                        <button onClick={() => { setAccountOpen(false); navigate('/settings'); }}>Settings</button>
                        <button onClick={handleLogout}>Log Out</button>
                    </div>
                    {showInvitations && <div className="invitations-overlay" onClick={() => setShowInvitations(false)}>
                        <div className="invitations-popup" onClick={event => event.stopPropagation()}>
                            <div className="invitations-header">
                                <h3>Invitations</h3>
                                <button className="invitations-close" aria-label="Close invitations" onClick={() => setShowInvitations(false)}>×</button>
                            </div>
                            <div className="invitations-feedback" aria-live="polite">
                                {invitations.loading && <p>Refreshing invitations…</p>}
                                {invitations.actionError && <p role="alert">{invitations.actionError}</p>}
                            </div>
                            <div className="invitations-section">
                                <h4>Received</h4>
                                {invitations.errors.received && <div role="alert">
                                    <p>{invitations.errors.received} Any displayed invitations may be out of date.</p>
                                    <button disabled={invitations.loading} onClick={invitations.refresh}>Retry</button>
                                </div>}
                                {invitations.received.length === 0
                                    ? !invitations.loading && !invitations.errors.received && <p className="no-invitations">No pending invitations.</p>
                                    : invitations.received.map(invitation => <div className="invitation-item" key={invitation.id}>
                                        <div>
                                            <h4>{invitation.map_name}</h4>
                                            <p>{invitation.inviter_email} invited you to collaborate on this map.</p>
                                            <p>Role: {roleLabel(invitation.role)}</p>
                                        </div>
                                        <div className="invitation-buttons">
                                            <button disabled={Boolean(invitations.busy)} onClick={() => invitations.act('decline', invitation)}>
                                                {invitations.busy?.id === invitation.id && invitations.busy.kind === 'decline' ? 'Declining…' : 'Decline'}
                                            </button>
                                            <button disabled={Boolean(invitations.busy)} onClick={() => invitations.act('accept', invitation)}>
                                                {invitations.busy?.id === invitation.id && invitations.busy.kind === 'accept' ? 'Accepting…' : 'Accept'}
                                            </button>
                                        </div>
                                    </div>)}
                            </div>
                            <div className="invitations-section">
                                <h4>Sent</h4>
                                {invitations.errors.sent && <div role="alert">
                                    <p>{invitations.errors.sent} Any displayed invitations may be out of date.</p>
                                    <button disabled={invitations.loading} onClick={invitations.refresh}>Retry</button>
                                </div>}
                                {invitations.sent.length === 0
                                    ? !invitations.loading && !invitations.errors.sent && <p className="no-invitations">No invitations sent.</p>
                                    : invitations.sent.map(invitation => {
                                        const status = invitationStatus(invitation, invitations.now);
                                        const label = status === 'pending' ? 'Cancel invitation' : 'Remove invitation record';
                                        return <div className="invitation-item sent-invitation-item" key={invitation.id}>
                                            <div>
                                                <h4>{invitation.maps?.name || 'Map unavailable'}</h4>
                                                <p>Sent to: {invitation.invitee_email}</p>
                                                <p>Role: {roleLabel(invitation.role)}</p>
                                                <p>Status: {statusLabel(status)}</p>
                                            </div>
                                            <button className="sent-invitation-remove" disabled={Boolean(invitations.busy)}
                                                title={label} aria-label={`${label} to ${invitation.invitee_email}`}
                                                onClick={() => invitations.act('remove', invitation)}>
                                                {invitations.busy?.id === invitation.id && invitations.busy.kind === 'remove' ? '…' : '×'}
                                            </button>
                                        </div>;
                                    })}
                            </div>
                        </div>
                    </div>}
                </>}
            </div>
        </nav>
    );
}

export default Navbar;
