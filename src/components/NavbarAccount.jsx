import './Collaboration.css'
import './Navbar.css';
import AccountMenu from './AccountMenu';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useEffect, useRef, useState } from 'react';
import useInvitations from '../useInvitations';
import { invitationStatus } from '../invitations';
import Dialog, { ConfirmDialog } from './Dialog';
import { useDialogAction } from '../useDialogAction';

const roleLabel = role => ({ viewer: 'Viewer', editor: 'Editor' }[role] || 'Unknown');
const statusLabel = status => ({ pending: 'Pending', accepted: 'Accepted', declined: 'Declined', expired: 'Expired' }[status] || 'Unknown');

function NavbarAccount({ user: providedUser }) {
    const navigate = useNavigate();
    const [loadedUser, setLoadedUser] = useState(null);
    const user = providedUser || loadedUser;
    const accountTriggerRef = useRef(null);
    const [showInvitations, setShowInvitations] = useState(false);
    const invitations = useInvitations(user?.id, showInvitations);
    const logout = useDialogAction();
    const [cancellingInvitation, setCancellingInvitation] = useState(null);

    useEffect(() => {
        if (providedUser) return;
        let cancelled = false;
        supabase.auth.getUser().then(({ data }) => {
            if (!cancelled) setLoadedUser(data.user);
        });
        return () => { cancelled = true; };
    }, [providedUser]);

    const handleLogout = logout.run(async () => {
        const { error } = await supabase.auth.signOut();
        if (error) logout.setError(error.message || 'Could not log out. Please try again.');
    });

    return <>
        <AccountMenu email={user?.email} triggerRef={accountTriggerRef}
            invitationCount={invitations.received.length} onInvitations={() => setShowInvitations(true)}
            onSettings={() => navigate('/settings')} onLogout={handleLogout}
            logoutBusy={logout.busy} logoutError={logout.error} />
        {showInvitations && <Dialog returnFocusRef={accountTriggerRef} label="Invitations" onClose={() => setShowInvitations(false)} busy={Boolean(invitations.busy)} dismissOnBackdrop>
            <div className="invitations-popup collaboration-dialog" onClick={event => event.stopPropagation()}>
                <div className="collaboration-header">
                    <h3>Invitations</h3>
                    <button type="button" className="collaboration-close" aria-label="Close invitations" onClick={() => setShowInvitations(false)}>×</button>
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
                                <p className="invitation-email">From {invitation.inviter_email}</p>
                                <p className="invitation-meta">{roleLabel(invitation.role)} · Pending</p>
                            </div>
                            <div className="invitation-buttons">
                                <button aria-label={`Decline invitation to ${invitation.map_name}`} disabled={Boolean(invitations.busy)} onClick={() => invitations.act('decline', invitation)}>
                                    {invitations.busy?.id === invitation.id && invitations.busy.kind === 'decline' ? 'Declining…' : 'Decline'}
                                </button>
                                <button className="collaboration-primary" aria-label={`Accept invitation to ${invitation.map_name}`} disabled={Boolean(invitations.busy)} onClick={() => invitations.act('accept', invitation)}>
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
                                    <p className="invitation-email">To {invitation.invitee_email}</p>
                                    <p className="invitation-meta">{roleLabel(invitation.role)} · {statusLabel(status)}</p>
                                </div>
                                <button className="sent-invitation-remove" disabled={Boolean(invitations.busy)}
                                    title={label} aria-label={`${label} to ${invitation.invitee_email}`}
                                    onClick={() => status === 'pending' ? setCancellingInvitation(invitation) : invitations.act('remove', invitation)}>
                                    {invitations.busy?.id === invitation.id && invitations.busy.kind === 'remove' ? '…' : '×'}
                                </button>
                            </div>;
                        })}
                </div>
            </div>
            {cancellingInvitation && <ConfirmDialog title="Cancel invitation?"
                message={`Cancel the invitation to ${cancellingInvitation.invitee_email}? They will no longer be able to accept it unless acceptance has already completed.`}
                confirmLabel="Cancel invitation" busy={Boolean(invitations.busy)}
                onClose={() => setCancellingInvitation(null)}
                onConfirm={async () => { await invitations.act('remove', cancellingInvitation); setCancellingInvitation(null); }} />}
        </Dialog>}
    </>;
}

export default NavbarAccount;
