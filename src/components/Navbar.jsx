import './Navbar.css';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useEffect, useState } from 'react';

function Navbar() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [accountOpen, setAccountOpen] = useState(false);
    const [invitations, setInvitations] = useState([]);
    const [showInvitations, setShowInvitations] = useState(false);
    const [sentInvitations, setSentInvitations] = useState([]);

    useEffect(() => {
        const getUser = async () => {
            const { data } = await supabase.auth.getUser();

            if (!data.user) {
                return;
            }

            setUser(data.user);

            const { data: invitationData, error } = await supabase
                .rpc('get_received_map_invitations');

            if (error) {
                console.error(
                    'Error loading invitations:',
                    JSON.stringify(error, null, 2)
                );
                return;
            }

            setInvitations(invitationData || []);

            const { data: sentInvitationData, error: sentInvitationError } =
                await supabase
                    .from('map_invitations')
                    .select(`
                        id,
                        map_id,
                        invitee_email,
                        role,
                        status,
                        created_at,
                        expires_at,
                        maps (
                            name
                        )
                    `)
                    .eq('inviter_id', data.user.id)
                    .order('created_at', { ascending: false });

            if (sentInvitationError) {
                console.error(
                    'Error loading sent invitations:',
                    JSON.stringify(sentInvitationError, null, 2)
                );
                return;
            }

            setSentInvitations(sentInvitationData || []);
        };

        getUser();
    }, []);

    const handleAcceptInvitation = async (invitationId) => {
        const { error } = await supabase.rpc(
            'accept_map_invitation',
            {
                invitation_id: invitationId
            }
        );

        if (error) {
            console.error(
                'Error accepting invitation:',
                JSON.stringify(error, null, 2)
            );
            alert(error.message);
            return;
        }

        setInvitations(
            invitations.filter(invitation => invitation.id !== invitationId)
        );
        window.dispatchEvent(new Event('mapsUpdated'));
    };

    const handleDeclineInvitation = async (invitationId) => {
        const { error } = await supabase.rpc(
            'decline_map_invitation',
            {
                invitation_id: invitationId
            }
        );

        if (error) {
            console.error(
                'Error declining invitation:',
                JSON.stringify(error, null, 2)
            );
            alert(error.message);
            return;
        }

        setInvitations(
            invitations.filter(invitation => invitation.id !== invitationId)
        );
    };

    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
            alert(error.message);
        }
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
                    <>
                        <div className="account-dropdown">
                            <button
                                onClick={async () => {
                                    const opening = !showInvitations;

                                    setShowInvitations(opening);

                                    if (!opening || !user) {
                                        return;
                                    }

                                    const { data: receivedData, error: receivedError } =
                                        await supabase
                                            .rpc('get_received_map_invitations');

                                    if (!receivedError) {
                                        setInvitations(receivedData || []);
                                    }

                                    const { data: sentData, error: sentError } =
                                        await supabase
                                            .from('map_invitations')
                                            .select(`
                                                id,
                                                map_id,
                                                invitee_email,
                                                role,
                                                status,
                                                created_at,
                                                expires_at,
                                                maps (
                                                    name
                                                )
                                            `)
                                            .eq('inviter_id', user.id)
                                            .order('created_at', { ascending: false });

                                    if (!sentError) {
                                        setSentInvitations(sentData || []);
                                    }
                                }}
                            >
                                Invitations
                                {invitations.length > 0 && ` (${invitations.length})`}
                            </button>

                            <button onClick={() => {
                                setAccountOpen(false);
                                navigate('/settings');
                            }}>Settings</button>

                            <button onClick={handleLogout}>Log Out</button>
                        </div>

                        {showInvitations && (
                            <div
                                className="invitations-overlay"
                                onClick={() => setShowInvitations(false)}
                            >
                                <div
                                    className="invitations-popup"
                                    onClick={(event) => event.stopPropagation()}
                                >
                                    <div className="invitations-header">
                                        <h3>Invitations</h3>

                                        <button
                                            className="invitations-close"
                                            onClick={() => setShowInvitations(false)}
                                        >
                                            ×
                                        </button>
                                    </div>

                                    <div className="invitations-section">
                                        <h4>Received</h4>

                                        {invitations.length === 0 ? (
                                            <p className="no-invitations">
                                                No pending invitations.
                                            </p>
                                        ) : (
                                            invitations.map(invitation => (
                                                <div
                                                    className="invitation-item"
                                                    key={invitation.id}
                                                >
                                                    <div>
                                                        <h4>{invitation.map_name}</h4>
                                                        <p>
                                                            {invitation.inviter_email} invited you to collaborate
                                                            on this map.
                                                        </p>

                                                        <p>Role: {invitation.role}</p>
                                                    </div>

                                                    <div className="invitation-buttons">
                                                        <button
                                                            onClick={() =>
                                                                handleDeclineInvitation(
                                                                    invitation.id
                                                                )
                                                            }
                                                        >
                                                            Decline
                                                        </button>

                                                        <button
                                                            onClick={() =>
                                                                handleAcceptInvitation(
                                                                    invitation.id
                                                                )
                                                            }
                                                        >
                                                            Accept
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    <div className="invitations-section">
                                        <h4>Sent</h4>

                                        {sentInvitations.length === 0 ? (
                                            <p className="no-invitations">
                                                No invitations sent.
                                            </p>
                                        ) : (
                                            sentInvitations.map(invitation => (
                                                <div
                                                    className="invitation-item"
                                                    key={invitation.id}
                                                >
                                                    <div>
                                                        <h4>{invitation.maps?.name}</h4>

                                                        <p>
                                                            Sent to: {invitation.invitee_email}
                                                        </p>

                                                        <p>
                                                            Status: {invitation.status}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </nav>
    )
}

export default Navbar;
